import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { requireLocalRequest } from '../coordination/http';
import { ProductionError } from './errors';

export const MAX_PRODUCTION_BODY_BYTES = 2 * 1024 * 1024;
export const PRODUCTION_BODY_TIMEOUT_MS = 10_000;
export const productionEnabled = () => process.env.PAYLOAD_PRODUCTION_LOCAL === '1';
/** Operator configuration only. HTTP requests never select a storage root. */
export const productionRoot = () => process.env.PAYLOAD_PRODUCTION_DIR ?? join(process.cwd(), '.payload', 'evidence');

export function productionJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Payload-Production': 'local-development-v1',
    'X-Content-Type-Options': 'nosniff',
  } });
}

export function productionError(error: unknown) {
  const failure = error instanceof ProductionError ? error : new ProductionError('LOCAL_PRODUCTION_UNAVAILABLE',
    'The local operation could not be confirmed. Inspect retained outputs before starting another request.', 503);
  return productionJson({ schema: 'payload.production-error.v1', mode: 'LOCAL_DEVELOPMENT', canonicalAdmission: false,
    error: { code: failure.code, message: failure.message, ...(failure.details === undefined ? {} : { details: failure.details }) } }, failure.status);
}

/** All operational reads and writes require explicit local mode and the same loopback origin. */
export function requireProductionRequest(request: Request) {
  if (!productionEnabled()) throw new ProductionError('LOCAL_MODE_DISABLED', 'Start the explicitly enabled local production service first.', 403);
  try { requireLocalRequest(request); }
  catch { throw new ProductionError('LOCAL_ONLY', 'Use the production inspector from the same loopback origin.', 403); }
}

export async function readProductionBody(request: Request, maxBytes = MAX_PRODUCTION_BODY_BYTES): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ProductionError('INVALID_CONTENT_TYPE', 'Send application/json.', 415);
  }
  if (!request.body) throw new ProductionError('INVALID_REQUEST', 'A versioned operation request is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProductionError('BODY_TIMEOUT', 'The request body did not complete within 10 seconds.', 408)), PRODUCTION_BODY_TIMEOUT_MS);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) throw new ProductionError('BODY_TOO_LARGE', 'The operation request exceeds its byte limit.', 413);
      chunks.push(chunk.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => { /* A broken caller stream must not replace the bounded failure. */ });
    if (error instanceof ProductionError) throw error;
    throw new ProductionError('INVALID_REQUEST', 'The request body could not be read.');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new ProductionError('INVALID_REQUEST', 'The operation must be valid UTF-8 JSON.'); }
}
