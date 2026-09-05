import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSourceCli, runSourceCli, SOURCE_REQUEST_MAX_BYTES } from './cli';
import { SourceConnectorError } from './errors';
import { SourceCaptureStore } from './store';
import type { SourceBytes } from './http';

const fileState = vi.hoisted(() => ({ reportedSize: undefined as number | undefined }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, fstatSync: (descriptor: number) => {
    const stat = actual.fstatSync(descriptor);
    return fileState.reportedSize === undefined ? stat : Object.assign(stat, { size: fileState.reportedSize });
  } };
});

let temporary: string;
let root: string;
let requestPath: string;
const request = {
  schema: 'payload.source-capture-request.v1', sourceId: 'fmcsa-company-census',
  requestId: 'cli-census-qualification', usdot: ['80806'],
};
const sourceRows = [{ dot_number: '80806', legal_name: 'CLI TEST CORPORATION', business_org_desc: 'CORPORATION', phy_country: 'US' }];
const sourceResponse = (rows: unknown = sourceRows): SourceBytes => ({
  bytes: Buffer.from(JSON.stringify(rows)), mediaType: 'application/json', etag: null, lastModified: null,
});
const now = () => '2026-09-05T14:10:00.000Z';
const captureArgs = () => ['capture', '--request', requestPath, '--root', root];
const inspectArgs = () => ['inspect', '--request-id', request.requestId, '--root', root];
const output = () => ({ stdout: vi.fn<(text: string) => void>(), stderr: vi.fn<(text: string) => void>() });

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-source-cli-'));
  root = join(temporary, 'qualification');
  requestPath = join(temporary, 'request.json');
  writeFileSync(requestPath, JSON.stringify(request));
  fileState.reportedSize = undefined;
  vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '0');
});
afterEach(() => {
  fileState.reportedSize = undefined;
  vi.unstubAllEnvs();
  rmSync(temporary, { recursive: true, force: true });
});

