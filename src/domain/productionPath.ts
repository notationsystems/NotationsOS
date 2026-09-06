/**
 * The production path as data: one continuous path from a source observation
 * to a versioned information product, in seven stages. Each stage's state is
 * derived from what the rails have actually produced (the production catalog,
 * run receipts, inspections, the source-capture readback) and from the
 * contracts that exist or do not. The browser derives no admission, no
 * identity and no release: where the path cannot continue, the stage names
 * the exact contract or authority that is missing and who owns it.
 */
import type { ProductionCorpusDefinition, ProductionObjectKind, ProductionOutputRef, ProductionRef, ProductionResult, ProductionRun, ProductionSourceConfig, ProductionStageName } from '@/production/contracts';
import type { ProductionDemo } from './production';

export const PATH_STAGES = ['source', 'acquisition', 'normalization', 'build', 'inspection', 'notation', 'release'] as const;
export type PathStageId = (typeof PATH_STAGES)[number];

/** Closed vocabulary. DEMONSTRATION is the committed demonstration standing in for a live object when the rail is not enabled on this origin. */
export const STAGE_STATES = ['READY', 'DONE', 'RUNNING', 'FAILED', 'QUARANTINED', 'WAITING', 'BLOCKED', 'DEMONSTRATION'] as const;
export type PathStageState = (typeof STAGE_STATES)[number];

export const STAGE_STATE_MEANING: Record<PathStageState, string> = {
  READY: 'The action at this stage can be taken now: its inputs exist and the rail is enabled on this origin.',
  DONE: 'The stage’s object exists, with an exact identifier and digest.',
  RUNNING: 'A request is in flight. HTTP 200 is not completion; the run’s state says what happened.',
  FAILED: 'The last run at this stage failed. Its receipt says what was retained and what to do.',
  QUARANTINED: 'Normalization refused the bytes under the fixed contract. The bytes and the quarantine are retained; there is no candidate.',
  WAITING: 'An earlier stage has not produced the input this stage needs.',
  BLOCKED: 'A contract or an authority the stage needs does not exist yet. The blocker names it.',
  DEMONSTRATION: 'The committed demonstration stands here; the local rail is not enabled on this origin.',
};

export const STAGE_LABEL: Record<PathStageId, { label: string; does: string }> = {
  source: { label: 'Source', does: 'An observation is taken from a declared source under an operator policy: bytes, a capture time, a receipt.' },
  acquisition: { label: 'Acquisition', does: 'The bytes enter the local evidence rail unchanged, with a content digest and an acquisition receipt, under an INGEST decision.' },
  normalization: { label: 'Normalization', does: 'A fixed adapter parses the captured bytes under a contract, under a separate DERIVE decision; a candidate or a quarantine.' },
  build: { label: 'Candidate build', does: 'Explicit members are assembled under a knowledge cutoff into an UNADMITTED build with a membership root.' },
  inspection: { label: 'Inspection', does: 'Every object is reopened by exact reference and its local integrity is recomputed. Nothing is repaired.' },
  notation: { label: 'Notation', does: 'An operator records an interpretation that refers to exact evidence. The reference copies nothing and promotes nothing.' },
  release: { label: 'Release', does: 'Admitted information is published as a versioned release with a certified manifest, separate from demonstration fixtures.' },
};

export type RunState = ProductionRun['state'];
export type StepKey = 'corpus' | 'source' | 'capture' | 'normalize' | 'build';
export const STEP_ORDER: readonly StepKey[] = ['corpus', 'source', 'capture', 'normalize', 'build'];
export const STEP_LABEL: Record<StepKey, { label: string; kind: 'REGISTER_CORPUS' | 'REGISTER_SOURCE' | 'ACQUIRE' | 'NORMALIZE' | 'BUILD_CANDIDATES'; output: ProductionObjectKind; verb: string }> = {
  corpus: { label: 'Register the corpus definition', kind: 'REGISTER_CORPUS', output: 'CORPUS', verb: 'Register corpus' },
  source: { label: 'Register the source configuration', kind: 'REGISTER_SOURCE', output: 'SOURCE', verb: 'Register source' },
  capture: { label: 'Capture the bytes', kind: 'ACQUIRE', output: 'ACQUISITION', verb: 'Capture' },
  normalize: { label: 'Normalize under the fixed adapter', kind: 'NORMALIZE', output: 'NORMALIZATION', verb: 'Normalize' },
  build: { label: 'Assemble the candidate build', kind: 'BUILD_CANDIDATES', output: 'CANDIDATE_BUILD', verb: 'Build candidates' },
};

