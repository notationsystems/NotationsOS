/**
 * DEMONSTRATION FIXTURES — fixture_only: true — thin queue cases.
 *
 * Small but complete bundles so the case queue can answer "what is pending,
 * what was revoked, what is nearing expiry, what is still a draft, what is
 * being evaluated". Each is deterministic and synthetic.
 */
import type { ClaimCaseBundle, Ruling, RulingStatus, TemporalBasis, UseScope } from '@/domain/types';
import { digestOf } from '../digestLookup';
import { CARAVAN_PROFILE } from './profile';

const AS_OF = '2026-09-01T12:00:00Z';
const REGISTER = digestOf('register:caravan.brokerage.specialty-cargo@0.3.0-demo');
const RELEASES = [
  { releaseId: 'REL-CAR-2026.08.11', buildId: 'build-caravan-sc-2026.08.11', knownAt: '2026-08-12T12:00:00Z' },
  { releaseId: 'REL-CAR-2026.08.25', buildId: 'build-caravan-sc-2026.08.25', knownAt: '2026-08-26T09:30:00Z' },
  { releaseId: 'REL-CAR-2026.09.01', buildId: 'build-caravan-sc-2026.09.01', knownAt: '2026-09-01T12:00:00Z' },
];
/** The latest release whose cutoff is at or before the ruling's knowledge cutoff, else the earliest. */
function releaseFor(knownAt: string | undefined) {
  const eligible = RELEASES.filter((r) => knownAt !== undefined && r.knownAt <= knownAt);
  return eligible[eligible.length - 1] ?? RELEASES[0];
}
const NOTE = 'Synthetic demonstration case. Every party, identifier, figure and timestamp is invented.';

const PARTIES = [
  { partyId: 'P-SPONSOR-HARBOURLINE', displayName: 'Harbourline Brokerage', role: 'CLAIM_SPONSOR' as const },
  { partyId: 'P-CLAIMANT-MERIDIAN', displayName: 'Meridian Origination (seller)', role: 'CLAIMANT' as const },
  { partyId: 'P-PRODUCER-NORTHGATE', displayName: 'Northgate Inspection Services', role: 'EVIDENCE_PRODUCER' as const },
  { partyId: 'P-RELYING-CASTELLAN', displayName: 'Castellan Metals (buyer)', role: 'RELYING_PARTY' as const },
];

interface ThinSpec {
  lot: string;
  status: RulingStatus;
  useCode: string;
  purpose: string;
  tolerance: UseScope['tolerance'];
  temporal: TemporalBasis;
  createdAt: string;
  lastChangedAt: string;
  ruling?: Omit<Ruling, 'caseId' | 'corpus' | 'useScope' | 'profileId' | 'profileVersion' | 'registerDigest' | 'temporalBasis' | 'ruledClaimIds' | 'consideredEvidenceIds' | 'visibility'>;
  events: ClaimCaseBundle['events'];
  evidenceKnownAt: string;
  certNo: string;
  withCertificate?: boolean;
  extraLimitations?: string[];
  sponsorOverride?: string;
  recordIds?: string[];
}

