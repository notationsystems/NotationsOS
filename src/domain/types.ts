/**
 * Payload OS — presentation view model.
 *
 * AUTHORITY BOUNDARY. Nothing in this file adjudicates. These types describe
 * the shape of a case bundle AS RETURNED by the adapter/fixture boundary; the
 * browser renders them and may validate presentation, never admission.
 *
 * VOCABULARY. Where the Notation Systems substrate already names a thing, the
 * name is carried rather than re-invented:
 *   - evidence classes are the TWO AXES of the corpus provenance contract
 *     (information-systems-archive/corpus-contract/contract.json v1.0.0):
 *     `claim_strength` (reported|estimated|representative|derived — ranked,
 *     weakest input wins) and `production_class` (asserted|computed|derived|
 *     measured — unranked; `unclassified` is the absence of a term), plus the
 *     `interest` axis (disinterested|unknown|self_reported|negotiating_position);
 *   - canonical identities follow control-plane/src/identity/canonical-uri.js:
 *     `notation://<kind>/<authority>/<local-id>` with kinds source, artifact,
 *     entity, observation, claim, dataset, model, state, transform, proof, node;
 *   - a result manifest's verification status is one of
 *     verified|partially_verified|unverified|challenged
 *     (control-plane/src/governance/result-manifest.js);
 *   - `knownAt` is when the fact became knowable to the corpus, distinct from
 *     the period it describes (payload-methodology.js temporalSemantics).
 *
 * Where the brief names a thing the substrate does not (ruling status,
 * assurance class, visibility class, invariant authority class), the brief's
 * vocabulary is used and the mapping to substrate facts is carried BESIDE it
 * so the UI can show both without conflating them.
 */

/** ISO 8601 instant, e.g. "2026-08-29T09:30:00Z". Named so a knownAt and a
 *  validAt cannot be swapped without the reader noticing. */
export type ISODateTime = string;
/** Lowercase hex digest (sha256 unless stated). */
export type Hash = string;
/** notation://<kind>/<authority>/<local-id> */
export type CanonicalURI = string;

export type Domain = 'CARAVAN' | 'TRADEWIND' | 'LANDSHARK';

export type RulingStatus =
  | 'DRAFT'
  | 'PENDING_EVIDENCE'
  | 'EVALUATING'
  | 'ADMITTED'
  | 'ADMITTED_WITH_CONDITIONS'
  | 'REFUSED'
  | 'SUPERSEDED'
  | 'REVOKED';

export const RULING_STATUSES: readonly RulingStatus[] = [
  'DRAFT', 'PENDING_EVIDENCE', 'EVALUATING', 'ADMITTED', 'ADMITTED_WITH_CONDITIONS', 'REFUSED', 'SUPERSEDED', 'REVOKED',
] as const;

export type AssuranceClass =
  | 'UNVERIFIED_EVALUATION'
  | 'HUMAN_REVIEWED'
  | 'VERIFIED_ATTESTATION'
  | 'EXTERNALLY_WITNESSED';

export const ASSURANCE_CLASSES: readonly AssuranceClass[] = [
  'UNVERIFIED_EVALUATION', 'HUMAN_REVIEWED', 'VERIFIED_ATTESTATION', 'EXTERNALLY_WITNESSED',
] as const;

export type VisibilityClass =
  | 'PRIVATE_PREFLIGHT'
  | 'COUNTERPARTY_SHARED'
  | 'PUBLIC_RULING'
  | 'DELAYED_AGGREGATE'
  | 'INTERNAL_ONLY';

export const VISIBILITY_CLASSES: readonly VisibilityClass[] = [
  'PRIVATE_PREFLIGHT', 'COUNTERPARTY_SHARED', 'PUBLIC_RULING', 'DELAYED_AGGREGATE', 'INTERNAL_ONLY',
] as const;

/* ── Evidence classes: the corpus contract's axes, verbatim ── */

