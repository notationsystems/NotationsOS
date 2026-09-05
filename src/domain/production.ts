/**
 * Candidate production: the view model over Payload OS's local rails
 * (acquisition → normalization → candidate build). Browser-safe: only types
 * are taken from src/data-os, whose implementations use node:crypto and the
 * filesystem. Every record here is UNADMITTED. None of it is corpus
 * inventory, none of it is in a release, and the customer feed cannot
 * return it; the separation is asserted by src/fixtures/production tests.
 */
import type { LocalAcquisition } from '@/data-os/local-intake';
import type { LocalCarrierCandidate, LocalNormalizationRun } from '@/data-os/local-normalization';
import type { LocalCandidateBuild } from '@/data-os/local-candidate-build';

export type { LocalAcquisition, LocalCarrierCandidate, LocalNormalizationRun, LocalCandidateBuild };

/** A step the rail refused. The error text is the rail's own; the code is its first token. */
export interface ProductionRefusal {
  step: 'NORMALIZE' | 'BUILD';
  requestId: string;
  error: string;
}

export interface ProductionDemo {
  schema: 'payload-os.production-demo.v0';
  fixture_only: true;
  mode: 'LOCAL_DEVELOPMENT';
  /** The explicit instants the demonstration was produced with. Nothing reads the wall clock. */
  instants: { capturedAt: string; storedAt: string; normalizedAt: string; knownThrough: string; builtAt: string; earlyCutoff: string };
  contracts: { adapter: { id: string; version: string }; candidateBuild: { id: string; version: string } };
  inputs: Array<{ path: string; contentDigest: string; byteLength: number }>;
  acquisitions: LocalAcquisition[];
  normalizations: LocalNormalizationRun[];
  builds: LocalCandidateBuild[];
  refusals: ProductionRefusal[];
}

export const PRODUCTION_SCHEMA = 'payload-os.production-demo.v0' as const;

/** What the rails state they do not do. Rendered verbatim; never softened. */
export const NON_CLAIM_LABEL = {
  canonicalAdmission: 'Canonical admission',
  canonicalStateMutated: 'Canonical state mutated',
  identityResolved: 'Identity resolved',
  releaseActivated: 'Release activated',
  sourceTruthClaimed: 'Source truth claimed',
  fieldAccuracyClaimed: 'Field accuracy claimed',
  independentlyVerified: 'Independently verified',
  completenessClaimed: 'Completeness claimed',
} as const;
export type NonClaimKey = keyof typeof NON_CLAIM_LABEL;

/** The keys a record carries with the value `false`, in a fixed order. */
export function nonClaims(record: object): Array<{ key: NonClaimKey; label: string }> {
  const out: Array<{ key: NonClaimKey; label: string }> = [];
  for (const key of Object.keys(NON_CLAIM_LABEL) as NonClaimKey[]) {
    if ((record as Record<string, unknown>)[key] === false) out.push({ key, label: NON_CLAIM_LABEL[key] });
  }
  return out;
}

export const REFUSAL_MEANING: Record<string, string> = {
  DERIVATION_NOT_ALLOWED: 'The source registration permits INGEST but not DERIVE for this purpose and audience, so no normalization run was written. Capture alone does not license derivation.',
  MEMBER_NOT_ELIGIBLE: 'A selected normalization is not a NORMALIZED Carrier candidate (a quarantine has no candidate), so the build was refused and nothing was written.',
  MEMBER_AFTER_CUTOFF: 'A selected candidate became known after the requested knowledge cutoff. The cutoff is not advanced; the build is refused.',
  SOURCE_IDENTITY_CONFLICT: 'Two selected candidates name the same source-scoped record. No automatic revision selection exists.',
  SOURCE_CLASS_NOT_DECLARED: 'A member comes from a source class the build definition did not declare.',
  BUILD_DERIVATION_NOT_ALLOWED: 'DERIVE at build time was not ALLOWED for a member.',
};

export function refusalCode(error: string): string {
  const i = error.indexOf(':');
  return i > 0 ? error.slice(0, i) : error;
}

export function refusalMeaning(error: string): string {
  return REFUSAL_MEANING[refusalCode(error)] ?? 'The rail refused the step and wrote nothing.';
}

