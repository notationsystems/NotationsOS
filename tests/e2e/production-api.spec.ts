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
