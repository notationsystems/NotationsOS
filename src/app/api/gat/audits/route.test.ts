import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatAuditService } from '@/gat/service';
import { ProductionError } from '@/production/errors';
import { POST } from './route';
import { GET } from './[requestId]/route';

const local = 'http://127.0.0.1:3000';
function request(method = 'POST', body: unknown = {}) {
  return new Request(`${local}/api/gat/audits`, { method, headers: { host: '127.0.0.1:3000', origin: local, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('local GAT routes', () => {
  it('keeps execution and inspections disabled without the production opt-in', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '');
    const audit = vi.spyOn(GatAuditService.prototype, 'audit');
    const inspect = vi.spyOn(GatAuditService.prototype, 'inspectRequest');
    expect((await POST(request())).status).toBe(403);
    expect((await GET(request('GET'), { params: Promise.resolve({ requestId: 'sample' }) })).status).toBe(403);
    expect(audit).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
  });
  it('rejects nonloopback origins before service access', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    const audit = vi.spyOn(GatAuditService.prototype, 'audit');
    const response = await POST(new Request('https://example.com/api/gat/audits', { method: 'POST', headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: '{}' }));
    expect(response.status).toBe(403); expect(audit).not.toHaveBeenCalled();
  });
  it('returns safe structured service failures without uncontrolled diagnostics', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    vi.spyOn(GatAuditService.prototype, 'audit').mockRejectedValueOnce(new ProductionError('GAT_REQUEST_CONFLICT', 'This request identity names different inputs.', 409));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'GAT_REQUEST_CONFLICT' }, canonicalAdmission: false });
    vi.spyOn(GatAuditService.prototype, 'inspectRequest').mockImplementation(() => { throw new Error('C:\\private\\engine.py'); });
    const unavailable = await GET(request('GET'), { params: Promise.resolve({ requestId: 'sample' }) });
    expect(unavailable.status).toBe(503); expect(JSON.stringify(await unavailable.json())).not.toContain('private');
  });
  it('rejects oversized, path-selecting and invalid requests without execution', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    const audit = vi.spyOn(GatAuditService.prototype, 'audit');
    const oversized = await POST(request('POST', { text: 'x'.repeat(8192) }));
    expect(oversized.status).toBe(413); expect(audit).not.toHaveBeenCalled();
    const invalid = await POST(request('POST', { path: 'C:\\private', executable: 'python' }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'INVALID_GAT_REQUEST' } });
    const query = await GET(new Request(`${local}/api/gat/audits/sample?root=other`, { headers: { host: '127.0.0.1:3000', origin: local } }), { params: Promise.resolve({ requestId: 'sample' }) });
    expect(query.status).toBe(400);
  });
  it('distinguishes missing and reserved-but-unconfirmed receipts', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    const inspect = vi.spyOn(GatAuditService.prototype, 'inspectRequest').mockReturnValue(undefined);
    expect((await GET(request('GET'), { params: Promise.resolve({ requestId: 'sample' }) })).status).toBe(404);
    inspect.mockImplementation(() => { throw new ProductionError('GAT_EXECUTION_INCOMPLETE', 'Reserved but unconfirmed; no automatic rerun.', 409); });
    const response = await GET(request('GET'), { params: Promise.resolve({ requestId: 'sample' }) });
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: 'GAT_EXECUTION_INCOMPLETE' } });
  });
});
