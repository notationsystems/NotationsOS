import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { CARAVAN_DEMO_DEFINITION, CARAVAN_DEMO_PURPOSE, caravanDemoContent, caravanDemoSource } from '../../src/production/demo';
import type { ProductionObjectKind, ProductionRef, ProductionResult, ProductionSourceConfig } from '../../src/production/contracts';
import { GAT_ADAPTER_VERSION } from '../../src/gat/pin';

test.skip(process.env.PRODUCTION_E2E !== '1', 'Use the isolated production acceptance runner.');
async function execute(client: APIRequestContext, requestId: string, fields: Record<string, unknown>): Promise<ProductionResult> {
  const response = await client.post('/api/production', { data: { schema: 'payload.production-command.v1', requestId, ...fields } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
function output(result: ProductionResult, kind: ProductionObjectKind): ProductionRef {
  const ref = result.run.outputs.find((item) => item.kind === kind);
  expect(ref).toBeDefined();
  return { id: ref!.id, digest: ref!.digest };
}
async function inspect(client: APIRequestContext, kind: ProductionObjectKind, reference: ProductionRef) {
  const response = await client.post('/api/production/inspect', { data: { schema: 'payload.production-inspection-request.v1', kind, reference } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test('actual HTTP Carrier workflow, historical retry and failure preservation', async ({ request }) => {
  const inventoryResponse = await request.get('/api/production/source-inventory');
  expect(inventoryResponse.status(), await inventoryResponse.text()).toBe(200);
  const inventory = await inventoryResponse.json();
  expect(inventory).toMatchObject({ schema: 'payload.source-integration-inventory.v1',
    summary: { total: 21, prototypeAdaptersDeclared: 8, prototypeWithoutAdapter: 13, integrated: 0, selected: 0 },
    connectionEstablished: false, liveCollectionEnabled: false, currentRightsGrant: false });
  expect(inventory.entries.find((entry: { sourceId: string }) => entry.sourceId === 'fmcsa-qcmobile')).toMatchObject({
    prototypeStanding: 'ADAPTER_DECLARED', integrationState: 'NOT_INTEGRATED', lastAcquisition: null });
  const corpus = output(await execute(request, 'http-caravan-corpus', { kind: 'REGISTER_CORPUS', definition: CARAVAN_DEMO_DEFINITION }), 'CORPUS');
  const source = output(await execute(request, 'http-caravan-source', { kind: 'REGISTER_SOURCE', source: caravanDemoSource(corpus) }), 'SOURCE');
  const fields = { kind: 'ACQUIRE', source, purpose: CARAVAN_DEMO_PURPOSE, contentBase64: caravanDemoContent() };
  const captured = await execute(request, 'http-caravan-capture', fields);
  expect(captured.run.state).toBe('COMPLETED');
  expect(await execute(request, 'http-caravan-capture', fields)).toEqual({ ...captured, status: 'EXISTING', historicalRetry: true });
  const acquisition = output(captured, 'ACQUISITION');
  const original = await inspect(request, 'ACQUISITION', acquisition);
  const normalized = await execute(request, 'http-caravan-normalize', { kind: 'NORMALIZE', source, acquisition, purpose: CARAVAN_DEMO_PURPOSE });
  const normalization = output(normalized, 'NORMALIZATION');
  expect((await inspect(request, 'NORMALIZATION', normalization)).data.candidate).toMatchObject({ state: 'UNADMITTED', identity: { state: 'UNRESOLVED' } });
  const built = await execute(request, 'http-caravan-build', { kind: 'BUILD_CANDIDATES', corpus, members: [normalization], purpose: CARAVAN_DEMO_PURPOSE });
  expect((await inspect(request, 'CANDIDATE_BUILD', output(built, 'CANDIDATE_BUILD'))).data).toMatchObject({ state: 'UNADMITTED', recordCount: 1, releaseActivated: false });
  const bad = output(await execute(request, 'http-malformed-capture', { ...fields, contentBase64: Buffer.from('{bad').toString('base64') }), 'ACQUISITION');
  const quarantined = await execute(request, 'http-malformed-normalize', { kind: 'NORMALIZE', source, acquisition: bad, purpose: CARAVAN_DEMO_PURPOSE });
  expect(quarantined.run).toMatchObject({ state: 'QUARANTINED', failure: { code: 'INVALID_SOURCE_JSON', artifactRetained: true } });
  expect(await inspect(request, 'ACQUISITION', acquisition)).toEqual(original);
  const crossOrigin = await request.post('/api/production', { headers: { origin: 'https://example.invalid', 'sec-fetch-site': 'cross-site' }, data: {} });
  expect(crossOrigin.status()).toBe(403);
  const catalog = await (await request.get('/api/production')).json();
  expect(catalog.mode).toBe('LOCAL_DEVELOPMENT');
  expect(catalog.canonicalAdmission).toBe(false);
  // Local fixture production never promotes prototype inventory into a live connection.
  expect(await (await request.get('/api/production/source-inventory')).json()).toEqual(inventory);
  expect(await (await request.get('/api/production')).json()).toEqual(catalog);
});

test('actual HTTP IFC capture to pinned supported/blocked GAT reports and historical inspection', async ({ request }) => {
  test.skip(process.env.GAT_INTEGRATION !== '1', 'Bootstrap the exact pinned runtime, then set GAT_INTEGRATION=1.');
  const purpose = 'LOCAL_IFC_INSPECTION';
  const definition = { ...CARAVAN_DEMO_DEFINITION, id: 'http-ifc-definition', domain: 'LANDSHARK', recordType: 'IFCArtifact',
    requiredSubjects: ['IFCArtifact'], requiredFields: ['preservedSourceBytes'], intendedUses: [purpose] };
  const corpus = output(await execute(request, 'http-ifc-corpus', { kind: 'REGISTER_CORPUS', definition }), 'CORPUS');
  const configured: ProductionSourceConfig = caravanDemoSource(corpus);
  configured.id = 'http-ifc-source'; configured.adapter = { id: 'payload.ifc-artifact/v1', version: '1.0.0' };
  configured.policy = { ...configured.policy, registrationId: 'http-ifc-policy', sourceId: 'notation://source/gat-pinned-demo', permittedPurposes: [purpose] };
  const source = output(await execute(request, 'http-ifc-source-register', { kind: 'REGISTER_SOURCE', source: configured }), 'SOURCE');
  for (const [fixture, outcome] of [['supported-demo', 'SUPPORTED_SCOPE_AUDIT'], ['unsupported-missing-width', 'AUDIT_BLOCKED']]) {
    const bytes = readFileSync(join(process.cwd(), 'examples/gat', fixture + '.ifc'));
    const captured = await execute(request, 'http-' + fixture, { kind: 'ACQUIRE', source, purpose, contentBase64: bytes.toString('base64') });
    const acquisition = output(captured, 'ACQUISITION');
    const original = await inspect(request, 'ACQUISITION', acquisition);
    const evidence = { id: original.data.evidence.id, contentDigest: original.data.evidence.contentDigest };
    const data = { schema: 'payload.gat-audit-request.v1', requestId: 'audit-' + fixture, operation: 'IFC_AUDIT',
      adapterVersion: GAT_ADAPTER_VERSION, purpose, source: { acquisition, evidence } };
    const response = await request.post('/api/gat/audits', { data });
    expect(response.status(), await response.text()).toBe(201);
    const result = await response.json();
    expect(result.inspection).toMatchObject({ outcome, canonicalAdmission: false, originalReportDelivered: false,
      engine: { commit: '80272f94107cce4f70c81e57915800b04c5944a6' }, retained: { report: true, projection: true } });
    const saved = await request.get('/api/gat/audits/' + data.requestId);
    expect(saved.status(), await saved.text()).toBe(200);
    expect(await saved.json()).toEqual(result.inspection);
    const retry = await request.post('/api/gat/audits', { data });
    expect(retry.status(), await retry.text()).toBe(200);
    expect((await retry.json()).inspection).toEqual(result.inspection);
    expect(await inspect(request, 'ACQUISITION', acquisition)).toEqual(original);
    expect(readFileSync(join(process.cwd(), 'examples/gat', fixture + '.ifc'))).toEqual(bytes);
    expect(JSON.stringify(result)).not.toMatch(/C:\\\\|storageKey|Traceback|source\.ifc/);
  }
});

test('actual HTTP comparison of exact Carrier builds is deterministic and read-only', async ({ request }) => {
  const corpus = output(await execute(request, 'http-compare-corpus', { kind: 'REGISTER_CORPUS',
    definition: { ...CARAVAN_DEMO_DEFINITION, id: 'http-compare-definition' } }), 'CORPUS');
  const configured = { ...caravanDemoSource(corpus), id: 'http-compare-source' };
  const source = output(await execute(request, 'http-compare-register-source', { kind: 'REGISTER_SOURCE', source: configured }), 'SOURCE');
  const acquisition = output(await execute(request, 'http-compare-capture', { kind: 'ACQUIRE', source,
    purpose: CARAVAN_DEMO_PURPOSE, contentBase64: caravanDemoContent() }), 'ACQUISITION');
  const builds: ProductionRef[] = [];
  for (const suffix of ['before', 'after']) {
    // Re-normalize the SAME preserved bytes. Changed references are not changed fields.
    const member = output(await execute(request, `http-compare-normalize-${suffix}`, { kind: 'NORMALIZE',
      source, acquisition, purpose: CARAVAN_DEMO_PURPOSE }), 'NORMALIZATION');
    builds.push(output(await execute(request, `http-compare-build-${suffix}`, { kind: 'BUILD_CANDIDATES',
      corpus, members: [member], purpose: CARAVAN_DEMO_PURPOSE }), 'CANDIDATE_BUILD'));
  }
  const ref = (build: ProductionRef) => ({ buildId: build.id, expectedDigest: build.digest });
  const data = { schema: 'payload.local-candidate-build-comparison-request.v1', before: ref(builds[0]), after: ref(builds[1]) };
  const catalog = await (await request.get('/api/production')).json();
  const preserved = await inspect(request, 'ACQUISITION', acquisition);
  const first = await request.post('/api/production/compare', { data });
  expect(first.status(), await first.text()).toBe(200);
  expect(first.headers()['cache-control']).toBe('no-store');
  const result = await first.json();
  expect(result).toMatchObject({ schema: 'payload.production-candidate-comparison.v1', mode: 'LOCAL_DEVELOPMENT',
    inspection: 'HISTORICAL', canonicalAdmission: false, comparisonPersisted: false, currentRightsGrant: false,
    sourceIdentifiersIncluded: true, rawBytesIncluded: false, candidateFieldsIncluded: false });
  expect(result.comparison.summary).toMatchObject({ beforeCount: 1, afterCount: 1, referenceChanged: 1, added: 0, removed: 0, unchanged: 0 });
  expect(result.comparison.entries[0]).toMatchObject({ kind: 'REFERENCE_CHANGED', identity: { state: 'UNRESOLVED' } });
  expect(result.comparison.nonclaims).toMatchObject({ fieldChangeInferred: false, correctionInferred: false,
    retractionInferred: false, releaseActivated: false });
  const repeated = await request.post('/api/production/compare', { data });
  expect(repeated.status(), await repeated.text()).toBe(200);
  expect(await repeated.json()).toEqual(result);
  const self = await request.post('/api/production/compare', { data: { ...data, after: data.before } });
  expect(self.status(), await self.text()).toBe(200);
  expect((await self.json()).comparison.summary).toMatchObject({ unchanged: 1, referenceChanged: 0 });
  const wrongDigest = await request.post('/api/production/compare', { data: { ...data,
    before: { ...data.before, expectedDigest: `sha256:${'0'.repeat(64)}` } } });
  expect(wrongDigest.status()).toBe(409);
  expect((await wrongDigest.json()).error.code).toBe('BUILD_DIGEST_MISMATCH');
  const unauthorized = await request.post('/api/production/compare', { data,
    headers: { origin: 'https://example.invalid', 'sec-fetch-site': 'cross-site' } });
  expect(unauthorized.status()).toBe(403);
  expect(await (await request.get('/api/production')).json()).toEqual(catalog);
  expect(await inspect(request, 'ACQUISITION', acquisition)).toEqual(preserved);
});
