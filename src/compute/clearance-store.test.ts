import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest, storageKeyFor } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import * as localFiles from '../data-os/local-files';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference } from '../observation/contract';
import { CLEARANCE_PURPOSE, MAX_CLEARANCE_MANIFEST_BYTES, MAX_CLEARANCE_RESULT_BYTES, clearanceReferences, type ClearanceExperiment, type ClearanceRequest } from './clearance-contract';
import { clearanceDemoDeclaration, runClearanceDemo, syntheticClearanceExperiment } from './clearance-demo';
import { ClearanceStore } from './clearance-store';
import { evaluateClearanceDecision } from './clearance-voi';

const CAPTURED = '2026-09-05T12:00:00.000Z', STORED = '2026-09-05T12:00:01.000Z';
const MANIFEST_STORED = '2026-09-05T12:00:03.000Z', EVALUATED = '2026-09-05T13:00:00.000Z';
const EXPIRED = '2026-09-06T00:00:00.000Z', zero = `sha256:${'0'.repeat(64)}`;
const roles = ['model', 'actions', 'loss', 'references', 'assumptions'] as const;
type Role = typeof roles[number]; type AcquisitionRole = Role | 'manifest';
const allRoles: AcquisitionRole[] = [...roles, 'manifest'];
let temporary: string, root: string;
function policy(changes: Partial<SourceRegistration> = {}): SourceRegistration {
  return { ...clearanceDemoDeclaration('policy-example').sourceRegistration, effectiveFrom: '2026-09-05T00:00:00.000Z', effectiveUntil: EXPIRED,
    retention: { mode: 'UNTIL', until: EXPIRED }, ...changes };
}
function acquire(id: string, value: unknown, registration = policy(), at = STORED): ArtifactReference {
  const acquisition = new LocalEvidenceIntake(root).capture({ ...clearanceDemoDeclaration(id), capturedAt: CAPTURED,
    sourceRegistration: registration, purpose: registration.permittedPurposes[0] },
  value instanceof Buffer ? value : encodeLocalRecord(value, MAX_CLEARANCE_MANIFEST_BYTES), at).acquisition;
  return { acquisitionId: id, acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest };
}
function setup(options: { policies?: Partial<Record<AcquisitionRole, SourceRegistration>>; storedAt?: Partial<Record<Role, string>>;
  change?: (m: ClearanceExperiment) => void; bytes?: Buffer } = {}) {
  const refs = Object.fromEntries(roles.map((role) => [role, acquire(`test-${role}`, { evidenceClass: 'SYNTHETIC_TEST', role },
    options.policies?.[role], options.storedAt?.[role])])) as Record<Role, ArtifactReference>;
  const manifest = syntheticClearanceExperiment(refs); options.change?.(manifest);
  const manifestRef = acquire('test-manifest', options.bytes ?? manifest, options.policies?.manifest, MANIFEST_STORED);
  const request: ClearanceRequest = { schema: 'payload.clearance-voi-request.v1', runId: 'clearance-test', manifest: manifestRef };
  return { refs: { ...refs, manifest: manifestRef }, manifest, request };
}
function store(at = EVALUATED) { return new ClearanceStore(root, { now: () => at }); }
function runPath(id = 'clearance-test') { return join(root, 'clearance-voi', `${byteDigest(Buffer.from(id)).slice(7)}.json`); }
function acquisitionPath(ref: ArtifactReference) { return join(root, 'acquisitions', `${byteDigest(Buffer.from(ref.acquisitionId)).slice(7)}.json`); }
function objectPath(ref: ArtifactReference) { return join(root, 'objects', ...storageKeyFor(ref.contentDigest).split('/')); }
function files(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const target = join(directory, name), key = prefix ? `${prefix}/${name}` : name;
    return lstatSync(target).isDirectory() ? Object.entries(files(target, key)) : [[key, byteDigest(readFileSync(target))]];
  }));
}
function refusal(action: () => unknown, message?: string | RegExp) {
  const before = files();
  if (message) expect(action).toThrow(message); else expect(action).toThrow();
  expect(files()).toEqual(before);
}
beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-clearance-store-')); root = join(temporary, 'evidence');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NETWORK_FORBIDDEN'); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  const base = resolve(tmpdir()), target = resolve(temporary);
  expect(relative(base, target)).toMatch(/^payload-clearance-store-[^\\/]+$/); expect(target).not.toBe(base);
  rmSync(target, { recursive: true, force: true });
});