describe('operator-only source CLI', () => {
  it.each([[], ['--help'], ['-h']].map((args) => ({ args })))('shows help without constructing storage: $args', async ({ args }) => {
    const storeFactory = vi.fn();
    const io = output();
    expect(await runSourceCli(args, io, { storeFactory })).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('PAYLOAD_SOURCE_COLLECTION=1'));
    expect(io.stderr).not.toHaveBeenCalled();
    expect(storeFactory).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);
  });

  it.each([
    ['delete'], ['capture'], ['inspect'], ['capture', '--request'],
    ['inspect', '--request-id'], ['capture', '--request', 'x', '--request', 'y'],
    ['inspect', '--request-id', 'x', '--request-id', 'x'],
    ['inspect', '--request-id', 'x', '--root', 'x', '--root', 'y'],
    ['capture', '--request', 'x', '--url', 'https://example.invalid/private'],
    ['capture', '--request', 'x', '--clock', '2026-09-05T00:00:00Z'],
    ['capture', '--request', 'x', '--token', 'private-token'],
    ['capture', '--request', 'x', '--enabled', '1'],
    ['capture', '--request', 'x', '--request-id', 'x'],
    ['inspect', '--request', 'x'], ['inspect', '--request-id', 'x', '--input', 'x'],
    ['inspect', '--request-id', 'x', '--root'],
    ['inspect', '--request-id', 'x', '--root', '--help'],
    ['inspect', '--request-id', 'x', '--root', '   '],
    ['inspect', '--request-id', '../private'], ['inspect', '--request-id', 'https://example.invalid'],
    ['inspect', '--request-id', 'x', 'unexpected'], ['--help', '--root', 'x'],
  ].map((args) => ({ args })))('rejects extra, duplicate or unsupported flags before storage: $args', async ({ args }) => {
    const storeFactory = vi.fn();
    const io = output();
    expect(await runSourceCli(args, io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('INVALID_SOURCE_CLI_ARGUMENTS');
    expect(io.stdout).not.toHaveBeenCalled();
    expect(storeFactory).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);
  });

  it('defaults only to the dedicated source qualification root', async () => {
    const storeFactory = vi.fn(() => ({ capture: vi.fn(), inspect: vi.fn(() => undefined) }));
    const io = output();
    expect(await runSourceCli(['inspect', '--request-id', 'missing'], io, { storeFactory })).toBe(1);
    expect(storeFactory).toHaveBeenCalledWith('.payload/source-qualification');
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('SOURCE_CAPTURE_NOT_FOUND');
  });

  it.each([
    { label: 'empty file', bytes: Buffer.alloc(0) },
    { label: 'malformed JSON', bytes: Buffer.from('{"secret-path":') },
    { label: 'invalid UTF-8', bytes: Buffer.from([0xc3, 0x28]) },
    { label: 'UTF-8 BOM', bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(request))]) },
    { label: 'duplicate field', bytes: Buffer.from(JSON.stringify(request).replace('"requestId":', '"requestId":"other","requestId":')) },
    { label: 'escaped duplicate field', bytes: Buffer.from(JSON.stringify(request).replace('"requestId":', '"request\\u0049d":"other","requestId":')) },
    { label: 'oversized input', bytes: Buffer.from(JSON.stringify(request).padEnd(SOURCE_REQUEST_MAX_BYTES + 1, ' ')) },
  ])('rejects $label without disclosing input or constructing storage', async ({ bytes }) => {
    writeFileSync(requestPath, bytes);
    const before = readFileSync(requestPath);
    const storeFactory = vi.fn();
    const io = output();
    expect(await runSourceCli(captureArgs(), io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('INVALID_SOURCE_REQUEST_FILE');
    expect(io.stderr.mock.calls[0][0]).not.toContain(temporary);
    expect(io.stderr.mock.calls[0][0]).not.toContain('secret-path');
    expect(storeFactory).not.toHaveBeenCalled();
    expect(readFileSync(requestPath)).toEqual(before);
    expect(existsSync(root)).toBe(false);
  });

  it.each(['missing', 'directory'])('rejects a %s request path without filesystem diagnostics', async (kind) => {
    const path = kind === 'directory' ? temporary : join(temporary, 'missing-secret.json');
    const storeFactory = vi.fn();
    const io = output();
    expect(await runSourceCli(['capture', '--request', path, '--root', root], io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('INVALID_SOURCE_REQUEST_FILE');
    expect(io.stderr.mock.calls[0][0]).not.toContain(path);
    expect(storeFactory).not.toHaveBeenCalled();
  });

  it('enforces the byte cap even when fstat understates the actual file length', async () => {
    writeFileSync(requestPath, JSON.stringify(request).padEnd(SOURCE_REQUEST_MAX_BYTES + 100, ' '));
    fileState.reportedSize = 1;
    const storeFactory = vi.fn();
    const io = output();
    expect(await runSourceCli(captureArgs(), io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('INVALID_SOURCE_REQUEST_FILE');
    expect(storeFactory).not.toHaveBeenCalled();
  });

  it('accepts exactly 8 KiB and forwards only the parsed closed request and environment gate', async () => {
    writeFileSync(requestPath, JSON.stringify(request).padEnd(SOURCE_REQUEST_MAX_BYTES, ' '));
    const capture = vi.fn(async () => { throw new SourceConnectorError('SOURCE_COLLECTION_DISABLED', 'Testing only.'); });
    const storeFactory = vi.fn(() => ({ capture, inspect: vi.fn() }));
    const io = output();
    await runSourceCli(captureArgs(), io, { storeFactory });
    expect(capture).toHaveBeenCalledWith(request, false);
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '1');
    await runSourceCli(captureArgs(), io, { storeFactory });
    expect(capture).toHaveBeenLastCalledWith(request, true);
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', 'true');
    await runSourceCli(captureArgs(), io, { storeFactory });
    expect(capture).toHaveBeenLastCalledWith(request, false);
  });

  it.each([
    { ...request, url: 'https://example.invalid/private' },
    { ...request, requestedAt: now() },
    { ...request, credential: 'private-token' },
    { ...request, usdot: ['80806', '80806'] },
    { ...request, sourceId: 'fmcsa-qcmobile' },
  ])('rejects unsupported request content before constructing storage: %j', async (value) => {
    writeFileSync(requestPath, JSON.stringify(value));
    const storeFactory = vi.fn();
    const io = output();
    expect(await runSourceCli(captureArgs(), io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('INVALID_REQUEST');
    expect(io.stderr.mock.calls[0][0]).not.toContain('private-token');
    expect(storeFactory).not.toHaveBeenCalled();
  });

  it('rejects a new capture with collection disabled, without fetching or creating history', async () => {
    const fetch = vi.fn(async () => sourceResponse());
    const storeFactory = (directory: string) => new SourceCaptureStore(directory, { fetch, now });
    const io = output();
    expect(await runSourceCli(captureArgs(), io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('SOURCE_COLLECTION_DISABLED');
    expect(fetch).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);
  });

  it('captures and reopens durable evidence offline, and never emits raw bytes', async () => {
    const fetch = vi.fn(async () => sourceResponse());
    const storeFactory = (directory: string) => new SourceCaptureStore(directory, { fetch, now });
    const before = readFileSync(requestPath);
    const io = output();
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '1');
    expect(await runSourceCli(captureArgs(), io, { storeFactory })).toBe(0);
    const captured = JSON.parse(io.stdout.mock.calls[0][0]);
    expect(captured).toMatchObject({ state: 'CAPTURED', rawBytesIncluded: false,
      canonicalAdmission: false, customerDistributionPermitted: false,
      observations: { records: [expect.objectContaining({ dot_number: '80806', identityStatus: 'UNRESOLVED' })] } });
    expect(io.stdout.mock.calls[0][0]).not.toContain('"bytes"');
    expect(io.stdout.mock.calls[0][0]).not.toContain(sourceResponse().bytes.toString('base64'));
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '0');
    expect(await executeSourceCli(inspectArgs(), { storeFactory })).toEqual(captured);
    expect(await executeSourceCli(captureArgs(), { storeFactory })).toEqual(captured);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readFileSync(requestPath)).toEqual(before);
    expect(io.stderr).not.toHaveBeenCalled();
  });

  it('exits 2 on a retained failed fetch and does not expose provider diagnostics', async () => {
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '1');
    const fetch = vi.fn(async () => { throw new Error(`provider secret ${temporary}`); });
    const storeFactory = (directory: string) => new SourceCaptureStore(directory, { fetch, now });
    const io = output();
    expect(await runSourceCli(captureArgs(), io, { storeFactory })).toBe(2);
    expect(JSON.parse(io.stdout.mock.calls[0][0])).toMatchObject({ state: 'FAILED', receipt: { failureCode: 'FETCH_FAILED' } });
    expect(io.stdout.mock.calls[0][0]).not.toContain('provider secret');
    expect(io.stdout.mock.calls[0][0]).not.toContain(temporary);
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '0');
    expect(await runSourceCli(inspectArgs(), io, { storeFactory })).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(io.stderr).not.toHaveBeenCalled();
  });

  it('exits 2 on quarantine without printing the rejected source content', async () => {
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '1');
    const fetch = vi.fn(async () => sourceResponse([{ ...sourceRows[0], private_extra: 'PRIVATE RAW RESPONSE' }]));
    const storeFactory = (directory: string) => new SourceCaptureStore(directory, { fetch, now });
    const io = output();
    expect(await runSourceCli(captureArgs(), io, { storeFactory })).toBe(2);
    expect(JSON.parse(io.stdout.mock.calls[0][0])).toMatchObject({ state: 'QUARANTINED', observations: null, rawBytesIncluded: false });
    expect(io.stdout.mock.calls[0][0]).not.toContain('PRIVATE RAW RESPONSE');
    expect(await runSourceCli(inspectArgs(), io, { storeFactory })).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('exits 2 for incomplete history without reexecuting the pending capture', async () => {
    vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '1');
    let release!: (value: SourceBytes) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const transport = new Promise<SourceBytes>((resolve) => { release = resolve; });
    const fetch = vi.fn(() => { started(); return transport; });
    const storeFactory = (directory: string) => new SourceCaptureStore(directory, { fetch, now });
    const pending = executeSourceCli(captureArgs(), { storeFactory });
    await ready;
    const io = output();
    try {
      vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '0');
      expect(await runSourceCli(inspectArgs(), io, { storeFactory })).toBe(2);
      expect(JSON.parse(io.stdout.mock.calls[0][0])).toMatchObject({ state: 'INCOMPLETE', receipt: null });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      release(sourceResponse());
      await pending;
    }
  });

  it('inspects absent history without opt-in, fetching, or directory creation', async () => {
    const fetch = vi.fn(async () => sourceResponse());
    const storeFactory = (directory: string) => new SourceCaptureStore(directory, { fetch, now });
    const io = output();
    expect(await runSourceCli(inspectArgs(), io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe('SOURCE_CAPTURE_NOT_FOUND');
    expect(fetch).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);
  });

  it.each([
    { failure: new Error('filesystem private path /secret/token'), expected: 'SOURCE_CAPTURE_FAILED' },
    { failure: new SourceConnectorError('UNRECOGNIZED_PROVIDER_ERROR', 'provider private token'), expected: 'SOURCE_CAPTURE_FAILED' },
    { failure: { code: 'SOURCE_POLICY_DENIED', message: 'forged private token' }, expected: 'SOURCE_CAPTURE_FAILED' },
    { failure: new SourceConnectorError('SOURCE_POLICY_DENIED', 'forged private token'), expected: 'SOURCE_POLICY_DENIED' },
    { failure: new SourceConnectorError('SOURCE_HISTORY_INVALID', 'private disk location'), expected: 'SOURCE_HISTORY_INVALID' },
  ])('returns only backend-authored error messages for $expected', async ({ failure, expected }) => {
    const storeFactory = () => { throw failure; };
    const io = output();
    expect(await runSourceCli(inspectArgs(), io, { storeFactory })).toBe(1);
    expect(JSON.parse(io.stderr.mock.calls[0][0]).error.code).toBe(expected);
    expect(io.stderr.mock.calls[0][0]).not.toMatch(/private|secret|forged/);
    expect(io.stdout).not.toHaveBeenCalled();
  });
});
