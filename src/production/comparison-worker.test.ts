import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compareLocalCandidateBuilds, type CandidateBuildComparisonRequest } from '../data-os/candidate-build-comparison';
import { LocalCandidateBuildStore, type CandidateBuildRequest, type LocalCandidateBuild } from '../data-os/local-candidate-build';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { LocalNormalizationStore, type NormalizationRequest } from '../data-os/local-normalization';
import { localRecordDigest } from '../data-os/local-record';

const workspace = resolve(process.cwd());
const worker = join(workspace, '.stamp', 'production-worker.mjs');
const sourceBytes = readFileSync(join(workspace, 'examples', 'carrier', 'source.json'));
const acquisitionTemplate = JSON.parse(readFileSync(join(workspace, 'examples', 'carrier', 'acquisition.json'), 'utf8')) as LocalIntakeManifest;
const normalizationTemplate = JSON.parse(readFileSync(join(workspace, 'examples', 'carrier', 'normalization.json'), 'utf8')) as NormalizationRequest;
const comparisonMessages: Record<string, string> = {
  INVALID_COMPARISON_REQUEST: 'Provide only exact before/after build ids and full SHA-256 digests in the versioned comparison request.',
  BUILD_NOT_FOUND: 'A selected candidate build is not retained in the local store.',
  BUILD_DIGEST_MISMATCH: 'A selected candidate build does not match its expected full digest.',
  BUILD_INSPECTION_FAILED: 'A selected candidate build or its evidence dependencies could not be verified. Existing files were preserved.',
  INCOMPATIBLE_BUILDS: 'Both builds must use the same definition, build contract and purpose.',
  REVERSED_BUILD_ORDER: 'Before must not follow after in build time or knowledge cutoff.',
};
let temporary: string;
let root: string;

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-comparison-worker-'));
  root = join(temporary, 'operator-evidence');
});
afterEach(() => { rmSync(temporary, { recursive: true, force: true }); });

interface WorkerOutput { code: number | null; stdout: string; stderr: string }
interface ComparisonValue {
  comparison: ReturnType<typeof compareLocalCandidateBuilds>;
  integrity: 'RECOMPUTED_LOCAL';
  rawBytesIncluded: false;
  candidateFieldsIncluded: false;
  comparisonPersisted: false;
}

function envelope(request: unknown) {
  return { schema: 'payload.production-worker.v1', action: 'COMPARE_CANDIDATE_BUILDS', request };
}

/** The built worker uses only a temporary operator root and cwd, even for malformed input. */
function runWorker(input: unknown, localMode = '1'): Promise<WorkerOutput> {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [worker], {
      cwd: temporary, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PAYLOAD_PRODUCTION_LOCAL: localMode, PAYLOAD_PRODUCTION_DIR: root },
    });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Comparison worker exceeded its 8-second test limit.');
      child.kill('SIGKILL');
    }, 8000);
    function append(chunk: Buffer, stream: 'stdout' | 'stderr') {
      if (failure) return;
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1024 * 1024) {
        failure = new Error('Comparison worker exceeded its test output limit.');
        child.kill('SIGKILL');
      }
    }
    child.stdout.on('data', (chunk: Buffer) => append(chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => append(chunk, 'stderr'));
    child.stdin.on('error', (error) => { failure = error; });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else complete({ code, stdout, stderr });
    });
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

/** Directory membership is part of the snapshot: an empty receipt directory is a write. */
function storedState() {
  const files: Record<string, Buffer> = {};
  const directories: string[] = [];
  function walk(prefix: string) {
    for (const entry of readdirSync(join(temporary, prefix), { withFileTypes: true })) {
      const relative = join(prefix, entry.name);
      if (entry.isDirectory()) { directories.push(relative); walk(relative); }
      else files[relative] = readFileSync(join(temporary, relative));
    }
  }
  walk('');
  return { files, directories: directories.sort() };
}

