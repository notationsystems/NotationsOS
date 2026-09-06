import { resolve } from 'node:path';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import type { ArtifactReference } from '../observation/contract';
import { parseReplayJson } from '../observation/json';
import { CLEARANCE_PURPOSE, MAX_CLEARANCE_MANIFEST_BYTES, MAX_CLEARANCE_RESULT_BYTES, clearanceReferences, clearanceRequestSchema,
  parseClearanceExperiment, type ClearanceRequest } from './clearance-contract';
import { evaluateClearanceDecision } from './clearance-voi';

type Dependency = ArtifactReference & { byteLength: number; capturedAt: string; storedAt: string; decision: ReturnType<typeof evaluateSourceUse> };
function location(id: string) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('CLEARANCE_INVALID_ID');
  return ['clearance-voi', `${byteDigest(Buffer.from(id)).slice(7)}.json`];
}
function instant(value: string) {
  const time = parseISOInstant(value, 'clearance time');
  if (new Date(time).toISOString() !== value) throw new Error('CLEARANCE_TIME_FORMAT');
  return time;
}
/** Operator-only local computation. No acquisition, agent execution, customer route or canonical mutation. */
export class ClearanceStore {
  readonly root: string;
  readonly intake: LocalEvidenceIntake;
  constructor(root: string, private readonly dependencies: { now?: () => string } = {}) { this.root = resolve(root); this.intake = new LocalEvidenceIntake(this.root); }
  private now() { const value = (this.dependencies.now ?? (() => new Date().toISOString()))(); instant(value); return value; }
  private compute(request: ClearanceRequest, evaluatedAt: string, currentAt: string) {
    const at = instant(evaluatedAt), current = instant(currentAt);
    if (current < at) throw new Error('CLEARANCE_CLOCK_REVERSED');
    const dependencies = new Map<string, Dependency>(); let total = 0;
    const verify = (ref: ArtifactReference) => {
      const prior = dependencies.get(ref.acquisitionId);
      if (prior) {
        if (prior.acquisitionDigest !== ref.acquisitionDigest || prior.contentDigest !== ref.contentDigest) throw new Error('CLEARANCE_REFERENCE_CONFLICT');
        return;
      }
      const a = this.intake.inspect(ref.acquisitionId);
      if (!a || a.digest !== ref.acquisitionDigest || a.request.contentDigest !== ref.contentDigest) throw new Error('CLEARANCE_EVIDENCE_UNAVAILABLE_OR_CHANGED');
      total += a.request.byteLength;
      if (total > 64 * 1024 * 1024) throw new Error('CLEARANCE_DEPENDENCY_BUDGET');
      if (at < parseISOInstant(a.capture.receipt.storedAt, 'storedAt')) throw new Error('CLEARANCE_BEFORE_STORAGE');
      const registration = a.request.manifest.sourceRegistration;
      if (registration.retention.mode === 'UNTIL' && current >= parseISOInstant(registration.retention.until, 'retention')) throw new Error('CLEARANCE_CURRENT_USE_NOT_ALLOWED');
      const check = (operation: 'DERIVE' | 'RETRIEVE', time: string) => {
        const decision = evaluateSourceUse(registration, { requestId: `${request.runId}:${operation}:${dependencies.size}`, registrationId: registration.registrationId,
          purpose: CLEARANCE_PURPOSE, operation, audience: 'INTERNAL', requestedAt: time });
        if (decision.state !== 'ALLOWED') throw new Error('CLEARANCE_CURRENT_USE_NOT_ALLOWED');
        return decision;
      };
      check('RETRIEVE', currentAt); check('DERIVE', currentAt);
      const decision = check('DERIVE', evaluatedAt);
      dependencies.set(ref.acquisitionId, { ...ref, byteLength: a.request.byteLength, capturedAt: a.request.manifest.capturedAt, storedAt: a.capture.receipt.storedAt, decision });
    };
    verify(request.manifest);
    const bytes = this.intake.objects.get(request.manifest.contentDigest);
    if (!bytes) throw new Error('CLEARANCE_MANIFEST_UNAVAILABLE');
    const manifest = parseClearanceExperiment(parseReplayJson(bytes, MAX_CLEARANCE_MANIFEST_BYTES));
    for (const ref of clearanceReferences(manifest)) verify(ref);
    const core = { schema: 'payload.clearance-voi-run.v1' as const, request, requestDigest: localRecordDigest(request), evaluatedAt,
      result: evaluateClearanceDecision(manifest), dependencies: [...dependencies.values()], policyAuthority: 'OPERATOR_DECLARATION' as const, independentVerification: false as const };
    return { manifest, run: { ...core, digest: localRecordDigest(core, MAX_CLEARANCE_RESULT_BYTES) } };
  }
  run(value: unknown) {
    const request = clearanceRequestSchema.parse(JSON.parse(encodeLocalRecord(value, 4096).toString('utf8')));
    const existing = this.inspect(request.runId);
    if (existing) {
      if (existing.run.requestDigest !== localRecordDigest(request)) throw new Error('CLEARANCE_ID_CONFLICT');
      return { status: 'EXISTING' as const, ...existing };
    }
    const at = this.now(), { run } = this.compute(request, at, at);
    let status: 'CREATED' | 'EXISTING';
    try { status = publishImmutableFile(this.root, location(request.runId), encodeLocalRecord(run, MAX_CLEARANCE_RESULT_BYTES), MAX_CLEARANCE_RESULT_BYTES); }
    catch (error) {
      const winner = this.inspect(request.runId);
      if (winner?.run.requestDigest === run.requestDigest) return { status: 'EXISTING' as const, ...winner };
      if (winner) throw new Error('CLEARANCE_ID_CONFLICT');
      throw error;
    }
    const confirmed = this.inspect(request.runId);
    if (!confirmed || confirmed.run.digest !== run.digest) throw new Error('CLEARANCE_SAVE_UNCONFIRMED');
    return { status, ...confirmed };
  }
  /** Recompute original provenance AND require current declared access; never repair or renew rights. */
  inspect(id: string) {
    const bytes = readImmutableFile(this.root, location(id), MAX_CLEARANCE_RESULT_BYTES);
    if (!bytes) return undefined;
    const record = parseReplayJson(bytes, MAX_CLEARANCE_RESULT_BYTES);
    exactFields(record, ['schema', 'request', 'requestDigest', 'evaluatedAt', 'result', 'dependencies', 'policyAuthority', 'independentVerification', 'digest']);
    const request = clearanceRequestSchema.parse(record.request);
    if (request.runId !== id || typeof record.evaluatedAt !== 'string') throw new Error('CLEARANCE_HISTORY_INVALID');
    const result = this.compute(request, record.evaluatedAt, this.now());
    if (localJson(record) !== localJson(result.run)) throw new Error('CLEARANCE_HISTORY_INVALID');
    return { ...result, rawBytesIncluded: false as const };
  }
}
