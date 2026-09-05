import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { byteDigest } from './evidence-capture';
import type { LocalNormalizationRun, NormalizationRequest } from './local-normalization';

const workspace = resolve(process.cwd());
const acquisitionRequest = join(workspace, 'examples', 'carrier', 'acquisition.json');
const normalizationRequest = join(workspace, 'examples', 'carrier', 'normalization.json');
const sourceInput = join(workspace, 'examples', 'carrier', 'source.json');
let temporary: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-normalization-process-')); });
afterEach(() => { rmSync(temporary, { recursive: true, force: true }); });

interface ProcessResult { code: number | null; stdout: string; stderr: string }
interface NormalizationOutput {
  status?: 'CREATED' | 'EXISTING';
  run: LocalNormalizationRun;
  integrity: string;
  rawBytesIncluded: boolean;
  derivedFieldsIncluded: boolean;
}

/** Run the actual CLI entry point in bounded, fresh Node processes. */
function runCli(bundle: string, args: string[]): Promise<ProcessResult> {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Normalization CLI subprocess exceeded 8 seconds.');
      child.kill('SIGKILL');
    }, 8000);
    function append(chunk: Buffer, stream: 'stdout' | 'stderr') {
      if (failure) return;
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 256 * 1024) {
        failure = new Error('Normalization CLI subprocess exceeded the output limit.');
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

function bundleCli() {
  const bundle = join(temporary, 'evidence.cjs');
  buildSync({
    entryPoints: [join(workspace, 'scripts', 'evidence.entry.ts')], outfile: bundle,
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'silent',
  });
  return bundle;
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

function normalizationOutput(result: ProcessResult, expectedCode: number): NormalizationOutput {
  expect(result.code, result.stderr).toBe(expectedCode);
  expect(result.stderr).toBe('');
  const output = JSON.parse(result.stdout) as NormalizationOutput;
  expect(output).toMatchObject({ integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false });
  expect(output.run).toMatchObject({
    mode: 'LOCAL_DEVELOPMENT', policyAuthority: 'OPERATOR_DECLARATION', canonicalAdmission: false,
    sourceTruthClaimed: false, fieldAccuracyClaimed: false, independentlyVerified: false,
  });
  return output;
}

describe('Carrier normalization across real Node processes', () => {
  it('captures, concurrently deduplicates normalization, reopens the exact winner and leaves stored files unchanged on retry, inspection or conflict', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'shared-evidence');
    const sourceBefore = readFileSync(sourceInput);
    // .gitattributes pins this evidence file to LF; checkout must not alter its identity.
    expect(byteDigest(sourceBefore)).toBe('sha256:6002901fce9ebf2bb7f4f915ed2c0b4c2b5e14de888fa6fb6a1fbe96c129a154');
    const requestBefore = readFileSync(normalizationRequest);
    const request = JSON.parse(requestBefore.toString('utf8')) as NormalizationRequest;
    const captured = await runCli(bundle, ['capture', '--request', acquisitionRequest, '--input', sourceInput, '--root', root]);
    expect(captured.code, captured.stderr).toBe(0);
    expect(captured.stderr).toBe('');
    const acquisition = JSON.parse(captured.stdout).acquisition;
    const args = ['normalize', '--request', normalizationRequest, '--root', root];

    // Let both processes finish before cleanup even when one unexpectedly fails.
    const settled = await Promise.allSettled([runCli(bundle, args), runCli(bundle, args)]);
    const outputs = settled.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return normalizationOutput(result.value, 0);
    });
    expect(outputs.map((output) => output.status).sort()).toEqual(['CREATED', 'EXISTING']);
    expect(outputs[0].run).toEqual(outputs[1].run);
    const winner = outputs[0].run;
    expect(winner).toMatchObject({ state: 'NORMALIZED', reasons: ['CONTRACT_MATCH'], candidate: {
      state: 'UNADMITTED', identity: { state: 'UNRESOLVED', canonicalId: null, sourceRecordId: 'demo-carrier-001' },
      fields: { legalName: 'Demonstration Carriers Incorporated', registrationNumber: 'DEMO-REG-001' },
      missingFields: ['operatingSite'], validTime: { state: 'UNOBSERVED', from: null, to: null },
      provenance: { acquisition: { id: request.acquisitionId, digest: acquisition.digest } },
    } });
    expect(winner.candidate?.knownAt).toBe(winner.normalizedAt);
    expect(Date.parse(winner.normalizedAt)).toBeGreaterThanOrEqual(Date.parse(acquisition.capture.receipt.storedAt));
    expect(winner.deriveDecision).toMatchObject({ state: 'ALLOWED', evaluatedAt: winner.normalizedAt,
      request: { operation: 'DERIVE', audience: 'INTERNAL', requestedAt: winner.normalizedAt } });
    expect(outputs.every((output) => output.derivedFieldsIncluded)).toBe(true);
    const committedFiles = savedFiles(root);
    expect(readdirSync(join(root, 'normalizations'))).toHaveLength(1);

    const inspected = normalizationOutput(await runCli(bundle, ['inspect-normalization', '--normalization', request.normalizationId, '--root', root]), 0);
    expect(inspected.run).toEqual(winner);
    expect(inspected).not.toHaveProperty('status');
    const retried = normalizationOutput(await runCli(bundle, args), 0);
    expect(retried).toMatchObject({ status: 'EXISTING', run: winner });
    expect(savedFiles(root)).toEqual(committedFiles);

    const conflictingPath = join(temporary, 'conflicting-normalization.json');
    writeFileSync(conflictingPath, JSON.stringify({ ...request, profile: { ...request.profile, version: 'changed-version' } }));
    const conflict = await runCli(bundle, ['normalize', '--request', conflictingPath, '--root', root]);
    expect(conflict.code).toBe(1);
    expect(conflict.stdout).toBe('');
    expect(JSON.parse(conflict.stderr)).toMatchObject({ error: expect.stringContaining('NORMALIZATION_CONFLICT') });
    expect(savedFiles(root)).toEqual(committedFiles);
    expect(readFileSync(sourceInput)).toEqual(sourceBefore);
    expect(readFileSync(normalizationRequest)).toEqual(requestBefore);
  });

  it('persists schema drift as quarantine and returns exit 2 across normalization, inspection and retry without a candidate or source rewrite', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'quarantined-evidence');
    const inputPath = join(temporary, 'drifted-carrier.json');
    const source = JSON.parse(readFileSync(sourceInput, 'utf8'));
    const drifted = Buffer.from(JSON.stringify({ ...source, schema: 'caravan.carrier-source.v2' }));
    writeFileSync(inputPath, drifted);
    const request = JSON.parse(readFileSync(normalizationRequest, 'utf8')) as NormalizationRequest;
    const capture = await runCli(bundle, ['capture', '--request', acquisitionRequest, '--input', inputPath, '--root', root]);
    expect(capture.code, capture.stderr).toBe(0);
    const acquisitionFiles = savedFiles(root);
    const args = ['normalize', '--request', normalizationRequest, '--root', root];
    const output = normalizationOutput(await runCli(bundle, args), 2);
    expect(output).toMatchObject({ status: 'CREATED', derivedFieldsIncluded: false,
      run: { state: 'QUARANTINED', reasons: ['SCHEMA_MISMATCH'], candidate: null } });
    expect(JSON.stringify(output)).not.toContain(source.legalName.trim());
    expect(JSON.stringify(output)).not.toContain(drifted.toString('base64'));
    const committedFiles = savedFiles(root);
    for (const [path, bytes] of Object.entries(acquisitionFiles)) expect(committedFiles[path]).toEqual(bytes);
    expect(readdirSync(join(root, 'normalizations'))).toHaveLength(1);

    const inspected = normalizationOutput(await runCli(bundle, ['inspect-normalization', '--normalization', request.normalizationId, '--root', root]), 2);
    expect(inspected.run).toEqual(output.run);
    expect(inspected.derivedFieldsIncluded).toBe(false);
    const retry = normalizationOutput(await runCli(bundle, args), 2);
    expect(retry).toMatchObject({ status: 'EXISTING', run: output.run, derivedFieldsIncluded: false });
    expect(savedFiles(root)).toEqual(committedFiles);
    expect(readFileSync(inputPath)).toEqual(drifted);
  });
});
