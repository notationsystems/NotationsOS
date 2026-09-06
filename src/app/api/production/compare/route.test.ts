import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionError } from '@/production/errors';
import { POST } from './route';

const runtime = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/production/worker', () => ({ runProductionWork: runtime.run }));

const local = 'http://127.0.0.1:3000/api/production/compare';
const maximumBytes = 64 * 1024;
const headers = {
  host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000',
  'content-type': 'application/json', 'sec-fetch-site': 'same-origin',
};
const comparison = {
  schema: 'payload.local-candidate-build-comparison-request.v1',
  before: { buildId: 'build-before', expectedDigest: `sha256:${'a'.repeat(64)}` },
  after: { buildId: 'build-after', expectedDigest: `sha256:${'b'.repeat(64)}` },
};
const result = {
  schema: 'payload.local-candidate-build-comparison.v1', mode: 'LOCAL_DEVELOPMENT',
  basis: 'REFERENCE_COMPARISON', temporalBasis: 'INPUT_BUILD_TIMES_ONLY', request: comparison,
  entries: [], summary: { added: 0, removed: 0, referenceChanged: 0, unchanged: 0 },
  nonclaims: { canonicalAdmission: false, canonicalStateMutated: false, comparisonPersisted: false },
  digest: `sha256:${'c'.repeat(64)}`,
};

function request(value: unknown = comparison, changes: Record<string, string> = {}, url = local) {
  return new Request(url, { method: 'POST', headers: { ...headers, ...changes }, body: JSON.stringify(value) });
}

function streamRequest(chunks: Uint8Array[], changes: Record<string, string> = {}) {
  let cancelled = false;
  let next = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(chunks[next++]);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', headers: { ...headers, ...changes }, body, duplex: 'half',
  };
  return { request: new Request(local, init), cancelled: () => cancelled };
}

function boundary(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-payload-production')).toBe('local-development-v1');
  expect(response.headers.get('content-type')).toContain('application/json');
}

function dispatched() {
  expect(runtime.run).toHaveBeenCalledTimes(1);
  expect(runtime.run).toHaveBeenCalledWith({ action: 'COMPARE_CANDIDATE_BUILDS', request: comparison });
}

