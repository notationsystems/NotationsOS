/**
 * DEMONSTRATION FIXTURE — fixture_only: true.
 *
 * A synthetic Caravan brokerage admission profile for specialty cargo. It is
 * NOT accredited, regulated, or externally recognized. The commodity class is
 * deliberately generic ("specialty cargo, demonstration class SC-3") because
 * the industry profile is commercially provisional; every domain rule lives
 * here, not in a component.
 *
 * The register digest is sha256 over the canonical JSON of `invariants`
 * (see src/fixtures/digest.ts) and is asserted by a test, so the profile
 * version and its digest cannot drift apart silently.
 */

import type { AdmissionProfile, InvariantDefinition } from '@/domain/types';
import { digestOf } from '../digestLookup';

export const CARAVAN_INVARIANTS: InvariantDefinition[] = [
  /* ── Core distribution requirements: apply to every Payload result ── */
  {
    invariantId: 'CORE-001',
    title: 'Evidence is content-addressed',
    authorityClass: 'CORE_DISTRIBUTION',
    purpose: 'Every artifact relied upon carries a content hash so the ruling can name exactly what it inspected.',
    applicability: 'All cases.',
    inputRequirements: ['contentHash on every considered evidence artifact'],
    refusalCode: 'E_EVIDENCE_UNADDRESSED',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CORE-002',
    title: 'Evidence known before cutoff',
    authorityClass: 'CORE_DISTRIBUTION',
    purpose: 'No artifact that became knowable after the declared knowledge cutoff may influence the ruling.',
    applicability: 'All cases with a declared knowledge cutoff.',
    inputRequirements: ['knownAt on every artifact', 'temporalBasis.knownAt on the case'],
    refusalCode: 'E_EVIDENCE_AFTER_CUTOFF',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CORE-003',
    title: 'Claim strength admissible',
    authorityClass: 'CORE_DISTRIBUTION',
    purpose: 'A claim that rests on any representative-class input is inadmissible for a real-world assertion (corpus contract: weakest input wins).',
    applicability: 'All claims with a combined evidence class.',
    inputRequirements: ['claim_strength on every input artifact'],
    refusalCode: 'E_CLAIM_RESTS_ON_REPRESENTATIVE',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CORE-004',
    title: 'Result manifest complete',
    authorityClass: 'CORE_DISTRIBUTION',
    purpose: 'The ruling is accompanied by a result manifest naming corpus build, methodology, evidence, computations, uncertainties, contradictions and verification state.',
    applicability: 'All rulings that are released.',
    inputRequirements: ['notations.result-manifest.v1 sidecar'],
    refusalCode: 'E_MANIFEST_INCOMPLETE',
    implementation: 'experimental',
    deterministic: true,
  },
  {
    invariantId: 'CORE-005',
    title: 'Valid time and knowledge cutoff declared',
    authorityClass: 'CORE_DISTRIBUTION',
    purpose: 'A ruling without both clocks cannot be replayed or compared.',
    applicability: 'All cases.',
    inputRequirements: ['temporalBasis.validAt', 'temporalBasis.knownAt'],
    refusalCode: 'E_TEMPORAL_BASIS_MISSING',
    implementation: 'beta',
    deterministic: true,
  },

  /* ── Domain profile requirements: Caravan brokerage, specialty cargo ── */
  {
    invariantId: 'CAR-101',
    title: 'Lot identity reconciles across evidence',
    authorityClass: 'DOMAIN_PROFILE',
    purpose: 'The lot the certificate describes, the lot in custody, and the lot on the bill of lading must be demonstrably the same physical lot.',
    applicability: 'Any use that relies on a certificate for a transported lot.',
    inputRequirements: ['inspection or laboratory certificate naming sample and lot', 'custody record naming lot and sample event', 'bill of lading naming lot'],
    refusalCode: 'E_LOT_IDENTITY_UNRECONCILED',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CAR-102',
    title: 'Declared quantity within tolerance of the weight record',
    authorityClass: 'DOMAIN_PROFILE',
    purpose: 'The quantity the sponsor declares must agree with an independent weight record within the tolerance of the declared use.',
    applicability: 'Uses with a quantity tolerance.',
    inputRequirements: ['declared quantity with basis', 'weight record with basis', 'use tolerance'],
    refusalCode: 'E_QUANTITY_OUTSIDE_TOLERANCE',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CAR-103',
    title: 'Certificate covers the valid time',
    authorityClass: 'DOMAIN_PROFILE',
    purpose: 'The certificate\'s sampling time must fall within the profile window before the declared valid time; a stale certificate does not describe the cargo at that time.',
    applicability: 'Uses relying on condition or grade.',
    inputRequirements: ['certificate sampling time', 'temporalBasis.validAt', 'profile window (14 days)'],
    refusalCode: 'E_CERTIFICATE_STALE',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CAR-104',
    title: 'Custody unbroken',
    authorityClass: 'DOMAIN_PROFILE',
    purpose: 'No custody handoff gap may exceed the profile maximum (6 hours) between sampling and loading.',
    applicability: 'Uses relying on the certificate describing the shipped lot.',
    inputRequirements: ['custody record with signed handoffs'],
    refusalCode: 'E_CUSTODY_GAP',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CAR-105',
    title: 'Claimed grade supported by independent report',
    authorityClass: 'DOMAIN_PROFILE',
    purpose: 'A grade or specification claim must be supported by a laboratory report whose producer is not the claimant.',
    applicability: 'Uses relying on grade or specification.',
    inputRequirements: ['laboratory report', 'producer identity', 'CAR-101 passed'],
    refusalCode: 'E_SPEC_UNSUPPORTED',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'CAR-106',
    title: 'Evidence producer independent of claimant',
    authorityClass: 'DOMAIN_PROFILE',
    purpose: 'A certificate produced by the claimant is self_reported on the interest axis and cannot alone support admission for settlement.',
    applicability: 'Settlement uses.',
    inputRequirements: ['producer identity on each certificate', 'interest axis'],
    refusalCode: 'E_PRODUCER_NOT_INDEPENDENT',
    implementation: 'beta',
    deterministic: true,
  },

  /* ── Governance policy requirements ── */
  {
    invariantId: 'GOV-201',
    title: 'Private detail withheld from public projection',
    authorityClass: 'GOVERNANCE_POLICY',
    purpose: 'Failure detail classed PRIVATE_PREFLIGHT or INTERNAL_ONLY must not appear in COUNTERPARTY_SHARED or PUBLIC_RULING surfaces.',
    applicability: 'All released rulings.',
    inputRequirements: ['disclosureClass on every invariant result'],
    refusalCode: 'E_DISCLOSURE_LEAK',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'GOV-202',
    title: 'Assurance not overclaimed',
    authorityClass: 'GOVERNANCE_POLICY',
    purpose: 'The ruling\'s assurance class may not exceed what the evidence, review and anchoring actually support.',
    applicability: 'All rulings.',
    inputRequirements: ['assurance basis', 'anchor kind', 'review record'],
    refusalCode: 'E_ASSURANCE_OVERCLAIM',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'GOV-203',
    title: 'Reviewer findings attributed',
    authorityClass: 'GOVERNANCE_POLICY',
    purpose: 'Any reviewer-entered finding carries the reviewer identity and a recorded basis; there is no unattributed override.',
    applicability: 'Rulings with human review.',
    inputRequirements: ['reviewerId', 'reviewerBasis'],
    refusalCode: 'E_REVIEWER_UNATTRIBUTED',
    implementation: 'beta',
    deterministic: true,
  },
  {
    invariantId: 'GOV-204',
    title: 'Expiry declared for settlement uses',
    authorityClass: 'GOVERNANCE_POLICY',
    purpose: 'A ruling for a settlement use must state when reliance ends.',
    applicability: 'Settlement uses.',
    inputRequirements: ['temporalBasis.expiresAt'],
    refusalCode: 'E_EXPIRY_MISSING',
    implementation: 'experimental',
    deterministic: true,
  },
];

