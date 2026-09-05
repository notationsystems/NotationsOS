import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalCandidateBuildStore, type CandidateBuildRequest, type LocalCandidateBuild } from './local-candidate-build';
import { LocalEvidenceIntake, type LocalIntakeManifest } from './local-intake';
import { LocalNormalizationStore, type LocalNormalizationRun, type NormalizationRequest } from './local-normalization';
import type { CandidateBuildComparisonRequest, compareLocalCandidateBuilds } from './candidate-build-comparison';
import { localRecordDigest } from './local-record';

const workspace = resolve(process.cwd());
const sourceInput = join(workspace, 'examples', 'carrier', 'source.json');
const acquisitionInput = join(workspace, 'examples', 'carrier', 'acquisition.json');
const normalizationInput = join(workspace, 'examples', 'carrier', 'normalization.json');
let temporary: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-candidate-comparison-process-')); });
afterEach(() => { rmSync(temporary, { recursive: true, force: true }); });

interface ProcessResult { code: number | null; stdout: string; stderr: string }
interface ComparisonOutput {
  comparison: ReturnType<typeof compareLocalCandidateBuilds>;
  integrity: 'RECOMPUTED_LOCAL';
  rawBytesIncluded: false;
  candidateFieldsIncluded: false;
  comparisonPersisted: false;
}

/** Fresh Node children, bounded output/time, and an isolated cwd even for malformed CLI flags. */
function runCli(bundle: string, args: string[]): Promise<ProcessResult> {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], { cwd: temporary, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Candidate comparison CLI subprocess exceeded 8 seconds.');
      child.kill('SIGKILL');
    }, 8000);
    function append(chunk: Buffer, stream: 'stdout' | 'stderr') {
      if (failure) return;
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 256 * 1024) {
        failure = new Error('Candidate comparison CLI subprocess exceeded the output limit.');
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
  buildSync({ entryPoints: [join(workspace, 'scripts', 'evidence.entry.ts')], outfile: bundle,
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'silent' });
  return bundle;
}

/** Capture directory membership too: an empty comparison/receipt directory would be a write. */
function storedState(root: string) {
  const files: Record<string, Buffer> = {};
  const directories: string[] = [];
  function walk(prefix: string) {
    for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
      const relative = join(prefix, entry.name);
      if (entry.isDirectory()) { directories.push(relative); walk(relative); }
      else files[relative] = readFileSync(join(root, relative));
    }
  }
  if (existsSync(root)) walk('');
  return { exists: existsSync(root), files, directories: directories.sort() };
}

function noCandidateContent(text: string) {
  expect(text).not.toContain('Demonstration Carriers Incorporated');
  expect(text).not.toContain('DEMO-REG-001');
  expect(text).not.toContain('legalName');
  expect(text).not.toContain('registrationNumber');
  expect(text).not.toContain(readFileSync(sourceInput).toString('base64'));
}

