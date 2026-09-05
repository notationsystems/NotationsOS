/**
 * Evidence references on notations: the frontend contract. A reference names
 * a kind, a stable target identifier and the exact digest of the version it
 * refers to, carries the target's source or build context and temporal
 * information, and keeps the author's interpretation in its own field. A
 * reference never copies the target, never promotes it, and never
 * establishes evidence truth or canonical identity. Resolution says whether
 * the exact version still exists where the reference points.
 *
 * Attachment to a notation is not implemented in the notation backend. The
 * backend contract this frontend asks for is recorded in
 * docs/NOTATION_WORKSPACE.md; until then references are fixtures, marked as
 * such wherever they are shown.
 */
import type { Corpus } from './corpus';
import type { ProductionDemo } from './production';

export const REFERENCE_KINDS = ['ACQUISITION', 'NORMALIZATION_RUN', 'CANDIDATE', 'CANDIDATE_BUILD', 'CORPUS_RECORD', 'RELEASE'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export interface NotationEvidenceReference {
  schema: 'payload.notation-evidence-reference.v0';
  referenceId: string;
  /** The notation this reference is attached to. Attachment is a backend command that does not exist yet. */
  notationId: string;
  kind: ReferenceKind;
  /** The target's stable identifier in its own namespace: acquisition id, normalization id, candidate id, build id, record id or release id. */
  targetId: string;
  /** The exact version referred to: the target's digest, or the release digest for a record. Empty means the reference pins no version and cannot resolve exactly. */
  digest: string;
  context: { domain: 'CARAVAN'; sourceId?: string; acquisitionId?: string; normalizationId?: string; buildId?: string; releaseId?: string };
  temporal: { capturedAt?: string; storedAt?: string; normalizedAt?: string; knownAt?: string; knownThrough?: string; builtAt?: string; validFrom?: string; validTo?: string | null };
  /** The author's reading of the evidence. It is authored local text, not a property of the evidence. */
  interpretation: { text: string; authoredAt: string };
}

export type ResolutionState = 'RESOLVED' | 'CHANGED' | 'UNAVAILABLE' | 'UNRESOLVED';

export interface ResolvedReference {
  reference: NotationEvidenceReference;
  resolution: { state: ResolutionState; detail: string; currentDigest: string | null; resolvedAt: string; against: string };
  /** Whether the notation backend can persist this reference. Fixed until an attach command exists. */
  attachment: 'DISABLED';
}

export const RESOLUTION_MEANING: Record<ResolutionState, string> = {
  RESOLVED: 'The exact version the reference names exists where it points.',
  CHANGED: 'The target exists but its current digest differs from the one referenced. The reference still names the earlier version; nothing is rewritten.',
  UNAVAILABLE: 'No target with this identifier exists where the reference points.',
  UNRESOLVED: 'The reference pins no exact version, so it cannot be resolved exactly.',
};

export interface ReferenceWorld { demo: ProductionDemo; corpus: Corpus }

function currentDigestOf(reference: NotationEvidenceReference, world: ReferenceWorld): string | null | undefined {
  const { demo, corpus } = world;
  switch (reference.kind) {
    case 'ACQUISITION': return demo.acquisitions.find((a) => a.request.manifest.acquisitionId === reference.targetId)?.digest;
    case 'NORMALIZATION_RUN': return demo.normalizations.find((n) => n.request.manifest.normalizationId === reference.targetId)?.digest;
    case 'CANDIDATE': return demo.normalizations.find((n) => n.candidate?.candidateId === reference.targetId)?.candidate?.digest;
    case 'CANDIDATE_BUILD': return demo.builds.find((b) => b.buildId === reference.targetId)?.digest;
    case 'RELEASE': return corpus.releases.find((r) => r.releaseId === reference.targetId)?.releaseDigest;
    case 'CORPUS_RECORD': {
      const release = corpus.releases.find((r) => r.releaseId === reference.context.releaseId);
      const record = corpus.records.find((r) => r.recordId === reference.targetId);
      if (!release || !record || record.knownAt > release.knownAt) return undefined;
      return release.releaseDigest;
    }
  }
}

/** Pure and deterministic: the same reference against the same world resolves the same way; the clock is the world's, never the wall's. */
export function resolveReference(reference: NotationEvidenceReference, world: ReferenceWorld, resolvedAt: string): ResolvedReference {
  const against = reference.kind === 'CORPUS_RECORD' || reference.kind === 'RELEASE' ? `corpus ${world.corpus.corpusId}` : `production demonstration ${world.demo.schema}`;
  const current = currentDigestOf(reference, world);
  let state: ResolutionState;
  let detail: string;
  if (!reference.digest) { state = 'UNRESOLVED'; detail = 'No digest on the reference.'; }
  else if (current === undefined) { state = 'UNAVAILABLE'; detail = `No ${reference.kind.toLowerCase().replace('_', ' ')} ${reference.targetId} where the reference points.`; }
  else if (current === reference.digest) { state = 'RESOLVED'; detail = 'Digest matches.'; }
  else { state = 'CHANGED'; detail = 'Digest differs from the referenced version.'; }
  return { reference, resolution: { state, detail, currentDigest: current ?? null, resolvedAt, against }, attachment: 'DISABLED' };
}

export function resolveReferences(references: readonly NotationEvidenceReference[], world: ReferenceWorld, resolvedAt: string): ResolvedReference[] {
  return references.map((r) => resolveReference(r, world, resolvedAt));
}
