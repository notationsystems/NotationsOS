import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { encodeLocalRecord } from '../data-os/local-record';
import { CLEARANCE_USAGE, executeClearanceCli, runClearanceCli } from './clearance-cli';
import { MAX_CLEARANCE_MANIFEST_BYTES } from './clearance-contract';
import { clearanceDemoDeclaration, runClearanceDemo } from './clearance-demo';

let temporary: string, root: string;
function files(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const target = join(directory, name), key = prefix ? `${prefix}/${name}` : name;
    return lstatSync(target).isDirectory() ? Object.entries(files(target, key)) : [[key, byteDigest(readFileSync(target))]];
  }));
}
function io() { return { stdout: vi.fn<(value: string) => void>(), stderr: vi.fn<(value: string) => void>() }; }
function requestFile(value: unknown) {
  const file = join(temporary, 'private-request.json'); writeFileSync(file, value instanceof Buffer ? value : JSON.stringify(value)); return file;
}
beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-clearance-cli-')); root = join(temporary, 'evidence');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NETWORK_FORBIDDEN'); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  const base = resolve(tmpdir()), target = resolve(temporary);
  expect(relative(base, target)).toMatch(/^payload-clearance-cli-[^\\/]+$/); expect(target).not.toBe(base);
  rmSync(target, { recursive: true, force: true });
});

