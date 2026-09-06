import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { buildSync } from 'esbuild';
import { encodeLocalRecord } from '../data-os/local-record';
import { publishImmutableFile } from '../data-os/local-files';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSamsaraCli, runSamsaraCli } from './samsara-cli';
import { runSamsaraDemo } from './samsara-demo';
import { SamsaraCaptureStore } from './samsara-store';
import { fetchSamsaraHistoryBytes } from './samsara-http';

vi.mock('./samsara-http', async (original) => ({
  ...await original<typeof import('./samsara-http')>(),
  fetchSamsaraHistoryBytes: vi.fn(async () => { throw new Error('TEST_FORBIDS_PROVIDER_CONTACT'); }),
}));

let temp: string, root: string;
beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'payload-samsara-cli-')); root = join(temp, 'evidence');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('TEST_FORBIDS_FETCH'); }));
  vi.mocked(fetchSamsaraHistoryBytes).mockClear();
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); expect(fetchSamsaraHistoryBytes).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  const target = resolve(temp); expect(target.startsWith(`${resolve(tmpdir())}${sep}`)).toBe(true);
  expect(target.split(sep).at(-1)).toMatch(/^payload-samsara-cli-/);
  rmSync(target, { recursive: true, force: true });
});
const input = () => ({ schema: 'payload.samsara-capture-request.v1', requestId: 'new-request', authorization: {
  acquisitionId: 'retained-authorization', acquisitionDigest: `sha256:${'a'.repeat(64)}`, contentDigest: `sha256:${'b'.repeat(64)}`,
} });
const writeRequest = (value: unknown = input()) => { const file = join(temp, 'request.json'); writeFileSync(file, JSON.stringify(value)); return file; };
const snapshot = () => readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
  const file = join(entry.parentPath, entry.name); return [file, readFileSync(file).toString('hex')];
}).sort(([a], [b]) => a.localeCompare(b));

