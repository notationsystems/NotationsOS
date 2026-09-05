import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProductionBody, PRODUCTION_BODY_TIMEOUT_MS } from './http';

afterEach(() => { vi.useRealTimers(); });
function streamed(body: ReadableStream<Uint8Array>) {
  return new Request('http://localhost:3000/api/production', { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' } as RequestInit & { duplex: 'half' });
}
describe('bounded production body reader', () => {
  it('rejects a body that does not finish within the total read deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const input = streamed(new ReadableStream({ cancel }));
    const result = expect(readProductionBody(input)).rejects.toMatchObject({ code: 'BODY_TIMEOUT', status: 408 });
    await vi.advanceTimersByTimeAsync(PRODUCTION_BODY_TIMEOUT_MS);
    await result;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('keeps the size error if the caller stream cannot be cancelled', async () => {
    const input = streamed(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4097)); }, cancel() { throw new Error('private failure'); } }));
    await expect(readProductionBody(input, 4096)).rejects.toMatchObject({ code: 'BODY_TOO_LARGE', status: 413 });
  });
  it('sanitizes broken stream errors', async () => {
    const input = streamed(new ReadableStream({ start(controller) { controller.error(new Error('private diagnostic')); } }));
    await expect(readProductionBody(input)).rejects.toMatchObject({ code: 'INVALID_REQUEST', message: 'The request body could not be read.' });
  });
});