/** claim_strength — how hard the evidence is. Ranked; weakest input wins. */
export type ClaimStrength = 'reported' | 'estimated' | 'representative' | 'derived';
export const CLAIM_STRENGTH_RANK: Record<ClaimStrength, number> = { reported: 3, estimated: 2, representative: 1, derived: 0 };

/** production_class — how the value came to exist. NOT ranked. `unclassified`
 *  is the absence of a term and is inadmissible for canonical assertion. */
export type ProductionClass = 'asserted' | 'computed' | 'derived' | 'measured' | 'unclassified';

/** interest — what stake the source had in stating it this way. Ranked;
 *  `unknown` sits above self_reported deliberately. */
export type Interest = 'disinterested' | 'unknown' | 'self_reported' | 'negotiating_position';
export const INTEREST_RANK: Record<Interest, number> = { disinterested: 3, unknown: 2, self_reported: 1, negotiating_position: 0 };

export interface EvidenceClass {
  claimStrength: ClaimStrength;
  productionClass: ProductionClass;
  interest: Interest;
}

/* ── Substrate facts carried beside the presentation classes ── */

/** result-manifest.js verification.status */
export type ManifestVerificationStatus = 'verified' | 'partially_verified' | 'unverified' | 'challenged';

/** notary.types.ts Anchor['kind'] */
export type AnchorKind = 'internal' | 'counterparty_cosigned' | 'timestamp_authority' | 'public_chain';

/** notary.types.ts ProofRef['system'] */
export type ProofSystem = 'sp1' | 'none';

/** maturity.js CAPABILITY_MATURITIES */
export type Maturity = 'production' | 'beta' | 'experimental' | 'research' | 'planned';

/* ── Time ── */

/** Every clock named. Not every case has every timestamp. */
export interface TemporalBasis {
  /** World state the claim describes was true at. */
  validAt?: ISODateTime;
  /** Knowledge-time cutoff: evidence available by. */
  knownAt?: ISODateTime;
  submittedAt?: ISODateTime;
  evaluatedAt?: ISODateTime;
  ruledAt?: ISODateTime;
  releasedAt?: ISODateTime;
  supersededAt?: ISODateTime;
  revokedAt?: ISODateTime;
  /** Ruling ceases to be relied upon after this instant, if the profile sets one. */
  expiresAt?: ISODateTime;
}

export const TEMPORAL_KEYS: ReadonlyArray<keyof TemporalBasis> = [
  'validAt', 'knownAt', 'submittedAt', 'evaluatedAt', 'ruledAt', 'releasedAt', 'supersededAt', 'revokedAt', 'expiresAt',
];

/* ── Use scope ── */

export type ToleranceKind = 'ABSOLUTE' | 'RELATIVE' | 'INTERVAL' | 'PROFILE_DEFINED';

export interface Tolerance {
  kind: ToleranceKind;
  value?: number;
  /** For INTERVAL: [low, high] in `unit`. */
  interval?: [number, number];
  unit?: string;
  /** Which claim predicate the tolerance governs. */
  appliesToPredicate?: string;
  note?: string;
}

export interface UseScope {
  useId: string;
  /** Human statement of the declared use, e.g. "Brokered sale and provisional settlement". */
  purpose: string;
  /** Machine code of the declared use as the profile names it. */
  useCode: string;
  tolerance?: Tolerance;
  /** The reliance or assurance class REQUESTED by the sponsor. */
  requestedAssurance?: AssuranceClass;
  relianceClass?: string;
  jurisdiction?: string;
}

/* ── Parties ── */

export type PartyRole =
  | 'CLAIM_SPONSOR'
  | 'CLAIMANT'
  | 'EVIDENCE_PRODUCER'
  | 'RESPONSIBLE_PROFESSIONAL'
  | 'RELYING_PARTY'
  | 'REVIEWER';

export interface Party {
  partyId: string;
  displayName: string;
  role: PartyRole;
  /** Only shown at INTERNAL_ONLY / PRIVATE_PREFLIGHT visibility. */
  privateNote?: string;
}