/** Knowledge-time discipline for a build: member knownAt ≤ cutoff ≤ builtAt, member by member. */
export function cutoffChecks(build: LocalCandidateBuild): Array<{ normalizationId: string; knownAt: string; withinCutoff: boolean }> {
  return build.members.map((m) => ({
    normalizationId: m.normalization.id,
    knownAt: m.knownAt,
    withinCutoff: m.knownAt <= build.knownThrough && build.knownThrough <= build.builtAt,
  }));
}

export function candidateOf(run: LocalNormalizationRun): LocalCarrierCandidate | null {
  return run.state === 'NORMALIZED' ? run.candidate : null;
}

export function acquisitionById(demo: ProductionDemo, acquisitionId: string): LocalAcquisition | undefined {
  return demo.acquisitions.find((a) => a.request.manifest.acquisitionId === acquisitionId);
}

export function normalizationById(demo: ProductionDemo, normalizationId: string): LocalNormalizationRun | undefined {
  return demo.normalizations.find((n) => n.request.manifest.normalizationId === normalizationId);
}

export function pipelineSummary(demo: ProductionDemo) {
  return {
    acquisitions: demo.acquisitions.length,
    normalized: demo.normalizations.filter((n) => n.state === 'NORMALIZED').length,
    quarantined: demo.normalizations.filter((n) => n.state === 'QUARANTINED').length,
    builds: demo.builds.length,
    refusals: demo.refusals.length,
    members: demo.builds.reduce((n, b) => n + b.recordCount, 0),
  };
}

/** Rendered on the page and asserted by the separation test. */
export const PRODUCTION_BOUNDARY = [
  'Every record on this rail is UNADMITTED. Canonical admission is a separate act by the corpus apparatus; nothing here performs it.',
  'Nothing here is in any corpus release. REL-CAR-2026.09.01 and its predecessor are unchanged by this rail.',
  'The customer feed (/api/v1) and the MCP tools cannot return a candidate, a normalization run or a candidate build.',
  'Identity is source-scoped and UNRESOLVED: canonicalId is null on every candidate. A board message or a build cannot resolve it.',
  'Source truth and field accuracy are not claimed. The adapter parsed declared bytes under a fixed contract; it did not verify the world.',
  'Authorization is an operator declaration evaluated by the source-use policy at each step. It is not an independently verified licence.',
] as const;

/**
 * Identifiers and digests that must never appear in a customer-feed payload
 * or an MCP tool result. Used by the separation test.
 */
export function separationTerms(demo: ProductionDemo): string[] {
  const terms = new Set<string>();
  for (const a of demo.acquisitions) {
    terms.add(a.request.manifest.acquisitionId);
    terms.add(a.request.manifest.evidenceId);
    terms.add(a.request.contentDigest);
    terms.add(a.capture.receipt.receiptId);
    terms.add(a.digest);
  }
  for (const n of demo.normalizations) {
    terms.add(n.request.manifest.normalizationId);
    terms.add(n.digest);
    if (n.candidate) { terms.add(n.candidate.candidateId); terms.add(n.candidate.digest); terms.add(n.candidate.identity.sourceRecordId); }
  }
  for (const b of demo.builds) { terms.add(b.buildId); terms.add(b.digest); terms.add(b.recordsRoot); terms.add(b.definitionDigest); }
  return [...terms];
}

/* ═══ Acquisition as an observable process ═══ */

export type SelectionKind = 'acquisition' | 'normalization' | 'build' | 'refusal';
export type StageId = 'COLLECTION' | 'EXTRACTION' | 'NORMALIZATION' | 'READINESS';

/** A number on the screen and the field of the demonstration it is read from. No metric without a source. */
export interface StageMetric { label: string; value: number; source: string }
export interface StageInstant { label: string; at: string; clock: string }
export interface ProcessStage { id: StageId; label: string; does: string; recordedAs: string; anchor: string; metrics: StageMetric[]; instants: StageInstant[] }

/**
 * The four things the brief tells apart, read from what the rail records.
 * Extraction and normalization are one recorded run on this rail: the
 * adapter parses and emits under one contract, and the run's reasons say
 * which part refused. The screen says so rather than inventing a step.
 */
