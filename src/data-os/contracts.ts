/**
 * Payload OS workbench compatibility contracts.
 *
 * These are small TypeScript counterparts of the Notations Bench source-policy
 * and evidence-capture workflows. The Bench remains the reference provenance
 * and corpus implementation. This browser repository does not establish a
 * second canonical Data OS, derive claims, run customer inference, or expose a
 * customer API.
 */

export type ISODateTime = string;

export type SourceOperation =
  | 'DERIVE'
  | 'EXPORT'
  | 'INDEX'
  | 'INGEST'
  | 'MODEL_TRAINING'
  | 'PUBLISH'
  | 'RETRIEVE';

export type SourceAudience = 'CUSTOMER' | 'INTERNAL' | 'PUBLIC' | 'TENANT';

export type SourceUseState = 'ALLOWED' | 'APPROVAL_REQUIRED' | 'DENIED';

export interface RetentionPolicy {
  mode: 'INDEFINITE' | 'UNTIL_SOURCE_EXPIRY' | 'UNTIL';
  /** Required only for `UNTIL`; it cannot extend past source-policy expiry. */
  until?: ISODateTime;
}

/** One evidence-backed and time-bounded source-use policy. */
export interface SourceRegistration {
  registrationId: string;
  sourceId: string;
  displayName: string;
  sourceClass: string;
  licenseId: string;
  policyVersion: string;
  effectiveFrom: ISODateTime;
  /** Half-open: inactive at this instant and after it. */
  effectiveUntil?: ISODateTime;
  permittedPurposes: readonly string[];
  prohibitedPurposes?: readonly string[];
  allowedOperations: readonly SourceOperation[];
  approvalRequiredOperations?: readonly SourceOperation[];
  allowedAudiences: readonly SourceAudience[];
  retention: RetentionPolicy;
}

export interface SourceUseRequest {
  requestId: string;
  registrationId: string;
  purpose: string;
  operation: SourceOperation;
  audience: SourceAudience;
  requestedAt: ISODateTime;
}

/** Policy evaluation only; it is not a claim that the source is true. */
export interface SourceUseDecision {
  decisionId: string;
  requestId: string;
  registrationId: string;
  sourceId: string;
  request: Readonly<Omit<SourceUseRequest, 'requestId' | 'registrationId'>>;
  state: SourceUseState;
  reasons: readonly string[];
  evaluatedAt: ISODateTime;
}

export interface ContentAddressedWrite {
  contentDigest: string;
  byteLength: number;
  storageKey: string;
}

/** The object-store seam used by evidence capture. */
export interface ContentAddressedStore {
  put(bytes: Uint8Array): ContentAddressedWrite;
  get(contentDigest: string): Uint8Array | undefined;
}

export interface EvidenceCaptureRequest {
  evidenceId: string;
  workflowId: string;
  sourceRegistration: SourceRegistration;
  ingestDecision: SourceUseDecision;
  bytes: Uint8Array;
  mediaType: string;
  capturedAt: ISODateTime;
  storedAt: ISODateTime;
  store: ContentAddressedStore;
}

/** The binary-evidence payload carried by the bench's evidence artifact. */
export interface BinaryEvidence {
  kind: 'BinaryEvidence';
  schema: 'notations.binary-evidence.v1';
  evidenceId: string;
  mediaType: string;
  contentDigest: string;
  byteLength: number;
  storageKey: string;
  sourceId: string;
  capturedAt: ISODateTime;
  sourceTruthClaimed: false;
}

/** The storage-receipt payload carried beside one exact BinaryEvidence record. */
export interface StorageReceipt {
  kind: 'StorageReceipt';
  schema: 'notations.storage-receipt.v1';
  receiptId: string;
  evidenceId: string;
  contentDigest: string;
  storageKey: string;
  storedAt: ISODateTime;
}

export interface EvidenceCaptureResult {
  evidence: BinaryEvidence;
  receipt: StorageReceipt;
}