/* ── Claims ── */

export interface Uncertainty {
  value?: number;
  unit?: string;
  /** e.g. "±1σ", "reported instrument tolerance", "source disagreement". */
  semantics?: string;
}

export interface ClaimValue {
  value?: string | number;
  unit?: string;
  /** Measurement basis, e.g. "dry basis", "gross weight", "metal content". */
  basis?: string;
  uncertainty?: Uncertainty;
  /** World time the value describes. */
  validAt?: ISODateTime;
  /** When this value became knowable. */
  knownAt?: ISODateTime;
  /** Evidence artifact the value was read from. */
  sourceEvidenceId?: string;
  /** Transform (versioned) that produced a normalized value. */
  transformId?: CanonicalURI;
}

export type ClaimStatus = 'ASSERTED' | 'EXTRACTED' | 'NORMALIZED' | 'CONTESTED' | 'WITHDRAWN';

export interface Claim {
  claimId: string;
  canonicalId?: CanonicalURI;
  /** Predicate as the profile names it, e.g. "lot.identity.reconciles". */
  predicate: string;
  /** Human title. */
  title: string;
  subjectId: string;
  assertedValue?: ClaimValue;
  normalizedValue?: ClaimValue;
  claimantId?: string;
  evidenceIds: string[];
  status: ClaimStatus;
  /** The claim's own evidence class after combination (weakest input wins). */
  evidenceClass?: EvidenceClass;
  /** When this claim entered the case (for knowledge-time replay). */
  knownAt: ISODateTime;
  /** Visibility of the claim itself. */
  visibility: VisibilityClass;
  note?: string;
}

/* ── Evidence ── */

export type EvidenceKind =
  | 'INSPECTION_CERTIFICATE'
  | 'LABORATORY_REPORT'
  | 'WEIGHT_RECORD'
  | 'BILL_OF_LADING'
  | 'CUSTODY_RECORD'
  | 'CONTRACT'
  | 'SPECIFICATION'
  | 'SENSOR_COMMITMENT'
  | 'CORRESPONDENCE'
  | 'PHOTOGRAPH'
  | 'REGISTRY_EXTRACT'
  | 'OTHER';

export interface EvidenceArtifact {
  evidenceId: string;
  canonicalId?: CanonicalURI;
  title: string;
  kind: EvidenceKind;
  evidenceClass: EvidenceClass;
  producerId?: string;
  sourceId?: string;
  /** sha256 of the artifact's canonical content. Content-addressed identity. */
  contentHash?: Hash;
  visibility: VisibilityClass;
  /** When the artifact was created/captured by its producer. */
  capturedAt?: ISODateTime;
  /** World time the artifact describes. */
  validAt?: ISODateTime;
  /** When the artifact became knowable to this case. */
  knownAt: ISODateTime;
  mimeType?: string;
  supersedesEvidenceId?: string;
  /** Identifiers the artifact itself carries — the raw material of reconciliation. */
  declaredIdentifiers?: Record<string, string>;
  /** Bounded extracted fields shown as "source context". Never the raw bytes. */
  extracted?: Array<{ field: string; value: string; unit?: string; basis?: string }>;
  note?: string;
}

/* ── Checks ── */

export type AuthorityClass = 'CORE_DISTRIBUTION' | 'DOMAIN_PROFILE' | 'GOVERNANCE_POLICY';
export type CheckStatus = 'PASSED' | 'FAILED' | 'NOT_APPLICABLE' | 'NOT_EVALUATED';
export type Materiality = 'BLOCKING' | 'MATERIAL' | 'ADVISORY';
export type FindingOrigin = 'AUTOMATIC' | 'REVIEWER';

export type RemediationKind =
  | 'REQUEST_EVIDENCE'
  | 'REPLACE_EVIDENCE'
  | 'CORRECT_CLAIM'
  | 'CHANGE_USE'
  | 'CHANGE_TOLERANCE'
  | 'APPEAL'
  | 'RESUBMIT';

