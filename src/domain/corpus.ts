/**
 * Payload OS — the corpus layer: the product.
 *
 * A corpus release is governed, time-bounded information inventory. Its
 * records carry value, unit, basis, machine-readable uncertainty and
 * validity bounds, both clocks, provenance, evidence class, rights and a
 * stable identity, and they are corrected by retractions rather than edited
 * in place. The API and feed expose this; a customer applies their own
 * inference to it. The ruling workbench (types.ts) is one application over
 * it.
 *
 * Nothing here computes a fact. Selectors reconstruct what a release
 * asserted as of a valid time and a knowledge time, and say why an answer is
 * absent, with the remedy that would supply it.
 */
import type { CanonicalURI, Domain, EvidenceClass, Hash, ISODateTime, VisibilityClass } from './types';

/* ── Rights ── */

export type PermittedUse =
  | 'acquisition'
  | 'normalization'
  | 'customer_delivery'
  | 'aggregation'
  | 'model_training'
  | 'internal_research'
  | 'redistribution';

export const PERMITTED_USES: readonly PermittedUse[] = [
  'acquisition', 'normalization', 'customer_delivery', 'aggregation', 'model_training', 'internal_research', 'redistribution',
];

export type Redistribution = 'internal_only' | 'licensed' | 'public';

/** The intelligence-rights schedule for one source. Absence of a use is a prohibition, never a default. */
export interface RightsSchedule {
  sourceId: string;
  sourceName: string;
  licence: string;
  permittedUses: PermittedUse[];
  /** Explicit non-use statements, verbatim. */
  nonUse: string[];
  redistribution: Redistribution;
  attributionRequired: boolean;
  /** Which party the source is, when it is a case party. */
  producerId?: string;
}

/* ── Records ── */

export interface UncertaintyBounds {
  low?: number;
  high?: number;
  /** What the bounds mean: "weighbridge stated accuracy", "laboratory reported", "estimate, no stated bound". */
  semantics: string;
  method?: string;
}

export type RecordStatus = 'CURRENT' | 'SUPERSEDED' | 'RETRACTED';

export interface CorpusRecord {
  recordId: string;
  canonicalId: CanonicalURI;
  /** The release in which this record first appeared. Later releases carry it forward. */
  firstReleaseId: string;
  subjectId: string;
  subjectCanonicalId: CanonicalURI;
  subjectType: string;
  predicate: string;
  title: string;
  value: string | number;
  unit?: string;
  basis?: string;
  uncertainty?: UncertaintyBounds;
  /** World time the value holds from (inclusive) and to (exclusive). No validTo means open-ended. */
  validFrom: ISODateTime;
  validTo?: ISODateTime;
  /** When the record became knowable to the corpus. Never read from the payload. */
  knownAt: ISODateTime;
  observedAt?: ISODateTime;
  evidenceClass: EvidenceClass;
  provenance: {
    sourceId: string;
    artifactId?: string;
    contentHash?: Hash;
    producerId?: string;
    transformId?: CanonicalURI;
  };
  visibility: VisibilityClass;
  supersedesRecordId?: string;
  /** Set when a later record replaced this one (correction). */
  supersededByRecordId?: string;
  /** Set when a retraction withdrew this record. */
  retractedByRetractionId?: string;
}

/* ── Retractions ── */

export type RetractionKind = 'CORRECTION' | 'WITHDRAWAL';

/** A push retraction: a fact changed or was withdrawn, and everyone downstream is told. */
export interface Retraction {
  retractionId: string;
  kind: RetractionKind;
  /** When the retraction was issued — the instant it became knowable. */
  issuedAt: ISODateTime;
  /** The release the retraction was issued against. */
  releaseId: string;
  affectedRecordIds: string[];
  replacementRecordIds?: string[];
  reason: string;
  sourceId?: string;
  /** Application-layer objects the corpus knows relied on the affected records. */
  affectedRulingIds?: string[];
  visibility: VisibilityClass;
}

/* ── Releases ── */

export interface BuildRecord {
  buildId: string;
  builtAt: ISODateTime;
  methodology: { methodologyId: string; version: string; status: string };
  /** Reproducibility: the inputs the build read, by digest. */
  inputDigests: Array<{ label: string; sha256: Hash }>;
  deterministic: boolean;
}

