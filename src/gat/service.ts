import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake, type LocalAcquisition } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { ProductionError } from '../production/errors';
import { GAT_ADAPTER_VERSION, GAT_ENGINE_PIN, GAT_RUNTIME_IDENTITY } from './pin';
import { runGatAudit } from './runtime';
import { MAX_GAT_REPORT_BYTES, projectGatAudit, validateGatAuditReport, type GatAuditReport } from './report';
import { MAX_GAT_RECEIPT_BYTES, parseGatAuditRequest, requireGatId, type GatArtifactReference, type GatAuditRequest, type GatInspection, type GatOutcome, type GatReceipt } from './contracts';

type Runtime = typeof runGatAudit;
interface Reservation { schema: 'payload.gat-execution-reservation.v1'; request: GatAuditRequest; requestDigest: string; startedAt: string; engine: GatReceipt['engine']; digest: string }
const engine = () => ({ repository: GAT_ENGINE_PIN.engineRepository, commit: GAT_ENGINE_PIN.engineCommit, sourceTreeDigest: GAT_ENGINE_PIN.sourceTreeDigest,
  adapterVersion: GAT_ADAPTER_VERSION, pinDigest: localRecordDigest(GAT_ENGINE_PIN) });
const pathFor = (kind: 'requests' | 'receipts', id: string) => ['gat-audits', kind, `${byteDigest(Buffer.from(id)).slice(7)}.json`];
const artifactPath = (digest: string) => ['gat-audits', 'artifacts', `${digest.slice(7)}.json`];
const runtimeCodes: GatOutcome[] = ['ENGINE_UNAVAILABLE', 'ENGINE_INTEGRITY_FAILED', 'EXECUTION_TIMEOUT', 'EXECUTION_FAILED', 'INVALID_REPORT', 'INPUT_TOO_LARGE', 'ENGINE_BUSY'];
const outcomes: GatOutcome[] = ['SUPPORTED_SCOPE_AUDIT', 'AUDIT_BLOCKED', 'SOURCE_UNAVAILABLE', 'SOURCE_INTEGRITY_FAILED', 'SOURCE_REFERENCE_MISMATCH', 'SOURCE_MEDIA_UNSUPPORTED', 'SOURCE_TIME_MISMATCH', 'PROCESSING_DISALLOWED', ...runtimeCodes];
const supportedMedia = new Set(['application/x-step', 'application/step', 'model/ifc']);
const invalidStored = () => new ProductionError('INVALID_STORED_GAT_AUDIT', 'The retained GAT receipt, report, projection or verified source no longer validates. All existing files were preserved.', 503);
const incomplete = () => new ProductionError('GAT_EXECUTION_INCOMPLETE', 'This request is reserved but has no confirmed receipt. It may still be running or have been interrupted. Preserve retained files; do not rerun this identity.', 409,
  { retained: { reservation: true }, retry: 'INSPECT_SAME_REQUEST_ONLY', remediationInputs: ['completed receipt or operator review of interrupted execution', 'new requestId for a deliberate new execution'] });

