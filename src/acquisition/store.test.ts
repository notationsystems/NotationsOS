import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byteDigest, storageKeyFor } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import * as localFiles from '../data-os/local-files';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import { SourceConnectorError } from './errors';
import { buildCensusUrl, parseCensusBytes, type SourceCaptureRequest } from './fmcsa';
import { SOURCE_HTTP_MAX_BYTES, type SourceBytes } from './http';
import { censusQualificationPolicy, SourceCaptureStore, type SourceCaptureInspection } from './store';

type Intent = SourceCaptureInspection['intent'];
type Receipt = NonNullable<SourceCaptureInspection['receipt']>;
const startAt = '2026-09-05T12:00:00.000Z';
const row = { dot_number: '80806', legal_name: 'SYNTHETIC CENSUS CORPORATION',
  business_org_desc: 'CORPORATION', phy_country: 'US', phy_state: 'OH', status_code: 'A',
  power_units: '4', total_drivers: '5', mcs150_date: '20260801' };
const sourceBytes = Buffer.from(`${JSON.stringify([row], null, 2)}\n`);
let temporary: string;
let root: string;
let at: string;
let fetch: ReturnType<typeof vi.fn<(url: URL) => Promise<SourceBytes>>>;
let now: ReturnType<typeof vi.fn<() => string>>;
let store: SourceCaptureStore;

function request(id = 'capture-original', usdot = ['80806']): SourceCaptureRequest {
  return { schema: 'payload.source-capture-request.v1', requestId: id, sourceId: 'fmcsa-company-census', usdot };
}
function fetched(bytes = sourceBytes): SourceBytes {
  return { bytes, mediaType: 'application/json', etag: 'W/"synthetic-version"', lastModified: 'Fri, 04 Sep 2026 12:00:00 GMT' };
}
function files(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const key = prefix ? `${prefix}/${name}` : name;
    const path = join(directory, name);
    return lstatSync(path).isDirectory() ? Object.entries(files(path, key)) : [[key, byteDigest(readFileSync(path))]];
  }));
}
function metadataPath(id: string, name: 'intent' | 'receipt') {
  return join(root, 'source-captures', byteDigest(Buffer.from(id)).slice(7), `${name}.json`);
}
function readIntent(id = 'capture-original'): Intent { return JSON.parse(readFileSync(metadataPath(id, 'intent'), 'utf8')); }
function readReceipt(id = 'capture-original'): Receipt { return JSON.parse(readFileSync(metadataPath(id, 'receipt'), 'utf8')); }
function reseal<T extends { digest: string }>(value: T): T {
  const { digest: _digest, ...payload } = value;
  void _digest;
  value.digest = localRecordDigest(payload);
  return value;
}
function editReceipt(change: (receipt: Receipt) => void, id = 'capture-original') {
  const receipt = readReceipt(id); change(receipt);
  writeFileSync(metadataPath(id, 'receipt'), encodeLocalRecord(reseal(receipt)));
}
function editIntent(change: (intent: Intent) => void, id = 'capture-original') {
  const intent = readIntent(id); const priorDigest = intent.digest;
  change(intent); reseal(intent);
  writeFileSync(metadataPath(id, 'intent'), encodeLocalRecord(intent));
  // Also reseal referring metadata, so this tests bindings rather than a stale outer digest.
  if (existsSync(metadataPath(id, 'receipt'))) editReceipt((receipt) => { receipt.intentDigest = intent.digest; }, id);
  for (const path of Object.keys(files()).filter((path) => path.startsWith('source-budgets/'))) {
    const absolute = join(root, path);
    const budget = JSON.parse(readFileSync(absolute, 'utf8')) as { intentDigest: string };
    if (budget.intentDigest === priorDigest) { budget.intentDigest = intent.digest; writeFileSync(absolute, encodeLocalRecord(budget)); }
  }
}
async function assertInvalid(id = 'capture-original', original = request(id)) {
  const before = files(); fetch.mockClear(); now.mockClear();
  const restarted = new SourceCaptureStore(root, { fetch, now });
  expect(() => restarted.inspect(id)).toThrow(expect.objectContaining({ code: 'SOURCE_HISTORY_INVALID' }));
  await expect(restarted.capture(original, true)).rejects.toMatchObject({ code: 'SOURCE_HISTORY_INVALID' });
  expect(fetch).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled();
  expect(files()).toEqual(before);
}
async function assertReplay(expected: SourceCaptureInspection, original = request(expected.intent.request.requestId)) {
  const before = files(); fetch.mockClear(); now.mockClear();
  const restarted = new SourceCaptureStore(root, { fetch, now: () => { throw new Error('Historical replay must not read the clock'); } });
  expect(restarted.inspect(original.requestId)).toEqual(expected);
  await expect(restarted.capture(original, false)).resolves.toEqual(expected);
  expect(fetch).not.toHaveBeenCalled(); expect(files()).toEqual(before);
}

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-source-capture-store-'));
  root = join(temporary, 'evidence'); at = startAt;
  fetch = vi.fn<(url: URL) => Promise<SourceBytes>>().mockResolvedValue(fetched());
  now = vi.fn(() => at);
  store = new SourceCaptureStore(root, { fetch, now });
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  // Only the concrete temporary directory created by this test is eligible for cleanup.
  expect(resolve(temporary).startsWith(`${resolve(tmpdir())}\\`) || resolve(temporary).startsWith(`${resolve(tmpdir())}/`)).toBe(true);
  expect(temporary.split(/[\\/]/).at(-1)).toMatch(/^payload-source-capture-store-/);
  rmSync(temporary, { recursive: true, force: true });
});