/** The transport refusal envelope. Confirmed stage failures come back as HTTP 200 with run.state FAILED or QUARANTINED instead. */
export interface ProductionErrorBody { schema: 'payload.production-error.v1'; mode: 'LOCAL_DEVELOPMENT'; canonicalAdmission: false; error: { code: string; message: string; details?: unknown } }

export interface StepOutcome {
  requestId: string;
  status: 'IDLE' | 'RUNNING' | 'DONE' | 'FAILED';
  /** The rail's answer when the transport accepted the command. */
  result?: ProductionResult;
  /** The rail's refusal when it did not. */
  error?: { status: number; body: ProductionErrorBody | null };
}
export type PathSession = Record<StepKey, StepOutcome>;

export type RecoveryKind = 'RETRY_IDENTICAL' | 'NEW_IDENTITY' | 'INSPECT_OUTPUTS' | 'INSPECT_QUARANTINE' | 'REVIEW' | 'WAIT' | 'ENABLE_RAIL' | 'CHOOSE_ELIGIBLE_MEMBER' | 'CORRECT_INPUT';
export interface RecoveryAction { kind: RecoveryKind; label: string; why: string }

const RECOVERY: Record<RecoveryKind, Omit<RecoveryAction, 'why'>> = {
  RETRY_IDENTICAL: { kind: 'RETRY_IDENTICAL', label: 'Retry the identical request' },
  NEW_IDENTITY: { kind: 'NEW_IDENTITY', label: 'Use a new request identity' },
  INSPECT_OUTPUTS: { kind: 'INSPECT_OUTPUTS', label: 'Inspect the retained outputs' },
  INSPECT_QUARANTINE: { kind: 'INSPECT_QUARANTINE', label: 'Inspect the quarantine' },
  REVIEW: { kind: 'REVIEW', label: 'Operator review' },
  WAIT: { kind: 'WAIT', label: 'Wait, then retry the same request' },
  ENABLE_RAIL: { kind: 'ENABLE_RAIL', label: 'Enable the local rail on loopback' },
  CHOOSE_ELIGIBLE_MEMBER: { kind: 'CHOOSE_ELIGIBLE_MEMBER', label: 'Choose an eligible member' },
  CORRECT_INPUT: { kind: 'CORRECT_INPUT', label: 'Correct the input' },
};

/** The rail's remediation vocabulary, each code in plain words. A code not listed is shown verbatim, never dropped. */
export const REMEDIATION_MEANING: Record<string, { text: string; recovery: RecoveryKind }> = {
  INSPECT_RETAINED_OUTPUTS: { text: 'Inspect what was retained before starting anything else.', recovery: 'INSPECT_OUTPUTS' },
  INSPECT_QUARANTINE: { text: 'Inspect the quarantine: the bytes and the reasons are kept for reinspection.', recovery: 'INSPECT_QUARANTINE' },
  RETRY_IDENTICAL_REQUEST: { text: 'Retry the identical request to discover its historical outcome; nothing is re-executed.', recovery: 'RETRY_IDENTICAL' },
  USE_NEW_REQUEST_ID: { text: 'A new attempt needs a new request identity; the failed one stays as it is.', recovery: 'NEW_IDENTITY' },
  USE_NEW_REQUEST_ID_FOR_REMEDIATED_OPERATION: { text: 'After correcting the inputs, run the operation again under a new request identity.', recovery: 'NEW_IDENTITY' },
  CAPTURE_CORRECTED_SOURCE_UNDER_NEW_REQUEST_ID: { text: 'Capture corrected source bytes under a new request identity; the quarantined capture is not replaced.', recovery: 'CORRECT_INPUT' },
  REVIEW_EXACT_DEPENDENCIES_AND_DECLARED_POLICY: { text: 'Review the exact dependencies and the declared policy; nothing here is repaired automatically.', recovery: 'REVIEW' },
  VERIFY_OPERATOR_CLOCK: { text: 'The backend clock moved backwards; verify the operator clock before continuing.', recovery: 'REVIEW' },
  WAIT_FOR_ACTIVE_OPERATION_OR_USE_NEW_REQUEST_ID: { text: 'An operation is still running or was interrupted: wait for it, or start a new one under a new identity.', recovery: 'WAIT' },
  WAIT_FOR_ACTIVE_RESERVATION: { text: 'A catalog reservation is active; retry without deleting a live lock.', recovery: 'WAIT' },
  OPERATOR_VERIFY_OWNER_BEFORE_LOCK_RECOVERY: { text: 'A stale lock needs an operator to confirm no owner is alive before it is removed. Never removed here.', recovery: 'REVIEW' },
};

