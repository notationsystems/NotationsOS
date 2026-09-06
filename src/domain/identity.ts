/**
 * Identity is line-agnostic; the verticals are not.
 *
 * One identity core — resolution, provenance, bitemporality — with a family of
 * identifiers per domain product beneath it. The moat is the cross-line join:
 * a Tradewind position resolved to a Landshark parcel exposure through a
 * Caravan flow. No single-vertical competitor assembles that cheaply, and no
 * amount of per-line work produces it if the core was built per line.
 *
 * This module states the core, the identifier families, and the join, each
 * with the state that is true here. Caravan is the only line with records, so
 * it is the only family with anything PRESENT; the other two are declared and
 * empty, which is what a module slot means. The join is stated as ABSENT with
 * the exact three things it needs, because it is the part that gets expensive
 * to retrofit and the part most easily faked by matching labels.
 */
import type { Corpus } from './corpus';
import { IDENTITY_LINK_PREDICATE } from './corpus';
import type { Domain } from './types';

/* ── The core ── */

/** What one identity core owes every line. Closed. */
export type CoreCapability = 'RESOLUTION' | 'PROVENANCE' | 'BITEMPORALITY' | 'LINKAGE';

export type CoreState = 'PRESENT' | 'PARTIAL' | 'ABSENT';

export const CORE_STATE_LABEL: Record<CoreState, string> = {
  PRESENT: 'Present',
  PARTIAL: 'Partly present, with the missing half named',
  ABSENT: 'Absent',
};

export interface CoreFacility {
  id: CoreCapability;
  title: string;
  /** What the facility must do for every line, not for one. */
  obligation: string;
  state: CoreState;
  /** What exists here, checkable against the code. */
  here: string;
  /** What the state costs, when it is not PRESENT. */
  missing?: string;
}

export const IDENTITY_CORE: readonly CoreFacility[] = [
  {
    id: 'RESOLUTION',
    title: 'Resolution',
    obligation: 'Decide, for two identifiers, whether they name the same thing, and record the decision as evidence rather than as a merge.',
    state: 'ABSENT',
    here: 'Every record carries a stable notation:// identity for its subject, and identity links are authored as records rather than inferred. Nothing resolves two identifiers into one.',
    missing: 'A resolution decision object: the two identifiers, the evidence, the method and version, the decision, and both clocks. Without it, resolution is either absent or silently irreversible.',
  },
  {
    id: 'PROVENANCE',
    title: 'Provenance',
    obligation: 'Carry, with every identity assertion, what produced it: the source, the artifact, the method and the instant.',
    state: 'PARTIAL',
    here: 'Records carry source, artifact, content hash, evidence class and both clocks. Identity-link records carry the same provenance as any other record, so a link is evidence-bearing rather than structural.',
    missing: 'Extraction lineage from a record back to the exact artifact byte range it came from. Provenance names the artifact but not the place inside it.',
  },
  {
    id: 'BITEMPORALITY',
    title: 'Bitemporality',
    obligation: 'Keep valid time and knowledge time separate on every assertion, including assertions about identity, so a link can be wrong later without rewriting history.',
    state: 'PRESENT',
    here: 'Validity bounds and knowledge time are separate fields on every record; the as-of query clamps knowledge time to the release cutoff and answers through a link only while that link is current.',
  },
  {
    id: 'LINKAGE',
    title: 'Linkage',
    obligation: 'Let one thing be reached from another only along an edge some evidence asserts, never along adjacency, proximity or a shared label.',
    state: 'PARTIAL',
    here: `One link predicate exists, ${IDENTITY_LINK_PREDICATE}, and the as-of query traverses exactly one hop through it when a fact does not reach a subject directly. Where no link exists the answer is a typed refusal, not a guess.`,
    missing: 'A general link vocabulary. One predicate and one hop is the honest shape of one line; a cross-line join needs link types with their own evidence requirements.',
  },
];

/* ── Identifier families ── */

export type FamilyState = 'IN_USE' | 'DECLARED' | 'ABSENT';

export const FAMILY_STATE_LABEL: Record<FamilyState, string> = {
  IN_USE: 'Carried by records in this repository',
  DECLARED: 'Named as this line’s family; no record carries one',
  ABSENT: 'Not named anywhere',
};

export interface IdentifierFamily {
  domain: Domain;
  /** The identifier kinds this line resolves against, in the world's own vocabulary. */
  identifiers: readonly { id: string; what: string; issuer: string; state: FamilyState }[];
  /** Why this line's identifiers cannot simply be the next line's. */
  whyLineSpecific: string;
}

