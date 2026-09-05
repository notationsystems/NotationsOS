import { spawn } from 'node:child_process';
import { closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { requireRegularPath, verifyGatSource } from '../../scripts/gat-source.mjs';
import { GAT_ENGINE_PIN, GAT_RUNTIME_IDENTITY, type GatRuntimeIdentity } from './pin';
import { MAX_GAT_REPORT_BYTES, validateGatAuditReport, type GatAuditReport } from './report';

export const MAX_GAT_INPUT_BYTES = 128 * 1024;
export const GAT_TIMEOUT_MS = 30_000;
export type GatRuntimeErrorCode = 'ENGINE_UNAVAILABLE' | 'ENGINE_INTEGRITY_FAILED' | 'EXECUTION_TIMEOUT' |
  'EXECUTION_FAILED' | 'INVALID_REPORT' | 'INPUT_TOO_LARGE' | 'ENGINE_BUSY';
const messages: Record<GatRuntimeErrorCode, string> = {
  ENGINE_UNAVAILABLE: 'The pinned local GAT runtime is unavailable. Run the reviewed operator bootstrap.',
  ENGINE_INTEGRITY_FAILED: 'The local GAT runtime did not match its reviewed source or dependency pin.',
  EXECUTION_TIMEOUT: 'The bounded GAT audit exceeded its execution time limit.',
  EXECUTION_FAILED: 'The GAT process did not complete a valid audit.',
  INVALID_REPORT: 'The GAT report failed the source-bound report contract.',
  INPUT_TOO_LARGE: 'The IFC input exceeds the local audit resource limits.',
  ENGINE_BUSY: 'Another local GAT audit holds the runtime slot. Retry after it completes.',
};
export class GatRuntimeError extends Error {
  constructor(public readonly code: GatRuntimeErrorCode) { super(messages[code]); this.name = 'GatRuntimeError'; }
}
export interface GatAuditExecution { report: GatAuditReport; reportBytes: Buffer; runtime: GatRuntimeIdentity }

const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Backend-selected runtime only. Preserves source bytes; no caller-selected paths/options. */
export async function runGatAudit(input: Uint8Array): Promise<GatAuditExecution> {
  if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > MAX_GAT_INPUT_BYTES) throw new GatRuntimeError('INPUT_TOO_LARGE');
  const bytes = Buffer.from(input);
  const workspace = resolve(process.cwd());
  const root = join(workspace, '.payload/gat-runtime');
  const engine = join(root, 'engine');
  const python = join(root, 'venv/Scripts/python.exe');
  const wheel = join(root, 'wheels', GAT_ENGINE_PIN.wheel.filename);
  const runner = join(workspace, 'scripts/gat-audit-runner.py');
  const scratchRoot = join(root, 'scratch');
  if (process.platform !== GAT_ENGINE_PIN.platform || process.arch !== GAT_ENGINE_PIN.architecture) throw new GatRuntimeError('ENGINE_UNAVAILABLE');
  try {
    for (const path of [root, engine, python, wheel, runner]) requireRegularPath(path);
    if (!lstatSync(python).isFile() || !lstatSync(runner).isFile()) throw new Error();
  } catch { throw new GatRuntimeError('ENGINE_UNAVAILABLE'); }
  try { verifyGatSource(engine, GAT_ENGINE_PIN); }
  catch { throw new GatRuntimeError('ENGINE_INTEGRITY_FAILED'); }
  try { mkdirSync(scratchRoot, { recursive: true }); requireRegularPath(scratchRoot); }
  catch { throw new GatRuntimeError('ENGINE_UNAVAILABLE'); }
  const lockPath = join(root, 'audit.lock');
  let lock: number;
  try { lock = openSync(lockPath, 'wx', 0o600); }
  catch (error) { throw new GatRuntimeError((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'ENGINE_BUSY' : 'ENGINE_UNAVAILABLE'); }
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(scratchRoot, 'run-'));
    const inputPath = join(scratch, 'source.ifc');
    writeFileSync(inputPath, bytes, { flag: 'wx', mode: 0o600 });
    const output = await new Promise<{ bytes: Buffer; code: number }>((resolveOutput, reject) => {
      // -I -S prevents environment/user-site/.pth injection; the reviewed runner
      // verifies its wheel-installed dependency before adding its fixed paths.
      const child = spawn(python, ['-I', '-S', '-B', runner, engine, wheel], {
        cwd: scratch, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { NODE_ENV: 'production', SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: scratch, TMP: scratch,
          TMPDIR: scratch, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', MKL_NUM_THREADS: '1' },
      });
      const chunks: Buffer[] = [];
      let total = 0;
      let failure: GatRuntimeError | undefined;
      const stop = (code: GatRuntimeErrorCode) => {
        if (failure) return;
        failure = new GatRuntimeError(code);
        child.kill();
      };
      const timer = setTimeout(() => stop('EXECUTION_TIMEOUT'), GAT_TIMEOUT_MS);
      child.on('error', () => stop('ENGINE_UNAVAILABLE'));
      child.stdout.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_GAT_REPORT_BYTES) stop('INVALID_REPORT');
        else if (!failure) chunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => { total += chunk.length; if (total > MAX_GAT_REPORT_BYTES) stop('EXECUTION_FAILED'); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (failure) { reject(failure); return; }
        if (code === 70) { reject(new GatRuntimeError('ENGINE_INTEGRITY_FAILED')); return; }
        if (code === 72) { reject(new GatRuntimeError('INPUT_TOO_LARGE')); return; }
        if (code !== 0 && code !== 2) { reject(new GatRuntimeError('EXECUTION_FAILED')); return; }
        resolveOutput({ bytes: Buffer.concat(chunks), code });
      });
    });
    if (!readFileSync(inputPath).equals(bytes)) throw new GatRuntimeError('EXECUTION_FAILED');
    let report: GatAuditReport;
    try {
      report = validateGatAuditReport(output.bytes, { contentDigest: digest(bytes), byteLength: bytes.length });
      if (report.pipeline.pipeline_ready !== (output.code === 0)) throw new Error();
    } catch { throw new GatRuntimeError('INVALID_REPORT'); }
    return { report, reportBytes: Buffer.from(output.bytes), runtime: { ...GAT_RUNTIME_IDENTITY } };
  } catch (error) {
    if (error instanceof GatRuntimeError) throw error;
    throw new GatRuntimeError('EXECUTION_FAILED');
  } finally {
    // Remove only our exact input/empty scratch directory. Preserve unexpected
    // outputs for operator inspection rather than recursively deleting them.
    if (scratch) {
      try { unlinkSync(join(scratch, 'source.ifc')); } catch { /* Preserve unexpected filesystem state. */ }
      try { if (readdirSync(scratch).length === 0) rmdirSync(scratch); } catch { /* Operator cleanup may be needed. */ }
    }
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