/** Transport refusals, each with its meaning and the recovery it permits. Confirmed stage failures carry their own remediation. */
export const ERROR_MEANING: Record<string, { text: string; recovery: RecoveryKind[] }> = {
  LOCAL_MODE_DISABLED: { text: 'The local production service is not enabled on this origin.', recovery: ['ENABLE_RAIL'] },
  LOCAL_ONLY: { text: 'The rail answers only the same loopback origin it was started on.', recovery: ['ENABLE_RAIL'] },
  ORIGIN_MISMATCH: { text: 'The request came from another origin.', recovery: ['ENABLE_RAIL'] },
  INVALID_REQUEST: { text: 'The command did not match the closed contract.', recovery: ['CORRECT_INPUT'] },
  INVALID_CONTENT_TYPE: { text: 'The rail takes application/json only.', recovery: ['CORRECT_INPUT'] },
  BODY_TOO_LARGE: { text: 'The request exceeds the rail’s byte limit.', recovery: ['CORRECT_INPUT'] },
  BODY_TIMEOUT: { text: 'The request body did not complete in time.', recovery: ['RETRY_IDENTICAL'] },
  REQUEST_CONFLICT: { text: 'This request identity already names different inputs. Identities are never reassigned.', recovery: ['NEW_IDENTITY'] },
  REGISTRATION_CONFLICT: { text: 'This registration identifier already names a different definition.', recovery: ['NEW_IDENTITY'] },
  OPERATION_INCOMPLETE: { text: 'An operation under this identity is still running or was interrupted. It is never rerun blindly.', recovery: ['INSPECT_OUTPUTS', 'WAIT', 'NEW_IDENTITY'] },
  PRODUCTION_BUSY: { text: 'The worker limit or a catalog reservation is occupied.', recovery: ['WAIT'] },
  WORKER_UNAVAILABLE: { text: 'The fixed local worker could not be started.', recovery: ['REVIEW'] },
  WORKER_OUTPUT_LIMIT: { text: 'The worker’s output exceeded its cap.', recovery: ['REVIEW'] },
  EXECUTION_TIMEOUT: { text: 'The worker did not finish in time. Retained state is discovered by retrying the same identity, never by re-executing.', recovery: ['RETRY_IDENTICAL', 'INSPECT_OUTPUTS'] },
  RUN_SAVE_UNCONFIRMED: { text: 'The stage may have retained outputs, but its final receipt is unconfirmed.', recovery: ['RETRY_IDENTICAL', 'INSPECT_OUTPUTS'] },
  LOCAL_STORAGE_UNAVAILABLE: { text: 'The local evidence root could not be used.', recovery: ['REVIEW'] },
  LOCAL_PRODUCTION_UNAVAILABLE: { text: 'The local operation could not be confirmed.', recovery: ['INSPECT_OUTPUTS', 'RETRY_IDENTICAL'] },
  CATALOG_CAPACITY: { text: 'The catalog is at its bounded capacity; there is no automatic archive.', recovery: ['REVIEW'] },
  OPERATION_UNAVAILABLE: { text: 'This operation is not available on this rail.', recovery: ['REVIEW'] },
  INGEST_DISALLOWED: { text: 'The declared policy does not allow INGEST for this purpose, operation and audience now. No artifact and no receipt were written.', recovery: ['REVIEW'] },
  DERIVATION_DISALLOWED: { text: 'The declared policy does not allow DERIVE now. Earlier outputs are preserved.', recovery: ['REVIEW'] },
  PURPOSE_NOT_DECLARED: { text: 'The purpose is not among the declared ones.', recovery: ['CORRECT_INPUT'] },
  MEMBER_NOT_ELIGIBLE: { text: 'A member is not eligible for assembly: a quarantine has no candidate.', recovery: ['CHOOSE_ELIGIBLE_MEMBER'] },
  SOURCE_BINDING_MISMATCH: { text: 'The exact source, corpus or adapter bindings do not agree.', recovery: ['CORRECT_INPUT'] },
  REFERENCE_MISMATCH: { text: 'The reference’s digest does not match the object it names.', recovery: ['CORRECT_INPUT'] },
  REFERENCE_NOT_FOUND: { text: 'No object exists under this exact reference.', recovery: ['CORRECT_INPUT'] },
  DEPENDENCY_INTEGRITY_FAILED: { text: 'The object or its upstream evidence did not verify. Corrupt dependencies block inspection; nothing is repaired.', recovery: ['REVIEW'] },
  EVIDENCE_INTEGRITY_FAILED: { text: 'The retained content did not verify.', recovery: ['REVIEW'] },
  STORED_RECORD_INVALID: { text: 'A stored record failed local integrity checks; no record was changed.', recovery: ['REVIEW'] },
  CLOCK_ORDER_INVALID: { text: 'The backend clock moved backwards during the run.', recovery: ['INSPECT_OUTPUTS', 'REVIEW', 'NEW_IDENTITY'] },
  SOURCE_CAPTURE_NOT_FOUND: { text: 'No stored source capture has this request identifier in the operator’s qualification root on this machine.', recovery: ['REVIEW'] },
  CENSUS_NORMALIZATION_NOT_FOUND: { text: 'No stored FMCSA normalization has this identifier in the operator’s qualification root on this machine.', recovery: ['REVIEW'] },
  CENSUS_BUILD_NOT_FOUND: { text: 'No stored FMCSA candidate build has this identifier in the operator’s qualification root on this machine.', recovery: ['REVIEW'] },
  SOURCE_HISTORY_INVALID: { text: 'Stored source history failed local integrity checks; nothing was changed.', recovery: ['REVIEW'] },
};

