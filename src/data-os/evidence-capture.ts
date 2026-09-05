import { createHash } from 'node:crypto';

import type {
  ContentAddressedStore,
  ContentAddressedWrite,
  EvidenceCaptureRequest,
  EvidenceCaptureResult,
} from './contracts';
import { evaluateSourceUse } from './source-policy';
import { parseISOInstant as instant, requireIdentifier, requireRecord, requireText } from './validation';

export function byteDigest(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) throw new Error('Content bytes must be a Buffer or Uint8Array.');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function storageKeyFor(contentDigest: string): string {
  if (typeof contentDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(contentDigest)) throw new Error('contentDigest must be a SHA-256 digest.');
  const hex = contentDigest.slice('sha256:'.length);
  return `sha256/${hex.slice(0, 2)}/${hex}`;
}

/** A create-only in-memory store for local development and contract tests. */
export class InMemoryContentAddressedStore implements ContentAddressedStore {
  #objects = new Map<string, Uint8Array>();

  put(bytes: Uint8Array): ContentAddressedWrite {
    const contentDigest = byteDigest(bytes);
    if (!this.#objects.has(contentDigest)) this.#objects.set(contentDigest, new Uint8Array(bytes));
    return { contentDigest, byteLength: bytes.byteLength, storageKey: storageKeyFor(contentDigest) };
  }

  get(contentDigest: string): Uint8Array | undefined {
    const bytes = this.#objects.get(contentDigest);
    return bytes ? new Uint8Array(bytes) : undefined;
  }
}

/**
 * Captures bytes only after the exact source-policy result explicitly allows
 * INGEST. Storage adapters are responsible for physical object-lock and
 * retention enforcement; this contract binds the source, bytes, and receipt.
 */
export function captureEvidence(request: EvidenceCaptureRequest): EvidenceCaptureResult {
  requireRecord(request, 'evidenceCaptureRequest');
  requireIdentifier(request.evidenceId, 'evidenceId');
  requireIdentifier(request.workflowId, 'workflowId');
  const receiptId = requireIdentifier(`${request.workflowId}:receipt`, 'receiptId');
  requireRecord(request.ingestDecision, 'ingestDecision');
  requireRecord(request.ingestDecision.request, 'ingestDecision.request');
  requireRecord(request.sourceRegistration, 'sourceRegistration');
  if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0) throw new Error('Evidence capture requires non-empty bytes.');
  requireText(request.mediaType, 'mediaType', 256);
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:;[^\r\n]{1,200})?$/i.test(request.mediaType)) {
    throw new Error('Evidence capture requires a valid media type.');
  }
  if (!request.store || typeof request.store.put !== 'function' || typeof request.store.get !== 'function') {
    throw new Error('Evidence capture requires a content-addressed store with put and get.');
  }
  const capturedAt = instant(request.capturedAt, 'capturedAt');
  const storedAt = instant(request.storedAt, 'storedAt');
  if (capturedAt > storedAt) throw new Error('Evidence capture cannot be stored before it is captured.');
  if (request.ingestDecision.state !== 'ALLOWED' || request.ingestDecision.request.operation !== 'INGEST') {
    throw new Error('Evidence capture requires an explicitly ALLOWED INGEST decision.');
  }
  if (request.ingestDecision.registrationId !== request.sourceRegistration.registrationId ||
      request.ingestDecision.sourceId !== request.sourceRegistration.sourceId) {
    throw new Error('Evidence capture decision does not belong to the source registration.');
  }
  if (request.ingestDecision.request.requestedAt !== request.capturedAt || request.ingestDecision.evaluatedAt !== request.capturedAt) {
    throw new Error('The INGEST decision must be requested and evaluated at the exact capture time.');
  }
  const expected = evaluateSourceUse(request.sourceRegistration, {
    ...request.ingestDecision.request, requestId: request.ingestDecision.requestId,
    registrationId: request.sourceRegistration.registrationId,
  });
  if (expected.state !== 'ALLOWED' || Object.keys(request.ingestDecision).length !== Object.keys(expected).length ||
      Object.keys(request.ingestDecision.request).length !== Object.keys(expected.request).length ||
      (Object.keys(expected) as Array<keyof typeof expected>).some((field) => field !== 'request' && JSON.stringify(expected[field]) !== JSON.stringify(request.ingestDecision[field])) ||
      (Object.keys(expected.request) as Array<keyof typeof expected.request>).some((field) => expected.request[field] !== request.ingestDecision.request[field])) {
    throw new Error('The INGEST decision does not recompute from the declared source policy.');
  }

  const content = new Uint8Array(request.bytes);
  const digest = byteDigest(content);
  const storage = request.store.put(content);
  if (!storage || storage.contentDigest !== digest || storage.byteLength !== content.byteLength || storage.storageKey !== storageKeyFor(digest)) {
    throw new Error('The object-store write response does not match the captured bytes.');
  }
  const readback = request.store.get(digest);
  if (!(readback instanceof Uint8Array) || readback.byteLength !== content.byteLength || byteDigest(readback) !== digest) {
    throw new Error('The captured evidence failed object-store readback verification.');
  }
  const evidence = {
    kind: 'BinaryEvidence' as const,
    schema: 'notations.binary-evidence.v1' as const,
    evidenceId: request.evidenceId,
    mediaType: request.mediaType,
    contentDigest: storage.contentDigest,
    byteLength: storage.byteLength,
    storageKey: storage.storageKey,
    sourceId: request.sourceRegistration.sourceId,
    capturedAt: request.capturedAt,
    sourceTruthClaimed: false as const,
  };
  const receipt = {
    kind: 'StorageReceipt' as const,
    schema: 'notations.storage-receipt.v1' as const,
    receiptId,
    evidenceId: request.evidenceId,
    contentDigest: storage.contentDigest,
    storageKey: storage.storageKey,
    storedAt: request.storedAt,
  };
  return { evidence, receipt };
}

