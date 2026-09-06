import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { executeBenchmarkCli, runBenchmarkCli } from './benchmark-cli';
import { runScalarBenchmarkDemo } from './benchmark-demo';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { encodeLocalRecord } from '../data-os/local-record';
import { MAX_BENCHMARK_BYTES } from './benchmark-contract';

let temp: string, root: string;
beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'payload-scalar-cli-')); root = join(temp, 'evidence');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NO_NETWORK'); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  const target = resolve(temp); expect(target.startsWith(`${resolve(tmpdir())}${sep}`)).toBe(true);
  expect(target.split(sep).at(-1)).toMatch(/^payload-scalar-cli-/); rmSync(target, { recursive: true, force: true });
});
it.each([[], ['--help'], ['-h']].map((args) => ({ args })))('shows help without starting an experiment: $args', ({ args }) => {
  expect(executeBenchmarkCli(args)).toHaveProperty('help'); expect(existsSync(root)).toBe(false);
});
it('preserves a distinct synthetic demonstration and exact retries, without touching replay or GAT stores', () => {
  const result = executeBenchmarkCli(['demo', '--root', root]);
  expect(result).toMatchObject({ status: 'CREATED', run: { modelExecution: { evidenceClass: 'SYNTHETIC_TEST', fullSensorFusionPerformed: false } } });
  expect(executeBenchmarkCli(['demo', '--root', root])).toEqual({ ...result, status: 'EXISTING' });
  expect(executeBenchmarkCli(['inspect', '--id', 'synthetic-scalar-benchmark-v1', '--root', root])).toEqual({ ...result, status: 'INSPECTED' });
  expect(readdirSync(root).sort()).toEqual(['acquisitions', 'objects', 'scientific-benchmarks']);
});
it('runs an exact pinned manifest and exposes computation and reference metrics separately', () => {
  const demo = runScalarBenchmarkDemo(root); const request = { ...demo.run.request, runId: 'second-run' };
  const file = join(temp, 'request.json'); writeFileSync(file, JSON.stringify(request));
  const result = executeBenchmarkCli(['run', '--request', file, '--root', root]);
  expect(result).toMatchObject({ status: 'CREATED', run: { request, modelExecution: { summary: [
    { split: 'DEVELOPMENT', computedCaseCount: 1 }, { split: 'HELD_OUT', computedCaseCount: 1 },
  ] } } });
});
it.each([
  ['run'], ['inspect'], ['train'], ['demo', '--model', 'pinn'], ['demo', '--url', 'https://invalid.example'],
  ['demo', '--root', 'x', '--root', 'x'], ['inspect', '--id', '../bad'], ['run', '--request'],
].map((args) => ({ args })))('refuses unsupported command/options: $args', ({ args }) => {
  const stdout = vi.fn(), stderr = vi.fn(); expect(runBenchmarkCli(args, { stdout, stderr })).toBe(1);
  expect(stdout).not.toHaveBeenCalled(); expect(JSON.parse(stderr.mock.calls[0][0])).toMatchObject({ error: { code: 'BENCHMARK_FAILED' } });
  expect(stderr.mock.calls[0][0]).not.toContain('invalid.example'); expect(existsSync(root)).toBe(false);
});
it.each(['', '{', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}', 'x'.repeat(4097), '\ufeff{}'])('rejects invalid bounded JSON without leaking input or paths', (json) => {
  const file = join(temp, 'private.json'); writeFileSync(file, json);
  const stdout = vi.fn(), stderr = vi.fn();
  expect(runBenchmarkCli(['run', '--request', file, '--root', root], { stdout, stderr })).toBe(1);
  expect(stderr.mock.calls[0][0]).not.toContain(temp); expect(existsSync(root)).toBe(false);
});
it('returns code 2 and retains inspectable requirements when input variance is not supplied', () => {
  const demo = runScalarBenchmarkDemo(root), intake = new LocalEvidenceIntake(root);
  demo.manifest.cases[0].factors[0].varianceM2 = null;
  const prior = intake.inspect(demo.run.request.manifest.acquisitionId)!;
  const acquisition = intake.capture({ ...prior.request.manifest, acquisitionId: 'unknown-noise-manifest', evidenceId: 'unknown-noise-evidence' },
    encodeLocalRecord(demo.manifest, MAX_BENCHMARK_BYTES)).acquisition;
  const request = { schema: 'payload.scientific-benchmark-request.v1', runId: 'unknown-noise-run', manifest: {
    acquisitionId: 'unknown-noise-manifest', acquisitionDigest: acquisition.digest, contentDigest: acquisition.request.contentDigest,
  } };
  const file = join(temp, 'request.json'); writeFileSync(file, JSON.stringify(request));
  const stdout = vi.fn(), stderr = vi.fn();
  expect(runBenchmarkCli(['run', '--request', file, '--root', root], { stdout, stderr })).toBe(2);
  expect(JSON.parse(stdout.mock.calls[0][0]).run.modelExecution.cases[0]).toMatchObject({ fit: null, blockers: ['FACTOR_VARIANCE_UNAVAILABLE'] });
  expect(stderr).not.toHaveBeenCalled();
  expect(runBenchmarkCli(['inspect', '--id', 'unknown-noise-run', '--root', root], { stdout, stderr })).toBe(2);
});
it('reopens byte-identical numerical results and retained timing in fresh Node processes without writes', () => {
  const entry = join(temp, 'benchmark.mjs');
  buildSync({ entryPoints: [resolve('scripts/benchmark.entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry, logLevel: 'silent' });
  const first = JSON.parse(execFileSync(process.execPath, [entry, 'demo', '--root', root], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
  const snapshot = () => readdirSync(root, { recursive: true, withFileTypes: true }).filter((f) => f.isFile()).map((f) => {
    const file = join(f.parentPath, f.name); return [file, readFileSync(file).toString('hex')];
  });
  const before = snapshot();
  const inspected = JSON.parse(execFileSync(process.execPath, [entry, 'inspect', '--id', 'synthetic-scalar-benchmark-v1', '--root', root], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
  expect(inspected.run).toEqual(first.run); expect(inspected.manifest).toEqual(first.manifest);
  expect(snapshot()).toEqual(before);
});