const RECOVERY_WHY: Record<RecoveryKind, string> = {
  RETRY_IDENTICAL: 'The same identity returns the historical outcome after dependency reinspection; no transformation runs again and no permission is granted.',
  NEW_IDENTITY: 'An intentional new attempt is a new request; the earlier one keeps its receipt and is never replaced.',
  INSPECT_OUTPUTS: 'Every retained output is reachable by exact reference and its integrity is recomputed on inspection.',
  INSPECT_QUARANTINE: 'The quarantined bytes are retained with their reasons; the same parser must refuse them again.',
  REVIEW: 'An operator decides. Nothing here deletes history, repairs a record or removes a lock.',
  WAIT: 'The rail is bounded: two workers, one catalog reservation. The same request can be sent again.',
  ENABLE_RAIL: 'npm run dev:production starts the flagged service on 127.0.0.1; use that origin.',
  CHOOSE_ELIGIBLE_MEMBER: 'Only a NORMALIZED run has a candidate; a QUARANTINED one cannot be a member.',
  CORRECT_INPUT: 'Corrected input is a new request under a new identity; a refused command wrote nothing, and a quarantined capture keeps its bytes and its receipt.',
};

export function recovery(kind: RecoveryKind): RecoveryAction { return { ...RECOVERY[kind], why: RECOVERY_WHY[kind] }; }