export function processStages(demo: ProductionDemo): ProcessStage[] {
  const normalizeRefusals = demo.refusals.filter((r) => r.step === 'NORMALIZE');
  const buildRefusals = demo.refusals.filter((r) => r.step === 'BUILD');
  const candidates = demo.normalizations.filter((n) => n.state === 'NORMALIZED');
  const quarantines = demo.normalizations.filter((n) => n.state === 'QUARANTINED');
  const members = demo.builds.flatMap((b) => b.members);
  const within = demo.builds.flatMap((b) => cutoffChecks(b)).filter((c) => c.withinCutoff).length;
  return [
    {
      id: 'COLLECTION', label: 'Collection', anchor: 'cp-acquisitions',
      does: 'Bytes captured under a declared policy and an INGEST decision, stored by content digest, receipted.',
      recordedAs: 'one acquisition record per capture',
      metrics: [
        { label: 'captures', value: demo.acquisitions.length, source: 'acquisitions[]' },
        { label: 'INGEST allowed', value: demo.acquisitions.filter((a) => a.decision.state === 'ALLOWED').length, source: 'acquisitions[].decision.state' },
        { label: 'receipts', value: demo.acquisitions.filter((a) => a.capture.receipt.receiptId).length, source: 'acquisitions[].capture.receipt' },
        { label: 'bytes stored', value: demo.acquisitions.reduce((n, a) => n + a.capture.evidence.byteLength, 0), source: 'acquisitions[].capture.evidence.byteLength' },
      ],
      instants: [
        { label: 'captured', at: demo.instants.capturedAt, clock: 'capture time, as the request declared it' },
        { label: 'stored', at: demo.instants.storedAt, clock: 'record time, when the store wrote the receipt' },
      ],
    },
    {
      id: 'EXTRACTION', label: 'Extraction', anchor: 'cp-normalizations',
      does: 'The adapter parses the captured bytes under its fixed contract, after a DERIVE decision of its own. Extraction and normalization are one recorded run here; the run’s reasons say which part refused.',
      recordedAs: 'the normalization run’s state and reasons; a refusal before the run writes nothing',
      metrics: [
        { label: 'runs requested', value: demo.normalizations.length + normalizeRefusals.length, source: 'normalizations[] + refusals[step=NORMALIZE]' },
        { label: 'parsed under contract', value: candidates.length, source: 'normalizations[].reasons = CONTRACT_MATCH' },
        { label: 'refused by the contract', value: quarantines.length, source: 'normalizations[].state = QUARANTINED' },
        { label: 'refused before parsing', value: normalizeRefusals.length, source: 'refusals[step=NORMALIZE]' },
      ],
      instants: [{ label: 'normalized', at: demo.instants.normalizedAt, clock: 'run time; also assigned as the candidate’s knowledge time' }],
    },
    {
      id: 'NORMALIZATION', label: 'Normalization', anchor: 'cp-normalizations',
      does: 'A source-scoped candidate with the contract’s fields, missing fields listed by name, identity UNRESOLVED, valid time only if the source asserted one.',
      recordedAs: 'the candidate inside a NORMALIZED run',
      metrics: [
        { label: 'candidates', value: candidates.length, source: 'normalizations[].candidate' },
        { label: 'fields missing', value: candidates.reduce((n, c) => n + (c.candidate?.missingFields.length ?? 0), 0), source: 'candidate.missingFields[]' },
        { label: 'identity unresolved', value: candidates.filter((c) => c.candidate?.identity.state === 'UNRESOLVED').length, source: 'candidate.identity.state' },
        { label: 'valid time unobserved', value: candidates.filter((c) => c.candidate?.validTime.state === 'UNOBSERVED').length, source: 'candidate.validTime.state' },
      ],
      instants: [{ label: 'known at', at: demo.instants.normalizedAt, clock: 'knowledge time, assigned by the run after storage' }],
    },
    {
      id: 'READINESS', label: 'Candidate readiness', anchor: 'cp-builds',
      does: 'A build names its members, reopens each one, checks source class and knowledge cutoff, evaluates DERIVE again, and publishes a membership root. It stays UNADMITTED.',
      recordedAs: 'one candidate build per accepted request; a refused build writes nothing',
      metrics: [
        { label: 'builds', value: demo.builds.length, source: 'builds[]' },
        { label: 'members', value: members.length, source: 'builds[].members[]' },
        { label: 'within cutoff', value: within, source: 'members[].knownAt ≤ knownThrough ≤ builtAt' },
        { label: 'builds refused', value: buildRefusals.length, source: 'refusals[step=BUILD]' },
      ],
      instants: [
        { label: 'cutoff', at: demo.instants.knownThrough, clock: 'knowledge cutoff, as requested' },
        { label: 'built', at: demo.instants.builtAt, clock: 'build time' },
      ],
    },
  ];
}