function derive(acquisition: LocalAcquisition, request: GatAuditRequest, at: string) {
  return evaluateSourceUse(acquisition.request.manifest.sourceRegistration, {
    requestId: `${request.requestId}:derive`, registrationId: acquisition.request.manifest.sourceRegistration.registrationId,
    purpose: request.purpose, operation: 'DERIVE', audience: 'INTERNAL', requestedAt: at,
  });
}
function sourcePolicy(acquisition: LocalAcquisition) {
  const policy = acquisition.request.manifest.sourceRegistration;
  return { id: policy.registrationId, digest: localRecordDigest(policy), policyVersion: policy.policyVersion };
}
function projectedPolicy(policy: GatReceipt['sourcePolicy']) {
  const safe = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : '[REDACTED]';
  return policy === null ? null : { id: safe(policy.id), digest: policy.digest, policyVersion: safe(policy.policyVersion) };
}
function stages(receipt: Pick<GatReceipt, 'outcome' | 'sourceVerified' | 'deriveDecision'>, report: GatAuditReport | null): GatReceipt['stages'] {
  return { evidence: receipt.sourceVerified ? 'PASS' : 'BLOCKED', processingPermission: receipt.deriveDecision?.state ?? 'NOT_RUN',
    execution: report ? 'COMPLETED' : runtimeCodes.includes(receipt.outcome) ? 'FAILED' : 'NOT_RUN', report: report ? 'RETAINED' : 'NOT_RETAINED',
    parse: report?.parse.status ?? null, lowering: report?.pipeline.lowering.status ?? null,
    compilation: report?.pipeline.compilation.status ?? null, verification: report?.pipeline.verification.status ?? null };
}
function remediation(outcome: GatOutcome): string[] {
  if (outcome === 'SUPPORTED_SCOPE_AUDIT') return [];
  if (outcome === 'AUDIT_BLOCKED') return ['inspect original supported-scope blockers', 'new preserved artifact and requestId if source data changes'];
  if (outcome === 'PROCESSING_DISALLOWED') return ['separately established INTERNAL DERIVE permission for the exact purpose and time', 'new requestId'];
  if (outcome.startsWith('SOURCE_')) return ['inspect the exact acquisition and evidence integrity', 'supported IFC media declaration', 'new requestId after remediation'];
  return ['operator inspection of the pinned local runtime', 'new requestId for a deliberate new execution'];
}

/** Persisted specialist audit only. No corpus admission, fixture mutation or notation-state write. */
export class GatAuditService {
  private readonly intake: LocalEvidenceIntake;
  constructor(readonly root: string, private readonly runtime: Runtime = runGatAudit, private readonly clock = () => new Date().toISOString()) {
    this.intake = new LocalEvidenceIntake(root);
  }
  private reservation(id: string): Reservation | undefined {
    const bytes = readImmutableFile(this.root, pathFor('requests', id), MAX_GAT_RECEIPT_BYTES);
    if (!bytes) return undefined;
    const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Reservation;
    exactFields(record, ['schema', 'request', 'requestDigest', 'startedAt', 'engine', 'digest']);
    const request = parseGatAuditRequest(record.request);
    const { digest, ...payload } = record;
    if (record.schema !== 'payload.gat-execution-reservation.v1' || request.requestId !== id || localRecordDigest(request) !== record.requestDigest
      || localRecordDigest(payload) !== digest || localJson(record.engine) !== localJson(engine())) throw invalidStored();
    parseISOInstant(record.startedAt, 'startedAt');
    return record;
  }
  private exactSource(request: GatAuditRequest): LocalAcquisition {
    const acquisition = this.intake.inspect(request.source.acquisition.id);
    if (!acquisition) throw new ProductionError('SOURCE_UNAVAILABLE', 'The named acquisition is not retained.', 404);
    if (acquisition.digest !== request.source.acquisition.digest || acquisition.capture.evidence.evidenceId !== request.source.evidence.id
      || acquisition.request.contentDigest !== request.source.evidence.contentDigest) throw new ProductionError('SOURCE_REFERENCE_MISMATCH', 'The requested references do not identify the retained acquisition and evidence.', 409);
    return acquisition;
  }
  private preconditions(request: GatAuditRequest, at: string) {
    let acquisition: LocalAcquisition | undefined;
    let sourceVerified = false;
    let decision: GatReceipt['deriveDecision'] = null;
    let outcome: GatOutcome | null = null;
    try { acquisition = this.exactSource(request); sourceVerified = true; }
    catch (error) {
      outcome = error instanceof ProductionError && ['SOURCE_UNAVAILABLE', 'SOURCE_REFERENCE_MISMATCH'].includes(error.code) ? error.code as GatOutcome : 'SOURCE_INTEGRITY_FAILED';
    }
    if (acquisition) {
      if (parseISOInstant(at, 'startedAt') < parseISOInstant(acquisition.capture.receipt.storedAt, 'storedAt')) outcome = 'SOURCE_TIME_MISMATCH';
      else if (!supportedMedia.has(acquisition.capture.evidence.mediaType.toLowerCase())) outcome = 'SOURCE_MEDIA_UNSUPPORTED';
      else { decision = derive(acquisition, request, at); if (decision.state !== 'ALLOWED') outcome = 'PROCESSING_DISALLOWED'; }
    }
    return { acquisition, sourceVerified, decision, outcome, policy: acquisition ? sourcePolicy(acquisition) : null };
  }
  private artifact(reference: GatArtifactReference, bytes: Uint8Array): GatArtifactReference {
    publishImmutableFile(this.root, artifactPath(reference.contentDigest), bytes, MAX_GAT_REPORT_BYTES);
    this.readArtifact(reference, reference.id);
    return reference;
  }
  private discoverArtifact(reference: GatArtifactReference | null): GatArtifactReference | 'UNCONFIRMED' | null {
    if (!reference) return null; // This artifact's publication was not attempted.
    try { this.readArtifact(reference, reference.id); return reference; }
    catch { return 'UNCONFIRMED'; }
  }
  private readArtifact(reference: GatArtifactReference, id: string): Buffer {
    exactFields(reference, ['id', 'contentDigest', 'byteLength']);
    if (reference.id !== id || !/^sha256:[a-f0-9]{64}$/.test(reference.contentDigest) || !Number.isSafeInteger(reference.byteLength)
      || reference.byteLength < 1 || reference.byteLength > MAX_GAT_REPORT_BYTES) throw invalidStored();
    const bytes = readImmutableFile(this.root, artifactPath(reference.contentDigest), MAX_GAT_REPORT_BYTES);
    if (!bytes || bytes.length !== reference.byteLength || byteDigest(bytes) !== reference.contentDigest) throw invalidStored();
    return bytes;
  }