/** Recovery for a run the rail confirmed as FAILED or QUARANTINED: from its retry policy and its remediation, in that order, without duplicates. */
export function runRecovery(run: ProductionRun): RecoveryAction[] {
  if (!run.failure) return [];
  const kinds: RecoveryKind[] = [];
  const add = (kind: RecoveryKind) => { if (!kinds.includes(kind)) kinds.push(kind); };
  if (run.state === 'QUARANTINED') add('INSPECT_QUARANTINE');
  if (run.failure.retry.sameRequest) add('RETRY_IDENTICAL');
  for (const code of run.failure.remediation) { const known = REMEDIATION_MEANING[code]; if (known) add(known.recovery); }
  if (run.failure.retry.newRequestRequired) add('NEW_IDENTITY');
  return kinds.map(recovery);
}

/** Recovery for a transport refusal, from its code. Unknown codes offer review only. */
export function errorRecovery(code: string): RecoveryAction[] {
  return (ERROR_MEANING[code]?.recovery ?? ['REVIEW']).map(recovery);
}

export function remediationText(code: string): string { return REMEDIATION_MEANING[code]?.text ?? code; }
export function errorText(code: string, fallback: string): string { return ERROR_MEANING[code]?.text ?? fallback; }

/** One name, five identities. The rail's identifier rule is applied here so a refused name never reaches it. */
export const RUN_NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,99}$/;
export function requestIds(name: string): Record<StepKey, string> {
  if (!RUN_NAME_RULE.test(name)) throw new Error('A run name is 1 to 100 characters: letters, digits, and : _ . -; it starts with a letter or a digit.');
  return { corpus: `${name}-corpus`, source: `${name}-source`, capture: `${name}-capture`, normalize: `${name}-normalize`, build: `${name}-build` };
}
/** A new identity for one step: the same name with an attempt suffix, so the failed request stays under its own. */
export function nextAttemptName(name: string): string {
  const match = /^(.*)-a(\d+)$/.exec(name);
  return match ? `${match[1]}-a${Number(match[2]) + 1}` : `${name}-a2`;
}

export function outputOf(result: ProductionResult | undefined, kind: ProductionObjectKind): ProductionOutputRef | null {
  return result?.run.outputs.find((output) => output.kind === kind) ?? null;
}

/** Browser-safe base64 of UTF-8 text, the encoding the ACQUIRE command carries. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function byteLength(text: string): number { return new TextEncoder().encode(text).byteLength; }

export function emptySession(name: string): PathSession {
  const ids = requestIds(name);
  return { corpus: { requestId: ids.corpus, status: 'IDLE' }, source: { requestId: ids.source, status: 'IDLE' }, capture: { requestId: ids.capture, status: 'IDLE' }, normalize: { requestId: ids.normalize, status: 'IDLE' }, build: { requestId: ids.build, status: 'IDLE' } };
}

/** Which step can be sent now: its inputs are exact references produced by completed earlier steps. */
export function stepInputs(session: PathSession): Record<StepKey, { ready: boolean; missing: string[] }> {
  const corpus = outputOf(session.corpus.result, 'CORPUS');
  const source = outputOf(session.source.result, 'SOURCE');
  const acquisition = outputOf(session.capture.result, 'ACQUISITION');
  const normalization = session.normalize.result?.run.state === 'COMPLETED' ? outputOf(session.normalize.result, 'NORMALIZATION') : null;
  const need = (pairs: Array<[string, unknown]>) => { const missing = pairs.filter(([, value]) => !value).map(([label]) => label); return { ready: missing.length === 0, missing }; };
  return {
    corpus: { ready: true, missing: [] },
    source: need([['corpus reference', corpus]]),
    capture: need([['source reference', source]]),
    normalize: need([['source reference', source], ['acquisition reference', acquisition]]),
    build: need([['corpus reference', corpus], ['a NORMALIZED member', normalization]]),
  };
}

