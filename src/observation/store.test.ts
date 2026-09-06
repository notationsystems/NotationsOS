import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticReplayManifest } from '../../examples/observations/synthetic-manifest';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest, storageKeyFor } from '../data-os/evidence-capture';
import { MAX_EVIDENCE_BYTES } from '../data-os/file-object-store';
import { LocalEvidenceIntake, type LocalAcquisition } from '../data-os/local-intake';
import * as localFiles from '../data-os/local-files';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import { MAX_REPLAY_MANIFEST_BYTES, MAX_REPLAY_REPORT_BYTES, type ArtifactReference, type ReplayManifest, type ReplayRequest } from './contract';
import { compileReplay } from './replay';
import { MAX_REPLAY_DEPENDENCY_BYTES, ObservationReplayStore, type ReplayRun } from './store';

const CAPTURED = '2026-09-05T12:00:00.000Z';
const STORED = '2026-09-05T12:00:01.000Z';
const MANIFEST_CAPTURED = '2026-09-05T12:00:02.000Z';
const MANIFEST_STORED = '2026-09-05T12:00:03.000Z';
const REPLAYED = '2026-09-05T13:00:00.000Z';
const EXPIRED = '2026-10-05T00:00:00.000Z';
const SOURCE_BYTES = Buffer.from('SYNTHETIC_TEST_RAW_ARTIFACT_NOT_SENSOR_DATA\n');
const purpose = 'recorded-observation-replay';
let temporary: string;
let root: string;
let fetch: ReturnType<typeof vi.fn>;

function policy(changes: Partial<SourceRegistration> = {}): SourceRegistration {
  return { registrationId: 'synthetic-replay-policy', sourceId: 'synthetic-observation-tests',
    displayName: 'Synthetic observation test evidence', sourceClass: 'synthetic-test',
    licenseId: 'synthetic-test-operator-declaration', policyVersion: '1.0.0',
    effectiveFrom: '2026-09-05T00:00:00.000Z', effectiveUntil: EXPIRED,
    permittedPurposes: [purpose], allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'],
    retention: { mode: 'INDEFINITE' }, ...changes };
}

function acquire(id: string, bytes: Buffer = SOURCE_BYTES, registration = policy(), manifest = false): ArtifactReference {
  const acquisition = new LocalEvidenceIntake(root).capture({
    schema: 'payload.local-intake-request.v1', acquisitionId: id, evidenceId: `${id}:evidence`,
    sourceRegistration: registration, purpose: registration.permittedPurposes[0],
    mediaType: manifest ? 'application/json' : 'application/octet-stream',
    capturedAt: manifest ? MANIFEST_CAPTURED : CAPTURED,
  }, bytes, manifest ? MANIFEST_STORED : STORED).acquisition;
  return { acquisitionId: id, acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest };
}

function request(ref: ArtifactReference, replayId = 'synthetic-replay'): ReplayRequest {
  return { schema: 'payload.recorded-observation-replay-request.v1', replayId, manifest: ref };
}

function setup(options: { rawPolicy?: SourceRegistration; manifestPolicy?: SourceRegistration; change?: (manifest: ReplayManifest) => void; bytes?: (manifest: ReplayManifest) => Buffer } = {}) {
  const raw = acquire('synthetic-raw', SOURCE_BYTES, options.rawPolicy);
  const manifest = syntheticReplayManifest(raw);
  options.change?.(manifest);
  const bytes = options.bytes ? options.bytes(manifest) : encodeLocalRecord(manifest, MAX_REPLAY_MANIFEST_BYTES);
  const ref = acquire('synthetic-manifest', bytes, options.manifestPolicy, true);
  return { raw, manifest, manifestBytes: bytes, request: request(ref) };
}

function runPath(id = 'synthetic-replay') { return join(root, 'observation-replays', `${byteDigest(Buffer.from(id)).slice(7)}.json`); }
function acquisitionPath(ref: ArtifactReference) { return join(root, 'acquisitions', `${byteDigest(Buffer.from(ref.acquisitionId)).slice(7)}.json`); }
function objectPath(ref: ArtifactReference) { return join(root, 'objects', ...storageKeyFor(ref.contentDigest).split('/')); }

