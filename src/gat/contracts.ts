import type { SourceUseDecision } from '../data-os/contracts';
import { encodeLocalRecord, exactFields } from '../data-os/local-record';
import { ProductionError } from '../production/errors';
import { GAT_ADAPTER_VERSION, type GatRuntimeIdentity } from './pin';
import type { GatAuditProjection, GatStageStatus } from './report';

export const MAX_GAT_REQUEST_BYTES = 8 * 1024;
export const MAX_GAT_RECEIPT_BYTES = 64 * 1024;
export interface GatAuditRequest {
  schema: 'payload.gat-audit-request.v1'; requestId: string; operation: 'IFC_AUDIT'; adapterVersion: typeof GAT_ADAPTER_VERSION; purpose: string;
  source: { acquisition: { id: string; digest: string }; evidence: { id: string; contentDigest: string } };
}
export type GatOutcome = 'SUPPORTED_SCOPE_AUDIT' | 'AUDIT_BLOCKED' | 'SOURCE_UNAVAILABLE' | 'SOURCE_INTEGRITY_FAILED' | 'SOURCE_REFERENCE_MISMATCH'
  | 'SOURCE_MEDIA_UNSUPPORTED' | 'SOURCE_TIME_MISMATCH' | 'PROCESSING_DISALLOWED' | 'ENGINE_UNAVAILABLE' | 'ENGINE_INTEGRITY_FAILED'
  | 'EXECUTION_TIMEOUT' | 'EXECUTION_FAILED' | 'INVALID_REPORT' | 'INPUT_TOO_LARGE' | 'ENGINE_BUSY';
export interface GatArtifactReference { id: string; contentDigest: string; byteLength: number }
export interface GatReceipt {
  schema: 'payload.gat-execution-receipt.v1'; request: GatAuditRequest; requestDigest: string; reservationDigest: string;
  startedAt: string; completedAt: string; engine: { repository: string; commit: string; sourceTreeDigest: string; adapterVersion: string; pinDigest: string };
  runtime: GatRuntimeIdentity | null; outcome: GatOutcome; sourceVerified: boolean;
  sourcePolicy: { id: string; digest: string; policyVersion: string } | null; deriveDecision: SourceUseDecision | null;
  report: GatArtifactReference | null; projection: GatArtifactReference | null;
  stages: { evidence: 'PASS' | 'BLOCKED'; processingPermission: 'ALLOWED' | 'DENIED' | 'APPROVAL_REQUIRED' | 'NOT_RUN'; execution: 'COMPLETED' | 'FAILED' | 'NOT_RUN';
    report: 'RETAINED' | 'NOT_RETAINED'; parse: GatStageStatus | null; lowering: GatStageStatus | null; compilation: GatStageStatus | null; verification: GatStageStatus | null };
  mode: 'LOCAL_DEVELOPMENT'; policyAuthority: 'OPERATOR_DECLARATION'; canonicalAdmission: false; independentlyVerified: false; sourceTruthClaimed: false; physicalActionAuthorized: false;
  digest: string;
}
export interface GatInspection {
  schema: 'payload.gat-inspection.v1'; mode: 'LOCAL_DEVELOPMENT'; requestId: string; requestDigest: string;
  receipt: { id: string; digest: string }; source: GatAuditRequest['source']; startedAt: string; completedAt: string;
  engine: GatReceipt['engine']; runtime: GatRuntimeIdentity | null; outcome: GatOutcome; stages: GatReceipt['stages'];
  processingPermission: { state: SourceUseDecision['state']; reasons: readonly string[]; evaluatedAt: string; policy: GatReceipt['sourcePolicy'] } | null;
  report: GatArtifactReference | null; projectionReference: GatArtifactReference | null; projection: GatAuditProjection | null;
  retained: { sourceVerifiedAtExecution: boolean; receipt: true; report: boolean; projection: boolean };
  retry: { sameRequest: 'HISTORICAL_INSPECTION_NO_EXECUTION'; newExecutionRequiresNewRequestId: true; remediationInputs: string[] };
  integrity: 'RECOMPUTED_LOCAL'; inspection: 'HISTORICAL'; currentRightsGrant: false; originalReportDelivered: false;
  canonicalAdmission: false; independentlyVerified: false; sourceTruthClaimed: false; physicalActionAuthorized: false;
}

export function requireGatId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new ProductionError('INVALID_GAT_REQUEST', 'Use bounded identifiers without paths or whitespace.');
}
export function requireGatDigest(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new ProductionError('INVALID_GAT_REQUEST', 'Use the exact full SHA-256 reference digest.');
}
export function parseGatAuditRequest(input: unknown): GatAuditRequest {
  try {
    const value = JSON.parse(encodeLocalRecord(input, MAX_GAT_REQUEST_BYTES).toString('utf8'));
    exactFields(value, ['schema', 'requestId', 'operation', 'adapterVersion', 'purpose', 'source']);
    if (value.schema !== 'payload.gat-audit-request.v1' || value.operation !== 'IFC_AUDIT' || value.adapterVersion !== GAT_ADAPTER_VERSION) throw new Error();
    requireGatId(value.requestId);
    if (typeof value.purpose !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 _.,:-]{0,179}$/.test(value.purpose) || value.purpose.trim() !== value.purpose) throw new Error();
    exactFields(value.source, ['acquisition', 'evidence']); exactFields(value.source.acquisition, ['id', 'digest']); exactFields(value.source.evidence, ['id', 'contentDigest']);
    requireGatId(value.source.acquisition.id); requireGatDigest(value.source.acquisition.digest); requireGatId(value.source.evidence.id); requireGatDigest(value.source.evidence.contentDigest);
    return value as unknown as GatAuditRequest;
  } catch { throw new ProductionError('INVALID_GAT_REQUEST', 'Send the closed IFC_AUDIT request with exact preserved acquisition/evidence references, the pinned adapter version, and declared purpose.'); }
}