export interface Blocker { what: string; owner: string; remedy: string }
/** What stops the path beyond the rail today. Owners are the contracts, not people. */
export const BLOCKERS: Record<'notation' | 'release' | 'fmcsaRail' | 'railDisabled', Blocker> = {
  notation: { what: 'The notation kernel’s closed command set has no ATTACH_EVIDENCE_REFERENCE or DETACH_EVIDENCE_REFERENCE; a saved notation cannot carry a reference yet.', owner: 'Notation state kernel contract (docs/NOTATION_WORKSPACE.md, backend contract request)', remedy: 'The two commands, validated by Rust, with a references list per notation; resolution stays in the application.' },
  release: { what: 'No admission authority exists: no versioned profile evaluates a candidate build and records admission, refusal or unresolved requirements, so nothing can enter a release. Every build stays UNADMITTED and the release history is the committed corpus.', owner: 'Admission contract (docs/CROSS_REPOSITORY_BASELINE.md: one authoritative route for evaluation, identity, version history and release eligibility)', remedy: 'A reviewed, committed admission contract; then an internal release separate from demonstration fixtures.' },
  fmcsaRail: { what: 'The real observation continues only by operator command: the FMCSA adapter (fmcsa.company-census-observation/v1) normalizes a retained capture into a typed, UNADMITTED candidate and the v2 build assembles exact references, both over the qualification root through npm run source. Neither is on the HTTP rail, so this page reads them back and cannot run them; the rail’s NORMALIZE still takes only caravan.carrier-json/v1 and payload.ifc-artifact/v1.', owner: 'Real-source continuity (docs/REAL_SOURCE_CONTINUITY.md) and the local production rail (docs/LOCAL_PRODUCTION_WORKFLOW.md)', remedy: 'Either the rail exposes the census operations under its identity discipline, or the real source stays operator-command only by design and the path stays read-only for it; then an admission contract, which no build has yet.' },
  railDisabled: { what: 'The local production rail is not enabled on this origin, so nothing can be registered, captured, normalized, built or inspected here.', owner: 'Operator (PAYLOAD_PRODUCTION_LOCAL=1 on loopback)', remedy: 'npm run dev:production, then open this page at http://127.0.0.1:<port>/production.' },
};

export interface StageView {
  id: PathStageId; label: string; does: string;
  state: PathStageState; detail: string;
  /** The exact object standing at this stage, when one does. */
  object: ProductionOutputRef | null;
  /** The run that produced or refused it. */
  run: { id: string; state: RunState | 'REFUSED'; digest: string | null } | null;
  blocker: Blocker | null;
  recovery: RecoveryAction[];
  /** For DEMONSTRATION states: where the committed object is shown. */
  href: string | null;
}

export interface SourceReadbackSummary { state: 'CAPTURED' | 'QUARANTINED' | 'FAILED' | 'INCOMPLETE'; requestId: string; capturedAt: string | null; records: number; notReturned: number }
/** What the operator's normalization and build readbacks say, when they exist on this machine. */
export interface SourceContinuationSummary { normalization: { status: 'FOUND'; state: 'NORMALIZED' | 'NOT_RETURNED'; id: string } | { status: 'NOT_FOUND' | 'ERROR' | 'LOADING'; code?: string }; build: { status: 'FOUND'; state: 'UNADMITTED'; id: string; recordCount: number } | { status: 'NOT_FOUND' | 'ERROR' | 'LOADING'; code?: string } }
export interface PathContext {
  mode: 'LOCAL' | 'FIXTURE';
  session: PathSession;
  /** The real source readback, when the rail is enabled and the operator's capture exists on this machine. */
  sourceReadback: { status: 'LOADING' | 'FOUND' | 'NOT_FOUND' | 'ERROR'; summary?: SourceReadbackSummary; code?: string; continuation?: SourceContinuationSummary } | null;
  demo: ProductionDemo;
}

function stepRun(step: StepOutcome): StageView['run'] {
  if (step.result) return { id: step.result.run.id, state: step.result.run.state, digest: step.result.run.digest };
  if (step.error) return { id: step.requestId, state: 'REFUSED', digest: null };
  return null;
}

