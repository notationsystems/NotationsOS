import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CandidateBuildComparisonError, CANDIDATE_BUILD_COMPARISON_CONTRACT, MAX_CANDIDATE_COMPARISON_BYTES,
  compareLocalCandidateBuilds, parseCandidateBuildComparisonRequest,
} from './candidate-build-comparison';
import { byteDigest } from './evidence-capture';
import { LocalCandidateBuildStore, type CandidateBuildRequest, type LocalCandidateBuild } from './local-candidate-build';
import { LocalEvidenceIntake, type LocalIntakeManifest } from './local-intake';
import { LocalNormalizationStore, type NormalizationRequest } from './local-normalization';
import { encodeLocalRecord, localJson, localRecordDigest } from './local-record';

const CAPTURED = '2026-09-05T10:00:00.000Z';
const STORED = '2026-09-05T12:00:00.000Z';
const NORMALIZED = '2026-09-05T13:00:00.000Z';
const CUTOFF = '2026-09-05T14:00:00.000Z';
const BUILT = '2026-09-05T15:00:00.000Z';
const LATER = '2026-09-05T16:00:00.000Z';
const SOURCE_CLASS = 'SYNTHETIC_DEMONSTRATION';
const NONCLAIMS = {
  canonicalAdmission: false, canonicalStateMutated: false, identityResolved: false, semanticMeaningInferred: false,
  fieldChangeInferred: false, correctionInferred: false, retractionInferred: false, completenessClaimed: false,
  sourceTruthClaimed: false, independentlyVerified: false, currentSourceUseGranted: false, customerDeliveryClaimed: false,
  releaseActivated: false, rawBytesIncluded: false, candidateFieldsIncluded: false, comparisonPersisted: false,
  sourceIdentifiersIncluded: true,
};
let temporary: string;
let root: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-build-comparison-test-')); root = join(temporary, 'evidence'); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); rmSync(temporary, { recursive: true, force: true }); });

function member(suffix = 'one', options: { sourceId?: string; sourceRecordId?: string; legalName?: string } = {}) {
  const manifest: LocalIntakeManifest = {
    schema: 'payload.local-intake-request.v1', acquisitionId: `acquisition-${suffix}`, evidenceId: `evidence-${suffix}`,
    purpose: 'COMPARE_TEST', mediaType: 'application/json', capturedAt: CAPTURED,
    sourceRegistration: {
      registrationId: `policy-${suffix}`, sourceId: options.sourceId ?? `notation://source/local/${suffix}`,
      displayName: 'Synthetic comparison source', sourceClass: SOURCE_CLASS, licenseId: 'operator-declaration', policyVersion: '1.0.0',
      effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: '2026-09-07T00:00:00.000Z',
      permittedPurposes: ['COMPARE_TEST', 'ALTERNATE_COMPARE'], allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'],
      retention: { mode: 'UNTIL_SOURCE_EXPIRY' },
    },
  };
  const bytes = Buffer.from(JSON.stringify({
    schema: 'caravan.carrier-source.v1', sourceRecordId: options.sourceRecordId ?? `record:${suffix}`,
    legalName: options.legalName ?? 'Sensitive synthetic carrier label', registrationNumber: 'SENSITIVE-REGISTRATION',
    operatingSite: null, validTime: { state: 'UNOBSERVED', from: null, to: null },
  }));
  const acquisition = new LocalEvidenceIntake(root).capture(manifest, bytes, STORED).acquisition;
  const normalization: NormalizationRequest = {
    schema: 'payload.local-normalization-request.v1', normalizationId: `normalization-${suffix}`, acquisitionId: manifest.acquisitionId,
    purpose: 'COMPARE_TEST', profile: { id: `profile-${suffix}`, version: '1.0.0', sourceRegistrationId: manifest.sourceRegistration.registrationId,
      sourceId: manifest.sourceRegistration.sourceId, adapterId: 'caravan.carrier-json/v1' },
  };
  const run = new LocalNormalizationStore(root).normalize(normalization, NORMALIZED).run;
  return { manifest, bytes, acquisition, normalization, run };
}

function build(id: string, ids = ['normalization-one'], options: {
  knownThrough?: string; builtAt?: string; purpose?: string; definition?: Partial<CandidateBuildRequest['definition']>;
} = {}) {
  return new LocalCandidateBuildStore(root).build({
    schema: 'payload.local-candidate-build-request.v1', buildId: id, purpose: options.purpose ?? 'COMPARE_TEST',
    knownThrough: options.knownThrough ?? CUTOFF,
    definition: { id: 'comparison-carriers', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: [SOURCE_CLASS], ...options.definition },
    normalizationIds: ids,
  }, options.builtAt ?? BUILT).build;
}