export interface CorpusRelease {
  fixture_only: true;
  releaseId: string;
  corpusId: string;
  corpusTitle: string;
  domain: Domain;
  /** Knowledge cutoff of the release: every record with knownAt ≤ this is in it. */
  knownAt: ISODateTime;
  build: BuildRecord;
  /** sha256 over the canonical JSON of the release's record set (stamped). */
  releaseDigest: Hash;
  supersedesReleaseId?: string;
  supersededByReleaseId?: string;
  status: 'CURRENT' | 'SUPERSEDED';
  coverage: string;
  sources: RightsSchedule[];
  note: string;
}

export interface Corpus {
  fixture_only: true;
  corpusId: string;
  title: string;
  domain: Domain;
  description: string;
  releases: CorpusRelease[];
  records: CorpusRecord[];
  retractions: Retraction[];
}

/* ── Selectors ── */

const le = (a: ISODateTime, b: ISODateTime) => a <= b;

/** Records a release carries: everything knowable by its cutoff. */
export function releaseRecords(corpus: Corpus, release: CorpusRelease): CorpusRecord[] {
  return corpus.records.filter((r) => le(r.knownAt, release.knownAt));
}

export function releaseRetractions(corpus: Corpus, release: CorpusRelease): Retraction[] {
  return corpus.retractions.filter((r) => le(r.issuedAt, release.knownAt));
}

/** A record's status as it stood at a knowledge time: later corrections and withdrawals are not yet known. */
export function recordStatusAt(corpus: Corpus, record: CorpusRecord, knownAt: ISODateTime): RecordStatus {
  if (record.retractedByRetractionId) {
    const ret = corpus.retractions.find((x) => x.retractionId === record.retractedByRetractionId);
    if (ret && le(ret.issuedAt, knownAt)) return 'RETRACTED';
  }
  if (record.supersededByRecordId) {
    const later = corpus.records.find((x) => x.recordId === record.supersededByRecordId);
    if (later && le(later.knownAt, knownAt)) return 'SUPERSEDED';
  }
  return 'CURRENT';
}

/** Rights guard for delivery: a record leaves the corpus only if its source permits customer delivery. */
export function deliverable(corpus: Corpus, release: CorpusRelease, record: CorpusRecord): boolean {
  const rights = release.sources.find((s) => s.sourceId === record.provenance.sourceId);
  return Boolean(rights && rights.permittedUses.includes('customer_delivery'));
}

export interface AsOfQuery {
  subjectId: string;
  predicate: string;
  /** World time the answer must describe. */
  validAt: ISODateTime;
  /** Knowledge cutoff: only records knowable by this instant are considered. */
  knownAt: ISODateTime;
}

export interface AsOfRefusal {
  code: 'NO_RECORD' | 'NO_IDENTITY_LINK' | 'RETRACTED' | 'OUTSIDE_VALIDITY' | 'NOT_DELIVERABLE';
  reason: string;
  remedy: string;
  /** Records that were considered and why they did not answer. */
  considered: Array<{ recordId: string; because: string }>;
}

export interface AsOfAnswer {
  query: AsOfQuery;
  releaseId: string;
  /** The record that answers, with its status at the knowledge time. */
  record?: CorpusRecord;
  status?: RecordStatus;
  /** How the subject was reached: directly, or through an identity link record. */
  resolution: 'DIRECT' | 'VIA_IDENTITY_LINK' | 'NONE';
  identityLink?: CorpusRecord;
  /** The record that superseded the answer, when the query's knowledge time already knows of it. */
  supersededBy?: CorpusRecord;
  retraction?: Retraction;
  refusal?: AsOfRefusal;
  /** Every candidate that was in the release at the knowledge time, newest first. */
  candidates: CorpusRecord[];
}

/** Predicate carried by identity-link records: value is the target subject id. */
export const IDENTITY_LINK_PREDICATE = 'identity.sample_of_lot';

function candidatesFor(records: CorpusRecord[], subjectId: string, predicate: string, q: AsOfQuery): CorpusRecord[] {
  return records
    .filter((r) => r.subjectId === subjectId && r.predicate === predicate && le(r.knownAt, q.knownAt))
    .sort((a, b) => (a.knownAt < b.knownAt ? 1 : a.knownAt > b.knownAt ? -1 : 0));
}

function withinValidity(r: CorpusRecord, validAt: ISODateTime): boolean {
  return le(r.validFrom, validAt) && (r.validTo === undefined || validAt < r.validTo);
}