describe('operator-only clearance CLI', () => {
  it.each([[], ['--help'], ['-h']].map((args) => ({ args })))('shows explicit scope without reading histories: $args', ({ args }) => {
    expect(executeClearanceCli(args)).toEqual({ help: CLEARANCE_USAGE });
    const output = io(); expect(runClearanceCli(args, output)).toBe(0);
    expect(output.stdout).toHaveBeenCalledWith(CLEARANCE_USAGE); expect(output.stderr).not.toHaveBeenCalled();
    expect(CLEARANCE_USAGE).toContain('not authorization or execution'); expect(existsSync(root)).toBe(false);
  });
  it('demo/inspect/retry preserve all 13 files and never claim empirical calibration', () => {
    const result = executeClearanceCli(['demo', '--root', root]), before = files();
    expect(result).toMatchObject({ status: 'CREATED', rawBytesIncluded: false, run: { result: {
      evidenceClass: 'SYNTHETIC_TEST', interpretation: 'ANALYTIC_SOFTWARE_EXPERIMENT_ONLY',
      expectedMetricsMeaning: 'UNDER_DECLARED_MODEL_NOT_EMPIRICAL_CALIBRATION', physicalActionAuthorized: false,
      sourceQueryExecuted: false, activeInferenceImplemented: false, markovBlanketEstablished: false } } });
    expect(Object.keys(before)).toHaveLength(13);
    expect(executeClearanceCli(['inspect', '--id', 'synthetic-clearance-voi-v1', '--root', root])).toEqual({ ...result, status: 'INSPECTED' });
    expect(executeClearanceCli(['demo', '--root', root])).toEqual({ ...result, status: 'EXISTING' });
    expect(files()).toEqual(before);
    expect(readdirSync(root).sort()).toEqual(['acquisitions', 'clearance-voi', 'objects']);
  });
  it('accepts only the retained exact request and returns code 0 for computed synthetic design, not validation success', () => {
    const demo = runClearanceDemo(root), request = { ...demo.run.request, runId: 'second-clearance' };
    const file = requestFile(request), output = io();
    expect(runClearanceCli(['run', '--request', file, '--root', root], output)).toBe(0);
    const result = JSON.parse(output.stdout.mock.calls[0][0]);
    expect(result.run.request).toEqual(request); expect(result.status).toBe('CREATED');
    expect(result.run.result.baselines.every((b: { validation: { metrics: unknown } }) => b.validation.metrics === null)).toBe(true);
    expect(output.stderr).not.toHaveBeenCalled();
    const before = files(); expect(executeClearanceCli(['run', '--request', file, '--root', root])).toEqual({ ...result, status: 'EXISTING' });
    expect(files()).toEqual(before);
  });
  it.each([
    ['run'], ['inspect'], ['measure'], ['collect'], ['execute'], ['demo', '--url', 'https://private.example'],
    ['demo', '--at', '2020-01-01T00:00:00.000Z'], ['demo', '--action', 'measure-opening'], ['demo', '--approved', 'yes'],
    ['demo', '--root', 'x', '--root', 'x'], ['inspect', '--id', '../escape'], ['run', '--request'],
    ['demo', '--root', ''], ['demo', '--root', ' '], ['demo', '--root', '--help'],
    ['run', '--request', 'a', '--request', 'b'], ['inspect', '--id', 'a', '--id', 'b'], ['--help', '--root', 'x'],
  ].map((args) => ({ args })))('refuses unsupported or unsafe command/options without side effects: $args', ({ args }) => {
    const output = io(); expect(runClearanceCli(args, output)).toBe(1);
    expect(output.stdout).not.toHaveBeenCalled(); expect(JSON.parse(output.stderr.mock.calls[0][0])).toMatchObject({
      mode: 'LOCAL_CLEARANCE_VOI', error: { code: 'CLEARANCE_FAILED' } });
    expect(output.stderr.mock.calls[0][0]).not.toContain('private.example'); expect(existsSync(root)).toBe(false);
  });
  it.each(['', '{', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}', 'x'.repeat(4097), '\ufeff{}', 'null', '[]'])('sanitizes malformed or oversized request JSON %#', (json) => {
    const file = requestFile(Buffer.from(json)), output = io();
    expect(runClearanceCli(['run', '--request', file, '--root', root], output)).toBe(1);
    expect(output.stdout).not.toHaveBeenCalled(); expect(output.stderr.mock.calls[0][0]).not.toContain(file);
    expect(output.stderr.mock.calls[0][0]).not.toContain('private-request'); expect(existsSync(root)).toBe(false);
  });
  it('rejects malformed UTF-8 rather than silently replacing its bytes', () => {
    const file = requestFile(Buffer.from([0xc3, 0x28])), output = io();
    expect(runClearanceCli(['run', '--request', file, '--root', root], output)).toBe(1);
    expect(output.stdout).not.toHaveBeenCalled(); expect(existsSync(root)).toBe(false);
  });
  it('rejects duplicate keys in an otherwise valid exact request without publishing', () => {
    const demo = runClearanceDemo(root), request = JSON.stringify({ ...demo.run.request, runId: 'duplicate-request' });
    const file = requestFile(Buffer.from(`{"schema":"payload.clearance-voi-request.v1",${request.slice(1)}`));
    const before = files(), output = io();
    expect(runClearanceCli(['run', '--request', file, '--root', root], output)).toBe(1);
    expect(output.stdout).not.toHaveBeenCalled(); expect(files()).toEqual(before);
  });
  it('rejects directory/absent request paths without disclosing filesystem errors', () => {
    for (const path of [temporary, join(temporary, 'private-missing.json')]) {
      const output = io(); expect(runClearanceCli(['run', '--request', path, '--root', root], output)).toBe(1);
      expect(output.stdout).not.toHaveBeenCalled(); expect(output.stderr.mock.calls[0][0]).not.toMatch(/ENOENT|EISDIR|private-missing/);
      expect(output.stderr.mock.calls[0][0]).not.toContain(temporary);
    }
    expect(existsSync(root)).toBe(false);
  });
  it('absent run inspection is read-only', () => {
    const output = io(); expect(runClearanceCli(['inspect', '--id', 'absent', '--root', root], output)).toBe(1);
    expect(output.stdout).not.toHaveBeenCalled(); expect(existsSync(root)).toBe(false);
  });
  it('returns code 2 and retains requirements when the model assumptions are unresolved', () => {
    const demo = runClearanceDemo(root), intake = new LocalEvidenceIntake(root);
    demo.manifest.model.assumptions.state = 'UNRESOLVED';
    const acquisition = intake.capture(clearanceDemoDeclaration('unresolved-manifest'), encodeLocalRecord(demo.manifest, MAX_CLEARANCE_MANIFEST_BYTES)).acquisition;
    const request = { ...demo.run.request, runId: 'unresolved-run', manifest: { acquisitionId: 'unresolved-manifest',
      acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest } };
    const file = requestFile(request), output = io();
    expect(runClearanceCli(['run', '--request', file, '--root', root], output)).toBe(2);
    const result = JSON.parse(output.stdout.mock.calls[0][0]); expect(output.stderr).not.toHaveBeenCalled();
    expect(result.run.result).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', recommendation: { actionId: null }, baselines: [] });
    const before = files(), inspected = io();
    expect(runClearanceCli(['inspect', '--id', request.runId, '--root', root], inspected)).toBe(2);
    expect(JSON.parse(inspected.stdout.mock.calls[0][0]).run).toEqual(result.run); expect(files()).toEqual(before);
  });
  it('denies expired private evidence at inspection without emitting model, geometry or path', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T13:00:00.000Z'));
    const demo = runClearanceDemo(root), declaration = clearanceDemoDeclaration('finite-private-manifest');
    declaration.sourceRegistration.effectiveUntil = '2026-09-05T14:00:00.000Z';
    declaration.sourceRegistration.retention = { mode: 'UNTIL', until: '2026-09-05T14:00:00.000Z' };
    const acquisition = new LocalEvidenceIntake(root).capture(declaration, encodeLocalRecord(demo.manifest, MAX_CLEARANCE_MANIFEST_BYTES)).acquisition;
    const request = { ...demo.run.request, runId: 'finite-private-run', manifest: { acquisitionId: declaration.acquisitionId,
      acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest } };
    executeClearanceCli(['run', '--request', requestFile(request), '--root', root]);
    vi.setSystemTime(new Date('2026-09-05T14:00:00.000Z')); const before = files(), output = io();
    expect(runClearanceCli(['inspect', '--id', request.runId, '--root', root], output)).toBe(1);
    expect(output.stdout).not.toHaveBeenCalled(); expect(output.stderr.mock.calls[0][0]).not.toMatch(/openingWidthM|alignmentOffsetM|finite-private/);
    expect(files()).toEqual(before);
  });
  it('fresh Node processes demo, inspect and run the same manifest with no HTTP/DNS and byte identity', () => {
    const entry = join(temporary, 'clearance.mjs');
    const guard = [
      'import { createRequire as guardRequire } from "node:module";',
      'const guard = guardRequire(import.meta.url);',
      'for (const name of ["node:https", "node:http"]) guard(name).request = () => { throw new Error("NETWORK_FORBIDDEN"); };',
      'guard("node:dns/promises").lookup = () => { throw new Error("DNS_FORBIDDEN"); };',
      'guard("node:module").syncBuiltinESMExports();',
      'globalThis.fetch = () => { throw new Error("FETCH_FORBIDDEN"); };',
    ].join('\n');
    buildSync({ entryPoints: [resolve('scripts/clearance.entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry,
      banner: { js: guard }, logLevel: 'silent' });
    const invoke = (args: string[]) => JSON.parse(execFileSync(process.execPath, [entry, ...args, '--root', root],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
    const created = invoke(['demo']), before = files(), file = requestFile(created.run.request);
    expect(Object.keys(before)).toHaveLength(13);
    expect(invoke(['inspect', '--id', created.run.request.runId])).toEqual({ ...created, status: 'INSPECTED' });
    expect(invoke(['run', '--request', file])).toEqual({ ...created, status: 'EXISTING' });
    expect(invoke(['demo'])).toEqual({ ...created, status: 'EXISTING' }); expect(files()).toEqual(before);
  });
});
