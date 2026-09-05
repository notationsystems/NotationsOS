import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateKernel, MAX_KERNEL_INPUT_BYTES } from './runtime';
import { emptyNotationState, type KernelCommand } from './types';

const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: native.spawn }));
class NativeChild extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}
let child: NativeChild;
beforeEach(() => { child = new NativeChild(); native.spawn.mockReturnValue(child); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('fixed native state-kernel bridge', () => {
  it('runs the fixed binary without a shell and sends only the typed replay envelope on stdin', async () => {
    const work = evaluateKernel([]);
    expect(native.spawn).toHaveBeenCalledWith(expect.stringMatching(/native[\\/]state-kernel[\\/]target[\\/]debug[\\/]notations-state-kernel(?:\.exe)?$/), [],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    expect(JSON.parse(child.stdin.end.mock.calls[0][0])).toEqual({ schema: 'notations.state-kernel-request.v1', commands: [] });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ ok: true, state: emptyNotationState() })));
    child.emit('close', 0);
    expect(await work).toEqual(emptyNotationState());
  });

  it('returns fixed structured domain errors without converting them to successful state', async () => {
    const work = evaluateKernel([]);
    const checked = expect(work).rejects.toMatchObject({ code: 'INVALID_REQUEST', status: 400, message: 'Unsupported command.' });
    child.stdout.emit('data', Buffer.from(JSON.stringify({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Unsupported command.' } })));
    child.emit('close', 1);
    await checked;
  });

  it.each([
    { output: 'not JSON /private/path', code: 1 },
    { output: JSON.stringify({ ok: true, state: emptyNotationState() }), code: 1 },
    { output: JSON.stringify({ ok: true, state: { ...emptyNotationState(), revision: 99 } }), code: 0 },
    { output: JSON.stringify({ ok: false, error: { code: '/private/path', message: 'private details' } }), code: 1 },
    { output: JSON.stringify({ ok: false, error: { code: 'ERROR', message: 'x'.repeat(257) } }), code: 1 },
    { output: '', code: null },
  ])('refuses malformed, incomplete or inconsistent subprocess responses %#', async ({ output, code }) => {
    const work = evaluateKernel([]);
    const checked = expect(work).rejects.toMatchObject({ code: 'KERNEL_UNAVAILABLE', status: 503 });
    child.stdout.emit('data', Buffer.from(output));
    child.stderr.emit('data', Buffer.from('/private/native/path and source content'));
    child.emit('close', code);
    await checked;
    expect(child.kill).toHaveBeenCalled();
  });

  it('bounds request bytes before starting a child', () => {
    const command: KernelCommand = { kind: 'CREATE_NOTATION', commandId: 'c1', notation: { id: 'n1', title: 'Title', body: 'x'.repeat(MAX_KERNEL_INPUT_BYTES) } };
    expect(() => evaluateKernel([command])).toThrow('The command history exceeds 2 MiB.');
    expect(native.spawn).not.toHaveBeenCalled();
  });

  it.each(['stdout', 'stderr'] as const)('kills excessive %s output and does not expose it', async (stream) => {
    const work = evaluateKernel([]);
    const checked = expect(work).rejects.toMatchObject({ code: 'KERNEL_UNAVAILABLE' });
    child[stream].emit('data', Buffer.alloc(4 * 1024 * 1024 + 1, 120));
    await checked;
    expect(child.kill).toHaveBeenCalledOnce();
    child.emit('close', 1);
  });

  it('times out a stalled process and reports no save confirmation', async () => {
    vi.useFakeTimers();
    const work = evaluateKernel([]);
    const checked = expect(work).rejects.toMatchObject({ code: 'KERNEL_UNAVAILABLE', status: 503 });
    await vi.advanceTimersByTimeAsync(10_000);
    await checked;
    expect(child.kill).toHaveBeenCalledOnce();
    child.emit('close', null);
  });

  it.each(['spawn', 'stdin'] as const)('redacts %s errors and closes the process', async (stream) => {
    const work = evaluateKernel([]);
    const checked = expect(work).rejects.toMatchObject({ code: 'KERNEL_UNAVAILABLE', message: expect.not.stringContaining('private') });
    (stream === 'spawn' ? child : child.stdin).emit('error', new Error('/private/path EACCES'));
    await checked;
    expect(child.kill).toHaveBeenCalledOnce();
    child.emit('close', 1);
  });
});