describe('operator-gated immutable source capture', () => {
  it('retains source-original bytes in the existing evidence rail with scoped observations only', async () => {
    const result = await store.capture(request(), true);
    expect(result).toMatchObject({
      schema: 'payload.source-capture-inspection.v1', state: 'CAPTURED', integrity: 'RECOMPUTED_LOCAL',
      canonicalAdmission: false, sourceTruthClaimed: false, customerDistributionPermitted: false, independentVerification: false,
      receipt: { state: 'CAPTURED', failureCode: null, response: { mediaType: 'application/json' } },
      acquisition: { id: 'source-capture:capture-original', contentDigest: byteDigest(sourceBytes), byteLength: sourceBytes.length, capturedAt: startAt },
      observations: { records: [{ dot_number: '80806', identityStatus: 'UNRESOLVED', canonicalId: null }], notReturned: [] },
    });
    expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0][0].href).toBe(buildCensusUrl(request()).href);
    expect(result.intent.sourceRegistration).toEqual(censusQualificationPolicy());
    const intake = new LocalEvidenceIntake(root);
    const acquisition = intake.inspect(result.acquisition!.id)!;
    expect(acquisition).toMatchObject({ mode: 'LOCAL_DEVELOPMENT', policyAuthority: 'OPERATOR_DECLARATION', sourceTruthClaimed: false, canonicalAdmission: false });
    expect(Buffer.from(intake.objects.get(acquisition.request.contentDigest)!)).toEqual(sourceBytes);
    expect(result.receipt!.observationsDigest).toBe(localRecordDigest(parseCensusBytes(sourceBytes, request())));
    expect(Object.keys(files()).filter((path) => path.startsWith('source-budgets/'))).toHaveLength(2);
    await assertReplay(result);
  });
  it('canonicalizes the caller ID order without mutating it', async () => {
    fetch.mockResolvedValue(fetched(Buffer.from('[]')));
    const command = request('sorted', ['80806', '1']);
    const result = await store.capture(command, true);
    expect(command.usdot).toEqual(['80806', '1']);
    expect(result.intent.request.usdot).toEqual(['1', '80806']);
    expect(result.observations).toMatchObject({ records: [], notReturned: ['1', '80806'] });
    await assertReplay(result, command);
  });
  it('does not create directories when new collection is disabled', async () => {
    await expect(store.capture(request(), false)).rejects.toMatchObject({ code: 'SOURCE_COLLECTION_DISABLED', status: 403 });
    expect(fetch).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled(); expect(existsSync(root)).toBe(false);
  });
  it('requires the explicit environment flag when the enabled parameter is omitted', async () => {
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', 'true');
    await expect(store.capture(request())).rejects.toMatchObject({ code: 'SOURCE_COLLECTION_DISABLED' });
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '1');
    expect((await store.capture(request())).state).toBe('CAPTURED');
  });
  it.each(['2026-09-04T23:59:59.999Z', '2026-10-05T00:00:00.001Z', '2027-01-01T00:00:00.000Z'])('blocks a new request outside the qualification policy at %s', async (clock) => {
    at = clock;
    await expect(store.capture(request(), true)).rejects.toMatchObject({ code: 'SOURCE_POLICY_DENIED' });
    expect(fetch).not.toHaveBeenCalled(); expect(files()).toEqual({});
  });
  it('replays after policy expiry even when collection is disabled', async () => {
    const result = await store.capture(request(), true); at = '2027-01-01T00:00:00.000Z';
    await assertReplay(result);
  });
  it.each([
    { url: 'https://attacker.invalid' }, { sourceId: 'fmcsa-qcmobile' }, { usdot: [] },
    { usdot: ['80806', '80806'] }, { usdot: ['080806'] }, { usdot: ['80806) OR 1=1'] },
    { usdot: Array.from({ length: 26 }, (_, index) => String(index + 1)) },
    { requestId: '../escape' }, { requestId: 'x'.repeat(81) }, { query: '$where=private' },
    { authorization: 'private' }, { capturedAt: startAt }, { canonicalAdmission: true },
  ])('refuses an out-of-contract request before storage, clock, or fetch: %j', async (change) => {
    await expect(store.capture({ ...request(), ...change }, true)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetch).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled(); expect(files()).toEqual({});
  });
  it('rejects same-ID scope changes while retaining the original history byte-for-byte', async () => {
    await store.capture(request(), true); const before = files(); fetch.mockClear(); now.mockClear();
    await expect(store.capture(request('capture-original', ['1']), false)).rejects.toMatchObject({ code: 'SOURCE_REQUEST_CONFLICT' });
    expect(fetch).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled(); expect(files()).toEqual(before);
  });
  it('coalesces concurrent same-ID attempts into one provider request and visible incomplete intent', async () => {
    let resolveFetch!: (response: SourceBytes) => void;
    fetch.mockImplementation(() => new Promise((resolveResponse) => { resolveFetch = resolveResponse; }));
    const pending = store.capture(request(), true);
    const concurrent = new SourceCaptureStore(root, { fetch, now });
    const incomplete = await concurrent.capture(request(), true);
    expect(incomplete).toMatchObject({ state: 'INCOMPLETE', receipt: null, acquisition: null });
    expect(fetch).toHaveBeenCalledOnce();
    const before = files();
    await expect(concurrent.capture(request('capture-original', ['1']), true)).rejects.toMatchObject({ code: 'SOURCE_REQUEST_CONFLICT' });
    expect(files()).toEqual(before);
    resolveFetch(fetched());
    const result = await pending; expect(result.state).toBe('CAPTURED');
    expect(concurrent.inspect(request().requestId)).toEqual(result); expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('permanent root-local request budget and safe failed attempts', () => {
  it('admits at most one new request in the same UTC minute across store instances', async () => {
    await store.capture(request('first'), true);
    const second = new SourceCaptureStore(root, { fetch, now });
    const denied = await second.capture(request('second'), true);
    expect(denied).toMatchObject({ state: 'FAILED', receipt: { failureCode: 'LOCAL_BUDGET_EXHAUSTED', acquisition: null } });
    expect(fetch).toHaveBeenCalledOnce();
    await assertReplay(denied);
  });
  it('admits four requests per UTC day, preserves every slot, and starts a new day independently', async () => {
    for (let index = 0; index < 4; index++) {
      at = `2026-09-05T12:0${index}:00.000Z`;
      expect((await store.capture(request(`day-slot-${index}`), true)).state).toBe('CAPTURED');
    }
    const before = files(); at = '2026-09-05T12:04:00.000Z';
    const denied = await store.capture(request('fifth'), true);
    expect(denied.receipt!.failureCode).toBe('LOCAL_BUDGET_EXHAUSTED'); expect(fetch).toHaveBeenCalledTimes(4);
    for (const [path, digest] of Object.entries(before)) expect(files()[path]).toBe(digest);
    expect(Object.keys(files()).filter((path) => path.includes('/day-'))).toHaveLength(4);
    at = '2026-09-06T12:00:00.000Z';
    expect((await new SourceCaptureStore(root, { fetch, now }).capture(request('tomorrow'), true)).state).toBe('CAPTURED');
    expect(fetch).toHaveBeenCalledTimes(5); await assertReplay(denied);
  });
  it('consumes a slot permanently even when the provider fails', async () => {
    fetch.mockRejectedValue(new Error('private provider response'));
    for (let index = 0; index < 4; index++) {
      at = `2026-09-05T12:0${index}:00.000Z`;
      expect((await store.capture(request(`failed-${index}`), true)).receipt!.failureCode).toBe('FETCH_FAILED');
    }
    at = '2026-09-05T12:04:00.000Z';
    const denied = await store.capture(request('fifth'), true);
    expect(denied.receipt!.failureCode).toBe('LOCAL_BUDGET_EXHAUSTED'); expect(fetch).toHaveBeenCalledTimes(4);
    expect(Object.keys(files()).some((path) => path.startsWith('objects/'))).toBe(false);
  });
  it.each([
    [new SourceConnectorError('RATE_LIMITED', 'private provider token', 429), 'RATE_LIMITED'],
    [new SourceConnectorError('SOURCE_TIMEOUT', 'private provider diagnostic', 504), 'FETCH_FAILED'],
    [new Error('private provider diagnostic'), 'FETCH_FAILED'],
    [{ code: 'RATE_LIMITED', message: 'private impersonated error' }, 'FETCH_FAILED'],
  ])('records only a fixed safe outcome for a provider failure', async (failure, code) => {
    fetch.mockRejectedValue(failure);
    const result = await store.capture(request(), true);
    expect(result).toMatchObject({ state: 'FAILED', acquisition: null, observations: null,
      receipt: { failureCode: code, response: null, acquisition: null, observationsDigest: null } });
    expect(JSON.stringify(result)).not.toContain('private');
    for (const path of Object.keys(files())) expect(readFileSync(join(root, path), 'utf8')).not.toContain('private');
    await assertReplay(result);
  });
  it.each([Buffer.alloc(0), Buffer.alloc(SOURCE_HTTP_MAX_BYTES + 1), 'private-not-bytes'])('refuses unusable fetched bytes without evidence publication', async (bytes) => {
    fetch.mockResolvedValue({ ...fetched(), bytes: bytes as Buffer });
    const result = await store.capture(request(), true);
    expect(result).toMatchObject({ state: 'FAILED', acquisition: null, receipt: { failureCode: 'FETCH_FAILED' } });
    expect(Object.keys(files()).some((path) => path.startsWith('objects/') || path.startsWith('acquisitions/'))).toBe(false);
    await assertReplay(result);
  });
  it('rejects a rehashed false budget-denial claim when its own minute/day claims prove admission', async () => {
    fetch.mockRejectedValue(new Error('synthetic network failure'));
    await store.capture(request(), true);
    editReceipt((receipt) => { receipt.failureCode = 'LOCAL_BUDGET_EXHAUSTED'; });
    await assertInvalid();
  });
});

describe('raw-first quarantine and incomplete publication history', () => {
  it.each([
    Buffer.from('{ private malformed response'), Buffer.from([0xff, 0xfe]),
    Buffer.from(JSON.stringify([{ ...row, dot_number: '1' }])),
    Buffer.from(JSON.stringify([{ ...row, business_org_desc: 'SOLE PROPRIETORSHIP' }])),
    Buffer.from(JSON.stringify([{ ...row, phone: 'unselected private field' }])),
  ])('preserves malformed/out-of-scope source bytes before quarantining observations', async (bytes) => {
    fetch.mockResolvedValue(fetched(bytes));
    const result = await store.capture(request(), true);
    expect(result).toMatchObject({ state: 'QUARANTINED', observations: null,
      receipt: { failureCode: 'INVALID_SOURCE_RESPONSE', observationsDigest: null },
      acquisition: { byteLength: bytes.length, contentDigest: byteDigest(bytes) } });
    const raw = new LocalEvidenceIntake(root).objects.get(result.acquisition!.contentDigest)!;
    expect(Buffer.from(raw)).toEqual(bytes);
    await assertReplay(result);
  });
  it.each(['intent', 'acquisition', 'receipt'])('preserves visible publication after a simulated %s publication cleanup failure', async (stage) => {
    const actual = localFiles.publishImmutableFile;
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      const result = actual(...args);
      const segments = args[1];
      if ((stage === 'intent' && segments.at(-1) === 'intent.json')
        || (stage === 'acquisition' && segments[0] === 'acquisitions')
        || (stage === 'receipt' && segments.at(-1) === 'receipt.json')) throw new Error('synthetic post-publication cleanup failure');
      return result;
    });
    if (stage === 'receipt') await expect(store.capture(request(), true)).rejects.toThrow('synthetic post-publication');
    else await store.capture(request(), true);
    publish.mockRestore();
    const result = store.inspect(request().requestId)!;
    expect(result.state).toBe(stage === 'intent' ? 'INCOMPLETE' : 'CAPTURED');
    expect(fetch).toHaveBeenCalledTimes(stage === 'intent' ? 0 : 1);
    await assertReplay(result);
  });
  it.each(['acquisition', 'receipt'])('never retries after failure immediately before %s publication', async (stage) => {
    const actual = localFiles.publishImmutableFile;
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      if ((stage === 'acquisition' && args[1][0] === 'acquisitions')
        || (stage === 'receipt' && args[1].at(-1) === 'receipt.json')) throw new Error('synthetic pre-publication failure');
      return actual(...args);
    });
    await expect(store.capture(request(), true)).rejects.toThrow('synthetic pre-publication');
    publish.mockRestore();
    const result = store.inspect(request().requestId)!;
    expect(result).toMatchObject({ state: 'INCOMPLETE', receipt: null, observations: null });
    expect(result.acquisition === null).toBe(stage === 'acquisition');
    expect(Object.keys(files()).filter((path) => path.startsWith('objects/'))).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
    await assertReplay(result);
  });
  it('leaves an intent without a receipt after a pre-budget publication failure and never resumes collection', async () => {
    const actual = localFiles.publishImmutableFile;
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      if (args[1][0] === 'source-budgets') throw new Error('synthetic budget storage failure');
      return actual(...args);
    });
    await expect(store.capture(request(), true)).rejects.toThrow('synthetic budget storage failure');
    publish.mockRestore();
    const result = store.inspect(request().requestId)!;
    expect(result).toMatchObject({ state: 'INCOMPLETE', receipt: null, acquisition: null });
    expect(fetch).not.toHaveBeenCalled(); await assertReplay(result);
  });
  it('retains an incomplete history when the clock moves backwards after fetch', async () => {
    now.mockReturnValueOnce(startAt).mockReturnValueOnce('2026-09-05T11:59:59.999Z');
    await expect(store.capture(request(), true)).rejects.toThrow('Source clock moved backwards');
    const result = store.inspect(request().requestId)!;
    expect(result.state).toBe('INCOMPLETE'); expect(result.acquisition).toBeNull();
    await assertReplay(result);
  });
});

