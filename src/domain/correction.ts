/**
 * Correction and recall as first-class machinery.
 *
 * A corpus that corrects itself owes three things that are expensive to
 * retrofit: a ledger of what was superseded and who was told, downstream
 * invalidation that names which derived artifacts a corrected fact taints,
 * and as-of answering as a contract feature rather than a schema nicety.
 *
 * This module models all three against what this repository actually records.
 * `correctionImpact` computes the blast radius that the corpus can compute
 * today, and states plainly, per class of derived artifact, where it cannot —
 * because the dependency was never recorded, not because nothing is affected.
 * An UNDETERMINED class is a design finding, not a failure: it names exactly
 * which reference a producer must retain before invalidation can be computed.
 *
 * Nothing here invents a customer, a subscription or a delivery. No customer
 * exists; the delivery ledger is specified and empty, and says so.
 */
import type { Corpus, Retraction } from './corpus';
import type { ISODateTime } from './types';
import { recordStatusAt } from './corpus';

/* ── Downstream invalidation ── */

/** Every class of derived artifact this repository actually produces. Closed. */
export type DerivedClass =
  | 'RULING'
  | 'DELIVERED_RECORD'
  | 'INFORMATION_PRODUCT'
  | 'CANDIDATE_BUILD'
  | 'COMPUTE_RUN'
  | 'PROJECTION'
  | 'NOTATION';

/**
 * Whether the corpus can decide that a given derived artifact is tainted.
 * RECORDED: the producer retained the reference, so taint is computed.
 * DERIVABLE: no reference is retained, but one can be recomputed from
 * something the corpus does hold, at a stated cost.
 * ABSENT: no reference exists and none can be recovered; invalidation is
 * undecidable until a producer retains one.
 */
export type Traceability = 'RECORDED' | 'DERIVABLE' | 'ABSENT';

export const TRACEABILITY_LABEL: Record<Traceability, string> = {
  RECORDED: 'The dependency is recorded, so taint is computed',
  DERIVABLE: 'No dependency is recorded; it can be recomputed at a stated cost',
  ABSENT: 'No dependency exists and none can be recovered',
};

export type TaintState = 'TAINTED' | 'CLEAN' | 'UNDETERMINED';

export const TAINT_LABEL: Record<TaintState, string> = {
  TAINTED: 'Depends on a corrected or withdrawn record',
  CLEAN: 'Does not depend on any corrected or withdrawn record',
  UNDETERMINED: 'Cannot be decided: the dependency was never recorded',
};

export interface DerivedArtifactClass {
  id: DerivedClass;
  title: string;
  /** What the artifact is, in the corpus's own words. */
  what: string;
  /** The reference that would decide taint, named exactly. */
  dependency: string;
  traceability: Traceability;
  /** Where the reference lives, or would have to live. */
  where: string;
  /** What has to change before this class can be invalidated automatically. */
  toClose: string;
}

