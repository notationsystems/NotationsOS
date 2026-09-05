import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSourceBytes, SOURCE_HTTP_MAX_BYTES, SOURCE_HTTP_TIMEOUT_MS } from './http';

const { lookupMock, requestMock } = vi.hoisted(() => ({ lookupMock: vi.fn(), requestMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));
vi.mock('node:https', () => ({ request: requestMock }));

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

function sourceUrl(): URL {
  const url = new URL('https://data.transportation.gov/resource/az4n-8mr2.json');
  url.searchParams.set('$select', 'dot_number,legal_name');
  url.searchParams.set('$where', "dot_number in(80806) AND business_org_desc='CORPORATION' AND phy_country='US'");
  url.searchParams.set('$order', 'dot_number');
  url.searchParams.set('$limit', '25');
  return url;
}
async function start(url = sourceUrl()) {
  const result = fetchSourceBytes(url);
  await Promise.resolve();
  expect(requestMock).toHaveBeenCalledOnce();
  return { result };
}
function send(overrides: Partial<FakeResponse> = {}) {
  Object.assign(response, overrides);
  onResponse(response as unknown as IncomingMessage);
}
function end(bytes = Buffer.from('[]')) {
  response.emit('data', bytes);
  response.emit('end');
  response.emit('close');
}

beforeEach(() => {
  vi.useFakeTimers();
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
  vi.useRealTimers();
});

describe('fixed source transport request boundary', () => {
  it('pins a checked public IPv4 address while retaining authenticated TLS and code-owned headers', async () => {
    const { result } = await start();
    expect(lookupMock).toHaveBeenCalledWith('data.transportation.gov', { all: true, family: 4, verbatim: true });
    expect(options).toMatchObject({
      protocol: 'https:', hostname: 'data.transportation.gov', servername: 'data.transportation.gov',
      port: 443, agent: false, method: 'GET', family: 4, autoSelectFamily: false,
      rejectUnauthorized: true, maxHeaderSize: 8192,
    });
    expect(options.headers).toEqual({
      Accept: 'application/json', 'Accept-Encoding': 'identity',
      'User-Agent': 'PayloadOS/0.1 local-source-qualification',
    });
    const callback = vi.fn();
    options.lookup!('data.transportation.gov', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '18.164.111.7', 4);
    expect(outgoing.end).toHaveBeenCalledOnce();
    send(); end();
    await expect(result).resolves.toEqual({ bytes: Buffer.from('[]'), mediaType: 'application/json', lastModified: null, etag: null });
    expect(lookupMock).toHaveBeenCalledOnce();
  });

  it('snapshots the target before caller URL mutation', async () => {
    const url = sourceUrl();
    const initialPath = `${url.pathname}${url.search}`;
    const result = fetchSourceBytes(url);
    url.hostname = 'attacker.invalid'; url.search = '?token=private';
    await Promise.resolve();
    expect(options.hostname).toBe('data.transportation.gov');
    expect(options.path).toBe(initialPath);
    send(); end(); await result;
  });

  it.each([
    ['scheme', (url: URL) => { url.protocol = 'http:'; }],
    ['host', (url: URL) => { url.hostname = 'data.transportation.gov.attacker.invalid'; }],
    ['IP literal', (url: URL) => { url.hostname = '127.0.0.1'; }],
    ['path', (url: URL) => { url.pathname = '/resource/other.json'; }],
    ['encoded path', (url: URL) => { url.pathname = '/resource/%61z4n-8mr2.json'; }],
    ['username', (url: URL) => { url.username = 'private'; }],
    ['password', (url: URL) => { url.password = 'private'; }],
    ['port', (url: URL) => { url.port = '8443'; }],
    ['fragment', (url: URL) => { url.hash = 'private'; }],
    ['unknown field', (url: URL) => { url.searchParams.set('$$app_token', 'private'); }],
    ['duplicate field', (url: URL) => { url.searchParams.append('$where', 'private'); }],
    ['missing field', (url: URL) => { url.searchParams.delete('$select'); }],
    ['empty field', (url: URL) => { url.searchParams.set('$order', ' '); }],
    ['control character', (url: URL) => { url.searchParams.set('$where', 'x\r\nCookie: private'); }],
    ['unicode', (url: URL) => { url.searchParams.set('$where', 'x=\u0085'); }],
    ['oversized select', (url: URL) => { url.searchParams.set('$select', 'a'.repeat(1025)); }],
    ['oversized where', (url: URL) => { url.searchParams.set('$where', 'a'.repeat(1025)); }],
    ['oversized order', (url: URL) => { url.searchParams.set('$order', 'a'.repeat(257)); }],
    ['oversized encoded URL', (url: URL) => { url.searchParams.set('$select', '*'.repeat(1024)); url.searchParams.set('$where', '/'.repeat(1024)); }],
  ])('rejects %s before DNS or HTTP', async (_label, mutate) => {
    const url = sourceUrl(); mutate(url);
    await expect(fetchSourceBytes(url)).rejects.toMatchObject({ code: 'SOURCE_URL_DISALLOWED', status: 400 });
    expect(lookupMock).not.toHaveBeenCalled(); expect(requestMock).not.toHaveBeenCalled();
  });

  it.each(['0', '26', '100', '01', '-1', '1e1', '1.0', '+1', ' 1'])('rejects non-bounded canonical limit %s', async (limit) => {
    const url = sourceUrl(); url.searchParams.set('$limit', limit);
    await expect(fetchSourceBytes(url)).rejects.toMatchObject({ code: 'SOURCE_URL_DISALLOWED' });
    expect(lookupMock).not.toHaveBeenCalled();
  });
  it('rejects runtime non-URL input without echoing it', async () => {
    await expect(fetchSourceBytes('private' as unknown as URL)).rejects.toMatchObject({ code: 'SOURCE_URL_DISALLOWED', message: 'The source URL is not permitted.' });
  });
});

describe('DNS and total deadline', () => {
  it.each([
    '0.1.2.3', '10.1.2.3', '100.64.0.1', '100.127.255.254', '127.0.0.1',
    '169.254.169.254', '172.16.0.1', '172.31.255.254', '192.0.0.9', '192.0.2.1',
    '192.168.1.1', '192.88.99.1', '192.31.196.1', '192.52.193.1', '192.175.48.1',
    '198.18.0.1', '198.19.255.254', '198.51.100.1', '203.0.113.1', '224.0.0.1',
    '239.255.255.255', '240.0.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1',
    '1.2.3.999', '0177.0.0.1',
  ])('refuses non-public or unsupported address %s even alongside a public answer', async (address) => {
    lookupMock.mockResolvedValue([{ address: '18.164.111.7', family: 4 }, { address, family: 4 }]);
    await expect(fetchSourceBytes(sourceUrl())).rejects.toMatchObject({ code: 'SOURCE_DESTINATION_DISALLOWED' });
    expect(requestMock).not.toHaveBeenCalled();
  });
  it.each([
    [], [{ address: '2600:9000:2000::1', family: 6 }],
    Array.from({ length: 33 }, () => ({ address: '18.164.111.7', family: 4 })),
  ])('refuses empty, IPv6-only, or excessively large answers', async (...answers) => {
    lookupMock.mockResolvedValue(answers);
    await expect(fetchSourceBytes(sourceUrl())).rejects.toMatchObject({ code: 'SOURCE_DESTINATION_DISALLOWED' });
    expect(requestMock).not.toHaveBeenCalled();
  });
  it('redacts DNS failures without retrying', async () => {
    lookupMock.mockRejectedValue(new Error('private DNS diagnostic'));
    await expect(fetchSourceBytes(sourceUrl())).rejects.toMatchObject({ code: 'SOURCE_DNS_FAILED', message: 'The source hostname could not be resolved.' });
    expect(lookupMock).toHaveBeenCalledOnce(); expect(requestMock).not.toHaveBeenCalled();
  });
  it('includes DNS in the deadline and never connects after late resolution', async () => {
    let resolveLookup!: (value: { address: string; family: number }[]) => void;
    lookupMock.mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const result = expect(fetchSourceBytes(sourceUrl())).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT', status: 504 });
    await vi.advanceTimersByTimeAsync(SOURCE_HTTP_TIMEOUT_MS);
    await result;
    resolveLookup([{ address: '18.164.111.7', family: 4 }]); await Promise.resolve();
    expect(requestMock).not.toHaveBeenCalled();
  });
  it('uses the same deadline across slow DNS, connection, and an active body', async () => {
    lookupMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([{ address: '18.164.111.7', family: 4 }]), 9000)));
    const result = expect(fetchSourceBytes(sourceUrl())).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(9000);
    send(); response.emit('data', Buffer.from('['));
    await vi.advanceTimersByTimeAsync(999);
    expect(outgoing.destroy).not.toHaveBeenCalled();
    response.emit('data', Buffer.from(' '));
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(outgoing.destroy).toHaveBeenCalledOnce(); expect(response.destroy).toHaveBeenCalledOnce();
    end(); expect(requestMock).toHaveBeenCalledOnce();
  });
  it('times out a connection that never produces response headers', async () => {
    const { result } = await start();
    const rejected = expect(result).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(SOURCE_HTTP_TIMEOUT_MS); await rejected;
    expect(outgoing.destroy).toHaveBeenCalledOnce();
    send(); expect(response.destroy).toHaveBeenCalledOnce();
  });
});

