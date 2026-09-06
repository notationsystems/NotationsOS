import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest, storageKeyFor } from '../data-os/evidence-capture';
import { MAX_EVIDENCE_BYTES } from '../data-os/file-object-store';
import { LocalEvidenceIntake, type LocalAcquisition } from '../data-os/local-intake';
import * as localFiles from '../data-os/local-files';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference } from '../observation/contract';
import { evaluateRegistrationAccess } from './registration-access';
import { MAX_REGISTRATION_MANIFEST_BYTES, MAX_REGISTRATION_RUN_BYTES, registrationAccessReferences,
  type RegistrationAccessExperiment, type RegistrationAccessRequest } from './registration-access-contract';
import { runRegistrationAccessDemo, syntheticRegistrationAccess } from './registration-access-demo';
import { RegistrationAccessStore, type RegistrationAccessRun } from './registration-access-store';

const CAPTURED = '2026-09-05T12:00:00.000Z';
const STORED = '2026-09-05T12:00:01.000Z';
const MANIFEST_CAPTURED = '2026-09-05T12:00:02.000Z';
const MANIFEST_STORED = '2026-09-05T12:00:03.000Z';
const EVALUATED = '2026-09-05T13:00:00.000Z';
const EXPIRED = '2026-10-05T00:00:00.000Z';
const purpose = 'spatial-registration-access';
const zeroDigest = `sha256:${'0'.repeat(64)}`;
const roles = ['geometry', 'controls', 'checks', 'graph', 'assumptions'] as const;
type Role = typeof roles[number];
type AcquisitionRole = Role | 'manifest';
const allRoles: readonly AcquisitionRole[] = [...roles, 'manifest'];
let temporary: string, root: string;
let network: ReturnType<typeof vi.fn>;

function policy(changes: Partial<SourceRegistration> = {}): SourceRegistration {
  return { registrationId: 'synthetic-spatial-policy', sourceId: 'synthetic-spatial-tests', displayName: 'Synthetic spatial evidence',
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
function request(manifest: ArtifactReference, runId = 'synthetic-spatial'): RegistrationAccessRequest {
  return { schema: 'payload.registration-access-request.v1', runId, manifest };
}
function setup(options: { policies?: Partial<Record<AcquisitionRole, SourceRegistration>>; change?: (manifest: RegistrationAccessExperiment) => void;
  bytes?: (manifest: RegistrationAccessExperiment) => Buffer; storedAt?: Partial<Record<Role, string>> } = {}) {
  const refs = Object.fromEntries(roles.map((role) => [role, acquire(`synthetic-${role}`,
    Buffer.from(`SYNTHETIC SPATIAL TEST ${role}; not physical measurements.\n`), options.policies?.[role], false, options.storedAt?.[role])])) as Record<Role, ArtifactReference>;
  const manifest = syntheticRegistrationAccess(refs);
  options.change?.(manifest);
  const manifestBytes = options.bytes ? options.bytes(manifest) : encodeLocalRecord(manifest, MAX_REGISTRATION_MANIFEST_BYTES);
  const manifestRef = acquire('synthetic-manifest', manifestBytes, options.policies?.manifest, true);
  return { refs: { ...refs, manifest: manifestRef }, manifest, manifestBytes, request: request(manifestRef) };
}
function runPath(id = 'synthetic-spatial') { return join(root, 'registration-access', `${byteDigest(Buffer.from(id)).slice(7)}.json`); }
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
  return { ...record, digest: localRecordDigest(payload, MAX_REGISTRATION_RUN_BYTES) };
}
function editRun(change: (run: RegistrationAccessRun) => void, rehash = true) {
  const run = JSON.parse(readFileSync(runPath(), 'utf8')) as RegistrationAccessRun;
  change(run);
  writeFileSync(runPath(), encodeLocalRecord(rehash ? reseal(run) : run, MAX_REGISTRATION_RUN_BYTES));
}
function expectRefusalUnchanged(action: () => unknown, message?: RegExp | string) {
  const before = files();
  if (message) expect(action).toThrow(message); else expect(action).toThrow();
  expect(files()).toEqual(before);
}
beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-spatial-store-')); root = join(temporary, 'evidence');
  network = vi.fn(() => { throw new Error('NETWORK_FORBIDDEN_IN_LOCAL_SPATIAL_TEST'); }); vi.stubGlobal('fetch', network);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  const base = resolve(tmpdir()), target = resolve(temporary), within = relative(base, target);
  expect(within).toMatch(/^payload-spatial-store-[^\\/]+$/); expect(target).not.toBe(base);
  rmSync(target, { recursive: true, force: true });
});