function files(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const target = join(directory, name), key = prefix ? `${prefix}/${name}` : name;
    return lstatSync(target).isDirectory() ? Object.entries(files(target, key)) : [[key, byteDigest(readFileSync(target))]];
  }));
}

function reseal<T extends { digest: string }>(record: T): T {
  const { digest: old, ...payload } = record; void old;
  return { ...record, digest: localRecordDigest(payload, MAX_REPLAY_REPORT_BYTES) };
}

function editRun(change: (run: ReplayRun) => void, rehash = true) {
  const run = JSON.parse(readFileSync(runPath(), 'utf8')) as ReplayRun;
  change(run);
  writeFileSync(runPath(), encodeLocalRecord(rehash ? reseal(run) : run, MAX_REPLAY_REPORT_BYTES));
}

function expectRefusalUnchanged(action: () => unknown, message?: RegExp | string) {
  const before = files();
  if (message) expect(action).toThrow(message);
  else expect(action).toThrow();
  expect(files()).toEqual(before);
}

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-observation-replay-'));
  root = join(temporary, 'evidence');
  fetch = vi.fn(() => { throw new Error('NETWORK_FORBIDDEN_IN_RECORDED_REPLAY_TEST'); });
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  const base = resolve(tmpdir()), target = resolve(temporary), within = relative(base, target);
  expect(within).toMatch(/^payload-observation-replay-[^\\/]+$/);
  expect(target).not.toBe(base);
  rmSync(target, { recursive: true, force: true });
});