function noPrivateContent(text: string) {
  for (const sensitive of [temporary, root, 'Demonstration Carriers Incorporated', 'DEMO-REG-001',
    'legalName', 'registrationNumber', sourceBytes.toString('base64'), 'private-corruption-marker']) {
    expect(text).not.toContain(sensitive);
  }
}

function success(result: WorkerOutput) {
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  noPrivateContent(result.stdout);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ schema: 'payload.production-worker-result.v1', ok: true });
  expect(output).not.toHaveProperty('error');
  const value = output.value as ComparisonValue;
  expect(value).toMatchObject({ schema: 'payload.production-candidate-comparison.v1', mode: 'LOCAL_DEVELOPMENT',
    inspection: 'HISTORICAL', integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false,
    candidateFieldsIncluded: false, sourceIdentifiersIncluded: true, comparisonPersisted: false,
    canonicalAdmission: false, currentRightsGrant: false });
  expect(value.comparison).toMatchObject({ schema: 'payload.local-candidate-build-comparison.v1', mode: 'LOCAL_DEVELOPMENT',
    basis: 'REFERENCE_COMPARISON', temporalBasis: 'INPUT_BUILD_TIMES_ONLY',
    nonclaims: { canonicalAdmission: false, canonicalStateMutated: false, identityResolved: false,
      semanticMeaningInferred: false, fieldChangeInferred: false, correctionInferred: false, retractionInferred: false,
      completenessClaimed: false, sourceTruthClaimed: false, independentlyVerified: false, currentSourceUseGranted: false,
      customerDeliveryClaimed: false, releaseActivated: false, rawBytesIncluded: false, candidateFieldsIncluded: false,
      sourceIdentifiersIncluded: true, comparisonPersisted: false } });
  expect(value.comparison).not.toHaveProperty('comparedAt');
  const { digest, ...payload } = value.comparison;
  expect(digest).toBe(localRecordDigest(payload));
  return value;
}

function failure(result: WorkerOutput, code: string, status: number) {
  expect(result.code).toBe(1);
  expect(result.stderr).toBe('');
  noPrivateContent(result.stdout);
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({ schema: 'payload.production-worker-result.v1', ok: false,
    error: { code, status, message: expect.any(String) } });
  expect(output).not.toHaveProperty('value');
  expect(output.error).not.toHaveProperty('details');
  if (comparisonMessages[code]) expect(output.error.message).toBe(comparisonMessages[code]);
  return output.error.message as string;
}

const reference = (build: LocalCandidateBuild) => ({ buildId: build.buildId, expectedDigest: build.digest });
function fixtures() {
  const intake = new LocalEvidenceIntake(root);
  const normalizations = new LocalNormalizationStore(root);
  const builds = new LocalCandidateBuildStore(root);
  const manifest = structuredClone(acquisitionTemplate);
  const acquisition = intake.capture(manifest, sourceBytes, '2026-09-05T00:00:01.000Z').acquisition;
  const original = normalizations.normalize(structuredClone(normalizationTemplate), '2026-09-05T00:01:00.000Z').run;
  const repeated = normalizations.normalize({ ...structuredClone(normalizationTemplate), normalizationId: 'worker-repeated-normalization' },
    '2026-09-05T00:03:00.000Z').run;
  expect(original.state).toBe('NORMALIZED');
  expect(repeated.candidate!.fields).toEqual(original.candidate!.fields);
  const definition: CandidateBuildRequest['definition'] = { id: 'worker-caravan-carrier', version: '1.0.0', domain: 'CARAVAN',
    recordType: 'Carrier', sourceClasses: ['OPERATOR_DECLARATION'] };
  function build(buildId: string, normalizationId: string, at: string, version = '1.0.0') {
    return builds.build({ schema: 'payload.local-candidate-build-request.v1', buildId,
      purpose: 'CARAVAN_LOCAL_DEVELOPMENT', knownThrough: at, definition: { ...definition, version },
      normalizationIds: [normalizationId] }, at).build;
  }
  const before = build('worker-before', original.request.manifest.normalizationId, '2026-09-05T00:02:00.000Z');
  const after = build('worker-after', repeated.request.manifest.normalizationId, '2026-09-05T00:04:00.000Z');
  const request: CandidateBuildComparisonRequest = { schema: 'payload.local-candidate-build-comparison-request.v1',
    before: reference(before), after: reference(after) };
  return { before, after, request, acquisition, original, repeated, build };
}

