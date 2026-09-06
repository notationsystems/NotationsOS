import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { byteDigest } from '../data-os/evidence-capture';
import * as localFiles from '../data-os/local-files';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import { CENSUS_NORMALIZATION_ADAPTER, parseCensusCandidateData } from './census-adapter';
import { CensusNormalizationStore, parseCensusNormalizationRequest, type CensusNormalizationRequest, type CensusNormalizationRun } from './census-normalization';
import { CENSUS_FIELDS, type SourceCaptureRequest } from './fmcsa';
import * as http from './http';
import { censusQualificationPolicy, SourceCaptureStore, type SourceCaptureInspection } from './store';

const STARTED = '2026-09-05T12:00:00.000Z';
const CAPTURED = '2026-09-05T12:00:01.000Z';
const FINISHED = '2026-09-05T12:00:02.000Z';
const NORMALIZED = '2026-09-05T13:00:00.000Z';
const EXPIRED = '2026-10-05T00:00:00.000Z';
const LAST_MODIFIED = 'Fri, 04 Sep 2026 12:00:00 GMT';
const row = {
  dot_number: '80806', legal_name: '  SYNTHETIC CENSUS CORPORATION  ', business_org_desc: 'CORPORATION',
  phy_country: 'US', phy_state: 'OH', status_code: 'A', power_units: '4', total_drivers: '0',
  mcs150_date: '20260801', mcs150_mileage: '12345', mcs150_mileage_year: '0', docket1prefix: 'MC',
  docket1: '0', docket1_status_code: null,
};
const sourceBytes = Buffer.from(`${JSON.stringify([row], null, 2)}\n`);
let temporary: string;
let root: string;
let network: MockInstance<typeof http.fetchSourceBytes>;

function sourceRequest(requestId = 'synthetic-census-capture'): SourceCaptureRequest {
  return { schema: 'payload.source-capture-request.v1', requestId, sourceId: 'fmcsa-company-census', usdot: ['80806', '99999999'] };
}
async function capture(options: { bytes?: Buffer; failed?: boolean; requestId?: string; lastModified?: string | null } = {}) {
  const now = vi.fn<() => string>().mockReturnValueOnce(STARTED).mockReturnValueOnce(CAPTURED).mockReturnValue(FINISHED);
  const fetch = vi.fn<typeof http.fetchSourceBytes>();
  if (options.failed) fetch.mockRejectedValue(new Error('SYNTHETIC_OFFLINE_FAILURE'));
  else fetch.mockResolvedValue({ bytes: options.bytes ?? sourceBytes, mediaType: 'application/json',
    etag: 'W/"synthetic-census-version"', lastModified: options.lastModified === undefined ? LAST_MODIFIED : options.lastModified });
  const result = await new SourceCaptureStore(root, { fetch, now }).capture(sourceRequest(options.requestId), true);
  expect(fetch).toHaveBeenCalledOnce();
  return result;
}
function request(captured: SourceCaptureInspection, changes: Partial<CensusNormalizationRequest> = {}): CensusNormalizationRequest {
  return { schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: 'synthetic-census-normalization',
    purpose: 'source-qualification', capture: { requestId: captured.intent.request.requestId, receiptDigest: captured.receipt!.digest },
    usdot: '80806', ...changes };
}
function runPath(id = 'synthetic-census-normalization') {
  return join(root, 'source-normalizations', `${byteDigest(Buffer.from(id)).slice(7)}.json`);
}
function metadataPath(id: string, name: 'intent' | 'receipt') {
  return join(root, 'source-captures', byteDigest(Buffer.from(id)).slice(7), `${name}.json`);
}
function files(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name); const key = prefix ? `${prefix}/${name}` : name;
    return lstatSync(path).isDirectory() ? Object.entries(files(path, key)) : [[key, byteDigest(readFileSync(path))]];
  }));
}
function reseal<T extends { digest: string }>(value: T): T {
  const { digest: previous, ...payload } = value; void previous;
  value.digest = localRecordDigest(payload, 128 * 1024); return value;
}
function editRun(change: (run: CensusNormalizationRun) => void) {
  const run: CensusNormalizationRun = JSON.parse(readFileSync(runPath(), 'utf8'));
  change(run); writeFileSync(runPath(), encodeLocalRecord(reseal(run), 128 * 1024));
}
function expectNoChange(action: () => unknown, code?: string) {
  const before = files();
  if (code) expect(action).toThrow(expect.objectContaining({ code }));
  else expect(action).toThrow();
  expect(files()).toEqual(before);
}

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-census-normalization-')); root = join(temporary, 'evidence');
  network = vi.spyOn(http, 'fetchSourceBytes').mockRejectedValue(new Error('REAL_PROVIDER_CONTACT_FORBIDDEN_IN_OFFLINE_TEST'));
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  const base = resolve(tmpdir()); const target = resolve(temporary);
  expect(target.startsWith(`${base}\\`) || target.startsWith(`${base}/`)).toBe(true);
  expect(target.split(/[\\/]/).at(-1)).toMatch(/^payload-census-normalization-/);
  rmSync(target, { recursive: true, force: true });
});

