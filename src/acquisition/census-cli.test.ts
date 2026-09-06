import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byteDigest } from '../data-os/evidence-capture';
import { CensusCandidateBuildStore } from '../data-os/local-census-candidate-build';
import { CensusNormalizationStore, type CensusNormalizationRequest } from './census-normalization';
import { CENSUS_BUILD_REQUEST_MAX_BYTES, executeSourceCli, runSourceCli, SOURCE_REQUEST_MAX_BYTES } from './cli';
import { SourceCaptureStore } from './store';
import { SourceConnectorError } from './errors';

let temporary: string;
let root: string;
let requestPath: string;
let request: CensusNormalizationRequest;
const capturedAt = '2026-09-06T12:00:00.000Z';
const normalizedAt = '2026-09-06T12:01:00.000Z';
const builtAt = '2026-09-06T12:02:00.000Z';
const row = { dot_number: '80806', legal_name: 'SYNTHETIC NORMALIZATION CLI CORPORATION',
  business_org_desc: 'CORPORATION', phy_country: 'US', power_units: '0' };

function snapshot(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name); const key = prefix ? `${prefix}/${name}` : name;
    return lstatSync(path).isDirectory() ? Object.entries(snapshot(path, key)) : [[key, byteDigest(readFileSync(path))]];
  }));
}
function normalizations() {
  const store = new CensusNormalizationStore(root);
  return { normalize: (value: unknown) => store.normalize(value, normalizedAt), inspect: (id: string) => store.inspect(id) };
}
function builds() {
  const store = new CensusCandidateBuildStore(root);
  return { build: (value: unknown) => store.build(value, builtAt), inspect: (id: string) => store.inspect(id) };
}
const io = () => ({ stdout: vi.fn<(text: string) => void>(), stderr: vi.fn<(text: string) => void>() });

beforeEach(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-census-cli-test-'));
  root = join(temporary, 'history'); requestPath = join(temporary, 'normalize.json');
  vi.stubEnv('PAYLOAD_SOURCE_COLLECTION', '0');
  const capture = await new SourceCaptureStore(root, { now: () => capturedAt,
    fetch: async () => ({ bytes: Buffer.from(JSON.stringify([row])), mediaType: 'application/json', etag: null, lastModified: null }),
  }).capture({ schema: 'payload.source-capture-request.v1', requestId: 'cli-source', sourceId: 'fmcsa-company-census', usdot: ['80806', '80807'] }, true);
  request = { schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: 'cli-normalized',
    purpose: 'source-qualification', capture: { requestId: 'cli-source', receiptDigest: capture.receipt!.digest }, usdot: '80806' };
  writeFileSync(requestPath, JSON.stringify(request));
  vi.spyOn(SourceCaptureStore.prototype, 'capture').mockRejectedValue(new Error('Collection is forbidden in this workflow.'));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  const selected = resolve(temporary);
  if (dirname(selected) !== resolve(tmpdir()) || !selected.startsWith(`${resolve(tmpdir())}${sep}payload-census-cli-test-`)) throw new Error('Unsafe test cleanup.');
  rmSync(selected, { recursive: true, force: true });
});