async function refusal(input: Request, code: string, status = 400) {
  const response = await POST(input);
  expect(response.status).toBe(status);
  boundary(response);
  const body = await response.json();
  expect(body).toMatchObject({ schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT',
    canonicalAdmission: false, error: { code } });
  expect(JSON.stringify(body)).not.toMatch(/private-path|SECRET|secret\.json/);
  expect(runtime.run).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
  runtime.run.mockResolvedValue(result);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('local candidate-build comparison HTTP boundary', () => {
  it.each(['', 'true', '0'])('requires explicit local mode before reading the body (%j)', async (enabled) => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', enabled);
    const input = request();
    const body = vi.spyOn(input.body!, 'getReader');
    await refusal(input, 'LOCAL_MODE_DISABLED', 403);
    expect(body).not.toHaveBeenCalled();
  });

  it.each([
    [{ host: 'evil.example' }, local],
    [{ origin: 'https://evil.example' }, local],
    [{ 'sec-fetch-site': 'cross-site' }, local],
    [{ host: '127.0.0.1:9999' }, local],
    [{ origin: 'null' }, local],
    [{}, 'https://public.example/api/production/compare'],
  ] as const)('requires the same loopback origin before reading the body (%j)', async (changes, url) => {
    const input = request(comparison, changes, url);
    const body = vi.spyOn(input.body!, 'getReader');
    await refusal(input, 'LOCAL_ONLY', 403);
    expect(body).not.toHaveBeenCalled();
  });

  it.each(['?root=private-path', '?latest=true', '?at=2026-09-01T00:00:00Z', '?unused='])('rejects query parameters before reading the body (%s)', async (query) => {
    const input = request(comparison, {}, `${local}${query}`);
    const body = vi.spyOn(input.body!, 'getReader');
    await refusal(input, 'INVALID_REQUEST');
    expect(body).not.toHaveBeenCalled();
  });

  it('dispatches only the parsed reference contract and returns the worker result unchanged', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    boundary(response);
    expect(await response.json()).toEqual(result);
    dispatched();
  });

  it('accepts JSON media-type casing and parameters without changing the comparison', async () => {
    const response = await POST(request(comparison, { 'content-type': 'Application/JSON; charset=utf-8' }));
    expect(response.status).toBe(200);
    dispatched();
  });

  it.each(['text/plain', 'application/octet-stream', ''])('rejects unsupported media type %j', async (contentType) => {
    await refusal(request(comparison, { 'content-type': contentType }), 'INVALID_CONTENT_TYPE', 415);
  });

  it.each(['', '{', '{"schema":}', 'null trailing'])('rejects malformed JSON %j', async (body) => {
    await refusal(new Request(local, { method: 'POST', headers, body }), 'INVALID_REQUEST');
  });

  it('rejects a missing body', async () => {
    await refusal(new Request(local, { method: 'POST', headers }), 'INVALID_REQUEST');
  });

  it('rejects invalid UTF-8 instead of replacing input bytes', async () => {
    const input = streamRequest([new TextEncoder().encode('{"schema":"'), new Uint8Array([0xc3, 0x28]), new TextEncoder().encode('"}')]);
    await refusal(input.request, 'INVALID_REQUEST');
  });

  it('accepts exactly 64 KiB of streamed JSON independent of a false content length', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(comparison).padEnd(maximumBytes, ' '));
    const input = streamRequest([bytes.slice(0, 100), bytes.slice(100, 32000), bytes.slice(32000)], { 'content-length': '1' });
    const response = await POST(input.request);
    expect(response.status).toBe(200);
    boundary(response);
    expect(await response.json()).toEqual(result);
    dispatched();
  });

  it('cancels a body over 64 KiB despite a false content length', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(comparison).padEnd(maximumBytes + 1, ' '));
    const input = streamRequest([bytes.slice(0, 32000), bytes.slice(32000), new Uint8Array(1)], { 'content-length': '1' });
    await refusal(input.request, 'BODY_TOO_LARGE', 413);
    expect(input.cancelled()).toBe(true);
  });

  it('bounds UTF-8 bytes rather than JavaScript character count', async () => {
    const body = JSON.stringify({ ...comparison, extra: 'é'.repeat(33000) });
    expect(body.length).toBeLessThan(maximumBytes);
    const bytes = new TextEncoder().encode(body);
    expect(bytes.length).toBeGreaterThan(maximumBytes);
    await refusal(streamRequest([bytes], { 'content-length': String(body.length) }).request, 'BODY_TOO_LARGE', 413);
  });

  it('redacts broken stream diagnostics', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error('private-path/secret.json contains SECRET')); },
    });
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', headers, body, duplex: 'half' };
    await refusal(new Request(local, init), 'INVALID_REQUEST');
  });

  it.each([
    ['null', null], ['array', [comparison]], ['string', 'private-path'], ['number', 7],
    ['empty', {}], ['unsupported schema', { ...comparison, schema: 'payload.local-candidate-build-comparison-request.v2' }],
    ['missing before', { schema: comparison.schema, after: comparison.after }],
    ['missing after', { schema: comparison.schema, before: comparison.before }],
    ['null reference', { ...comparison, before: null }],
    ['array reference', { ...comparison, after: [comparison.after] }],
    ['missing digest', { ...comparison, before: { buildId: 'build-before' } }],
    ['short digest', { ...comparison, after: { ...comparison.after, expectedDigest: 'sha256:short' } }],
    ['uppercase digest', { ...comparison, before: { ...comparison.before, expectedDigest: `sha256:${'A'.repeat(64)}` } }],
    ['numeric digest', { ...comparison, after: { ...comparison.after, expectedDigest: 7 } }],
    ['empty build id', { ...comparison, before: { ...comparison.before, buildId: '' } }],
    ['whitespace build id', { ...comparison, after: { ...comparison.after, buildId: 'build after' } }],
    ['oversized build id', { ...comparison, before: { ...comparison.before, buildId: 'x'.repeat(181) } }],
  ])('requires the closed versioned reference shape: %s', async (_label, value) => {
    await refusal(request(value), 'INVALID_COMPARISON_REQUEST');
  });

  it.each([
    ['storageRoot', 'private-path'], ['root', 'private-path'], ['path', 'private-path'],
    ['now', '2026-09-01T00:00:00Z'], ['knownAt', '2026-09-01T00:00:00Z'],
    ['canonicalAdmission', true], ['allowPartial', true], ['persist', true], ['activateRelease', true],
    ['purpose', 'CUSTOMER_DELIVERY'], ['sourcePolicy', {}], ['builds', []],
  ])('refuses caller-supplied %s rather than forwarding it to the worker', async (field, value) => {
    await refusal(request({ ...comparison, [field as string]: value }), 'INVALID_COMPARISON_REQUEST');
  });

  it.each(['before', 'after'] as const)('rejects bodies, paths and unrecognized reference fields in %s', async (side) => {
    for (const extra of [{ path: 'private-path' }, { root: 'private-path' }, { body: {} }, { canonicalAdmission: true }]) {
      await refusal(request({ ...comparison, [side]: { ...comparison[side], ...extra } }), 'INVALID_COMPARISON_REQUEST');
    }
  });

  it('preserves backend-authored error codes and messages', async () => {
    runtime.run.mockRejectedValueOnce(new ProductionError('BUILD_DIGEST_MISMATCH', 'The selected build digest does not match.', 409));
    const response = await POST(request());
    expect(response.status).toBe(409);
    boundary(response);
    expect(await response.json()).toEqual({ schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT',
      canonicalAdmission: false, error: { code: 'BUILD_DIGEST_MISMATCH', message: 'The selected build digest does not match.' } });
    dispatched();
  });

  it('redacts unexpected worker exceptions without claiming a comparison result', async () => {
    runtime.run.mockRejectedValueOnce(new Error('C:\\private-path\\secret.json contains SECRET'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    boundary(response);
    const body = await response.json();
    expect(body).toMatchObject({ schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT',
      canonicalAdmission: false, error: { code: 'LOCAL_PRODUCTION_UNAVAILABLE' } });
    expect(JSON.stringify(body)).not.toMatch(/private-path|SECRET|secret\.json/);
    expect(body).not.toHaveProperty('entries');
    expect(body).not.toHaveProperty('digest');
    dispatched();
  });
});