/** What would close each gap, stated as an action someone can take. The rail never takes it on its own. */
export const REMEDIATION: Record<string, string> = {
  INGEST_ONLY: 'A source registration that permits DERIVE for this purpose and audience. That is an operator declaration made outside this screen; until it exists the bytes stay stored, receipted and unused.',
  SCHEMA_MISMATCH: 'An adapter contract that accepts the schema the source declares, or a corrected source, then a new normalization run. The quarantine and the bytes remain for reinspection.',
  DERIVATION_NOT_ALLOWED: 'A registration that permits DERIVE for the purpose and audience requested. Capture alone never licenses derivation.',
  MEMBER_NOT_ELIGIBLE: 'Name only NORMALIZED candidates as members. A quarantine has no candidate and cannot be built.',
  MEMBER_AFTER_CUTOFF: 'Request a knowledge cutoff at or after the member’s knowledge time, or leave that member out. The rail never advances a cutoff.',
  SOURCE_IDENTITY_CONFLICT: 'Choose which candidate for the source record belongs in the build; the rail selects no revision on its own.',
  SOURCE_CLASS_NOT_DECLARED: 'Declare the source class in the build definition, or leave the member out.',
  BUILD_DERIVATION_NOT_ALLOWED: 'A registration that permits DERIVE at build time for the member’s source.',
};

export interface CoverageGap {
  key: string;
  stage: StageId;
  subject: { kind: SelectionKind; id: string };
  code: string;
  what: string;
  remediation: string;
  source: string;
}

/** Where coverage stops and why, each read from a recorded fact, each with the action that would change it. */
export function coverageGaps(demo: ProductionDemo): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const a of demo.acquisitions) {
    const r = a.request.manifest.sourceRegistration;
    if (!r.allowedOperations.includes('DERIVE')) {
      gaps.push({ key: `ingest-only:${r.registrationId}:${a.request.manifest.acquisitionId}`, stage: 'EXTRACTION', subject: { kind: 'acquisition', id: a.request.manifest.acquisitionId }, code: 'INGEST_ONLY',
        what: `Captured and receipted, but registration ${r.registrationId} permits ${r.allowedOperations.join(', ')} only, so no candidate can be derived from it.`,
        remediation: REMEDIATION.INGEST_ONLY, source: 'sourceRegistration.allowedOperations' });
    }
  }
  for (const n of demo.normalizations) {
    if (n.state === 'QUARANTINED') {
      const code = n.reasons[0] ?? 'QUARANTINED';
      gaps.push({ key: `quarantine:${n.request.manifest.normalizationId}`, stage: 'EXTRACTION', subject: { kind: 'normalization', id: n.request.manifest.normalizationId }, code,
        what: `The adapter refused the captured bytes under its contract (${n.reasons.join(', ')}). No candidate was written; the bytes stay reinspectable.`,
        remediation: REMEDIATION[code] ?? 'A new normalization run once the cause is removed.', source: 'normalization.state, normalization.reasons' });
    }
  }
  for (const r of demo.refusals) {
    const code = refusalCode(r.error);
    gaps.push({ key: `refusal:${r.requestId}`, stage: r.step === 'NORMALIZE' ? 'EXTRACTION' : 'READINESS', subject: { kind: 'refusal', id: r.requestId }, code,
      what: refusalMeaning(r.error), remediation: REMEDIATION[code] ?? 'See the rail’s message; it wrote nothing.', source: `refusals[].error (${r.step} ${r.requestId})` });
  }
  return gaps;
}

/* ═══ Provenance as a sequence ═══ */

export interface SequenceStep {
  key: string;
  label: string;
  what: string;
  id?: string;
  digest?: string;
  at?: string;
  clock?: string;
  outcome: 'DONE' | 'REFUSED' | 'NONE';
}

function decisionStep(key: string, label: string, d: SourceUseDecisionLike): SequenceStep {
  return { key, label, what: `${d.state} · ${d.reasons.join(', ')} · ${d.request.operation} / ${d.request.audience} / ${d.request.purpose}`, id: d.decisionId, at: d.evaluatedAt, clock: 'decision time', outcome: d.state === 'ALLOWED' ? 'DONE' : 'REFUSED' };
}
type SourceUseDecisionLike = LocalAcquisition['decision'];