describe('bounded source response', () => {
  it.each([300, 301, 302, 303, 307, 308, 399])('rejects %s redirects without following any Location', async (statusCode) => {
    const { result } = await start();
    send({ statusCode, headers: { location: 'http://169.254.169.254/private' } });
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_REDIRECT_DISALLOWED' });
    expect(requestMock).toHaveBeenCalledOnce(); expect(response.destroy).toHaveBeenCalledOnce();
  });
  it.each([0, 201, 204, 400, 401, 403, 404, 500, 503])('rejects non-200 status %s with no provider diagnostic', async (statusCode) => {
    const { result } = await start(); send({ statusCode });
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_HTTP_ERROR', message: 'The source did not return an accepted HTTP status.' });
  });
  it('surfaces 429 without acting on Retry-After, cookies, or an error body', async () => {
    const { result } = await start();
    send({ statusCode: 429, headers: { 'retry-after': '1', 'set-cookie': ['private'], authorization: 'private' } });
    await expect(result).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requestMock).toHaveBeenCalledOnce(); expect(lookupMock).toHaveBeenCalledOnce();
  });
  it.each([undefined, 'text/html', 'application/problem+json', 'application/json; charset=latin1', ['application/json'], 'application/json, text/html'])('refuses unsupported media type %s', async (contentType) => {
    const { result } = await start(); send({ headers: { 'content-type': contentType as string } });
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_MEDIA_TYPE_UNSUPPORTED' });
  });
  it.each(['gzip', 'br', 'deflate', 'identity, gzip', ['identity']])('never decompresses content encoding %s', async (encoding) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-encoding': encoding as string } });
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_ENCODING_UNSUPPORTED' });
  });
  it.each(['-1', '1.1', '+2', '2 private', '9007199254740992', '', ['2']])('refuses invalid Content-Length %s', async (length) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-length': length as string } });
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_INVALID_RESPONSE' });
  });
  it.each(['Content-Type', 'Content-Length', 'Content-Encoding'])('refuses duplicate structural header %s', async (name) => {
    const { result } = await start(); send({ rawHeaders: [name, 'a', name.toLowerCase(), 'b'] });
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_INVALID_RESPONSE' });
  });
  it('refuses oversized declared length before accepting any bytes', async () => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-length': String(SOURCE_HTTP_MAX_BYTES + 1) } });
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_BODY_TOO_LARGE' });
    expect(response.listenerCount('data')).toBe(0); expect(response.destroy).toHaveBeenCalledOnce();
  });
  it('enforces the byte cap for a chunked stream without trusting Content-Length', async () => {
    const { result } = await start(); send();
    response.emit('data', Buffer.alloc(SOURCE_HTTP_MAX_BYTES)); response.emit('data', Buffer.from('x'));
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_BODY_TOO_LARGE' });
    expect(response.destroy).toHaveBeenCalledOnce(); expect(outgoing.destroy).toHaveBeenCalledOnce();
  });
  it('preserves original bytes including invalid UTF-8 and permits exactly the byte cap', async () => {
    const { result } = await start();
    send({ headers: { 'content-type': 'Application/JSON; charset=UTF-8', 'content-encoding': 'identity', 'content-length': String(SOURCE_HTTP_MAX_BYTES) } });
    const bytes = Buffer.alloc(SOURCE_HTTP_MAX_BYTES, 0xff); end(bytes);
    await expect(result).resolves.toMatchObject({ bytes, mediaType: 'application/json' });
  });
  it.each(['1', '3'])('refuses declared length %s differing from the actual bytes', async (length) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'content-length': length } }); end();
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_INVALID_RESPONSE' });
  });
  it('rejects incomplete framing even if end fires', async () => {
    const { result } = await start(); send({ complete: false }); end();
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_INVALID_RESPONSE' });
  });
  it.each(['aborted', 'error', 'close'])('redacts premature body %s and releases the connection', async (event) => {
    const { result } = await start(); send(); response.emit(event, new Error('private diagnostic'));
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_NETWORK_FAILED' });
    expect(response.destroy).toHaveBeenCalledOnce(); expect(outgoing.destroy).toHaveBeenCalledOnce();
  });
  it('redacts synchronous request errors', async () => {
    requestMock.mockImplementation(() => { throw new Error('private diagnostic'); });
    await expect(fetchSourceBytes(sourceUrl())).rejects.toMatchObject({ code: 'SOURCE_NETWORK_FAILED', message: 'The source connection failed.' });
  });
  it('redacts TLS and network errors without retrying', async () => {
    const { result } = await start(); outgoing.emit('error', new Error('private certificate diagnostic'));
    await expect(result).rejects.toMatchObject({ code: 'SOURCE_NETWORK_FAILED', message: 'The source connection failed.' });
    expect(requestMock).toHaveBeenCalledOnce();
  });
  it('retains only bounded, safe cache validators', async () => {
    const { result } = await start();
    send({ headers: {
      'content-type': 'application/json', etag: 'W/"version-1"',
      'last-modified': 'Fri, 04 Sep 2026 12:34:56 GMT',
      'set-cookie': ['private'], 'x-request-id': 'private', authorization: 'private',
    } }); end();
    await expect(result).resolves.toEqual({ bytes: Buffer.from('[]'), mediaType: 'application/json', etag: 'W/"version-1"', lastModified: 'Fri, 04 Sep 2026 12:34:56 GMT' });
  });
  it.each(['x'.repeat(257), 'private\r\nInjected: header', 'private\u007f', 'private\u0080', '', ['private']])('omits unsafe ETag %s', async (etag) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', etag: etag as string } }); end();
    await expect(result).resolves.toMatchObject({ etag: null });
  });
  it.each(['private', '2026-09-04', 'Fri, 32 Sep 2026 12:34:56 GMT', 'Sat, 04 Sep 2026 12:34:56 GMT', 'Fri, 04 Sep 2026 12:34:56 GMT\r\nprivate', ['private']])('omits unsafe or noncanonical Last-Modified %s', async (lastModified) => {
    const { result } = await start(); send({ headers: { 'content-type': 'application/json', 'last-modified': lastModified as string } }); end();
    await expect(result).resolves.toMatchObject({ lastModified: null });
  });
});
