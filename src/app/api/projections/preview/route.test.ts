import { createHash } from 'node:crypto';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { canonicalJson } from '@/fixtures/digest';
import type { ProjectionSpec, ProjectionView } from '@/projection/spec';
import { describeProjectionSource } from '@/projection/source';
import { GET as GET_SOURCE } from '../sources/[releaseId]/route';
import { POST } from './route';

const URL = 'http://localhost:3000/api/projections/preview';
const MAX_BYTES = 32 * 1024;
const release = CARAVAN_CORPUS.releases.find((item) => item.status === 'CURRENT')!;
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;

function spec(): ProjectionSpec {
  return {
    schema: 'payload.projection-spec.v1',
    source: describeProjectionSource(release.releaseId).source,
    selection: { recordIds: ['REC-0101'], knownAt: release.knownAt, validAt: '2026-09-01T12:00:00Z' },
    view: { mode: 'EVIDENCE', coordinateSemantics: 'NONE', representation: 'RECORDS' },
    viewer: 'COUNTERPARTY_SHARED',
  };
}

function request(value: unknown, headers: HeadersInit = {}) {
  return new Request(URL, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });
}

function streamRequest(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let cancelled = false;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body, duplex: 'half',
  };
  return { request: new Request(URL, init), cancelled: () => cancelled };
}

function expectBoundary(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-payload-fixture-only')).toBe('true');
  expect(response.headers.get('content-type')).toContain('application/json');
}

async function expectRefusal(input: Request, status: number, error: string) {
  const response = await POST(input);
  expect(response.status).toBe(status);
  expectBoundary(response);
  expect(await response.json()).toEqual({ fixture_only: true, error });
}

