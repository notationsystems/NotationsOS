import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyGatSource } from '../../scripts/gat-source.mjs';
import { GAT_ENGINE_PIN, GAT_RUNTIME_IDENTITY } from './pin';
import { GAT_TIMEOUT_MS, MAX_GAT_INPUT_BYTES, runGatAudit } from './runtime';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});
vi.mock('../../scripts/gat-source.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../scripts/gat-source.mjs')>();
  return { ...actual, verifyGatSource: vi.fn(actual.verifyGatSource) };
});

const workspace = process.cwd();
const fixture = readFileSync(join(workspace, 'examples/gat/supported-demo.ifc'));
const reportBytes = readFileSync(join(workspace, 'examples/gat/supported-demo.audit.json'));
const blockedBytes = readFileSync(join(workspace, 'examples/gat/unsupported-missing-width.ifc'));
const blockedReport = readFileSync(join(workspace, 'examples/gat/unsupported-missing-width.audit.json'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let temporary: string;

beforeEach(() => {
  mkdirSync(join(workspace, '.stamp'), { recursive: true });
  temporary = mkdtempSync(join(workspace, '.stamp/gat-runtime-test-'));
});
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks();
  const actualSpawn = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  const actualSource = await vi.importActual<typeof import('../../scripts/gat-source.mjs')>('../../scripts/gat-source.mjs');
  vi.mocked(spawn).mockImplementation(actualSpawn.spawn);
  vi.mocked(verifyGatSource).mockImplementation(actualSource.verifyGatSource);
  rmSync(temporary, { recursive: true, force: true });
});

function simulatedRuntime() {
  const root = join(temporary, '.payload/gat-runtime');
  for (const path of ['engine', 'venv/Scripts', 'wheels']) mkdirSync(join(root, path), { recursive: true });
  mkdirSync(join(temporary, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'venv/Scripts/python.exe'), 'test-only');
  writeFileSync(join(root, 'wheels', GAT_ENGINE_PIN.wheel.filename), 'test-only');
  writeFileSync(join(temporary, 'scripts/gat-audit-runner.py'), 'test-only');
  vi.spyOn(process, 'cwd').mockReturnValue(temporary);
  vi.mocked(verifyGatSource).mockImplementation(() => {});
  return root;
}

function simulatedChild(output = reportBytes, code = 0, immediate = true) {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    kill: vi.fn(() => { queueMicrotask(() => child.emit('close', null)); return true; }) });
  vi.mocked(spawn).mockImplementation(() => {
    if (immediate) queueMicrotask(() => { child.stdout.emit('data', output); child.emit('close', code); });
    return child as unknown as ReturnType<typeof spawn>;
  });
  return child;
}

