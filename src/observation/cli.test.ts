import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeReplayCli, runReplayCli } from './cli';
import { runReplayDemo } from './demo';

let temp: string;
let root: string;
beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'payload-replay-cli-')); root = join(temp, 'evidence');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NO_NETWORK'); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  const target = resolve(temp), base = resolve(tmpdir());
  expect(target.startsWith(`${base}${sep}`)).toBe(true);
  expect(target.split(sep).at(-1)).toMatch(/^payload-replay-cli-/);
  rmSync(target, { recursive: true, force: true });
});

describe('local replay CLI', () => {
  it.each([[], ['--help'], ['-h']].map((args) => ({ args })))('prints help without creating a store: $args', ({ args }) => {
    expect(executeReplayCli(args)).toHaveProperty('help'); expect(existsSync(root)).toBe(false);
  });
  it('runs and reinspects an explicitly synthetic demo with create-only retries', () => {
    const result = executeReplayCli(['demo', '--root', root]);
    expect(result).toMatchObject({ status: 'CREATED', rawBytesIncluded: false,
      run: { computation: { evidenceClass: 'SYNTHETIC_TEST', canonicalAdmission: false } } });
    expect(executeReplayCli(['demo', '--root', root])).toEqual({ ...result, status: 'EXISTING' });
    expect(executeReplayCli(['inspect', '--id', 'synthetic-replay-v1', '--root', root])).toEqual({ ...result, status: 'INSPECTED' });
  });
  it('runs an exact retained manifest request, and preserves sensor ticks separate from intake times', () => {
    const demo = runReplayDemo(root), request = { ...demo.run.request, replayId: 'separate-replay' };
    const file = join(temp, 'request.json'); writeFileSync(file, JSON.stringify(request));
    const result = executeReplayCli(['run', '--request', file, '--root', root]);
    expect(result).toMatchObject({ status: 'CREATED', run: { request, dependencies: [
      expect.objectContaining({ capturedAt: '2020-01-01T00:00:00.000Z' }),
      expect.objectContaining({ capturedAt: '2020-01-01T00:00:00.000Z' }),
    ] } });
    expect(executeReplayCli(['run', '--request', file, '--root', root])).toEqual({ ...result, status: 'EXISTING' });
  });
  it.each([
    ['run'], ['inspect'], ['capture'], ['demo', '--request', 'x'], ['demo', '--url', 'https://invalid.example'],
    ['demo', '--root', 'x', '--root', 'x'], ['inspect', '--id', '../invalid'], ['inspect', '--id', '--help'], ['run', '--request'],
  ].map((args) => ({ args })))('rejects malformed command $args without input-driven diagnostics', ({ args }) => {
    const stdout = vi.fn(), stderr = vi.fn();
    expect(runReplayCli(args, { stdout, stderr })).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(JSON.parse(stderr.mock.calls[0][0])).toMatchObject({ error: { code: 'REPLAY_FAILED' } });
    expect(stderr.mock.calls[0][0]).not.toContain('https://invalid.example');
    expect(existsSync(root)).toBe(false);
  });
  it.each(['', '{', '{"schema":1,"schema":2}', '{"schema":1,"\\u0073chema":2}', 'x'.repeat(4097)])('rejects malformed/oversized request bytes', (json) => {
    const file = join(temp, 'secret-input.json'); writeFileSync(file, json);
    const stdout = vi.fn(), stderr = vi.fn();
    expect(runReplayCli(['run', '--request', file, '--root', root], { stdout, stderr })).toBe(1);
    expect(stderr.mock.calls[0][0]).not.toContain(temp); expect(existsSync(root)).toBe(false);
  });
  it('rejects a directory as a request and reports missing replay without creating directories', () => {
    expect(() => executeReplayCli(['run', '--request', temp, '--root', root])).toThrow();
    expect(() => executeReplayCli(['inspect', '--id', 'missing', '--root', root])).toThrow();
    expect(existsSync(root)).toBe(false);
  });
  it('prints the complete structured report on success, but no raw sensor payload', () => {
    const stdout = vi.fn(), stderr = vi.fn();
    expect(runReplayCli(['demo', '--root', root], { stdout, stderr })).toBe(0);
    const result = JSON.parse(stdout.mock.calls[0][0]);
    expect(result.manifest.observations).toHaveLength(8);
    expect(result.rawBytesIncluded).toBe(false); expect(stderr).not.toHaveBeenCalled();
  });
  it('fresh Node processes reopen identical committed history and leave it unchanged', () => {
    const entry = join(temp, 'replay.mjs');
    buildSync({ entryPoints: [resolve('scripts/replay.entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry, logLevel: 'silent' });
    const first = JSON.parse(execFileSync(process.execPath, [entry, 'demo', '--root', root], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
    const snapshot = () => readdirSync(root, { recursive: true, withFileTypes: true }).filter((f) => f.isFile()).map((f) => {
      const path = join(f.parentPath, f.name); return [path, readFileSync(path).toString('hex')];
    });
    const before = snapshot();
    const reopened = JSON.parse(execFileSync(process.execPath, [entry, 'inspect', '--id', 'synthetic-replay-v1', '--root', root], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
    expect(reopened.run).toEqual(first.run); expect(reopened.manifest).toEqual(first.manifest);
    expect(snapshot()).toEqual(before);
  });
});