/** Recalculates a receipt against the store without trusting its stored digest. */
export function verifyEvidenceCapture(
  result: EvidenceCaptureResult,
  store: Pick<ContentAddressedStore, 'get'>,
): boolean {
  try {
    requireRecord(result, 'captureResult');
    const { evidence, receipt } = result;
    requireRecord(evidence, 'evidence');
    requireRecord(receipt, 'receipt');
    requireIdentifier(evidence.evidenceId, 'evidenceId');
    requireIdentifier(evidence.sourceId, 'sourceId');
    requireIdentifier(receipt.receiptId, 'receiptId');
    requireText(evidence.mediaType, 'mediaType', 256);
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:;[^\r\n]{1,200})?$/i.test(evidence.mediaType) ||
        instant(evidence.capturedAt, 'capturedAt') > instant(receipt.storedAt, 'storedAt') ||
        !Number.isSafeInteger(evidence.byteLength) || evidence.byteLength <= 0 || evidence.sourceTruthClaimed !== false ||
        !store || typeof store.get !== 'function') return false;
    if (storageKeyFor(evidence.contentDigest) !== evidence.storageKey) return false;
    const bytes = store.get(evidence.contentDigest);
    return Boolean(
      bytes instanceof Uint8Array &&
      evidence.kind === 'BinaryEvidence' &&
      evidence.schema === 'notations.binary-evidence.v1' &&
      receipt.kind === 'StorageReceipt' &&
      receipt.schema === 'notations.storage-receipt.v1' &&
      receipt.evidenceId === evidence.evidenceId &&
      receipt.contentDigest === evidence.contentDigest &&
      receipt.storageKey === evidence.storageKey &&
      bytes.byteLength === evidence.byteLength &&
      byteDigest(bytes) === evidence.contentDigest,
    );
  } catch { return false; }
}
