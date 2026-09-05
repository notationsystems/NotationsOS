import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recordPayload } from '../adapter/feedShapes';
import type { Corpus, CorpusRecord, CorpusRelease } from '../domain/corpus';
import { recordStatusAt } from '../domain/corpus';
import { FIXTURE_CORPORA } from '../fixtures';
import { canonicalJson } from '../fixtures/digest';
import { releaseCanonical } from '../fixtures/digestPlan';
import { buildReleaseManifest } from '../fixtures/releaseManifest';
import { compileProjection } from './compile';
import { parseProjectionSpec, ProjectionError, routeProjection } from './spec';
import { describeProjectionSource } from './source';

type Spec = ReturnType<typeof parseProjectionSpec>;
type View = Spec['view'];
const CORPUS = FIXTURE_CORPORA[0];
const CURRENT = CORPUS.releases.find((release) => release.status === 'CURRENT')!;
const KNOWN = '2026-09-01T12:00:00.000Z';
const VALID = '2026-08-31T12:00:00.000Z';
const EVIDENCE: View = { mode: 'EVIDENCE', coordinateSemantics: 'NONE', representation: 'RECORDS' };
const GRAPH: View = { mode: 'STRUCTURE', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'GRAPH' };
const NONCLAIMS = {
  sourceMutated: false, canonicalAdmission: false, relationInferred: false, sourceTruthClaimed: false,
  independentlyVerified: false, rendererExecuted: false,
};
const VIEW_ROUTES = [
  [EVIDENCE, 'records'],
  [{ mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'POINT' }, 'kepler.gl'],
  [{ mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'DENSITY' }, 'kepler.gl'],
  [{ mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' }, 'CesiumJS'],
  [GRAPH, 'Three.js'],
  ...(['INTRINSIC_PHYSICAL', 'FEATURE_SPACE', 'ARBITRARY_MODEL_SPACE'] as const).flatMap((coordinateSemantics) =>
    (['MESH', 'FIELD'] as const).map((representation) => [{ mode: 'STRUCTURE', coordinateSemantics, representation }, 'Three.js'] as const)),
] as const;

const rawHash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const hash = (value: unknown) => `sha256:${rawHash(value)}`;

function spec(ids = ['REC-0204'], corpus = CORPUS, release = CURRENT): Spec {
  return {
    schema: 'payload.projection-spec.v1',
    source: describeProjectionSource(release.releaseId, [corpus]).source,
    selection: { recordIds: ids, knownAt: new Date(release.knownAt).toISOString(), validAt: VALID },
    view: { ...EVIDENCE }, viewer: 'COUNTERPARTY_SHARED',
  };
}

function cloned() {
  const corpus = structuredClone(CORPUS);
  const release = corpus.releases.find((entry) => entry.releaseId === CURRENT.releaseId)!;
  return { corpus, release, input: spec(['REC-0204'], corpus, release) };
}

/** Modified fixtures get fresh commitments when the test is about policy/selection, not corruption. */
function restamp(corpus: Corpus, release: CorpusRelease) {
  release.releaseDigest = rawHash({ releaseId: release.releaseId, corpusId: corpus.corpusId,
    knownAt: release.knownAt, records: releaseCanonical(corpus, release.releaseId) });
  release.certification.manifestCommitment = rawHash(buildReleaseManifest(corpus, release));
}

function record(corpus: Corpus, id = 'REC-0204'): CorpusRecord {
  return corpus.records.find((entry) => entry.recordId === id)!;
}

function failure(action: () => unknown, code: string) {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ProjectionError);
  expect(caught).toMatchObject({ code });
  return caught as ProjectionError;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('projection specification and routing', () => {
  it('normalizes both clocks and UTF-16 selection order without mutating or aliasing the input', () => {
    const input = spec(['z', 'ä', 'a']);
    input.selection.knownAt = '2026-09-01T08:00:00-04:00';
    input.selection.validAt = '2026-08-31T14:00:00+02:00';
    const before = structuredClone(input);
    const parsed = parseProjectionSpec(input);
    expect(parsed).toEqual({ ...input, selection: { recordIds: ['a', 'z', 'ä'], knownAt: KNOWN, validAt: VALID } });
    expect(input).toEqual(before);
    parsed.selection.recordIds.push('another');
    parsed.source.corpusId = 'different';
    expect(input).toEqual(before);
  });

  it.each(VIEW_ROUTES)('validates and routes the explicit view %j to %s', (view, engine) => {
    const input = { ...spec(), view };
    expect(parseProjectionSpec(input).view).toEqual(view);
    expect(routeProjection(parseProjectionSpec(input).view)).toBe(engine);
  });

  it.each([
    { mode: 'EVIDENCE', coordinateSemantics: 'GEODETIC', representation: 'RECORDS' },
    { mode: 'MAP', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'POINT' },
    { mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'GRAPH' },
    { mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'MESH' },
    { mode: 'STRUCTURE', coordinateSemantics: 'GEODETIC', representation: 'GRAPH' },
    { mode: 'STRUCTURE', coordinateSemantics: 'FEATURE_SPACE', representation: 'GRAPH' },
    { mode: 'STRUCTURE', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'MESH' },
    { mode: 'STRUCTURE', coordinateSemantics: 'NONE', representation: 'FIELD' },
    { mode: 'UNKNOWN', coordinateSemantics: 'NONE', representation: 'RECORDS' },
  ])('rejects contradictory or unsupported view semantics %j', (view) => {
    failure(() => parseProjectionSpec({ ...spec(), view }), 'INVALID_PROJECTION_SPEC');
  });

  it.each([
    ['root', (input: Spec) => ({ ...input, command: 'execute' })],
    ['source', (input: Spec) => ({ ...input, source: { ...input.source, path: 'private/path' } })],
    ['selection', (input: Spec) => ({ ...input, selection: { ...input.selection, limit: 10 } })],
    ['view', (input: Spec) => ({ ...input, view: { ...input.view, engine: 'arbitrary-code' } })],
    ['schema', (input: Spec) => ({ ...input, schema: 'payload.projection-spec.v2' })],
    ['source kind', (input: Spec) => ({ ...input, source: { ...input.source, kind: 'LOCAL_CANDIDATE_BUILD' } })],
    ['private viewer', (input: Spec) => ({ ...input, viewer: 'PRIVATE_PREFLIGHT' })],
    ['internal viewer', (input: Spec) => ({ ...input, viewer: 'INTERNAL_ONLY' })],
  ] as const)('rejects unknown or unsupported fields at %s', (_name, mutate) => {
    failure(() => parseProjectionSpec(mutate(spec())), 'INVALID_PROJECTION_SPEC');
  });

  it.each([undefined, null, [], 'a string', new Date(), { schema: 'payload.projection-spec.v1' }])('rejects non-spec input %j', (input) => {
    failure(() => parseProjectionSpec(input), 'INVALID_PROJECTION_SPEC');
  });

  it.each(['corpusId', 'releaseId'] as const)('bounds the no-whitespace source identifier %s', (field) => {
    for (const invalid of ['', 'contains space', '\tleading', 'trailing\n', 'x'.repeat(181)]) {
      const input = spec();
      input.source[field] = invalid;
      failure(() => parseProjectionSpec(input), 'INVALID_PROJECTION_SPEC');
    }
    const input = spec();
    input.source[field] = 'x'.repeat(180);
    expect(parseProjectionSpec(input).source[field]).toBe(input.source[field]);
  });

  it.each(['releaseDigest', 'manifestCommitment'] as const)('requires an exact raw lowercase SHA-256 source commitment: %s', (field) => {
    for (const invalid of ['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), `sha256:${'a'.repeat(64)}`, 'g'.repeat(64)]) {
      const input = spec();
      input.source[field] = invalid;
      failure(() => parseProjectionSpec(input), 'INVALID_PROJECTION_SPEC');
    }
  });

  it('requires the complete source snapshot commitment with the SHA-256 prefix', () => {
    for (const invalid of ['', 'a'.repeat(64), `sha256:${'A'.repeat(64)}`, `sha256:${'a'.repeat(63)}`, `sha256:${'g'.repeat(64)}`]) {
      const input = spec();
      input.source.snapshotDigest = invalid;
      failure(() => parseProjectionSpec(input), 'INVALID_PROJECTION_SPEC');
    }
    const missing = spec();
    Reflect.deleteProperty(missing.source, 'snapshotDigest');
    failure(() => parseProjectionSpec(missing), 'INVALID_PROJECTION_SPEC');
  });

  it('accepts 128 unique bounded IDs but rejects empty, duplicate, oversized and sparse selections', () => {
    const ids = Array.from({ length: 128 }, (_, index) => `${index.toString().padStart(3, '0')}-${'x'.repeat(176)}`);
    expect(parseProjectionSpec(spec([...ids].reverse())).selection.recordIds).toEqual(ids);
    for (const invalid of [[], ['same', 'same'], [''], ['has space'], ['x'.repeat(181)], [...ids, 'extra'], new Array(1), new Array(2)]) {
      failure(() => parseProjectionSpec(spec(invalid)), 'INVALID_PROJECTION_SPEC');
    }
  });

  it.each(['knownAt', 'validAt'] as const)('requires strict real-calendar ISO instants for %s', (clock) => {
    for (const invalid of ['2026-08-31', '2026-08-31T12:00:00', '2026-02-29T12:00:00Z', '2026-04-31T12:00:00Z',
      '2026-08-31T24:00:00Z', '2026-08-31T12:00:60Z', '2026-08-31T12:00:00.0001Z', '2026-08-31T12:00:00+24:00']) {
      const input = spec();
      input.selection[clock] = invalid;
      failure(() => parseProjectionSpec(input), 'INVALID_PROJECTION_SPEC');
    }
  });
});

describe('pure fixture projection compilation', () => {
  it('describes an exact recomputed fixture source without enumerating its records or payloads', () => {
    const descriptor = describeProjectionSource(CURRENT.releaseId);
    expect(descriptor).toEqual({
      schema: 'payload.projection-source.v1', fixture_only: true, source: {
        kind: 'CORPUS_RELEASE', corpusId: CORPUS.corpusId, releaseId: CURRENT.releaseId,
        releaseDigest: CURRENT.releaseDigest, manifestCommitment: CURRENT.certification.manifestCommitment,
        snapshotDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }, domain: CORPUS.domain, buildId: CURRENT.build.buildId, knownAt: expect.any(String),
      snapshotCodec: 'payload.fixture-projection-source.v1',
    });
    expect(Date.parse(descriptor.knownAt)).toBe(Date.parse(CURRENT.knownAt));
    expect(JSON.stringify(descriptor)).not.toContain('REC-');
    expect(JSON.stringify(descriptor)).not.toContain('harbourline');
    expect(descriptor).toEqual(describeProjectionSource(CURRENT.releaseId));
    descriptor.source.snapshotDigest = 'changed-output-only';
    expect(describeProjectionSource(CURRENT.releaseId).source.snapshotDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('does not describe missing or ambiguously named source releases', () => {
    failure(() => describeProjectionSource('missing-release'), 'SOURCE_NOT_AVAILABLE');
    const corpus = structuredClone(CORPUS);
    failure(() => describeProjectionSource(CURRENT.releaseId, [corpus, structuredClone(corpus)]), 'SOURCE_NOT_AVAILABLE');
  });

  it('recomputes the committed fixture source and returns safe evidence payloads with historical status', () => {
    const input = spec(['REC-0204', 'REC-0101']);
    const before = structuredClone(FIXTURE_CORPORA);
    const result = compileProjection(input);
    expect(result).toMatchObject({ schema: 'payload.projection.v1', fixture_only: true,
      authority: 'REPLACEABLE_PROJECTION', engine: 'records', status: 'READY', error: null, graph: null, nonclaims: NONCLAIMS });
    expect(result.spec).toEqual(parseProjectionSpec(input));
    expect(result.records.map((entry) => entry.recordId)).toEqual(['REC-0101', 'REC-0204']);
    for (const entry of result.records) {
      const source = record(CORPUS, entry.recordId);
      const rights = CURRENT.sources.find((schedule) => schedule.sourceId === source.provenance.sourceId);
      const payload = recordPayload(source, rights);
      const safe = { ...payload };
      for (const pointer of ['supersedesRecordId', 'supersededByRecordId', 'retractedByRetractionId']) Reflect.deleteProperty(safe, pointer);
      expect(entry).toEqual({ ...safe, statusAtKnownAt: recordStatusAt(CORPUS, source, CURRENT.knownAt) });
      expect(Object.keys(entry)).not.toEqual(expect.arrayContaining(['supersedesRecordId', 'supersededByRecordId', 'retractedByRetractionId']));
    }
    expect(result.records.find((entry) => entry.recordId === 'REC-0101')?.rights?.attribution).toContain('Northgate');
    expect(FIXTURE_CORPORA).toEqual(before);
  });

  it('creates only explicit record-about-subject edges while preserving cross-view canonical referents', () => {
    const input = spec(['REC-0202', 'REC-0203', 'REC-0204']);
    const evidence = compileProjection(input);
    const structure = compileProjection({ ...input, view: GRAPH });
    expect(structure).toMatchObject({ engine: 'Three.js', status: 'READY', error: null, nonclaims: NONCLAIMS });
    expect(structure.records).toEqual(evidence.records);
    expect(structure.graph?.edges).toHaveLength(3);
    expect(structure.graph?.nodes).toHaveLength(5);
    for (const entry of evidence.records) {
      expect(structure.graph?.nodes).toContainEqual({ id: entry.canonicalId, kind: 'RECORD', recordId: entry.recordId });
      expect(structure.graph?.nodes).toContainEqual({ id: entry.subject.canonicalId, kind: 'SUBJECT',
        subjectId: entry.subject.subjectId, subjectType: entry.subject.subjectType });
      expect(structure.graph?.edges).toContainEqual({ recordId: entry.recordId, source: entry.canonicalId,
        target: entry.subject.canonicalId, kind: 'RECORD_ABOUT_SUBJECT' });
    }
    // The sample-to-lot record value is not permission to fabricate a sample/lot edge or resolve identity.
    expect(structure.graph?.edges.every((edge) => evidence.records.some((entry) => edge.source === entry.canonicalId))).toBe(true);
    expect(structure.graph?.nodes.every((node) => !('position' in node) && !('coordinates' in node))).toBe(true);
    expect(structure.provenance.sourceSelectionDigest).toBe(evidence.provenance.sourceSelectionDigest);
    expect(structure.provenance.specDigest).not.toBe(evidence.provenance.specDigest);
    expect(structure.digest).not.toBe(evidence.digest);
  });

  it.each(VIEW_ROUTES.filter(([view]) => !['RECORDS', 'GRAPH'].includes(view.representation)))('routes %j without inventing unavailable geometry', (view, engine) => {
    const evidence = compileProjection(spec());
    const result = compileProjection({ ...spec(), view });
    expect(result).toMatchObject({ engine, status: 'UNAVAILABLE', error: 'GEOMETRY_NOT_AVAILABLE', graph: null, nonclaims: NONCLAIMS });
    expect(result.records).toEqual(evidence.records);
    expect(result).not.toHaveProperty('geometry');
    expect(result).not.toHaveProperty('coordinates');
    expect(result).not.toHaveProperty('mesh');
    expect(result.provenance.sourceSelectionDigest).toBe(evidence.provenance.sourceSelectionDigest);
  });

  it('keeps selected superseded and retracted inventory instead of silently substituting current answers', () => {
    const result = compileProjection(spec(['REC-0203', 'REC-0111', 'REC-0204']));
    expect(result.records.map((entry) => [entry.recordId, entry.value, entry.statusAtKnownAt])).toEqual([
      ['REC-0111', 5.8, 'RETRACTED'], ['REC-0203', 40, 'SUPERSEDED'], ['REC-0204', 40.12, 'CURRENT'],
    ]);
    for (const entry of result.records) {
      expect(entry).not.toHaveProperty('supersedesRecordId');
      expect(entry).not.toHaveProperty('supersededByRecordId');
      expect(entry).not.toHaveProperty('retractedByRetractionId');
    }
    expect(JSON.stringify(result.records)).not.toContain('RET-0002');
  });

  it('reconstructs correction status at the exact knowledge boundary without exposing later pointers', () => {
    const input = spec(['REC-0203']);
    const before = compileProjection({ ...input, selection: { ...input.selection, knownAt: '2026-08-25T13:59:59.999Z' } });
    const at = compileProjection({ ...input, selection: { ...input.selection, knownAt: '2026-08-25T14:00:00.000Z' } });
    expect(before.records[0].statusAtKnownAt).toBe('CURRENT');
    expect(at.records[0].statusAtKnownAt).toBe('SUPERSEDED');
    expect(before.records[0].value).toBe(at.records[0].value);
    expect(JSON.stringify(before.records)).not.toContain('REC-0204');
    expect(before.provenance.sourceSelectionDigest).not.toBe(at.provenance.sourceSelectionDigest);
  });

  it('preserves an earlier release as a historical projection before its later withdrawal', () => {
    const release = CORPUS.releases[0];
    const input = spec(['REC-0111'], CORPUS, release);
    const old = compileProjection(input);
    const current = compileProjection(spec(['REC-0111']));
    expect(old.records[0].statusAtKnownAt).toBe('CURRENT');
    expect(current.records[0].statusAtKnownAt).toBe('RETRACTED');
    expect(old.records[0].canonicalId).toBe(current.records[0].canonicalId);
    expect(old.spec.source).toEqual(input.source);
  });

  it('permits both record and release knowledge at equality, including alternate timezone spelling', () => {
    const input = spec(['REC-0204']);
    input.selection.knownAt = '2026-08-25T10:00:00-04:00';
    expect(compileProjection(input).records).toHaveLength(1);
    input.selection.knownAt = '2026-09-01T08:00:00-04:00';
    expect(compileProjection(input).spec.selection.knownAt).toBe(KNOWN);
  });

  it('rejects knowledge after the bound release rather than silently clamping it', () => {
    const input = spec();
    input.selection.knownAt = '2026-09-01T12:00:00.001Z';
    failure(() => compileProjection(input), 'KNOWLEDGE_AFTER_RELEASE');
  });

  it.each(['CORPUS', 'RELEASE'] as const)('reports unavailable %s references without switching to a different release', (part) => {
    const input = spec();
    if (part === 'CORPUS') input.source.corpusId = 'missing-corpus';
    else input.source.releaseId = 'missing-release';
    failure(() => compileProjection(input), 'SOURCE_NOT_AVAILABLE');
  });

  it('rejects ambiguous corpus and release identities instead of choosing the first match', () => {
    const { corpus, input } = cloned();
    failure(() => compileProjection(input, [corpus, structuredClone(corpus)]), 'SOURCE_NOT_AVAILABLE');
    corpus.releases.push(structuredClone(corpus.releases.find((release) => release.releaseId === input.source.releaseId)!));
    failure(() => compileProjection(input, [corpus]), 'SOURCE_NOT_AVAILABLE');
  });

  it.each(['DOMAIN', 'CORPUS', 'NON_FIXTURE'] as const)('rejects an inconsistent release binding: %s', (change) => {
    const { corpus, release, input } = cloned();
    if (change === 'DOMAIN') release.domain = 'TRADEWIND';
    if (change === 'CORPUS') release.corpusId = 'another-corpus';
    if (change === 'NON_FIXTURE') Object.assign(release, { fixture_only: false });
    failure(() => compileProjection(input, [corpus]), 'SOURCE_NOT_AVAILABLE');
  });

  it.each(['releaseDigest', 'manifestCommitment', 'snapshotDigest'] as const)('rejects mismatched pinned source version %s', (field) => {
    const input = spec();
    input.source[field] = `${field === 'snapshotDigest' ? 'sha256:' : ''}${'0'.repeat(64)}`;
    failure(() => compileProjection(input), 'SOURCE_VERSION_MISMATCH');
  });

  it.each(['VALUE', 'MEMBERSHIP', 'RIGHTS', 'GOVERNANCE', 'MANIFEST'] as const)('recomputes committed source integrity rather than trusting fixture labels: %s', (change) => {
    const { corpus, release, input } = cloned();
    if (change === 'VALUE') record(corpus).value = 999;
    if (change === 'MEMBERSHIP') corpus.records.push({ ...record(corpus), recordId: 'new-uncommitted-record' });
    if (change === 'RIGHTS') release.sources[0].permittedUses.push('trading');
    if (change === 'GOVERNANCE') corpus.governance.informationBarrier = 'Altered uncommitted governance';
    if (change === 'MANIFEST') release.coverage = 'Altered uncommitted coverage';
    const damaged = structuredClone(corpus);
    failure(() => compileProjection(input, [corpus]), 'SOURCE_INTEGRITY_FAILED');
    expect(corpus).toEqual(damaged);
  });

  it('does not accept a bogus stored digest merely because the caller repeats it', () => {
    const { corpus, release, input } = cloned();
    release.releaseDigest = '0'.repeat(64);
    input.source.releaseDigest = release.releaseDigest;
    failure(() => compileProjection(input, [corpus]), 'SOURCE_INTEGRITY_FAILED');
  });

  it('makes withheld, unknown, not-yet-known and out-of-validity IDs indistinguishable at the error boundary', () => {
    const requests = [
      spec(['REC-0305']), // Source prohibits delivery.
      spec(['REC-0401']), // Deliverable source, private-preflight record.
      spec(['REC-never-existed']),
      { ...spec(['REC-0204']), selection: { ...spec(['REC-0204']).selection, knownAt: '2026-08-25T13:59:59.999Z' } },
      { ...spec(['REC-0204']), selection: { ...spec(['REC-0204']).selection, validAt: '2026-08-17T15:19:59.999Z' } },
      { ...spec(['REC-0101']), viewer: 'PUBLIC_RULING' as const },
    ];
    const errors = requests.map((input) => failure(() => compileProjection(input), 'SELECTION_NOT_AVAILABLE'));
    expect(new Set(errors.map((error) => error.message)).size).toBe(1);
    for (const error of errors) {
      expect(error.message).not.toMatch(/REC-|harbourline|northgate|PRIVATE_PREFLIGHT/);
      expect(JSON.stringify(error)).not.toMatch(/REC-|harbourline|northgate|PRIVATE_PREFLIGHT/);
    }
  });

  it('refuses mixed allowed/private selections atomically in every available representation', () => {
    for (const view of [EVIDENCE, GRAPH]) {
      const input = { ...spec(['REC-0204', 'REC-0401']), view };
      const error = failure(() => compileProjection(input), 'SELECTION_NOT_AVAILABLE');
      expect(error).not.toHaveProperty('records');
      expect(error).not.toHaveProperty('graph');
      expect(error.message).not.toContain('REC-0401');
    }
  });

  it('requires membership in the pinned release even when the record exists in later corpus inventory', () => {
    const old = CORPUS.releases[0];
    const input = spec(['REC-0204'], CORPUS, old);
    failure(() => compileProjection(input), 'SELECTION_NOT_AVAILABLE');
  });

  it('requires membership in the exact legacy committed record set, not only a numerically earlier source clock', () => {
    const { corpus, release } = cloned();
    record(corpus).knownAt = '2026-09-01T13:00:00+02:00';
    expect(Date.parse(record(corpus).knownAt)).toBeLessThan(Date.parse(release.knownAt));
    // The existing v0 release membership uses lexical time comparison. A projection cannot silently expand it.
    expect(releaseCanonical(corpus, release.releaseId)?.map((entry) => entry.recordId)).not.toContain('REC-0204');
    restamp(corpus, release);
    failure(() => compileProjection(spec(['REC-0204'], corpus, release), [corpus]), 'SELECTION_NOT_AVAILABLE');
  });

  it('rejects duplicate selected record identities without returning partial records', () => {
    const { corpus, release, input } = cloned();
    corpus.records.push(structuredClone(record(corpus)));
    restamp(corpus, release);
    input.source.releaseDigest = release.releaseDigest;
    input.source.manifestCommitment = release.certification.manifestCommitment;
    failure(() => compileProjection(input, [corpus]), 'SOURCE_INTEGRITY_FAILED');
  });

  it.each(['SUBJECT_ALIAS', 'SUBJECT_COLLISION', 'RECORD_COLLISION', 'CROSS_KIND_COLLISION', 'SUBJECT_TYPE'] as const)(
    'rejects incompatible canonical referents in evidence and graph views: %s', (change) => {
      const { corpus, release } = cloned();
      const first = record(corpus, 'REC-0203');
      const second = record(corpus, 'REC-0204');
      if (change === 'SUBJECT_ALIAS') second.subjectCanonicalId = 'notation://entity/conflicting-subject';
      if (change === 'SUBJECT_COLLISION') second.subjectId = 'LOT-DIFFERENT';
      if (change === 'RECORD_COLLISION') second.canonicalId = first.canonicalId;
      if (change === 'CROSS_KIND_COLLISION') second.canonicalId = first.subjectCanonicalId;
      if (change === 'SUBJECT_TYPE') second.subjectType = 'Sample';
      restamp(corpus, release);
      for (const view of [EVIDENCE, GRAPH]) {
        failure(() => compileProjection({ ...spec(['REC-0203', 'REC-0204'], corpus, release), view }, [corpus]), 'SOURCE_INTEGRITY_FAILED');
      }
    });

  it.each(['VALID_FROM', 'VALID_TO', 'RETRACTION'] as const)('reports malformed selected source clocks as typed integrity failures: %s', (clock) => {
    const { corpus, release, input } = cloned();
    let selected = 'REC-0204';
    if (clock === 'VALID_FROM') record(corpus).validFrom = 'not an instant';
    if (clock === 'VALID_TO') record(corpus).validTo = '2026-02-30T00:00:00Z';
    if (clock === 'RETRACTION') {
      selected = 'REC-0111';
      corpus.retractions.find((item) => item.retractionId === 'RET-0002')!.issuedAt = '2026-02-30T00:00:00Z';
    }
    restamp(corpus, release);
    input.source.releaseDigest = release.releaseDigest;
    input.source.manifestCommitment = release.certification.manifestCommitment;
    input.selection.recordIds = [selected];
    failure(() => compileProjection(input, [corpus]), 'SOURCE_INTEGRITY_FAILED');
  });

  it('applies delivery rights before public visibility and requires a source schedule', () => {
    for (const variant of ['NO_DELIVERY', 'NO_SCHEDULE'] as const) {
      const { corpus, release } = cloned();
      record(corpus).visibility = 'PUBLIC_RULING';
      const sourceId = record(corpus).provenance.sourceId;
      if (variant === 'NO_DELIVERY') {
        // Delivery is an exact source-use decision from the registration; the derived permittedUses summary follows it.
        const source = release.sources.find((item) => item.sourceId === sourceId)!;
        source.registration = { ...source.registration, allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'] };
        source.permittedUses = ['acquisition', 'normalization'];
      }
      else release.sources = release.sources.filter((source) => source.sourceId !== sourceId);
      restamp(corpus, release);
      failure(() => compileProjection({ ...spec(['REC-0204'], corpus, release), viewer: 'PUBLIC_RULING' }, [corpus]), 'SELECTION_NOT_AVAILABLE');
    }
  });

  it('permits public records to both public and counterparty viewers without upgrading private records', () => {
    const { corpus, release } = cloned();
    record(corpus).visibility = 'PUBLIC_RULING';
    restamp(corpus, release);
    const input = spec(['REC-0204'], corpus, release);
    expect(compileProjection(input, [corpus]).records).toHaveLength(1);
    expect(compileProjection({ ...input, viewer: 'PUBLIC_RULING' }, [corpus]).records).toHaveLength(1);
    const privateInput = spec(['REC-0401'], corpus, release);
    failure(() => compileProjection(privateInput, [corpus]), 'SELECTION_NOT_AVAILABLE');
  });

  it('honors inclusive validFrom and exclusive validTo without replacing absence by a zero', () => {
    const { corpus, release } = cloned();
    record(corpus).validTo = '2026-08-18T00:00:00Z';
    restamp(corpus, release);
    const input = spec(['REC-0204'], corpus, release);
    for (const validAt of ['2026-08-17T15:20:00.000Z', '2026-08-17T23:59:59.999Z']) {
      expect(compileProjection({ ...input, selection: { ...input.selection, validAt } }, [corpus]).records).toHaveLength(1);
    }
    for (const validAt of ['2026-08-17T15:19:59.999Z', '2026-08-18T00:00:00.000Z']) {
      failure(() => compileProjection({ ...input, selection: { ...input.selection, validAt } }, [corpus]), 'SELECTION_NOT_AVAILABLE');
    }
  });

  it('does not conflate world time with knowledge time when the selected validity is in the future', () => {
    const { corpus, release } = cloned();
    record(corpus).validFrom = '2027-01-01T00:00:00Z';
    restamp(corpus, release);
    const input = spec(['REC-0204'], corpus, release);
    input.selection.validAt = '2027-01-01T00:00:00Z';
    expect(compileProjection(input, [corpus]).records).toHaveLength(1);
  });

  it('is deterministic across reordered inputs and binds the full result to compiler/spec provenance', () => {
    const one = compileProjection(spec(['REC-0204', 'REC-0101']));
    const two = compileProjection(spec(['REC-0101', 'REC-0204']));
    expect(one).toEqual(two);
    expect(one.provenance).toEqual({ compilerId: 'payload.fixture-projection', compilerVersion: '1.0.0',
      transformIdentity: 'payload.projection/RECORDS/v1', specDigest: hash(one.spec), sourceSelectionDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
    const { digest, ...body } = one;
    expect(digest).toBe(hash(body));
    expect(compileProjection({ ...spec(['REC-0101', 'REC-0204']), view: GRAPH }).provenance.transformIdentity).toBe('payload.projection/GRAPH/v1');
  });

  it('changes selection and result commitments when source membership, content or historical status changes', () => {
    const original = compileProjection(spec());
    const more = compileProjection(spec(['REC-0101', 'REC-0204']));
    expect(more.provenance.sourceSelectionDigest).not.toBe(original.provenance.sourceSelectionDigest);
    expect(more.digest).not.toBe(original.digest);
    const { corpus, release } = cloned();
    record(corpus).value = 42.25;
    restamp(corpus, release);
    const changed = compileProjection(spec(['REC-0204'], corpus, release), [corpus]);
    expect(changed.provenance.sourceSelectionDigest).not.toBe(original.provenance.sourceSelectionDigest);
    expect(changed.digest).not.toBe(original.digest);
  });

  it('rejects metadata drift under the old snapshot and binds a refreshed source version into the selection digest', () => {
    const original = compileProjection(spec());
    const { corpus, release, input } = cloned();
    record(corpus).evidenceClass = { ...record(corpus).evidenceClass, interest: 'unknown' };
    record(corpus).provenance.contentHash = 'a'.repeat(64);
    // This legacy release digest does not commit these fields; do not imply otherwise.
    expect(rawHash({ releaseId: release.releaseId, corpusId: corpus.corpusId, knownAt: release.knownAt,
      records: releaseCanonical(corpus, release.releaseId) })).toBe(release.releaseDigest);
    failure(() => compileProjection(input, [corpus]), 'SOURCE_VERSION_MISMATCH');
    const refreshed = spec(['REC-0204'], corpus, release);
    expect(refreshed.source.releaseDigest).toBe(input.source.releaseDigest);
    expect(refreshed.source.manifestCommitment).toBe(input.source.manifestCommitment);
    expect(refreshed.source.snapshotDigest).not.toBe(input.source.snapshotDigest);
    const changed = compileProjection(refreshed, [corpus]);
    expect(changed.provenance.sourceSelectionDigest).not.toBe(original.provenance.sourceSelectionDigest);
    expect(changed.digest).not.toBe(original.digest);
    expect(changed.nonclaims.independentlyVerified).toBe(false);
  });

  it.each(['TITLE', 'CONTENT_HASH', 'CANONICAL_SUBJECT', 'SUBJECT_TYPE', 'OBSERVED_AT', 'VISIBILITY', 'RELEASE_NOTE', 'PRIVATE_METADATA'] as const)(
    'pins the complete source snapshot against otherwise uncommitted metadata drift: %s', (change) => {
      const { corpus, release, input } = cloned();
      const selected = record(corpus);
      if (change === 'TITLE') selected.title = 'Changed source title';
      if (change === 'CONTENT_HASH') selected.provenance.contentHash = 'b'.repeat(64);
      if (change === 'CANONICAL_SUBJECT') selected.subjectCanonicalId = 'notation://entity/different-source-identity';
      if (change === 'SUBJECT_TYPE') selected.subjectType = 'DifferentSourceType';
      if (change === 'OBSERVED_AT') selected.observedAt = '2026-08-17T15:21:00Z';
      if (change === 'VISIBILITY') selected.visibility = 'PRIVATE_PREFLIGHT';
      if (change === 'RELEASE_NOTE') release.note = 'Changed source release metadata';
      if (change === 'PRIVATE_METADATA') record(corpus, 'REC-0401').title = 'Changed withheld record metadata';
      const error = failure(() => compileProjection(input, [corpus]), 'SOURCE_VERSION_MISMATCH');
      expect(error.message).not.toMatch(/REC-|private|withheld/i);
      expect(input.source.snapshotDigest).not.toBe(describeProjectionSource(release.releaseId, [corpus]).source.snapshotDigest);
    });

  it('does not change an earlier source snapshot for a still-future correction or unrelated future record', () => {
    const corpus = structuredClone(CORPUS);
    const release = corpus.releases[0];
    const input = spec(['REC-0111'], corpus, release);
    const before = describeProjectionSource(release.releaseId, [corpus]);
    corpus.retractions.find((item) => item.retractionId === 'RET-0002')!.reason = 'Different future withdrawal reason';
    const future = record(corpus, 'REC-0204');
    future.title = 'Different future record title';
    future.value = 999;
    expect(describeProjectionSource(release.releaseId, [corpus])).toEqual(before);
    expect(compileProjection(input, [corpus]).records[0].statusAtKnownAt).toBe('CURRENT');
  });

  it('changes the source snapshot if a correction known to the release changes its historical status', () => {
    const { corpus, release, input } = cloned();
    const ret = corpus.retractions.find((item) => item.retractionId === 'RET-0002')!;
    // This timestamp remains within the release, so the v0 manifest retains the same applied-retraction IDs.
    ret.issuedAt = '2026-08-29T15:00:00Z';
    expect(rawHash(buildReleaseManifest(corpus, release))).toBe(input.source.manifestCommitment);
    failure(() => compileProjection(input, [corpus]), 'SOURCE_VERSION_MISMATCH');
  });

  it('produces fully copied records, rights, graph and spec without changing frozen source fixtures', () => {
    const { corpus, release } = cloned();
    const input = spec(['REC-0204'], corpus, release);
    input.view = { ...GRAPH };
    const beforeCorpus = structuredClone(corpus);
    const beforeSpec = structuredClone(input);
    const result = compileProjection(freeze(input), freeze([corpus]));
    result.records[0].provenance.sourceId = 'changed-output-only';
    result.records[0].uncertainty!.semantics = 'changed-output-only';
    result.records[0].rights!.permittedUses.push('trading');
    result.records[0].evidenceClass.interest = 'unknown';
    result.graph!.nodes[0].id = 'changed-output-only';
    result.spec.selection.recordIds.push('changed-output-only');
    result.spec.source.corpusId = 'changed-output-only';
    expect(corpus).toEqual(beforeCorpus);
    expect(input).toEqual(beforeSpec);
    expect(compileProjection(input, [corpus]).records[0].provenance.sourceId).toBe(record(corpus).provenance.sourceId);
  });
});