describe('historical binding and byte integrity without repair or execution', () => {
  it('unknown and malformed historical reads never create storage', () => {
    expect(store.inspect('unknown')).toBeUndefined();
    expect(() => store.inspect('../escape')).toThrow(expect.objectContaining({ code: 'SOURCE_HISTORY_INVALID' }));
    expect(files()).toEqual({}); expect(fetch).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled();
  });
  it('detects modified source bytes and does not replace them on replay', async () => {
    const result = await store.capture(request(), true);
    writeFileSync(join(root, 'objects', ...storageKeyFor(result.acquisition!.contentDigest).split('/')), Buffer.from('tampered source bytes'));
    await assertInvalid();
  });
  it('detects missing source bytes without reconstructing the object', async () => {
    const result = await store.capture(request(), true);
    unlinkSync(join(root, 'objects', ...storageKeyFor(result.acquisition!.contentDigest).split('/')));
    await assertInvalid();
  });
  it('detects an unsealed receipt edit', async () => {
    await store.capture(request(), true);
    const receipt = readReceipt(); receipt.observationsDigest = `sha256:${'0'.repeat(64)}`;
    writeFileSync(metadataPath(request().requestId, 'receipt'), JSON.stringify(receipt));
    await assertInvalid();
  });
  it.each([
    ['schema', (receipt: Receipt) => { receipt.schema = 'other' as Receipt['schema']; }],
    ['intent digest', (receipt: Receipt) => { receipt.intentDigest = `sha256:${'0'.repeat(64)}`; }],
    ['acquisition ID', (receipt: Receipt) => { receipt.acquisition!.id = 'source-capture:other'; }],
    ['acquisition digest', (receipt: Receipt) => { receipt.acquisition!.digest = `sha256:${'0'.repeat(64)}`; }],
    ['observations digest', (receipt: Receipt) => { receipt.observationsDigest = localRecordDigest({ ...parseCensusBytes(sourceBytes, request()), records: [] }); }],
    ['unknown state', (receipt: Receipt) => { receipt.state = 'ADMITTED' as Receipt['state']; }],
    ['false quarantine', (receipt: Receipt) => { receipt.state = 'QUARANTINED'; receipt.failureCode = 'INVALID_SOURCE_RESPONSE'; receipt.observationsDigest = null; }],
    ['false failure', (receipt: Receipt) => { receipt.state = 'FAILED'; receipt.failureCode = 'FETCH_FAILED'; receipt.acquisition = null; receipt.response = null; receipt.observationsDigest = null; }],
    ['captured failure code', (receipt: Receipt) => { receipt.failureCode = 'RATE_LIMITED'; }],
    ['finish before start', (receipt: Receipt) => { receipt.finishedAt = '2026-09-05T11:59:59.999Z'; }],
    ['noncanonical finish', (receipt: Receipt) => { receipt.finishedAt = '2026-09-05T12:00:00Z'; }],
    ['wrong media', (receipt: Receipt) => { receipt.response!.mediaType = 'text/html'; }],
    ['header injection', (receipt: Receipt) => { receipt.response!.etag = 'private\r\nCookie: private'; }],
    ['oversized ETag', (receipt: Receipt) => { receipt.response!.etag = 'x'.repeat(257); }],
    ['noncanonical HTTP date', (receipt: Receipt) => { receipt.response!.lastModified = '2026-09-04'; }],
    ['extra claim', (receipt: Receipt) => { Object.assign(receipt, { canonicalAdmission: true }); }],
    ['extra response header', (receipt: Receipt) => { Object.assign(receipt.response!, { authorization: 'private' }); }],
  ])('rejects a rehashed receipt with %s changed', async (_label, change) => {
    await store.capture(request(), true); editReceipt(change); await assertInvalid();
  });
  it.each([
    ['schema', (intent: Intent) => { intent.schema = 'other' as Intent['schema']; }],
    ['adapter', (intent: Intent) => { intent.adapter = 'other' as Intent['adapter']; }],
    ['URL', (intent: Intent) => { intent.queryUrl = 'https://attacker.invalid/private'; }],
    ['request ID', (intent: Intent) => { intent.request.requestId = 'other'; intent.requestDigest = localRecordDigest(intent.request); }],
    ['source ID', (intent: Intent) => { intent.request.sourceId = 'fmcsa-qcmobile' as Intent['request']['sourceId']; intent.requestDigest = localRecordDigest(intent.request); }],
    ['request digest', (intent: Intent) => { intent.requestDigest = `sha256:${'0'.repeat(64)}`; }],
    ['policy', (intent: Intent) => { intent.sourceRegistration.allowedOperations = ['INGEST']; }],
    ['source registration', (intent: Intent) => { intent.sourceRegistration.sourceId = 'other'; }],
    ['purpose', (intent: Intent) => { intent.sourceRegistration.permittedPurposes = ['customer-distribution']; }],
    ['nonce', (intent: Intent) => { intent.nonce = 'invalid'; }],
    ['expired start', (intent: Intent) => { intent.startedAt = '2027-01-01T00:00:00.000Z'; }],
    ['noncanonical start', (intent: Intent) => { intent.startedAt = '2026-09-05T12:00:00Z'; }],
    ['start after capture', (intent: Intent) => { intent.startedAt = '2026-09-05T12:00:00.001Z'; }],
    ['unexpected claim', (intent: Intent) => { Object.assign(intent, { independentVerification: true }); }],
    ['qualification authority', (intent: Intent) => { Object.assign(intent.qualificationBasis, { authority: 'PROVIDER_LICENSE' }); }],
    ['qualification license status', (intent: Intent) => { Object.assign(intent.qualificationBasis, { providerLicense: 'RESOLVED' }); }],
    ['qualification verification claim', (intent: Intent) => { Object.assign(intent.qualificationBasis, { independentRightsVerification: true }); }],
    ['qualification rights reference', (intent: Intent) => { Object.assign(intent.qualificationBasis, { references: ['https://attacker.invalid/license'] }); }],
    ['qualification review date', (intent: Intent) => { Object.assign(intent.qualificationBasis, { reviewedOn: '2027-01-01' }); }],
    ['query scope re-bound away from raw records', (intent: Intent) => {
      intent.request.usdot = ['1']; intent.requestDigest = localRecordDigest(intent.request); intent.queryUrl = buildCensusUrl(intent.request).href;
    }],
  ])('rejects a rehashed and relinked intent with %s changed', async (_label, change) => {
    await store.capture(request(), true); editIntent(change); await assertInvalid();
  });
  it('rejects a finished time before the actual acquisition despite being after intent creation', async () => {
    now.mockReturnValueOnce(startAt).mockReturnValueOnce('2026-09-05T12:00:01.000Z').mockReturnValueOnce('2026-09-05T12:00:02.000Z');
    await store.capture(request(), true);
    editReceipt((receipt) => { receipt.finishedAt = '2026-09-05T12:00:00.500Z'; });
    await assertInvalid();
  });
  it('cannot turn malformed raw bytes into CAPTURED by substituting a valid observations digest', async () => {
    fetch.mockResolvedValue(fetched(Buffer.from('{ malformed source')));
    await store.capture(request(), true);
    editReceipt((receipt) => { receipt.state = 'CAPTURED'; receipt.failureCode = null; receipt.observationsDigest = localRecordDigest(parseCensusBytes(sourceBytes, request())); });
    await assertInvalid();
  });
  it.each(['minute', 'day'])('requires the original %s reservation on readback', async (kind) => {
    await store.capture(request(), true);
    const slot = Object.keys(files()).find((path) => path.startsWith('source-budgets/') && path.includes(`/${kind}-`))!;
    unlinkSync(join(root, slot)); await assertInvalid();
  });
  it('rejects a budget claim re-bound to a different intent', async () => {
    await store.capture(request(), true);
    const slot = Object.keys(files()).find((path) => path.includes('/day-'))!;
    writeFileSync(join(root, slot), encodeLocalRecord({ schema: 'payload.source-request-budget.v1', intentDigest: `sha256:${'0'.repeat(64)}` }));
    await assertInvalid();
  });
  it('rejects an unreadable receipt without repair or a new provider attempt', async () => {
    await store.capture(request(), true);
    writeFileSync(metadataPath(request().requestId, 'receipt'), '{ corrupt receipt');
    await assertInvalid();
  });
  it.each(['receipt-only', 'acquisition-only', 'both'])('rejects %s orphaned history without creating a replacement intent', async (shape) => {
    await store.capture(request(), true);
    unlinkSync(metadataPath(request().requestId, 'intent'));
    if (shape === 'acquisition-only') unlinkSync(metadataPath(request().requestId, 'receipt'));
    if (shape === 'receipt-only') {
      const acquisitionPath = Object.keys(files()).find((path) => path.startsWith('acquisitions/'))!;
      unlinkSync(join(root, acquisitionPath));
    }
    await assertInvalid();
    expect(existsSync(metadataPath(request().requestId, 'intent'))).toBe(false);
  });
  it('requires budget integrity even for an incomplete retained acquisition', async () => {
    const actual = localFiles.publishImmutableFile;
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      if (args[1].at(-1) === 'receipt.json') throw new Error('synthetic receipt publication failure');
      return actual(...args);
    });
    await expect(store.capture(request(), true)).rejects.toThrow('synthetic receipt publication');
    publish.mockRestore();
    expect(store.inspect(request().requestId)!.state).toBe('INCOMPLETE');
    const slot = Object.keys(files()).find((path) => path.includes('/day-'))!;
    unlinkSync(join(root, slot)); await assertInvalid();
  });
  it('requires actual minute-contention evidence for a budget-denied history', async () => {
    await store.capture(request('first'), true);
    await store.capture(request('second'), true);
    const slot = Object.keys(files()).find((path) => path.includes('/minute-'))!;
    unlinkSync(join(root, slot)); await assertInvalid('second');
  });
  it('requires all four occupied day slots for a daily budget-denied history', async () => {
    for (let index = 0; index < 4; index++) {
      at = `2026-09-05T12:0${index}:00.000Z`;
      await store.capture(request(`first-${index}`), true);
    }
    at = '2026-09-05T12:04:00.000Z'; await store.capture(request('fifth'), true);
    const slot = Object.keys(files()).find((path) => path.includes('/day-'))!;
    unlinkSync(join(root, slot)); await assertInvalid('fifth');
  });
});

