import { NextResponse } from 'next/server';
import { CoordinationError } from '@/coordination/ledger';
import { executeCoordinationCommand, getCoordinationSnapshot, localCoordinationEnabled } from '@/coordination/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 16 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Payload-Fixture-Only': 'true', 'X-Payload-Coordination': 'sandbox-v1' } });
}
function errorResponse(error: unknown) {
  if (error instanceof CoordinationError) return json({ fixture_only: true, error: error.code, detail: error.message }, error.status);
  return json({ fixture_only: true, error: 'LOCAL_STORE_UNAVAILABLE', detail: 'The local coordination store is unavailable. No successful write is confirmed; retry the same request id after recovery.' }, 503);
}

/** Local sandbox only: callers simulate registered authors; this is not production authentication. */
function localRequest(request: Request) {
  const url = new URL(request.url);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'];
  if (!loopback.includes(url.hostname)) throw new CoordinationError('LOCAL_ONLY', 'The local coordination sandbox must run on loopback.', 403);
  const host = request.headers.get('host');
  // Next can normalize request.url to localhost while the client used 127.0.0.1.
  // Validate Host independently, then compare browser Origin to the actual client-facing host.
  let clientUrl: URL;
  try { clientUrl = new URL(`${url.protocol}//${host ?? url.host}`); }
  catch { throw new CoordinationError('LOCAL_ONLY', 'The request host must name the loopback service.', 403); }
  if (!loopback.includes(clientUrl.hostname) || clientUrl.port !== url.port || clientUrl.username || clientUrl.password || clientUrl.pathname !== '/' || clientUrl.search || clientUrl.hash) {
    throw new CoordinationError('LOCAL_ONLY', 'The request host must name the loopback service.', 403);
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== clientUrl.origin) throw new CoordinationError('ORIGIN_MISMATCH', 'Use the board from the same local origin.', 403);
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) throw new CoordinationError('ORIGIN_MISMATCH', 'Cross-origin board access is unavailable.', 403);
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new CoordinationError('INVALID_CONTENT_TYPE', 'Send application/json.', 415);
  if (!request.body) throw new CoordinationError('INVALID_JSON', 'A command body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new CoordinationError('BODY_TOO_LARGE', 'Commands are limited to 16 KiB.', 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new CoordinationError('INVALID_JSON', 'The command body must be valid JSON.'); }
}

export async function GET(request: Request) {
  try {
    if (localCoordinationEnabled()) localRequest(request);
    return json(await getCoordinationSnapshot());
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (!localCoordinationEnabled()) throw new CoordinationError('READ_ONLY', 'Start npm run dev:coordination to use the local board.', 403);
    localRequest(request);
    return json(await executeCoordinationCommand(await body(request)));
  } catch (error) { return errorResponse(error); }
}
