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