describe('source-specific real-store normalization with synthetic offline captures', () => {
  it('reopens original bytes and binds exact raw/typed fields, all proof references, and distinct clocks', async () => {
    const captured = await capture(); const before = files(); const manifest = request(captured);
    const store = new CensusNormalizationStore(root); const result = store.normalize(manifest, NORMALIZED);
    const acquisition = store.intake.inspect(captured.acquisition!.id)!;
    expect(result.status).toBe('CREATED');
    expect(result.run).toMatchObject({ schema: 'payload.fmcsa-census-normalization.v1', state: 'NORMALIZED',
      mode: 'LOCAL_SOURCE_QUALIFICATION', policyAuthority: 'OPERATOR_DECLARATION', canonicalAdmission: false,
      sourceTruthClaimed: false, fieldAccuracyClaimed: false, independentlyVerified: false,
      customerDistributionPermitted: false, normalizedAt: NORMALIZED, notReturned: [] });
    expect(result.run.request).toEqual({ manifest, captureIntentDigest: captured.intent.digest,
      acquisitionDigest: acquisition.digest, adapterDigest: localRecordDigest(CENSUS_NORMALIZATION_ADAPTER) });
    expect(result.run.requestDigest).toBe(localRecordDigest(result.run.request));
    const candidate = result.run.candidate!;
    expect(candidate).toMatchObject({ schema: 'payload.fmcsa-census-candidate.v1',
      candidateId: 'synthetic-census-normalization:candidate', domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation',
      state: 'UNADMITTED', identity: { sourceId: 'fmcsa-company-census', sourceRecordId: '80806', state: 'UNRESOLVED', canonicalId: null },
      knownAt: NORMALIZED, validTime: { state: 'UNOBSERVED', from: null, to: null },
      temporal: { capturedAt: CAPTURED, providerLastModified: LAST_MODIFIED,
        filingDateMeaning: 'SOURCE_FILING_DATE_NOT_VALID_TIME', validTimeMeaning: 'NOT_ESTABLISHED_BY_SNAPSHOT' } });
    expect(Object.keys(candidate.fields).sort()).toEqual([...CENSUS_FIELDS].sort());
    expect(candidate.fields).toEqual(parseCensusCandidateData(sourceBytes, captured.intent.request, '80806')!.fields);
    expect(candidate.fields.legal_name).toMatchObject({ raw: row.legal_name, value: row.legal_name, presence: 'PRESENT' });
    expect(candidate.fields.carrier_operation).toMatchObject({ raw: null, value: null, presence: 'OMITTED' });
    expect(candidate.fields.docket1_status_code).toMatchObject({ raw: null, value: null, presence: 'EXPLICIT_NULL' });
    expect(candidate.fields.total_drivers).toMatchObject({ raw: '0', value: 0, unit: 'DRIVER', presence: 'PRESENT' });
    expect(candidate.fields.mcs150_date.value).toBe('2026-08-01');
    expect(candidate.fields.mcs150_mileage).toMatchObject({ value: 12345, unit: null });
    expect(candidate.fields.mcs150_mileage_year).toMatchObject({ raw: '0', value: null, presence: 'PRESENT', interpretation: 'SOURCE_ZERO_YEAR_UNRESOLVED' });
    expect(candidate.provenance).toEqual({
      capture: { requestId: manifest.capture.requestId, intentDigest: captured.intent.digest, receiptDigest: captured.receipt!.digest },
      acquisition: { id: acquisition.request.manifest.acquisitionId, digest: acquisition.digest },
      evidence: { id: acquisition.capture.evidence.evidenceId, contentDigest: byteDigest(sourceBytes) },
      receipt: { id: acquisition.capture.receipt.receiptId, digest: localRecordDigest(acquisition.capture.receipt) },
      sourcePolicy: { id: censusQualificationPolicy().registrationId, digest: localRecordDigest(censusQualificationPolicy()) },
      derivation: { id: result.run.deriveDecision.decisionId, digest: localRecordDigest(result.run.deriveDecision) },
      adapter: { id: CENSUS_NORMALIZATION_ADAPTER.id, version: '1.0.0', contractDigest: localRecordDigest(CENSUS_NORMALIZATION_ADAPTER) },
    });
    expect(result.run.deriveDecision).toMatchObject({ state: 'ALLOWED', evaluatedAt: NORMALIZED,
      request: { operation: 'DERIVE', audience: 'INTERNAL', purpose: 'source-qualification', requestedAt: NORMALIZED } });
    const { digest: candidateDigest, ...candidatePayload } = candidate;
    const { digest: runDigest, ...runPayload } = result.run;
    expect(candidateDigest).toBe(localRecordDigest(candidatePayload)); expect(runDigest).toBe(localRecordDigest(runPayload));
    for (const [path, hash] of Object.entries(before)) expect(files()[path]).toBe(hash);
    expect(Object.keys(files()).filter((path) => !Object.hasOwn(before, path))).toHaveLength(1);
    expect(Buffer.from(store.intake.objects.get(acquisition.request.contentDigest)!)).toEqual(sourceBytes);
    const after = files(); expect(new CensusNormalizationStore(root).inspect(manifest.normalizationId)).toEqual(result.run);
    expect(files()).toEqual(after);
  });

  it.each([false, true])('records NOT_RETURNED without a candidate for a requested missing USDOT; empty capture=%s', async (empty) => {
    const captured = await capture({ bytes: empty ? Buffer.from('[]') : sourceBytes });
    const manifest = request(captured, { usdot: '99999999' });
    const result = new CensusNormalizationStore(root).normalize(manifest, NORMALIZED);
    expect(result.run).toMatchObject({ state: 'NOT_RETURNED', candidate: null, notReturned: ['99999999'],
      canonicalAdmission: false, sourceTruthClaimed: false, customerDistributionPermitted: false });
    expect(result.run.request.manifest.capture.receiptDigest).toBe(captured.receipt!.digest);
    expect(result.run.deriveDecision.state).toBe('ALLOWED');
    const before = files(); expect(new CensusNormalizationStore(root).inspect(manifest.normalizationId)).toEqual(result.run);
    expect(files()).toEqual(before);
    expect(JSON.stringify(result.run)).not.toMatch(/NONEXISTENT|DOES_NOT_EXIST|QUARANTINED/);
  });

  it('keeps an unavailable provider modification clock null', async () => {
    const captured = await capture({ lastModified: null });
    expect(new CensusNormalizationStore(root).normalize(request(captured), NORMALIZED).run.candidate!.temporal.providerLastModified).toBeNull();
  });

  it('rejects a wrong full receipt digest without writing a run', async () => {
    const captured = await capture(); const manifest = request(captured);
    manifest.capture.receiptDigest = `sha256:${'0'.repeat(64)}`;
    expectNoChange(() => new CensusNormalizationStore(root).normalize(manifest, NORMALIZED), 'CENSUS_CAPTURE_REFERENCE_MISMATCH');
  });

  it('rejects selection outside the original source request, not as NOT_RETURNED', async () => {
    const captured = await capture();
    expectNoChange(() => new CensusNormalizationStore(root).normalize(request(captured, { usdot: '1' }), NORMALIZED), 'CENSUS_IDENTIFIER_NOT_REQUESTED');
  });

  it('cannot normalize an absent source capture even when the receipt hash is well formed', () => {
    const manifest = { schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: 'missing', purpose: 'source-qualification',
      capture: { requestId: 'missing', receiptDigest: `sha256:${'0'.repeat(64)}` }, usdot: '80806' };
    expectNoChange(() => new CensusNormalizationStore(root).normalize(manifest, NORMALIZED), 'CENSUS_CAPTURE_NOT_FOUND');
    expect(existsSync(root)).toBe(false);
  });

  it.each(['QUARANTINED', 'FAILED', 'INCOMPLETE'] as const)('refuses a %s source capture and preserves its history', async (state) => {
    let captured: SourceCaptureInspection;
    if (state === 'INCOMPLETE') {
      const publish = localFiles.publishImmutableFile;
      const failure = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((selectedRoot, path, content, maximum) => {
        if (path[0] === 'source-captures' && path.at(-1) === 'receipt.json') throw new Error('SYNTHETIC_RECEIPT_WRITE_FAILURE');
        return publish(selectedRoot, path, content, maximum);
      });
      await expect(capture()).rejects.toThrow('SYNTHETIC_RECEIPT_WRITE_FAILURE'); failure.mockRestore();
      captured = new SourceCaptureStore(root).inspect(sourceRequest().requestId)!;
    } else captured = await capture(state === 'FAILED' ? { failed: true } : { bytes: Buffer.from('[{}]') });
    expect(captured.state).toBe(state);
    const manifest = { schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: 'not-eligible', purpose: 'source-qualification',
      capture: { requestId: captured.intent.request.requestId, receiptDigest: captured.receipt?.digest ?? `sha256:${'0'.repeat(64)}` }, usdot: '80806' };
    expectNoChange(() => new CensusNormalizationStore(root).normalize(manifest, NORMALIZED), 'CENSUS_CAPTURE_NOT_ELIGIBLE');
  });

  it.each([
    '2026-09-05T11:59:59.999Z', // Earlier than evidence storage.
    '2026-09-05T12:00:01.500Z', // After storage but before the source receipt finished.
  ])('refuses derivation before completed acquisition at %s', async (at) => {
    const captured = await capture();
    expectNoChange(() => new CensusNormalizationStore(root).normalize(request(captured), at), 'INVALID_CENSUS_NORMALIZATION_TIME');
  });

  it('allows derivation exactly at the completed source receipt clock', async () => {
    const captured = await capture();
    expect(new CensusNormalizationStore(root).normalize(request(captured), FINISHED).run.normalizedAt).toBe(FINISHED);
  });

  it.each(['2026-10-05T00:00:00.000Z', '2027-01-01T00:00:00.000Z'])('refuses new derivation at or after policy expiry %s', async (at) => {
    const captured = await capture();
    expectNoChange(() => new CensusNormalizationStore(root).normalize(request(captured), at), 'CENSUS_DERIVATION_NOT_ALLOWED');
  });

  it.each(['NORMALIZED', 'NOT_RETURNED'] as const)('replays %s after policy expiry and never reads an ambient clock', async (state) => {
    const captured = await capture(); const manifest = request(captured, state === 'NOT_RETURNED' ? { usdot: '99999999' } : {});
    const first = new CensusNormalizationStore(root).normalize(manifest, NORMALIZED); const before = files();
    expect(first.run.state).toBe(state);
    expect(new CensusNormalizationStore(root).normalize(manifest, EXPIRED)).toEqual({ status: 'EXISTING', run: first.run });
    const OriginalDate = Date;
    vi.stubGlobal('Date', class extends OriginalDate {
      constructor(value?: string) {
        if (value === undefined) throw new Error('AMBIENT_CLOCK_READ_FORBIDDEN');
        super(value);
      }
      static now(): number { throw new Error('AMBIENT_CLOCK_READ_FORBIDDEN'); }
    });
    expect(new CensusNormalizationStore(root).inspect(manifest.normalizationId)).toEqual(first.run);
    expect(new CensusNormalizationStore(root).normalize(manifest)).toEqual({ status: 'EXISTING', run: first.run });
    expect(files()).toEqual(before);
  });

  it.each([
    '2026-09-05T13:00:00Z', '2026-09-05T09:00:00.000-04:00', 'not-a-date', '2026-02-30T13:00:00.000Z',
  ])('refuses noncanonical or invalid derivation time %s without writes', async (at) => {
    const captured = await capture(); expectNoChange(() => new CensusNormalizationStore(root).normalize(request(captured), at));
  });

  it.each(['usdot', 'requestId', 'receiptDigest'] as const)('rejects same normalization ID rebound through %s', async (field) => {
    const captured = await capture(); const manifest = request(captured); const store = new CensusNormalizationStore(root);
    store.normalize(manifest, NORMALIZED); const changed = structuredClone(manifest);
    if (field === 'usdot') changed.usdot = '99999999';
    else if (field === 'requestId') changed.capture.requestId = 'another-capture';
    else changed.capture.receiptDigest = `sha256:${'f'.repeat(64)}`;
    expectNoChange(() => store.normalize(changed, NORMALIZED), 'CENSUS_NORMALIZATION_CONFLICT');
  });

  it('does not mutate caller request or persisted output when returned values are changed', async () => {
    const captured = await capture(); const manifest = request(captured); const original = structuredClone(manifest);
    const store = new CensusNormalizationStore(root); const result = store.normalize(manifest, NORMALIZED); const before = files();
    expect(manifest).toEqual(original); result.run.candidate!.fields.legal_name.value = 'changed in memory';
    result.run.request.manifest.usdot = '1'; manifest.capture.receiptDigest = `sha256:${'0'.repeat(64)}`;
    const reopened = new CensusNormalizationStore(root).inspect(original.normalizationId)!;
    expect(reopened.candidate!.fields.legal_name.value).toBe(row.legal_name);
    expect(reopened.request.manifest).toEqual(original); expect(files()).toEqual(before);
  });

  it('returns absent normalization history without creating a directory', () => {
    expect(new CensusNormalizationStore(root).inspect('absent')).toBeUndefined(); expect(existsSync(root)).toBe(false);
  });
});