function request(before: LocalCandidateBuild, after: LocalCandidateBuild) {
  return { schema: 'payload.local-candidate-build-comparison-request.v1' as const,
    before: { buildId: before.buildId, expectedDigest: before.digest }, after: { buildId: after.buildId, expectedDigest: after.digest } };
}

function bareRequest() {
  return { schema: 'payload.local-candidate-build-comparison-request.v1' as const,
    before: { buildId: 'before', expectedDigest: `sha256:${'a'.repeat(64)}` },
    after: { buildId: 'after', expectedDigest: `sha256:${'b'.repeat(64)}` } };
}

function reference(entry: LocalCandidateBuild['members'][number]) {
  return { normalization: { ...entry.normalization }, candidate: { ...entry.candidate } };
}

function summary(entry: LocalCandidateBuild) {
  return { buildId: entry.buildId, digest: entry.digest, recordsRoot: entry.recordsRoot,
    knownThrough: entry.knownThrough, builtAt: entry.builtAt, recordCount: entry.recordCount };
}

function failure(action: () => unknown, code: string) {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(CandidateBuildComparisonError);
  expect(caught).toMatchObject({ code });
  return caught as CandidateBuildComparisonError;
}

function fileSnapshot() {
  if (!existsSync(root)) return [];
  const files: Array<{ path: string; digest: string; modified: number }> = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push({ path: relative(root, path), digest: byteDigest(readFileSync(path)), modified: statSync(path).mtimeMs });
    }
  }
  visit(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function recordPath(kind: string, id: string) {
  return join(root, kind, `${byteDigest(Buffer.from(id)).slice(7)}.json`);
}

describe('candidate-build comparison request contract', () => {
  it('returns an exact detached request with explicitly pinned full build digests', () => {
    const input = bareRequest();
    const parsed = parseCandidateBuildComparisonRequest(input);
    expect(parsed).toEqual(input);
    parsed.before.buildId = 'detached';
    parsed.after.expectedDigest = `sha256:${'c'.repeat(64)}`;
    expect(input).toEqual(bareRequest());
  });

  it.each([undefined, null, [], 'a string', new Date(), {}, { schema: 'wrong' }])('rejects non-request or incomplete input %j', (input) => {
    failure(() => parseCandidateBuildComparisonRequest(input), 'INVALID_COMPARISON_REQUEST');
  });

  it.each([
    ['schema', (input: ReturnType<typeof bareRequest>) => ({ ...input, schema: 'payload.local-candidate-build-comparison-request.v2' })],
    ['root path', (input: ReturnType<typeof bareRequest>) => ({ ...input, root: 'C:/private/evidence' })],
    ['execution', (input: ReturnType<typeof bareRequest>) => ({ ...input, command: 'execute' })],
    ['before fields', (input: ReturnType<typeof bareRequest>) => ({ ...input, before: { ...input.before, path: '../candidate-build.json' } })],
    ['after fields', (input: ReturnType<typeof bareRequest>) => ({ ...input, after: { ...input.after, options: {} } })],
    ['inline build', (input: ReturnType<typeof bareRequest>) => ({ ...input, before: { buildId: input.before.buildId, digest: input.before.expectedDigest, members: [] } })],
  ] as const)('rejects expanded authority or fields at %s before inspecting disk', (_name, mutate) => {
    const inspect = vi.spyOn(LocalCandidateBuildStore.prototype, 'inspect');
    failure(() => compareLocalCandidateBuilds(mutate(bareRequest()), root), 'INVALID_COMPARISON_REQUEST');
    expect(inspect).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);
  });

  it.each(['before', 'after'] as const)('requires bounded no-whitespace identifiers and prefixed lowercase digests in %s', (side) => {
    for (const buildId of ['', 'contains space', '\tleading', 'trailing\n', 'x'.repeat(181)]) {
      const input = bareRequest();
      input[side].buildId = buildId;
      failure(() => parseCandidateBuildComparisonRequest(input), 'INVALID_COMPARISON_REQUEST');
    }
    for (const expectedDigest of ['', 'a'.repeat(64), `sha256:${'A'.repeat(64)}`, `sha256:${'a'.repeat(63)}`, `sha256:${'g'.repeat(64)}`]) {
      const input = bareRequest();
      input[side].expectedDigest = expectedDigest;
      failure(() => parseCandidateBuildComparisonRequest(input), 'INVALID_COMPARISON_REQUEST');
    }
    const input = bareRequest();
    input[side].buildId = 'x'.repeat(180);
    expect(parseCandidateBuildComparisonRequest(input)[side].buildId).toBe(input[side].buildId);
  });

  it('rejects oversized metadata, non-finite values and cyclic input before filesystem use', () => {
    const input = bareRequest();
    const cycle: Record<string, unknown> = { ...input };
    cycle.loop = cycle;
    for (const invalid of [{ ...input, extra: 'x'.repeat(65537) }, { ...input, extra: Number.NaN }, { ...input, extra: undefined }, cycle]) {
      failure(() => compareLocalCandidateBuilds(invalid, root), 'INVALID_COMPARISON_REQUEST');
    }
    expect(existsSync(root)).toBe(false);
  });
});