/**
 * Reconstruct what the release could answer at the query's knowledge time
 * about the query's valid time. Newest knowable record wins; retracted and
 * superseded records are excluded once the retraction or correction is
 * knowable; a subject may be reached through an identity link record. An
 * absent answer is a typed refusal with a remedy, never a zero.
 */
export function queryAsOf(corpus: Corpus, release: CorpusRelease, q: AsOfQuery, opts: { enforceRights?: boolean } = {}): AsOfAnswer {
  const knownAt = q.knownAt <= release.knownAt ? q.knownAt : release.knownAt;
  const query = { ...q, knownAt };
  const records = releaseRecords(corpus, release);
  const considered: AsOfRefusal['considered'] = [];

  const evaluate = (subjectId: string, resolution: AsOfAnswer['resolution'], identityLink?: CorpusRecord): AsOfAnswer | null => {
    const candidates = candidatesFor(records, subjectId, q.predicate, query);
    if (candidates.length === 0) return null;
    for (const r of candidates) {
      const status = recordStatusAt(corpus, r, knownAt);
      if (status === 'RETRACTED') {
        const retraction = corpus.retractions.find((x) => x.retractionId === r.retractedByRetractionId);
        considered.push({ recordId: r.recordId, because: `retracted by ${r.retractedByRetractionId} on ${retraction?.issuedAt ?? '?'}` });
        continue;
      }
      if (status === 'SUPERSEDED') {
        considered.push({ recordId: r.recordId, because: `superseded by ${r.supersededByRecordId}` });
        continue;
      }
      if (!withinValidity(r, q.validAt)) {
        considered.push({ recordId: r.recordId, because: `valid from ${r.validFrom}${r.validTo ? ` to ${r.validTo}` : ''}, not at ${q.validAt}` });
        continue;
      }
      if (opts.enforceRights && !deliverable(corpus, release, r)) {
        considered.push({ recordId: r.recordId, because: `source ${r.provenance.sourceId} does not permit customer delivery` });
        continue;
      }
      return { query, releaseId: release.releaseId, record: r, status, resolution, identityLink, candidates };
    }
    // Candidates existed but none answered; report the most specific refusal.
    const retracted = candidates.find((r) => recordStatusAt(corpus, r, knownAt) === 'RETRACTED');
    if (retracted) {
      const retraction = corpus.retractions.find((x) => x.retractionId === retracted.retractedByRetractionId);
      return {
        query, releaseId: release.releaseId, resolution, identityLink, candidates, retraction,
        refusal: { code: 'RETRACTED', reason: `The only record was withdrawn: ${retraction?.reason ?? 'reason not recorded'}`, remedy: 'Obtain a replacement artifact from the producer, or an independent one; the corpus will carry it as a new record.', considered },
      };
    }
    if (opts.enforceRights && candidates.some((r) => !deliverable(corpus, release, r))) {
      return { query, releaseId: release.releaseId, resolution, identityLink, candidates, refusal: { code: 'NOT_DELIVERABLE', reason: 'A record exists but its source does not permit customer delivery.', remedy: 'Licence the source for delivery, or supply an equivalent artifact from a source that permits it.', considered } };
    }
    return {
      query, releaseId: release.releaseId, resolution, identityLink, candidates,
      refusal: { code: 'OUTSIDE_VALIDITY', reason: 'Records exist for this subject and predicate but none describes the requested world time.', remedy: 'Query a world time inside a record\'s validity, or supply an artifact that describes the requested time.', considered },
    };
  };

  const direct = evaluate(q.subjectId, 'DIRECT');
  if (direct) return direct;

  // Identity resolution through link records: a sample known to be drawn from this lot.
  const links = records.filter((r) => r.predicate === IDENTITY_LINK_PREDICATE && String(r.value) === q.subjectId && le(r.knownAt, knownAt) && recordStatusAt(corpus, r, knownAt) === 'CURRENT');
  for (const link of links) {
    const via = evaluate(link.subjectId, 'VIA_IDENTITY_LINK', link);
    if (via) return via;
  }

  // Nothing answered. Say which kind of nothing.
  // Orphan samples: sample-subject records for this predicate whose subject has no current link to any lot.
  const linkedSubjects = new Set(records.filter((r) => r.predicate === IDENTITY_LINK_PREDICATE && le(r.knownAt, knownAt) && recordStatusAt(corpus, r, knownAt) === 'CURRENT').map((r) => r.subjectId));
  const sampleRecords = records
    .filter((r) => r.predicate === q.predicate && r.subjectType === 'Sample' && le(r.knownAt, knownAt) && !linkedSubjects.has(r.subjectId))
    .sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1));
  if (sampleRecords.length > 0 && links.length === 0) {
    return {
      query, releaseId: release.releaseId, resolution: 'NONE', candidates: [],
      refusal: {
        code: 'NO_IDENTITY_LINK',
        reason: `Records for ${q.predicate} exist on sample subjects, but no identity link (${IDENTITY_LINK_PREDICATE}) connects any of them to ${q.subjectId} as of ${knownAt}. The corpus never merges on similarity.`,
        remedy: `Supply an artifact from a producer independent of the claimant that links a sample identifier to ${q.subjectId}; the corpus will carry it as an identity-link record.`,
        considered: sampleRecords.map((r) => ({ recordId: r.recordId, because: `subject ${r.subjectId} is not linked to ${q.subjectId}` })),
      },
    };
  }
  return {
    query, releaseId: release.releaseId, resolution: 'NONE', candidates: [],
    refusal: { code: 'NO_RECORD', reason: `No record for ${q.predicate} on ${q.subjectId} was knowable by ${knownAt} in ${release.releaseId}.`, remedy: 'Supply an artifact that states it; the corpus will carry it with its evidence class, rights and both clocks.', considered },
  };
}