describe('recorded observation replay over real local intake with synthetic test evidence', () => {
  it('retains exact source bytes separately from a recomputable versioned derived report after restart', () => {
    const fixture = setup(), before = files();
    const store = new ObservationReplayStore(root);
    const result = store.replay(fixture.request, REPLAYED);
    expect(result.status).toBe('CREATED');
    expect(result.rawBytesIncluded).toBe(false);
    expect(result.manifest).toEqual(fixture.manifest);
    expect(result.run).toMatchObject({ schema: 'payload.recorded-observation-replay.v1', request: fixture.request,
      requestDigest: localRecordDigest(fixture.request), replayedAt: REPLAYED,
      policyAuthority: 'OPERATOR_DECLARATION', integrity: 'RECOMPUTED_LOCAL',
      computation: { schema: 'payload.recorded-observation-computation.v1', datasetId: fixture.manifest.datasetId,
        evidenceClass: 'SYNTHETIC_TEST', authority: 'LOCAL_DERIVED_INSPECTION', canonicalAdmission: false,
        earthProjectionEligible: false, sensorFusionPerformed: false, objectIdentityEstablished: false, accuracyEstablished: false } });
    expect(result.run.computation).toEqual(compileReplay(fixture.manifest));
    expect(result.run.dependencies).toHaveLength(2);
    expect(result.run.dependencies.map(({ acquisitionId, acquisitionDigest, contentDigest }) => ({ acquisitionId, acquisitionDigest, contentDigest })))
      .toEqual([fixture.request.manifest, fixture.raw]);
    expect(result.run.dependencies[0]).toMatchObject({ capturedAt: MANIFEST_CAPTURED, storedAt: MANIFEST_STORED });
    expect(result.run.dependencies[1]).toMatchObject({ capturedAt: CAPTURED, storedAt: STORED });
    for (const dependency of result.run.dependencies) {
      expect(dependency.decision).toMatchObject({ state: 'ALLOWED', evaluatedAt: REPLAYED,
        request: { purpose, operation: 'DERIVE', audience: 'INTERNAL', requestedAt: REPLAYED } });
    }
    expect(result.run.computation.rows).toHaveLength(8);
    expect(result.run.computation.rows.filter((row) => row.state === 'PLACED_ESTIMATE')).toHaveLength(4);
    expect(result.run.computation.comparisons).toHaveLength(6);
    expect(result.run.computation.comparisons.every((comparison) => comparison.accuracyEstablished === false)).toBe(true);
    expect(result.run.digest).toBe(reseal(result.run).digest);
    expect(result.run.computation.digest).toBe(reseal(result.run.computation).digest);
    expect(Buffer.from(store.intake.objects.get(fixture.raw.contentDigest)!)).toEqual(SOURCE_BYTES);
    expect(Buffer.from(store.intake.objects.get(fixture.request.manifest.contentDigest)!)).toEqual(fixture.manifestBytes);
    expect(JSON.stringify(result.run)).not.toContain(SOURCE_BYTES.toString('utf8').trim());
    for (const [name, hash] of Object.entries(before)) expect(files()[name]).toBe(hash);
    expect(Object.keys(files()).filter((name) => !Object.hasOwn(before, name))).toHaveLength(1);
    const after = files();
    expect(new ObservationReplayStore(root).inspect(fixture.request.replayId)).toEqual({ run: result.run, manifest: result.manifest, rawBytesIncluded: false });
    expect(files()).toEqual(after);
  });

  it('deduplicates repeated exact raw references without dropping their references in the source manifest', () => {
    const fixture = setup(), result = new ObservationReplayStore(root).replay(fixture.request, REPLAYED);
    expect(result.run.dependencies).toHaveLength(2);
    for (const observation of result.manifest.observations) expect(observation.rawArtifact).toEqual(fixture.raw);
    for (const calibration of result.manifest.calibrations) expect(calibration.evidence).toEqual([fixture.raw]);
    for (const pose of result.manifest.poses) expect(pose.evidence).toEqual([fixture.raw]);
  });

  it('preserves supplied clock, covariance, GNSS status and correction metadata without accuracy inference', () => {
    const fixture = setup({ change: (manifest) => {
      manifest.clocks[0].alignment!.uncertaintyNs = '10000000';
      manifest.calibrations[0].covariance6 = { convention: 'PARENT_FRAME_XYZ_METRE_ROTATION_VECTOR_RADIAN_LEFT_PERTURBATION',
        matrix: Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, column) => row === column ? 0.01 : 0)) };
      const gnss = manifest.observations.find((observation) => observation.gnss)!.gnss!;
      Object.assign(gnss, { rawSolutionStatus: 'SYNTHETIC_RECEIVER_FIXED', receiverSolution: 'RTK_FIXED', correctionService: 'synthetic-correction-service', correctionAgeNs: '1250000000' });
    } });
    const result = new ObservationReplayStore(root).replay(fixture.request, REPLAYED);
    expect(result.manifest).toEqual(fixture.manifest);
    expect(result.run.computation.rows.find((row) => row.modality === 'GNSS')).toMatchObject({ state: 'UNPLACED', worldPointM: null, uncertainty: 'NOT_PROPAGATED' });
    expect(result.run.computation.accuracyEstablished).toBe(false);
  });

  it('does not relabel operator-declared recorded data as synthetic or certify its truth', () => {
    const fixture = setup({ change: (manifest) => { manifest.evidenceClass = 'RECORDED_DATA'; } });
    const result = new ObservationReplayStore(root).replay(fixture.request, REPLAYED);
    expect(result.run.computation.evidenceClass).toBe('RECORDED_DATA');
    expect(result.run.policyAuthority).toBe('OPERATOR_DECLARATION');
    expect(result.run.computation.accuracyEstablished).toBe(false);
  });

  it('returns a verified exact retry after expiry without evaluating a new caller clock', () => {
    const fixture = setup(), created = new ObservationReplayStore(root).replay(fixture.request, REPLAYED);
    const before = files();
    const retry = new ObservationReplayStore(root).replay(fixture.request, EXPIRED);
    expect(retry).toEqual({ ...created, status: 'EXISTING' });
    expect(new ObservationReplayStore(root).replay(fixture.request, 'not-a-clock')).toEqual(retry);
    expect(files()).toEqual(before);
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay({ ...fixture.request, replayId: 'new-replay' }, EXPIRED), 'REPLAY_DERIVATION_NOT_ALLOWED');
  });

  it('inspects historical policy at the recorded replay time after wall-clock expiry', () => {
    const fixture = setup(), created = new ObservationReplayStore(root).replay(fixture.request, REPLAYED);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const before = files();
    expect(new ObservationReplayStore(root).inspect(fixture.request.replayId)?.run).toEqual(created.run);
    expect(files()).toEqual(before);
  });

  it.each(['manifest', 'raw'] as const)('requires DERIVE independently for the %s acquisition', (which) => {
    const fixture = setup({ [which === 'manifest' ? 'manifestPolicy' : 'rawPolicy']: policy({ allowedOperations: ['INGEST'] }) });
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED), 'REPLAY_DERIVATION_NOT_ALLOWED');
  });

  it.each(['manifest', 'raw'] as const)('does not substitute INGEST for approval-required DERIVE on the %s acquisition', (which) => {
    const fixture = setup({ [which === 'manifest' ? 'manifestPolicy' : 'rawPolicy']: policy({ allowedOperations: ['INGEST'], approvalRequiredOperations: ['DERIVE'] }) });
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED), 'REPLAY_DERIVATION_NOT_ALLOWED');
  });

  it('refuses a dependency whose policy permits intake for a different purpose', () => {
    const fixture = setup({ rawPolicy: policy({ permittedPurposes: ['another-internal-purpose'] }) });
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED), 'REPLAY_DERIVATION_NOT_ALLOWED');
  });

  it('refuses replay before the manifest storage clock without writing a report', () => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, MANIFEST_CAPTURED), 'REPLAY_BEFORE_STORAGE');
  });

  it('checks storage time on raw dependencies as well as the manifest', () => {
    const future = new LocalEvidenceIntake(root).capture({ schema: 'payload.local-intake-request.v1', acquisitionId: 'future-raw', evidenceId: 'future-raw:evidence',
      sourceRegistration: policy(), purpose, mediaType: 'application/octet-stream', capturedAt: CAPTURED }, SOURCE_BYTES, '2026-09-05T14:00:00.000Z').acquisition;
    const ref: ArtifactReference = { acquisitionId: 'future-raw', acquisitionDigest: future.digest, contentDigest: future.request.contentDigest };
    const manifestRef = acquire('synthetic-manifest', encodeLocalRecord(syntheticReplayManifest(ref)), policy(), true);
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(request(manifestRef), REPLAYED), 'REPLAY_BEFORE_STORAGE');
  });

  it.each(['2026-09-05T13:00:00Z', '2026-09-05T09:00:00.000-04:00', '2026-02-30T00:00:00.000Z', 'not-a-time'])('rejects a new noncanonical or invalid replay time %s', (time) => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, time));
  });

  it('refuses request id reuse with a different exact manifest without altering its existing run', () => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    const changed = structuredClone(fixture.manifest); changed.datasetId = 'another-synthetic-dataset';
    const other = acquire('another-manifest', encodeLocalRecord(changed), policy(), true);
    expectRefusalUnchanged(() => store.replay(request(other), REPLAYED), 'REPLAY_ID_CONFLICT');
  });

  it('does not create root directories when inspecting a missing replay', () => {
    expect(new ObservationReplayStore(root).inspect('missing-replay')).toBeUndefined();
    expect(existsSync(root)).toBe(false);
  });

  it('does not create root directories for a valid request whose manifest acquisition is absent', () => {
    const missing = { acquisitionId: 'missing-manifest', acquisitionDigest: `sha256:${'0'.repeat(64)}`, contentDigest: `sha256:${'0'.repeat(64)}` };
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(request(missing), REPLAYED), 'REPLAY_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expect(existsSync(root)).toBe(false);
  });

  it.each(['acquisitionDigest', 'contentDigest'] as const)('refuses a mismatching exact manifest %s', (field) => {
    const fixture = setup(); fixture.request.manifest[field] = `sha256:${'0'.repeat(64)}`;
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED), 'REPLAY_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });

  it.each(['acquisitionDigest', 'contentDigest'] as const)('refuses a mismatching exact raw-artifact %s', (field) => {
    const fixture = setup({ change: (manifest) => {
      const refs = [manifest.clocks[0].alignment!.evidence[0], manifest.observations[0].rawArtifact];
      for (const ref of refs) ref[field] = `sha256:${'0'.repeat(64)}`;
    } });
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED));
  });

  it.each(['raw', 'manifest'] as const)('refuses a missing %s acquisition on inspection and retry without repairing it', (which) => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    unlinkSync(acquisitionPath(which === 'raw' ? fixture.raw : fixture.request.manifest));
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId), 'REPLAY_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expectRefusalUnchanged(() => store.replay(fixture.request, REPLAYED), 'REPLAY_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });

  it.each(['raw', 'manifest'] as const)('refuses missing %s bytes on inspection without repairing them', (which) => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    unlinkSync(objectPath(which === 'raw' ? fixture.raw : fixture.request.manifest));
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId));
  });

  it.each(['raw', 'manifest'] as const)('refuses tampered %s bytes even when the filename is the old digest', (which) => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    writeFileSync(objectPath(which === 'raw' ? fixture.raw : fixture.request.manifest), Buffer.from('tampered bytes'));
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId), /digest/);
  });

  it('refuses rehashed acquisition metadata that no longer agrees with its retained capture', () => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    const target = acquisitionPath(fixture.raw), acquisition = JSON.parse(readFileSync(target, 'utf8')) as LocalAcquisition;
    acquisition.request.manifest.mediaType = 'application/x-tampered';
    acquisition.requestDigest = localRecordDigest(acquisition.request);
    writeFileSync(target, encodeLocalRecord(reseal(acquisition)));
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId));
  });

  it('refuses internally valid replacement acquisition metadata that differs from the pinned acquisition digest', () => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    const original = store.intake.inspect(fixture.raw.acquisitionId)!;
    const replacementRoot = join(temporary, 'replacement');
    const replacement = new LocalEvidenceIntake(replacementRoot).capture({ ...original.request.manifest,
      sourceRegistration: { ...original.request.manifest.sourceRegistration, displayName: 'Replacement declaration' } }, SOURCE_BYTES, STORED).acquisition;
    writeFileSync(acquisitionPath(fixture.raw), encodeLocalRecord(replacement));
    expect(new LocalEvidenceIntake(root).inspect(fixture.raw.acquisitionId)).toEqual(replacement);
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId), 'REPLAY_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });

  const reportChanges: Array<{ name: string; change: (run: ReplayRun) => void }> = [
    { name: 'request digest', change: (run) => { run.requestDigest = `sha256:${'0'.repeat(64)}`; } },
    { name: 'dependency source id', change: (run) => { run.dependencies[1].sourceId = 'different-source'; } },
    { name: 'dependency capture clock', change: (run) => { run.dependencies[1].capturedAt = REPLAYED; } },
    { name: 'dependency byte length', change: (run) => { run.dependencies[1].byteLength += 1; } },
    { name: 'dependency policy decision', change: (run) => { run.dependencies[1].decision.state = 'DENIED'; } },
    { name: 'dependency omission', change: (run) => { run.dependencies.pop(); } },
    { name: 'dependency ordering', change: (run) => { run.dependencies.reverse(); } },
    { name: 'method version', change: (run) => { run.computation.method = { ...run.computation.method, version: 'tampered' } as unknown as ReplayRun['computation']['method']; } },
    { name: 'derived geometry', change: (run) => { run.computation.rows.find((row) => row.worldPointM)!.worldPointM![0] += 1; run.computation = reseal(run.computation); } },
    { name: 'derived residual', change: (run) => { run.computation.comparisons[0].distanceM = 999; run.computation = reseal(run.computation); } },
    { name: 'derived row omission', change: (run) => { run.computation.rows.pop(); run.computation = reseal(run.computation); } },
    { name: 'manifest commitment', change: (run) => { run.computation.manifestDigest = `sha256:${'0'.repeat(64)}`; run.computation = reseal(run.computation); } },
  ];
  it.each(reportChanges)('refuses rehashed $name report tampering by full recomputation', ({ change }) => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED); editRun(change);
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId), 'REPLAY_HISTORY_INVALID');
    expectRefusalUnchanged(() => store.replay(fixture.request, REPLAYED), 'REPLAY_HISTORY_INVALID');
  });

  it('refuses a report digest mutation without rehashing', () => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED); editRun((run) => { run.digest = `sha256:${'0'.repeat(64)}`; }, false);
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId), 'REPLAY_HISTORY_INVALID');
  });

  it('refuses a report moved to another replay id filename', () => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    writeFileSync(runPath('another-replay'), readFileSync(runPath()));
    expectRefusalUnchanged(() => store.inspect('another-replay'), 'REPLAY_HISTORY_INVALID');
  });

  it.each(['{"schema":', 'null', '[]', '{}'])('refuses incomplete or malformed stored report %s without replacing it', (bytes) => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED); writeFileSync(runPath(), bytes);
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId));
    expectRefusalUnchanged(() => store.replay(fixture.request, REPLAYED));
  });

  it('rejects duplicate stored report JSON keys even when their values agree', () => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED);
    const bytes = readFileSync(runPath(), 'utf8');
    writeFileSync(runPath(), `{"schema":"payload.recorded-observation-replay.v1",${bytes.slice(1)}`);
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId), 'REPLAY_DUPLICATE_JSON_KEY');
  });

  it('rejects duplicate manifest JSON keys although local acquisition integrity is valid', () => {
    const fixture = setup({ bytes: (manifest) => Buffer.from(`{"datasetId":"${manifest.datasetId}",${JSON.stringify(manifest).slice(1)}`) });
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED), 'REPLAY_DUPLICATE_JSON_KEY');
  });

  it.each([Buffer.from('{broken'), Buffer.from([0xc3, 0x28]), Buffer.from('{}')])('refuses invalid retained manifest bytes %# without publishing a run', (bytes) => {
    const fixture = setup({ bytes: () => bytes });
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED));
  });

  it('bounds manifest bytes before parsing even when excess bytes are harmless JSON whitespace', () => {
    const fixture = setup({ bytes: (manifest) => Buffer.from(`${' '.repeat(MAX_REPLAY_MANIFEST_BYTES)}${JSON.stringify(manifest)}`) });
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(fixture.request, REPLAYED), 'REPLAY_JSON_SIZE');
  });

  it('bounds stored report bytes before parsing without rewriting the overlong record', () => {
    const fixture = setup(), store = new ObservationReplayStore(root);
    store.replay(fixture.request, REPLAYED); writeFileSync(runPath(), Buffer.alloc(MAX_REPLAY_REPORT_BYTES + 1, 32));
    expectRefusalUnchanged(() => store.inspect(fixture.request.replayId), /byte limit/);
  });

  it('enforces the aggregate dependency-byte bound on retained acquisitions before producing a report', () => {
    expect(MAX_REPLAY_DEPENDENCY_BYTES).toBe(64 * 1024 * 1024);
    const largeBytes = Buffer.alloc(MAX_EVIDENCE_BYTES, 42);
    const refs = Array.from({ length: 9 }, (_, index) => acquire(`large-raw-${index}`, largeBytes));
    const manifest = syntheticReplayManifest(refs[0]);
    manifest.clocks[0].alignment!.evidence = refs.slice(0, 8);
    manifest.clocks[1].alignment!.evidence = [refs[8]];
    const manifestRef = acquire('synthetic-manifest', encodeLocalRecord(manifest), policy(), true);
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(request(manifestRef), REPLAYED), 'REPLAY_DEPENDENCY_BUDGET');
  }, 30_000);

  it.each([null, [], {}, { schema: 'other' }, { schema: 'payload.recorded-observation-replay-request.v1', replayId: 'x' }, { unexpected: 'x'.repeat(65 * 1024) }])('rejects malformed or overlong requests %# before any filesystem write', (value) => {
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay(value, REPLAYED));
    expect(existsSync(root)).toBe(false);
  });

  it.each(['../escape', 'path/name', 'path\\name', '', 'a'.repeat(81), 'white space', 'x\u0000y'])('rejects unsafe replay id %s without consulting a path', (id) => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay({ ...fixture.request, replayId: id }, REPLAYED));
    expectRefusalUnchanged(() => new ObservationReplayStore(root).inspect(id), 'REPLAY_INVALID_ID');
  });

  it.each(['root', 'url', 'sourceOverride', 'approved', 'replayedAt'])('rejects request-level %s authority or path overrides', (name) => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ObservationReplayStore(root).replay({ ...fixture.request, [name]: 'caller-supplied' }, REPLAYED));
  });

  it('does not publish a run when immutable publication fails, and can retry after the failure', () => {
    const fixture = setup(), store = new ObservationReplayStore(root), before = files();
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation(() => { throw new Error('SYNTHETIC_PUBLISH_FAILURE'); });
    expect(() => store.replay(fixture.request, REPLAYED)).toThrow('SYNTHETIC_PUBLISH_FAILURE');
    expect(files()).toEqual(before); expect(store.inspect(fixture.request.replayId)).toBeUndefined();
    publish.mockRestore();
    expect(store.replay(fixture.request, REPLAYED).status).toBe('CREATED');
  });
});