export interface Remediation {
  remediationId: string;
  kind: RemediationKind;
  title: string;
  /** What must be supplied or changed, stated so a sponsor can act on it. */
  instruction: string;
  /** Which party is expected to act. */
  actorRole?: PartyRole;
  resubmissionAllowed: boolean;
  /** What may be said about this remediation at each visibility. */
  disclosure: VisibilityClass;
}

export interface InvariantResult {
  invariantId: string;
  title: string;
  authorityClass: AuthorityClass;
  status: CheckStatus;
  /** Refusal code as the register names it. */
  refusalCode?: string;
  /** One sentence, scoped to this use/tolerance/evidence state. */
  summary: string;
  /** The reason, as the evaluator recorded it. */
  detail?: string;
  materiality?: Materiality;
  origin: FindingOrigin;
  /** Reviewer identity and basis when origin is REVIEWER. */
  reviewerId?: string;
  reviewerBasis?: string;
  affectedClaimIds: string[];
  /** Evidence inspected by this check. */
  evidenceIds: string[];
  /** Evidence the check needed and did not find, or found contradictory. */
  missingEvidence?: string[];
  contradictoryEvidenceIds?: string[];
  remediationIds?: string[];
  /** What may be disclosed about this result. */
  disclosureClass: VisibilityClass;
  /** Bounded public statement used when disclosure is narrower than the detail. */
  publicSummary?: string;
  evaluatedAt?: ISODateTime;
}

/* ── Assurance ── */

export interface AssuranceStatus {
  class: AssuranceClass;
  /** Plain statement of what the class rests on for THIS ruling. */
  basis: string;
  /** result-manifest.js verification.status, when a manifest exists. */
  manifestVerification?: ManifestVerificationStatus;
  manifestCheckedAt?: ISODateTime;
  /** notary.types.ts anchor kind, when a commitment was posted. */
  anchor?: AnchorKind;
  proofSystem?: ProofSystem;
  /** Explicit statement of what is NOT available. Rendered verbatim. */
  notAvailable?: string[];
  reviewedBy?: string;
  reviewedAt?: ISODateTime;
}

/* ── Profiles ── */

export interface InvariantDefinition {
  invariantId: string;
  title: string;
  authorityClass: AuthorityClass;
  purpose: string;
  applicability: string;
  inputRequirements: string[];
  refusalCode: string;
  /** Implementation / assurance state of the check itself. */
  implementation: Maturity;
  deterministic: boolean;
}

export interface AdmissionProfile {
  profileId: string;
  title: string;
  version: string;
  domain: Domain;
  /** sha256 over the canonical invariant register. */
  registerDigest: Hash;
  /** Plain statement of standing. The UI must not imply accreditation unless this says so. */
  recognition: string;
  useCodes: Array<{ useCode: string; purpose: string; defaultTolerance?: Tolerance }>;
  invariants: InvariantDefinition[];
  effectiveFrom: ISODateTime;
  fixture_only?: true;
}

/* ── Rulings ── */

export interface RulingCondition {
  conditionId: string;
  statement: string;
  /** Which invariant or claim the condition attaches to. */
  attachesTo?: string;
  satisfiedBy?: string;
}

export interface ReleaseProof {
  /** sha256 of the canonical result manifest. */
  manifestCommitment: Hash;
  manifestId: string;
  /** Merkle root or digest over evidence content hashes, where available. */
  evidenceRoot?: Hash;
  registerDigest: Hash;
  anchor?: AnchorKind;
  anchorRef?: string;
  releasedAt?: ISODateTime;
}