export const DERIVED_CLASSES: readonly DerivedArtifactClass[] = [
  {
    id: 'RULING',
    title: 'Rulings',
    what: 'An evaluation of a claim under a declared use, profile and tolerance at two clocks, committed to a result manifest.',
    dependency: 'The corpus release and build a ruling was evaluated against, and the record identifiers it considered.',
    traceability: 'RECORDED',
    where: 'Retraction.affectedRulingIds names them, and every ruling carries Ruling.corpus with the release and build.',
    toClose: 'Nothing. This class is closed: the corpus states which rulings relied on an affected record, and the ruling states which corpus it was evaluated against.',
  },
  {
    id: 'DELIVERED_RECORD',
    title: 'Delivered records',
    what: 'A record as it left the feed, the MCP tools or a report, in the shape the delivered-record contract specifies.',
    dependency: 'A delivery entry: who received which record identifiers, from which release, answering which as-of question, at what time.',
    traceability: 'ABSENT',
    where: 'Nowhere. The feed is stateless and no delivery is retained. No customer exists to have been delivered to.',
    toClose: 'A delivery ledger written by the distribution surfaces at the moment of delivery. Its contract is specified below and it is empty; filling it needs a real subscriber, which is not this repository’s to invent.',
  },
  {
    id: 'INFORMATION_PRODUCT',
    title: 'Information products',
    what: 'A product specification: the customer question, its subjects and fields, and the corpus coverage that answers it.',
    dependency: 'The field-to-record mapping the coverage test already computes for one release.',
    traceability: 'DERIVABLE',
    where: 'src/domain/informationProduct.ts recomputes coverage from the corpus; it retains no snapshot, so the taint is recomputed rather than looked up.',
    toClose: 'Nothing structural. Recomputing coverage at the corrected knowledge time answers whether the product’s question changed; a retained snapshot per release would make it a lookup instead of a recomputation.',
  },
  {
    id: 'CANDIDATE_BUILD',
    title: 'Candidate builds',
    what: 'An UNADMITTED assembly of normalized candidates under a definition and knowledge cutoff, with a membership root.',
    dependency: 'The link from a released record back to the candidate build that proposed it.',
    traceability: 'ABSENT',
    where: 'Nowhere, by design: no candidate has ever been admitted, so no released record descends from a build. Doctrine rule 2 also keeps build identifiers out of releases.',
    toClose: 'An admission authority. Once a candidate becomes a version, admission must record that ancestry in a place that does not leak rail identifiers into the release, so a correction can reach back to the build without breaking rule 2.',
  },
  {
    id: 'COMPUTE_RUN',
    title: 'Compute runs',
    what: 'A retained instrument run: recorded-observation replay, the scalar benchmark, clearance value of information, registration and access, a GAT audit.',
    dependency: 'Each run already retains exact acquisition and content digests for every dependency it read.',
    traceability: 'RECORDED',
    where: 'Every run record carries a dependencies list of artifact references with acquisition and content digests.',
    toClose: 'The join. Runs reference evidence artifacts; retractions name corpus records. Nothing yet maps a corrected record to the artifact it was extracted from, so the two vocabularies cannot meet. That mapping is the extraction lineage a record’s provenance already half-names.',
  },
  {
    id: 'PROJECTION',
    title: 'Projections',
    what: 'A compiled read-only view of one exact release: records, an incidence graph, a globe placement.',
    dependency: 'The release and record selection the spec pins, which the compiled result already carries.',
    traceability: 'RECORDED',
    where: 'A ProjectionSpec pins the release and the selection; the compiler returns detached copies over that exact source.',
    toClose: 'Nothing. A projection is pinned to a release, so a later retraction never silently changes it: recompiling against the corrected release is the invalidation.',
  },
  {
    id: 'NOTATION',
    title: 'Notations',
    what: 'An operator’s authored interpretation, and the explicit relations between interpretations.',
    dependency: 'The exact evidence references a notation asserts it interprets.',
    traceability: 'ABSENT',
    where: 'Nowhere. The notation kernel’s command set has no attach or detach for an evidence reference, so a saved notation carries none.',
    toClose: 'The two commands the notation workspace has asked the kernel for. Until a notation can carry an exact reference, a correction cannot tell an operator that their interpretation rested on a withdrawn fact.',
  },
];

/* ── The impact of one correction ── */

export interface ClassImpact {
  id: DerivedClass;
  title: string;
  taint: TaintState;
  traceability: Traceability;
  /** Identifiers the corpus can name, when it can name any. */
  identifiers: readonly string[];
  /** Why this is the answer, in one sentence a reader can check. */
  because: string;
}

export interface CorrectionImpact {
  retractionId: string;
  kind: Retraction['kind'];
  issuedAt: ISODateTime;
  releaseId: string;
  /** The records the retraction names, with their status at the issuing instant. */
  affected: readonly { recordId: string; statusAtIssue: ReturnType<typeof recordStatusAt> | 'UNKNOWN' }[];
  /** The records that replace them, empty for a withdrawal. */
  replacements: readonly string[];
  classes: readonly ClassImpact[];
  /** Classes whose taint cannot be decided. The honest headline of any correction. */
  undetermined: readonly DerivedClass[];
}

/**
 * The blast radius of one correction over what this corpus records. Pure: it
 * reads the corpus and the retraction and asserts nothing it cannot check.
 */