describe('source normalization immutable history and publication failures', () => {
  it.each([
    ['raw source value', (run: CensusNormalizationRun) => { run.candidate!.fields.legal_name.raw = 'invented'; }],
    ['typed source value', (run: CensusNormalizationRun) => { run.candidate!.fields.power_units.value = 900; }],
    ['missingness', (run: CensusNormalizationRun) => { run.candidate!.fields.carrier_operation.presence = 'EXPLICIT_NULL'; }],
    ['unit', (run: CensusNormalizationRun) => { run.candidate!.fields.mcs150_mileage.unit = 'mi'; }],
    ['adapter claim', (run: CensusNormalizationRun) => { run.candidate!.provenance.adapter.version = '9.0.0'; }],
    ['request adapter digest', (run: CensusNormalizationRun) => { run.request.adapterDigest = `sha256:${'0'.repeat(64)}`; }],
    ['capture intent digest', (run: CensusNormalizationRun) => { run.request.captureIntentDigest = `sha256:${'0'.repeat(64)}`; }],
    ['candidate source ID', (run: CensusNormalizationRun) => { (run.candidate!.identity as { sourceId: string }).sourceId = 'fmcsa-qcmobile'; }],
    ['source identity', (run: CensusNormalizationRun) => { run.candidate!.identity.sourceRecordId = '99999999'; }],
    ['capture time', (run: CensusNormalizationRun) => { run.candidate!.temporal.capturedAt = FINISHED; }],
    ['provider time', (run: CensusNormalizationRun) => { run.candidate!.temporal.providerLastModified = null; }],
    ['source policy digest', (run: CensusNormalizationRun) => { run.candidate!.provenance.sourcePolicy.digest = `sha256:${'0'.repeat(64)}`; }],
    ['derivation decision', (run: CensusNormalizationRun) => { (run.deriveDecision.request as { purpose: string }).purpose = 'customer-delivery'; }],
    ['customer permission', (run: CensusNormalizationRun) => { (run as { customerDistributionPermitted: boolean }).customerDistributionPermitted = true; }],
    ['admission claim', (run: CensusNormalizationRun) => { (run as { canonicalAdmission: boolean }).canonicalAdmission = true; }],
    ['false absence', (run: CensusNormalizationRun) => { run.state = 'NOT_RETURNED'; run.notReturned = ['80806']; run.candidate = null; }],
  ])('rejects resealed %s without repairing stored history', async (_label, change) => {
    const captured = await capture(); const manifest = request(captured); const store = new CensusNormalizationStore(root);
    store.normalize(manifest, NORMALIZED);
    editRun((run) => { change(run); if (run.candidate) reseal(run.candidate); run.requestDigest = localRecordDigest(run.request); });
    expectNoChange(() => new CensusNormalizationStore(root).inspect(manifest.normalizationId), 'INVALID_CENSUS_NORMALIZATION');
    expectNoChange(() => store.normalize(manifest, NORMALIZED), 'INVALID_CENSUS_NORMALIZATION');
  });

  it.each(['source bytes', 'capture receipt', 'capture intent', 'acquisition', 'missing source bytes', 'missing capture receipt'] as const)(
    'rejects altered upstream %s rather than trusting the saved candidate', async (defect) => {
      const captured = await capture(); const manifest = request(captured); const store = new CensusNormalizationStore(root);
      store.normalize(manifest, NORMALIZED); const acquisition = store.intake.inspect(captured.acquisition!.id)!;
      if (defect === 'source bytes' || defect === 'missing source bytes') {
        const path = join(root, 'objects', ...acquisition.capture.evidence.storageKey.split('/'));
        if (defect === 'source bytes') writeFileSync(path, 'SYNTHETIC_CORRUPTION'); else unlinkSync(path);
      } else if (defect === 'missing capture receipt') unlinkSync(metadataPath(manifest.capture.requestId, 'receipt'));
      else {
        const path = defect === 'acquisition'
          ? join(root, 'acquisitions', `${byteDigest(Buffer.from(acquisition.request.manifest.acquisitionId)).slice(7)}.json`)
          : metadataPath(manifest.capture.requestId, defect === 'capture receipt' ? 'receipt' : 'intent');
        const changed = JSON.parse(readFileSync(path, 'utf8'));
        if (defect === 'capture receipt') changed.response.etag = '"changed-synthetic-etag"';
        else if (defect === 'capture intent') changed.sourceRegistration.permittedPurposes = ['customer-delivery'];
        else changed.request.manifest.sourceRegistration.sourceId = 'another-source';
        writeFileSync(path, encodeLocalRecord(reseal(changed), 128 * 1024));
      }
      expectNoChange(() => new CensusNormalizationStore(root).inspect(manifest.normalizationId));
      expectNoChange(() => store.normalize(manifest, NORMALIZED));
    },
  );

  it.each(['invalid JSON', 'invalid encoding', 'oversized record', 'extra field', 'changed identity'] as const)(
    'rejects a stored run with %s and preserves it for diagnosis', async (defect) => {
      const captured = await capture(); const manifest = request(captured);
      new CensusNormalizationStore(root).normalize(manifest, NORMALIZED);
      if (defect === 'invalid JSON') writeFileSync(runPath(), '{broken');
      else if (defect === 'invalid encoding') writeFileSync(runPath(), Buffer.from([0xc3, 0x28]));
      else if (defect === 'oversized record') writeFileSync(runPath(), Buffer.alloc(128 * 1024 + 1, 32));
      else editRun((run) => {
        if (defect === 'extra field') Object.assign(run, { injectedAuthority: true });
        else run.request.manifest.normalizationId = 'different-id';
      });
      expectNoChange(() => new CensusNormalizationStore(root).inspect(manifest.normalizationId));
    },
  );

  it('leaves captured evidence intact when publication fails before creating a run', async () => {
    const captured = await capture(); const manifest = request(captured); const before = files();
    const publish = localFiles.publishImmutableFile;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((selectedRoot, path, content, maximum) => {
      if (path[0] === 'source-normalizations') throw new Error('SYNTHETIC_NORMALIZATION_WRITE_FAILURE');
      return publish(selectedRoot, path, content, maximum);
    });
    expect(() => new CensusNormalizationStore(root).normalize(manifest, NORMALIZED)).toThrow('SYNTHETIC_NORMALIZATION_WRITE_FAILURE');
    expect(files()).toEqual(before); expect(existsSync(runPath())).toBe(false);
  });

  it('recovers an exact same-request concurrent winner and keeps the winning time', async () => {
    const captured = await capture(); const manifest = request(captured); const publish = localFiles.publishImmutableFile;
    let raced = false; let winner: CensusNormalizationRun | undefined;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((selectedRoot, path, content, maximum) => {
      if (path[0] === 'source-normalizations' && !raced) {
        raced = true; winner = new CensusNormalizationStore(root).normalize(manifest, FINISHED).run;
      }
      return publish(selectedRoot, path, content, maximum);
    });
    const result = new CensusNormalizationStore(root).normalize(manifest, NORMALIZED);
    expect(result).toEqual({ status: 'EXISTING', run: winner });
    expect(result.run.normalizedAt).toBe(FINISHED); expect(readdirSync(join(root, 'source-normalizations'))).toHaveLength(1);
  });

  it('preserves a different-scope concurrent winner and reports conflict', async () => {
    const captured = await capture(); const manifest = request(captured); const other = { ...manifest, usdot: '99999999' };
    const publish = localFiles.publishImmutableFile; let raced = false; let winner: CensusNormalizationRun | undefined;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((selectedRoot, path, content, maximum) => {
      if (path[0] === 'source-normalizations' && !raced) { raced = true; winner = new CensusNormalizationStore(root).normalize(other, FINISHED).run; }
      return publish(selectedRoot, path, content, maximum);
    });
    expect(() => new CensusNormalizationStore(root).normalize(manifest, NORMALIZED)).toThrow(expect.objectContaining({ code: 'CENSUS_NORMALIZATION_CONFLICT' }));
    expect(new CensusNormalizationStore(root).inspect(manifest.normalizationId)).toEqual(winner);
    expect(winner!.state).toBe('NOT_RETURNED'); expect(readdirSync(join(root, 'source-normalizations'))).toHaveLength(1);
  });

  it('reads back a successfully published same-request record after a post-publication error', async () => {
    const captured = await capture(); const manifest = request(captured); const publish = localFiles.publishImmutableFile;
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((selectedRoot, path, content, maximum) => {
      const result = publish(selectedRoot, path, content, maximum);
      if (path[0] === 'source-normalizations') throw new Error('SYNTHETIC_POST_PUBLICATION_FAILURE');
      return result;
    });
    const result = new CensusNormalizationStore(root).normalize(manifest, NORMALIZED);
    expect(result.status).toBe('EXISTING'); expect(result.run.normalizedAt).toBe(NORMALIZED);
    expect(new CensusNormalizationStore(root).inspect(manifest.normalizationId)).toEqual(result.run);
  });
});