function thin(s: ThinSpec): ClaimCaseBundle {
  const caseId = `CASE-CAR-${s.lot.replace('-', '')}`;
  const claimId = `C-${s.lot.replace('-', '')}-1`;
  const evId = `EV-CERT-${s.certNo}`;
  const useScope: UseScope = { useId: `USE-${s.lot}`, useCode: s.useCode, purpose: s.purpose, tolerance: s.tolerance, jurisdiction: 'Demonstration' };
  const evidence = s.withCertificate === false ? [] : [{
    evidenceId: evId,
    canonicalId: `notation://artifact/payload-os-demo/${s.certNo}`,
    title: `Inspection certificate ${s.certNo}`,
    kind: 'INSPECTION_CERTIFICATE' as const,
    evidenceClass: { claimStrength: 'reported' as const, productionClass: 'measured' as const, interest: 'disinterested' as const },
    producerId: 'P-PRODUCER-NORTHGATE',
    sourceId: 'northgate-lims',
    contentHash: digestOf(`artifact:${evId}`),
    recordIds: s.recordIds,
    visibility: 'COUNTERPARTY_SHARED' as const,
    capturedAt: s.evidenceKnownAt,
    validAt: s.temporal.validAt,
    knownAt: s.evidenceKnownAt,
    mimeType: 'application/pdf',
    declaredIdentifiers: { certificateNo: s.certNo, lotId: s.lot },
    extracted: [{ field: 'Moisture', value: '5.8', unit: '%', basis: 'As received' }, { field: 'Lot identifier', value: s.lot }],
  }];
  const ruling: Ruling | undefined = s.ruling
    ? {
        ...s.ruling,
        caseId,
        corpus: releaseFor(s.temporal.knownAt),
        useScope,
        profileId: CARAVAN_PROFILE.profileId,
        profileVersion: CARAVAN_PROFILE.version,
        registerDigest: REGISTER,
        temporalBasis: s.temporal,
        ruledClaimIds: [claimId],
        consideredEvidenceIds: evidence.map((e) => e.evidenceId),
        visibility: 'COUNTERPARTY_SHARED',
      }
    : undefined;
  return {
    fixture_only: true,
    fixtureNote: NOTE,
    caseId,
    domain: 'CARAVAN',
    title: `Specialty Cargo Lot ${s.lot}`,
    subject: { subjectId: `LOT-${s.lot}`, canonicalId: `notation://entity/payload-os-demo/lot/${s.lot}`, subjectType: 'Transport lot', displayName: `Specialty Cargo Lot ${s.lot}`, descriptors: [{ label: 'Commodity class', value: 'Specialty cargo, demonstration class SC-3' }] },
    parties: PARTIES,
    useScope,
    temporalBasis: s.temporal,
    claims: [{
      claimId,
      canonicalId: `notation://claim/payload-os-demo/${s.lot}/condition.moisture`,
      predicate: 'condition.moisture',
      title: 'Moisture content within contract specification (≤ 8.0 %)',
      subjectId: `LOT-${s.lot}`,
      assertedValue: { value: 5.8, unit: '%', basis: 'As received', validAt: s.temporal.validAt, knownAt: s.createdAt, sourceEvidenceId: evidence[0]?.evidenceId },
      claimantId: 'P-CLAIMANT-MERIDIAN',
      evidenceIds: evidence.map((e) => e.evidenceId),
      status: evidence.length ? 'EXTRACTED' : 'ASSERTED',
      evidenceClass: { claimStrength: 'reported', productionClass: evidence.length ? 'measured' : 'asserted', interest: evidence.length ? 'disinterested' : 'self_reported' },
      knownAt: s.createdAt,
      visibility: 'COUNTERPARTY_SHARED',
    }],
    evidence,
    profileId: CARAVAN_PROFILE.profileId,
    profileVersion: CARAVAN_PROFILE.version,
    corpusId: 'caravan.specialty-cargo',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    status: s.status,
    currentRuling: ruling,
    previousRulings: [],
    events: s.events,
    lineage: {
      nodes: [
        ...evidence.map((e) => ({ nodeId: `n:art:${e.evidenceId}`, kind: 'SOURCE_ARTIFACT' as const, label: e.title, refId: e.evidenceId, knownAt: e.knownAt, visibility: 'COUNTERPARTY_SHARED' as const })),
        { nodeId: `n:claim:${claimId}`, kind: 'CLAIM', label: `${claimId} moisture`, refId: claimId, knownAt: s.createdAt, visibility: 'COUNTERPARTY_SHARED' },
        ...(ruling ? [{ nodeId: `n:ruling:${ruling.rulingId}`, kind: 'RULING' as const, label: `${ruling.rulingId} ${ruling.status}`, refId: ruling.rulingId, knownAt: ruling.temporalBasis.ruledAt, visibility: 'COUNTERPARTY_SHARED' as const }] : []),
      ],
      edges: [
        ...evidence.map((e) => ({ from: `n:art:${e.evidenceId}`, to: `n:claim:${claimId}`, relation: 'ASSERTS' as const })),
        ...(ruling ? [{ from: `n:claim:${claimId}`, to: `n:ruling:${ruling.rulingId}`, relation: 'RULED_IN' as const }] : []),
      ],
    },
    visibility: 'COUNTERPARTY_SHARED',
    lastChangedAt: s.lastChangedAt,
    asOf: AS_OF,
  };
}