describe('clearance retained evidence and current-use rails', () => {
  it('retains one recomputable result with six exact dependencies and no action authority', () => {
    const fixture = setup(), before = files(), result = store().run(fixture.request);
    expect(result.status).toBe('CREATED'); expect(result.rawBytesIncluded).toBe(false);
    expect(result.manifest).toEqual(fixture.manifest);
    expect(result.run.result).toEqual(evaluateClearanceDecision(fixture.manifest));
    expect(result.run).toMatchObject({ requestDigest: localRecordDigest(fixture.request), evaluatedAt: EVALUATED,
      independentVerification: false, policyAuthority: 'OPERATOR_DECLARATION' });
    expect(result.run.result).toMatchObject({ independentVerification: false, fieldAccuracyEstablished: false,
      physicalActionAuthorized: false, sourceQueryExecuted: false, canonicalAdmission: false });
    expect(result.run.dependencies.map(({ acquisitionId, acquisitionDigest, contentDigest }) => ({ acquisitionId, acquisitionDigest, contentDigest })))
      .toEqual([fixture.request.manifest, ...clearanceReferences(fixture.manifest)]);
    expect(result.run.dependencies).toHaveLength(6);
    for (const d of result.run.dependencies) expect(d.decision).toMatchObject({ state: 'ALLOWED', evaluatedAt: EVALUATED,
      request: { purpose: CLEARANCE_PURPOSE, operation: 'DERIVE', audience: 'INTERNAL', requestedAt: EVALUATED } });
    expect(result.run.dependencies[0].storedAt).toBe(MANIFEST_STORED);
    const { digest, ...payload } = result.run;
    expect(digest).toBe(localRecordDigest(payload, MAX_CLEARANCE_RESULT_BYTES));
    expect(Object.keys(files())).toHaveLength(13);
    for (const [path, hash] of Object.entries(before)) expect(files()[path]).toBe(hash);
    const retained = files();
    expect(store().inspect(fixture.request.runId)).toEqual({ manifest: result.manifest, run: result.run, rawBytesIncluded: false });
    expect(files()).toEqual(retained);
  });
  it('same request reopens original-time results under a later allowed clock without renewal', () => {
    const fixture = setup(), created = store().run(fixture.request), retained = files();
    expect(store('2026-09-05T14:00:00.000Z').run(fixture.request)).toEqual({ ...created, status: 'EXISTING' });
    expect(files()).toEqual(retained);
  });
  it.each(allRoles)('requires current and historical DERIVE and RETRIEVE independently for %s', (role) => {
    for (const absent of ['DERIVE', 'RETRIEVE'] as const) {
      const fixture = setup({ policies: { [role]: policy({ allowedOperations: ['INGEST', absent === 'DERIVE' ? 'RETRIEVE' : 'DERIVE'] }) } });
      refusal(() => store().run(fixture.request), 'CLEARANCE_CURRENT_USE_NOT_ALLOWED');
      // Use another bounded root for the second immutable policy, never overwrite the first declaration.
      root = join(temporary, `evidence-${absent}`);
    }
  });
  it.each(allRoles)('does not substitute required approval for a grant on %s', (role) => {
    const fixture = setup({ policies: { [role]: policy({ allowedOperations: ['INGEST', 'RETRIEVE'], approvalRequiredOperations: ['DERIVE'] }) } });
    refusal(() => store().run(fixture.request), 'CLEARANCE_CURRENT_USE_NOT_ALLOWED');
  });
  it.each(allRoles)('separately requires the compute purpose for %s', (role) => {
    const fixture = setup({ policies: { [role]: policy({ permittedPurposes: ['another-purpose'] }) } });
    refusal(() => store().run(fixture.request), 'CLEARANCE_CURRENT_USE_NOT_ALLOWED');
  });
  it.each(allRoles)('denies inspection and exact retry at policy expiry of %s without disclosing or renewing', (role) => {
    const fixture = setup({ policies: { [role]: policy({ effectiveUntil: '2026-09-05T14:00:00.000Z', retention: { mode: 'INDEFINITE' } }) } });
    store().run(fixture.request);
    refusal(() => store('2026-09-05T14:00:00.000Z').inspect(fixture.request.runId), 'CLEARANCE_CURRENT_USE_NOT_ALLOWED');
    refusal(() => store('2026-09-05T14:00:00.000Z').run(fixture.request), 'CLEARANCE_CURRENT_USE_NOT_ALLOWED');
  });
  it.each(allRoles)('denies current use at earlier explicit retention boundary of %s', (role) => {
    const fixture = setup({ policies: { [role]: policy({ retention: { mode: 'UNTIL', until: '2026-09-05T14:00:00.000Z' } }) } });
    store().run(fixture.request);
    refusal(() => store('2026-09-05T14:00:00.000Z').inspect(fixture.request.runId), 'CLEARANCE_CURRENT_USE_NOT_ALLOWED');
    refusal(() => store('2026-09-05T14:00:00.000Z').run(fixture.request), 'CLEARANCE_CURRENT_USE_NOT_ALLOWED');
  });
  it('requires the manifest to have been stored before computation', () => {
    const fixture = setup(); refusal(() => store(STORED).run(fixture.request), 'CLEARANCE_BEFORE_STORAGE');
  });
  it.each(roles)('checks the original storage time of %s, not only manifest storage', (role) => {
    const fixture = setup({ storedAt: { [role]: '2026-09-05T14:00:00.000Z' } });
    refusal(() => store().run(fixture.request), 'CLEARANCE_BEFORE_STORAGE');
  });
  it('refuses a read clock before the recorded evaluation', () => {
    const fixture = setup(); store().run(fixture.request);
    refusal(() => store('2026-09-05T12:59:59.999Z').inspect(fixture.request.runId), 'CLEARANCE_CLOCK_REVERSED');
  });
  it.each(['2026-09-05T13:00:00Z', '2026-09-05T09:00:00.000-04:00', '2026-02-30T13:00:00.000Z', 'invalid'])('refuses noncanonical or invalid clock %s', (at) => {
    const fixture = setup(); refusal(() => store(at).run(fixture.request));
  });
  it('different exact manifest requires a new run identity', () => {
    const fixture = setup(); store().run(fixture.request);
    const another = acquire('another-manifest', { ...fixture.manifest, experimentId: 'changed-inquiry' });
    refusal(() => store().run({ ...fixture.request, manifest: another }), 'CLEARANCE_ID_CONFLICT');
  });
  it('absent inspection and missing manifest do not create a storage root', () => {
    expect(store().inspect('absent')).toBeUndefined();
    refusal(() => store().run({ schema: 'payload.clearance-voi-request.v1', runId: 'absent', manifest: {
      acquisitionId: 'missing', acquisitionDigest: zero, contentDigest: zero } }), 'CLEARANCE_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expect(existsSync(root)).toBe(false);
  });
  it.each(['acquisitionDigest', 'contentDigest'] as const)('binds the exact manifest %s', (field) => {
    const fixture = setup(); fixture.request.manifest[field] = zero;
    refusal(() => store().run(fixture.request), 'CLEARANCE_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });
  it.each(allRoles)('refuses missing acquisition %s during inspect/retry without repair', (role) => {
    const fixture = setup(); store().run(fixture.request); unlinkSync(acquisitionPath(fixture.refs[role]));
    refusal(() => store().inspect(fixture.request.runId), 'CLEARANCE_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    refusal(() => store().run(fixture.request), 'CLEARANCE_EVIDENCE_UNAVAILABLE_OR_CHANGED');
  });
  it.each(allRoles)('refuses changed exact source bytes for %s without repair', (role) => {
    const fixture = setup(); store().run(fixture.request); writeFileSync(objectPath(fixture.refs[role]), 'changed bytes');
    refusal(() => store().inspect(fixture.request.runId));
  });
  it.each(['result', 'dependencies', 'clock', 'authority', 'digest'] as const)('rejects resealed run tampering: %s', (kind) => {
    const fixture = setup(); store().run(fixture.request);
    const recorded = JSON.parse(readFileSync(runPath(), 'utf8'));
    if (kind === 'result') recorded.result.physicalActionAuthorized = true;
    if (kind === 'dependencies') recorded.dependencies.pop();
    if (kind === 'clock') recorded.evaluatedAt = '2026-09-05T14:00:00.000Z';
    if (kind === 'authority') recorded.policyAuthority = 'INDEPENDENT_VERIFIER';
    const { digest: oldDigest, ...payload } = recorded; void oldDigest;
    recorded.digest = kind === 'digest' ? zero : localRecordDigest(payload, MAX_CLEARANCE_RESULT_BYTES);
    writeFileSync(runPath(), encodeLocalRecord(recorded, MAX_CLEARANCE_RESULT_BYTES));
    refusal(() => store().inspect(fixture.request.runId));
  });
  it.each(['null', 'false', '0', '{}', '{"x":1,"x":2}', '{broken'])('does not mistake invalid stored run %s for absence', (json) => {
    const fixture = setup(); store().run(fixture.request); writeFileSync(runPath(), json);
    refusal(() => store().run(fixture.request));
  });
  it.each([Buffer.from([0xc3, 0x28]), Buffer.from('{"schema":1,"schema":2}'), Buffer.alloc(MAX_CLEARANCE_MANIFEST_BYTES + 1, 32)])('rejects malformed/oversized retained manifest before publishing %#', (bytes) => {
    const fixture = setup({ bytes }); refusal(() => store().run(fixture.request));
    expect(existsSync(runPath())).toBe(false);
  });
  it('counts every distinct dependency against the 64 MiB aggregate bound', () => {
    const extras = Array.from({ length: 4 }, (_, i) => acquire(`extra-${i}`, { extra: i }));
    const fixture = setup({ change: (m) => { extras.forEach((ref, i) => { m.validation.cases[i].evidence = ref; }); } });
    const instance = store(), inspect = instance.intake.inspect.bind(instance.intake);
    vi.spyOn(instance.intake, 'inspect').mockImplementation((id) => {
      const acquired = inspect(id);
      return acquired ? { ...acquired, request: { ...acquired.request, byteLength: 8 * 1024 * 1024 } } : undefined;
    });
    refusal(() => instance.run(fixture.request), 'CLEARANCE_DEPENDENCY_BUDGET');
    expect(existsSync(runPath())).toBe(false);
  });
  it('returns the verified exact concurrent winner without replacing its original clock', () => {
    const fixture = setup(), later = '2026-09-05T14:00:00.000Z';
    const at = vi.fn().mockReturnValue(later).mockReturnValueOnce(EVALUATED);
    const originalPublish = localFiles.publishImmutableFile;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementationOnce((...args) => {
      store(later).run(fixture.request); return originalPublish(...args);
    });
    const result = new ClearanceStore(root, { now: at }).run(fixture.request);
    expect(result.status).toBe('EXISTING'); expect(result.run.evaluatedAt).toBe(later);
    expect(Object.keys(files())).toHaveLength(13);
  });
});

describe('synthetic demonstration never upgrades evidence or repairs retained history', () => {
  it('keeps its repeated constructed references explicitly unvalidated', () => {
    const demo = runClearanceDemo(root, EVALUATED);
    expect(demo.manifest.validation.independence.state).toBe('UNRESOLVED');
    for (const baseline of demo.run.result.baselines) expect(baseline.validation).toMatchObject({
      state: 'UNRESOLVED_INDEPENDENCE', metrics: null, scoredCaseCount: 0 });
    const before = files(); expect(runClearanceDemo(root, '2026-09-05T14:00:00.000Z')).toEqual({ ...demo, status: 'EXISTING' });
    expect(files()).toEqual(before);
  });
  it.each(['acquisition', 'object'] as const)('refuses demo retry with missing %s without recreating it', (kind) => {
    const demo = runClearanceDemo(root, EVALUATED), dependency = demo.run.dependencies[1];
    unlinkSync(kind === 'acquisition' ? acquisitionPath(dependency) : objectPath(dependency));
    refusal(() => runClearanceDemo(root, '2026-09-05T14:00:00.000Z'));
  });
});