const missingRequest = (): CandidateBuildComparisonRequest => ({ schema: 'payload.local-candidate-build-comparison-request.v1',
  before: { buildId: 'worker-before-missing', expectedDigest: `sha256:${'0'.repeat(64)}` },
  after: { buildId: 'worker-after-missing', expectedDigest: `sha256:${'1'.repeat(64)}` } });

describe('candidate-build comparison through the real production worker', () => {
  it('returns identical reference-only results across concurrent fresh processes and restart without writes', async () => {
    const chain = fixtures();
    const snapshot = storedState();
    const processes = await Promise.all([runWorker(envelope(chain.request)), runWorker(envelope(chain.request))]);
    const restarted = await runWorker(envelope(chain.request));
    for (const result of [...processes, restarted]) {
      const value = success(result);
      expect(value.comparison).toEqual(compareLocalCandidateBuilds(chain.request, root));
      expect(value.comparison.summary).toEqual({ beforeCount: 1, afterCount: 1, added: 0, removed: 0,
        referenceChanged: 1, unchanged: 0, total: 1, recordsRootChanged: true, buildDigestChanged: true });
      expect(value.comparison.entries[0].kind).toBe('REFERENCE_CHANGED');
    }
    expect(processes[0].stdout).toBe(processes[1].stdout);
    expect(restarted.stdout).toBe(processes[0].stdout);
    expect(storedState()).toEqual(snapshot);
    expect(existsSync(join(root, 'production-v1'))).toBe(false);
  });

  it('permits exact self-comparison without inventing a change or persisting a result', async () => {
    const chain = fixtures();
    const request = { ...chain.request, after: reference(chain.before) };
    const snapshot = storedState();
    const value = success(await runWorker(envelope(request)));
    expect(value.comparison).toEqual(compareLocalCandidateBuilds(request, root));
    expect(value.comparison.summary).toEqual({ beforeCount: 1, afterCount: 1, added: 0, removed: 0,
      referenceChanged: 0, unchanged: 1, total: 1, recordsRootChanged: false, buildDigestChanged: false });
    expect(storedState()).toEqual(snapshot);
  });

  it.each(['', '0', 'true'])('requires the explicit local operator mode, rejecting %j without writes', async (mode) => {
    const snapshot = storedState();
    failure(await runWorker(envelope(missingRequest()), mode), 'LOCAL_MODE_DISABLED', 403);
    expect(storedState()).toEqual(snapshot);
  });

  it.each(['root', 'output', 'requestFile', 'runtime', 'args'])('closes the worker envelope against caller %s options', async (field) => {
    const snapshot = storedState();
    failure(await runWorker({ ...envelope(missingRequest()), [field]: join(temporary, 'caller-selected') }), 'INVALID_REQUEST', 400);
    expect(storedState()).toEqual(snapshot);
  });

  it.each(['null', '[]', '{', '{"schema":"payload.production-worker.v1","action":"COMPARE_CANDIDATE_BUILDS"}'])('rejects malformed envelope %# before reading or writing local inventory', async (input) => {
    const snapshot = storedState();
    failure(await runWorker(input), 'INVALID_REQUEST', 400);
    expect(storedState()).toEqual(snapshot);
  });

  it.each(['PATH', 'ROOT_OPTION', 'FULL_BUILD', 'UPPERCASE_DIGEST', 'WRONG_SCHEMA'] as const)('closes the nested comparison request against %s', async (kind) => {
    const request: Record<string, unknown> = missingRequest() as unknown as Record<string, unknown>;
    if (kind === 'PATH') request.before = { ...missingRequest().before, path: '../outside' };
    if (kind === 'ROOT_OPTION') request.root = join(temporary, 'caller-selected');
    if (kind === 'FULL_BUILD') request.after = { ...missingRequest().after, members: [], canonicalAdmission: true };
    if (kind === 'UPPERCASE_DIGEST') request.after = { ...missingRequest().after, expectedDigest: `sha256:${'A'.repeat(64)}` };
    if (kind === 'WRONG_SCHEMA') request.schema = 'payload.local-candidate-build.v1';
    const snapshot = storedState();
    failure(await runWorker(envelope(request)), 'INVALID_COMPARISON_REQUEST', 400);
    expect(storedState()).toEqual(snapshot);
  });

  it('returns a fixed missing-build 404 without creating an absent operator store', async () => {
    const snapshot = storedState();
    const message = failure(await runWorker(envelope(missingRequest())), 'BUILD_NOT_FOUND', 404);
    const alternate = missingRequest();
    alternate.before.buildId = 'different-missing-id';
    expect(failure(await runWorker(envelope(alternate)), 'BUILD_NOT_FOUND', 404)).toBe(message);
    expect(storedState()).toEqual(snapshot);
    expect(existsSync(root)).toBe(false);
  });

  it('treats path-looking build ids as opaque hashed identifiers, never as filesystem targets', async () => {
    const request = missingRequest();
    request.before.buildId = '../outside';
    const snapshot = storedState();
    failure(await runWorker(envelope(request)), 'BUILD_NOT_FOUND', 404);
    expect(storedState()).toEqual(snapshot);
    expect(existsSync(root)).toBe(false);
  });

  it.each(['before', 'after'] as const)('returns 409 for the wrong full %s digest without mutation', async (side) => {
    const chain = fixtures();
    const request = structuredClone(chain.request);
    request[side].expectedDigest = chain[side].recordsRoot;
    expect(request[side].expectedDigest).not.toBe(chain[side].digest);
    const snapshot = storedState();
    failure(await runWorker(envelope(request)), 'BUILD_DIGEST_MISMATCH', 409);
    expect(storedState()).toEqual(snapshot);
  });

  it.each(['INCOMPATIBLE_BUILDS', 'REVERSED_BUILD_ORDER'] as const)('returns a typed %s conflict without partial publication', async (code) => {
    const chain = fixtures();
    const request = code === 'REVERSED_BUILD_ORDER' ? { ...chain.request, before: chain.request.after, after: chain.request.before } :
      { ...chain.request, after: reference(chain.build('worker-other-definition', chain.repeated.request.manifest.normalizationId,
        '2026-09-05T00:05:00.000Z', '2.0.0')) };
    const snapshot = storedState();
    failure(await runWorker(envelope(request)), code, 409);
    expect(storedState()).toEqual(snapshot);
  });

  it('reopens and rejects corrupted source dependencies with a fixed 503 and no repair', async () => {
    const chain = fixtures();
    success(await runWorker(envelope(chain.request)));
    const objectPath = join(root, 'objects', ...chain.acquisition.capture.evidence.storageKey.split('/'));
    writeFileSync(objectPath, 'private-corruption-marker: synthetic bytes');
    const snapshot = storedState();
    const message = failure(await runWorker(envelope(chain.request)), 'BUILD_INSPECTION_FAILED', 503);
    expect(storedState()).toEqual(snapshot);
    writeFileSync(objectPath, 'a different private-corruption-marker');
    const secondSnapshot = storedState();
    expect(failure(await runWorker(envelope(chain.request)), 'BUILD_INSPECTION_FAILED', 503)).toBe(message);
    expect(storedState()).toEqual(secondSnapshot);
    expect(snapshot.directories).toEqual(secondSnapshot.directories);
    expect(Object.keys(snapshot.files)).toEqual(Object.keys(secondSnapshot.files));
  });
});
