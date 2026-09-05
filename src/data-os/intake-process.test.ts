import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocalAcquisition } from './local-intake';

const workspace = resolve(process.cwd());
const manifest = join(workspace, 'examples', 'evidence', 'request.json');
const input = join(workspace, 'examples', 'evidence', 'notice.txt');
let temporary: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-intake-process-')); });
afterEach(() => { rmSync(temporary, { recursive: true, force: true }); });

interface ProcessResult { code: number | null; stdout: string; stderr: string }
interface CliResult {
  status?: 'CREATED' | 'EXISTING';
  acquisition: LocalAcquisition;
  integrity: string;
  rawBytesIncluded: boolean;
}

/** Direct Node children only; cap both their runtime and captured output. */
function runCli(bundle: string, args: string[]): Promise<ProcessResult> {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Evidence CLI subprocess exceeded 8 seconds.');
      child.kill('SIGKILL');
    }, 8000);
    function append(chunk: Buffer, stream: 'stdout' | 'stderr') {
      if (failure) return;
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 256 * 1024) {
        failure = new Error('Evidence CLI subprocess exceeded the output limit.');
        child.kill('SIGKILL');
      }
    }
    child.stdout.on('data', (chunk: Buffer) => append(chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => append(chunk, 'stderr'));
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else complete({ code, stdout, stderr });
    });
  });
}

function savedFiles(root: string, prefix = ''): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, savedFiles(root, relative));
    else result[relative] = readFileSync(join(root, relative));
  }
  return result;
}

describe('evidence intake across real Node processes', () => {
  it('concurrently deduplicates one capture, survives process restart, and preserves the winner on conflict', async () => {
    const bundle = join(temporary, 'evidence.cjs');
    const root = join(temporary, 'shared-evidence');
    buildSync({
      entryPoints: [join(workspace, 'scripts', 'evidence.entry.ts')], outfile: bundle,
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'silent',
    });
    const sourceBefore = readFileSync(input);
    const manifestBefore = readFileSync(manifest);
    const acquisitionId = JSON.parse(manifestBefore.toString('utf8')).acquisitionId as string;
    const captureArgs = ['capture', '--request', manifest, '--input', input, '--root', root];

    // Await both children even if one fails, before the test removes its own directory.
    const settled = await Promise.allSettled([runCli(bundle, captureArgs), runCli(bundle, captureArgs)]);
    const captures = settled.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      expect(result.value.code, result.value.stderr).toBe(0);
      expect(result.value.stderr).toBe('');
      return JSON.parse(result.value.stdout) as CliResult;
    });
    expect(captures.map((result) => result.status).sort()).toEqual(['CREATED', 'EXISTING']);
    expect(captures[0].acquisition.digest).toBe(captures[1].acquisition.digest);
    expect(captures[0].acquisition.capture.receipt.storedAt).toBe(captures[1].acquisition.capture.receipt.storedAt);
    expect(captures[0].acquisition).toEqual(captures[1].acquisition);
    for (const result of captures) {
      expect(result).toMatchObject({ integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false });
      expect(JSON.stringify(result)).not.toContain('Demo berth D-4');
      expect(JSON.stringify(result)).not.toContain(sourceBefore.toString('base64'));
    }

    const inspectArgs = ['inspect', '--acquisition', acquisitionId, '--root', root];
    const freshProcess = await runCli(bundle, inspectArgs);
    expect(freshProcess.code, freshProcess.stderr).toBe(0);
    const inspected = JSON.parse(freshProcess.stdout) as CliResult;
    expect(inspected.acquisition).toEqual(captures[0].acquisition);
    expect(inspected.rawBytesIncluded).toBe(false);
    expect(freshProcess.stdout).not.toContain('Demo berth D-4');
    const originalFiles = savedFiles(root);

    const conflictingInput = join(temporary, 'conflicting-notice.txt');
    writeFileSync(conflictingInput, 'Different synthetic input under the same acquisition id.');
    const conflict = await runCli(bundle, ['capture', '--request', manifest, '--input', conflictingInput, '--root', root]);
    expect(conflict.code).not.toBe(0);
    expect(conflict.stdout).toBe('');
    expect(JSON.parse(conflict.stderr)).toMatchObject({ error: expect.stringContaining('ACQUISITION_CONFLICT') });
    expect(savedFiles(root)).toEqual(originalFiles);
    expect(readFileSync(input)).toEqual(sourceBefore);
    expect(readFileSync(manifest)).toEqual(manifestBefore);
  });
});
