import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CensusNormalizationStore } from '@/acquisition/census-normalization';
import type { SourceBytes } from '@/acquisition/http';
import { SourceCaptureStore } from '@/acquisition/store';
import { CensusCandidateBuildStore } from '@/data-os/local-census-candidate-build';
import { GET as getBuild } from './route';
import { GET as getNormalization } from '../../source-normalizations/[normalizationId]/route';

const row = { dot_number: '80806', legal_name: 'SYNTHETIC CENSUS CORPORATION', business_org_desc: 'CORPORATION', phy_country: 'US', phy_state: 'OH', status_code: 'A', power_units: '4', total_drivers: '5', mcs150_date: '20260801', mcs150_mileage_year: '0' };
const bytes = Buffer.from(`${JSON.stringify([row])}\n`);
const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' };
let temporary: string;
let root: string;
let fetch: ReturnType<typeof vi.fn<(url: URL) => Promise<SourceBytes>>>;
let normalizationDigest = '';

const normalization = (id: string) => getNormalization(new Request(`http://127.0.0.1:3000/api/production/source-normalizations/${id}`, { headers }), { params: Promise.resolve({ normalizationId: id }) });
const build = (id: string) => getBuild(new Request(`http://127.0.0.1:3000/api/production/source-builds/${id}`, { headers }), { params: Promise.resolve({ buildId: id }) });

beforeEach(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-source-build-readback-'));
  root = join(temporary, 'qualification');
  fetch = vi.fn<(url: URL) => Promise<SourceBytes>>().mockResolvedValue({ bytes, mediaType: 'application/json', etag: 'W/"synthetic"', lastModified: 'Fri, 04 Sep 2026 12:00:00 GMT' });
  // Seeded offline through the stores' own seams, in the order the operator commands run: capture, normalize, build.
  const captured = await new SourceCaptureStore(root, { fetch, now: () => '2026-09-05T12:00:00.000Z' }).capture({ schema: 'payload.source-capture-request.v1', requestId: 'capture-original', sourceId: 'fmcsa-company-census', usdot: ['80806'] }, true);
  const normalized = new CensusNormalizationStore(root).normalize({ schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: 'normalized-v1', purpose: 'source-qualification', capture: { requestId: 'capture-original', receiptDigest: captured.receipt!.digest }, usdot: '80806' }, '2026-09-06T01:00:00.000Z');
  normalizationDigest = normalized.run.digest;
  new CensusCandidateBuildStore(root).build({ schema: 'payload.local-candidate-build-request.v2', buildId: 'build-v1', purpose: 'source-qualification', knownThrough: '2026-09-06T01:00:00.000Z',
    definition: { id: 'caravan-fmcsa-census-qualification', version: '1.0.0', domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation', sourceClasses: ['public-government-company-census'] },
    normalizations: [{ id: 'normalized-v1', digest: normalized.run.digest }] }, '2026-09-06T01:01:00.000Z');
  vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
  vi.stubEnv('PAYLOAD_SOURCE_QUALIFICATION_DIR', root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  expect(temporary.split(/[\\/]/).at(-1)).toMatch(/^payload-source-build-readback-/);
  rmSync(temporary, { recursive: true, force: true });
});

describe('source normalization and build readback routes', () => {
  it('answers the operator’s normalization read-only: the typed candidate with presence, separate clocks, provenance and every non-claim', async () => {
    const response = await normalization('normalized-v1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ schema: 'payload.source-normalization-readback.v1', normalizationId: 'normalized-v1', derivationPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, customerDistributionPermitted: false });
    expect(body.run).toMatchObject({ schema: 'payload.fmcsa-census-normalization.v1', state: 'NORMALIZED', canonicalAdmission: false, sourceTruthClaimed: false, fieldAccuracyClaimed: false, customerDistributionPermitted: false, digest: normalizationDigest });
    expect(body.run.candidate).toMatchObject({ recordType: 'FMCSACompanyCensusObservation', state: 'UNADMITTED', identity: { state: 'UNRESOLVED', canonicalId: null, sourceRecordId: '80806' }, temporal: { filingDateMeaning: 'SOURCE_FILING_DATE_NOT_VALID_TIME', validTimeMeaning: 'NOT_ESTABLISHED_BY_SNAPSHOT' } });
    expect(body.run.candidate.fields.power_units).toMatchObject({ raw: '4', presence: 'PRESENT', value: 4 });
    expect(body.run.candidate.fields.docket1).toMatchObject({ presence: 'OMITTED', value: null });
    expect(body.run.candidate.fields.mcs150_mileage_year).toMatchObject({ raw: '0' });
    expect(JSON.stringify(body)).not.toContain(root);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('answers the operator’s v2 candidate build read-only with its exact members and every non-claim', async () => {
    const response = await build('build-v1');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ schema: 'payload.source-build-readback.v1', buildId: 'build-v1', assemblyPerformed: false, releaseActivated: false, canonicalAdmission: false });
    expect(body.build).toMatchObject({ schema: 'payload.local-candidate-build.v2', state: 'UNADMITTED', recordCount: 1, canonicalAdmission: false, releaseActivated: false, identityResolved: false, customerDistributionPermitted: false });
    expect(body.build.members[0]).toMatchObject({ normalization: { id: 'normalized-v1', digest: normalizationDigest } });
    expect(body.build.recordsRoot).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses when the rail is not enabled, for unbounded identifiers, and for unknown records', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '0');
    expect((await normalization('normalized-v1')).status).toBe(403);
    expect((await build('build-v1')).status).toBe(403);
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    expect((await normalization('not valid!')).status).toBe(400);
    expect((await build('not valid!')).status).toBe(400);
    const missingRun = await normalization('missing');
    expect(missingRun.status).toBe(404);
    expect((await missingRun.json()).error.code).toBe('CENSUS_NORMALIZATION_NOT_FOUND');
    const missingBuild = await build('missing');
    expect(missingBuild.status).toBe(404);
    expect((await missingBuild.json()).error.code).toBe('CENSUS_BUILD_NOT_FOUND');
  });
});
