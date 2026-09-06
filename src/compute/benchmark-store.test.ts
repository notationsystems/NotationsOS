import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticScalarBenchmark } from '../../examples/compute/scalar-benchmark';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest, storageKeyFor } from '../data-os/evidence-capture';
import { MAX_EVIDENCE_BYTES } from '../data-os/file-object-store';
import { LocalEvidenceIntake, type LocalAcquisition } from '../data-os/local-intake';
import * as localFiles from '../data-os/local-files';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference } from '../observation/contract';
import { evaluateScalarBenchmark } from './benchmark';
import { benchmarkReferences, MAX_BENCHMARK_BYTES, MAX_BENCHMARK_REPORT_BYTES, type BenchmarkRequest, type ScalarBenchmark } from './benchmark-contract';
import { ScientificBenchmarkStore, type BenchmarkRun } from './benchmark-store';

const CAPTURED = '2026-09-05T12:00:00.000Z';
const STORED = '2026-09-05T12:00:01.000Z';
const MANIFEST_CAPTURED = '2026-09-05T12:00:02.000Z';
const MANIFEST_STORED = '2026-09-05T12:00:03.000Z';
const EVALUATED = '2026-09-05T13:00:00.000Z';
const EXPIRED = '2026-10-05T00:00:00.000Z';
const purpose = 'scientific-model-benchmark';
const zeroDigest = `sha256:${'0'.repeat(64)}`;
const roles = ['assumptions', 'developmentInput', 'developmentReference', 'heldOutInput', 'heldOutReference'] as const;
type Role = typeof roles[number];
type AcquisitionRole = Role | 'manifest';
const allRoles: readonly AcquisitionRole[] = [...roles, 'manifest'];
let temporary: string;
let root: string;
let network: ReturnType<typeof vi.fn>;

function policy(changes: Partial<SourceRegistration> = {}): SourceRegistration {
  return { registrationId: 'synthetic-benchmark-policy', sourceId: 'synthetic-benchmark-tests', displayName: 'Synthetic benchmark evidence',
    sourceClass: 'synthetic-test', licenseId: 'synthetic-test-operator-declaration', policyVersion: '1.0.0',
    effectiveFrom: '2026-09-05T00:00:00.000Z', effectiveUntil: EXPIRED, permittedPurposes: [purpose],
    allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' }, ...changes };
}

function acquire(id: string, bytes: Buffer, registration = policy(), manifest = false, storedAt = manifest ? MANIFEST_STORED : STORED): ArtifactReference {
  const acquisition = new LocalEvidenceIntake(root).capture({ schema: 'payload.local-intake-request.v1', acquisitionId: id, evidenceId: `${id}:evidence`,
    sourceRegistration: registration, purpose: registration.permittedPurposes[0], mediaType: manifest ? 'application/json' : 'application/octet-stream',
    capturedAt: manifest ? MANIFEST_CAPTURED : CAPTURED }, bytes, storedAt).acquisition;
  return { acquisitionId: id, acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest };
}

function request(manifest: ArtifactReference, runId = 'synthetic-benchmark'): BenchmarkRequest {
  return { schema: 'payload.scientific-benchmark-request.v1', runId, manifest };
}

function setup(options: { policies?: Partial<Record<AcquisitionRole, SourceRegistration>>; change?: (manifest: ScalarBenchmark) => void;
  bytes?: (manifest: ScalarBenchmark) => Buffer; storedAt?: Partial<Record<Role, string>> } = {}) {
  // Distinct artifacts for assumptions, development inputs/reference, and held-out inputs/reference.
  // Their bytes are deliberately synthetic declarations, never relabelled independent field measurements.
  const refs = Object.fromEntries(roles.map((role) => [role, acquire(`synthetic-${role}`,
    Buffer.from(`SYNTHETIC ANALYTIC BENCHMARK ${role}; not recorded measurements.\n`), options.policies?.[role], false, options.storedAt?.[role])])) as Record<Role, ArtifactReference>;
  const manifest = structuredClone(syntheticScalarBenchmark(refs));
  options.change?.(manifest);
  const manifestBytes = options.bytes ? options.bytes(manifest) : encodeLocalRecord(manifest, MAX_BENCHMARK_BYTES);
  const manifestRef = acquire('synthetic-manifest', manifestBytes, options.policies?.manifest, true);
  return { refs: { ...refs, manifest: manifestRef }, manifest, manifestBytes, request: request(manifestRef) };
}

function runPath(id = 'synthetic-benchmark') { return join(root, 'scientific-benchmarks', `${byteDigest(Buffer.from(id)).slice(7)}.json`); }
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
  return { ...record, digest: localRecordDigest(payload, MAX_BENCHMARK_REPORT_BYTES) };
}