  async audit(input: unknown): Promise<{ status: 'CREATED' | 'EXISTING'; inspection: GatInspection }> {
    const request = parseGatAuditRequest(input);
    const requestDigest = localRecordDigest(request);
    const existing = this.inspect(request.requestId);
    if (existing) {
      if (existing.requestDigest !== requestDigest) throw new ProductionError('GAT_REQUEST_CONFLICT', 'This request identity already names a different audit request.', 409);
      return { status: 'EXISTING', inspection: existing };
    }
    const startedAt = this.clock(); parseISOInstant(startedAt, 'startedAt');
    const reservationBody = { schema: 'payload.gat-execution-reservation.v1' as const, request, requestDigest, startedAt, engine: engine() };
    const reservation: Reservation = { ...reservationBody, digest: localRecordDigest(reservationBody) };
    try {
      const prior = this.reservation(request.requestId);
      if (prior) {
        if (prior.requestDigest !== requestDigest) throw new ProductionError('GAT_REQUEST_CONFLICT', 'This identity is reserved for a different audit request.', 409);
        throw incomplete();
      }
      const published = publishImmutableFile(this.root, pathFor('requests', request.requestId), encodeLocalRecord(reservation), MAX_GAT_RECEIPT_BYTES);
      if (published !== 'CREATED') throw incomplete();
    } catch (error) {
      if (error instanceof ProductionError) throw error;
      try {
        const winner = this.reservation(request.requestId);
        if (winner && winner.requestDigest !== requestDigest) throw new ProductionError('GAT_REQUEST_CONFLICT', 'A different request already reserved this identity.', 409);
        if (winner) throw incomplete();
      } catch (failure) { if (failure instanceof ProductionError) throw failure; }
      throw new ProductionError('GAT_STORAGE_UNAVAILABLE', 'The audit reservation could not be confirmed. Preserve the local files before retrying.', 503);
    }

    let outcome: GatOutcome = 'EXECUTION_FAILED';
    let acquisition: LocalAcquisition | undefined;
    let sourceVerified = false;
    let decision: GatReceipt['deriveDecision'] = null;
    let runtime: GatReceipt['runtime'] = null;
    let report: GatAuditReport | null = null;
    let originalReportBytes: Buffer | null = null;
    let reportReference: GatArtifactReference | null = null;
    let projectionReference: GatArtifactReference | null = null;
    let attemptedReport: GatArtifactReference | null = null;
    let attemptedProjection: GatArtifactReference | null = null;
    try {
      try { acquisition = this.exactSource(request); sourceVerified = true; }
      catch (error) {
        outcome = error instanceof ProductionError && ['SOURCE_UNAVAILABLE', 'SOURCE_REFERENCE_MISMATCH'].includes(error.code) ? error.code as GatOutcome : 'SOURCE_INTEGRITY_FAILED';
      }
      if (acquisition) {
        if (parseISOInstant(startedAt, 'startedAt') < parseISOInstant(acquisition.capture.receipt.storedAt, 'storedAt')) outcome = 'SOURCE_TIME_MISMATCH';
        else if (!supportedMedia.has(acquisition.capture.evidence.mediaType.toLowerCase())) outcome = 'SOURCE_MEDIA_UNSUPPORTED';
        else {
          decision = derive(acquisition, request, startedAt);
          if (decision.state !== 'ALLOWED') outcome = 'PROCESSING_DISALLOWED';
          else {
            try {
              let bytes: Uint8Array | undefined;
              try { bytes = this.intake.objects.get(request.source.evidence.contentDigest); }
              catch { throw new ProductionError('SOURCE_INTEGRITY_FAILED', 'Source integrity could not be confirmed.'); }
              if (!bytes || byteDigest(bytes) !== request.source.evidence.contentDigest) throw new ProductionError('SOURCE_INTEGRITY_FAILED', 'Source integrity could not be confirmed.');
              const execution = await this.runtime(bytes);
              if (localJson(execution.runtime) !== localJson(GAT_RUNTIME_IDENTITY)) throw new ProductionError('ENGINE_INTEGRITY_FAILED', 'The runtime identity does not match the pin.');
              try {
                report = validateGatAuditReport(execution.reportBytes, { contentDigest: request.source.evidence.contentDigest, byteLength: bytes.byteLength });
                if (localJson(report) !== localJson(execution.report)) throw new Error();
              } catch { throw new ProductionError('INVALID_REPORT', 'The returned report does not validate.'); }
              runtime = { ...execution.runtime };
              // Preserve the exact runtime bytes, including formatting, after validation.
              originalReportBytes = Buffer.from(execution.reportBytes);
              outcome = report.pipeline.pipeline_ready ? 'SUPPORTED_SCOPE_AUDIT' : 'AUDIT_BLOCKED';
            } catch (error) {
              const code = (error as { code?: unknown })?.code;
              if (code === 'SOURCE_INTEGRITY_FAILED') outcome = code;
              else outcome = typeof code === 'string' && runtimeCodes.includes(code as GatOutcome) ? code as GatOutcome : 'EXECUTION_FAILED';
              report = null; reportReference = null; projectionReference = null;
            }
            // Storage failures are not engine failures. Keep any published artifacts and the
            // execution reservation; never rerun the request to conceal a partial publication.
            if (report && originalReportBytes) {
              attemptedReport = { id: `${request.requestId}:report`, contentDigest: byteDigest(originalReportBytes), byteLength: originalReportBytes.byteLength };
              reportReference = this.artifact(attemptedReport, originalReportBytes);
              const projectedBytes = encodeLocalRecord(projectGatAudit(report), MAX_GAT_REPORT_BYTES);
              attemptedProjection = { id: `${request.requestId}:projection`, contentDigest: byteDigest(projectedBytes), byteLength: projectedBytes.byteLength };
              projectionReference = this.artifact(attemptedProjection, projectedBytes);
            }
          }
        }
      }
      const completedAt = this.clock();
      if (parseISOInstant(completedAt, 'completedAt') < parseISOInstant(startedAt, 'startedAt')) throw new Error('Clock moved backwards.');
      const payload = { schema: 'payload.gat-execution-receipt.v1' as const, request, requestDigest, reservationDigest: reservation.digest, startedAt, completedAt,
        engine: engine(), runtime, outcome, sourceVerified, sourcePolicy: acquisition ? sourcePolicy(acquisition) : null, deriveDecision: decision,
        report: reportReference, projection: projectionReference, stages: stages({ outcome, sourceVerified, deriveDecision: decision }, report),
        mode: 'LOCAL_DEVELOPMENT' as const, policyAuthority: 'OPERATOR_DECLARATION' as const, canonicalAdmission: false as const,
        independentlyVerified: false as const, sourceTruthClaimed: false as const, physicalActionAuthorized: false as const };
      const receipt: GatReceipt = { ...payload, digest: localRecordDigest(payload) };
      publishImmutableFile(this.root, pathFor('receipts', request.requestId), encodeLocalRecord(receipt), MAX_GAT_RECEIPT_BYTES);
      const inspection = this.inspect(request.requestId);
      if (!inspection || inspection.receipt.digest !== receipt.digest) throw new Error('Receipt readback failed.');
      return { status: 'CREATED', inspection };
    } catch (error) {
      // After publication was attempted, even a typed readback-integrity error
      // must retain the expected references and independently discovered state.
      if (error instanceof ProductionError && !attemptedReport && !attemptedProjection) throw error;
      throw new ProductionError('GAT_SAVE_UNCONFIRMED', 'The execution or retained outputs could not be confirmed. Preserve all artifacts and inspect this request; it will not be rerun automatically.', 503,
        { retained: { reservation: true, report: this.discoverArtifact(attemptedReport), projection: this.discoverArtifact(attemptedProjection) },
          expectedOutputs: { report: attemptedReport, projection: attemptedProjection }, retry: 'INSPECT_SAME_REQUEST_ONLY' });
    }
  }

