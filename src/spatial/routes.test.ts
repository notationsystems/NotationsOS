import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST as submit } from '../app/api/spatial/analyses/route';
import { GET as inspect } from '../app/api/spatial/analyses/[requestId]/route';
import { POST as compare } from '../app/api/spatial/compare/route';
import { preserveFixture } from './fixture';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'spatial-api-')); vi.stubEnv('PAYLOAD_PRODUCTION_DIR', root); vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1'); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
const post = (body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/spatial/analyses', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
it('submits, inspects and compares retained results through guarded routes', async () => {
  const fixture = preserveFixture(root);
  const first = await submit(post(fixture.baseline)); expect(first.status).toBe(201); expect(first.headers.get('cache-control')).toBe('no-store');
  expect((await submit(post(fixture.scenario))).status).toBe(201);
  const loaded = await inspect(new Request('http://localhost:3000/api/spatial/analyses/spatial-demo-baseline'), { params: Promise.resolve({ requestId: fixture.baseline.requestId }) });
  expect(loaded.status).toBe(200); expect((await loaded.json()).projection.sourceKind).toBe('LOCAL_ANALYSIS');
  const compared = await compare(post({ baselineRequestId: fixture.baseline.requestId, scenarioRequestId: fixture.scenario.requestId }));
  expect(compared.status).toBe(200); expect((await compared.json()).changes).toHaveLength(3);
});
it('rejects disabled mode, foreign origins, arbitrary fields, bodies and inspection queries', async () => {
  const fixture = preserveFixture(root);
  expect((await submit(post(fixture.baseline, 'https://example.com'))).status).toBe(403);
  expect((await submit(post({ ...fixture.baseline, root: '/tmp/other' }))).status).toBe(400);
  expect((await submit(post({ padding: 'x'.repeat(20000) }))).status).toBe(413);
  expect((await inspect(new Request('http://localhost:3000/api/spatial/analyses/x?recompute=1'), { params: Promise.resolve({ requestId: 'x' }) })).status).toBe(400);
  vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '0'); expect((await submit(post(fixture.baseline))).status).toBe(403);
});