function editRun(change: (run: BenchmarkRun) => void, rehash = true) {
  const run = JSON.parse(readFileSync(runPath(), 'utf8')) as BenchmarkRun;
  change(run);
  writeFileSync(runPath(), encodeLocalRecord(rehash ? reseal(run) : run, MAX_BENCHMARK_REPORT_BYTES));
}

function expectRefusalUnchanged(action: () => unknown, message?: RegExp | string) {
  const before = files();
  if (message) expect(action).toThrow(message);
  else expect(action).toThrow();
  expect(files()).toEqual(before);
}

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-scientific-benchmark-'));
  root = join(temporary, 'evidence');
  network = vi.fn(() => { throw new Error('NETWORK_FORBIDDEN_IN_LOCAL_BENCHMARK_TEST'); });
  vi.stubGlobal('fetch', network);
});

afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  const base = resolve(tmpdir()), target = resolve(temporary), within = relative(base, target);
  expect(within).toMatch(/^payload-scientific-benchmark-[^\\/]+$/);
  expect(target).not.toBe(base);
  rmSync(target, { recursive: true, force: true });
});

describe('scientific scalar benchmark on real local evidence storage and synthetic inputs', () => {
  it('retains separate source artifacts and a fully recomputable result with exact provenance across restart', () => {
    const fixture = setup(), before = files(), store = new ScientificBenchmarkStore(root);
    const result = store.run(fixture.request, EVALUATED);
    expect(result.status).toBe('CREATED');
    expect(result.rawBytesIncluded).toBe(false);
    expect(result.manifest).toEqual(fixture.manifest);
    expect(result.run).toMatchObject({ schema: 'payload.scientific-benchmark-run.v1', request: fixture.request,
      requestDigest: localRecordDigest(fixture.request), evaluatedAt: EVALUATED, policyAuthority: 'OPERATOR_DECLARATION', independentVerification: false,
      modelExecution: { evidenceClass: 'SYNTHETIC_TEST', interpretation: 'ANALYTIC_SOFTWARE_BENCHMARK_ONLY',
        canonicalAdmission: false, independentVerification: false, fieldAccuracyEstablished: false, learnedModelTrained: false,
        fullSensorFusionPerformed: false, earthProjectionEligible: false, physicalActionAuthorized: false } });
    expect(result.run.modelExecution).toEqual(evaluateScalarBenchmark(fixture.manifest));
    expect(result.run.modelExecution.cases.map((c) => c.state)).toEqual(['COMPUTED', 'COMPUTED']);
    expect(result.run.dependencies).toHaveLength(6);
    expect(new Set(result.run.dependencies.map((d) => d.contentDigest)).size).toBe(6);
    expect(result.run.dependencies.map(({ acquisitionId, acquisitionDigest, contentDigest }) => ({ acquisitionId, acquisitionDigest, contentDigest })))
      .toEqual([fixture.request.manifest, ...benchmarkReferences(fixture.manifest)]);
    expect(result.run.dependencies[0]).toMatchObject({ capturedAt: MANIFEST_CAPTURED, storedAt: MANIFEST_STORED });
    for (const dep of result.run.dependencies) {
      expect(dep.decision).toMatchObject({ state: 'ALLOWED', evaluatedAt: EVALUATED,
        request: { purpose, operation: 'DERIVE', audience: 'INTERNAL', requestedAt: EVALUATED } });
    }
    expect(new Set(result.run.dependencies.map((d) => d.decision.requestId)).size).toBe(6);
    expect(result.run.runtimeObservation).toMatchObject({ scope: 'NEW_RUN_PRE_PUBLICATION_EXCLUDES_PERSISTENCE_AND_READBACK',
      nodeVersion: process.version, platform: process.platform, architecture: process.arch, independentlyVerified: false });
    expect(result.run.runtimeObservation.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.run.digest).toBe(reseal(result.run).digest);
    expect(result.run.modelExecution.digest).toBe(reseal(result.run.modelExecution).digest);
    expect(Buffer.from(store.intake.objects.get(fixture.request.manifest.contentDigest)!)).toEqual(fixture.manifestBytes);
    for (const [name, hash] of Object.entries(before)) expect(files()[name]).toBe(hash);
    expect(Object.keys(files()).filter((name) => !Object.hasOwn(before, name))).toHaveLength(1);
    const retained = files();
    expect(new ScientificBenchmarkStore(root).inspect(fixture.request.runId)).toEqual({ run: result.run, manifest: fixture.manifest, rawBytesIncluded: false });
    expect(files()).toEqual(retained);
  });

  it('returns an exact retry after expiry without replacing runtime measurements or consulting a new caller clock', () => {
    const fixture = setup(), created = new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), before = files();
    expect(new ScientificBenchmarkStore(root).run(fixture.request, EXPIRED)).toEqual({ ...created, status: 'EXISTING' });
    expect(new ScientificBenchmarkStore(root).run(fixture.request, 'not-a-clock')).toEqual({ ...created, status: 'EXISTING' });
    expect(files()).toEqual(before);
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run({ ...fixture.request, runId: 'new-benchmark' }, EXPIRED), 'BENCHMARK_DERIVATION_NOT_ALLOWED');
  });

  it('uses original-time policy for read-only inspection after wall-clock expiry', () => {
    const fixture = setup(), created = new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), before = files();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    expect(new ScientificBenchmarkStore(root).inspect(fixture.request.runId)?.run).toEqual(created.run);
    expect(files()).toEqual(before);
  });

  it.each(allRoles)('separately requires DERIVE for %s rather than substituting its permitted INGEST', (role) => {
    const fixture = setup({ policies: { [role]: policy({ allowedOperations: ['INGEST'] }) } });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'BENCHMARK_DERIVATION_NOT_ALLOWED');
  });

  it.each(allRoles)('refuses approval-required DERIVE for %s without treating operator input as approval', (role) => {
    const fixture = setup({ policies: { [role]: policy({ allowedOperations: ['INGEST'], approvalRequiredOperations: ['DERIVE'] }) } });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'BENCHMARK_DERIVATION_NOT_ALLOWED');
  });

  it.each(allRoles)('refuses newly requested computation at the exclusive policy expiry of %s', (role) => {
    const fixture = setup({ policies: { [role]: policy({ effectiveUntil: EVALUATED }) } });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'BENCHMARK_DERIVATION_NOT_ALLOWED');
  });

  it.each(allRoles)('requires the benchmark purpose independently for %s', (role) => {
    const fixture = setup({ policies: { [role]: policy({ permittedPurposes: ['other-local-purpose'] }) } });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'BENCHMARK_DERIVATION_NOT_ALLOWED');
  });

  it('preserves unknown measurement noise and returns unresolved requirements instead of inventing variance', () => {
    const fixture = setup({ change: (m) => { m.cases[0].factors[0].varianceM2 = null; } });
    const result = new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED);
    expect(result.manifest.cases[0].factors[0].varianceM2).toBeNull();
    expect(result.run.modelExecution.cases[0]).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', blockers: ['FACTOR_VARIANCE_UNAVAILABLE'], fit: null,
      metrics: { evaluatedReferenceCount: 0, rmseM: null } });
    expect(result.run.modelExecution.cases[1].state).toBe('COMPUTED');
    expect(new ScientificBenchmarkStore(root).inspect(fixture.request.runId)?.run).toEqual(result.run);
  });

  it('preserves unknown reference noise while allowing only an unstandardized residual', () => {
    const fixture = setup({ change: (m) => { m.cases[0].references[0].varianceM2 = null; } });
    const result = new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED);
    expect(result.run.modelExecution.cases[0].comparisons[0]).toMatchObject({ predictiveResidualVarianceM2: null,
      standardizedResidual: null, uncertaintyComparison: 'REFERENCE_VARIANCE_UNAVAILABLE', independentVerification: false });
    expect(result.run.modelExecution.cases[0].comparisons[0].residualM).not.toBeNull();
  });

  it('does not certify a caller-declared recorded dataset or its interpretation', () => {
    const fixture = setup({ change: (m) => { m.evidenceClass = 'RECORDED_MEASUREMENTS'; } });
    const result = new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED);
    expect(result.run.modelExecution).toMatchObject({ evidenceClass: 'RECORDED_MEASUREMENTS', interpretation: 'DECLARED_REFERENCE_COMPARISON_ONLY',
      independentVerification: false, inputInterpretationAuthority: 'OPERATOR_DECLARATION', fieldAccuracyEstablished: false });
  });

  it('refuses computation before manifest storage without publishing a result', () => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, MANIFEST_CAPTURED), 'BENCHMARK_BEFORE_STORAGE');
  });

  it.each(roles)('also checks the storage clock of %s', (role) => {
    const fixture = setup({ storedAt: { [role]: '2026-09-05T14:00:00.000Z' } });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'BENCHMARK_BEFORE_STORAGE');
  });

  it.each(['2026-09-05T13:00:00Z', '2026-09-05T09:00:00.000-04:00', '2026-02-30T00:00:00.000Z', 'not-a-time'])('rejects invalid or noncanonical new-run time %s', (at) => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, at));
  });

  it('requires a new run identity for a different exact manifest', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED);
    const changed = structuredClone(fixture.manifest); changed.benchmarkId = 'another-benchmark';
    const other = acquire('another-manifest', encodeLocalRecord(changed), policy(), true);
    expectRefusalUnchanged(() => store.run(request(other), EVALUATED), 'BENCHMARK_ID_CONFLICT');
  });

  it('does not create directories while inspecting an absent run or requesting an absent manifest', () => {
    const store = new ScientificBenchmarkStore(root);
    expect(store.inspect('absent-run')).toBeUndefined();
    expectRefusalUnchanged(() => store.run(request({ acquisitionId: 'absent', acquisitionDigest: zeroDigest, contentDigest: zeroDigest }), EVALUATED), 'BENCHMARK_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expect(existsSync(root)).toBe(false);
  });

  it.each(['acquisitionDigest', 'contentDigest'] as const)('rejects a manifest %s that does not match its exact retained acquisition', (field) => {
    const fixture = setup(); fixture.request.manifest[field] = zeroDigest;
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'BENCHMARK_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });

  it.each(allRoles)('refuses missing %s acquisition history on inspection and retry without repair', (role) => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); unlinkSync(acquisitionPath(fixture.refs[role]));
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'BENCHMARK_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expectRefusalUnchanged(() => store.run(fixture.request, EVALUATED), 'BENCHMARK_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });

  it.each(allRoles)('refuses missing %s source bytes without recreating them', (role) => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); unlinkSync(objectPath(fixture.refs[role]));
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId));
  });

  it.each(allRoles)('refuses modified %s source bytes at their old content-addressed filename', (role) => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); writeFileSync(objectPath(fixture.refs[role]), 'modified synthetic artifact');
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), /digest/);
  });

  it('rejects rehashed acquisition policy metadata inconsistent with its preserved capture', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED);
    const target = acquisitionPath(fixture.refs.assumptions), acquired = JSON.parse(readFileSync(target, 'utf8')) as LocalAcquisition;
    acquired.request.manifest.sourceRegistration.allowedOperations = ['INGEST'];
    acquired.requestDigest = localRecordDigest(acquired.request);
    writeFileSync(target, encodeLocalRecord(reseal(acquired)));
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId));
  });

  it('refuses even internally consistent replacement source declarations when the exact acquisition digest differs', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED);
    const ref = fixture.refs.developmentInput, original = store.intake.inspect(ref.acquisitionId)!;
    const replacement = new LocalEvidenceIntake(join(temporary, 'replacement')).capture({ ...original.request.manifest,
      sourceRegistration: { ...original.request.manifest.sourceRegistration, displayName: 'Changed operator declaration' } }, readFileSync(objectPath(ref)), STORED).acquisition;
    writeFileSync(acquisitionPath(ref), encodeLocalRecord(replacement));
    expect(store.intake.inspect(ref.acquisitionId)).toEqual(replacement);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'BENCHMARK_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });

  const tampering: Array<{ name: string; change: (run: BenchmarkRun) => void }> = [
    { name: 'request digest', change: (r) => { r.requestDigest = zeroDigest; } },
    { name: 'dependency acquisition digest', change: (r) => { r.dependencies[1].acquisitionDigest = zeroDigest; } },
    { name: 'dependency content digest', change: (r) => { r.dependencies[1].contentDigest = zeroDigest; } },
    { name: 'dependency byte length', change: (r) => { r.dependencies[1].byteLength++; } },
    { name: 'dependency capture clock', change: (r) => { r.dependencies[1].capturedAt = EVALUATED; } },
    { name: 'dependency storage clock', change: (r) => { r.dependencies[1].storedAt = EVALUATED; } },
    { name: 'dependency decision', change: (r) => { r.dependencies[1].decision.state = 'DENIED'; } },
    { name: 'dependency decision time', change: (r) => { r.dependencies[1].decision.evaluatedAt = EXPIRED; } },
    { name: 'dependency omission', change: (r) => { r.dependencies.pop(); } },
    { name: 'dependency order', change: (r) => { r.dependencies.reverse(); } },
    { name: 'model commitment', change: (r) => { r.modelExecution.modelDigest = zeroDigest; r.modelExecution = reseal(r.modelExecution); } },
    { name: 'manifest commitment', change: (r) => { r.modelExecution.manifestDigest = zeroDigest; r.modelExecution = reseal(r.modelExecution); } },
    { name: 'derived state', change: (r) => { r.modelExecution.cases[0].fit!.states[0].meanM += 1; r.modelExecution = reseal(r.modelExecution); } },
    { name: 'derived covariance', change: (r) => { r.modelExecution.cases[0].fit!.covarianceM2[0][0] += 1; r.modelExecution = reseal(r.modelExecution); } },
    { name: 'comparison residual', change: (r) => { r.modelExecution.cases[0].comparisons[0].residualM = 9; r.modelExecution = reseal(r.modelExecution); } },
    { name: 'held-out aggregate', change: (r) => { r.modelExecution.summary[1].rmseM = 0; r.modelExecution = reseal(r.modelExecution); } },
    { name: 'case omission', change: (r) => { r.modelExecution.cases.pop(); r.modelExecution = reseal(r.modelExecution); } },
  ];
  it.each(tampering)('refuses rehashed $name through full evidence and numerical recomputation', ({ change }) => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); editRun(change);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'BENCHMARK_HISTORY_INVALID');
    expectRefusalUnchanged(() => store.run(fixture.request, EVALUATED), 'BENCHMARK_HISTORY_INVALID');
  });

  it('rejects an un-rehashed runtime change as digest corruption', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); editRun((r) => { r.runtimeObservation.elapsedMs += 1; }, false);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'BENCHMARK_HISTORY_INVALID');
  });

  it('honestly retains a valid rehashed runtime observation without calling it independently verified', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root), original = store.run(fixture.request, EVALUATED);
    editRun((r) => { r.runtimeObservation.elapsedMs = 123; });
    const before = files(), inspected = store.inspect(fixture.request.runId)!;
    expect(inspected.run.runtimeObservation).toMatchObject({ elapsedMs: 123, independentlyVerified: false });
    expect(inspected.run.modelExecution).toEqual(original.run.modelExecution);
    expect(inspected.run.digest).not.toBe(original.run.digest);
    expect(files()).toEqual(before);
  });

  it.each([-1, 600_001])('refuses a rehashed out-of-contract elapsed runtime %s', (elapsed) => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); editRun((r) => { r.runtimeObservation.elapsedMs = elapsed; });
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId));
  });

  it('rejects timing promoted into independent verification even if rehashed', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); editRun((r) => { Object.assign(r.runtimeObservation, { independentlyVerified: true }); });
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId));
  });

  it('rejects a report copied under a different run identity without rewriting it', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); writeFileSync(runPath('another-run'), readFileSync(runPath()));
    expectRefusalUnchanged(() => store.inspect('another-run'), 'BENCHMARK_HISTORY_INVALID');
  });

  it.each(['{"schema":', 'null', '[]', '{}'])('preserves malformed stored report %s and refuses inspection and retry', (bytes) => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); writeFileSync(runPath(), bytes);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId));
    expectRefusalUnchanged(() => store.run(fixture.request, EVALUATED));
  });

  it('rejects duplicate report JSON fields even when their values agree', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED);
    const text = readFileSync(runPath(), 'utf8');
    writeFileSync(runPath(), `{"schema":"payload.scientific-benchmark-run.v1",${text.slice(1)}`);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'REPLAY_DUPLICATE_JSON_KEY');
  });

  it('rejects duplicate manifest keys despite valid intake integrity', () => {
    const fixture = setup({ bytes: (m) => Buffer.from(`{"benchmarkId":"${m.benchmarkId}",${JSON.stringify(m).slice(1)}`) });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'REPLAY_DUPLICATE_JSON_KEY');
  });

  it.each([Buffer.from('{broken'), Buffer.from([0xc3, 0x28]), Buffer.from('{}')])('refuses malformed retained manifest %# without publishing a run', (bytes) => {
    const fixture = setup({ bytes: () => bytes });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED));
  });

  it('bounds manifest bytes before parsing, including excessive whitespace', () => {
    const fixture = setup({ bytes: (m) => Buffer.from(`${' '.repeat(MAX_BENCHMARK_BYTES)}${JSON.stringify(m)}`) });
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(fixture.request, EVALUATED), 'REPLAY_JSON_SIZE');
  });

  it('bounds stored report bytes and preserves an oversized record for operator inspection', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root);
    store.run(fixture.request, EVALUATED); writeFileSync(runPath(), Buffer.alloc(MAX_BENCHMARK_REPORT_BYTES + 1, 32));
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), /byte limit/);
  });

  it('bounds aggregate retained dependency bytes even when every individual artifact is within intake limits', () => {
    const fixture = setup();
    for (let index = 0; index < 8; index++) {
      const bytes = Buffer.alloc(MAX_EVIDENCE_BYTES, index + 1);
      const evidence = acquire(`large-input-${index}`, bytes);
      fixture.manifest.cases[0].factors.push({ id: `large-factor-${index}`, kind: 'ABSOLUTE', stateId: 'x0', meanM: 0,
        varianceM2: 1, evidence, measurementId: `large-measurement-${index}` });
    }
    const manifestRef = acquire('large-manifest', encodeLocalRecord(fixture.manifest, MAX_BENCHMARK_BYTES), policy(), true);
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(request(manifestRef), EVALUATED), 'BENCHMARK_DEPENDENCY_BUDGET');
  }, 30_000);

  it.each([null, [], {}, { schema: 'other' }, { schema: 'payload.scientific-benchmark-request.v1', runId: 'x' }, { unexpected: 'x'.repeat(65 * 1024) }])('rejects invalid or oversized request %# without creating root directories', (value) => {
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run(value, EVALUATED));
    expect(existsSync(root)).toBe(false);
  });

  it.each(['../escape', 'path/name', 'path\\name', '', 'a'.repeat(81), 'white space', 'x\u0000y'])('rejects unsafe run id %s without path access', (id) => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run({ ...fixture.request, runId: id }, EVALUATED));
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).inspect(id), 'BENCHMARK_INVALID_ID');
  });

  it.each(['root', 'url', 'approved', 'model', 'program', 'evaluatedAt'])('refuses caller %s overrides on the closed request', (name) => {
    const fixture = setup();
    expectRefusalUnchanged(() => new ScientificBenchmarkStore(root).run({ ...fixture.request, [name]: 'caller-value' }, EVALUATED));
  });

  it('preserves source history after publication failure and allows a later deliberate retry', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root), before = files();
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation(() => { throw new Error('SYNTHETIC_PUBLICATION_FAILURE'); });
    expect(() => store.run(fixture.request, EVALUATED)).toThrow('SYNTHETIC_PUBLICATION_FAILURE');
    expect(files()).toEqual(before); expect(store.inspect(fixture.request.runId)).toBeUndefined();
    publish.mockRestore();
    expect(store.run(fixture.request, EVALUATED).status).toBe('CREATED');
  });

  it('returns a concurrently published identical request with its original runtime observation', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root), publish = localFiles.publishImmutableFile;
    let winner: ReturnType<ScientificBenchmarkStore['run']> | undefined;
    let entered = false;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      if (!entered) {
        entered = true;
        winner = new ScientificBenchmarkStore(root).run(fixture.request, '2026-09-05T13:00:01.000Z');
      }
      return publish(...args);
    });
    const result = store.run(fixture.request, EVALUATED);
    expect(result.status).toBe('EXISTING');
    expect(result.run).toEqual(winner!.run);
    expect(result.run.evaluatedAt).toBe('2026-09-05T13:00:01.000Z');
  });

  it('preserves a confirmed publication when an error follows publication and discovers the identical winner', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root), publish = localFiles.publishImmutableFile;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      publish(...args);
      throw new Error('SYNTHETIC_POST_PUBLICATION_FAILURE');
    });
    const result = store.run(fixture.request, EVALUATED);
    expect(result.status).toBe('EXISTING');
    expect(store.inspect(fixture.request.runId)?.run).toEqual(result.run);
  });

  it('reports unconfirmed readback without deleting publication and recovers it on inspection before retry', () => {
    const fixture = setup(), store = new ScientificBenchmarkStore(root), read = localFiles.readImmutableFile;
    const spy = vi.spyOn(localFiles, 'readImmutableFile').mockImplementation((...args) => {
      if (args[1][0] === 'scientific-benchmarks' && existsSync(runPath())) return undefined;
      return read(...args);
    });
    expect(() => store.run(fixture.request, EVALUATED)).toThrow('BENCHMARK_SAVE_UNCONFIRMED');
    expect(existsSync(runPath())).toBe(true);
    const retained = files(); spy.mockRestore();
    const inspected = store.inspect(fixture.request.runId)!;
    expect(store.run(fixture.request, EVALUATED)).toEqual({ ...inspected, status: 'EXISTING' });
    expect(files()).toEqual(retained);
  });
});
