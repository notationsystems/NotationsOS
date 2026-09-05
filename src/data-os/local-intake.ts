import { join, resolve } from 'node:path';
import type { EvidenceCaptureResult, SourceRegistration, SourceUseDecision } from './contracts';
import { byteDigest, captureEvidence, storageKeyFor, verifyEvidenceCapture } from './evidence-capture';
import { FileContentAddressedStore, MAX_EVIDENCE_BYTES } from './file-object-store';
import { publishImmutableFile, readImmutableFile } from './local-files';
import { encodeLocalRecord as encoded, exactFields, localJson, localRecordDigest as digest } from './local-record';
import { evaluateSourceUse, validateSourceRegistration } from './source-policy';
import { parseISOInstant, requireIdentifier, requireText } from './validation';

export const MAX_INTAKE_RECORD_BYTES = 64 * 1024;

/** An operator-declared local policy, not a signed Bench authorization closure. */
export interface LocalIntakeManifest {
  schema: 'payload.local-intake-request.v1';
  acquisitionId: string;
  evidenceId: string;
  sourceRegistration: SourceRegistration;
  purpose: string;
  mediaType: string;
  capturedAt: string;
}

export interface LocalAcquisition {
  schema: 'payload.local-acquisition.v1';
  mode: 'LOCAL_DEVELOPMENT';
  policyAuthority: 'OPERATOR_DECLARATION';
  sourceTruthClaimed: false;
  canonicalAdmission: false;
  request: { manifest: LocalIntakeManifest; contentDigest: string; byteLength: number };
  requestDigest: string;
  decision: SourceUseDecision;
  capture: EvidenceCaptureResult;
  digest: string;
}

export function parseLocalIntakeManifest(value: unknown): LocalIntakeManifest {
  // Bound and snapshot the declaration before validation or any storage side effect.
  const candidate: unknown = JSON.parse(encoded(value).toString('utf8'));
  exactFields(candidate, ['schema', 'acquisitionId', 'evidenceId', 'sourceRegistration', 'purpose', 'mediaType', 'capturedAt']);
  if (candidate.schema !== 'payload.local-intake-request.v1') throw new Error('Unsupported local intake request schema.');
  requireIdentifier(candidate.acquisitionId, 'acquisitionId');
  requireIdentifier(candidate.evidenceId, 'evidenceId');
  requireText(candidate.purpose, 'purpose', 180);
  requireText(candidate.mediaType, 'mediaType', 180);
  parseISOInstant(candidate.capturedAt, 'capturedAt');
  exactFields(candidate.sourceRegistration,
    ['registrationId', 'sourceId', 'displayName', 'sourceClass', 'licenseId', 'policyVersion', 'effectiveFrom', 'permittedPurposes', 'allowedOperations', 'allowedAudiences', 'retention'],
    ['effectiveUntil', 'prohibitedPurposes', 'approvalRequiredOperations']);
  exactFields(candidate.sourceRegistration.retention, ['mode'], ['until']);
  validateSourceRegistration(candidate.sourceRegistration as unknown as SourceRegistration);
  return candidate as unknown as LocalIntakeManifest;
}

function decisionFor(manifest: LocalIntakeManifest): SourceUseDecision {
  const decision = evaluateSourceUse(manifest.sourceRegistration, {
    requestId: `${manifest.acquisitionId}:ingest`, registrationId: manifest.sourceRegistration.registrationId,
    purpose: manifest.purpose, operation: 'INGEST', audience: 'INTERNAL', requestedAt: manifest.capturedAt,
  });
  if (decision.state !== 'ALLOWED') throw new Error(`Local intake requires ALLOWED INTERNAL INGEST: ${decision.reasons.join(', ')}.`);
  return decision;
}

function locations(acquisitionId: string) {
  requireIdentifier(acquisitionId, 'acquisitionId');
  const key = byteDigest(Buffer.from(acquisitionId, 'utf8')).slice('sha256:'.length);
  return ['acquisitions', `${key}.json`];
}

/** Local evidence rail only. No source transport, canonical writes or release activation. */
export class LocalEvidenceIntake {
  readonly root: string;
  readonly objects: FileContentAddressedStore;

  constructor(root: string) {
    requireText(root, 'intake root');
    this.root = resolve(root);
    this.objects = new FileContentAddressedStore(join(this.root, 'objects'));
  }