/** The retraction feed: everything issued after `since`, oldest first. */
export function retractionsSince(corpus: Corpus, since: ISODateTime | undefined, viewer: VisibilityClass = 'COUNTERPARTY_SHARED'): Retraction[] {
  const visible = new Set<VisibilityClass>(viewer === 'PUBLIC_RULING' ? ['PUBLIC_RULING'] : viewer === 'COUNTERPARTY_SHARED' ? ['COUNTERPARTY_SHARED', 'PUBLIC_RULING'] : ['INTERNAL_ONLY', 'PRIVATE_PREFLIGHT', 'COUNTERPARTY_SHARED', 'PUBLIC_RULING']);
  return corpus.retractions
    .filter((r) => (since === undefined || r.issuedAt > since) && visible.has(r.visibility))
    .sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : 1));
}

export function currentRelease(corpus: Corpus): CorpusRelease {
  const cur = corpus.releases.find((r) => r.status === 'CURRENT');
  if (!cur) throw new Error('corpus has no current release');
  return cur;
}

export function releaseById(corpus: Corpus, releaseId: string): CorpusRelease | undefined {
  return corpus.releases.find((r) => r.releaseId === releaseId);
}

export function recordById(corpus: Corpus, recordId: string): CorpusRecord | undefined {
  return corpus.records.find((r) => r.recordId === recordId);
}

/** Records delivered to a viewer: rights guard first, then visibility. Returns the withheld count for the "N withheld" line. */
export function deliverableRecords(corpus: Corpus, release: CorpusRelease, viewer: VisibilityClass): { records: CorpusRecord[]; withheldByRights: number; withheldByVisibility: number } {
  const visible = new Set<VisibilityClass>(viewer === 'PUBLIC_RULING' ? ['PUBLIC_RULING'] : viewer === 'COUNTERPARTY_SHARED' ? ['COUNTERPARTY_SHARED', 'PUBLIC_RULING'] : ['INTERNAL_ONLY', 'PRIVATE_PREFLIGHT', 'COUNTERPARTY_SHARED', 'PUBLIC_RULING']);
  let withheldByRights = 0;
  let withheldByVisibility = 0;
  const out: CorpusRecord[] = [];
  for (const r of releaseRecords(corpus, release)) {
    if (!deliverable(corpus, release, r)) { withheldByRights += 1; continue; }
    if (!visible.has(r.visibility)) { withheldByVisibility += 1; continue; }
    out.push(r);
  }
  return { records: out, withheldByRights, withheldByVisibility };
}

/** Distinct subjects and predicates in a release, for the stream explorer's controls. */
export function releaseIndex(corpus: Corpus, release: CorpusRelease): { subjects: Array<{ subjectId: string; subjectType: string }>; predicates: string[] } {
  const subjects = new Map<string, string>();
  const predicates = new Set<string>();
  for (const r of releaseRecords(corpus, release)) {
    subjects.set(r.subjectId, r.subjectType);
    predicates.add(r.predicate);
  }
  return { subjects: [...subjects.entries()].map(([subjectId, subjectType]) => ({ subjectId, subjectType })).sort((a, b) => a.subjectId.localeCompare(b.subjectId)), predicates: [...predicates].sort() };
}