export function acquisitionSequence(a: LocalAcquisition): SequenceStep[] {
  const r = a.request.manifest.sourceRegistration;
  const e = a.capture.evidence;
  const receipt = a.capture.receipt;
  return [
    { key: 'policy', label: 'Declared policy', what: `${r.sourceClass} · ${r.licenseId} · operations ${r.allowedOperations.join(', ')} · audiences ${r.allowedAudiences.join(', ')} · ${a.policyAuthority}`, id: r.registrationId, at: r.effectiveFrom, clock: 'policy effective from', outcome: 'DONE' },
    decisionStep('ingest', 'INGEST decision', a.decision),
    { key: 'capture', label: 'Captured bytes', what: `${e.mediaType} · ${e.byteLength} bytes · source ${e.sourceId}`, id: e.evidenceId, digest: e.contentDigest, at: e.capturedAt, clock: 'capture time, as declared', outcome: 'DONE' },
    { key: 'receipt', label: 'Storage receipt', what: `key ${receipt.storageKey}`, id: receipt.receiptId, digest: receipt.contentDigest, at: receipt.storedAt, clock: 'record time', outcome: 'DONE' },
  ];
}

/** Every build a normalization is a member of, and every refusal that names it. */
export function buildsWithMember(demo: ProductionDemo, normalizationId: string): LocalCandidateBuild[] {
  return demo.builds.filter((b) => b.members.some((m) => m.normalization.id === normalizationId));
}

/** Known identifiers a refusal's text names, so a refusal can be followed back to what it refused. */
export function mentionedObjects(demo: ProductionDemo, text: string): Array<{ kind: SelectionKind; id: string }> {
  const out: Array<{ kind: SelectionKind; id: string }> = [];
  for (const n of demo.normalizations) if (text.includes(n.request.manifest.normalizationId)) out.push({ kind: 'normalization', id: n.request.manifest.normalizationId });
  for (const a of demo.acquisitions) if (text.includes(a.request.manifest.acquisitionId)) out.push({ kind: 'acquisition', id: a.request.manifest.acquisitionId });
  for (const b of demo.builds) if (text.includes(b.buildId)) out.push({ kind: 'build', id: b.buildId });
  return out;
}

export function refusalsNaming(demo: ProductionDemo, id: string): ProductionRefusal[] {
  return demo.refusals.filter((r) => r.requestId === id || r.error.includes(id));
}

export function normalizationSequence(demo: ProductionDemo, run: LocalNormalizationRun): SequenceStep[] {
  const m = run.request.manifest;
  const a = acquisitionById(demo, m.acquisitionId);
  const c = candidateOf(run);
  const steps: SequenceStep[] = a ? acquisitionSequence(a) : [{ key: 'acquisition', label: 'Acquisition', what: 'Not in this demonstration.', id: m.acquisitionId, digest: run.request.acquisitionDigest, outcome: 'NONE' }];
  steps.push(decisionStep('derive', 'DERIVE decision', run.deriveDecision));
  steps.push({ key: 'adapter', label: 'Adapter parse under contract', what: `${m.profile.adapterId} · ${run.reasons.join(', ')}`, id: m.normalizationId, digest: run.request.adapterDigest, at: run.normalizedAt, clock: 'run time', outcome: run.state === 'NORMALIZED' ? 'DONE' : 'REFUSED' });
  steps.push(c
    ? { key: 'candidate', label: 'Candidate', what: `${c.domain} ${c.recordType} · ${c.state} · identity ${c.identity.state} · ${c.missingFields.length} missing`, id: c.candidateId, digest: c.digest, at: c.knownAt, clock: 'knowledge time', outcome: 'DONE' }
    : { key: 'candidate', label: 'Candidate', what: `None. ${run.reasons.join(', ')}: the run records the refusal instead of a record.`, outcome: 'REFUSED' });
  const builds = buildsWithMember(demo, m.normalizationId);
  if (builds.length) for (const b of builds) steps.push({ key: `build:${b.buildId}`, label: 'Build membership', what: `${b.state} · cutoff ${b.knownThrough} · ${b.recordCount} member${b.recordCount === 1 ? '' : 's'}`, id: b.buildId, digest: b.recordsRoot, at: b.builtAt, clock: 'build time', outcome: 'DONE' });
  else steps.push({ key: 'build', label: 'Build membership', what: 'In no candidate build.', outcome: 'NONE' });
  for (const r of refusalsNaming(demo, m.normalizationId)) if (r.step === 'BUILD') steps.push({ key: `refusal:${r.requestId}`, label: 'Build refused', what: r.error, id: r.requestId, outcome: 'REFUSED' });
  return steps;
}

