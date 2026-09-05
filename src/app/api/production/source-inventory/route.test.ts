import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionError } from '@/production/errors';
import { GET } from './route';

const inventory = vi.hoisted(() => ({ read: vi.fn(), worker: vi.fn() }));
vi.mock('@/production/source-inventory', () => ({ sourceIntegrationInventory: inventory.read }));
vi.mock('@/production/worker', () => ({ runProductionWork: inventory.worker }));

const local = 'http://127.0.0.1:3000/api/production/source-inventory';
const headers = {
  host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin',
};
const result = {
  schema: 'payload.source-integration-inventory.v1', mode: 'LOCAL_DEVELOPMENT',
  basis: 'PINNED_PROTOTYPE_REGISTRY', entries: [], digest: `sha256:${'a'.repeat(64)}`,
};

function request(changes: Record<string, string> = {}, url = local) {
  return new Request(url, { headers: { ...headers, ...changes } });
}

function boundary(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-payload-production')).toBe('local-development-v1');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-type')).toContain('application/json');
}

async function refusal(input: Request, code: string, status: number) {
  const readJson = vi.spyOn(input, 'json');
  const readText = vi.spyOn(input, 'text');
  const response = await GET(input);
  expect(response.status).toBe(status);
  boundary(response);
  expect(await response.json()).toMatchObject({
    schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT',
    canonicalAdmission: false, error: { code },
  });
  expect(inventory.read).not.toHaveBeenCalled();
  expect(readJson).not.toHaveBeenCalled();
  expect(readText).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
  inventory.read.mockReturnValue(result);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network access is not an inventory operation.')));
});
afterEach(() => {
  expect(inventory.worker).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('local source integration inventory HTTP boundary', () => {
  it.each(['', 'true', '0'])('requires explicit local mode (%j)', async (enabled) => {
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', enabled);
    await refusal(request(), 'LOCAL_MODE_DISABLED', 403);
  });

  it.each([
    [{ host: 'evil.example' }, local],
    [{ origin: 'https://evil.example' }, local],
    [{ 'sec-fetch-site': 'cross-site' }, local],
    [{ host: '127.0.0.1:9999' }, local],
    [{ origin: 'null' }, local],
    [{}, 'https://public.example/api/production/source-inventory'],
  ] as const)('rejects nonlocal or cross-origin reads (%j)', async (changes, url) => {
    await refusal(request(changes, url), 'LOCAL_ONLY', 403);
  });

  it.each([
    '?root=private-path', '?sourceId=caller-source', '?selected=true', '?connect=true',
    '?liveCollectionEnabled=true', '?unused=',
  ])('rejects caller-selected configuration before reading the inventory (%s)', async (query) => {
    await refusal(request({}, `${local}${query}`), 'INVALID_REQUEST', 400);
  });

  it('returns the code-owned inventory without reading bodies or executing production work', async () => {
    const input = request();
    const readJson = vi.spyOn(input, 'json');
    const readText = vi.spyOn(input, 'text');
    const response = await GET(input);
    expect(response.status).toBe(200);
    boundary(response);
    expect(await response.json()).toEqual(result);
    expect(inventory.read).toHaveBeenCalledTimes(1);
    expect(inventory.read).toHaveBeenCalledWith();
    expect(readJson).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
  });

  it('does not copy operator paths or credential environment variables into the response', async () => {
    vi.stubEnv('PAYLOAD_PRODUCTION_DIR', 'C:\\private-path\\secret.json');
    vi.stubEnv('PAYLOAD_SOURCE_API_KEY', 'SECRET-credential');
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/private-path|secret\.json|SECRET|PAYLOAD_SOURCE_API_KEY|PAYLOAD_PRODUCTION_DIR/);
    expect(inventory.read).toHaveBeenCalledTimes(1);
    expect(inventory.read).toHaveBeenCalledWith();
  });

  it('preserves known backend errors without producing an inventory', async () => {
    inventory.read.mockImplementationOnce(() => { throw new ProductionError('INVENTORY_UNAVAILABLE', 'Inventory unavailable.', 409); });
    const response = await GET(request());
    expect(response.status).toBe(409);
    boundary(response);
    expect(await response.json()).toEqual({
      schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT', canonicalAdmission: false,
      error: { code: 'INVENTORY_UNAVAILABLE', message: 'Inventory unavailable.' },
    });
  });

  it('sanitizes unexpected exceptions without claiming a successful inventory', async () => {
    inventory.read.mockImplementationOnce(() => { throw new Error('C:\\private-path\\secret.json contains SECRET'); });
    const response = await GET(request());
    expect(response.status).toBe(503);
    boundary(response);
    const body = await response.json();
    expect(body).toMatchObject({
      schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT', canonicalAdmission: false,
      error: { code: 'LOCAL_PRODUCTION_UNAVAILABLE' },
    });
    expect(body).not.toHaveProperty('entries');
    expect(body).not.toHaveProperty('digest');
    expect(JSON.stringify(body)).not.toMatch(/private-path|secret\.json|SECRET/);
  });
});