function stepState(step: StepOutcome, ready: boolean): { state: PathStageState; detail: string; recovery: RecoveryAction[] } {
  if (step.status === 'RUNNING') return { state: 'RUNNING', detail: `Request ${step.requestId} is in flight.`, recovery: [] };
  if (step.error) return { state: 'FAILED', detail: `The rail refused ${step.requestId}: ${step.error.body?.error.code ?? `HTTP ${step.error.status}`}.`, recovery: errorRecovery(step.error.body?.error.code ?? '') };
  const run = step.result?.run;
  if (run?.state === 'COMPLETED') return { state: 'DONE', detail: step.result?.historicalRetry ? `Historical retry: the original receipt of ${run.id}, no new execution.` : `Run ${run.id} completed.`, recovery: [] };
  if (run?.state === 'QUARANTINED') return { state: 'QUARANTINED', detail: `Run ${run.id}: ${run.failure?.code ?? 'QUARANTINED'}; bytes retained, no candidate.`, recovery: runRecovery(run) };
  if (run?.state === 'FAILED') return { state: 'FAILED', detail: `Run ${run.id}: ${run.failure?.code ?? 'FAILED'}.`, recovery: runRecovery(run) };
  return ready ? { state: 'READY', detail: 'Inputs are exact references; the command can be sent.', recovery: [] } : { state: 'WAITING', detail: 'An earlier step has not produced the reference this one needs.', recovery: [] };
}

