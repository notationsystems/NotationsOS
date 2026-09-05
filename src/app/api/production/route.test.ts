import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionError } from '@/production/errors';
import { GET, POST } from './route';
import { POST as INSPECT } from './inspect/route';

const runtime = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/production/worker', () => ({ runProductionWork: runtime.run }));
const local = 'http://127.0.0.1:3000/api/production';
const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const reference = { id: 'run-a', digest: `sha256:${'a'.repeat(64)}` };
const inspection = { schema: 'payload.production-inspection-request.v1', kind: 'RUN', reference };
function request(value: unknown = {}, changes: Record<string, string> = {}, url = local) {
  return new Request(url, { method: 'POST', headers: { ...headers, ...changes }, body: JSON.stringify(value) });
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1'); runtime.run.mockResolvedValue({ schema: 'test.result.v1', mode: 'LOCAL_DEVELOPMENT', canonicalAdmission: false }); });
afterEach(() => { vi.unstubAllEnvs(); });
async function refusal(response: Response, code: string, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-payload-production')).toBe('local-development-v1');
  expect((await response.json()).error.code).toBe(code);
  expect(runtime.run).not.toHaveBeenCalled();
}

describe('local production HTTP boundary', () => {
  it('returns only a disabled descriptor by default without opening the local store', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '');
    const response = await GET(new Request('https://public.example/api/production'));
    expect(await response.json()).toEqual({ schema: 'payload.production-availability.v1', mode: 'LOCAL_DEVELOPMENT', enabled: false, operations: [], canonicalAdmission: false, liveConnectors: false });
    expect(runtime.run).not.toHaveBeenCalled();
  });
  it.each([POST, INSPECT])('refuses operations before reading the body when disabled', async (handler) => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', 'true');
    const input = request();
    const body = vi.spyOn(input.body!, 'getReader');
    await refusal(await handler(input), 'LOCAL_MODE_DISABLED', 403);
    expect(body).not.toHaveBeenCalled();
  });
  it.each([
    [{ host: 'evil.example' }, local],
    [{ origin: 'https://evil.example' }, local],
    [{ 'sec-fetch-site': 'cross-site' }, local],
    [{ host: '127.0.0.1:9999' }, local],
    [{}, 'https://public.example/api/production'],
  ] as const)('rejects non-loopback or cross-origin requests (%j)', async (changes, url) => {
    await refusal(await POST(request({}, changes, url)), 'LOCAL_ONLY', 403);
  });
  it('guards catalog reads too', async () => {
    await refusal(await GET(new Request(local, { headers: { ...headers, origin: 'https://evil.example' } })), 'LOCAL_ONLY', 403);
  });
  it('uses the same worker for a valid local catalog and command without accepting storage configuration', async () => {
    expect((await GET(new Request(local, { headers }))).status).toBe(200);
    expect(runtime.run).toHaveBeenCalledWith({ action: 'CATALOG' });
    runtime.run.mockClear();
    const command = { schema: 'payload.production-command.v1', requestId: 'request-a', operation: 'REGISTER_CORPUS' };
    expect((await POST(request(command))).status).toBe(200);
    expect(runtime.run).toHaveBeenCalledWith({ action: 'EXECUTE', command });
  });
  it('dispatches only a strict, exact reference for historical inspection', async () => {
    expect((await INSPECT(request(inspection))).status).toBe(200);
    expect(runtime.run).toHaveBeenCalledWith({ action: 'INSPECT', kind: 'RUN', reference });
  });
  it.each([
    { ...inspection, storageRoot: 'private-path' },
    { ...inspection, canonicalAdmission: true },
    { ...inspection, kind: 'ACTIVATE_RELEASE' },
    { ...inspection, reference: { id: 'run-a', digest: 'sha256:short' } },
    { ...inspection, reference: { ...reference, path: 'private-path' } },
    { ...inspection, schema: 'unversioned' },
  ])('rejects malformed or authority-expanding inspection (%j)', async (value) => {
    await refusal(await INSPECT(request(value)), 'INVALID_REQUEST', 400);
  });
  it('rejects non-JSON content before starting a worker', async () => {
    await refusal(await POST(request({}, { 'content-type': 'text/plain' })), 'INVALID_CONTENT_TYPE', 415);
  });
  it('bounds streamed input regardless of a false content length', async () => {
    await refusal(await POST(request({ text: 'x'.repeat(2 * 1024 * 1024) }, { 'content-length': '1' })), 'BODY_TOO_LARGE', 413);
    await refusal(await INSPECT(request({ text: 'x'.repeat(4096) })), 'BODY_TOO_LARGE', 413);
  });
  it('refuses invalid UTF-8 instead of replacing bytes before JSON parsing', async () => {
    const input = new Request(local, { method: 'POST', headers, body: new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]) });
    await refusal(await POST(input), 'INVALID_REQUEST', 400);
  });
  it('preserves structured recovery details without copying uncontrolled exceptions', async () => {
    const details = { outputs: [{ kind: 'ACQUISITION', reference }], retry: { sameRequest: false, newRequestRequired: true }, remediation: ['Inspect retained acquisition.'] };
    runtime.run.mockRejectedValueOnce(new ProductionError('OPERATION_INCOMPLETE', 'Inspect retained outputs before a new operation.', 409, details));
    const response = await POST(request({}));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toEqual({ code: 'OPERATION_INCOMPLETE', message: 'Inspect retained outputs before a new operation.', details });
    runtime.run.mockRejectedValueOnce(new Error('C:\\private\\secret.json contains SECRET'));
    const failed = await POST(request({}));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toMatch(/private|SECRET|secret\.json/);
  });
});