describe('operator source normalization and candidate-build CLI', () => {
  it('normalizes exact retained evidence, builds exact candidates and inspects both without collection', async () => {
    const captureFiles = snapshot(); const storeFactory = vi.fn();
    const dependencies = { storeFactory, normalizationFactory: normalizations, buildFactory: builds };
    const normalized = await executeSourceCli(['normalize', '--request', requestPath, '--root', root], dependencies);
    if (!('run' in normalized)) throw new Error('Missing normalization.');
    expect(normalized).toMatchObject({ status: 'CREATED', rawBytesIncluded: false, run: { state: 'NORMALIZED',
      canonicalAdmission: false, customerDistributionPermitted: false, candidate: { fields: { power_units: { raw: '0', value: 0, presence: 'PRESENT' } } } } });
    const buildPath = join(temporary, 'build.json');
    writeFileSync(buildPath, JSON.stringify({ schema: 'payload.local-candidate-build-request.v2', buildId: 'cli-build', purpose: 'source-qualification',
      knownThrough: normalizedAt, definition: { id: 'census-qualification', version: '1', domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation',
        sourceClasses: ['public-government-company-census'] }, normalizations: [{ id: request.normalizationId, digest: normalized.run.digest }] }));
    const built = await executeSourceCli(['build', '--request', buildPath, '--root', root], dependencies);
    expect(built).toMatchObject({ status: 'CREATED', rawBytesIncluded: false, build: { state: 'UNADMITTED', recordCount: 1, releaseActivated: false } });
    const afterBuild = snapshot();
    expect(await executeSourceCli(['inspect-normalization', '--normalization-id', request.normalizationId, '--root', root], dependencies))
      .toEqual({ ...normalized, status: 'INSPECTED' });
    expect(await executeSourceCli(['inspect-build', '--build-id', 'cli-build', '--root', root], dependencies)).toEqual({ ...built, status: 'INSPECTED' });
    expect(await executeSourceCli(['normalize', '--request', requestPath, '--root', root], dependencies)).toEqual({ ...normalized, status: 'EXISTING' });
    expect(snapshot()).toEqual(afterBuild);
    for (const [path, hash] of Object.entries(captureFiles)) expect(afterBuild[path]).toBe(hash);
    expect(storeFactory).not.toHaveBeenCalled(); expect(SourceCaptureStore.prototype.capture).not.toHaveBeenCalled();
  });

  it('returns exit 2 and a retained no-candidate NOT_RETURNED outcome, not an absence assertion', async () => {
    writeFileSync(requestPath, JSON.stringify({ ...request, usdot: '80807' }));
    const output = io();
    expect(await runSourceCli(['normalize', '--request', requestPath, '--root', root], output, { normalizationFactory: normalizations })).toBe(2);
    expect(JSON.parse(output.stdout.mock.calls[0][0])).toMatchObject({ run: { state: 'NOT_RETURNED', notReturned: ['80807'], candidate: null } });
    expect(output.stderr).not.toHaveBeenCalled();
  });

  it.each([
    ['normalize'], ['build'], ['inspect-normalization', '--normalization-id', '../escape'],
    ['inspect-build', '--build-id', 'https://example.invalid'], ['normalize', '--request', 'x', '--clock', capturedAt],
    ['build', '--request', 'x', '--url', 'https://example.invalid'], ['build', '--request', 'x', '--token', 'secret'],
    ['normalize', '--request', 'x', '--request', 'y'], ['inspect-build', '--request', 'x'],
  ])('rejects unsupported flags before storage: %j', async (...args) => {
    const output = io(); const normalizationFactory = vi.fn(); const buildFactory = vi.fn();
    expect(await runSourceCli(args, output, { normalizationFactory, buildFactory })).toBe(1);
    expect(JSON.parse(output.stderr.mock.calls[0][0]).error.code).toBe('INVALID_SOURCE_CLI_ARGUMENTS');
    expect(normalizationFactory).not.toHaveBeenCalled(); expect(buildFactory).not.toHaveBeenCalled();
  });

  it('rejects duplicate JSON keys and injected current authority without storage mutation', async () => {
    const before = snapshot(); const normalizationFactory = vi.fn();
    for (const json of [JSON.stringify(request).replace('"usdot":', '"usdot":"80807","usdot":'),
      JSON.stringify({ ...request, canonicalAdmission: true }), JSON.stringify({ ...request, purpose: 'customer-delivery' })]) {
      writeFileSync(requestPath, json); const output = io();
      expect(await runSourceCli(['normalize', '--request', requestPath, '--root', root], output, { normalizationFactory })).toBe(1);
      expect(output.stdout).not.toHaveBeenCalled();
    }
    expect(normalizationFactory).not.toHaveBeenCalled(); expect(snapshot()).toEqual(before);
  });

  it('accepts bounded 64-member build requests above 8 KiB without raising the capture limit', async () => {
    const manifest = { schema: 'payload.local-candidate-build-request.v2', buildId: 'large-build', purpose: 'source-qualification', knownThrough: normalizedAt,
      definition: { id: 'census', version: '1', domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation', sourceClasses: ['public-government-company-census'] },
      normalizations: Array.from({ length: 64 }, (_, index) => ({ id: `${'n'.repeat(75)}${String(index).padStart(3, '0')}`, digest: `sha256:${'a'.repeat(64)}` })) };
    const json = JSON.stringify(manifest);
    expect(Buffer.byteLength(json)).toBeGreaterThan(SOURCE_REQUEST_MAX_BYTES);
    expect(Buffer.byteLength(json)).toBeLessThan(CENSUS_BUILD_REQUEST_MAX_BYTES);
    writeFileSync(requestPath, json);
    const build = vi.fn(() => { throw new Error('Reached bounded build dispatch.'); });
    await expect(executeSourceCli(['build', '--request', requestPath, '--root', root], {
      buildFactory: () => ({ build, inspect: vi.fn() }),
    })).rejects.toThrow('Reached bounded build dispatch.');
    expect(build).toHaveBeenCalledWith(manifest);
    const output = io();
    expect(await runSourceCli(['capture', '--request', requestPath, '--root', root], output)).toBe(1);
    expect(JSON.parse(output.stderr.mock.calls[0][0]).error.code).toBe('INVALID_SOURCE_REQUEST_FILE');
    writeFileSync(requestPath, Buffer.alloc(CENSUS_BUILD_REQUEST_MAX_BYTES + 1, 32));
    output.stderr.mockClear();
    expect(await runSourceCli(['build', '--request', requestPath, '--root', root], output)).toBe(1);
    expect(JSON.parse(output.stderr.mock.calls[0][0]).error.code).toBe('INVALID_CENSUS_BUILD_REQUEST_FILE');
  });

  it('uses fixed error messages and distinguishes missing retained targets', async () => {
    const output = io();
    expect(await runSourceCli(['inspect-normalization', '--normalization-id', 'missing', '--root', root], output)).toBe(1);
    expect(JSON.parse(output.stderr.mock.calls[0][0]).error.code).toBe('CENSUS_NORMALIZATION_NOT_FOUND');
    output.stderr.mockClear();
    expect(await runSourceCli(['inspect-build', '--build-id', 'missing', '--root', root], output)).toBe(1);
    expect(JSON.parse(output.stderr.mock.calls[0][0]).error.code).toBe('CENSUS_BUILD_NOT_FOUND');
    output.stderr.mockClear();
    expect(await runSourceCli(['inspect-normalization', '--normalization-id', 'x'], output, {
      normalizationFactory: () => ({ inspect: () => { throw new Error(`${root} credential raw-body`); }, normalize: vi.fn() }),
    })).toBe(1);
    expect(output.stderr.mock.calls[0][0]).not.toMatch(/credential|raw-body/);
    expect(output.stderr.mock.calls[0][0]).not.toContain(root);
  });

  it('resolves the identical saved normalization in fresh CLI processes with collection disabled', () => {
    const run = normalizations().normalize(request).run;
    const before = snapshot(); const executable = join(temporary, 'source.mjs');
    buildSync({ entryPoints: [resolve('scripts/source.entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: executable, logLevel: 'silent' });
    const execute = (args: string[]) => JSON.parse(execFileSync(process.execPath, [executable, ...args, '--root', root], {
      encoding: 'utf8', timeout: 20_000, windowsHide: true, env: { ...process.env, PAYLOAD_SOURCE_COLLECTION: '0' },
    }));
    expect(execute(['inspect-normalization', '--normalization-id', request.normalizationId])).toEqual({ status: 'INSPECTED', run, rawBytesIncluded: false });
    expect(execute(['normalize', '--request', requestPath])).toEqual({ status: 'EXISTING', run, rawBytesIncluded: false });
    expect(snapshot()).toEqual(before);
  });

  it.each(['CENSUS_BUILD_MEMBER_NOT_FOUND', 'CENSUS_BUILD_MEMBER_REFERENCE_MISMATCH', 'CENSUS_BUILD_MEMBER_NOT_ELIGIBLE',
    'CENSUS_BUILD_MEMBER_AFTER_CUTOFF', 'CENSUS_BUILD_SOURCE_IDENTITY_CONFLICT', 'CENSUS_BUILD_SOURCE_CLASS_NOT_DECLARED',
    'CENSUS_BUILD_ACQUISITION_MISMATCH', 'CENSUS_BUILD_DERIVATION_NOT_ALLOWED', 'CENSUS_CANDIDATE_BUILD_CONFLICT',
    'CENSUS_CANDIDATE_BUILD_INVALID', 'CENSUS_CANDIDATE_BUILD_SAVE_UNCONFIRMED', 'CENSUS_NORMALIZATION_SAVE_UNCONFIRMED'])
    ('preserves fixed recovery code %s without raw diagnostics', async (code) => {
      const output = io();
      expect(await runSourceCli(['inspect-build', '--build-id', 'x'], output, {
        buildFactory: () => ({ inspect: () => { throw new SourceConnectorError(code, 'private-path provider-body'); }, build: vi.fn() }),
      })).toBe(1);
      const error = JSON.parse(output.stderr.mock.calls[0][0]).error;
      expect(error.code).toBe(code); expect(error.message).not.toMatch(/private-path|provider-body/);
    });
});
