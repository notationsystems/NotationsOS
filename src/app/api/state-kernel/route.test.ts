import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateKernelError } from '@/state-kernel/errors';
import { MAX_KERNEL_INPUT_BYTES } from '@/state-kernel/runtime';
import { parseStateKernelRequest } from '@/state-kernel/store';
import { emptyNotationState, notationCapacity, type StateKernelSnapshot } from '@/state-kernel/types';
import { GET } from './route';
import { POST as PREVIEW } from './preview/route';
import { POST as SAVE } from './save/route';

const repository = vi.hoisted(() => ({ read: vi.fn(), preview: vi.fn(), save: vi.fn(), factory: vi.fn() }));
vi.mock('@/state-kernel/store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/state-kernel/store')>(),
  notationRepository: repository.factory,
}));

const batch = () => ({ schema: 'payload.notation-command-batch.v1', baseVersion: 0,
  commands: [{ commandId: 'create-a', kind: 'CREATE_NOTATION', notation: { id: 'a', title: 'Title', body: 'Body' } }] });
const snapshot = (): StateKernelSnapshot => ({ schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT',
  enabled: true, savedVersion: 0, savedDigest: null, state: emptyNotationState(), capacity: notationCapacity(0, 0), persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false });
const baseHeaders = { 'content-type': 'application/json', host: '127.0.0.1:3000',
  origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' };
const writes = [{ name: 'preview', handler: PREVIEW, method: 'preview' }, { name: 'save', handler: SAVE, method: 'save' }] as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PAYLOAD_STATE_KERNEL_LOCAL', '1');
  repository.factory.mockReturnValue(repository);
  repository.read.mockResolvedValue(snapshot());
  repository.preview.mockImplementation(async (input) => { parseStateKernelRequest(input); return snapshot(); });
  repository.save.mockImplementation(async (input) => { parseStateKernelRequest(input); return snapshot(); });
});
afterEach(() => { vi.unstubAllEnvs(); });

function input(body: BodyInit | null = JSON.stringify(batch()), headers: Record<string, string> = {}, url = 'http://localhost:3000/api/state-kernel/save') {
  return new Request(url, { method: 'POST', headers: { ...baseHeaders, ...headers }, body });
}
function streamInput(chunks: Uint8Array[], cancelError = false) {
  let index = 0;
  const cancel = vi.fn(() => { if (cancelError) throw new Error('private cancellation path'); });
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    }, cancel,
  });
  const init: RequestInit & { duplex: 'half' } = { method: 'POST', headers: { ...baseHeaders, 'content-length': '1' }, body, duplex: 'half' };
  return { request: new Request('http://localhost:3000/api/state-kernel/save', init), cancel };
}
function boundary(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-notation-state')).toBe('local-development-v1');
  expect(response.headers.get('content-type')).toContain('application/json');
}
function untouched() {
  expect(repository.read).not.toHaveBeenCalled();
  expect(repository.preview).not.toHaveBeenCalled();
  expect(repository.save).not.toHaveBeenCalled();
}
async function refused(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  boundary(response);
  const body = await response.json();
  expect(body).toEqual({ error: { code, message: expect.any(String) } });
  expect(JSON.stringify(body)).not.toMatch(/private|C:\\|\.payload|Original body/);
}