it.each(CARAVAN_CORPUS.releases.map((entry) => entry.releaseId))('describes exact fixture source %s without enumerating record inventory', async (releaseId) => {
  const response = await GET_SOURCE(new Request(`http://localhost:3000/api/projections/sources/${encodeURIComponent(releaseId)}`),
    { params: Promise.resolve({ releaseId }) });
  expect(response.status).toBe(200);
  expectBoundary(response);
  const body = await response.json();
  const described = CARAVAN_CORPUS.releases.find((entry) => entry.releaseId === releaseId)!;
  expect(body).toEqual({ schema: 'payload.projection-source.v1', fixture_only: true,
    source: { kind: 'CORPUS_RELEASE', corpusId: CARAVAN_CORPUS.corpusId, releaseId,
      releaseDigest: described.releaseDigest, manifestCommitment: described.certification.manifestCommitment,
      snapshotDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
    domain: described.domain, buildId: described.build.buildId, knownAt: described.knownAt,
    snapshotCodec: 'payload.fixture-projection-source.v1' });
  expect(body).toEqual(describeProjectionSource(releaseId));
  expect(JSON.stringify(body)).not.toMatch(/REC-|SAMPLE-|LOT-|harbourline|northgate|\.payload|PRIVATE_PREFLIGHT/);
  const input = spec();
  input.source = body.source;
  input.selection.knownAt = body.knownAt;
  const preview = await POST(request(input));
  expect(preview.status).toBe(200);
  expect((await preview.json()).spec.source).toEqual(body.source);
});

it.each(['NOT-PRESENT', 'latest', 'REC-0101'])('returns a generic source-descriptor refusal for %s', async (releaseId) => {
  const response = await GET_SOURCE(new Request(URL), { params: Promise.resolve({ releaseId }) });
  expect(response.status).toBe(404);
  expectBoundary(response);
  expect(await response.json()).toEqual({ fixture_only: true, error: 'SOURCE_NOT_AVAILABLE' });
});

it('redacts an unexpected descriptor-resolution failure', async () => {
  const response = await GET_SOURCE(new Request(URL), { params: Promise.reject(new Error('private-source-path')) });
  expect(response.status).toBe(503);
  expectBoundary(response);
  expect(await response.json()).toEqual({ fixture_only: true, error: 'PROJECTION_UNAVAILABLE' });
});

it('returns a deterministic, exact-reference evidence projection with no authoritative or renderer claims', async () => {
  const input = spec();
  const original = canonicalJson(CARAVAN_CORPUS);
  const response = await POST(request(input));
  expect(response.status).toBe(200);
  expectBoundary(response);
  const body = await response.json();
  expect(body).toMatchObject({
    schema: 'payload.projection.v1', fixture_only: true, authority: 'REPLACEABLE_PROJECTION',
    status: 'READY', error: null, engine: 'records', graph: null,
    spec: { source: input.source, selection: { recordIds: ['REC-0101'], knownAt: '2026-09-01T12:00:00.000Z' } },
    nonclaims: { sourceMutated: false, canonicalAdmission: false, relationInferred: false,
      sourceTruthClaimed: false, independentlyVerified: false, rendererExecuted: false },
  });
  expect(body.records).toHaveLength(1);
  const source = CARAVAN_CORPUS.records.find((record) => record.recordId === 'REC-0101')!;
  expect(body.records[0]).toMatchObject({ recordId: source.recordId, canonicalId: source.canonicalId,
    subject: { subjectId: source.subjectId, canonicalId: source.subjectCanonicalId, subjectType: source.subjectType },
    value: source.value, evidenceClass: source.evidenceClass, provenance: source.provenance,
    validity: { validFrom: source.validFrom, validTo: null }, knownAt: source.knownAt, statusAtKnownAt: 'CURRENT' });
  expect(body.provenance.specDigest).toBe(hash(body.spec));
  expect(body.provenance.sourceSelectionDigest).toBe(hash(body.records));
  const { digest, ...unsigned } = body;
  expect(digest).toBe(hash(unsigned));
  expect(await (await POST(request(input))).json()).toEqual(body);
  expect(canonicalJson(CARAVAN_CORPUS)).toBe(original);
});

it('returns only declared record-to-subject graph edges while preserving evidence-view identities', async () => {
  const input = spec();
  input.selection.recordIds = ['REC-0204', 'REC-0202', 'REC-0201'];
  const evidence = await (await POST(request(input))).json();
  input.view = { mode: 'STRUCTURE', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'GRAPH' };
  const response = await POST(request(input));
  expect(response.status).toBe(200);
  expectBoundary(response);
  const graph = await response.json();
  expect(graph).toMatchObject({ status: 'READY', engine: 'Three.js', error: null });
  expect(graph.records).toEqual(evidence.records);
  expect(graph.provenance.sourceSelectionDigest).toBe(evidence.provenance.sourceSelectionDigest);
  expect(graph.graph.nodes).toHaveLength(5);
  expect(graph.graph.edges).toEqual(graph.records.map((record: { recordId: string; canonicalId: string; subject: { canonicalId: string } }) => ({
    recordId: record.recordId, source: record.canonicalId, target: record.subject.canonicalId, kind: 'RECORD_ABOUT_SUBJECT',
  })));
  expect(graph.graph.nodes.filter((node: { kind: string }) => node.kind === 'SUBJECT')).toHaveLength(2);
  expect(JSON.stringify(graph.graph)).not.toMatch(/longitude|latitude|coordinates|position/);
});

it.each([
  ['rights withheld', (value: ProjectionSpec) => { value.selection.recordIds = ['REC-0305']; }],
  ['private visibility', (value: ProjectionSpec) => { value.selection.recordIds = ['REC-0401']; }],
  ['unknown identity', (value: ProjectionSpec) => { value.selection.recordIds = ['REC-NOT-PRESENT']; }],
  ['public viewer', (value: ProjectionSpec) => { value.viewer = 'PUBLIC_RULING'; }],
  ['not yet known', (value: ProjectionSpec) => { value.selection.recordIds = ['REC-0303']; value.selection.knownAt = '2026-08-27T12:00:00Z'; }],
  ['outside validity', (value: ProjectionSpec) => { value.selection.validAt = '2026-08-03T09:59:59Z'; }],
  ['partial mixed selection', (value: ProjectionSpec) => { value.selection.recordIds.push('REC-0305'); }],
] as const)('uses the same non-enumerating refusal for %s', async (_label, change) => {
  const input = spec();
  change(input);
  await expectRefusal(request(input), 404, 'SELECTION_NOT_AVAILABLE');
});

it('refuses a record newer than an explicitly selected historical release', async () => {
  const input = spec();
  const historical = CARAVAN_CORPUS.releases[0];
  input.source = describeProjectionSource(historical.releaseId).source;
  input.selection.knownAt = historical.knownAt;
  input.selection.recordIds = ['REC-0201'];
  await expectRefusal(request(input), 404, 'SELECTION_NOT_AVAILABLE');
});

it('preserves historical status without disclosing later correction pointers', async () => {
  const input = spec();
  input.selection.recordIds = ['REC-0203'];
  input.selection.knownAt = '2026-08-25T13:59:59Z';
  const before = await (await POST(request(input))).json();
  input.selection.knownAt = '2026-08-25T14:00:00Z';
  const after = await (await POST(request(input))).json();
  expect(before.records[0].statusAtKnownAt).toBe('CURRENT');
  expect(after.records[0].statusAtKnownAt).toBe('SUPERSEDED');
  for (const body of [before, after]) {
    expect(body.records[0]).not.toHaveProperty('supersedesRecordId');
    expect(body.records[0]).not.toHaveProperty('supersededByRecordId');
    expect(body.records[0]).not.toHaveProperty('retractedByRetractionId');
    expect(JSON.stringify(body)).not.toContain('REC-0204');
  }
});

it.each(['releaseDigest', 'manifestCommitment', 'snapshotDigest'] as const)('requires the exact source %s', async (field) => {
  const input = spec();
  input.source[field] = `${field === 'snapshotDigest' ? 'sha256:' : ''}${'0'.repeat(64)}`;
  await expectRefusal(request(input), 409, 'SOURCE_VERSION_MISMATCH');
});

it.each(['corpusId', 'releaseId'] as const)('does not enumerate alternatives for a missing %s', async (field) => {
  const input = spec();
  input.source[field] = 'NOT-PRESENT';
  await expectRefusal(request(input), 404, 'SOURCE_NOT_AVAILABLE');
});

it('refuses knowledge after the exact release cutoff', async () => {
  const input = spec();
  input.selection.knownAt = '2026-09-01T12:00:00.001Z';
  await expectRefusal(request(input), 400, 'KNOWLEDGE_AFTER_RELEASE');
});

it.each([
  ['top-level authority', (value: ProjectionSpec) => ({ ...value, authority: 'CANONICAL_STATE' })],
  ['top-level command', (value: ProjectionSpec) => ({ ...value, command: 'save' })],
  ['source overrides', (value: ProjectionSpec) => ({ ...value, source: { ...value.source, root: '.payload/evidence' } })],
  ['unsupported source kind', (value: ProjectionSpec) => ({ ...value, source: { ...value.source, kind: 'INQUIRY_STATE' } })],
  ['unsupported canonical state', (value: ProjectionSpec) => ({ ...value, source: { ...value.source, kind: 'CANONICAL_VERSION' } })],
  ['private viewer', (value: ProjectionSpec) => ({ ...value, viewer: 'PRIVATE_PREFLIGHT' })],
  ['internal viewer', (value: ProjectionSpec) => ({ ...value, viewer: 'INTERNAL_ONLY' })],
  ['selection authority', (value: ProjectionSpec) => ({ ...value, selection: { ...value.selection, includeHidden: true } })],
  ['view side effect', (value: ProjectionSpec) => ({ ...value, view: { ...value.view, save: true } })],
  ['duplicate record', (value: ProjectionSpec) => ({ ...value, selection: { ...value.selection, recordIds: ['REC-0101', 'REC-0101'] } })],
  ['empty selection', (value: ProjectionSpec) => ({ ...value, selection: { ...value.selection, recordIds: [] } })],
  ['oversized selection', (value: ProjectionSpec) => ({ ...value, selection: { ...value.selection, recordIds: Array.from({ length: 129 }, (_, index) => `REC-${index}`) } })],
  ['invalid source hash', (value: ProjectionSpec) => ({ ...value, source: { ...value.source, releaseDigest: 'latest' } })],
  ['invalid snapshot hash', (value: ProjectionSpec) => ({ ...value, source: { ...value.source, snapshotDigest: '0'.repeat(64) } })],
  ['missing snapshot hash', (value: ProjectionSpec) => ({ ...value, source: { kind: value.source.kind, corpusId: value.source.corpusId,
    releaseId: value.source.releaseId, releaseDigest: value.source.releaseDigest, manifestCommitment: value.source.manifestCommitment } })],
  ['calendar rollover', (value: ProjectionSpec) => ({ ...value, selection: { ...value.selection, validAt: '2026-02-30T12:00:00Z' } })],
  ['ambiguous time', (value: ProjectionSpec) => ({ ...value, selection: { ...value.selection, knownAt: '2026-09-01T12:00:00' } })],
  ['geographic graph mismatch', (value: ProjectionSpec) => ({ ...value, view: { mode: 'MAP', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'POINT' } })],
] as const)('rejects %s without returning input details', async (_label, change) => {
  await expectRefusal(request(change(spec())), 400, 'INVALID_PROJECTION_SPEC');
});

it.each([
  [{ mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'POINT' }, 'kepler.gl'],
  [{ mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'DENSITY' }, 'kepler.gl'],
  [{ mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' }, 'CesiumJS'],
  [{ mode: 'STRUCTURE', coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'MESH' }, 'Three.js'],
  [{ mode: 'STRUCTURE', coordinateSemantics: 'FEATURE_SPACE', representation: 'FIELD' }, 'Three.js'],
  [{ mode: 'STRUCTURE', coordinateSemantics: 'ARBITRARY_MODEL_SPACE', representation: 'MESH' }, 'Three.js'],
] as const)('returns typed missing geometry for %j without executing %s', async (view, engine) => {
  const input = spec();
  input.view = { ...view } as ProjectionView;
  const response = await POST(request(input));
  expect(response.status).toBe(200);
  expectBoundary(response);
  const body = await response.json();
  expect(body).toMatchObject({ fixture_only: true, engine, status: 'UNAVAILABLE', error: 'GEOMETRY_NOT_AVAILABLE', graph: null,
    nonclaims: { rendererExecuted: false, sourceMutated: false, relationInferred: false, sourceTruthClaimed: false } });
  expect(body.records.map((record: { recordId: string }) => record.recordId)).toEqual(['REC-0101']);
  // A sample declares no position: a geodetic route says so explicitly and carries no coordinate; every other route carries no geometry at all.
  expect(body.geometry).toEqual(view.coordinateSemantics === 'GEODETIC' ? { datum: 'WGS84', positions: [], unplaced: ['REC-0101'] } : null);
  expect(JSON.stringify(body)).not.toMatch(/"(?:longitude|latitude|coordinates|vertices|mesh)"\s*:/);
});

test('places a selected record where its own subject declares a position, through the endpoint, with the declaring source and evidence class', async () => {
  const input = spec();
  input.selection = { ...input.selection, recordIds: ['REC-0204'], validAt: '2026-08-17T15:20:00Z' };
  input.view = { mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' };
  const response = await POST(request(input));
  expect(response.status).toBe(200);
  expectBoundary(response);
  const body = await response.json();
  expect(body).toMatchObject({ status: 'READY', error: null, engine: 'CesiumJS', nonclaims: { positionInferred: false, rendererExecuted: false } });
  expect(body.geometry).toMatchObject({ datum: 'WGS84', unplaced: [], positions: [{ recordId: 'REC-0204', positionRecordId: 'REC-0207', point: { longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 250 }, evidenceClass: { interest: 'disinterested' } }] });
});

it.each(['text/plain', 'application/octet-stream', ''])('refuses unsupported content type %s', async (contentType) => {
  await expectRefusal(request(spec(), { 'content-type': contentType }), 415, 'INVALID_CONTENT_TYPE');
});

it('accepts JSON media type casing and parameters', async () => {
  const response = await POST(request(spec(), { 'content-type': 'Application/JSON; charset=utf-8' }));
  expect(response.status).toBe(200);
  expectBoundary(response);
});

it.each(['', '{', 'null garbage', '{"schema":}'])('rejects malformed JSON %j', async (body) => {
  await expectRefusal(new Request(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body }), 400, 'INVALID_JSON');
});

it('rejects a missing body and invalid UTF-8 bytes rather than replacing them', async () => {
  await expectRefusal(new Request(URL, { method: 'POST', headers: { 'content-type': 'application/json' } }), 400, 'INVALID_JSON');
  const streamed = streamRequest([new TextEncoder().encode('{"x":"'), new Uint8Array([0xc3, 0x28]), new TextEncoder().encode('"}')]);
  await expectRefusal(streamed.request, 400, 'INVALID_JSON');
});

it('accepts exactly 32 KiB of streamed JSON regardless of a falsified content-length', async () => {
  const body = JSON.stringify(spec()).padEnd(MAX_BYTES, ' ');
  const bytes = new TextEncoder().encode(body);
  const streamed = streamRequest([bytes.slice(0, 109), bytes.slice(109, 16000), bytes.slice(16000)], { 'content-length': '1' });
  const response = await POST(streamed.request);
  expect(response.status).toBe(200);
  expectBoundary(response);
  expect((await response.json()).status).toBe('READY');
});

it('cancels oversized streaming input before parsing, ignoring a falsified small content-length', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(spec()).padEnd(MAX_BYTES + 1, ' '));
  const streamed = streamRequest([bytes.slice(0, 16384), bytes.slice(16384), new Uint8Array(1)], { 'content-length': '1' });
  await expectRefusal(streamed.request, 413, 'BODY_TOO_LARGE');
  expect(streamed.cancelled()).toBe(true);
});

it('keeps the body-too-large refusal when best-effort stream cancellation fails', async () => {
  let cancellationAttempted = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(MAX_BYTES + 1)); },
    cancel() {
      cancellationAttempted = true;
      return Promise.reject(new Error('private-stream-cancellation-detail'));
    },
  });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1' }, body, duplex: 'half',
  };
  await expectRefusal(new Request(URL, init), 413, 'BODY_TOO_LARGE');
  expect(cancellationAttempted).toBe(true);
});

it('counts encoded UTF-8 bytes rather than JavaScript characters toward the body limit', async () => {
  const body = JSON.stringify({ ...spec(), extra: 'é'.repeat(17000) });
  expect(body.length).toBeLessThan(MAX_BYTES);
  const bytes = new TextEncoder().encode(body);
  expect(bytes.length).toBeGreaterThan(MAX_BYTES);
  await expectRefusal(streamRequest([bytes], { 'content-length': String(body.length) }).request, 413, 'BODY_TOO_LARGE');
});

it('does not trust an exaggerated content-length for an otherwise bounded valid body', async () => {
  const response = await POST(request(spec(), { 'content-length': '99999999' }));
  expect(response.status).toBe(200);
  expectBoundary(response);
});

it('returns a redacted invalid-JSON error when the stream fails', async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('private-source-path')); } });
  const init: RequestInit & { duplex: 'half' } = { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' };
  await expectRefusal(new Request(URL, init), 400, 'INVALID_JSON');
});