export function buildSequence(demo: ProductionDemo, build: LocalCandidateBuild): SequenceStep[] {
  const m = build.request.manifest;
  const checks = cutoffChecks(build);
  const steps: SequenceStep[] = [
    { key: 'definition', label: 'Build definition', what: `${m.definition.domain} ${m.definition.recordType} · source classes ${m.definition.sourceClasses.join(', ')} · ${m.normalizationIds.length} member${m.normalizationIds.length === 1 ? '' : 's'} named`, id: m.definition.id, digest: build.definitionDigest, outcome: 'DONE' },
    { key: 'cutoff', label: 'Knowledge cutoff', what: 'Every member must be known at or before it; it is never advanced.', at: build.knownThrough, clock: 'knowledge cutoff', outcome: 'DONE' },
  ];
  build.members.forEach((member, i) => {
    steps.push({ key: `member:${member.normalization.id}`, label: `Member reopened`, what: `${member.sourceClass} · identity ${member.identity.state} · ${checks[i].withinCutoff ? 'known within the cutoff' : 'known after the cutoff'}`, id: member.normalization.id, digest: member.candidate.digest, at: member.knownAt, clock: 'knowledge time', outcome: checks[i].withinCutoff ? 'DONE' : 'REFUSED' });
    steps.push(decisionStep(`derive:${member.normalization.id}`, 'DERIVE at build time', member.deriveDecision));
  });
  steps.push({ key: 'root', label: 'Membership root', what: `${build.recordCount} record${build.recordCount === 1 ? '' : 's'} · ${build.state}`, id: build.buildId, digest: build.recordsRoot, at: build.builtAt, clock: 'build time', outcome: 'DONE' });
  return steps;
}

/* ═══ Evidence to record ═══ */

/**
 * The Carrier contract's output fields, in the adapter's order. Kept here
 * because the browser may not run the adapter; the test binds this list to
 * the adapter's own contract.
 */
export const CARRIER_CONTRACT_FIELDS = ['legalName', 'registrationNumber', 'operatingSite'] as const;

/** Committed source bytes matched to an evidence record by content digest, read on the server. */
export interface CommittedSource { evidenceId: string; path: string; text: string; byteLength: number; contentDigest: string }

export interface FieldRow {
  field: string;
  record: string | null;
  status: 'PARSED' | 'MISSING';
  /** The value under the same key in the source bytes: a string, null (explicit), or undefined when the source is unavailable or not JSON. */
  sourceValue: string | null | undefined;
  note: string;
}

function sourceRecord(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try { const value: unknown = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; } catch { return null; }
}

/** Each record field beside the same key in the source bytes, with what the adapter did between them. Nothing here is authored. */
export function fieldMapping(candidate: LocalCarrierCandidate, sourceText?: string): FieldRow[] {
  const source = sourceRecord(sourceText);
  return CARRIER_CONTRACT_FIELDS.map((field) => {
    const record = (candidate.fields as Record<string, string | undefined>)[field];
    const raw = source ? source[field] : undefined;
    const sourceValue = source ? (typeof raw === 'string' ? raw : raw === null ? null : undefined) : undefined;
    if (record === undefined) {
      const missing = candidate.missingFields.includes(field);
      return { field, record: null, status: 'MISSING', sourceValue, note: missing
        ? (source ? (sourceValue === null ? 'Explicit null in the source; omitted from the record and listed by name. Not inferred.' : 'Listed as missing by the run; the committed source carries no value under this key.') : 'Listed as missing by the run. Not inferred.')
        : 'Not in the record and not listed as missing.' };
    }
    let note = source ? (sourceValue === undefined ? 'No such key in the committed source bytes.' : sourceValue === record ? 'Copied as parsed.' : typeof sourceValue === 'string' && sourceValue.trim() === record ? 'Whitespace trimmed by the adapter (TRIM_ONLY); otherwise the source value.' : 'Differs from the source value.') : 'Source bytes unavailable here; the value is the adapter’s parse as recorded.';
    if (!source && sourceText) note = 'Source bytes are not JSON; the value is the adapter’s parse as recorded.';
    return { field, record, status: 'PARSED', sourceValue, note };
  });
}