  /** Recompute retained metadata, original policy decision, source and report bytes; never invoke the runtime. */
  inspect(requestId: string): GatInspection | undefined {
    requireGatId(requestId);
    try {
      const bytes = readImmutableFile(this.root, pathFor('receipts', requestId), MAX_GAT_RECEIPT_BYTES);
      if (!bytes) return undefined;
      const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as GatReceipt;
      exactFields(receipt, ['schema', 'request', 'requestDigest', 'reservationDigest', 'startedAt', 'completedAt', 'engine', 'runtime', 'outcome', 'sourceVerified', 'sourcePolicy', 'deriveDecision', 'report', 'projection', 'stages', 'mode', 'policyAuthority', 'canonicalAdmission', 'independentlyVerified', 'sourceTruthClaimed', 'physicalActionAuthorized', 'digest']);
      const request = parseGatAuditRequest(receipt.request);
      const reservation = this.reservation(requestId);
      const { digest, ...payload } = receipt;
      if (!reservation || receipt.schema !== 'payload.gat-execution-receipt.v1' || request.requestId !== requestId || localRecordDigest(payload) !== digest
        || receipt.requestDigest !== localRecordDigest(request) || receipt.requestDigest !== reservation.requestDigest || receipt.reservationDigest !== reservation.digest
        || receipt.startedAt !== reservation.startedAt || localJson(receipt.engine) !== localJson(engine())
        || parseISOInstant(receipt.completedAt, 'completedAt') < parseISOInstant(receipt.startedAt, 'startedAt')
        || receipt.mode !== 'LOCAL_DEVELOPMENT' || receipt.policyAuthority !== 'OPERATOR_DECLARATION' || receipt.canonicalAdmission !== false || receipt.independentlyVerified !== false
        || receipt.sourceTruthClaimed !== false || receipt.physicalActionAuthorized !== false || !outcomes.includes(receipt.outcome) || typeof receipt.sourceVerified !== 'boolean') throw invalidStored();
      // Re-evaluate the source/media/chronology/permission gates at the recorded time.
      // A rehashed local record must not turn a gate failure into another failure or
      // a report-backed result. This still does not authenticate the recorded execution.
      const checked = this.preconditions(request, receipt.startedAt);
      const acquisition = checked.acquisition;
      if (receipt.sourceVerified !== checked.sourceVerified || localJson(receipt.sourcePolicy) !== localJson(checked.policy)
        || localJson(receipt.deriveDecision) !== localJson(checked.decision)) throw invalidStored();
      if (checked.outcome !== null) {
        if (receipt.outcome !== checked.outcome || receipt.runtime !== null || receipt.report !== null || receipt.projection !== null) throw invalidStored();
      } else if (!['SUPPORTED_SCOPE_AUDIT', 'AUDIT_BLOCKED', ...runtimeCodes].includes(receipt.outcome)) throw invalidStored();
      const hasReport = ['SUPPORTED_SCOPE_AUDIT', 'AUDIT_BLOCKED'].includes(receipt.outcome);
      let original: GatAuditReport | null = null;
      let projection: GatInspection['projection'] = null;
      if (hasReport) {
        if (!acquisition || receipt.deriveDecision?.state !== 'ALLOWED' || !receipt.report || !receipt.projection || localJson(receipt.runtime) !== localJson(GAT_RUNTIME_IDENTITY)) throw invalidStored();
        original = validateGatAuditReport(this.readArtifact(receipt.report, `${requestId}:report`), { contentDigest: request.source.evidence.contentDigest, byteLength: acquisition.request.byteLength });
        const projected = this.readArtifact(receipt.projection, `${requestId}:projection`);
        projection = projectGatAudit(original);
        if (!projected.equals(encodeLocalRecord(projection, MAX_GAT_REPORT_BYTES)) || original.pipeline.pipeline_ready !== (receipt.outcome === 'SUPPORTED_SCOPE_AUDIT')) throw invalidStored();
      } else if (receipt.report !== null || receipt.projection !== null) throw invalidStored();
      if (receipt.runtime !== null && localJson(receipt.runtime) !== localJson(GAT_RUNTIME_IDENTITY)) throw invalidStored();
      if (localJson(receipt.stages) !== localJson(stages(receipt, original))) throw invalidStored();
      return { schema: 'payload.gat-inspection.v1', mode: 'LOCAL_DEVELOPMENT', requestId, requestDigest: receipt.requestDigest,
        receipt: { id: requestId, digest }, source: request.source, startedAt: receipt.startedAt, completedAt: receipt.completedAt,
        engine: receipt.engine, runtime: receipt.runtime, outcome: receipt.outcome, stages: receipt.stages,
        processingPermission: receipt.deriveDecision === null ? null : { state: receipt.deriveDecision.state, reasons: receipt.deriveDecision.reasons, evaluatedAt: receipt.deriveDecision.evaluatedAt, policy: projectedPolicy(receipt.sourcePolicy) },
        report: receipt.report, projectionReference: receipt.projection, projection,
        retained: { sourceVerifiedAtExecution: receipt.sourceVerified, receipt: true, report: Boolean(receipt.report), projection: Boolean(receipt.projection) },
        retry: { sameRequest: 'HISTORICAL_INSPECTION_NO_EXECUTION', newExecutionRequiresNewRequestId: true, remediationInputs: remediation(receipt.outcome) },
        integrity: 'RECOMPUTED_LOCAL', inspection: 'HISTORICAL', currentRightsGrant: false, originalReportDelivered: false,
        canonicalAdmission: false, independentlyVerified: false, sourceTruthClaimed: false, physicalActionAuthorized: false };
    } catch { throw invalidStored(); }
  }

  /** Public inspection distinguishes an absent identity from a reserved, unconfirmed execution. */
  inspectRequest(requestId: string): GatInspection | undefined {
    const result = this.inspect(requestId);
    if (result) return result;
    let reservation: Reservation | undefined;
    try { reservation = this.reservation(requestId); }
    catch { throw invalidStored(); }
    if (reservation) throw incomplete();
    return undefined;
  }
}
