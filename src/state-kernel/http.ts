import { NextResponse } from 'next/server';
import { requireLocalRequest } from '../coordination/http';
import { StateKernelError } from './errors';
import { MAX_KERNEL_INPUT_BYTES } from './runtime';
import { stateKernelEnabled } from './store';

export function stateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Notation-State': 'local-development-v1' } });
}
export function stateError(error: unknown) {
  const failure = error instanceof StateKernelError ? error :
    new StateKernelError('LOCAL_STATE_UNAVAILABLE', 'Local notation storage is unavailable. Save is not confirmed; retain the draft and retry the identical batch.', 503);
  return stateJson({ error: { code: failure.code, message: failure.message } }, failure.status);
}
export function requireStateRequest(request: Request, writing = false) {
  if (writing && !stateKernelEnabled()) throw new StateKernelError('READ_ONLY', 'Start npm run dev:state-kernel to enable the local notation workspace.', 403);
  try { requireLocalRequest(request); }
  catch { throw new StateKernelError('LOCAL_ONLY', 'Use the notation workspace from the same loopback origin.', 403); }
}
export async function readStateRequest(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new StateKernelError('INVALID_CONTENT_TYPE', 'Send application/json.', 415);
  }
  if (!request.body) throw new StateKernelError('INVALID_REQUEST', 'A command batch is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_KERNEL_INPUT_BYTES) {
        try { await reader.cancel(); } catch { /* Cancellation failure must not change the size refusal. */ }
        throw new StateKernelError('BODY_TOO_LARGE', 'Command batches are limited to 2 MiB.', 413);
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new StateKernelError('INVALID_REQUEST', 'The command batch must be valid UTF-8 JSON.'); }
}
