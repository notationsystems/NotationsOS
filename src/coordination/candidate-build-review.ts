import type { LocalCandidateBuild } from '../data-os/local-candidate-build';
import { exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { parseISOInstant, requireIdentifier, requireText } from '../data-os/validation';
import type { WorkerClient } from './contract-review';
import type { BoardMessage, CoordinationSnapshot, Participant } from './types';

export const CANDIDATE_BUILD_REVIEWER_ID = 'agent.candidate-build-review.v1';
export const CANDIDATE_BUILD_REVIEW_TOPIC = 'candidate-build-review';
const HASH = /^sha256:[a-f0-9]{64}$/;
const NONCLAIMS = Object.freeze({ canonicalAdmission: false, releaseActivated: false, independentlyVerified: false,
  sourceTruthClaimed: false, rawBytesIncluded: false, candidateFieldsIncluded: false, sourceIdentifiersIncluded: false } as const);

interface RequestedBuild { id: string; digest: string }
type ReviewError = 'INVALID_BUILD_REVIEW_REQUEST' | 'AUTHOR_DOMAIN_MISMATCH' | 'BUILD_NOT_FOUND' | 'BUILD_DIGEST_MISMATCH' | 'BUILD_INSPECTION_FAILED';
interface BuildSummary {
  buildId: string; digest: string; recordsRoot: string; recordCount: number;
  knownThrough: string; builtAt: string; state: 'UNADMITTED';
}
export interface CandidateBuildReview extends Readonly<typeof NONCLAIMS> {
  schema: 'payload.candidate-build-review.v1';
  requestDigest: string;
  requestedBuild: RequestedBuild | null;
  assessment: 'RECOMPUTED_LOCAL' | 'REJECTED' | 'UNAVAILABLE';
  error: ReviewError | null;
  summary: BuildSummary | null;
}
export interface CandidateBuildInspector { inspect(buildId: string): LocalCandidateBuild | undefined }

export function candidateBuildReviewerDefinition(scope: string): Participant {
  return { id: CANDIDATE_BUILD_REVIEWER_ID, name: 'Candidate build inspection worker', kind: 'AGENT', version: '0.1.0',
    purpose: 'Recompute one exact local Caravan candidate build and report a bounded historical inspection result.',
    authority: 'verification', runtime: 'JavaScript', status: 'LOCAL', scope, domains: ['CARAVAN'],
    inputs: ['payload.local-candidate-build.v1'], outputs: ['payload.candidate-build-review.v1'],
    capabilities: ['coordination.candidate-build-inspect'], reference: 'NotationsOS: src/coordination/candidate-build-review.ts' };
}

function requestedBuild(body: string): RequestedBuild | null {
  try {
    const value: unknown = JSON.parse(body);
    exactFields(value, ['buildId', 'expectedDigest']);
    requireIdentifier(value.buildId, 'buildId');
    requireText(value.buildId, 'buildId', 180);
    if (typeof value.expectedDigest !== 'string' || !HASH.test(value.expectedDigest)) return null;
    return { id: value.buildId as string, digest: value.expectedDigest };
  } catch { return null; }
}

function assessment(error: ReviewError | null): CandidateBuildReview['assessment'] {
  return error === null ? 'RECOMPUTED_LOCAL' : ['BUILD_NOT_FOUND', 'BUILD_INSPECTION_FAILED'].includes(error) ? 'UNAVAILABLE' : 'REJECTED';
}

function report(message: BoardMessage, inspector: CandidateBuildInspector, snapshot: CoordinationSnapshot): CandidateBuildReview {
  const reference = requestedBuild(message.body);
  let error: ReviewError | null = reference ? null : 'INVALID_BUILD_REVIEW_REQUEST';
  let summary: BuildSummary | null = null;
  const author = snapshot.participants.find((participant) => participant.scope === message.scope && participant.id === message.authorId);
  if (!error && !author?.domains.includes('CARAVAN')) error = 'AUTHOR_DOMAIN_MISMATCH';
  if (!error && reference) {
    try {
      const build = inspector.inspect(reference.id);
      if (!build) error = 'BUILD_NOT_FOUND';
      else if (build.digest !== reference.digest) error = 'BUILD_DIGEST_MISMATCH';
      else if (build.buildId !== reference.id || build.state !== 'UNADMITTED' || build.mode !== 'LOCAL_DEVELOPMENT' ||
          build.canonicalAdmission !== false || build.canonicalStateMutated !== false || build.identityResolved !== false ||
          build.releaseActivated !== false || build.independentlyVerified !== false || build.sourceTruthClaimed !== false) {
        error = 'BUILD_INSPECTION_FAILED';
      } else summary = { buildId: build.buildId, digest: build.digest, recordsRoot: build.recordsRoot,
        recordCount: build.recordCount, knownThrough: build.knownThrough, builtAt: build.builtAt, state: build.state };
    } catch { error = 'BUILD_INSPECTION_FAILED'; } // Never post paths, source identifiers or exception text.
  }
  return { schema: 'payload.candidate-build-review.v1', requestDigest: localRecordDigest(message), requestedBuild: reference,
    assessment: assessment(error), error, summary, ...NONCLAIMS };
}

/** Structural recovery validation, not authenticated authorship or a new inspection. */
function validateReport(body: string, message: BoardMessage): void {
  const parsed: unknown = JSON.parse(body);
  exactFields(parsed, ['schema', 'requestDigest', 'requestedBuild', 'assessment', 'error', 'summary', ...Object.keys(NONCLAIMS)]);
  const value = parsed as unknown as CandidateBuildReview;
  const reference = requestedBuild(message.body);
  if (value.schema !== 'payload.candidate-build-review.v1' || value.requestDigest !== localRecordDigest(message) ||
      localJson(value.requestedBuild) !== localJson(reference) ||
      Object.keys(NONCLAIMS).some((key) => parsed[key] !== false)) throw new Error('Invalid review binding or nonclaims.');
  const errors: ReviewError[] = ['INVALID_BUILD_REVIEW_REQUEST', 'AUTHOR_DOMAIN_MISMATCH', 'BUILD_NOT_FOUND', 'BUILD_DIGEST_MISMATCH', 'BUILD_INSPECTION_FAILED'];
  if (value.error !== null && !errors.includes(value.error)) throw new Error('Invalid review error.');
  if (value.assessment !== assessment(value.error)) throw new Error('Invalid review assessment.');
  if (value.error !== null) {
    if (value.summary !== null || (reference === null) !== (value.error === 'INVALID_BUILD_REVIEW_REQUEST')) throw new Error('Invalid refusal shape.');
    return;
  }
  exactFields(value.summary, ['buildId', 'digest', 'recordsRoot', 'recordCount', 'knownThrough', 'builtAt', 'state']);
  const summary = value.summary as BuildSummary;
  if (!reference || summary.buildId !== reference.id || summary.digest !== reference.digest || summary.state !== 'UNADMITTED' ||
      typeof summary.recordsRoot !== 'string' || !HASH.test(summary.recordsRoot) ||
      !Number.isSafeInteger(summary.recordCount) || summary.recordCount < 1 || summary.recordCount > 64 ||
      parseISOInstant(summary.knownThrough, 'knownThrough') > parseISOInstant(summary.builtAt, 'builtAt')) throw new Error('Invalid review summary.');
}

function checkSnapshot(snapshot: CoordinationSnapshot, scope?: string) {
  if (!snapshot.canWrite || snapshot.mode !== 'LOCAL_SANDBOX' || (scope !== undefined && snapshot.scope !== scope)) {
    throw new Error('Candidate inspection requires a writable local coordination sandbox with unchanged scope.');
  }
}

function savedResult(snapshot: CoordinationSnapshot, message: BoardMessage, requestId: string) {
  const previous = snapshot.messages.filter((result) => result.scope === message.scope && result.authorId === CANDIDATE_BUILD_REVIEWER_ID && result.requestId === requestId);
  if (previous.length === 0) return undefined;
  try {
    if (previous.length !== 1) throw new Error('Duplicate result.');
    const result = previous[0];
    if (result.kind !== 'RESULT' || result.title !== 'Candidate build inspection' || result.replyTo !== message.id || result.recipientId !== message.authorId ||
        result.topic !== message.topic || result.context !== null || result.sequence <= message.sequence) throw new Error('Invalid result routing.');
    validateReport(result.body, message);
    return result;
  } catch { throw new Error('A conflicting candidate inspection result already uses this worker request id.'); }
}

/** Bounded polling. Saved observations are validated and reused, never relabeled as a current check. */
export async function runCandidateBuildReviewOnce(client: WorkerClient, inspector: CandidateBuildInspector, limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error('Worker limit must be an integer from 1 to 25.');
  const initial = await client.snapshot();
  checkSnapshot(initial);
  checkSnapshot(await client.register(candidateBuildReviewerDefinition(initial.scope)), initial.scope);
  let processed = 0;
  let recovered = 0;
  let skipped = 0;
  let afterSequence = 0;
  for (let scan = 0; scan < 50; scan++) {
    const inbox = await client.inbox(CANDIDATE_BUILD_REVIEWER_ID, { afterSequence, limit: 100, includeAcknowledged: false, includeBroadcasts: false });
    if (inbox.scope !== initial.scope || inbox.participantId !== CANDIDATE_BUILD_REVIEWER_ID || inbox.mode !== 'LOCAL_SANDBOX' || !inbox.canWrite) {
      throw new Error('The inbox does not match the local worker assignment.');
    }
    for (const message of inbox.messages) {
      if (message.recipientId !== CANDIDATE_BUILD_REVIEWER_ID || message.scope !== initial.scope) throw new Error('The inbox returned a message outside the worker assignment.');
      if (!['REQUEST', 'HANDOFF'].includes(message.kind) || message.topic !== CANDIDATE_BUILD_REVIEW_TOPIC || message.context !== null) { skipped++; continue; }
      const snapshot = await client.snapshot();
      checkSnapshot(snapshot, initial.scope);
      // Require the exact durable input, not merely an inbox-provided assignment.
      if (!snapshot.messages.some((entry) => entry.id === message.id && localJson(entry) === localJson(message))) throw new Error('The input message does not match the saved board request.');
      const requestId = `${CANDIDATE_BUILD_REVIEWER_ID}:${message.id}`;
      let previous = savedResult(snapshot, message, requestId);
      if (!previous) {
        const body = JSON.stringify(report(message, inspector, snapshot));
        validateReport(body, message);
        if (body.length > 3500) throw new Error('Candidate inspection report exceeds the board limit.');
        let postError: unknown;
        try {
          await client.post({ requestId, authorId: CANDIDATE_BUILD_REVIEWER_ID, recipientId: message.authorId, kind: 'RESULT',
            topic: message.topic, title: 'Candidate build inspection', body, context: null, replyTo: message.id });
        } catch (error) { postError = error; }
        // A response is not a durable receipt; read back even after an uncertain post.
        const after = await client.snapshot();
        checkSnapshot(after, initial.scope);
        const committed = savedResult(after, message, requestId);
        if (!committed) throw postError ?? new Error('Candidate inspection result was not persisted; request remains pending.');
        if (postError) previous = committed;
      }
      const acknowledged = await client.acknowledge(message.id, CANDIDATE_BUILD_REVIEWER_ID);
      checkSnapshot(acknowledged, initial.scope);
      if (!acknowledged.acknowledgements.some((receipt) => receipt.messageId === message.id &&
          receipt.participantId === CANDIDATE_BUILD_REVIEWER_ID && receipt.scope === initial.scope)) {
        throw new Error('Candidate inspection acknowledgement was not confirmed; retry the saved result.');
      }
      if (previous) recovered++; else processed++;
      if (processed + recovered >= limit) return { processed, recovered, skipped, scanComplete: false };
    }
    if (!inbox.hasMore) return { processed, recovered, skipped, scanComplete: true };
    if (!Number.isSafeInteger(inbox.nextSequence) || inbox.nextSequence <= afterSequence) throw new Error('The inbox cursor did not advance.');
    afterSequence = inbox.nextSequence;
  }
  return { processed, recovered, skipped, scanComplete: false };
}