const passed = (at: string, ids: string[]) => [
  { invariantId: 'CORE-001', title: 'Evidence is content-addressed', authorityClass: 'CORE_DISTRIBUTION' as const, status: 'PASSED' as const, summary: 'All considered artifacts carry a content hash.', origin: 'AUTOMATIC' as const, affectedClaimIds: [], evidenceIds: ids, disclosureClass: 'COUNTERPARTY_SHARED' as const, evaluatedAt: at },
  { invariantId: 'CORE-005', title: 'Valid time and knowledge cutoff declared', authorityClass: 'CORE_DISTRIBUTION' as const, status: 'PASSED' as const, summary: 'Both clocks declared.', origin: 'AUTOMATIC' as const, affectedClaimIds: [], evidenceIds: [], disclosureClass: 'COUNTERPARTY_SHARED' as const, evaluatedAt: at },
  { invariantId: 'CAR-103', title: 'Certificate covers the valid time', authorityClass: 'DOMAIN_PROFILE' as const, status: 'PASSED' as const, summary: 'Certificate sampling within the 14-day window before valid time.', origin: 'AUTOMATIC' as const, affectedClaimIds: [], evidenceIds: ids, disclosureClass: 'COUNTERPARTY_SHARED' as const, evaluatedAt: at },
  { invariantId: 'CAR-105', title: 'Claimed grade supported by independent report', authorityClass: 'DOMAIN_PROFILE' as const, status: 'PASSED' as const, summary: 'Reported by Northgate, independent of the claimant.', origin: 'AUTOMATIC' as const, affectedClaimIds: [], evidenceIds: ids, disclosureClass: 'COUNTERPARTY_SHARED' as const, evaluatedAt: at },
];

/* ── PENDING_EVIDENCE: awaiting laboratory report ── */
export const CASE_9A017 = thin({
  lot: '9A-017',
  status: 'PENDING_EVIDENCE',
  useCode: 'USE.INSURANCE_DECLARATION',
  purpose: 'Cargo insurance declaration',
  tolerance: { kind: 'PROFILE_DEFINED' },
  temporal: { validAt: '2026-08-30T10:00:00Z', knownAt: '2026-08-31T09:00:00Z', submittedAt: '2026-08-31T08:30:00Z', evaluatedAt: '2026-08-31T09:05:00Z', ruledAt: '2026-08-31T09:05:00Z' },
  createdAt: '2026-08-30T15:00:00Z',
  lastChangedAt: '2026-08-31T09:05:00Z',
  evidenceKnownAt: '2026-08-30T15:30:00Z',
  certNo: 'NIS-4431',
  withCertificate: false,
  ruling: {
    rulingId: 'RUL-9A017-r1', revision: 1, status: 'PENDING_EVIDENCE',
    assurance: { class: 'UNVERIFIED_EVALUATION', basis: 'Deterministic evaluation stopped at pending evidence.', manifestVerification: 'unverified', manifestCheckedAt: '2026-08-31T09:05:00Z', anchor: 'internal', proofSystem: 'none', notAvailable: ['External verification not available'] },
    scopeStatement: 'Ruled on one claim about lot 9A-017 for a cargo insurance declaration. Evaluation cannot complete without a laboratory report.',
    invariantResults: [
      { invariantId: 'CAR-105', title: 'Claimed grade supported by independent report', authorityClass: 'DOMAIN_PROFILE', status: 'NOT_EVALUATED', refusalCode: 'E_SPEC_UNSUPPORTED', materiality: 'BLOCKING', summary: 'Not evaluated: no laboratory report attached by the knowledge cutoff.', origin: 'AUTOMATIC', affectedClaimIds: ['C-9A017-1'], evidenceIds: [], missingEvidence: ['Laboratory report for lot 9A-017 from a producer independent of the claimant'], remediationIds: [], disclosureClass: 'COUNTERPARTY_SHARED', publicSummary: 'Pending: laboratory report not yet supplied.', evaluatedAt: '2026-08-31T09:05:00Z' },
    ],
    limitations: ['No reliance granted.'],
    release: { manifestCommitment: digestOf('manifest:RUL-9A017-r1'), manifestId: 'rm:RUL-9A017-r1', registerDigest: REGISTER, anchor: 'internal', anchorRef: 'log:payload-os-demo#000221', releasedAt: '2026-08-31T09:06:00Z' },
  },
  events: [
    { eventId: 'EVT-9A017-01', kind: 'CASE_CREATED', at: '2026-08-30T15:00:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Case created for lot 9A-017.', visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-9A017-02', kind: 'SUBMITTED', at: '2026-08-31T08:30:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Submitted for USE.INSURANCE_DECLARATION.', visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-9A017-03', kind: 'RULED', at: '2026-08-31T09:05:00Z', summary: 'RUL-9A017-r1: PENDING_EVIDENCE. Laboratory report missing.', refs: ['RUL-9A017-r1'], visibility: 'COUNTERPARTY_SHARED' },
  ],
});

