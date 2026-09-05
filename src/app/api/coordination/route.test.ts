import { vi } from 'vitest';
import { GET, POST } from './route';
import { executeCoordinationCommand, getCoordinationSnapshot, localCoordinationEnabled } from '@/coordination/store';

vi.mock('@/coordination/store', () => ({ executeCoordinationCommand: vi.fn(), getCoordinationSnapshot: vi.fn(), localCoordinationEnabled: vi.fn() }));
const local = vi.mocked(localCoordinationEnabled);
const execute = vi.mocked(executeCoordinationCommand);
function request(body: string, headers: Record<string, string> = {}, url = 'http://127.0.0.1:3000/api/coordination') { return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }); }
beforeEach(() => {
  vi.resetAllMocks(); local.mockReturnValue(true);
  execute.mockResolvedValue({ fixture_only: true } as Awaited<ReturnType<typeof executeCoordinationCommand>>);
});

describe('coordination HTTP boundary', () => {
  it('defaults to read-only and rejects posting before touching the store', async () => {
    local.mockReturnValue(false);
    expect((await POST(request('{}'))).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects non-loopback and cross-origin requests', async () => {
    for (const r of [request('{}', {}, 'https://example.com/api/coordination'), request('{}', { origin: 'https://example.com' }), request('{}', { 'sec-fetch-site': 'cross-site' }), request('{}', { host: 'evil.example' })]) expect((await POST(r)).status).toBe(403);
    expect((await GET(new Request('https://example.com/api/coordination'))).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects malformed or oversized bodies and incorrect content types', async () => {
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request('x'.repeat(16385)))).status).toBe(413);
    expect((await POST(request('{}', { 'content-type': 'text/plain' }))).status).toBe(415);
    expect(execute).not.toHaveBeenCalled();
  });
  it('accepts same-origin browser and local machine JSON commands', async () => {
    const command = { operation: 'acknowledge', messageId: 'MSG-00003', participantId: 'agent.release' };
    const clients: Record<string, string>[] = [{}, { origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' }];
    for (const headers of clients) {
      const response = await POST(request(JSON.stringify(command), headers));
      expect(response.status).toBe(200);
      expect(response.headers.get('x-payload-fixture-only')).toBe('true');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(execute).toHaveBeenCalledWith(command);
  });
  it('returns the shared read snapshot and retains explicit prototype status', async () => {
    vi.mocked(getCoordinationSnapshot).mockResolvedValue({ fixture_only: true } as Awaited<ReturnType<typeof getCoordinationSnapshot>>);
    const response = await GET(new Request('http://localhost:3000/api/coordination'));
    expect(await response.json()).toEqual({ fixture_only: true });
    expect(response.headers.get('x-payload-coordination')).toBe('sandbox-v1');
  });

  it('accepts Next localhost URL normalization while binding Origin to the real loopback Host', async () => {
    const command = { operation: 'acknowledge', messageId: 'MSG-00003', participantId: 'agent.release' };
    const url = 'http://localhost:3000/api/coordination';
    expect((await POST(request(JSON.stringify(command), { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }, url))).status).toBe(200);
    expect(execute).toHaveBeenCalledWith(command);
    for (const host of ['example.com:3000', '127.0.0.1:4000', '127.0.0.1:3000/other', 'user@localhost:3000']) {
      expect((await POST(request('{}', { host }, url))).status).toBe(403);
    }
    expect((await POST(request('{}', { host: '127.0.0.1:3000', origin: 'http://localhost:3000' }, url))).status).toBe(403);
  });
});