describe('closed source normalization requests', () => {
  const valid = (): CensusNormalizationRequest => ({ schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: 'normalization',
    purpose: 'source-qualification', capture: { requestId: 'capture', receiptDigest: `sha256:${'a'.repeat(64)}` }, usdot: '80806' });

  it('accepts an exact request, normalizes key order only, and does not mutate input', () => {
    const input = valid(); const snapshot = structuredClone(input);
    expect(parseCensusNormalizationRequest(input)).toEqual(input); expect(input).toEqual(snapshot);
    expect(parseCensusNormalizationRequest(Object.fromEntries(Object.entries(input).reverse()))).toEqual(input);
  });

  it.each([
    { schema: 'another' }, { normalizationId: '../escape' }, { normalizationId: '' }, { normalizationId: 'a'.repeat(81) },
    { purpose: 'customer-delivery' }, { purpose: 'principal-trading' }, { usdot: '0' }, { usdot: '080806' }, { usdot: 80806 },
    { usdot: '100000000' }, { sourceId: 'another-source' }, { normalizedAt: NORMALIZED }, { root: '../another-root' },
    { adapterId: 'caravan.carrier-json/v1' }, { canonicalAdmission: true }, { capture: { requestId: 'capture' } },
    { capture: { requestId: '../escape', receiptDigest: `sha256:${'a'.repeat(64)}` } },
    { capture: { requestId: 'capture', receiptDigest: `sha256:${'A'.repeat(64)}` } },
    { capture: { requestId: 'capture', receiptDigest: 'sha256:short' } },
    { capture: { requestId: 'capture', receiptDigest: `sha256:${'a'.repeat(64)}`, content: 'injected' } },
  ])('refuses out-of-contract request %j without filesystem writes', (change) => {
    expectNoChange(() => new CensusNormalizationStore(root).normalize({ ...valid(), ...change }, NORMALIZED), 'INVALID_CENSUS_NORMALIZATION_REQUEST');
    expect(existsSync(root)).toBe(false);
  });

  it.each([null, [], 'request', 7, undefined])('rejects non-record input %s', (input) => {
    expect(() => parseCensusNormalizationRequest(input)).toThrow(expect.objectContaining({ code: 'INVALID_CENSUS_NORMALIZATION_REQUEST' }));
  });

  it.each(['schema', 'normalizationId', 'purpose', 'capture', 'usdot'] as const)('requires %s', (key) => {
    const input: Record<string, unknown> = { ...valid() }; delete input[key];
    expect(() => parseCensusNormalizationRequest(input)).toThrow();
  });
});
