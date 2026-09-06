import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { encodeLocalRecord } from '../data-os/local-record';
import { executeSpatialCli, runSpatialCli, SPATIAL_USAGE } from './registration-access-cli';
import { MAX_REGISTRATION_MANIFEST_BYTES } from './registration-access-contract';
import { runRegistrationAccessDemo } from './registration-access-demo';

let temporary: string, root: string;
beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-spatial-cli-')); root = join(temporary, 'evidence');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NETWORK_FORBIDDEN'); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  const base = resolve(tmpdir()), target = resolve(temporary);
  expect(relative(base, target)).toMatch(/^payload-spatial-cli-[^\\/]+$/); expect(target).not.toBe(base);
  rmSync(target, { recursive: true, force: true });
});
function files(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const target = join(directory, name), key = prefix ? `${prefix}/${name}` : name;
    return lstatSync(target).isDirectory() ? Object.entries(files(target, key)) : [[key, byteDigest(readFileSync(target))]];
  }));
}
function output() { return { stdout: vi.fn<(text: string) => void>(), stderr: vi.fn<(text: string) => void>() }; }
it.each([[], ['--help'], ['-h']].map((args) => ({ args })))('shows help without touching evidence: $args', ({ args }) => {
  expect(executeSpatialCli(args)).toEqual({ help: SPATIAL_USAGE }); expect(existsSync(root)).toBe(false);
  const io = output(); expect(runSpatialCli(args, io)).toBe(0); expect(io.stdout).toHaveBeenCalledWith(SPATIAL_USAGE); expect(io.stderr).not.toHaveBeenCalled();
});
it('retains a distinct synthetic demo with inspect/retry byte identity and no other instrument histories', () => {
  const result = executeSpatialCli(['demo', '--root', root]), before = files();
  expect(result).toMatchObject({ status: 'CREATED', run: { result: { evidenceClass: 'SYNTHETIC_TEST', registration: { state: 'COMPUTED' },
    claims: { rawBimParsed: false, graphExtractedFromBim: false, fullSensorCalibrationPerformed: false, fieldAccuracyEstablished: false } } } });
  expect(executeSpatialCli(['demo', '--root', root])).toEqual({ ...result, status: 'EXISTING' });
  expect(executeSpatialCli(['inspect', '--id', 'synthetic-building-access-v1', '--root', root])).toEqual({ ...result, status: 'INSPECTED' });
  expect(Object.keys(before)).toHaveLength(13); expect(files()).toEqual(before);
  expect(readdirSync(root).sort()).toEqual(['acquisitions', 'objects', 'registration-access']);
});
it('runs the fixed pinned manifest, with fitted controls and withheld checks kept separate', () => {
  const demo = runRegistrationAccessDemo(root), request = { ...demo.run.request, runId: 'second-spatial-run' };
  const file = join(temporary, 'request.json'); writeFileSync(file, JSON.stringify(request));
  const io = output(); expect(runSpatialCli(['run', '--request', file, '--root', root], io)).toBe(0);
  const result = JSON.parse(io.stdout.mock.calls[0][0]); expect(io.stderr).not.toHaveBeenCalled();
  expect(result).toMatchObject({ status: 'CREATED', run: { request, result: { registration: { state: 'COMPUTED' } } } });
  expect(result.run.result.registration.fit.residuals).toHaveLength(4);
  expect(result.run.result.registration.comparisons).toHaveLength(2);
  expect(result.run.result.registration.checkPointRmseM).toBeGreaterThan(result.run.result.registration.fittingRmseM);
  const retained = files(); expect(executeSpatialCli(['run', '--request', file, '--root', root])).toEqual({ ...result, status: 'EXISTING' });
  expect(files()).toEqual(retained);
});
it.each([
  ['run'], ['inspect'], ['train'], ['collect'], ['demo', '--model', 'pinn'], ['demo', '--url', 'https://invalid.example'],
  ['demo', '--root', 'x', '--root', 'x'], ['inspect', '--id', '../bad'], ['run', '--request'],
  ['demo', '--loss', 'robust'], ['demo', '--metric', 'geodesic'], ['demo', '--approved', 'yes'],
  ['demo', '--root', ''], ['demo', '--root', '   '], ['demo', '--root', '--help'], ['run', '--request', 'a', '--request', 'b'],
  ['--help', '--root', 'x'], ['inspect', '--id', 'name', '--id', 'name'],
].map((args) => ({ args })))('rejects unsupported command/options without side effects: $args', ({ args }) => {
  const io = output(); expect(runSpatialCli(args, io)).toBe(1); expect(io.stdout).not.toHaveBeenCalled();
  expect(JSON.parse(io.stderr.mock.calls[0][0])).toMatchObject({ mode: 'LOCAL_REGISTRATION_ACCESS', error: { code: 'SPATIAL_FAILED' } });
  expect(io.stderr.mock.calls[0][0]).not.toContain('invalid.example'); expect(existsSync(root)).toBe(false);
});
it.each(['', '{', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}', 'x'.repeat(4097), '\ufeff{}', 'null', '[]'])('rejects invalid bounded request JSON without leaking input or paths: %#', (json) => {
  const file = join(temporary, 'private-source-records.json'); writeFileSync(file, json);
  const io = output(); expect(runSpatialCli(['run', '--request', file, '--root', root], io)).toBe(1);
  expect(io.stdout).not.toHaveBeenCalled(); expect(io.stderr.mock.calls[0][0]).not.toContain(temporary);
  expect(io.stderr.mock.calls[0][0]).not.toContain('private-source-records'); expect(existsSync(root)).toBe(false);
});
it('rejects duplicate schema keys in an otherwise exact request before creating a new run', () => {
  const demo = runRegistrationAccessDemo(root), before = files();
  const file = join(temporary, 'request.json'), value = JSON.stringify({ ...demo.run.request, runId: 'duplicate-json-run' });
  writeFileSync(file, `{"schema":"payload.registration-access-request.v1",${value.slice(1)}`);
  const io = output(); expect(runSpatialCli(['run', '--request', file, '--root', root], io)).toBe(1); expect(io.stdout).not.toHaveBeenCalled();
  expect(files()).toEqual(before);
});
it('refuses malformed UTF-8 before parsing without echoing bytes', () => {
  const file = join(temporary, 'private.json'); writeFileSync(file, Buffer.from([0xc3, 0x28]));
  const io = output(); expect(runSpatialCli(['run', '--request', file, '--root', root], io)).toBe(1);
  expect(io.stderr.mock.calls[0][0]).not.toContain(temporary); expect(existsSync(root)).toBe(false);
});
it('refuses a directory or absent path as a request file without exposing filesystem errors', () => {
  for (const file of [temporary, join(temporary, 'missing-private.json')]) {
    const io = output(); expect(runSpatialCli(['run', '--request', file, '--root', root], io)).toBe(1);
    expect(io.stderr.mock.calls[0][0]).not.toContain(file); expect(io.stderr.mock.calls[0][0]).not.toContain('ENOENT');
  }
  expect(existsSync(root)).toBe(false);
});
it('reports a missing exact run without creating the configured root', () => {
  const io = output(); expect(runSpatialCli(['inspect', '--id', 'absent', '--root', root], io)).toBe(1);
  expect(io.stdout).not.toHaveBeenCalled(); expect(existsSync(root)).toBe(false);
});
it('retains requirements and returns code 2 when control variance is unknown', () => {
  const demo = runRegistrationAccessDemo(root), intake = new LocalEvidenceIntake(root);
  demo.manifest.controls[0].varianceM2 = null;
  const previous = intake.inspect(demo.run.request.manifest.acquisitionId)!;
  const acquisition = intake.capture({ ...previous.request.manifest, acquisitionId: 'unknown-noise-manifest', evidenceId: 'unknown-noise-evidence' },
    encodeLocalRecord(demo.manifest, MAX_REGISTRATION_MANIFEST_BYTES)).acquisition;
  const request = { schema: 'payload.registration-access-request.v1', runId: 'unknown-noise-run', manifest: {
    acquisitionId: 'unknown-noise-manifest', acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest,
  } };
  const file = join(temporary, 'request.json'); writeFileSync(file, JSON.stringify(request));
  const io = output(); expect(runSpatialCli(['run', '--request', file, '--root', root], io)).toBe(2);
  const result = JSON.parse(io.stdout.mock.calls[0][0]); expect(io.stderr).not.toHaveBeenCalled();
  expect(result.run.result.registration).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', fit: null, blockers: ['CONTROL_VARIANCE_UNAVAILABLE'] });
  expect(result.run.result.registeredNodes).toBeNull();
  const before = files(), inspected = output();
  expect(runSpatialCli(['inspect', '--id', 'unknown-noise-run', '--root', root], inspected)).toBe(2);
  expect(JSON.parse(inspected.stdout.mock.calls[0][0]).run).toEqual(result.run); expect(files()).toEqual(before);
});
it('returns code 2 with a retained numerical-geometry refusal rather than a fitted transform', () => {
  const demo = runRegistrationAccessDemo(root), intake = new LocalEvidenceIntake(root);
  demo.manifest.controls.forEach((control, index) => { control.sourceM = [index, 0, 0]; });
  const previous = intake.inspect(demo.run.request.manifest.acquisitionId)!;
  const acquisition = intake.capture({ ...previous.request.manifest, acquisitionId: 'degenerate-manifest', evidenceId: 'degenerate-evidence' },
    encodeLocalRecord(demo.manifest, MAX_REGISTRATION_MANIFEST_BYTES)).acquisition;
  const file = join(temporary, 'request.json'); writeFileSync(file, JSON.stringify({ ...demo.run.request, runId: 'degenerate-run', manifest: {
    acquisitionId: acquisition.request.manifest.acquisitionId, acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest,
  } }));
  const io = output(); expect(runSpatialCli(['run', '--request', file, '--root', root], io)).toBe(2);
  expect(JSON.parse(io.stdout.mock.calls[0][0]).run.result.registration).toMatchObject({ fit: null, blockers: ['REGISTRATION_DEGENERATE_GEOMETRY'] });
});
it('does not repair missing exact acquisition history during a failed CLI inspect or demo retry', () => {
  const demo = runRegistrationAccessDemo(root), ref = demo.run.dependencies[1];
  const path = join(root, 'acquisitions', `${byteDigest(Buffer.from(ref.acquisitionId)).slice(7)}.json`);
  writeFileSync(path, '{corrupted'); const before = files();
  for (const args of [['inspect', '--id', demo.run.request.runId, '--root', root], ['demo', '--root', root]]) {
    const io = output(); expect(runSpatialCli(args, io)).toBe(1); expect(io.stdout).not.toHaveBeenCalled(); expect(files()).toEqual(before);
    expect(io.stderr.mock.calls[0][0]).not.toContain(path); expect(io.stderr.mock.calls[0][0]).not.toContain('{corrupted');
  }
});
it('reopens byte-identical results in fresh Node CLI processes and proves no network fetch occurs', () => {
  const entry = join(temporary, 'spatial.mjs');
  buildSync({ entryPoints: [resolve('scripts/spatial.entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry,
    banner: { js: "globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN_IN_SPATIAL_CHILD'); };" }, logLevel: 'silent' });
  const exec = (args: string[]) => JSON.parse(execFileSync(process.execPath, [entry, ...args],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
  const created = exec(['demo', '--root', root]), before = files();
  const inspected = exec(['inspect', '--id', 'synthetic-building-access-v1', '--root', root]);
  const retried = exec(['demo', '--root', root]);
  expect(inspected.run).toEqual(created.run); expect(inspected.manifest).toEqual(created.manifest);
  expect(retried).toEqual({ ...created, status: 'EXISTING' }); expect(files()).toEqual(before); expect(Object.keys(before)).toHaveLength(13);
});