describe('evidence-bound registration and access local persistence', () => {
  it('retains exact dependencies and recomputes the full source-to-fit-to-check-to-access path across reopen', () => {
    const fixture = setup(), before = files(), store = new RegistrationAccessStore(root);
    const result = store.run(fixture.request, EVALUATED);
    expect(result.status).toBe('CREATED'); expect(result.rawBytesIncluded).toBe(false);
    expect(result.manifest).toEqual(fixture.manifest);
    expect(result.run).toMatchObject({ schema: 'payload.registration-access-run.v1', request: fixture.request,
      requestDigest: localRecordDigest(fixture.request), evaluatedAt: EVALUATED, policyAuthority: 'OPERATOR_DECLARATION', independentVerification: false,
      result: { evidenceClass: 'SYNTHETIC_TEST', registration: { state: 'COMPUTED' }, claims: { canonicalAdmission: false, fieldAccuracyEstablished: false } } });
    expect(result.run.result).toEqual(evaluateRegistrationAccess(fixture.manifest));
    expect(result.run.result.registration.checkPointRmseM!).toBeGreaterThan(result.run.result.registration.fittingRmseM!);
    expect(result.run.dependencies).toHaveLength(6);
    expect(new Set(result.run.dependencies.map((d) => d.contentDigest)).size).toBe(6);
    expect(result.run.dependencies.map(({ acquisitionId, acquisitionDigest, contentDigest }) => ({ acquisitionId, acquisitionDigest, contentDigest })))
      .toEqual([fixture.request.manifest, ...registrationAccessReferences(fixture.manifest)]);
    expect(result.run.dependencies[0]).toMatchObject({ capturedAt: MANIFEST_CAPTURED, storedAt: MANIFEST_STORED });
    for (const dependency of result.run.dependencies) expect(dependency.decision).toMatchObject({ state: 'ALLOWED', evaluatedAt: EVALUATED,
      request: { purpose, operation: 'DERIVE', audience: 'INTERNAL', requestedAt: EVALUATED } });
    expect(new Set(result.run.dependencies.map((d) => d.decision.requestId)).size).toBe(6);
    expect(result.run.digest).toBe(reseal(result.run).digest); expect(result.run.result.digest).toBe(reseal(result.run.result).digest);
    expect(Buffer.from(store.intake.objects.get(fixture.request.manifest.contentDigest)!)).toEqual(fixture.manifestBytes);
    for (const [name, hash] of Object.entries(before)) expect(files()[name]).toBe(hash);
    expect(Object.keys(files()).filter((name) => !Object.hasOwn(before, name))).toHaveLength(1);
    const retained = files();
    expect(new RegistrationAccessStore(root).inspect(fixture.request.runId)).toEqual({ run: result.run, manifest: fixture.manifest, rawBytesIncluded: false });
    expect(files()).toEqual(retained);
  });
  it('retains the actual synthetic demo as 13 files with read-only retries and no other instrument stores', () => {
    const created = runRegistrationAccessDemo(root, EVALUATED), before = files();
    expect(Object.keys(before)).toHaveLength(13);
    expect(readdirSync(root).sort()).toEqual(['acquisitions', 'objects', 'registration-access']);
    expect(runRegistrationAccessDemo(root, EXPIRED)).toEqual({ ...created, status: 'EXISTING' });
    expect(new RegistrationAccessStore(root).inspect(created.run.request.runId)?.run).toEqual(created.run);
    expect(files()).toEqual(before);
  });
  it('returns an exact historical retry after expiry without granting a new run or using a new caller clock', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root), created = store.run(fixture.request, EVALUATED), before = files();
    expect(store.run(fixture.request, EXPIRED)).toEqual({ ...created, status: 'EXISTING' });
    expect(store.run(fixture.request, 'not-a-clock')).toEqual({ ...created, status: 'EXISTING' });
    expect(files()).toEqual(before);
    expectRefusalUnchanged(() => store.run({ ...fixture.request, runId: 'expired-new-run' }, EXPIRED), 'SPATIAL_DERIVATION_NOT_ALLOWED');
  });
  it('inspects historical policy under its original time after wall-clock expiry', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root), created = store.run(fixture.request, EVALUATED), before = files();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    expect(store.inspect(fixture.request.runId)?.run).toEqual(created.run); expect(files()).toEqual(before);
  });
  it.each(allRoles)('separately requires DERIVE for %s, not its INGEST grant', (role) => {
    const fixture = setup({ policies: { [role]: policy({ allowedOperations: ['INGEST'] }) } });
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'SPATIAL_DERIVATION_NOT_ALLOWED');
  });
  it.each(allRoles)('refuses approval-required DERIVE for %s without operator-input-as-approval', (role) => {
    const fixture = setup({ policies: { [role]: policy({ allowedOperations: ['INGEST'], approvalRequiredOperations: ['DERIVE'] }) } });
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'SPATIAL_DERIVATION_NOT_ALLOWED');
  });
  it.each(allRoles)('requires the exact spatial purpose on %s rather than a replay grant', (role) => {
    const fixture = setup({ policies: { [role]: policy({ permittedPurposes: ['recorded-observation-replay'] }) } });
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'SPATIAL_DERIVATION_NOT_ALLOWED');
  });
  it.each(allRoles)('refuses a new run at the exclusive source-policy expiry of %s', (role) => {
    const fixture = setup({ policies: { [role]: policy({ effectiveUntil: EVALUATED }) } });
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'SPATIAL_DERIVATION_NOT_ALLOWED');
  });
  it('retains missing control noise as inspectable unresolved requirements without filling it', () => {
    const fixture = setup({ change: (m) => { m.controls[0].varianceM2 = null; } });
    const result = new RegistrationAccessStore(root).run(fixture.request, EVALUATED);
    expect(result.manifest.controls[0].varianceM2).toBeNull();
    expect(result.run.result.registration).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', fit: null, blockers: ['CONTROL_VARIANCE_UNAVAILABLE'], comparisons: [] });
    expect(result.run.result.registeredNodes).toBeNull();
    expect(new RegistrationAccessStore(root).inspect(fixture.request.runId)?.run).toEqual(result.run);
  });
  it('retains unstandardized check residuals when check uncertainty is unavailable', () => {
    const fixture = setup({ change: (m) => { m.checkPoints[0].varianceM2 = null; } });
    const result = new RegistrationAccessStore(root).run(fixture.request, EVALUATED);
    expect(result.run.result.registration.comparisons[0]).toMatchObject({ predictiveResidualCovariance: null,
      marginalStandardizedResidual: null, uncertaintyState: 'CHECK_POINT_VARIANCE_UNAVAILABLE' });
    expect(result.run.result.registration.comparisons[0].distanceM).toBeGreaterThan(0);
  });
  it('retains a recorded-class declaration without certifying physical observations or field accuracy', () => {
    const fixture = setup({ change: (m) => { m.evidenceClass = 'RECORDED_MEASUREMENTS'; } });
    const result = new RegistrationAccessStore(root).run(fixture.request, EVALUATED);
    expect(result.run.result).toMatchObject({ evidenceClass: 'RECORDED_MEASUREMENTS', interpretationAuthority: 'OPERATOR_DECLARATION',
      claims: { independentVerification: false, fieldAccuracyEstablished: false, canonicalAdmission: false } });
  });
  it('refuses a run before manifest storage without publishing a report', () => {
    const fixture = setup(); expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, MANIFEST_CAPTURED), 'SPATIAL_BEFORE_STORAGE');
  });
  it.each(roles)('checks the storage time of %s too', (role) => {
    const fixture = setup({ storedAt: { [role]: '2026-09-05T14:00:00.000Z' } });
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'SPATIAL_BEFORE_STORAGE');
  });
  it.each(['2026-09-05T13:00:00Z', '2026-09-05T09:00:00.000-04:00', '2026-02-30T00:00:00.000Z', 'not-a-time'])('rejects invalid or noncanonical evaluation clock %s', (time) => {
    const fixture = setup(); expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, time));
  });
  it('requires a new run ID for a different exact manifest', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    const changed = structuredClone(fixture.manifest); changed.experimentId = 'another-experiment';
    const other = acquire('another-manifest', encodeLocalRecord(changed), policy(), true);
    expectRefusalUnchanged(() => store.run(request(other), EVALUATED), 'SPATIAL_ID_CONFLICT');
  });
  it('does not create directories while inspecting an absent run or requesting missing evidence', () => {
    const store = new RegistrationAccessStore(root); expect(store.inspect('absent-run')).toBeUndefined();
    expectRefusalUnchanged(() => store.run(request({ acquisitionId: 'absent', acquisitionDigest: zeroDigest, contentDigest: zeroDigest }), EVALUATED), 'SPATIAL_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expect(existsSync(root)).toBe(false);
  });
  it.each(['acquisitionDigest', 'contentDigest'] as const)('checks the manifest exact %s', (field) => {
    const fixture = setup(); fixture.request.manifest[field] = zeroDigest;
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'SPATIAL_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });
  it.each(allRoles)('refuses missing %s acquisition history on inspection and retry without repair', (role) => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    unlinkSync(acquisitionPath(fixture.refs[role]));
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'SPATIAL_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expectRefusalUnchanged(() => store.run(fixture.request, EVALUATED), 'SPATIAL_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });
  it.each(allRoles)('refuses missing %s source bytes without recreating them', (role) => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    unlinkSync(objectPath(fixture.refs[role])); expectRefusalUnchanged(() => store.inspect(fixture.request.runId));
  });
  it.each(allRoles)('refuses modified %s source bytes at the old content-addressed path', (role) => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    writeFileSync(objectPath(fixture.refs[role]), 'modified synthetic artifact'); expectRefusalUnchanged(() => store.inspect(fixture.request.runId), /digest/);
  });
  it('refuses rehashed acquisition policy inconsistent with its preserved capture', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    const target = acquisitionPath(fixture.refs.assumptions), acquired = JSON.parse(readFileSync(target, 'utf8')) as LocalAcquisition;
    acquired.request.manifest.sourceRegistration.allowedOperations = ['INGEST']; acquired.requestDigest = localRecordDigest(acquired.request);
    writeFileSync(target, encodeLocalRecord(reseal(acquired))); expectRefusalUnchanged(() => store.inspect(fixture.request.runId));
  });
  it('refuses consistent replacement source declarations whose exact acquisition digest changed', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    const ref = fixture.refs.controls, original = store.intake.inspect(ref.acquisitionId)!;
    const replacement = new LocalEvidenceIntake(join(temporary, 'replacement')).capture({ ...original.request.manifest,
      sourceRegistration: { ...original.request.manifest.sourceRegistration, displayName: 'Changed operator declaration' } }, readFileSync(objectPath(ref)), STORED).acquisition;
    writeFileSync(acquisitionPath(ref), encodeLocalRecord(replacement)); expect(store.intake.inspect(ref.acquisitionId)).toEqual(replacement);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'SPATIAL_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });
  const tampering: Array<{ name: string; change: (run: RegistrationAccessRun) => void }> = [
    { name: 'request digest', change: (r) => { r.requestDigest = zeroDigest; } },
    { name: 'dependency acquisition digest', change: (r) => { r.dependencies[1].acquisitionDigest = zeroDigest; } },
    { name: 'dependency content digest', change: (r) => { r.dependencies[1].contentDigest = zeroDigest; } },
    { name: 'dependency byte count', change: (r) => { r.dependencies[1].byteLength++; } },
    { name: 'dependency capture clock', change: (r) => { r.dependencies[1].capturedAt = EVALUATED; } },
    { name: 'dependency storage clock', change: (r) => { r.dependencies[1].storedAt = EVALUATED; } },
    { name: 'dependency decision', change: (r) => { r.dependencies[1].decision.state = 'DENIED'; } },
    { name: 'dependency purpose', change: (r) => { Object.assign(r.dependencies[1].decision.request, { purpose: 'other' }); } },
    { name: 'dependency omission', change: (r) => { r.dependencies.pop(); } },
    { name: 'dependency order', change: (r) => { r.dependencies.reverse(); } },
    { name: 'method version', change: (r) => { r.result.method.version = '99.0'; r.result = reseal(r.result); } },
    { name: 'manifest commitment', change: (r) => { r.result.manifestDigest = zeroDigest; r.result = reseal(r.result); } },
    { name: 'translation', change: (r) => { r.result.registration.fit!.transform.translationM[0] += 1; r.result = reseal(r.result); } },
    { name: 'quaternion', change: (r) => { r.result.registration.fit!.transform.rotationXyzw[0] += 1; r.result = reseal(r.result); } },
    { name: 'covariance', change: (r) => { r.result.registration.fit!.covariance[0][0] += 1; r.result = reseal(r.result); } },
    { name: 'fit residual', change: (r) => { r.result.registration.fit!.residuals[0].residualM[0] += 1; r.result = reseal(r.result); } },
    { name: 'fitting aggregate', change: (r) => { r.result.registration.fittingRmseM = 0; r.result = reseal(r.result); } },
    { name: 'check aggregate', change: (r) => { r.result.registration.checkPointRmseM = 0; r.result = reseal(r.result); } },
    { name: 'check residual', change: (r) => { r.result.registration.comparisons[0].residualM[0] = 99; r.result = reseal(r.result); } },
    { name: 'check covariance', change: (r) => { r.result.registration.comparisons[0].predictiveResidualCovariance![0][0] += 1; r.result = reseal(r.result); } },
    { name: 'registered node', change: (r) => { r.result.registeredNodes![0].positionM[0] += 1; r.result = reseal(r.result); } },
    { name: 'independent verification claim', change: (r) => { Object.assign(r.result.claims, { independentVerification: true }); r.result = reseal(r.result); } },
    { name: 'independent run verification claim', change: (r) => { Object.assign(r, { independentVerification: true }); } },
  ];
  it.each(tampering)('rejects rehashed $name using full evidence/algorithm recomputation', ({ change }) => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED); editRun(change);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'SPATIAL_HISTORY_INVALID');
    expectRefusalUnchanged(() => store.run(fixture.request, EVALUATED), 'SPATIAL_HISTORY_INVALID');
  });
  it('refuses a run with corrupted digest and preserves the bad record', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    editRun((r) => { r.digest = zeroDigest; }, false); expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'SPATIAL_HISTORY_INVALID');
  });
  it('refuses a record copied under another run ID', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    writeFileSync(runPath('another-run'), readFileSync(runPath())); expectRefusalUnchanged(() => store.inspect('another-run'), 'SPATIAL_HISTORY_INVALID');
  });
  it.each(['{"schema":', 'null', '[]', '{}'])('preserves malformed retained report %s without repair', (bytes) => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED); writeFileSync(runPath(), bytes);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId)); expectRefusalUnchanged(() => store.run(fixture.request, EVALUATED));
  });
  it('rejects duplicate report keys even when their values agree', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    const text = readFileSync(runPath(), 'utf8'); writeFileSync(runPath(), `{"schema":"payload.registration-access-run.v1",${text.slice(1)}`);
    expectRefusalUnchanged(() => store.inspect(fixture.request.runId), 'REPLAY_DUPLICATE_JSON_KEY');
  });
  it('rejects duplicate manifest keys despite valid acquisition integrity', () => {
    const fixture = setup({ bytes: (m) => Buffer.from(`{"experimentId":"${m.experimentId}",${JSON.stringify(m).slice(1)}`) });
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'REPLAY_DUPLICATE_JSON_KEY');
  });
  it.each([Buffer.from('{broken'), Buffer.from([0xc3, 0x28]), Buffer.from('{}')])('refuses malformed retained manifest %#', (bytes) => {
    const fixture = setup({ bytes: () => bytes }); expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED));
  });
  it('bounds manifest bytes before parsing even for otherwise harmless whitespace', () => {
    const fixture = setup({ bytes: (m) => Buffer.from(`${' '.repeat(MAX_REGISTRATION_MANIFEST_BYTES)}${JSON.stringify(m)}`) });
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(fixture.request, EVALUATED), 'REPLAY_JSON_SIZE');
  });
  it('bounds stored report bytes without deleting oversized history', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root); store.run(fixture.request, EVALUATED);
    writeFileSync(runPath(), Buffer.alloc(MAX_REGISTRATION_RUN_BYTES + 1, 32)); expectRefusalUnchanged(() => store.inspect(fixture.request.runId), /byte limit/);
  });
  it('bounds aggregate retained dependency bytes even when each artifact meets intake limits', () => {
    const fixture = setup();
    for (let index = 0; index < 8; index++) {
      const evidence = acquire(`large-control-${index}`, Buffer.alloc(MAX_EVIDENCE_BYTES, index + 1));
      fixture.manifest.controls.push({ ...fixture.manifest.controls[index % 4], id: `large-control-${index}`, evidence, measurementId: `large-reading-${index}` });
    }
    const manifestRef = acquire('large-manifest', encodeLocalRecord(fixture.manifest, MAX_REGISTRATION_MANIFEST_BYTES), policy(), true);
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(request(manifestRef), EVALUATED), 'SPATIAL_DEPENDENCY_BUDGET');
  }, 30_000);
  it.each([null, [], {}, { schema: 'other' }, { schema: 'payload.registration-access-request.v1', runId: 'x' }, { unexpected: 'x'.repeat(65 * 1024) }])('refuses invalid/oversized request %# without creating directories', (value) => {
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).run(value, EVALUATED)); expect(existsSync(root)).toBe(false);
  });
  it.each(['../escape', 'path/name', 'path\\name', '', 'a'.repeat(81), 'white space', 'x\u0000y'])('refuses unsafe run ID %s before path access', (id) => {
    const fixture = setup(); expectRefusalUnchanged(() => new RegistrationAccessStore(root).run({ ...fixture.request, runId: id }, EVALUATED));
    expectRefusalUnchanged(() => new RegistrationAccessStore(root).inspect(id), 'SPATIAL_INVALID_ID');
  });
  it.each(['root', 'url', 'approved', 'model', 'program', 'evaluatedAt', 'loss', 'distanceMetric'])('rejects unrecognized request override %s', (field) => {
    const fixture = setup(); expectRefusalUnchanged(() => new RegistrationAccessStore(root).run({ ...fixture.request, [field]: 'override' }, EVALUATED));
  });
  it('preserves source history on publication failure and permits a later deliberate retry', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root), before = files();
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation(() => { throw new Error('SYNTHETIC_PUBLICATION_FAILURE'); });
    expect(() => store.run(fixture.request, EVALUATED)).toThrow('SYNTHETIC_PUBLICATION_FAILURE');
    expect(files()).toEqual(before); expect(store.inspect(fixture.request.runId)).toBeUndefined(); publish.mockRestore();
    expect(store.run(fixture.request, EVALUATED).status).toBe('CREATED');
  });
  it('finds a concurrent identical request winner without replacing its earlier run clock', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root), publish = localFiles.publishImmutableFile;
    let winner: ReturnType<RegistrationAccessStore['run']> | undefined, entered = false;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      if (!entered) { entered = true; winner = new RegistrationAccessStore(root).run(fixture.request, '2026-09-05T13:00:01.000Z'); }
      return publish(...args);
    });
    const result = store.run(fixture.request, EVALUATED); expect(result.status).toBe('EXISTING'); expect(result.run).toEqual(winner!.run);
    expect(result.run.evaluatedAt).toBe('2026-09-05T13:00:01.000Z');
  });
  it('discovers a durable identical publication even when publication subsequently reports an error', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root), publish = localFiles.publishImmutableFile;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => { publish(...args); throw new Error('POST_PUBLICATION_FAILURE'); });
    const result = store.run(fixture.request, EVALUATED); expect(result.status).toBe('EXISTING'); expect(store.inspect(fixture.request.runId)?.run).toEqual(result.run);
  });
  it('reports unconfirmed readback without deleting the publication, then reopens before retrying', () => {
    const fixture = setup(), store = new RegistrationAccessStore(root), read = localFiles.readImmutableFile;
    const spy = vi.spyOn(localFiles, 'readImmutableFile').mockImplementation((...args) => {
      if (args[1][0] === 'registration-access' && existsSync(runPath())) return undefined;
      return read(...args);
    });
    expect(() => store.run(fixture.request, EVALUATED)).toThrow('SPATIAL_SAVE_UNCONFIRMED'); expect(existsSync(runPath())).toBe(true);
    const retained = files(); spy.mockRestore(); const inspected = store.inspect(fixture.request.runId)!;
    expect(store.run(fixture.request, EVALUATED)).toEqual({ ...inspected, status: 'EXISTING' }); expect(files()).toEqual(retained);
  });
});
