import { createHash } from 'node:crypto';

import type {
  ContentAddressedStore,
  ContentAddressedWrite,
  EvidenceCaptureRequest,
  EvidenceCaptureResult,
} from './contracts';

function instant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be an ISO 8601 instant.`);
  return parsed;
}

export function byteDigest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function storageKeyFor(contentDigest: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(contentDigest)) throw new Error('contentDigest must be a SHA-256 digest.');
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
  if (request.bytes.byteLength === 0) throw new Error('Evidence capture requires non-empty bytes.');
  if (request.mediaType.trim().length === 0) throw new Error('Evidence capture requires a media type.');

  const storage = request.store.put(request.bytes);
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
    receiptId: `${request.workflowId}:receipt`,
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
  const { evidence, receipt } = result;
  const bytes = store.get(evidence.contentDigest);
  return Boolean(
    bytes &&
    evidence.kind === 'BinaryEvidence' &&
    evidence.schema === 'notations.binary-evidence.v1' &&
    receipt.kind === 'StorageReceipt' &&
    receipt.schema === 'notations.storage-receipt.v1' &&
    receipt.evidenceId === evidence.evidenceId &&
    receipt.contentDigest === evidence.contentDigest &&
    receipt.storageKey === evidence.storageKey &&
    bytes.byteLength === evidence.byteLength &&
    byteDigest(bytes) === evidence.contentDigest &&
    storageKeyFor(evidence.contentDigest) === evidence.storageKey,
  );
}