export interface Ruling {
  rulingId: string;
  caseId: string;
  revision: number;
  status: RulingStatus;
  assurance: AssuranceStatus;
  useScope: UseScope;
  profileId: string;
  profileVersion: string;
  registerDigest: Hash;
  temporalBasis: TemporalBasis;
  invariantResults: InvariantResult[];
  conditions?: RulingCondition[];
  limitations?: string[];
  /** Statement of what this ruling covers, in one paragraph. */
  scopeStatement: string;
  release?: ReleaseProof;
  supersedesRulingId?: string;
  supersededByRulingId?: string;
  /** Why a superseding or revoking event happened, as recorded. */
  transitionReason?: string;
  visibility: VisibilityClass;
  /** The claim ids this ruling ruled on (a subset of the case's claims at its knownAt). */
  ruledClaimIds: string[];
  /** Evidence considered at the ruling's knowledge cutoff. */
  consideredEvidenceIds: string[];
}

/* ── Revisions / events ── */

export type CaseEventKind =
  | 'CASE_CREATED'
  | 'CLAIM_ASSERTED'
  | 'EVIDENCE_ATTACHED'
  | 'EVIDENCE_REPLACED'
  | 'SUBMITTED'
  | 'EVALUATED'
  | 'RULED'
  | 'REVIEWER_FINDING'
  | 'REMEDIATION_REQUESTED'
  | 'RESUBMITTED'
  | 'RELEASED'
  | 'SUPERSEDED'
  | 'REVOKED';

export interface CaseEvent {
  eventId: string;
  kind: CaseEventKind;
  at: ISODateTime;
  actorId?: string;
  summary: string;
  refs?: string[];
  visibility: VisibilityClass;
}

/* ── Lineage ── */

export type LineageNodeKind =
  | 'SOURCE_ARTIFACT'
  | 'EXTRACTED_RECORD'
  | 'OBSERVATION'
  | 'CLAIM'
  | 'TRANSFORMATION'
  | 'INVARIANT_RESULT'
  | 'RULING';

export type LineageRelation =
  | 'EXTRACTED_FROM'
  | 'OBSERVED_IN'
  | 'ASSERTS'
  | 'NORMALIZED_BY'
  | 'INSPECTED_BY'
  | 'CONTRADICTS'
  | 'MISSING_LINK'
  | 'SUPPORTS'
  | 'RULED_IN'
  | 'SUPERSEDES';

export interface LineageNode {
  nodeId: string;
  kind: LineageNodeKind;
  label: string;
  /** Points at the case object this node represents. */
  refId: string;
  knownAt?: ISODateTime;
  visibility: VisibilityClass;
}

export interface LineageEdge {
  from: string;
  to: string;
  relation: LineageRelation;
  /** True when the edge is expected by the profile but absent — the broken link. */
  broken?: boolean;
  note?: string;
}

/* ── Subject ── */

export interface Subject {
  subjectId: string;
  canonicalId?: CanonicalURI;
  subjectType: string;
  displayName: string;
  /** Domain-specific descriptors from the fixture/profile; never interpreted by UI. */
  descriptors?: Array<{ label: string; value: string; unit?: string }>;
}

/* ── The bundle ── */

export interface ClaimCaseBundle {
  /** Always true for committed demonstration data. Rendered as a banner. */
  fixture_only: true;
  fixtureNote: string;
  caseId: string;
  domain: Domain;
  title: string;
  subject: Subject;
  parties: Party[];
  useScope: UseScope;
  temporalBasis: TemporalBasis;
  claims: Claim[];
  evidence: EvidenceArtifact[];
  profileId: string;
  profileVersion: string;
  /** Current status of the case, which may differ from the current ruling's status while remediation is in flight. */
  status: RulingStatus;
  currentRuling?: Ruling;
  previousRulings: Ruling[];
  events: CaseEvent[];
  lineage: { nodes: LineageNode[]; edges: LineageEdge[] };
  visibility: VisibilityClass;
  assignedReviewerId?: string;
  /** Last change the current viewer would care about (queue "what changed"). */
  lastChangedAt: ISODateTime;
  /** The instant the fixture considers "now". Deterministic. */
  asOf: ISODateTime;
}