describe('partial budget publication and monotonic receipt clocks', () => {
  it.each(['minute-', 'day-'])('leaves inspectable INCOMPLETE history after its own %s slot is published but cleanup fails', async (prefix) => {
    const actual = localFiles.publishImmutableFile;
    const publish = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      const result = actual(...args);
      if (args[1][0] === 'source-budgets' && args[1].at(-1)!.startsWith(prefix)) throw new Error('synthetic budget publication cleanup failure');
      return result;
    });
    await expect(store.capture(request(), true)).rejects.toThrow('synthetic budget publication cleanup failure');
    publish.mockRestore();
    const result = store.inspect(request().requestId)!;
    expect(result).toMatchObject({ state: 'INCOMPLETE', receipt: null, acquisition: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(Object.keys(files()).filter((path) => path.startsWith('source-budgets/'))).toHaveLength(prefix === 'minute-' ? 1 : 2);
    await assertReplay(result);
  });
  it('does not publish a receipt whose finish time precedes the retained acquisition', async () => {
    now.mockReturnValueOnce(startAt).mockReturnValueOnce('2026-09-05T12:00:02.000Z').mockReturnValueOnce('2026-09-05T12:00:01.000Z');
    await expect(store.capture(request(), true)).rejects.toThrow('Source clock moved backwards');
    const result = store.inspect(request().requestId)!;
    expect(result).toMatchObject({ state: 'INCOMPLETE', receipt: null, acquisition: { capturedAt: '2026-09-05T12:00:02.000Z' } });
    await assertReplay(result);
  });
});
