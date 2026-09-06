import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceBytes } from '@/acquisition/http';
import { SourceCaptureStore } from '@/acquisition/store';
import { GET } from './route';

const row = { dot_number: '80806', legal_name: 'SYNTHETIC CENSUS CORPORATION', business_org_desc: 'CORPORATION', phy_country: 'US', phy_state: 'OH', status_code: 'A', power_units: '4', total_drivers: '5', mcs150_date: '20260801' };
const bytes = Buffer.from(`${JSON.stringify([row])}\n`);
let temporary: string;
let root: string;
let fetch: ReturnType<typeof vi.fn<(url: URL) => Promise<SourceBytes>>>;

function get(requestId: string, headers: Record<string, string> = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' }) {
  return GET(new Request(`http://127.0.0.1:3000/api/production/source-captures/${requestId}`, { headers }), { params: Promise.resolve({ requestId }) });
}

beforeEach(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-source-readback-'));
  root = join(temporary, 'qualification');
  fetch = vi.fn<(url: URL) => Promise<SourceBytes>>().mockResolvedValue({ bytes, mediaType: 'application/json', etag: 'W/"synthetic"', lastModified: 'Fri, 04 Sep 2026 12:00:00 GMT' });
  // The operator's capture, seeded offline through the store's own transport seam: the route never collects.
  const seeded = await new SourceCaptureStore(root, { fetch, now: () => '2026-09-05T12:00:00.000Z' }).capture({ schema: 'payload.source-capture-request.v1', requestId: 'capture-original', sourceId: 'fmcsa-company-census', usdot: ['80806', '80807'] }, true);
  expect(seeded.state).toBe('CAPTURED');
  vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
  vi.stubEnv('PAYLOAD_SOURCE_QUALIFICATION_DIR', root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  expect(temporary.split(/[\\/]/).at(-1)).toMatch(/^payload-source-readback-/);
  rmSync(temporary, { recursive: true, force: true });
});

describe('source capture readback route', () => {
  it('answers the operator’s capture read-only, with its observations and every non-claim, without collecting', async () => {
    const response = await get('capture-original');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Payload-Production')).toBe('local-development-v1');
    const body = await response.json();
    expect(body).toMatchObject({ schema: 'payload.source-capture-readback.v1', mode: 'LOCAL_DEVELOPMENT', requestId: 'capture-original', collectionPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, customerDistributionPermitted: false });
    expect(body.inspection).toMatchObject({ schema: 'payload.source-capture-inspection.v1', state: 'CAPTURED', integrity: 'RECOMPUTED_LOCAL', canonicalAdmission: false, sourceTruthClaimed: false, customerDistributionPermitted: false, independentVerification: false });
    expect(body.inspection.observations).toMatchObject({ sourceId: 'fmcsa-company-census', notReturned: ['80807'] });
    expect(body.inspection.observations.records[0]).toMatchObject({ dot_number: '80806', legal_name: 'SYNTHETIC CENSUS CORPORATION', identityStatus: 'UNRESOLVED', canonicalId: null });
    expect(body.inspection.acquisition).toMatchObject({ id: 'source-capture:capture-original', byteLength: bytes.byteLength });
    expect(JSON.stringify(body)).not.toContain(root);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses when the rail is not enabled, from another origin, for an unbounded identifier, and for an unknown capture', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '0');
    expect((await get('capture-original')).status).toBe(403);
    expect((await (await get('capture-original')).json()).error.code).toBe('LOCAL_MODE_DISABLED');
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    const cross = await get('capture-original', { host: '127.0.0.1:3000', origin: 'https://example.invalid', 'sec-fetch-site': 'cross-site' });
    expect(cross.status).toBe(403);
    const unbounded = await get('not valid!');
    expect(unbounded.status).toBe(400);
    expect((await unbounded.json()).error.code).toBe('INVALID_REQUEST');
    const missing = await get('capture-missing');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ schema: 'payload.production-error.v1', error: { code: 'SOURCE_CAPTURE_NOT_FOUND' } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads an absent qualification root as not found and creates nothing there', async () => {
    const absent = join(temporary, 'absent');
    vi.stubEnv('PAYLOAD_SOURCE_QUALIFICATION_DIR', absent);
    expect((await get('capture-original')).status).toBe(404);
    expect(existsSync(resolve(absent))).toBe(false);
  });
});