describe('read-only reference comparison of real local candidate builds', () => {
  it('reopens identical membership in later builds as unchanged references despite new historical policy decisions', () => {
    member();
    const before = build('build-before');
    const after = build('build-after', undefined, { knownThrough: '2026-09-05T15:30:00.000Z', builtAt: LATER });
    expect(before.members[0].deriveDecision).not.toEqual(after.members[0].deriveDecision);
    expect(before.recordsRoot).toBe(after.recordsRoot);
    expect(before.digest).not.toBe(after.digest);
    const beforeFiles = fileSnapshot();
    const inspect = vi.spyOn(LocalCandidateBuildStore.prototype, 'inspect');
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(inspect).toHaveBeenCalledWith(before.buildId);
    expect(inspect).toHaveBeenCalledWith(after.buildId);
    expect(report).toMatchObject({
      schema: 'payload.local-candidate-build-comparison.v1', mode: 'LOCAL_DEVELOPMENT', basis: 'REFERENCE_COMPARISON',
      temporalBasis: 'INPUT_BUILD_TIMES_ONLY', request: request(before, after), definitionDigest: before.definitionDigest,
      buildContractDigest: before.request.contractDigest, purpose: 'COMPARE_TEST', before: summary(before), after: summary(after),
      nonclaims: NONCLAIMS,
      summary: { beforeCount: 1, afterCount: 1, added: 0, removed: 0, referenceChanged: 0, unchanged: 1,
        total: 1, recordsRootChanged: false, buildDigestChanged: true },
    });
    expect(report.entries).toEqual([{ kind: 'UNCHANGED', identity: before.members[0].identity,
      before: reference(before.members[0]), after: reference(after.members[0]) }]);
    expect(fileSnapshot()).toEqual(beforeFiles);
    expect(report).not.toHaveProperty('comparedAt');
    expect(report).not.toHaveProperty('createdAt');
  });

  it('allows a build to be compared to itself and claims no changes of any kind', () => {
    member();
    const same = build('same-build');
    const report = compareLocalCandidateBuilds(request(same, same), root);
    expect(report.before).toEqual(report.after);
    expect(report.summary).toEqual({ beforeCount: 1, afterCount: 1, added: 0, removed: 0, referenceChanged: 0,
      unchanged: 1, total: 1, recordsRootChanged: false, buildDigestChanged: false });
    expect(report.nonclaims).toEqual(NONCLAIMS);
  });

  it('labels a fresh normalization of unchanged bytes REFERENCE_CHANGED without claiming a field change', () => {
    const fixture = member();
    const repeated = new LocalNormalizationStore(root).normalize({ ...fixture.normalization, normalizationId: 'normalization-same-bytes-again' }, NORMALIZED).run;
    expect(repeated.candidate!.fields).toEqual(fixture.run.candidate!.fields);
    const before = build('build-before');
    const after = build('build-after', [repeated.request.manifest.normalizationId], { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(report.entries).toEqual([{ kind: 'REFERENCE_CHANGED', identity: fixture.run.candidate!.identity,
      before: reference(before.members[0]), after: reference(after.members[0]) }]);
    expect(report.summary).toEqual({ beforeCount: 1, afterCount: 1, added: 0, removed: 0, referenceChanged: 1,
      unchanged: 0, total: 1, recordsRootChanged: true, buildDigestChanged: true });
    expect(report.nonclaims).toEqual(NONCLAIMS);
    expect(JSON.stringify(report)).not.toContain('Sensitive synthetic carrier label');
    expect(JSON.stringify(report)).not.toContain('SENSITIVE-REGISTRATION');
  });

  it('uses the same reference-only classification even when a newer source observation has different fields', () => {
    member('one', { sourceId: 'source:shared', sourceRecordId: 'same-record', legalName: 'First synthetic label' });
    member('two', { sourceId: 'source:shared', sourceRecordId: 'same-record', legalName: 'Completely different synthetic label' });
    const before = build('before', ['normalization-one']);
    const after = build('after', ['normalization-two'], { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(report.entries[0].kind).toBe('REFERENCE_CHANGED');
    expect(report.nonclaims.fieldChangeInferred).toBe(false);
    expect(report.nonclaims.semanticMeaningInferred).toBe(false);
    expect(report.entries[0]).not.toHaveProperty('changedFields');
    expect(JSON.stringify(report)).not.toContain('synthetic label');
  });

  it('partitions a mixed source-identity union into added, removed, reference-changed and unchanged exactly once', () => {
    const stable = member('stable');
    const removed = member('removed');
    const changed = member('changed');
    const added = member('added');
    const revised = new LocalNormalizationStore(root).normalize({ ...changed.normalization, normalizationId: 'normalization-changed-revised' }, NORMALIZED).run;
    const before = build('before', [stable.normalization.normalizationId, removed.normalization.normalizationId, changed.normalization.normalizationId]);
    const after = build('after', [added.normalization.normalizationId, revised.request.manifest.normalizationId, stable.normalization.normalizationId], { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(report.summary).toEqual({ beforeCount: 3, afterCount: 3, added: 1, removed: 1, referenceChanged: 1, unchanged: 1,
      total: 4, recordsRootChanged: true, buildDigestChanged: true });
    expect(report.entries.map((entry) => [entry.identity.sourceRecordId, entry.kind])).toEqual([
      ['record:added', 'ADDED'], ['record:changed', 'REFERENCE_CHANGED'], ['record:removed', 'REMOVED'], ['record:stable', 'UNCHANGED'],
    ]);
    const addition = report.entries.find((entry) => entry.kind === 'ADDED')!;
    const removal = report.entries.find((entry) => entry.kind === 'REMOVED')!;
    expect(addition.before).toBeNull();
    expect(addition.after).not.toBeNull();
    expect(removal.before).not.toBeNull();
    expect(removal.after).toBeNull();
    for (const entry of report.entries) expect(entry.identity).toMatchObject({ state: 'UNRESOLVED', canonicalId: null });
    expect(report.nonclaims.correctionInferred).toBe(false);
    expect(report.nonclaims.retractionInferred).toBe(false);
  });

  it('keeps separator-colliding source identity pairs distinct', () => {
    member('one', { sourceId: 'source:a', sourceRecordId: 'b:c' });
    member('two', { sourceId: 'source:a:b', sourceRecordId: 'c' });
    const before = build('before', ['normalization-one']);
    const after = build('after', ['normalization-two'], { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(report.summary).toMatchObject({ added: 1, removed: 1, referenceChanged: 0, unchanged: 0, total: 2 });
    expect(report.entries.map((entry) => [entry.identity.sourceId, entry.identity.sourceRecordId])).toEqual([
      ['source:a', 'b:c'], ['source:a:b', 'c'],
    ]);
  });

  it('does not merge equal labels or record IDs across different source scopes', () => {
    member('one', { sourceId: 'source:first', sourceRecordId: 'same-record' });
    member('two', { sourceId: 'source:second', sourceRecordId: 'same-record' });
    const before = build('before', ['normalization-one']);
    const after = build('after', ['normalization-one', 'normalization-two'], { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(report.entries.map((entry) => [entry.identity.sourceId, entry.kind])).toEqual([['source:first', 'UNCHANGED'], ['source:second', 'ADDED']]);
    expect(report.nonclaims.identityResolved).toBe(false);
  });

  it('orders entries by the exact UTF-16 encoded source tuple rather than normalization ID or locale', () => {
    member('aaa', { sourceId: 'source:ä', sourceRecordId: 'z' });
    member('zzz', { sourceId: 'source:a', sourceRecordId: 'z' });
    member('mmm', { sourceId: 'source:z', sourceRecordId: 'a' });
    const before = build('before', ['normalization-aaa', 'normalization-mmm', 'normalization-zzz']);
    const after = build('after', ['normalization-zzz', 'normalization-aaa', 'normalization-mmm'], { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    const keys = report.entries.map((entry) => localJson([entry.identity.sourceId, entry.identity.sourceRecordId]));
    expect(keys).toEqual([...keys].sort());
    expect(report.entries.map((entry) => entry.identity.sourceId)).toEqual(['source:a', 'source:z', 'source:ä']);
  });

  it('remains deterministic after source policy expiry without granting current source use or adding comparison time', () => {
    member();
    const before = build('before');
    const after = build('after', undefined, { builtAt: LATER });
    const input = request(before, after);
    const first = compareLocalCandidateBuilds(input, root);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-01-01T00:00:00Z'));
    const later = compareLocalCandidateBuilds(input, root);
    expect(later).toEqual(first);
    expect(later.nonclaims.currentSourceUseGranted).toBe(false);
    expect(later.nonclaims.customerDeliveryClaimed).toBe(false);
    expect(later).not.toHaveProperty('comparedAt');
  });

  it('binds the complete deterministic report and named comparison contract to digests', () => {
    member();
    const before = build('before');
    const after = build('after', undefined, { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(MAX_CANDIDATE_COMPARISON_BYTES).toBe(512 * 1024);
    expect(report.contractDigest).toBe(localRecordDigest(CANDIDATE_BUILD_COMPARISON_CONTRACT));
    const { digest, ...body } = report;
    expect(digest).toBe(localRecordDigest(body, MAX_CANDIDATE_COMPARISON_BYTES));
    expect(encodeLocalRecord(report, MAX_CANDIDATE_COMPARISON_BYTES).byteLength).toBeLessThanOrEqual(MAX_CANDIDATE_COMPARISON_BYTES);
    const alternate = build('after-other-context', undefined, { knownThrough: '2026-09-05T15:00:00.000Z', builtAt: LATER });
    const different = compareLocalCandidateBuilds(request(before, alternate), root);
    expect(different.entries).toEqual(report.entries);
    expect(different.digest).not.toBe(report.digest);
  });

  it('does not persist comparison artifacts or mutate input, evidence, normalization or build files', () => {
    member();
    const before = build('before');
    const after = build('after', undefined, { builtAt: LATER });
    const input = request(before, after);
    const original = structuredClone(input);
    const files = fileSnapshot();
    const report = compareLocalCandidateBuilds(input, root);
    expect(input).toEqual(original);
    expect(fileSnapshot()).toEqual(files);
    expect(existsSync(join(root, 'comparisons'))).toBe(false);
    expect(report.nonclaims.comparisonPersisted).toBe(false);
    report.entries[0].identity.sourceId = 'changed-output-only';
    report.entries[0].before!.normalization.id = 'changed-output-only';
    report.request.before.buildId = 'changed-output-only';
    report.before.buildId = 'changed-output-only';
    expect(input).toEqual(original);
    const fresh = compareLocalCandidateBuilds(input, root);
    expect(fresh.entries[0].identity.sourceId).toBe(before.members[0].identity.sourceId);
    expect(fresh.entries[0].before).toEqual(reference(before.members[0]));
    expect(fileSnapshot()).toEqual(files);
  });

  it('does not invent an empty build or create directories for missing local inventory', () => {
    failure(() => compareLocalCandidateBuilds(bareRequest(), root), 'BUILD_NOT_FOUND');
    expect(existsSync(root)).toBe(false);
  });

  it.each(['before', 'after'] as const)('requires the full digest for %s, not the membership root', (side) => {
    member();
    const before = build('before');
    const after = build('after', undefined, { builtAt: LATER });
    const input = request(before, after);
    input[side].expectedDigest = (side === 'before' ? before : after).recordsRoot;
    expect(input[side].expectedDigest).not.toBe((side === 'before' ? before : after).digest);
    failure(() => compareLocalCandidateBuilds(input, root), 'BUILD_DIGEST_MISMATCH');
  });

  it('does not accept caller-supplied full build objects as authority', () => {
    member();
    const before = build('before');
    failure(() => compareLocalCandidateBuilds({ schema: bareRequest().schema, before, after: before }, root), 'INVALID_COMPARISON_REQUEST');
  });

  it.each(['BUILD', 'NORMALIZATION', 'ACQUISITION', 'BYTES'] as const)('reopens and rejects corrupt %s dependencies without repair or raw error disclosure', (kind) => {
    const fixture = member();
    const before = build('before');
    const after = build('after', undefined, { builtAt: LATER });
    const path = kind === 'BUILD' ? recordPath('candidate-builds', after.buildId) :
      kind === 'NORMALIZATION' ? recordPath('normalizations', fixture.normalization.normalizationId) :
        kind === 'ACQUISITION' ? recordPath('acquisitions', fixture.manifest.acquisitionId) :
          join(root, 'objects', ...fixture.acquisition.capture.evidence.storageKey.split('/'));
    const corrupt = Buffer.from('corrupt sensitive local bytes');
    writeFileSync(path, corrupt);
    const files = fileSnapshot();
    const error = failure(() => compareLocalCandidateBuilds(request(before, after), root), 'BUILD_INSPECTION_FAILED');
    expect(error.message).not.toContain(root);
    expect(error.message).not.toContain('corrupt sensitive');
    expect(readFileSync(path)).toEqual(corrupt);
    expect(fileSnapshot()).toEqual(files);
  });

  it.each(['ID', 'VERSION', 'SOURCE_CLASSES', 'PURPOSE'] as const)('refuses incompatible build context: %s', (change) => {
    member();
    const before = build('before');
    const definition = change === 'ID' ? { id: 'different-definition' } : change === 'VERSION' ? { version: '2.0.0' } :
      change === 'SOURCE_CLASSES' ? { sourceClasses: [SOURCE_CLASS, 'ANOTHER_DECLARED_CLASS'] } : undefined;
    const after = build('after', undefined, { builtAt: LATER, definition, purpose: change === 'PURPOSE' ? 'ALTERNATE_COMPARE' : undefined });
    const files = fileSnapshot();
    failure(() => compareLocalCandidateBuilds(request(before, after), root), 'INCOMPATIBLE_BUILDS');
    expect(fileSnapshot()).toEqual(files);
  });

  it.each(['CONTRACT', 'DEFINITION_JSON'] as const)('defensively compares %s even if an inspector supplied inconsistent digest metadata', (field) => {
    member();
    const before = build('before');
    const after = build('after', undefined, { builtAt: LATER });
    const changed = structuredClone(after);
    if (field === 'CONTRACT') changed.request.contractDigest = `sha256:${'f'.repeat(64)}`;
    else changed.request.manifest.definition.version = 'mismatched-despite-definition-digest';
    vi.spyOn(LocalCandidateBuildStore.prototype, 'inspect').mockImplementation((id) => structuredClone(id === before.buildId ? before : changed));
    failure(() => compareLocalCandidateBuilds(request(before, after), root), 'INCOMPATIBLE_BUILDS');
  });

  it.each(['CUTOFF', 'BUILD_TIME'] as const)('refuses reversed %s even when the other input clock is increasing', (clock) => {
    member();
    const before = build('before', undefined, { builtAt: clock === 'BUILD_TIME' ? '2026-09-05T17:00:00.000Z' : BUILT });
    const after = build('after', undefined, { knownThrough: clock === 'CUTOFF' ? '2026-09-05T13:30:00.000Z' : '2026-09-05T14:30:00.000Z', builtAt: LATER });
    failure(() => compareLocalCandidateBuilds(request(before, after), root), 'REVERSED_BUILD_ORDER');
  });

  it('allows distinct builds at equal cutoff and build timestamps without inventing temporal order', () => {
    member();
    const before = build('before');
    const after = build('after');
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(report.before.builtAt).toBe(report.after.builtAt);
    expect(report.before.knownThrough).toBe(report.after.knownThrough);
    expect(report.temporalBasis).toBe('INPUT_BUILD_TIMES_ONLY');
    expect(report.summary.unchanged).toBe(1);
  });

  it('handles the full union of two disjoint 64-member builds within the explicit byte budget', () => {
    const ids = Array.from({ length: 128 }, (_, index) => {
      const suffix = index.toString().padStart(3, '0');
      return member(suffix).normalization.normalizationId;
    });
    const before = build('before', ids.slice(0, 64));
    const after = build('after', ids.slice(64), { builtAt: LATER });
    const report = compareLocalCandidateBuilds(request(before, after), root);
    expect(report.entries).toHaveLength(128);
    expect(report.summary).toEqual({ beforeCount: 64, afterCount: 64, added: 64, removed: 64,
      referenceChanged: 0, unchanged: 0, total: 128, recordsRootChanged: true, buildDigestChanged: true });
    expect(encodeLocalRecord(report, MAX_CANDIDATE_COMPARISON_BYTES).byteLength).toBeLessThan(MAX_CANDIDATE_COMPARISON_BYTES);
    expect(report.nonclaims).toEqual(NONCLAIMS);
  }, 20_000);
});