/** The seven stages, derived. Pure: the same context yields the same views. */
export function deriveStages(context: PathContext): StageView[] {
  const { mode, session, demo } = context;
  const base = (id: PathStageId): Pick<StageView, 'id' | 'label' | 'does' | 'object' | 'run' | 'blocker' | 'recovery' | 'href'> => ({ id, label: STAGE_LABEL[id].label, does: STAGE_LABEL[id].does, object: null, run: null, blocker: null, recovery: [], href: null });
  if (mode === 'FIXTURE') {
    const acquisition = demo.acquisitions[0]; const normalized = demo.normalizations.find((run) => run.state === 'NORMALIZED'); const build = demo.builds[0];
    return [
      { ...base('source'), state: 'DEMONSTRATION', detail: `${demo.inputs.length} committed inputs; the FMCSA capture is readable only where the rail is enabled.`, href: '/candidates#cp-acquisitions' },
      { ...base('acquisition'), state: 'DEMONSTRATION', detail: `${demo.acquisitions.length} acquisitions in the committed demonstration${acquisition ? `, first ${acquisition.request.manifest.acquisitionId}` : ''}.`, href: '/candidates#cp-acquisitions' },
      { ...base('normalization'), state: 'DEMONSTRATION', detail: `${demo.normalizations.filter((run) => run.state === 'NORMALIZED').length} candidate, ${demo.normalizations.filter((run) => run.state === 'QUARANTINED').length} quarantine${normalized ? `; ${normalized.request.manifest.normalizationId}` : ''}.`, href: '/candidates#cp-normalizations' },
      { ...base('build'), state: 'DEMONSTRATION', detail: build ? `${build.buildId}, ${build.recordCount} member, UNADMITTED.` : 'No build in the demonstration.', href: '/candidates#cp-builds' },
      { ...base('inspection'), state: 'DEMONSTRATION', detail: 'Every demonstration object is inspectable on the candidates page; live inspection needs the rail.', href: '/candidates' },
      { ...base('notation'), state: 'BLOCKED', detail: 'A reference can be shown, not attached.', blocker: BLOCKERS.notation, href: '/notations' },
      { ...base('release'), state: 'BLOCKED', detail: 'Nothing here is admitted; the release history is the committed corpus.', blocker: BLOCKERS.release, href: '/releases' },
    ];
  }
  const inputs = stepInputs(session);
  const capture = stepState(session.capture, inputs.capture.ready);
  const normalize = stepState(session.normalize, inputs.normalize.ready);
  const build = stepState(session.build, inputs.build.ready);
  const registered = session.corpus.result && session.source.result;
  const readback = context.sourceReadback;
  const continuation = readback?.continuation;
  // A readback that was refused or could not be reached is not a missing record: the summary keeps the three apart, as the card does.
  const word = (entry: { status: 'FOUND' | 'NOT_FOUND' | 'ERROR' | 'LOADING'; code?: string }, found: string) =>
    entry.status === 'FOUND' ? found : entry.status === 'LOADING' ? 'reading' : entry.status === 'NOT_FOUND' ? 'not on this machine' : `readback refused (${entry.code ?? 'error'})`;
  const continued = continuation ? ` Operator normalization ${word(continuation.normalization, continuation.normalization.status === 'FOUND' ? continuation.normalization.state : '')}; candidate build ${word(continuation.build, continuation.build.status === 'FOUND' ? `${continuation.build.state}, ${continuation.build.recordCount} member${continuation.build.recordCount === 1 ? '' : 's'}` : '')}. Not on the HTTP rail.` : ' Not on the HTTP rail.';
  const sourceDetail = readback?.status === 'FOUND' && readback.summary
    ? `FMCSA capture ${readback.summary.requestId}: ${readback.summary.state}, ${readback.summary.records} record${readback.summary.records === 1 ? '' : 's'}, ${readback.summary.notReturned} not returned.${continued}`
    : readback?.status === 'NOT_FOUND' ? 'The synthetic Carrier bytes are ready to capture. The FMCSA capture is not in this machine’s qualification root.'
      : readback?.status === 'ERROR' ? `The FMCSA readback was refused: ${readback.code ?? 'error'}.` : 'The synthetic Carrier bytes are ready to capture.';
  const inspectionDone = [session.capture, session.normalize, session.build].some((step) => step.result);
  return [
    { ...base('source'), state: readback?.status === 'FOUND' ? 'DONE' : 'READY', detail: sourceDetail, blocker: readback?.status === 'FOUND' ? BLOCKERS.fmcsaRail : null },
    { ...base('acquisition'), state: registered ? capture.state : stepState(session.capture, false).state, detail: registered ? capture.detail : 'Register the corpus and the source first.', object: outputOf(session.capture.result, 'ACQUISITION'), run: stepRun(session.capture), recovery: capture.recovery },
    { ...base('normalization'), state: normalize.state, detail: normalize.detail, object: session.normalize.result?.run.state === 'COMPLETED' ? outputOf(session.normalize.result, 'NORMALIZATION') : null, run: stepRun(session.normalize), recovery: normalize.recovery },
    { ...base('build'), state: build.state, detail: build.detail, object: outputOf(session.build.result, 'CANDIDATE_BUILD'), run: stepRun(session.build), recovery: build.recovery },
    { ...base('inspection'), state: inspectionDone ? 'READY' : 'WAITING', detail: inspectionDone ? 'Every output above can be reopened by exact reference; integrity is recomputed on each inspection.' : 'Nothing to inspect until a run has produced an output.' },
    { ...base('notation'), state: 'BLOCKED', detail: outputOf(session.build.result, 'CANDIDATE_BUILD') ? 'The reference the workspace would attach is shown below; attachment is disabled by the backend contract.' : 'A reference needs an exact object; none is built yet.', blocker: BLOCKERS.notation, href: '/notations' },
    { ...base('release'), state: 'BLOCKED', detail: 'Every build here is UNADMITTED; no release activates.', blocker: BLOCKERS.release, href: '/releases' },
  ];
}

export const PRODUCTION_STAGE_LABEL: Record<ProductionStageName, string> = {
  REGISTRATION: 'Registration', CAPTURE: 'Capture', EVIDENCE_INSPECTION: 'Evidence inspection', EXTRACTION: 'Extraction', NORMALIZATION: 'Normalization', CANDIDATE_ASSEMBLY: 'Candidate assembly', BUILD_INSPECTION: 'Build inspection',
};

/** The reference a notation would carry for a build, in the frontend's contract, ready to show and to copy. Attachment does not exist; this promotes nothing. */
export function buildReference(build: ProductionOutputRef, run: ProductionRun, notationId = '(unsaved)') {
  return {
    schema: 'payload.notation-evidence-reference.v0' as const, referenceId: `ref:${build.id}`, notationId, kind: 'CANDIDATE_BUILD' as const,
    targetId: build.id, digest: build.digest, context: { domain: 'CARAVAN' as const, buildId: build.id },
    temporal: { builtAt: run.completedAt }, interpretation: { text: '', authoredAt: run.completedAt },
    attachment: 'DISABLED' as const,
  };
}

export type { ProductionCorpusDefinition, ProductionSourceConfig, ProductionRef, ProductionOutputRef, ProductionResult, ProductionRun };
