import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../app/api/production/route';
import { POST as INSPECT } from '../app/api/production/inspect/route';
import { CARAVAN_DEMO_DEFINITION, CARAVAN_DEMO_PURPOSE, caravanDemoContent, caravanDemoSource } from './demo';
import type { ProductionObjectKind, ProductionRef, ProductionResult } from './contracts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'payload-production-http-'));
  vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1'); vi.stubEnv('PAYLOAD_PRODUCTION_DIR', root);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
function request(body: unknown) { return new Request('http://127.0.0.1:3000/api/production', { method: 'POST', headers, body: JSON.stringify(body) }); }
async function execute(requestId: string, fields: Record<string, unknown>): Promise<ProductionResult> {
  const response = await POST(request({ schema: 'payload.production-command.v1', requestId, ...fields }));
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}
function output(result: ProductionResult, kind: ProductionObjectKind): ProductionRef {
  const found = result.run.outputs.find((item) => item.kind === kind);
  expect(found).toBeDefined();
  return { id: found!.id, digest: found!.digest };
}
async function inspect(kind: ProductionObjectKind, reference: ProductionRef) {
  const response = await INSPECT(request({ schema: 'payload.production-inspection-request.v1', kind, reference }));
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}
function fileBytes(directory: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap((entry): [string, string][] => {
    const name = prefix + entry.name;
    return entry.isDirectory() ? Object.entries(fileBytes(join(directory, entry.name), name + '/')) : [[name, readFileSync(join(directory, entry.name)).toString('base64')]];
  }));
}