describe('local notation workspace HTTP routes', () => {
  it('returns an explicit disabled empty snapshot without constructing storage or inspecting origin', async () => {
    vi.stubEnv('PAYLOAD_STATE_KERNEL_LOCAL', '');
    const response = await GET(new Request('https://remote.example/api/state-kernel', { headers: { origin: 'https://another.example' } }));
    expect(response.status).toBe(200);
    boundary(response);
    expect(await response.json()).toEqual({ ...snapshot(), enabled: false, persistence: 'DISABLED' });
    expect(repository.factory).not.toHaveBeenCalled();
    untouched();
  });

  it.each(['127.0.0.1:3000', 'localhost:3000', '[::1]:3000'])('reads enabled saved state from same-origin loopback %s', async (host) => {
    const saved = { ...snapshot(), savedVersion: 1, savedDigest: `sha256:${'a'.repeat(64)}` };
    repository.read.mockResolvedValue(saved);
    const response = await GET(new Request('http://localhost:3000/api/state-kernel', { headers: { host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin' } }));
    expect(response.status).toBe(200);
    boundary(response);
    expect(await response.json()).toEqual(saved);
    expect(repository.read).toHaveBeenCalledOnce();
    expect(repository.read).toHaveBeenCalledWith();
    expect(repository.preview).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    ['remote request URL', 'http://example.test:3000/api/state-kernel', baseHeaders],
    ['remote client host', 'http://localhost:3000/api/state-kernel', { ...baseHeaders, host: 'example.test:3000' }],
    ['foreign origin', 'http://localhost:3000/api/state-kernel', { ...baseHeaders, origin: 'https://example.test' }],
    ['wrong client port', 'http://localhost:3000/api/state-kernel', { ...baseHeaders, host: '127.0.0.1:3001' }],
    ['cross-site fetch', 'http://localhost:3000/api/state-kernel', { ...baseHeaders, 'sec-fetch-site': 'cross-site' }],
    ['same-site fetch', 'http://localhost:3000/api/state-kernel', { ...baseHeaders, 'sec-fetch-site': 'same-site' }],
    ['host credentials', 'http://localhost:3000/api/state-kernel', { ...baseHeaders, host: 'user@127.0.0.1:3000' }],
  ] as const)('refuses %s for reads and both writes before storage', async (_label, url, headers) => {
    await refused(await GET(new Request(url, { headers })), 403, 'LOCAL_ONLY');
    for (const { handler } of writes) await refused(await handler(input(JSON.stringify(batch()), headers, url)), 403, 'LOCAL_ONLY');
    expect(repository.factory).not.toHaveBeenCalled();
    untouched();
  });

  it('redacts unexpected read failures and preserves typed corrupted-history failures', async () => {
    repository.read.mockRejectedValueOnce(new Error('C:\\private\\.payload\\history.json'));
    await refused(await GET(new Request('http://localhost:3000/api/state-kernel')), 503, 'LOCAL_STATE_UNAVAILABLE');
    repository.read.mockRejectedValueOnce(new StateKernelError('INVALID_SAVED_STATE', 'The saved history did not validate. Files were preserved.', 503));
    await refused(await GET(new Request('http://localhost:3000/api/state-kernel')), 503, 'INVALID_SAVED_STATE');
    expect(repository.save).not.toHaveBeenCalled();
  });

  describe.each(writes)('$name', ({ handler, method }) => {
    it('checks the explicit local-enable flag before body reading or storage', async () => {
      vi.stubEnv('PAYLOAD_STATE_KERNEL_LOCAL', 'true');
      const malformed = input('{private malformed body', { 'content-type': 'text/plain' }, 'https://remote.example/api/state-kernel/save');
      await refused(await handler(malformed), 403, 'READ_ONLY');
      expect(malformed.bodyUsed).toBe(false);
      expect(repository.factory).not.toHaveBeenCalled();
      untouched();
    });

    it('passes the exact command batch only to the requested operation and returns local non-authoritative state', async () => {
      const response = await handler(input(JSON.stringify(batch()), { 'content-type': 'Application/JSON; charset=utf-8' }));
      expect(response.status).toBe(200);
      boundary(response);
      expect(await response.json()).toEqual(snapshot());
      expect(repository[method]).toHaveBeenCalledOnce();
      expect(repository[method]).toHaveBeenCalledWith(batch());
      expect(repository[method === 'save' ? 'preview' : 'save']).not.toHaveBeenCalled();
      expect(repository.read).not.toHaveBeenCalled();
    });

    it.each([
      ['wrong content type', '{}', { 'content-type': 'text/plain' }, 415, 'INVALID_CONTENT_TYPE'],
      ['missing body', null, {}, 400, 'INVALID_REQUEST'],
      ['empty body', '', {}, 400, 'INVALID_REQUEST'],
      ['malformed JSON', '{"private-payload":', {}, 400, 'INVALID_REQUEST'],
      ['invalid UTF-8', new Uint8Array([0xc3, 0x28]), {}, 400, 'INVALID_REQUEST'],
    ] as const)('refuses %s before invoking repository operations', async (_label, body, headers, status, code) => {
      await refused(await handler(input(body, headers)), status, code);
      expect(repository.factory).not.toHaveBeenCalled();
      untouched();
    });

    it.each([
      { ...batch(), root: 'C:\\private\\other-workspace' },
      { ...batch(), state: emptyNotationState() },
      { ...batch(), canonicalAdmission: true },
      { ...batch(), baseVersion: 0.5 },
    ])('does not accept replacement state, path selection, or invalid batch authority', async (value) => {
      await refused(await handler(input(JSON.stringify(value))), 400, 'INVALID_REQUEST');
    });

    it('enforces the streamed byte count rather than a falsified content-length', async () => {
      const stream = streamInput([new Uint8Array(MAX_KERNEL_INPUT_BYTES), new Uint8Array(1), new Uint8Array(16)]);
      await refused(await handler(stream.request), 413, 'BODY_TOO_LARGE');
      expect(stream.cancel).toHaveBeenCalledOnce();
      expect(repository.factory).not.toHaveBeenCalled();
      untouched();
    });

    it('still classifies an oversized request as 413 when stream cancellation fails', async () => {
      const stream = streamInput([new Uint8Array(MAX_KERNEL_INPUT_BYTES + 1), new Uint8Array(1)], true);
      await refused(await handler(stream.request), 413, 'BODY_TOO_LARGE');
      expect(stream.cancel).toHaveBeenCalledOnce();
      expect(repository.factory).not.toHaveBeenCalled();
      untouched();
    });

    it('accepts a valid UTF-8 JSON stream at exactly 2 MiB', async () => {
      const content = new TextEncoder().encode(JSON.stringify(batch()));
      const padding = new Uint8Array(MAX_KERNEL_INPUT_BYTES - content.byteLength).fill(32);
      const stream = streamInput([content, padding]);
      const response = await handler(stream.request);
      expect(response.status).toBe(200);
      expect(repository[method]).toHaveBeenCalledOnce();
      expect(repository[method]).toHaveBeenCalledWith(batch());
      expect(stream.cancel).not.toHaveBeenCalled();
    });

    it.each([
      ['VERSION_CONFLICT', 409], ['CAPACITY', 409], ['INVALID_COMMAND', 400],
      ['STATE_BUSY', 503], ['KERNEL_UNAVAILABLE', 503], ['SAVE_UNCONFIRMED', 503],
    ] as const)('preserves the %s failure status without reporting a successful save', async (code, status) => {
      repository[method].mockRejectedValueOnce(new StateKernelError(code, 'Keep the draft and retry deliberately.', status));
      await refused(await handler(input()), status, code);
    });

    it('redacts unexpected storage errors without inventing a saved snapshot', async () => {
      repository[method].mockRejectedValueOnce(new Error('C:\\private\\.payload\\history.json'));
      await refused(await handler(input()), 503, 'LOCAL_STATE_UNAVAILABLE');
    });
  });
});