export const IDENTIFIER_FAMILIES: readonly IdentifierFamily[] = [
  {
    domain: 'CARAVAN',
    whyLineSpecific: 'A mover is identified by the authority that licenses it and by the consignment it carries; both change hands during a voyage, so the identifier and the thing it names come apart in time.',
    identifiers: [
      { id: 'USDOT', what: 'A motor carrier registered with the Federal Motor Carrier Safety Administration', issuer: 'FMCSA', state: 'IN_USE' },
      { id: 'lot / sample', what: 'A consignment and the samples drawn from it, linked by an authored identity record', issuer: 'Operator, in the demonstration corpus', state: 'IN_USE' },
      { id: 'IMO / MMSI', what: 'A vessel hull and its radio identity, which do not coincide over a hull’s life', issuer: 'IMO and the ITU', state: 'DECLARED' },
    ],
  },
  {
    domain: 'TRADEWIND',
    whyLineSpecific: 'A counterparty is a legal entity with a hierarchy above it; exposure attaches to the entity, while an instrument attaches to an issue. Resolving one does not resolve the other.',
    identifiers: [
      { id: 'LEI', what: 'A legal entity, and through its relationship records the parent above it', issuer: 'GLEIF', state: 'DECLARED' },
      { id: 'instrument identifier', what: 'A tradable issue, distinct from the entity that issued it', issuer: 'Per the market convention adopted', state: 'DECLARED' },
    ],
  },
  {
    domain: 'LANDSHARK',
    whyLineSpecific: 'A parcel is identified by an assessor within one jurisdiction, so the identifier is only unique inside that county and is re-cut when parcels split or merge.',
    identifiers: [
      { id: 'APN', what: 'An assessor’s parcel number, unique only within its jurisdiction', issuer: 'The county assessor', state: 'DECLARED' },
      { id: 'cadastral identifier', what: 'The registry identity of a parcel, which survives an assessor re-cut', issuer: 'The cadastral authority', state: 'DECLARED' },
    ],
  },
];

/* ── The join ── */

/** A line-agnostic key two lines can meet on, with no shared identifier between them. */
export interface JoinKey {
  id: 'SPATIAL_CELL' | 'TIME_INTERVAL' | 'RESOLVED_ENTITY';
  title: string;
  what: string;
  state: 'PRESENT' | 'ABSENT';
  here: string;
  /** The mistake this key invites, named so it is not made. */
  hazard: string;
}

export const JOIN_KEYS: readonly JoinKey[] = [
  {
    id: 'SPATIAL_CELL',
    title: 'Spatial cell',
    what: 'A discrete cell identifier at a stated resolution, so a trajectory and a parcel meet without bespoke geometry glue.',
    state: 'ABSENT',
    here: 'Positions are declared as corpus records with geodetic coordinates; no cell index is computed and no cell identifier is carried.',
    hazard: 'A shared cell is co-location at a resolution, not a relationship. Two things in one cell have been placed near each other, and nothing more has been established.',
  },
  {
    id: 'TIME_INTERVAL',
    title: 'Time interval',
    what: 'The overlap of two validity intervals, which is the only honest way two facts about different things can be said to coincide.',
    state: 'PRESENT',
    here: 'Every record carries validity bounds and a separate knowledge time, so overlap is computable today and the as-of query already depends on it.',
    hazard: 'Overlapping in valid time is coincidence in the world; overlapping in knowledge time is only coincidence in what was known. Confusing the two invents causation from a reporting schedule.',
  },
  {
    id: 'RESOLVED_ENTITY',
    title: 'Resolved entity',
    what: 'Two identifiers from two lines carried to the same subject by an evidence-bearing resolution decision.',
    state: 'ABSENT',
    here: 'Nothing resolves. One authored link predicate joins a sample to a lot inside one line, and the as-of query refuses where no link exists.',
    hazard: 'A matching name is not a resolution, and a matching label across two lines is the cheapest way to manufacture a moat that is not there.',
  },
];

export const CROSS_LINE_JOIN = {
  claim: 'The moat is the cross-line join: a Tradewind position resolved to a Landshark parcel exposure through a Caravan flow.',
  state: 'ABSENT' as const,
  /** Exactly what has to exist. Three things, none of them a database. */
  requires: [
    'A resolution decision object, so that two identifiers from two lines are carried to one subject by evidence with a method, a version and both clocks, and can be undone without rewriting history.',
    'A link vocabulary richer than one predicate, so a join names what kind of relationship it is and what evidence that kind demands.',
    'A line-agnostic key for the cases where no identifier is shared: a spatial cell at a declared resolution and an interval overlap in valid time, each carrying its own hazard.',
  ],
  /** Why it is worth stating before it exists. */
  why: 'A join built per line is not a join. If resolution, provenance and bitemporality are solved once for Caravan alone, the second line pays the whole cost again and the third pays it a third time, and the cross-line answer is never reachable from any of them.',
  /** The rule that keeps the join from being faked. */
  discipline: 'Cross-domain connections require explicit evidence-bearing mappings. A shared label, a shared cell and a shared screen position are not mappings.',
} as const;

/* ── What the corpus can show today ── */

export interface IdentityStanding {
  subjects: number;
  /** Identity-link records: authored, evidence-bearing, one hop. */
  links: number;
  linkPredicate: string;
  /** Subjects reachable only through a link, which is what linkage buys. */
  linkedSubjects: readonly string[];
}

/** Pure: counts what the corpus actually carries, asserting nothing beyond it. */
export function identityStanding(corpus: Corpus): IdentityStanding {
  const subjects = new Set(corpus.records.map((r) => r.subjectId));
  const links = corpus.records.filter((r) => r.predicate === IDENTITY_LINK_PREDICATE);
  return {
    subjects: subjects.size,
    links: links.length,
    linkPredicate: IDENTITY_LINK_PREDICATE,
    linkedSubjects: [...new Set(links.map((r) => r.subjectId))].sort(),
  };
}
