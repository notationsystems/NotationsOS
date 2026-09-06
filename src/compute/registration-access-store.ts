import { resolve } from 'node:path';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import type { ArtifactReference } from '../observation/contract';
import { parseReplayJson } from '../observation/json';
import { MAX_REGISTRATION_MANIFEST_BYTES, MAX_REGISTRATION_RUN_BYTES, parseRegistrationAccessExperiment,
  registrationAccessReferences, registrationAccessRequestSchema, type RegistrationAccessExperiment, type RegistrationAccessRequest } from './registration-access-contract';
import { evaluateRegistrationAccess, type RegistrationAccessResult } from './registration-access';

type Dependency = ArtifactReference & { byteLength: number; capturedAt: string; storedAt: string; decision: ReturnType<typeof evaluateSourceUse> };
export type RegistrationAccessRun = {
  schema: 'payload.registration-access-run.v1'; request: RegistrationAccessRequest; requestDigest: string; evaluatedAt: string;
  result: RegistrationAccessResult; dependencies: Dependency[]; policyAuthority: 'OPERATOR_DECLARATION'; independentVerification: false; digest: string;
};
function location(id: string) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('SPATIAL_INVALID_ID');
  return ['registration-access', `${byteDigest(Buffer.from(id)).slice(7)}.json`];
}
/** Trusted-local operator boundary, not a customer execution API or canonical admission authority. */
export class RegistrationAccessStore {
  readonly root: string;
  readonly intake: LocalEvidenceIntake;
  constructor(root: string) { this.root = resolve(root); this.intake = new LocalEvidenceIntake(this.root); }

  private compute(request: RegistrationAccessRequest, evaluatedAt: string) {
    const at = parseISOInstant(evaluatedAt, 'evaluatedAt');
    if (new Date(at).toISOString() !== evaluatedAt) throw new Error('SPATIAL_TIME_FORMAT');
    const dependencies = new Map<string, Dependency>(); let total = 0;
    const verify = (ref: ArtifactReference) => {
      const previous = dependencies.get(ref.acquisitionId);
      if (previous) {
        if (previous.acquisitionDigest !== ref.acquisitionDigest || previous.contentDigest !== ref.contentDigest) throw new Error('SPATIAL_REFERENCE_CONFLICT');
        return;
      }
      const a = this.intake.inspect(ref.acquisitionId);
      if (!a || a.digest !== ref.acquisitionDigest || a.request.contentDigest !== ref.contentDigest) throw new Error('SPATIAL_EVIDENCE_UNAVAILABLE_OR_CHANGED');
      total += a.request.byteLength;
      if (total > 64 * 1024 * 1024) throw new Error('SPATIAL_DEPENDENCY_BUDGET');
      if (at < parseISOInstant(a.capture.receipt.storedAt, 'storedAt')) throw new Error('SPATIAL_BEFORE_STORAGE');
      const registration = a.request.manifest.sourceRegistration;
      const decision = evaluateSourceUse(registration, { requestId: `${request.runId}:derive:${dependencies.size}`,
        registrationId: registration.registrationId, purpose: 'spatial-registration-access', operation: 'DERIVE', audience: 'INTERNAL', requestedAt: evaluatedAt });
      if (decision.state !== 'ALLOWED') throw new Error('SPATIAL_DERIVATION_NOT_ALLOWED');
      dependencies.set(ref.acquisitionId, { ...ref, byteLength: a.request.byteLength,
        capturedAt: a.request.manifest.capturedAt, storedAt: a.capture.receipt.storedAt, decision });
    };
    verify(request.manifest);
    const bytes = this.intake.objects.get(request.manifest.contentDigest);
    if (!bytes) throw new Error('SPATIAL_MANIFEST_UNAVAILABLE');
    const manifest = parseRegistrationAccessExperiment(parseReplayJson(bytes, MAX_REGISTRATION_MANIFEST_BYTES));
    for (const ref of registrationAccessReferences(manifest)) verify(ref);
    const core = { schema: 'payload.registration-access-run.v1' as const, request, requestDigest: localRecordDigest(request), evaluatedAt,
      result: evaluateRegistrationAccess(manifest), dependencies: [...dependencies.values()], policyAuthority: 'OPERATOR_DECLARATION' as const, independentVerification: false as const };
    return { manifest, run: { ...core, digest: localRecordDigest(core, MAX_REGISTRATION_RUN_BYTES) } };
  }

  run(value: unknown, evaluatedAt = new Date().toISOString()) {
    const request = registrationAccessRequestSchema.parse(JSON.parse(encodeLocalRecord(value, 4096).toString('utf8')));
    const existing = this.inspect(request.runId);
    if (existing) {
      if (existing.run.requestDigest !== localRecordDigest(request)) throw new Error('SPATIAL_ID_CONFLICT');
      return { status: 'EXISTING' as const, ...existing };
    }
    const { run } = this.compute(request, evaluatedAt);
    let status: 'CREATED' | 'EXISTING';
    try { status = publishImmutableFile(this.root, location(request.runId), encodeLocalRecord(run, MAX_REGISTRATION_RUN_BYTES), MAX_REGISTRATION_RUN_BYTES); }
    catch (error) {
      const winner = this.inspect(request.runId);
      if (winner?.run.requestDigest === run.requestDigest) return { status: 'EXISTING' as const, ...winner };
      if (winner) throw new Error('SPATIAL_ID_CONFLICT');
      throw error;
    }
    const confirmed = this.inspect(request.runId);
    if (!confirmed || confirmed.run.digest !== run.digest) throw new Error('SPATIAL_SAVE_UNCONFIRMED');
    return { status, ...confirmed };
  }

  /** Reopens exact evidence and recomputes original decisions/results; does not repair or renew rights. */
  inspect(runId: string): { run: RegistrationAccessRun; manifest: RegistrationAccessExperiment; rawBytesIncluded: false } | undefined {
    const bytes = readImmutableFile(this.root, location(runId), MAX_REGISTRATION_RUN_BYTES);
    if (!bytes) return undefined;
    const record = parseReplayJson(bytes, MAX_REGISTRATION_RUN_BYTES);
    exactFields(record, ['schema', 'request', 'requestDigest', 'evaluatedAt', 'result', 'dependencies', 'policyAuthority', 'independentVerification', 'digest']);
    const request = registrationAccessRequestSchema.parse(record.request);
    if (request.runId !== runId || typeof record.evaluatedAt !== 'string') throw new Error('SPATIAL_HISTORY_INVALID');
    const result = this.compute(request, record.evaluatedAt);
    if (localJson(result.run) !== localJson(record)) throw new Error('SPATIAL_HISTORY_INVALID');
    return { ...result, rawBytesIncluded: false };
  }
}