describe('bounded Samsara operator CLI', () => {
  it.each([[], ['--help'], ['-h']].map((args) => ({ args })))('shows help without creating a store or initiating collection: $args', async ({ args }) => {
    vi.stubEnv('PAYLOAD_SAMSARA_COLLECTION', '1'); vi.stubEnv('PAYLOAD_SAMSARA_TOKEN', 'MUST-NOT-BE-USED');
    const factory = vi.fn();
    expect(await executeSamsaraCli(args, { storeFactory: factory })).toHaveProperty('help');
    expect(factory).not.toHaveBeenCalled(); expect(existsSync(root)).toBe(false);
  });

  it('demo never reads collection or credential environment variables and retains 11 synthetic files', async () => {
    const original = process.env, reads: string[] = [];
    process.env = new Proxy(original, { get(target, key) {
      if (key === 'PAYLOAD_SAMSARA_TOKEN' || key === 'PAYLOAD_SAMSARA_COLLECTION') { reads.push(key); throw new Error('NO_ENV_LOOKUP_ALLOWED'); }
      return Reflect.get(target, key);
    } });
    try {
      const result = await executeSamsaraCli(['demo', '--root', root]);
      expect(result).toMatchObject({ state: 'CAPTURED', source: { evidenceClass: 'SYNTHETIC_TEST' },
        intent: { transport: 'SYNTHETIC_OFFLINE' }, observations: { availability: 'OBSERVATIONS_RETURNED', coverage: 'SINGLE_PAGE_ONLY' },
        claims: { rawBytesIncluded: false, tokenIncluded: false, liveQualificationEstablished: false,
          canonicalAdmission: false, physicalVisitEstablished: false, continuousSynchronization: false } });
      expect(reads).toEqual([]);
    } finally { process.env = original; }
    expect(snapshot()).toHaveLength(11);
    expect(readdirSync(root).sort()).toEqual(['acquisitions', 'objects', 'samsara-binding.json', 'samsara-budgets', 'samsara-captures']);
  });

  it('demo retries and inspection reopen byte-identical history without reading a token or fetching', async () => {
    const result = await executeSamsaraCli(['demo', '--root', root]), before = snapshot();
    vi.stubEnv('PAYLOAD_SAMSARA_COLLECTION', '0'); vi.stubEnv('PAYLOAD_SAMSARA_TOKEN', 'NEVER-OUTPUT-THIS');
    expect(await executeSamsaraCli(['demo', '--root', root])).toEqual(result);
    expect(await executeSamsaraCli(['inspect', '--request-id', 'samsara-synthetic-capture-v1', '--root', root])).toEqual(result);
    expect(snapshot()).toEqual(before);
    expect(JSON.stringify(result)).not.toContain('NEVER-OUTPUT-THIS');
  });

  it('refuses a fleet-bound demo root before adding any synthetic artifacts', async () => {
    publishImmutableFile(root, ['samsara-binding.json'], encodeLocalRecord({ schema: 'payload.samsara-local-binding.v1',
      connectionId: 'authorized-connection', fleetId: 'authorized-fleet', region: 'CA', organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED' }), 4096);
    const before = snapshot();
    await expect(executeSamsaraCli(['demo', '--root', root])).rejects.toThrow('SAMSARA_LOCAL_BINDING_CONFLICT');
    expect(snapshot()).toEqual(before);
    expect(snapshot()).toHaveLength(1);
  });

  it('prints the synthetic result with no raw response body or credential and returns zero', async () => {
    const stdout = vi.fn(), stderr = vi.fn();
    expect(await runSamsaraCli(['demo', '--root', root], { stdout, stderr })).toBe(0);
    const result = JSON.parse(stdout.mock.calls[0][0]);
    expect(result.observations.observations).toHaveLength(3); expect(result.claims.tokenIncluded).toBe(false);
    expect(stdout.mock.calls[0][0]).not.toContain('SYNTHETIC-NOT-A-CREDENTIAL');
    expect(stdout.mock.calls[0][0]).not.toContain('SYNTHETIC vehicle; no real fleet');
    expect(stderr).not.toHaveBeenCalled();
  });

  it.each([
    ['capture'], ['inspect'], ['feed'], ['sync'], ['demo', '--request', 'x'],
    ['demo', '--token', 'secret'], ['demo', '--url', 'https://private.example'], ['demo', '--clock', '2026-09-05'],
    ['demo', '--now', '2026-09-05'], ['demo', '--enabled', 'true'], ['demo', '--after', 'cursor'],
    ['capture', '--request'], ['capture', '--request', '--help'], ['inspect', '--request-id', '../unsafe'],
    ['demo', '--root', 'duplicate-root'], ['demo', '--root', ''], ['inspect', '--request-id', ' '],
  ].map((args) => ({ args })))('refuses unsupported commands or credential/URL/clock arguments: $args', async ({ args }) => {
    const stdout = vi.fn(), stderr = vi.fn();
    expect(await runSamsaraCli([...args, '--root', root], { stdout, stderr })).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(JSON.parse(stderr.mock.calls[0][0])).toMatchObject({ mode: 'LOCAL_SAMSARA_QUALIFICATION', error: { code: 'SAMSARA_FAILED' } });
    expect(stderr.mock.calls[0][0]).not.toMatch(/private\.example|secret|duplicate-root/);
    expect(existsSync(root)).toBe(false);
  });

  it.each([
    Buffer.alloc(0), Buffer.from('{'), Buffer.from([0xc3, 0x28]), Buffer.from('\ufeff{}'), Buffer.alloc(4097, 0x20),
    Buffer.from('{"schema":1,"schema":2}'), Buffer.from('{"schema":1,"\\u0073chema":2}'),
    Buffer.from(JSON.stringify({ ...input(), authorization: { ...input().authorization, token: 'private-token' } })),
    Buffer.from(JSON.stringify({ ...input(), requestId: '../../secret-path' })),
  ])('rejects malformed UTF8, duplicate-key, oversized or unsupported request files without store activity', async (bytes) => {
    const file = join(temp, 'private-request.json'); writeFileSync(file, bytes);
    const capture = vi.fn(), inspect = vi.fn(), stdout = vi.fn(), stderr = vi.fn();
    expect(await runSamsaraCli(['capture', '--request', file, '--root', root], { stdout, stderr },
      { storeFactory: () => ({ capture, inspect }) })).toBe(1);
    expect(capture).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled(); expect(stderr.mock.calls[0][0]).not.toMatch(/private-token|secret-path|private-request/);
    expect(stderr.mock.calls[0][0]).not.toContain(temp); expect(existsSync(root)).toBe(false);
  });

  it('rejects request directories and missing captures without creating files', async () => {
    await expect(executeSamsaraCli(['capture', '--request', temp, '--root', root])).rejects.toThrow();
    await expect(executeSamsaraCli(['inspect', '--request-id', 'missing', '--root', root])).rejects.toThrow('SAMSARA_CAPTURE_NOT_FOUND');
    expect(existsSync(root)).toBe(false);
  });

  it.each(['', '0', 'true', '01', '1'])('only the exact collection flag 1 is passed as enabled: %s', async (flag) => {
    vi.stubEnv('PAYLOAD_SAMSARA_COLLECTION', flag);
    const file = writeRequest(), capture = vi.fn(async () => { throw new Error('STOP_BEFORE_ANY_CAPTURE'); });
    await expect(executeSamsaraCli(['capture', '--request', file, '--root', root], {
      storeFactory: () => ({ capture, inspect: vi.fn() }),
    })).rejects.toThrow('STOP_BEFORE_ANY_CAPTURE');
    expect(capture).toHaveBeenCalledTimes(1); expect(capture).toHaveBeenCalledWith(input(), flag === '1');
    expect(existsSync(root)).toBe(false);
  });

  it('disabled live capture does not read credentials, look up authorization, or create intent/budget files', async () => {
    vi.stubEnv('PAYLOAD_SAMSARA_COLLECTION', '0');
    const file = writeRequest(), token = vi.fn(() => { throw new Error('TOKEN_MUST_NOT_BE_READ'); });
    const store = new SamsaraCaptureStore(root, { token });
    await expect(executeSamsaraCli(['capture', '--request', file, '--root', root], { storeFactory: () => store })).rejects.toThrow('SAMSARA_COLLECTION_DISABLED');
    expect(token).not.toHaveBeenCalled(); expect(existsSync(root)).toBe(false);
  });

  it('capture consumes the exact pinned request, without accepting inline authority or changing it', async () => {
    const result = await runSamsaraDemo(root), file = writeRequest(result.intent.request), before = snapshot();
    vi.stubEnv('PAYLOAD_SAMSARA_COLLECTION', '0');
    expect(await executeSamsaraCli(['capture', '--request', file, '--root', root])).toEqual(result);
    expect(snapshot()).toEqual(before);
  });

  it.each(['PARTIAL_PAGE', 'NOT_RETURNED', 'INCOMPLETE', 'QUARANTINED', 'FAILED'] as const)('returns code 2 for bounded partial or non-captured state %s', async (state) => {
    const result = await runSamsaraDemo(root), adjusted = structuredClone(result), file = writeRequest(result.intent.request);
    if (state === 'PARTIAL_PAGE') adjusted.observations!.coverage = 'PARTIAL_PAGE';
    else if (state === 'NOT_RETURNED') adjusted.observations!.availability = 'NOT_RETURNED';
    else adjusted.state = state;
    const stdout = vi.fn(), stderr = vi.fn();
    const dependencies = { storeFactory: () => ({ capture: vi.fn(async () => adjusted), inspect: vi.fn(() => adjusted) }) };
    expect(await runSamsaraCli(['capture', '--request', file, '--root', root], { stdout, stderr }, dependencies)).toBe(2);
    expect(await runSamsaraCli(['inspect', '--request-id', result.intent.request.requestId, '--root', root], { stdout, stderr }, dependencies)).toBe(2);
    expect(stderr).not.toHaveBeenCalled(); expect(JSON.parse(stdout.mock.calls[0][0]).state).toBe(adjusted.state);
  });

  it('expired inspection fails with code 1 without printing private observations or renewing history', async () => {
    const at = '2026-09-05T12:30:00.000Z';
    await runSamsaraDemo(root, at); const before = snapshot();
    const stdout = vi.fn(), stderr = vi.fn(), token = vi.fn(() => 'MUST_NOT_BE_USED');
    const dependencies = { storeFactory: () => new SamsaraCaptureStore(root, { now: () => '2026-09-13T12:30:00.000Z', token }) };
    expect(await runSamsaraCli(['inspect', '--request-id', 'samsara-synthetic-capture-v1', '--root', root], { stdout, stderr }, dependencies)).toBe(1);
    expect(stdout).not.toHaveBeenCalled(); expect(stderr.mock.calls[0][0]).not.toMatch(/43\.65|900000000000001|MUST_NOT_BE_USED/);
    expect(token).not.toHaveBeenCalled(); expect(snapshot()).toEqual(before);
  });

  it('sanitizes all thrown transport, credential, and path diagnostics', async () => {
    const stdout = vi.fn(), stderr = vi.fn(), file = writeRequest();
    const capture = vi.fn(async () => { throw new Error(`Bearer private-token https://private.example ${temp}`); });
    expect(await runSamsaraCli(['capture', '--request', file, '--root', root], { stdout, stderr },
      { storeFactory: () => ({ capture, inspect: vi.fn() }) })).toBe(1);
    expect(stdout).not.toHaveBeenCalled(); expect(stderr.mock.calls[0][0]).not.toContain(temp);
    expect(stderr.mock.calls[0][0]).not.toMatch(/Bearer|private-token|private\.example/);
  });

  it('fresh Node processes reopen and retry the identical 11-file offline demonstration without network or token access', () => {
    const entry = join(temp, 'samsara.mjs');
    // Builtin guards apply to the child as well; this does not rely on the parent's Vitest mocks.
    const guard = [
      'import { createRequire as guardRequire } from "node:module";',
      'const guard = guardRequire(import.meta.url);',
      'guard("node:https").request = () => { throw new Error("NETWORK_FORBIDDEN"); };',
      'guard("node:dns/promises").lookup = () => { throw new Error("DNS_FORBIDDEN"); };',
      'guard("node:module").syncBuiltinESMExports();',
      'const guardEnv = process.env; process.env = new Proxy(guardEnv, { get(target, key) {',
      'if (key === "PAYLOAD_SAMSARA_TOKEN" || key === "PAYLOAD_SAMSARA_COLLECTION") throw new Error("CREDENTIAL_OR_ENABLE_LOOKUP_FORBIDDEN");',
      'return Reflect.get(target, key); }});',
    ].join('\n');
    buildSync({ entryPoints: [resolve('scripts/samsara.entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry,
      logLevel: 'silent', banner: { js: guard } });
    const invoke = (args: string[]) => JSON.parse(execFileSync(process.execPath, [entry, ...args, '--root', root],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
    const first = invoke(['demo']), before = snapshot();
    expect(before).toHaveLength(11);
    expect(invoke(['inspect', '--request-id', 'samsara-synthetic-capture-v1'])).toEqual(first);
    expect(invoke(['demo'])).toEqual(first); expect(snapshot()).toEqual(before);
  });
});
