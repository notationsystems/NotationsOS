import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PRODUCTION_WORKER_BYTES, PRODUCTION_WORKER_TIMEOUT_MS, runProductionWork } from './worker';

const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: native.spawn }));
class WorkerChild extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}
let children: WorkerChild[];
beforeEach(() => { children = []; native.spawn.mockImplementation(() => { const child = new WorkerChild(); children.push(child); return child; }); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const completed = { schema: 'payload.production-worker-result.v1', ok: true, value: { schema: 'payload.production-result.v1', canonicalAdmission: false } };
function close(child: WorkerChild, value: unknown = completed, code: number | null = 0) {
  child.stdout.emit('data', Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
  child.emit('close', code);
}
describe('bounded local production process adapter', () => {
  it('uses fixed Node and entry paths, a bounded stdin envelope, no shell and no caller flags', async () => {
    const command = { operation: 'ACQUIRE', requestId: 'r1' };
    const result = runProductionWork({ action: 'EXECUTE', command });
    expect(native.spawn).toHaveBeenCalledWith(process.execPath, [expect.stringMatching(/[\\/]\.stamp[\\/]production-worker\.mjs$/)],
      expect.objectContaining({ windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }));
    expect(JSON.parse(children[0].stdin.end.mock.calls[0][0])).toEqual({ schema: 'payload.production-worker.v1', action: 'EXECUTE', command });
    close(children[0]);
    expect(await result).toEqual(completed.value);
  });
  it('rejects excessive input before spawn', () => {
    expect(() => runProductionWork({ action: 'EXECUTE', command: { body: 'x'.repeat(MAX_PRODUCTION_WORKER_BYTES) } })).toThrow('exceeds 2 MiB');
    expect(native.spawn).not.toHaveBeenCalled();
  });
  it('preserves typed recovery errors, not a successful stage', async () => {
    const work = runProductionWork({ action: 'CATALOG' });
    const details = { outputs: [], remediation: ['Inspect the original request.'] };
    const checked = expect(work).rejects.toMatchObject({ code: 'OPERATION_INCOMPLETE', status: 409, details });
    close(children[0], { schema: completed.schema, ok: false, error: { code: 'OPERATION_INCOMPLETE', message: 'An incomplete request was retained.', status: 409, details } }, 1);
    await checked;
  });
  it.each([
    ['private invalid JSON', 0], [completed, 1], ['', null],
    [{ schema: completed.schema, ok: false, error: { code: 'bad/path', message: 'private', status: 500 } }, 1],
    [{ schema: completed.schema, ok: true }, 0],
  ])('refuses malformed or inconsistent worker completion %#', async (output, code) => {
    const work = runProductionWork({ action: 'CATALOG' });
    const checked = expect(work).rejects.toMatchObject({ code: 'WORKER_UNAVAILABLE', message: expect.not.stringContaining('private') });
    children[0].stderr.emit('data', Buffer.from('private engine paths and diagnostics'));
    close(children[0], output, code as number | null);
    await checked;
  });
  it.each(['stdout', 'stderr'] as const)('bounds %s and kills the worker', async (stream) => {
    const work = runProductionWork({ action: 'CATALOG' });
    const checked = expect(work).rejects.toMatchObject({ status: 503 });
    children[0][stream].emit('data', Buffer.alloc(MAX_PRODUCTION_WORKER_BYTES + 1));
    await checked;
    expect(children[0].kill).toHaveBeenCalledOnce();
    children[0].emit('close', 1);
  });
  it('bounds concurrency and retains slots until timed-out workers have actually exited', async () => {
    vi.useFakeTimers();
    const first = runProductionWork({ action: 'CATALOG' });
    const second = runProductionWork({ action: 'CATALOG' });
    expect(() => runProductionWork({ action: 'CATALOG' })).toThrow('worker limit');
    const checks = [expect(first).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT', status: 504 }), expect(second).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT', status: 504 })];
    await vi.advanceTimersByTimeAsync(PRODUCTION_WORKER_TIMEOUT_MS);
    await Promise.all(checks);
    expect(() => runProductionWork({ action: 'CATALOG' })).toThrow('worker limit');
    for (const child of children) child.emit('close', null);
    const next = runProductionWork({ action: 'CATALOG' });
    close(children[2]);
    await next;
  });
  it('releases a slot after synchronous spawn failure without exposing diagnostics', async () => {
    native.spawn.mockImplementationOnce(() => { throw new Error('private path'); });
    await expect(runProductionWork({ action: 'CATALOG' })).rejects.toMatchObject({ code: 'WORKER_UNAVAILABLE', status: 503 });
    const work = runProductionWork({ action: 'CATALOG' });
    close(children[0]);
    await work;
  });
  it('sanitizes child and stdin failures', async () => {
    for (const stream of ['child', 'stdin'] as const) {
      const work = runProductionWork({ action: 'CATALOG' });
      const child = children[children.length - 1];
      const checked = expect(work).rejects.toMatchObject({ code: 'WORKER_UNAVAILABLE' });
      (stream === 'child' ? child : child.stdin).emit('error', new Error('private'));
      child.emit('close', 1);
      await checked;
    }
  });
});