describe('fixed GAT process boundary', () => {
  it('pins the exact demonstration bytes and original source-bound reports', () => {
    expect(hash(fixture)).toBe('8faa1d97998e084d57c0a96c01a35210a76372472ec9c716012ceeb3f9caac3a');
    expect(hash(blockedBytes)).toBe('8446f2aab4c9905681b820dd7af2d3437622f70a2b85ccfa8a2739e511d81a33');
    expect(JSON.parse(reportBytes.toString()).source.sha256).toBe(hash(fixture));
    expect(JSON.parse(blockedReport.toString()).source.sha256).toBe(hash(blockedBytes));
  });

  it.each([Buffer.alloc(0), Buffer.alloc(MAX_GAT_INPUT_BYTES + 1)])('bounds source bytes before looking up a runtime', async (bytes) => {
    await expect(runGatAudit(bytes)).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
  });

  it('fails unavailable without fabricating a result or exposing host paths', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(temporary);
    await expect(runGatAudit(fixture)).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
    expect(existsSync(join(temporary, '.payload'))).toBe(false);
  });

  it('checks the execution copy before starting Python', async () => {
    simulatedRuntime();
    vi.mocked(verifyGatSource).mockImplementation(() => { throw new Error('private host path'); });
    const child = simulatedChild();
    await expect(runGatAudit(fixture)).rejects.toMatchObject({ code: 'ENGINE_INTEGRITY_FAILED' });
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('uses fixed arguments, private scratch, original bytes, and a validated report', async () => {
    const root = simulatedRuntime(); simulatedChild();
    const before = Buffer.from(fixture);
    const result = await runGatAudit(fixture);
    expect(result.reportBytes).toEqual(reportBytes);
    expect(result.runtime).toEqual(GAT_RUNTIME_IDENTITY);
    expect(result.report.pipeline.pipeline_ready).toBe(true);
    expect(fixture).toEqual(before);
    const [executable, args, options] = vi.mocked(spawn).mock.calls.at(-1)!;
    expect(executable).toBe(join(root, 'venv/Scripts/python.exe'));
    expect(args).toEqual(['-I', '-S', '-B', join(temporary, 'scripts/gat-audit-runner.py'), join(root, 'engine'), join(root, 'wheels', GAT_ENGINE_PIN.wheel.filename)]);
    expect(options).toMatchObject({ windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(options).not.toHaveProperty('shell');
    expect(readdirSync(join(root, 'scratch'))).toEqual([]);
    expect(existsSync(join(root, 'audit.lock'))).toBe(false);
  });

  it('preserves original blocked report vocabulary as a completed audit', async () => {
    simulatedRuntime(); simulatedChild(blockedReport, 2);
    const result = await runGatAudit(blockedBytes);
    expect(result.reportBytes).toEqual(blockedReport);
    expect(result.report.pipeline.lowering.status).toBe('BLOCKED');
    expect(result.report.pipeline.compilation.status).toBe('NOT_RUN');
  });

  it.each([['', 0], ['{}', 0], [reportBytes.toString(), 2], [reportBytes.toString(), 1], [reportBytes.toString(), 71], [reportBytes.toString(), 70], [reportBytes.toString(), 72]] as const)(
    'does not treat invalid output or incompatible exit status as success (case %#)', async (output, code) => {
      const root = simulatedRuntime(); simulatedChild(Buffer.from(output), code);
      await expect(runGatAudit(fixture)).rejects.toMatchObject({ code: code === 70 ? 'ENGINE_INTEGRITY_FAILED' : code === 72 ? 'INPUT_TOO_LARGE' : [1, 71].includes(code) ? 'EXECUTION_FAILED' : 'INVALID_REPORT' });
      expect(existsSync(join(root, 'audit.lock'))).toBe(false);
    },
  );

  it('rejects a report that names another source', async () => {
    simulatedRuntime();
    const value = JSON.parse(reportBytes.toString()); value.source.sha256 = 'a'.repeat(64);
    simulatedChild(Buffer.from(JSON.stringify(value)));
    await expect(runGatAudit(fixture)).rejects.toMatchObject({ code: 'INVALID_REPORT' });
  });

  it('retains another writer lock and rejects concurrent execution', async () => {
    const root = simulatedRuntime(); writeFileSync(join(root, 'audit.lock'), 'preserve', { flag: 'wx' });
    await expect(runGatAudit(fixture)).rejects.toMatchObject({ code: 'ENGINE_BUSY' });
    expect(readFileSync(join(root, 'audit.lock'), 'utf8')).toBe('preserve');
  });

  it('kills timed-out execution and releases only its own slot', async () => {
    const root = simulatedRuntime(); const child = simulatedChild(reportBytes, 0, false);
    vi.useFakeTimers();
    const pending = expect(runGatAudit(fixture)).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(GAT_TIMEOUT_MS);
    await pending;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(existsSync(join(root, 'audit.lock'))).toBe(false);
  });

  it('bounds combined process output and never relays stderr', async () => {
    simulatedRuntime(); const child = simulatedChild(reportBytes, 0, false);
    const pending = expect(runGatAudit(fixture)).rejects.toMatchObject({ code: 'EXECUTION_FAILED' });
    child.stderr.emit('data', Buffer.alloc(2 * 1024 * 1024 + 1, 65));
    await pending;
    expect(child.kill).toHaveBeenCalledOnce();
  });
});

describe.skipIf(process.env.GAT_INTEGRATION !== '1')('real pinned GAT audit (operator bootstrap required)', () => {
  it('proves cached scientific bytecode is never executed by the reviewed source loader', () => {
    expect(() => execFileSync(join(workspace, '.payload/gat-runtime/venv/Scripts/python.exe'),
      ['-I', '-S', '-B', join(workspace, 'tests/python/test_gat_source_loader.py'), '-v'], {
        cwd: workspace, windowsHide: true, timeout: 10_000, maxBuffer: 32 * 1024,
        env: { NODE_ENV: 'test', SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
          TEMP: temporary, TMP: temporary, TMPDIR: temporary },
      })).not.toThrow();
  }, 15_000);

  it('runs the exact supported and unsupported models without altering source bytes', async () => {
    const before = Buffer.from(fixture);
    const supported = await runGatAudit(fixture);
    expect(supported.reportBytes).toEqual(reportBytes);
    expect(supported.report.inventory.supported_product_count).toBe(10);
    expect(supported.runtime).toEqual(GAT_RUNTIME_IDENTITY);
    const blocked = await runGatAudit(blockedBytes);
    expect(blocked.reportBytes).toEqual(blockedReport);
    expect(blocked.report.pipeline.pipeline_ready).toBe(false);
    expect(fixture).toEqual(before);
    expect(readFileSync(join(workspace, 'examples/gat/supported-demo.ifc'))).toEqual(before);
  }, 60_000);

  it('returns an original structured parse blocker rather than inventing a world', async () => {
    const result = await runGatAudit(Buffer.from('not an IFC file'));
    expect(result.report.parse.status).toBe('BLOCKED');
    expect(result.report.pipeline.pipeline_ready).toBe(false);
    expect(result.report.pipeline.world_digest).toBeNull();
  }, 40_000);

  it('refuses excessive supported product scope before dense compilation', async () => {
    const extra = Array.from({ length: 55 }, (_, index) => `#${1000 + index}=IFCWALL('scope-${index}',$,'Extra',$,$,$,$,$);`).join('\n');
    const bytes = Buffer.from(fixture.toString('utf8').replace('ENDSEC;\nEND-ISO', `${extra}\nENDSEC;\nEND-ISO`));
    expect(bytes.length).toBeLessThan(MAX_GAT_INPUT_BYTES);
    await expect(runGatAudit(bytes)).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
  }, 40_000);
});

describe('source-copy pin verification without importing engine code', () => {
  async function pinnedFixture() {
    const actual = await vi.importActual<typeof import('../../scripts/gat-source.mjs')>('../../scripts/gat-source.mjs');
    mkdirSync(join(temporary, 'gat'), { recursive: true });
    const code = '# committed test module\n';
    writeFileSync(join(temporary, 'gat/__init__.py'), code);
    const sourceFiles = { 'gat/__init__.py': hash(Buffer.from(code)) };
    const pin = { sourceFiles, sourceTreeDigest: `sha256:${hash(Buffer.from(JSON.stringify(sourceFiles)))}` };
    return { verify: () => actual.verifyGatSource(temporary, pin), path: join(temporary, 'gat/__init__.py'), code };
  }

  it('accepts exact committed source and explicit LF normalization', async () => {
    const value = await pinnedFixture();
    expect(value.verify).not.toThrow();
    writeFileSync(value.path, value.code.replace(/\n/g, '\r\n'));
    expect(value.verify).not.toThrow();
  });

  it('rejects source edits without repairing or overwriting them', async () => {
    const value = await pinnedFixture();
    writeFileSync(value.path, '# locally edited module\n');
    expect(value.verify).toThrow('Source differs from pin');
    expect(readFileSync(value.path, 'utf8')).toBe('# locally edited module\n');
  });

  it.each(['unreviewed.py', '__init__.pyc'])('rejects unpinned importable file %s', async (name) => {
    const value = await pinnedFixture();
    writeFileSync(join(temporary, 'gat', name), 'preserved unpinned input');
    expect(value.verify).toThrow('Unpinned source entry');
    expect(readFileSync(join(temporary, 'gat', name), 'utf8')).toBe('preserved unpinned input');
  });
});