/* ── REVOKED: certificate withdrawn by its producer after release ── */
export const CASE_3F440 = thin({
  lot: '3F-440',
  status: 'REVOKED',
  useCode: 'USE.INSURANCE_DECLARATION',
  purpose: 'Cargo insurance declaration',
  tolerance: { kind: 'PROFILE_DEFINED' },
  temporal: { validAt: '2026-08-11T12:00:00Z', knownAt: '2026-08-12T09:00:00Z', submittedAt: '2026-08-12T09:30:00Z', evaluatedAt: '2026-08-12T10:00:00Z', ruledAt: '2026-08-12T10:00:00Z', releasedAt: '2026-08-12T10:10:00Z', revokedAt: '2026-08-30T15:00:00Z' },
  createdAt: '2026-08-12T08:00:00Z',
  lastChangedAt: '2026-08-30T15:00:00Z',
  evidenceKnownAt: '2026-08-12T08:30:00Z',
  certNo: 'NIS-4390',
  recordIds: ['REC-0111', 'REC-0112'],
  ruling: {
    rulingId: 'RUL-3F440-r1', revision: 1, status: 'REVOKED',
    transitionReason: 'Revoked 2026-08-30 15:00 UTC: Northgate Inspection Services withdrew certificate NIS-4390 (withdrawal notice NIS-W-0071) citing a sample chain-of-custody defect at the laboratory. The ruling rested on that certificate. Revocation is not a finding about the cargo.',
    assurance: { class: 'UNVERIFIED_EVALUATION', basis: 'Deterministic evaluation completed 2026-08-12 10:00 UTC. No review, verifier run or external anchor.', manifestVerification: 'unverified', manifestCheckedAt: '2026-08-12T10:00:00Z', anchor: 'internal', proofSystem: 'none', notAvailable: ['External verification not available', 'Human review not recorded'] },
    scopeStatement: 'Ruled ADMITTED on one claim about lot 3F-440 for a cargo insurance declaration. Revoked 2026-08-30 after the supporting certificate was withdrawn by its producer.',
    invariantResults: passed('2026-08-12T10:00:00Z', ['EV-CERT-NIS-4390']),
    limitations: ['Revoked. Reliance must stop.'],
    release: { manifestCommitment: digestOf('manifest:RUL-3F440-r1'), manifestId: 'rm:RUL-3F440-r1', evidenceRoot: digestOf('evidenceRoot:RUL-3F440-r1'), registerDigest: REGISTER, anchor: 'internal', anchorRef: 'log:payload-os-demo#000160', releasedAt: '2026-08-12T10:10:00Z' },
  },
  events: [
    { eventId: 'EVT-3F440-01', kind: 'CASE_CREATED', at: '2026-08-12T08:00:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Case created for lot 3F-440.', visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-3F440-02', kind: 'EVIDENCE_ATTACHED', at: '2026-08-12T08:30:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Attached certificate NIS-4390.', refs: ['EV-CERT-NIS-4390'], visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-3F440-03', kind: 'SUBMITTED', at: '2026-08-12T09:30:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Submitted for USE.INSURANCE_DECLARATION.', visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-3F440-04', kind: 'RULED', at: '2026-08-12T10:00:00Z', summary: 'RUL-3F440-r1: ADMITTED.', refs: ['RUL-3F440-r1'], visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-3F440-05', kind: 'RELEASED', at: '2026-08-12T10:10:00Z', summary: 'RUL-3F440-r1 released.', refs: ['RUL-3F440-r1'], visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-3F440-06', kind: 'REVOKED', at: '2026-08-30T15:00:00Z', actorId: 'P-PRODUCER-NORTHGATE', summary: 'RUL-3F440-r1 revoked: certificate NIS-4390 withdrawn by producer (NIS-W-0071).', refs: ['RUL-3F440-r1', 'EV-CERT-NIS-4390'], visibility: 'COUNTERPARTY_SHARED' },
  ],
});

/* ── DRAFT: saved, never submitted, never evaluated ── */
export const CASE_8D902 = thin({
  lot: '8D-902',
  status: 'DRAFT',
  useCode: 'USE.INDICATIVE_OFFER',
  purpose: 'Indicative offer to counterparties',
  tolerance: { kind: 'RELATIVE', value: 2, appliesToPredicate: 'quantity.gross' },
  temporal: { validAt: '2026-09-02T08:00:00Z' },
  createdAt: '2026-09-01T09:00:00Z',
  lastChangedAt: '2026-09-01T09:40:00Z',
  evidenceKnownAt: '2026-09-01T09:40:00Z',
  certNo: 'NIS-4436',
  recordIds: ['REC-0401', 'REC-0402'],
  events: [
    { eventId: 'EVT-8D902-01', kind: 'CASE_CREATED', at: '2026-09-01T09:00:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Draft created for lot 8D-902. Knowledge cutoff not yet declared.', visibility: 'PRIVATE_PREFLIGHT' },
    { eventId: 'EVT-8D902-02', kind: 'EVIDENCE_ATTACHED', at: '2026-09-01T09:40:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Attached certificate NIS-4436.', refs: ['EV-CERT-NIS-4436'], visibility: 'PRIVATE_PREFLIGHT' },
  ],
});

/* ── ADMITTED, nearing expiry ── */
export const CASE_2E118 = thin({
  lot: '2E-118',
  status: 'ADMITTED',
  useCode: 'USE.BROKERED_SALE_PROVISIONAL_SETTLEMENT',
  purpose: 'Brokered sale and provisional settlement',
  tolerance: { kind: 'RELATIVE', value: 0.5, appliesToPredicate: 'quantity.gross' },
  temporal: { validAt: '2026-08-04T14:00:00Z', knownAt: '2026-08-05T09:00:00Z', submittedAt: '2026-08-05T09:30:00Z', evaluatedAt: '2026-08-05T10:00:00Z', ruledAt: '2026-08-05T10:00:00Z', releasedAt: '2026-08-05T10:15:00Z', expiresAt: '2026-09-04T00:00:00Z' },
  createdAt: '2026-08-05T08:00:00Z',
  lastChangedAt: '2026-08-05T10:15:00Z',
  evidenceKnownAt: '2026-08-05T08:30:00Z',
  certNo: 'NIS-4377',
  recordIds: ['REC-0101', 'REC-0102'],
  ruling: {
    rulingId: 'RUL-2E118-r1', revision: 1, status: 'ADMITTED',
    assurance: { class: 'UNVERIFIED_EVALUATION', basis: 'Deterministic evaluation completed 2026-08-05 10:00 UTC. No review, verifier run or external anchor.', manifestVerification: 'unverified', manifestCheckedAt: '2026-08-05T10:00:00Z', anchor: 'internal', proofSystem: 'none', notAvailable: ['External verification not available', 'Human review not recorded'] },
    scopeStatement: 'Ruled ADMITTED on one claim about lot 2E-118 for brokered sale and provisional settlement. Reliance ends 2026-09-04 00:00 UTC.',
    invariantResults: [
      ...passed('2026-08-05T10:00:00Z', ['EV-CERT-NIS-4377']),
      { invariantId: 'GOV-204', title: 'Expiry declared for settlement uses', authorityClass: 'GOVERNANCE_POLICY', status: 'PASSED', summary: 'Reliance ends 2026-09-04 00:00 UTC.', origin: 'AUTOMATIC', affectedClaimIds: [], evidenceIds: [], disclosureClass: 'COUNTERPARTY_SHARED', evaluatedAt: '2026-08-05T10:00:00Z' },
    ],
    release: { manifestCommitment: digestOf('manifest:RUL-2E118-r1'), manifestId: 'rm:RUL-2E118-r1', evidenceRoot: digestOf('evidenceRoot:RUL-2E118-r1'), registerDigest: REGISTER, anchor: 'internal', anchorRef: 'log:payload-os-demo#000142', releasedAt: '2026-08-05T10:15:00Z' },
  },
  events: [
    { eventId: 'EVT-2E118-01', kind: 'CASE_CREATED', at: '2026-08-05T08:00:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Case created for lot 2E-118.', visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-2E118-02', kind: 'SUBMITTED', at: '2026-08-05T09:30:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Submitted for USE.BROKERED_SALE_PROVISIONAL_SETTLEMENT.', visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-2E118-03', kind: 'RULED', at: '2026-08-05T10:00:00Z', summary: 'RUL-2E118-r1: ADMITTED.', refs: ['RUL-2E118-r1'], visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-2E118-04', kind: 'RELEASED', at: '2026-08-05T10:15:00Z', summary: 'RUL-2E118-r1 released.', refs: ['RUL-2E118-r1'], visibility: 'COUNTERPARTY_SHARED' },
  ],
});

/* ── EVALUATING: submitted, evaluation not complete ── */
export const CASE_6C305 = thin({
  lot: '6C-305',
  status: 'EVALUATING',
  useCode: 'USE.INDICATIVE_OFFER',
  purpose: 'Indicative offer to counterparties',
  tolerance: { kind: 'RELATIVE', value: 2, appliesToPredicate: 'quantity.gross' },
  temporal: { validAt: '2026-08-31T16:00:00Z', knownAt: '2026-09-01T11:30:00Z', submittedAt: '2026-09-01T11:40:00Z' },
  createdAt: '2026-09-01T10:00:00Z',
  lastChangedAt: '2026-09-01T11:40:00Z',
  evidenceKnownAt: '2026-09-01T10:20:00Z',
  certNo: 'NIS-4434',
  recordIds: ['REC-0411', 'REC-0412'],
  events: [
    { eventId: 'EVT-6C305-01', kind: 'CASE_CREATED', at: '2026-09-01T10:00:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Case created for lot 6C-305.', visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-6C305-02', kind: 'EVIDENCE_ATTACHED', at: '2026-09-01T10:20:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Attached certificate NIS-4434.', refs: ['EV-CERT-NIS-4434'], visibility: 'COUNTERPARTY_SHARED' },
    { eventId: 'EVT-6C305-03', kind: 'SUBMITTED', at: '2026-09-01T11:40:00Z', actorId: 'P-SPONSOR-HARBOURLINE', summary: 'Submitted for USE.INDICATIVE_OFFER; evaluation in progress.', visibility: 'COUNTERPARTY_SHARED' },
  ],
});