function successful(result: ProcessResult) {
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  noCandidateContent(result.stdout);
  const output = JSON.parse(result.stdout) as ComparisonOutput;
  expect(output).toMatchObject({ integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false,
    candidateFieldsIncluded: false, comparisonPersisted: false });
  expect(output).not.toHaveProperty('status');
  expect(output.comparison).toMatchObject({ schema: 'payload.local-candidate-build-comparison.v1', mode: 'LOCAL_DEVELOPMENT',
    basis: 'REFERENCE_COMPARISON', temporalBasis: 'INPUT_BUILD_TIMES_ONLY',
    nonclaims: { canonicalAdmission: false, canonicalStateMutated: false, identityResolved: false,
      semanticMeaningInferred: false, fieldChangeInferred: false, correctionInferred: false, retractionInferred: false,
      completenessClaimed: false, sourceTruthClaimed: false, independentlyVerified: false, currentSourceUseGranted: false,
      customerDeliveryClaimed: false, releaseActivated: false, rawBytesIncluded: false, candidateFieldsIncluded: false,
      sourceIdentifiersIncluded: true, comparisonPersisted: false } });
  expect(output.comparison).not.toHaveProperty('comparedAt');
  expect(output.comparison.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  const { digest, ...payload } = output.comparison;
  expect(digest).toBe(localRecordDigest(payload));
  return output;
}

function failed(result: ProcessResult) {
  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toMatchObject({ mode: 'LOCAL_DEVELOPMENT', error: expect.any(String) });
  noCandidateContent(result.stderr);
  return JSON.parse(result.stderr).error as string;
}

function writeRequest(value: unknown, filename = 'comparison.json') {
  const path = join(temporary, filename);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function reference(build: LocalCandidateBuild) { return { buildId: build.buildId, expectedDigest: build.digest }; }
function memberReference(run: LocalNormalizationRun) {
  return { normalization: { id: run.request.manifest.normalizationId, digest: run.digest },
    candidate: { id: run.candidate!.candidateId, digest: run.candidate!.digest } };
}

function realBuilds(root: string) {
  const intake = new LocalEvidenceIntake(root);
  const normalizations = new LocalNormalizationStore(root);
  const builds = new LocalCandidateBuildStore(root);
  const acquisitionTemplate = JSON.parse(readFileSync(acquisitionInput, 'utf8')) as LocalIntakeManifest;
  const normalizationTemplate = JSON.parse(readFileSync(normalizationInput, 'utf8')) as NormalizationRequest;
  const source = JSON.parse(readFileSync(sourceInput, 'utf8'));
  function capture(name: string) {
    const manifest: LocalIntakeManifest = { ...structuredClone(acquisitionTemplate),
      acquisitionId: `comparison-acquisition-${name}`, evidenceId: `comparison-evidence-${name}` };
    const bytes = Buffer.from(JSON.stringify({ ...source, sourceRecordId: `comparison-carrier-${name}` }));
    const acquisition = intake.capture(manifest, bytes, '2026-09-05T00:00:01.000Z').acquisition;
    const request: NormalizationRequest = { ...structuredClone(normalizationTemplate),
      normalizationId: `comparison-normalization-${name}`, acquisitionId: manifest.acquisitionId };
    const run = normalizations.normalize(request, '2026-09-05T00:01:00.000Z').run;
    expect(run.state).toBe('NORMALIZED');
    return { acquisition, request, run };
  }
  const retained = capture('retained');
  const removed = capture('removed');
  const changed = capture('changed');
  const added = capture('added');
  const newRequest = { ...changed.request, normalizationId: 'comparison-normalization-changed-again' };
  const newer = normalizations.normalize(newRequest, '2026-09-05T00:03:00.000Z').run;
  expect(newer.candidate!.fields).toEqual(changed.run.candidate!.fields);
  expect(newer.candidate!.provenance.evidence.contentDigest).toBe(changed.run.candidate!.provenance.evidence.contentDigest);
  expect(newer.candidate!.digest).not.toBe(changed.run.candidate!.digest);
  const definition: CandidateBuildRequest['definition'] = {
    id: 'comparison-caravan-carrier-candidates', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier',
    sourceClasses: ['OPERATOR_DECLARATION'],
  };
  function build(buildId: string, ids: string[], at: string, version = '1.0.0') {
    return builds.build({ schema: 'payload.local-candidate-build-request.v1', buildId,
      purpose: 'CARAVAN_LOCAL_DEVELOPMENT', knownThrough: at, definition: { ...definition, version }, normalizationIds: ids }, at).build;
  }
  const before = build('comparison-build-before', [retained.request.normalizationId, removed.request.normalizationId,
    changed.request.normalizationId], '2026-09-05T00:02:00.000Z');
  const after = build('comparison-build-after', [retained.request.normalizationId, added.request.normalizationId,
    newRequest.normalizationId], '2026-09-05T00:04:00.000Z');
  const request: CandidateBuildComparisonRequest = { schema: 'payload.local-candidate-build-comparison-request.v1',
    before: reference(before), after: reference(after) };
  return { before, after, request, retained, removed, changed, added, newer, build };
}

describe('candidate membership comparison through real Node CLI processes', () => {
  it('compares actual builds without writes and returns byte-identical results across concurrent runs and restart', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'evidence');
    const chain = realBuilds(root);
    const requestPath = writeRequest(chain.request);
    const beforeFiles = storedState(root);
    const args = ['compare-candidate-builds', '--request', requestPath, '--root', root];
    const settled = await Promise.allSettled([runCli(bundle, args), runCli(bundle, args)]);
    const outputs = settled.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      successful(result.value);
      return result.value;
    });
    expect(outputs[0].stdout).toBe(outputs[1].stdout);
    const restarted = await runCli(bundle, args);
    const { comparison } = successful(restarted);
    expect(comparison.request).toEqual(chain.request);
    expect(comparison.before).toMatchObject({ buildId: chain.before.buildId, digest: chain.before.digest,
      recordsRoot: chain.before.recordsRoot, knownThrough: chain.before.knownThrough, builtAt: chain.before.builtAt });
    expect(comparison.after).toMatchObject({ buildId: chain.after.buildId, digest: chain.after.digest,
      recordsRoot: chain.after.recordsRoot, knownThrough: chain.after.knownThrough, builtAt: chain.after.builtAt });
    expect(comparison.summary).toEqual({ beforeCount: 3, afterCount: 3, added: 1, removed: 1,
      referenceChanged: 1, unchanged: 1, total: 4, recordsRootChanged: true, buildDigestChanged: true });
    expect(comparison.entries).toEqual([
      { kind: 'ADDED', identity: chain.added.run.candidate!.identity, before: null, after: memberReference(chain.added.run) },
      { kind: 'REFERENCE_CHANGED', identity: chain.changed.run.candidate!.identity,
        before: memberReference(chain.changed.run), after: memberReference(chain.newer) },
      { kind: 'REMOVED', identity: chain.removed.run.candidate!.identity, before: memberReference(chain.removed.run), after: null },
      { kind: 'UNCHANGED', identity: chain.retained.run.candidate!.identity,
        before: memberReference(chain.retained.run), after: memberReference(chain.retained.run) },
    ]);
    expect(restarted.stdout).toBe(outputs[0].stdout);
    expect(storedState(root)).toEqual(beforeFiles);
    expect(readFileSync(requestPath, 'utf8')).toBe(JSON.stringify(chain.request));
  });

  it('keeps reused membership unchanged across a new build and permits exact self-comparison', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'evidence');
    const chain = realBuilds(root);
    const rebuilt = chain.build('comparison-build-reused-members', chain.before.request.manifest.normalizationIds,
      '2026-09-05T00:06:00.000Z');
    expect(rebuilt.digest).not.toBe(chain.before.digest);
    expect(rebuilt.members[0].deriveDecision).not.toEqual(chain.before.members[0].deriveDecision);
    const beforeFiles = storedState(root);
    for (const after of [rebuilt, chain.before]) {
      const path = writeRequest({ ...chain.request, after: reference(after) });
      const result = successful(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
      expect(result.comparison.summary).toEqual({ beforeCount: 3, afterCount: 3, added: 0, removed: 0,
        referenceChanged: 0, unchanged: 3, total: 3, recordsRootChanged: false, buildDigestChanged: after !== chain.before });
      expect(result.comparison.entries.every((entry) => entry.kind === 'UNCHANGED')).toBe(true);
      expect(storedState(root)).toEqual(beforeFiles);
    }
  });

  it('accepts exactly 64 KiB of request bytes and rejects one byte more before touching the store', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'evidence');
    const { request } = realBuilds(root);
    const path = join(temporary, 'boundary-request.json');
    const beforeFiles = storedState(root);
    writeFileSync(path, JSON.stringify(request).padEnd(64 * 1024, ' '));
    successful(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
    expect(storedState(root)).toEqual(beforeFiles);
    writeFileSync(path, JSON.stringify(request).padEnd(64 * 1024 + 1, ' '));
    failed(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
    expect(storedState(root)).toEqual(beforeFiles);
  });

  it('rejects wrong full references and unavailable builds without producing a comparison or changing stored history', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'evidence');
    const chain = realBuilds(root);
    const beforeFiles = storedState(root);
    const requests = [
      { ...chain.request, before: { ...chain.request.before, expectedDigest: `sha256:${'0'.repeat(64)}` } },
      { ...chain.request, after: { ...chain.request.after, expectedDigest: chain.after.recordsRoot } },
      { ...chain.request, before: { ...chain.request.before, buildId: 'comparison-build-missing' } },
      { ...chain.request, after: { ...chain.request.after, buildId: 'comparison-build-missing' } },
    ];
    for (const request of requests) {
      const path = writeRequest(request);
      failed(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
      expect(storedState(root)).toEqual(beforeFiles);
    }
  });

  it('fails after source-byte corruption without repairing, deleting or publishing any stored file', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'evidence');
    const chain = realBuilds(root);
    const path = writeRequest(chain.request);
    successful(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
    const objectPath = join(root, 'objects', ...chain.changed.acquisition.capture.evidence.storageKey.split('/'));
    writeFileSync(objectPath, 'Deliberately corrupted synthetic source bytes.');
    const damagedFiles = storedState(root);
    const error = failed(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
    expect(error).not.toContain(objectPath);
    expect(storedState(root)).toEqual(damagedFiles);
  });

  it('refuses incompatible definitions and reverse chronology without producing or persisting a partial result', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'evidence');
    const chain = realBuilds(root);
    const different = chain.build('comparison-build-different-definition', [chain.retained.request.normalizationId],
      '2026-09-05T00:05:00.000Z', '2.0.0');
    const beforeFiles = storedState(root);
    for (const request of [
      { ...chain.request, after: reference(different) },
      { ...chain.request, before: chain.request.after, after: chain.request.before },
    ]) {
      const path = writeRequest(request);
      failed(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
      expect(storedState(root)).toEqual(beforeFiles);
    }
  });

  it('rejects malformed, extra-field and oversized requests and missing or unsupported flags without creating a store', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'never-created-evidence');
    const request: CandidateBuildComparisonRequest = { schema: 'payload.local-candidate-build-comparison-request.v1',
      before: { buildId: 'before', expectedDigest: `sha256:${'a'.repeat(64)}` },
      after: { buildId: 'after', expectedDigest: `sha256:${'b'.repeat(64)}` } };
    for (const value of [
      null,
      { ...request, root: '/message-selected-root' },
      { ...request, before: { ...request.before, fields: true } },
      { ...request, after: { ...request.after, expectedDigest: 'recordsRoot-is-not-a-build-digest' } },
      { ...request, comparisonPersisted: true },
    ]) {
      const path = writeRequest(value);
      failed(await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]));
      expect(existsSync(root)).toBe(false);
    }
    const malformedPath = join(temporary, 'malformed.json');
    writeFileSync(malformedPath, '{"schema":');
    failed(await runCli(bundle, ['compare-candidate-builds', '--request', malformedPath, '--root', root]));
    const oversizedPath = join(temporary, 'oversized.json');
    writeFileSync(oversizedPath, ' '.repeat(64 * 1024 + 1));
    failed(await runCli(bundle, ['compare-candidate-builds', '--request', oversizedPath, '--root', root]));
    const path = writeRequest(request);
    for (const args of [
      ['compare-candidate-builds'],
      ['compare-candidate-builds', '--root', root],
      ['compare-candidate-builds', '--request'],
      ['compare-candidate-builds', '--request', path, '--root'],
      ['compare-candidate-builds', '--request', path, '--request', path, '--root', root],
      ['compare-candidate-builds', '--request', path, '--output', 'unrequested-output.json', '--root', root],
      ['compare-candidate-builds', '--request', path, '--build', 'before', '--root', root],
    ]) {
      failed(await runCli(bundle, args));
      expect(existsSync(root)).toBe(false);
      expect(existsSync(join(temporary, '.payload'))).toBe(false);
      expect(existsSync(join(temporary, 'unrequested-output.json'))).toBe(false);
    }
  });

  it('rejects invalid UTF-8 and redacts malformed request snippets, missing paths and file-read failures uniformly', async () => {
    const bundle = bundleCli();
    const root = join(temporary, 'uncreated-evidence');
    const request: CandidateBuildComparisonRequest = { schema: 'payload.local-candidate-build-comparison-request.v1',
      before: { buildId: 'before', expectedDigest: `sha256:${'a'.repeat(64)}` },
      after: { buildId: 'after', expectedDigest: `sha256:${'b'.repeat(64)}` } };
    const invalidBytes = Buffer.from(JSON.stringify(request));
    const marker = Buffer.from('"buildId":"before"');
    const markerOffset = invalidBytes.indexOf(marker);
    expect(markerOffset).toBeGreaterThanOrEqual(0);
    // Replacement decoding would leave a parseable JSON document and an opaque,
    // unknown build id. Fatal decoding must reject the request before inspection.
    invalidBytes[markerOffset + Buffer.byteLength('"buildId":"')] = 0xff;
    const invalidUtf8Path = join(temporary, 'invalid-utf8.json');
    writeFileSync(invalidUtf8Path, invalidBytes);
    const malformedPath = join(temporary, 'malformed-sensitive-request.json');
    writeFileSync(malformedPath, '{"legalName":"Demonstration Carriers Incorporated","registrationNumber":"DEMO-REG-001", BROKEN');
    const oversizedPath = join(temporary, 'oversized-sensitive-request.json');
    writeFileSync(oversizedPath, ' '.repeat(64 * 1024 + 1));
    const errors: string[] = [];
    for (const path of [invalidUtf8Path, malformedPath, oversizedPath, join(temporary, 'private-missing-path.json'), temporary]) {
      const result = await runCli(bundle, ['compare-candidate-builds', '--request', path, '--root', root]);
      const error = failed(result);
      expect(error).toContain('INVALID_COMPARISON_REQUEST');
      expect(error).not.toContain(path);
      expect(error).not.toContain('BROKEN');
      expect(error).not.toContain('private-missing-path');
      errors.push(error);
      expect(existsSync(root)).toBe(false);
      expect(existsSync(join(temporary, '.payload'))).toBe(false);
    }
    expect(new Set(errors).size).toBe(1);
  });
});