export const CARAVAN_PROFILE: AdmissionProfile = {
  fixture_only: true,
  profileId: 'caravan.brokerage.specialty-cargo',
  title: 'Caravan — brokerage admission, specialty cargo (demonstration)',
  version: '0.3.0-demo',
  domain: 'CARAVAN',
  // Stamped by scripts/stamp-digests.mjs and asserted by src/fixtures/digest.test.ts
  registerDigest: digestOf("register:caravan.brokerage.specialty-cargo@0.3.0-demo"),
  recognition:
    'Demonstration profile. Not accredited, not regulated, not externally recognized. The register digest is computed over this fixture\'s invariant list only.',
  useCodes: [
    { useCode: 'USE.INDICATIVE_OFFER', purpose: 'Indicative offer to counterparties', defaultTolerance: { kind: 'RELATIVE', value: 2, appliesToPredicate: 'quantity.gross' } },
    { useCode: 'USE.BROKERED_SALE_PROVISIONAL_SETTLEMENT', purpose: 'Brokered sale and provisional settlement', defaultTolerance: { kind: 'RELATIVE', value: 0.5, appliesToPredicate: 'quantity.gross' } },
    { useCode: 'USE.INSURANCE_DECLARATION', purpose: 'Cargo insurance declaration', defaultTolerance: { kind: 'PROFILE_DEFINED' } },
    { useCode: 'USE.FINAL_SETTLEMENT', purpose: 'Final settlement', defaultTolerance: { kind: 'ABSOLUTE', value: 0.05, unit: 't', appliesToPredicate: 'quantity.gross' } },
  ],
  invariants: CARAVAN_INVARIANTS,
  effectiveFrom: '2026-08-01T00:00:00Z',
};