describe('real production route -> fixed worker -> existing evidence rail', () => {
  it('registers, captures, retries, inspects, normalizes, builds and reinspects without fixture/canonical mutation', async () => {
    const corpus = await execute('register-corpus', { kind: 'REGISTER_CORPUS', definition: CARAVAN_DEMO_DEFINITION });
    expect(corpus.run.state).toBe('COMPLETED');
    const corpusRef = output(corpus, 'CORPUS');
    const source = await execute('register-source', { kind: 'REGISTER_SOURCE', source: caravanDemoSource(corpusRef) });
    expect(source.run.state).toBe('COMPLETED');
    const sourceRef = output(source, 'SOURCE');
    const captureFields = { kind: 'ACQUIRE', source: sourceRef, purpose: CARAVAN_DEMO_PURPOSE, contentBase64: caravanDemoContent() };
    const capture = await execute('capture-carrier', captureFields);
    expect(capture.run.state).toBe('COMPLETED');
    const beforeRetry = fileBytes(root);
    const retry = await execute('capture-carrier', captureFields);
    expect(retry).toEqual({ ...capture, status: 'EXISTING', historicalRetry: true });
    expect(fileBytes(root)).toEqual(beforeRetry);
    const acquisition = output(capture, 'ACQUISITION');
    const evidence = await inspect('ACQUISITION', acquisition);
    expect(evidence).toMatchObject({ integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false, historical: true, canonicalAdmission: false,
      data: { evidence: { contentDigest: expect.stringMatching(/^sha256:/), byteLength: expect.any(Number) }, receipt: { digest: expect.stringMatching(/^sha256:/) } } });
    const normalized = await execute('normalize-carrier', { kind: 'NORMALIZE', source: sourceRef, acquisition, purpose: CARAVAN_DEMO_PURPOSE });
    expect(normalized.run.state).toBe('COMPLETED');
    const normalization = output(normalized, 'NORMALIZATION');
    const candidate = await inspect('NORMALIZATION', normalization);
    expect(candidate.data).toMatchObject({ state: 'NORMALIZED', candidate: { state: 'UNADMITTED', identity: { state: 'UNRESOLVED', canonicalId: null } } });
    const built = await execute('build-carrier', { kind: 'BUILD_CANDIDATES', corpus: corpusRef, members: [normalization], purpose: CARAVAN_DEMO_PURPOSE });
    expect(built.run.state).toBe('COMPLETED');
    const build = output(built, 'CANDIDATE_BUILD');
    const result = await inspect('CANDIDATE_BUILD', build);
    expect(result.data).toMatchObject({ state: 'UNADMITTED', recordCount: 1, canonicalAdmission: false, releaseActivated: false, independentlyVerified: false });
    const catalog = await (await GET(new Request('http://127.0.0.1:3000/api/production', { headers }))).json();
    expect(catalog.runs).toHaveLength(5);
    expect(JSON.stringify([capture, evidence, normalized, candidate, built, result, catalog])).not.toMatch(/contentBase64|storageKey|C:\\\\|fixture_only/);
    expect(Object.keys(fileBytes(root)).some((path) => /releases|notation-state|coordination/.test(path))).toBe(false);
  }, 30_000);

  it('preserves evidence and explicit quarantine when parsing fails, then refuses incompatible build membership', async () => {
    const corpus = output(await execute('corpus', { kind: 'REGISTER_CORPUS', definition: CARAVAN_DEMO_DEFINITION }), 'CORPUS');
    const source = output(await execute('source', { kind: 'REGISTER_SOURCE', source: caravanDemoSource(corpus) }), 'SOURCE');
    const captured = await execute('malformed', { kind: 'ACQUIRE', source, purpose: CARAVAN_DEMO_PURPOSE, contentBase64: Buffer.from('{bad source').toString('base64') });
    const acquisition = output(captured, 'ACQUISITION');
    const normalized = await execute('quarantine', { kind: 'NORMALIZE', source, acquisition, purpose: CARAVAN_DEMO_PURPOSE });
    expect(normalized.run).toMatchObject({ state: 'QUARANTINED', failure: { code: 'INVALID_SOURCE_JSON', artifactRetained: true, receiptRetained: true } });
    const normalization = output(normalized, 'NORMALIZATION');
    expect((await inspect('NORMALIZATION', normalization)).data).toMatchObject({ state: 'QUARANTINED', candidate: null });
    const original = await inspect('ACQUISITION', acquisition);
    const failed = await execute('refuse-build', { kind: 'BUILD_CANDIDATES', corpus, members: [normalization], purpose: CARAVAN_DEMO_PURPOSE });
    expect(failed.run).toMatchObject({ state: 'FAILED', failure: { code: 'MEMBER_NOT_ELIGIBLE' }, canonicalAdmission: false });
    expect(await inspect('ACQUISITION', acquisition)).toEqual(original);
  }, 30_000);

  it('records disallowed capture without evidence and rejects path, clock and completed-state injection before execution', async () => {
    const corpus = output(await execute('corpus', { kind: 'REGISTER_CORPUS', definition: CARAVAN_DEMO_DEFINITION }), 'CORPUS');
    const declared = caravanDemoSource(corpus); declared.policy.allowedOperations = ['DERIVE'];
    const source = output(await execute('source', { kind: 'REGISTER_SOURCE', source: declared }), 'SOURCE');
    const denied = await execute('denied', { kind: 'ACQUIRE', source, purpose: CARAVAN_DEMO_PURPOSE, contentBase64: caravanDemoContent() });
    expect(denied.run).toMatchObject({ state: 'FAILED', failure: { code: 'INGEST_DISALLOWED', artifactRetained: false, receiptRetained: false } });
    expect(denied.run.outputs).toEqual([]);
    for (const injected of [{ storageRoot: root }, { capturedAt: '2000-01-01T00:00:00.000Z' }, { canonicalAdmission: true }, { state: 'COMPLETED' }]) {
      const response = await POST(request({ schema: 'payload.production-command.v1', requestId: 'invalid', kind: 'ACQUIRE', source,
        purpose: CARAVAN_DEMO_PURPOSE, contentBase64: caravanDemoContent(), ...injected }));
      expect(response.status).toBe(400);
    }
  }, 30_000);
});
