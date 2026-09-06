import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSamsaraHistoryUrl, fetchSamsaraHistoryBytes, SAMSARA_HISTORY_MAX_WINDOW_MS,
  SAMSARA_HTTP_MAX_BYTES, SAMSARA_HTTP_TIMEOUT_MS, type SamsaraHistoryQuery,
} from './samsara-http';

const { lookupMock, requestMock } = vi.hoisted(() => ({ lookupMock: vi.fn(), requestMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));
vi.mock('node:https', () => ({ request: requestMock }));

const TOKEN = 'samsara_api_TEST-private-token._~123';
class FakeRequest extends EventEmitter {
  destroy = vi.fn();
  end = vi.fn();
}
class FakeResponse extends EventEmitter {
  destroy = vi.fn();
  statusCode = 200;
  headers: IncomingHttpHeaders = { 'content-type': 'application/json' };
  rawHeaders: string[] = [];
  complete = true;
}
let outgoing: FakeRequest;
let response: FakeResponse;
let options: RequestOptions;
let onResponse: (response: IncomingMessage) => void;

function query(): SamsaraHistoryQuery {
  return { region: 'US', vehicleId: '1234567890123456789', startTime: '2026-09-04T12:00:00.000Z', endTime: '2026-09-04T12:15:00.000Z' };
}
async function start(input = query(), token = TOKEN) {
  const result = fetchSamsaraHistoryBytes(input, token);
  await Promise.resolve();
  expect(requestMock).toHaveBeenCalledOnce();
  return { result };
}
function send(overrides: Partial<FakeResponse> = {}) {
  Object.assign(response, overrides);
  onResponse(response as unknown as IncomingMessage);
}
function end(bytes = Buffer.from('{"data":[],"pagination":{"hasNextPage":false,"endCursor":""}}')) {
  response.emit('data', bytes);
  response.emit('end');
  response.emit('close');
}
async function sanitized(result: Promise<unknown>, code: string) {
  const error = await result.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(`SAMSARA_${code}`);
  expect((error as Error).cause).toBeUndefined();
  expect(JSON.stringify(error)).not.toContain(TOKEN);
  expect(String(error)).not.toContain('private');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', undefined);
  lookupMock.mockReset().mockResolvedValue([{ address: '18.164.111.7', family: 4 }]);
  outgoing = new FakeRequest();
  response = new FakeResponse();
  requestMock.mockReset().mockImplementation((requestOptions: RequestOptions, callback: typeof onResponse) => {
    options = requestOptions;
    onResponse = callback;
    return outgoing as unknown as ClientRequest;
  });
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('closed, bounded Samsara history query', () => {
  it.each([
    ['US', 'api.samsara.com'], ['EU', 'api.eu.samsara.com'], ['CA', 'api.ca.samsara.com'],
  ] as const)('fixes the %s endpoint without fallback', (region, hostname) => {
    const url = buildSamsaraHistoryUrl({ ...query(), region });
    expect(url.origin).toBe(`https://${hostname}`);
    expect(url.pathname).toBe('/fleet/vehicles/stats/history');
    expect([...url.searchParams]).toEqual([
      ['types', 'gps'], ['vehicleIds', '1234567890123456789'],
      ['startTime', '2026-09-04T12:00:00.000Z'], ['endTime', '2026-09-04T12:15:00.000Z'],
    ]);
    expect(url.username).toBe(''); expect(url.password).toBe(''); expect(url.hash).toBe('');
    expect(SAMSARA_HISTORY_MAX_WINDOW_MS).toBe(900000);
  });

  it.each([
    ['null', null], ['undefined', undefined], ['array', []], ['URL', new URL('https://private.invalid')],
    ['text', 'private'], ['prototype', Object.assign(Object.create({ inherited: true }), query())],
    ['missing region', { vehicleId: '1', startTime: query().startTime, endTime: query().endTime }],
    ['extra token', { ...query(), token: TOKEN }], ['extra cursor', { ...query(), after: 'private' }],
    ['extra URL', { ...query(), url: 'https://private.invalid' }], ['extra type', { ...query(), types: 'fuelPercents' }],
    ['symbol key', { ...query(), [Symbol('private')]: true }], ['unknown region', { ...query(), region: 'APAC' }],
    ['prototype region', { ...query(), region: '__proto__' }], ['numeric region', { ...query(), region: 1 }],
    ['wrong case', { ...query(), region: 'us' }],
  ])('rejects %s without DNS or HTTP', async (_label, value) => {
    expect(() => buildSamsaraHistoryUrl(value as SamsaraHistoryQuery)).toThrow('SAMSARA_INVALID_QUERY');
    await sanitized(fetchSamsaraHistoryBytes(value as SamsaraHistoryQuery, TOKEN), 'INVALID_QUERY');
    expect(lookupMock).not.toHaveBeenCalled(); expect(requestMock).not.toHaveBeenCalled();
  });

  it.each(['0', '01', '-1', '+1', '1.0', '1e1', '1,2', ' 1', '1 ', '1\r\n', '１', '', '1'.repeat(33), 1, null])('rejects invalid vehicle id %s', async (vehicleId) => {
    await sanitized(fetchSamsaraHistoryBytes({ ...query(), vehicleId } as SamsaraHistoryQuery, TOKEN), 'INVALID_QUERY');
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each([
    '2026-09-04T12:00:00Z', '2026-09-04T12:00:00.000+00:00', '2026-09-04T12:00:00.000z',
    '2026-09-04 12:00:00.000Z', '2026-09-04T12:00:00.0000Z', '2026-02-30T12:00:00.000Z',
    '2026-09-04T25:00:00.000Z', '2026-09-04T12:00:60.000Z', '2026-09-04', '', 0, null,
  ])('rejects noncanonical timestamp %s', async (startTime) => {
    await sanitized(fetchSamsaraHistoryBytes({ ...query(), startTime } as SamsaraHistoryQuery, TOKEN), 'INVALID_QUERY');
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each(['2026-09-04T12:00:00.000Z', '2026-09-04T11:59:59.999Z', '2026-09-04T12:15:00.001Z'])('rejects nonpositive or oversized time window %s', async (endTime) => {
    await sanitized(fetchSamsaraHistoryBytes({ ...query(), endTime }, TOKEN), 'INVALID_QUERY');
  });

  it('permits a one-millisecond window and the maximum decimal identifier without numeric coercion', () => {
    const url = buildSamsaraHistoryUrl({ ...query(), vehicleId: '9'.repeat(32), endTime: '2026-09-04T12:00:00.001Z' });
    expect(url.searchParams.get('vehicleIds')).toBe('9'.repeat(32));
  });

  it('accepts a plain null-prototype record', () => {
    expect(buildSamsaraHistoryUrl(Object.assign(Object.create(null), query())).hostname).toBe('api.samsara.com');
  });

  it.each(['region', 'vehicleId', 'startTime', 'endTime'])('does not invoke an accessor for %s', async (field) => {
    const input = query(); const getter = vi.fn(() => { throw new Error(TOKEN); });
    Object.defineProperty(input, field, { get: getter, enumerable: true });
    await sanitized(fetchSamsaraHistoryBytes(input, TOKEN), 'INVALID_QUERY');
    expect(getter).not.toHaveBeenCalled(); expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects non-enumerable fields and redacts hostile proxy errors', async () => {
    const input = query(); Object.defineProperty(input, 'region', { value: 'US', enumerable: false });
    await sanitized(fetchSamsaraHistoryBytes(input, TOKEN), 'INVALID_QUERY');
    const proxy = new Proxy(query(), { getPrototypeOf() { throw new Error(TOKEN); } });
    await sanitized(fetchSamsaraHistoryBytes(proxy, TOKEN), 'INVALID_QUERY');
  });
});

describe('authorization and TLS boundary', () => {
  it.each(['US', 'EU', 'CA'] as const)('pins public IPv4 and keeps the bearer solely in Authorization for %s', async (region) => {
    const input = { ...query(), region };
    const { result } = await start(input);
    const hostname = buildSamsaraHistoryUrl(input).hostname;
    expect(lookupMock).toHaveBeenCalledWith(hostname, { all: true, family: 4, verbatim: true });
    expect(options).toMatchObject({
      protocol: 'https:', hostname, servername: hostname, port: 443, method: 'GET', agent: false,
      family: 4, autoSelectFamily: false, rejectUnauthorized: true, minVersion: 'TLSv1.2', maxHeaderSize: 8192,
    });
    expect(options.headers).toEqual({
      Accept: 'application/json', 'Accept-Encoding': 'identity',
      'User-Agent': 'PayloadOS/0.1 bounded-authorized-history', Authorization: `Bearer ${TOKEN}`,
    });
    expect(options.path).not.toContain(TOKEN); expect(options.auth).toBeUndefined();
    const callback = vi.fn(); options.lookup!(hostname, {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '18.164.111.7', 4);
    expect(outgoing.end).toHaveBeenCalledOnce();
    send(); end(Buffer.from('{}'));
    await expect(result).resolves.toEqual({ bytes: Buffer.from('{}'), mediaType: 'application/json' });
    expect(lookupMock).toHaveBeenCalledOnce();
  });

  it('snapshots query values before asynchronous DNS', async () => {
    const input = query(); const original = buildSamsaraHistoryUrl(input);
    const result = fetchSamsaraHistoryBytes(input, TOKEN);
    input.region = 'EU'; input.vehicleId = '2'; input.endTime = '2026-09-04T12:00:00.001Z';
    await Promise.resolve();
    expect(options.hostname).toBe(original.hostname); expect(options.path).toBe(`${original.pathname}${original.search}`);
    send(); end(); await result;
  });

  it.each(['', 'a'.repeat(4097), 'Bearer private', 'private\r\nInjected: true', 'private\n', 'private\t', 'private secret', 'secret=', 'secret/', 'secret+', 'é', undefined, null, {}, 123])('refuses unsafe token case %# without contacting a provider', async (token) => {
    await sanitized(fetchSamsaraHistoryBytes(query(), token as string), 'INVALID_TOKEN');
    expect(lookupMock).not.toHaveBeenCalled(); expect(requestMock).not.toHaveBeenCalled();
  });

  it('accepts the explicit 4096-byte token ceiling without environment credential lookup', async () => {
    vi.stubEnv('SAMSARA_API_TOKEN', 'should-not-be-used-private');
    const { result } = await start(query(), 'a'.repeat(4096));
    expect(options.headers).toMatchObject({ Authorization: `Bearer ${'a'.repeat(4096)}` });
    send(); end(); await result;
  });

  it('refuses globally disabled TLS verification before DNS', async () => {
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
    await sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'TLS_CONFIGURATION_DISALLOWED');
    expect(lookupMock).not.toHaveBeenCalled(); expect(requestMock).not.toHaveBeenCalled();
  });

  it('rechecks unsafe TLS configuration after DNS before sending authorization', async () => {
    const result = fetchSamsaraHistoryBytes(query(), TOKEN);
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
    await sanitized(result, 'TLS_CONFIGURATION_DISALLOWED'); expect(requestMock).not.toHaveBeenCalled();
  });
});

describe('public DNS pin and total deadline', () => {
  it.each([
    '0.1.2.3', '10.1.2.3', '100.64.0.1', '100.127.255.254', '127.0.0.1',
    '169.254.169.254', '172.16.0.1', '172.31.255.254', '192.0.0.9', '192.0.2.1',
    '192.168.1.1', '192.88.99.1', '192.31.196.1', '192.52.193.1', '192.175.48.1',
    '198.18.0.1', '198.19.255.254', '198.51.100.1', '203.0.113.1', '224.0.0.1',
    '239.255.255.255', '240.0.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1',
    '1.2.3.999', '0177.0.0.1',
  ])('rejects %s even alongside a permitted public answer', async (address) => {
    lookupMock.mockResolvedValue([{ address: '18.164.111.7', family: 4 }, { address, family: 4 }]);
    await sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'DESTINATION_DISALLOWED');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it.each([
    [[]], [[{ address: '2600:9000:2000::1', family: 6 }]],
    [Array.from({ length: 33 }, () => ({ address: '18.164.111.7', family: 4 }))],
  ])('rejects absent, IPv6-only, or excessively numerous DNS results %#', async (answers) => {
    lookupMock.mockResolvedValue(answers);
    await sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'DESTINATION_DISALLOWED');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('pins the first checked address without trying another', async () => {
    lookupMock.mockResolvedValue([{ address: '18.164.111.7', family: 4 }, { address: '18.164.111.8', family: 4 }]);
    const { result } = await start(); outgoing.emit('error', new Error(TOKEN));
    await sanitized(result, 'NETWORK_FAILED');
    expect(requestMock).toHaveBeenCalledOnce(); expect(lookupMock).toHaveBeenCalledOnce();
  });

  it.each(['rejection', 'throw'])('redacts DNS %s with no retry', async (mode) => {
    if (mode === 'throw') lookupMock.mockImplementation(() => { throw new Error(TOKEN); });
    else lookupMock.mockRejectedValue(new Error(TOKEN));
    await sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'DNS_FAILED');
    expect(lookupMock).toHaveBeenCalledOnce(); expect(requestMock).not.toHaveBeenCalled();
  });

  it('counts stalled DNS toward the deadline and never connects after late resolution', async () => {
    let resolveLookup!: (value: { address: string; family: number }[]) => void;
    lookupMock.mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const assertion = sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(SAMSARA_HTTP_TIMEOUT_MS); await assertion;
    resolveLookup([{ address: '18.164.111.7', family: 4 }]); await Promise.resolve();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('ignores late DNS rejection after timeout', async () => {
    let rejectLookup!: (error: Error) => void;
    lookupMock.mockImplementation(() => new Promise((_resolve, reject) => { rejectLookup = reject; }));
    const assertion = sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(SAMSARA_HTTP_TIMEOUT_MS); await assertion;
    rejectLookup(new Error(TOKEN)); await Promise.resolve(); expect(requestMock).not.toHaveBeenCalled();
  });

  it('does not refresh the total deadline for active data after slow DNS', async () => {
    lookupMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([{ address: '18.164.111.7', family: 4 }]), 9000)));
    const assertion = sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(9000); send(); response.emit('data', Buffer.from('['));
    await vi.advanceTimersByTimeAsync(999); expect(outgoing.destroy).not.toHaveBeenCalled();
    response.emit('data', Buffer.from(' ')); await vi.advanceTimersByTimeAsync(1); await assertion;
    expect(outgoing.destroy).toHaveBeenCalledOnce(); expect(response.destroy).toHaveBeenCalledOnce();
    end(); expect(requestMock).toHaveBeenCalledOnce();
  });

  it('destroys late responses and suppresses their diagnostics after a connection timeout', async () => {
    const { result } = await start(); const assertion = sanitized(result, 'TIMEOUT');
    await vi.advanceTimersByTimeAsync(SAMSARA_HTTP_TIMEOUT_MS); await assertion;
    expect(outgoing.destroy).toHaveBeenCalledOnce(); send();
    expect(response.destroy).toHaveBeenCalledOnce(); response.emit('error', new Error(TOKEN));
  });
});

describe('bounded historical page and sanitized errors', () => {
  it.each([300, 301, 302, 303, 307, 308, 399])('refuses redirect status %s without forwarding bearer credentials', async (statusCode) => {
    const { result } = await start();
    send({ statusCode, headers: { location: 'https://api.eu.samsara.com/private', 'set-cookie': [TOKEN] } });
    await sanitized(result, 'REDIRECT_DISALLOWED'); expect(requestMock).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce(); expect(outgoing.destroy).toHaveBeenCalledOnce();
  });

  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMITED']] as const)('reports %s without error-body/header retention, retry, or regional fallback', async (statusCode, code) => {
    const { result } = await start();
    send({ statusCode, headers: { 'retry-after': '1', 'set-cookie': [TOKEN], authorization: TOKEN } });
    response.emit('data', Buffer.from(TOKEN)); await sanitized(result, code);
    await vi.advanceTimersByTimeAsync(60000);
    expect(requestMock).toHaveBeenCalledOnce(); expect(lookupMock).toHaveBeenCalledOnce();
    expect(response.listenerCount('data')).toBe(0);
  });

  it.each([0, 201, 204, 400, 404, 500, 503])('refuses non-200 status %s', async (statusCode) => {
    const { result } = await start(); send({ statusCode }); await sanitized(result, 'HTTP_ERROR');
  });

  it.each([undefined, 'text/html', 'application/problem+json', 'application/json; charset=latin1', ['application/json'], 'application/json, text/html'])('refuses unsupported media type %s', async (contentType) => {
    const { result } = await start(); send({ headers: { 'content-type': contentType as string } });
    await sanitized(result, 'MEDIA_TYPE_UNSUPPORTED');
  });

  it.each(['gzip', 'br', 'deflate', 'identity, gzip', ['identity']])('never decompresses %s', async (encoding) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-encoding': encoding as string } });
    await sanitized(result, 'ENCODING_UNSUPPORTED');
  });

  it.each(['-1', '1.1', '+2', '2 private', '9007199254740992', '', ['2'], '0'.repeat(17)])('refuses invalid Content-Length %s', async (length) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-length': length as string } });
    await sanitized(result, 'INVALID_RESPONSE');
  });

  it.each(['Content-Type', 'Content-Length', 'Content-Encoding', 'Transfer-Encoding'])('refuses duplicate structural header %s', async (name) => {
    const { result } = await start(); send({ rawHeaders: [name, 'a', name.toLowerCase(), 'b'] });
    await sanitized(result, 'INVALID_RESPONSE');
  });

  it.each(['gzip', 'chunked, gzip', ['chunked']])('refuses unsupported transfer encoding %s', async (encoding) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'transfer-encoding': encoding as string } });
    await sanitized(result, 'INVALID_RESPONSE');
  });

  it('refuses conflicting Content-Length and Transfer-Encoding', async () => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-length': '2', 'transfer-encoding': 'chunked' } });
    await sanitized(result, 'INVALID_RESPONSE');
  });

  it('refuses declared body overflow before subscribing to any bytes', async () => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-length': String(SAMSARA_HTTP_MAX_BYTES + 1) } });
    await sanitized(result, 'BODY_TOO_LARGE'); expect(response.listenerCount('data')).toBe(0);
    expect(response.destroy).toHaveBeenCalledOnce();
  });

  it('caps chunked bytes without trusting headers', async () => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } });
    response.emit('data', Buffer.alloc(SAMSARA_HTTP_MAX_BYTES)); response.emit('data', Buffer.from('x'));
    await sanitized(result, 'BODY_TOO_LARGE'); expect(outgoing.destroy).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
  });

  it('preserves exactly the maximum bytes without pretending to parse JSON or UTF-8', async () => {
    const { result } = await start();
    send({ headers: { 'content-type': 'Application/JSON; charset=UTF-8', 'content-encoding': 'IDENTITY', 'content-length': String(SAMSARA_HTTP_MAX_BYTES) } });
    const bytes = Buffer.alloc(SAMSARA_HTTP_MAX_BYTES, 0xff); end(bytes);
    await expect(result).resolves.toEqual({ bytes, mediaType: 'application/json' });
  });

  it('copies incoming buffers so later callback mutation cannot alter preserved bytes', async () => {
    const { result } = await start(); send();
    const bytes = Buffer.from('{}'); response.emit('data', bytes); bytes.fill(0); response.emit('end');
    await expect(result).resolves.toEqual({ bytes: Buffer.from('{}'), mediaType: 'application/json' });
  });

  it.each(['1', '3'])('refuses Content-Length %s when exactly two bytes were read', async (length) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-length': length } }); end(Buffer.from('{}'));
    await sanitized(result, 'INVALID_RESPONSE');
  });

  it('refuses incomplete HTTP framing even on end', async () => {
    const { result } = await start(); send({ complete: false }); end(); await sanitized(result, 'INVALID_RESPONSE');
  });

  it('refuses non-byte stream chunks without echoing them', async () => {
    const { result } = await start(); send(); response.emit('data', TOKEN); await sanitized(result, 'INVALID_RESPONSE');
  });

  it.each(['aborted', 'error', 'close'])('sanitizes premature body %s and cleans up', async (event) => {
    const { result } = await start(); send(); response.emit(event, new Error(TOKEN)); await sanitized(result, 'NETWORK_FAILED');
    expect(response.destroy).toHaveBeenCalledOnce(); expect(outgoing.destroy).toHaveBeenCalledOnce();
    response.emit('error', new Error(TOKEN)); outgoing.emit('error', new Error(TOKEN));
  });

  it('sanitizes synchronous HTTPS construction errors', async () => {
    requestMock.mockImplementation(() => { throw new Error(TOKEN); });
    await sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'NETWORK_FAILED'); expect(requestMock).toHaveBeenCalledOnce();
  });

  it('sanitizes synchronous request.end errors and cleans up', async () => {
    outgoing.end.mockImplementation(() => { throw new Error(TOKEN); });
    await sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'NETWORK_FAILED'); expect(outgoing.destroy).toHaveBeenCalledOnce();
  });

  it('handles a synchronous rejected response without ending the request', async () => {
    requestMock.mockImplementation((_options: RequestOptions, callback: typeof onResponse) => {
      response.statusCode = 401; callback(response as unknown as IncomingMessage); return outgoing;
    });
    await sanitized(fetchSamsaraHistoryBytes(query(), TOKEN), 'UNAUTHORIZED');
    expect(outgoing.end).not.toHaveBeenCalled(); expect(outgoing.destroy).toHaveBeenCalledOnce();
  });

  it('redacts TLS, oversized-header, and network diagnostics', async () => {
    const { result } = await start(); outgoing.emit('error', Object.assign(new Error(TOKEN), { code: 'HPE_HEADER_OVERFLOW' }));
    await sanitized(result, 'NETWORK_FAILED'); expect(requestMock).toHaveBeenCalledOnce();
  });

  it('ignores every provider metadata header, including nominally safe validators', async () => {
    const { result } = await start();
    send({ headers: {
      'content-type': 'application/json', etag: 'W/"private"', 'last-modified': 'Fri, 04 Sep 2026 12:00:00 GMT',
      'set-cookie': [TOKEN], 'x-request-id': TOKEN, authorization: TOKEN, 'retry-after': '1',
    } }); end(Buffer.from('{}'));
    await expect(result).resolves.toEqual({ bytes: Buffer.from('{}'), mediaType: 'application/json' });
    outgoing.emit('error', new Error(TOKEN)); response.emit('error', new Error(TOKEN));
  });

  it('returns a page with hasNextPage unchanged and never follows the cursor or a JSON URL', async () => {
    const { result } = await start(); send();
    const bytes = Buffer.from('{"data":[],"pagination":{"hasNextPage":true,"endCursor":"private-cursor"},"next":"http://127.0.0.1/private"}');
    end(bytes); await expect(result).resolves.toEqual({ bytes, mediaType: 'application/json' });
    await vi.advanceTimersByTimeAsync(60000); expect(requestMock).toHaveBeenCalledOnce();
    expect(lookupMock).toHaveBeenCalledOnce();
  });
});
