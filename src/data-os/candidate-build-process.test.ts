import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CandidateBuildRequest, LocalCandidateBuild } from './local-candidate-build';
import type { LocalAcquisition } from './local-intake';
import type { LocalNormalizationRun } from './local-normalization';

const workspace = resolve(process.cwd());
const acquisitionRequest = join(workspace, 'examples', 'carrier', 'acquisition.json');
const normalizationRequest = join(workspace, 'examples', 'carrier', 'normalization.json');
const sourceInput = join(workspace, 'examples', 'carrier', 'source.json');
let temporary: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-candidate-build-process-')); });
afterEach(() => { rmSync(temporary, { recursive: true, force: true }); });

interface ProcessResult { code: number | null; stdout: string; stderr: string }
interface BuildOutput {
  status?: 'CREATED' | 'EXISTING';
  build: LocalCandidateBuild;
  integrity: string;
  rawBytesIncluded: boolean;
  candidateFieldsIncluded: boolean;
}

/** Every command runs in a fresh, bounded Node process against an isolated store. */
function runCli(bundle: string, args: string[]): Promise<ProcessResult> {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Candidate-build CLI subprocess exceeded 8 seconds.');
      child.kill('SIGKILL');
    }, 8000);
    function append(chunk: Buffer, stream: 'stdout' | 'stderr') {
      if (failure) return;
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 256 * 1024) {
        failure = new Error('Candidate-build CLI subprocess exceeded the output limit.');
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

function buildOutput(result: ProcessResult): BuildOutput {
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  const output = JSON.parse(result.stdout) as BuildOutput;
  expect(output).toMatchObject({ integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false, candidateFieldsIncluded: false });
  expect(output.build).toMatchObject({
    schema: 'payload.local-candidate-build.v1', state: 'UNADMITTED', mode: 'LOCAL_DEVELOPMENT',
    policyAuthority: 'OPERATOR_DECLARATION', canonicalAdmission: false, canonicalStateMutated: false,
    identityResolved: false, releaseActivated: false, sourceTruthClaimed: false, independentlyVerified: false,
    completenessClaimed: false,
  });
  expect(output.build.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(JSON.stringify(output)).not.toContain('Demonstration Carriers Incorporated');
  expect(JSON.stringify(output)).not.toContain('DEMO-REG-001');
  expect(JSON.stringify(output)).not.toContain(readFileSync(sourceInput).toString('base64'));
  return output;
}

function failedOutput(result: ProcessResult) {
  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toMatchObject({ mode: 'LOCAL_DEVELOPMENT', error: expect.any(String) });
}

async function acquiredCandidate(bundle: string, root: string, quarantine = false) {
  let input = sourceInput;
  if (quarantine) {
    input = join(temporary, 'drifted-carrier.json');
    const source = JSON.parse(readFileSync(sourceInput, 'utf8'));
    writeFileSync(input, JSON.stringify({ ...source, schema: 'caravan.carrier-source.v2' }));
  }
  const capture = await runCli(bundle, ['capture', '--request', acquisitionRequest, '--input', input, '--root', root]);
  expect(capture.code, capture.stderr).toBe(0);
  expect(capture.stderr).toBe('');
  const acquisition = JSON.parse(capture.stdout).acquisition as LocalAcquisition;
  const normalized = await runCli(bundle, ['normalize', '--request', normalizationRequest, '--root', root]);
  expect(normalized.code, normalized.stderr).toBe(quarantine ? 2 : 0);
  expect(normalized.stderr).toBe('');
  const normalization = JSON.parse(normalized.stdout).run as LocalNormalizationRun;
  const request: CandidateBuildRequest = {
    schema: 'payload.local-candidate-build-request.v1',
    buildId: 'demo-caravan-carrier-build-process-001',
    purpose: 'CARAVAN_LOCAL_DEVELOPMENT',
    knownThrough: new Date().toISOString(),
    definition: {
      id: 'demo-caravan-carrier-candidates-v1', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier',
      sourceClasses: ['OPERATOR_DECLARATION'],
    },
    normalizationIds: ['demo-caravan-carrier-normalization-001'],
  };
  expect(Date.parse(request.knownThrough)).toBeGreaterThanOrEqual(Date.parse(normalization.normalizedAt));
  const requestPath = join(temporary, 'candidate-build.json');
  writeFileSync(requestPath, JSON.stringify(request));
  return { acquisition, normalization, request, requestPath };
}

describe('candidate builds across real Node processes', () => {
  it('concurrently creates one build, preserves its exact winner across restart and retry, and refuses changed-definition overwrite', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'shared-evidence');
    const sourceBefore = readFileSync(sourceInput);
    const { normalization, request, requestPath } = await acquiredCandidate(bundle, root);
    const args = ['build-candidates', '--request', requestPath, '--root', root];
    const upstreamFiles = savedFiles(root);

    // Await every writer before cleanup, including when an assertion will fail.
    const settled = await Promise.allSettled([runCli(bundle, args), runCli(bundle, args)]);
    const outputs = settled.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return buildOutput(result.value);
    });
    expect(outputs.map((output) => output.status).sort()).toEqual(['CREATED', 'EXISTING']);
    expect(outputs[0].build).toEqual(outputs[1].build);
    const winner = outputs[0].build;
    expect(Date.parse(winner.builtAt)).toBeGreaterThanOrEqual(Date.parse(request.knownThrough));
    expect(winner).toMatchObject({ buildId: request.buildId, knownThrough: request.knownThrough, recordCount: 1 });
    expect(winner.request.manifest).toEqual(request);
    expect(winner.members).toHaveLength(1);
    expect(winner.members[0]).toMatchObject({
      normalization: { id: request.normalizationIds[0], digest: normalization.digest },
      candidate: { id: normalization.candidate!.candidateId, digest: normalization.candidate!.digest },
      identity: normalization.candidate!.identity,
      knownAt: normalization.candidate!.knownAt,
      validTime: { state: 'UNOBSERVED', from: null, to: null },
      deriveDecision: { state: 'ALLOWED', evaluatedAt: winner.builtAt,
        request: { operation: 'DERIVE', audience: 'INTERNAL', purpose: request.purpose, requestedAt: winner.builtAt } },
    });
    expect(winner.members[0]).not.toHaveProperty('fields');
    expect(winner.members[0].deriveDecision.requestId).not.toBe(normalization.deriveDecision.requestId);
    expect(readdirSync(join(root, 'candidate-builds'))).toHaveLength(1);
    const committedFiles = savedFiles(root);
    for (const [path, bytes] of Object.entries(upstreamFiles)) expect(committedFiles[path]).toEqual(bytes);

    const inspected = buildOutput(await runCli(bundle, ['inspect-candidate-build', '--build', request.buildId, '--root', root]));
    expect(inspected.build).toEqual(winner);
    expect(inspected).not.toHaveProperty('status');
    const retried = buildOutput(await runCli(bundle, args));
    expect(retried).toMatchObject({ status: 'EXISTING', build: winner });
    expect(savedFiles(root)).toEqual(committedFiles);

    const conflictingPath = join(temporary, 'changed-definition.json');
    writeFileSync(conflictingPath, JSON.stringify({ ...request, definition: { ...request.definition, version: '2.0.0' } }));
    const conflict = await runCli(bundle, ['build-candidates', '--request', conflictingPath, '--root', root]);
    failedOutput(conflict);
    expect(JSON.parse(conflict.stderr).error).toContain('CONFLICT');
    expect(savedFiles(root)).toEqual(committedFiles);
    expect(readFileSync(sourceInput)).toEqual(sourceBefore);
  });

  it('fails fresh inspection and retry after upstream bytes are corrupted without repairing or overwriting any stored file', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'corrupted-evidence');
    const { acquisition, request, requestPath } = await acquiredCandidate(bundle, root);
    const args = ['build-candidates', '--request', requestPath, '--root', root];
    expect(buildOutput(await runCli(bundle, args)).status).toBe('CREATED');
    const objectPath = join(root, 'objects', ...acquisition.capture.evidence.storageKey.split('/'));
    writeFileSync(objectPath, 'Intentionally corrupt synthetic source bytes.');
    const corruptedFiles = savedFiles(root);

    failedOutput(await runCli(bundle, ['inspect-candidate-build', '--build', request.buildId, '--root', root]));
    expect(savedFiles(root)).toEqual(corruptedFiles);
    failedOutput(await runCli(bundle, args));
    expect(savedFiles(root)).toEqual(corruptedFiles);
    expect(readdirSync(join(root, 'candidate-builds'))).toHaveLength(1);
  });

  it('treats a quarantined normalization as an error, not a successful candidate build or a second quarantine publication', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'quarantined-evidence');
    const { normalization, request, requestPath } = await acquiredCandidate(bundle, root, true);
    expect(normalization).toMatchObject({ state: 'QUARANTINED', reasons: ['SCHEMA_MISMATCH'], candidate: null });
    const priorFiles = savedFiles(root);
    failedOutput(await runCli(bundle, ['build-candidates', '--request', requestPath, '--root', root]));
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
    expect(savedFiles(root)).toEqual(priorFiles);
    failedOutput(await runCli(bundle, ['inspect-candidate-build', '--build', request.buildId, '--root', root]));
    expect(savedFiles(root)).toEqual(priorFiles);
  });
});