  capture(value: unknown, bytes: Uint8Array, storedAt = new Date().toISOString()): { status: 'CREATED' | 'EXISTING'; acquisition: LocalAcquisition } {
    const manifest = parseLocalIntakeManifest(value);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_EVIDENCE_BYTES) throw new Error('Intake requires 1 byte to 8 MiB of local evidence.');
    const content = Buffer.from(bytes);
    const decision = decisionFor(manifest);
    const request = { manifest, contentDigest: byteDigest(content), byteLength: content.byteLength };
    const requestDigest = digest(request);
    const existing = this.inspect(manifest.acquisitionId);
    if (existing) {
      if (existing.requestDigest !== requestDigest) throw new Error('ACQUISITION_CONFLICT: this acquisition id already names a different request.');
      return { status: 'EXISTING', acquisition: existing };
    }
    if (parseISOInstant(storedAt, 'storedAt') < parseISOInstant(manifest.capturedAt, 'capturedAt')) throw new Error('Storage cannot precede capture.');
    // Preflight the full receipt shape without writing bytes; oversized metadata must fail before storage.
    const preflight = captureEvidence({ evidenceId: manifest.evidenceId, workflowId: manifest.acquisitionId,
      sourceRegistration: manifest.sourceRegistration, ingestDecision: decision, bytes: content,
      mediaType: manifest.mediaType, capturedAt: manifest.capturedAt, storedAt,
      store: { put: () => ({ contentDigest: request.contentDigest, byteLength: content.byteLength, storageKey: storageKeyFor(request.contentDigest) }), get: () => content },
    });
    const payload = { schema: 'payload.local-acquisition.v1' as const, mode: 'LOCAL_DEVELOPMENT' as const,
      policyAuthority: 'OPERATOR_DECLARATION' as const, sourceTruthClaimed: false as const, canonicalAdmission: false as const,
      request, requestDigest, decision, capture: preflight };
    const acquisition: LocalAcquisition = { ...payload, digest: digest(payload) };
    const record = encoded(acquisition);
    const stored = captureEvidence({ evidenceId: manifest.evidenceId, workflowId: manifest.acquisitionId,
      sourceRegistration: manifest.sourceRegistration, ingestDecision: decision, bytes: content,
      mediaType: manifest.mediaType, capturedAt: manifest.capturedAt, storedAt, store: this.objects,
    });
    if (localJson(stored) !== localJson(preflight)) throw new Error('Stored capture does not match the preflight receipt.');
    let status: 'CREATED' | 'EXISTING';
    try { status = publishImmutableFile(this.root, locations(manifest.acquisitionId), record, MAX_INTAKE_RECORD_BYTES); }
    catch (error) {
      // Another process may have published this exact request with its own storage time.
      const winner = this.inspect(manifest.acquisitionId);
      if (winner?.requestDigest === requestDigest) return { status: 'EXISTING', acquisition: winner };
      if (winner) throw new Error('ACQUISITION_CONFLICT: a concurrent request already published this acquisition id.');
      throw error;
    }
    return { status, acquisition };
  }

  /** Reopen and recompute the local policy/receipt/bytes; never repair or create files. */
  inspect(acquisitionId: string): LocalAcquisition | undefined {
    const bytes = readImmutableFile(this.root, locations(acquisitionId), MAX_INTAKE_RECORD_BYTES);
    if (!bytes) return undefined;
    let record: unknown;
    try { record = JSON.parse(bytes.toString('utf8')); }
    catch { throw new Error('INVALID_ACQUISITION: the stored receipt is not JSON.'); }
    exactFields(record, ['schema', 'mode', 'policyAuthority', 'sourceTruthClaimed', 'canonicalAdmission', 'request', 'requestDigest', 'decision', 'capture', 'digest']);
    const acquisition = record as unknown as LocalAcquisition;
    if (acquisition.schema !== 'payload.local-acquisition.v1' || acquisition.mode !== 'LOCAL_DEVELOPMENT' || acquisition.policyAuthority !== 'OPERATOR_DECLARATION' || acquisition.sourceTruthClaimed !== false || acquisition.canonicalAdmission !== false) {
      throw new Error('INVALID_ACQUISITION: unsupported schema or authority claim.');
    }
    exactFields(acquisition.request, ['manifest', 'contentDigest', 'byteLength']);
    const manifest = parseLocalIntakeManifest(acquisition.request.manifest);
    if (manifest.acquisitionId !== acquisitionId || !Number.isSafeInteger(acquisition.request.byteLength) || acquisition.request.byteLength < 1 || acquisition.request.byteLength > MAX_EVIDENCE_BYTES) throw new Error('INVALID_ACQUISITION: request identity or length does not match.');
    const { digest: recordedDigest, ...payload } = acquisition;
    if (digest(payload) !== recordedDigest || digest(acquisition.request) !== acquisition.requestDigest) throw new Error('INVALID_ACQUISITION: metadata digest does not recompute.');
    const decision = decisionFor(manifest);
    if (localJson(decision) !== localJson(acquisition.decision)) throw new Error('INVALID_ACQUISITION: source decision does not recompute.');
    const content = this.objects.get(acquisition.request.contentDigest);
    if (!content || content.byteLength !== acquisition.request.byteLength || !verifyEvidenceCapture(acquisition.capture, this.objects)) throw new Error('INVALID_ACQUISITION: source bytes or storage receipt do not verify.');
    const expected = captureEvidence({ evidenceId: manifest.evidenceId, workflowId: manifest.acquisitionId,
      sourceRegistration: manifest.sourceRegistration, ingestDecision: decision, bytes: content,
      mediaType: manifest.mediaType, capturedAt: manifest.capturedAt, storedAt: acquisition.capture.receipt.storedAt,
      store: { put: () => ({ contentDigest: acquisition.request.contentDigest, byteLength: content.byteLength, storageKey: storageKeyFor(acquisition.request.contentDigest) }), get: () => content },
    });
    if (localJson(expected) !== localJson(acquisition.capture)) throw new Error('INVALID_ACQUISITION: capture does not match the declared request.');
    return acquisition;
  }
}
