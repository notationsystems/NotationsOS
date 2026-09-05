import { describe, expect, it, vi } from 'vitest';
import { CoordinationClient, CoordinationClientError } from '../../clients/javascript/coordination.mjs';

const okay = () => new Response(JSON.stringify({ fixture_only: true, messages: [] }), { status: 200 });
const failure = (status: number, error = 'API_FAILURE') => new Response(JSON.stringify({ error, detail: 'Example API detail.' }), { status });

describe('JavaScript coordination client', () => {
  it('retries network errors with the identical serialized command and request id', async () => {
    const message = { requestId: 'client-retry-1', body: 'original', context: { releaseId: 'release-1' } };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        message.body = 'changed by caller';
        message.context.releaseId = 'changed';
        throw new TypeError('network unavailable');
      })
      .mockResolvedValueOnce(okay());
    const sleep = vi.fn(async () => {});
    await new CoordinationClient(undefined, { fetchImpl, sleep }).post(message);
    const bodies = fetchImpl.mock.calls.map(([, init]) => init?.body);
    expect(bodies).toEqual([bodies[0], bodies[0]]);
    expect(JSON.parse(String(bodies[0]))).toEqual({ operation: 'post', message: { requestId: 'client-retry-1', body: 'original', context: { releaseId: 'release-1' } } });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it.each([408, 429, 502, 503, 504])('retries HTTP %s responses', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(failure(status)).mockResolvedValueOnce(okay());
    const client = new CoordinationClient(undefined, { fetchImpl, sleep: async () => {} });
    expect(await client.snapshot()).toMatchObject({ fixture_only: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 404, 409, 500])('does not retry HTTP %s and exposes API details', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(failure(status, 'IDEMPOTENCY_CONFLICT'));
    const client = new CoordinationClient(undefined, { fetchImpl, sleep: async () => {} });
    await expect(client.snapshot()).rejects.toMatchObject({ status, code: 'IDEMPOTENCY_CONFLICT', detail: 'Example API detail.' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a transient HTTP response even when its body is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html>Unavailable</html>', { status: 503 })).mockResolvedValueOnce(okay());
    await new CoordinationClient(undefined, { fetchImpl, sleep: async () => {} }).snapshot();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not let an API error code turn a semantic failure into a transport retry', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(failure(409, 'NETWORK_ERROR'));
    await expect(new CoordinationClient(undefined, { fetchImpl }).snapshot()).rejects.toMatchObject({ status: 409 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caps transport retries and uses exponential backoff', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('disconnected'));
    const sleep = vi.fn(async () => {});
    await expect(new CoordinationClient(undefined, { fetchImpl, sleep }).snapshot()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it('times out and aborts a pending request', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
      const client = new CoordinationClient(undefined, { fetchImpl, timeoutMs: 10, attempts: 1 });
      const result = expect(client.snapshot()).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(10);
      await result;
      expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it.each(['broken-json', '[]', 'null', '"text"', '1', '{"value":NaN}'])('rejects malformed or nonobject response %s', async (body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(new CoordinationClient(undefined, { fetchImpl }).snapshot()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('encodes inbox participants and filters as distinct query values', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okay());
    const client = new CoordinationClient('http://127.0.0.1:3000', { fetchImpl });
    await client.inbox('agent:one/part?x&after=999', { afterSequence: 7, limit: 12, includeAcknowledged: true, includeBroadcasts: true, kind: 'REQUEST' });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/coordination/inbox');
    expect(Object.fromEntries(url.searchParams)).toEqual({ participant: 'agent:one/part?x&after=999', after: '7', limit: '12', acknowledged: 'true', broadcasts: 'true', kind: 'REQUEST' });
  });

  it('provides conservative inbox defaults', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okay());
    await new CoordinationClient(undefined, { fetchImpl }).inbox('worker');
    expect(Object.fromEntries(new URL(String(fetchImpl.mock.calls[0][0])).searchParams)).toEqual({ participant: 'worker', after: '0', limit: '50', acknowledged: 'false', broadcasts: 'false' });
  });

  it('omits a null kind so the inbox returns all message kinds', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okay());
    await new CoordinationClient(undefined, { fetchImpl }).inbox('worker', { kind: null });
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.has('kind')).toBe(false);
  });

  it('sends exact registration and acknowledgement command envelopes', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => okay());
    const client = new CoordinationClient(undefined, { fetchImpl });
    const participant = { id: 'worker', scope: 'local' };
    await client.register(participant);
    await client.acknowledge('MSG-00001', 'worker');
    expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { operation: 'register', participant }, { operation: 'acknowledge', messageId: 'MSG-00001', participantId: 'worker' },
    ]);
  });

  it.each([undefined, '', ' ', 23])('requires a supplied nonempty request id: %s', (requestId) => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(() => new CoordinationClient(undefined, { fetchImpl }).post({ requestId })).toThrow(CoordinationClientError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 11, Infinity, NaN])('rejects invalid attempts: %s', (attempts) => {
    expect(() => new CoordinationClient(undefined, { attempts })).toThrow(TypeError);
  });
  it.each([0, -1, Infinity, NaN, 2147483648])('rejects invalid timeouts: %s', (timeoutMs) => {
    expect(() => new CoordinationClient(undefined, { timeoutMs })).toThrow(TypeError);
  });
});