export function correctionImpact(corpus: Corpus, retraction: Retraction): CorrectionImpact {
  const byId = new Map(corpus.records.map((r) => [r.recordId, r]));
  const affected = retraction.affectedRecordIds.map((recordId) => {
    const record = byId.get(recordId);
    return { recordId, statusAtIssue: record ? recordStatusAt(corpus, record, retraction.issuedAt) : ('UNKNOWN' as const) };
  });
  const replacements = retraction.replacementRecordIds ?? [];
  const rulings = retraction.affectedRulingIds ?? [];

  const classes: ClassImpact[] = DERIVED_CLASSES.map((c) => {
    const base = { id: c.id, title: c.title, traceability: c.traceability };
    switch (c.id) {
      case 'RULING':
        return rulings.length
          ? { ...base, taint: 'TAINTED' as const, identifiers: rulings, because: `The corpus records that ${rulings.length} ruling${rulings.length === 1 ? '' : 's'} relied on an affected record.` }
          : { ...base, taint: 'CLEAN' as const, identifiers: [], because: 'The corpus records no ruling that relied on an affected record.' };
      case 'PROJECTION':
        return { ...base, taint: 'CLEAN' as const, identifiers: [retraction.releaseId], because: `A projection is pinned to one exact release, so ${retraction.releaseId} still compiles as it did; recompiling against the corrected release is the invalidation.` };
      case 'INFORMATION_PRODUCT':
        return { ...base, taint: 'UNDETERMINED' as const, identifiers: [], because: 'Coverage is recomputed rather than retained, so whether the product’s answer changed is decided by asking it again at the corrected knowledge time.' };
      default:
        return { ...base, taint: 'UNDETERMINED' as const, identifiers: [], because: c.where };
    }
  });

  return {
    retractionId: retraction.retractionId,
    kind: retraction.kind,
    issuedAt: retraction.issuedAt,
    releaseId: retraction.releaseId,
    affected,
    replacements,
    classes,
    undetermined: classes.filter((c) => c.taint === 'UNDETERMINED').map((c) => c.id),
  };
}

/* ── The delivery ledger ── */

/**
 * What a delivery entry must carry for "which supersessions shipped to which
 * customers, when" to be answerable. Specified, not populated: no customer
 * exists, and inventing one would invent customer scope.
 */
export interface DeliveryEntry {
  deliveryId: string;
  /** The recipient, by an identifier the firm issued. Never a guess. */
  recipientId: string;
  /** Which surface delivered it. */
  channel: 'FEED' | 'MCP' | 'REPORT' | 'WORKBENCH';
  /** The exact release, so the delivery is reproducible. */
  releaseId: string;
  /** The question answered, when the delivery answered one. */
  query?: { subjectId: string; predicate: string; validAt: ISODateTime; knownAt: ISODateTime };
  recordIds: readonly string[];
  deliveredAt: ISODateTime;
}

export const DELIVERY_LEDGER = {
  purpose: 'Answer, for any correction, which recipients hold a record that has since been superseded or withdrawn, and when they were told.',
  state: 'SPECIFIED_AND_EMPTY' as const,
  why: 'The distribution surfaces are stateless and no customer exists. A ledger populated with invented recipients would be a fabricated record, not a design.',
  writtenBy: 'The feed, the MCP tools, reports and the workbench, at the instant of delivery, never reconstructed afterwards.',
  fields: ['deliveryId', 'recipientId', 'channel', 'releaseId', 'query', 'recordIds', 'deliveredAt'] as const,
  /** The obligation the ledger creates once it exists. */
  obligation: 'A retraction is not complete when it is published. It is complete when every recipient of an affected record has been told, and the ledger is what makes that checkable.',
} as const;

/* ── As-of as a contract feature ── */

export const AS_OF_CONTRACT = {
  statement: 'Asking what was knowable at a past instant is a feature of the contract, not a convenience of the schema.',
  present: [
    'Every record carries valid time and knowledge time separately, and the two are never collapsed.',
    'An as-of answer is the newest record knowable by the knowledge time whose validity covers the world time, reached directly or through a current identity link.',
    'The knowledge time is clamped to the release cutoff, so no answer can be newer than the release that gave it.',
    'A question with no answer returns a typed refusal with a remedy, never a null and never a false value.',
    'An earlier release still shows a record as it stood; nothing is edited in place.',
    'GET /api/v1/releases/:id/as-of is the same answer the stream page shows, and the page prints the URL that reproduces it.',
  ],
  absent: [
    'A delivery ledger, so the corpus cannot say who holds a superseded answer.',
    'Extraction lineage from a released record back to the artifact it came from, so a correction cannot reach the compute runs that read that artifact.',
    'Admission ancestry from a released record back to the candidate build that proposed it, which does not exist because admission does not.',
  ],
} as const;
