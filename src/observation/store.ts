import { resolve } from 'node:path';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { MAX_REPLAY_MANIFEST_BYTES, MAX_REPLAY_REPORT_BYTES, manifestArtifactReferences,
  parseReplayManifest, replayRequestSchema, type ArtifactReference, type ReplayManifest, type ReplayRequest } from './contract';
import { parseReplayJson } from './json';
import { compileReplay, type ReplayComputation } from './replay';

export const MAX_REPLAY_DEPENDENCY_BYTES = 64 * 1024 * 1024;
const purpose = 'recorded-observation-replay';
type Dependency = ArtifactReference & { sourceId: string; byteLength: number; capturedAt: string; storedAt: string;
  decision: ReturnType<typeof evaluateSourceUse> };
export interface ReplayRun {
  schema: 'payload.recorded-observation-replay.v1';
  request: ReplayRequest; requestDigest: string; replayedAt: string;
  policyAuthority: 'OPERATOR_DECLARATION'; integrity: 'RECOMPUTED_LOCAL';
  dependencies: Dependency[]; computation: ReplayComputation; digest: string;
}

function path(id: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('REPLAY_INVALID_ID');
  return ['observation-replays', `${byteDigest(Buffer.from(id)).slice(7)}.json`];
}

/** Operator-only local replay. No fetch, sensor driver, admission, globe write or execution engine. */
export class ObservationReplayStore {
  readonly root: string;
  readonly intake: LocalEvidenceIntake;
  constructor(root: string) { this.root = resolve(root); this.intake = new LocalEvidenceIntake(this.root); }

  private compute(request: ReplayRequest, replayedAt: string): { run: ReplayRun; manifest: ReplayManifest } {
    const at = parseISOInstant(replayedAt, 'replayedAt');
    if (new Date(at).toISOString() !== replayedAt) throw new Error('REPLAY_NONCANONICAL_TIME');
    const dependencies = new Map<string, Dependency>();
    let totalBytes = 0;
    const verify = (ref: ArtifactReference) => {
      const prior = dependencies.get(ref.acquisitionId);
      if (prior) {
        if (prior.acquisitionDigest !== ref.acquisitionDigest || prior.contentDigest !== ref.contentDigest) throw new Error('REPLAY_REFERENCE_CONFLICT');
        return;
      }
      const a = this.intake.inspect(ref.acquisitionId);
      if (!a || a.digest !== ref.acquisitionDigest || a.request.contentDigest !== ref.contentDigest) throw new Error('REPLAY_EVIDENCE_UNAVAILABLE_OR_CHANGED');
      totalBytes += a.request.byteLength;
      if (totalBytes > MAX_REPLAY_DEPENDENCY_BYTES) throw new Error('REPLAY_DEPENDENCY_BUDGET');
      if (at < parseISOInstant(a.capture.receipt.storedAt, 'storedAt')) throw new Error('REPLAY_BEFORE_STORAGE');
      const registration = a.request.manifest.sourceRegistration;
      const decision = evaluateSourceUse(registration, {
        requestId: `${request.replayId}:derive:${dependencies.size}`, registrationId: registration.registrationId,
        purpose, operation: 'DERIVE', audience: 'INTERNAL', requestedAt: replayedAt,
      });
      if (decision.state !== 'ALLOWED') throw new Error('REPLAY_DERIVATION_NOT_ALLOWED');
      dependencies.set(ref.acquisitionId, { ...ref, sourceId: registration.sourceId, byteLength: a.request.byteLength,
        capturedAt: a.request.manifest.capturedAt, storedAt: a.capture.receipt.storedAt, decision });
    };
    verify(request.manifest);
    const bytes = this.intake.objects.get(request.manifest.contentDigest);
    if (!bytes) throw new Error('REPLAY_MANIFEST_MISSING');
    const manifest = parseReplayManifest(parseReplayJson(bytes, MAX_REPLAY_MANIFEST_BYTES));
    for (const ref of manifestArtifactReferences(manifest)) verify(ref);
    const payload = {
      schema: 'payload.recorded-observation-replay.v1' as const,
      request, requestDigest: localRecordDigest(request), replayedAt,
      policyAuthority: 'OPERATOR_DECLARATION' as const, integrity: 'RECOMPUTED_LOCAL' as const,
      dependencies: [...dependencies.values()], computation: compileReplay(manifest),
    };
    return { run: { ...payload, digest: localRecordDigest(payload, MAX_REPLAY_REPORT_BYTES) }, manifest };
  }

  replay(value: unknown, replayedAt = new Date().toISOString()) {
    const request = replayRequestSchema.parse(JSON.parse(encodeLocalRecord(value).toString('utf8')));
    const existing = this.inspect(request.replayId);
    if (existing) {
      if (existing.run.requestDigest !== localRecordDigest(request)) throw new Error('REPLAY_ID_CONFLICT');
      return { status: 'EXISTING' as const, ...existing };
    }
    const result = this.compute(request, replayedAt);
    const bytes = encodeLocalRecord(result.run, MAX_REPLAY_REPORT_BYTES);
    let status: 'CREATED' | 'EXISTING';
    try { status = publishImmutableFile(this.root, path(request.replayId), bytes, MAX_REPLAY_REPORT_BYTES); }
    catch (error) {
      const winner = this.inspect(request.replayId);
      if (winner?.run.requestDigest === result.run.requestDigest) return { status: 'EXISTING' as const, ...winner };
      if (winner) throw new Error('REPLAY_ID_CONFLICT');
      throw error;
    }
    const confirmed = this.inspect(request.replayId);
    if (!confirmed || confirmed.run.digest !== result.run.digest) throw new Error('REPLAY_SAVE_UNCONFIRMED');
    return { status, ...confirmed };
  }

  /** Recompile from the exact retained manifest/raw bytes at original policy time. Never repair. */
  inspect(replayId: string): { run: ReplayRun; manifest: ReplayManifest; rawBytesIncluded: false } | undefined {
    const bytes = readImmutableFile(this.root, path(replayId), MAX_REPLAY_REPORT_BYTES);
    if (!bytes) return undefined;
    const record = parseReplayJson(bytes, MAX_REPLAY_REPORT_BYTES);
    exactFields(record, ['schema', 'request', 'requestDigest', 'replayedAt', 'policyAuthority', 'integrity', 'dependencies', 'computation', 'digest']);
    const request = replayRequestSchema.parse(record.request);
    if (request.replayId !== replayId || typeof record.replayedAt !== 'string') throw new Error('REPLAY_HISTORY_INVALID');
    const expected = this.compute(request, record.replayedAt);
    if (localJson(record) !== localJson(expected.run)) throw new Error('REPLAY_HISTORY_INVALID');
    return { ...expected, rawBytesIncluded: false };
  }
}
