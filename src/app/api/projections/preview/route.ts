import { NextResponse } from 'next/server';
import { compileProjection } from '@/projection/compile';
import { ProjectionError } from '@/projection/spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 32 * 1024;

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Payload-Fixture-Only': 'true' } });
}
function refusal(error: string, status: number) { return json({ fixture_only: true, error }, status); }

/** Read-only POST because the exact selection is structured; nothing is saved or dispatched. */
export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return refusal('INVALID_CONTENT_TYPE', 415);
  if (!request.body) return refusal('INVALID_JSON', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BYTES) {
        try { await reader.cancel(); } catch { /* Cancellation is best effort; the measured limit remains decisive. */ }
        return refusal('BODY_TOO_LARGE', 413);
      }
      chunks.push(chunk.value);
    }
  } catch { return refusal('INVALID_JSON', 400); }
  finally { reader.releaseLock(); }
  let input: unknown;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { return refusal('INVALID_JSON', 400); }
  try { return json(compileProjection(input)); }
  catch (error) {
    if (error instanceof ProjectionError) {
      const status = error.code === 'SOURCE_INTEGRITY_FAILED' ? 503 :
        error.code === 'SOURCE_VERSION_MISMATCH' ? 409 :
          ['SOURCE_NOT_AVAILABLE', 'SELECTION_NOT_AVAILABLE'].includes(error.code) ? 404 : 400;
      return refusal(error.code, status);
    }
    return refusal('PROJECTION_UNAVAILABLE', 503);
  }
}
