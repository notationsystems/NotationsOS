/**
 * DEMONSTRATION FIXTURE — fixture_only: true — the Caravan specialty-cargo
 * corpus: three releases, the records they carry, the retractions that
 * corrected or withdrew records, and the rights schedule of every source.
 *
 * This is the product surface the workbench cases draw on. Records are
 * facts about lots and samples with value, unit, basis, uncertainty bounds,
 * validity bounds, both clocks, provenance, evidence class, rights and a
 * stable identity. Nothing is edited in place: a correction supersedes, a
 * withdrawal retracts, and the earlier release still shows what it said.
 *
 * Identity discipline: a laboratory result is a fact about a SAMPLE. It
 * reaches a LOT only through an identity-link record supplied by evidence.
 * Lot 7C-104 has no such link in any release; lot 5B-221 does.
 */
import type { Corpus, CorpusRecord, CorpusRelease, Retraction, RightsSchedule, StageRecord } from '@/domain/corpus';
import { derivePermittedUses } from '@/domain/corpus';
import type { SourceRegistration } from '@/data-os/contracts';
import { captureFor } from '../capture';
import { digestOf } from '../digestLookup';

const CORPUS_ID = 'caravan.specialty-cargo';
const AUTH = 'payload-os-demo';
const uri = (kind: string, local: string) => `notation://${kind}/${AUTH}/${local}`;

/**
 * Source registrations: the policy of record for every source, in the
 * data-os SourceRegistration contract. Purposes, operations and audiences
 * are exact grants; PROPRIETARY_STRATEGY and TRADING are prohibited
 * purposes on every registration, not merely absent.
 */
const POLICY_WINDOW = { effectiveFrom: '2026-08-01T00:00:00Z', effectiveUntil: '2027-08-01T00:00:00Z' } as const;
/** The rights schedule is evaluated at the current release's knowledge cutoff. */
const RIGHTS_AT = '2026-09-01T12:00:00Z';

const reg = (r: Omit<SourceRegistration, 'registrationId' | 'sourceId' | 'effectiveFrom' | 'effectiveUntil'> & { local: string; effectiveUntil?: string }): SourceRegistration => ({
  registrationId: `source:${r.local}`,
  sourceId: uri('source', r.local),
  effectiveFrom: POLICY_WINDOW.effectiveFrom,
  effectiveUntil: r.effectiveUntil ?? POLICY_WINDOW.effectiveUntil,
  displayName: r.displayName,
  sourceClass: r.sourceClass,
  licenseId: r.licenseId,
  policyVersion: r.policyVersion,
  permittedPurposes: r.permittedPurposes,
  prohibitedPurposes: r.prohibitedPurposes,
  allowedOperations: r.allowedOperations,
  approvalRequiredOperations: r.approvalRequiredOperations,
  allowedAudiences: r.allowedAudiences,
  retention: r.retention,
});

export const CARAVAN_REGISTRATIONS: Record<string, SourceRegistration> = {
  'northgate-lims': reg({ local: 'northgate-lims', displayName: 'Northgate Inspection Services LIMS', sourceClass: 'LABORATORY_CERTIFICATE', licenseId: 'northgate-certificate-licence-2026', policyVersion: '1.0.0', permittedPurposes: ['AGGREGATION', 'CARAVAN_CORPUS'], prohibitedPurposes: ['MODEL_TRAINING', 'PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], approvalRequiredOperations: ['PUBLISH'], allowedAudiences: ['CUSTOMER', 'INTERNAL', 'TENANT'], retention: { mode: 'UNTIL_SOURCE_EXPIRY' } }),
  'port-weighbridge': reg({ local: 'port-weighbridge', displayName: 'Port weighbridge operator', sourceClass: 'WEIGHT_RECORD', licenseId: 'port-weighbridge-data-licence-2026', policyVersion: '1.0.0', permittedPurposes: ['AGGREGATION', 'CARAVAN_CORPUS', 'INTERNAL_RESEARCH'], prohibitedPurposes: ['PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], approvalRequiredOperations: ['PUBLISH'], allowedAudiences: ['CUSTOMER', 'INTERNAL'], retention: { mode: 'INDEFINITE' } }),
  'terminal-weighbridge': reg({ local: 'terminal-weighbridge', displayName: 'Terminal weighbridge', sourceClass: 'WEIGHT_RECORD', licenseId: 'terminal-weighbridge-data-licence-2026', policyVersion: '1.0.0', permittedPurposes: ['AGGREGATION', 'CARAVAN_CORPUS', 'INTERNAL_RESEARCH'], prohibitedPurposes: ['PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], approvalRequiredOperations: ['PUBLISH'], allowedAudiences: ['CUSTOMER', 'INTERNAL'], retention: { mode: 'INDEFINITE' } }),
  'blue-anchor-docs': reg({ local: 'blue-anchor-docs', displayName: 'Blue Anchor Lines documents', sourceClass: 'CARRIER_DOCUMENT', licenseId: 'blue-anchor-named-party-access-2026', policyVersion: '1.0.0', permittedPurposes: ['CARAVAN_CORPUS'], prohibitedPurposes: ['AGGREGATION', 'MODEL_TRAINING', 'PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], allowedAudiences: ['CUSTOMER', 'INTERNAL'], retention: { mode: 'UNTIL_SOURCE_EXPIRY' } }),
  'port-custody-system': reg({ local: 'port-custody-system', displayName: 'Port custody operator system', sourceClass: 'CUSTODY_RECORD', licenseId: 'port-custody-access-2026', policyVersion: '1.0.0', permittedPurposes: ['AGGREGATION', 'CARAVAN_CORPUS'], prohibitedPurposes: ['PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], approvalRequiredOperations: ['PUBLISH'], allowedAudiences: ['CUSTOMER', 'INTERNAL'], retention: { mode: 'INDEFINITE' } }),
  'meridian-yard-log': reg({ local: 'meridian-yard-log', displayName: 'Meridian Origination yard log (claimant-supplied)', sourceClass: 'CLAIMANT_SUBMISSION', licenseId: 'claimant-submission-terms-2026', policyVersion: '1.0.0', permittedPurposes: ['CARAVAN_CORPUS'], prohibitedPurposes: ['AGGREGATION', 'INTERNAL_RESEARCH', 'MODEL_TRAINING', 'PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'EXPORT', 'INDEX', 'INGEST', 'RETRIEVE'], allowedAudiences: ['CUSTOMER', 'INTERNAL', 'TENANT'], retention: { mode: 'UNTIL', until: '2026-12-31T00:00:00Z' } }),
  'harbourline-deals': reg({ local: 'harbourline-deals', displayName: 'Harbourline Brokerage deal terms', sourceClass: 'SPONSOR_PRIVATE', licenseId: 'sponsor-private-material', policyVersion: '1.0.0', permittedPurposes: ['CARAVAN_CORPUS', 'INTERNAL_RESEARCH'], prohibitedPurposes: ['AGGREGATION', 'MODEL_TRAINING', 'PROPRIETARY_STRATEGY', 'TRADING'], allowedOperations: ['DERIVE', 'INDEX', 'INGEST', 'RETRIEVE'], allowedAudiences: ['INTERNAL', 'TENANT'], retention: { mode: 'UNTIL_SOURCE_EXPIRY' } }),
};

const rights = (sourceId: string, r: Omit<RightsSchedule, 'sourceId' | 'canonicalId' | 'registration' | 'permittedUses' | 'sourceName' | 'licence'>): RightsSchedule => {
  const registration = CARAVAN_REGISTRATIONS[sourceId];
  return {
    sourceId,
    canonicalId: registration.sourceId,
    sourceName: registration.displayName,
    licence: registration.licenseId,
    registration,
    permittedUses: derivePermittedUses(registration, RIGHTS_AT, sourceId),
    ...r,
  };
};

export const CARAVAN_SOURCES: RightsSchedule[] = [
  rights('northgate-lims', { materialClass: 'scientific', nonUse: ['No model training on certificate content', 'No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: true, producerId: 'P-PRODUCER-NORTHGATE' }),
  rights('port-weighbridge', { materialClass: 'operational', nonUse: ['No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: false, producerId: 'P-PRODUCER-WEIGHBRIDGE' }),
  rights('terminal-weighbridge', { materialClass: 'operational', nonUse: ['No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: false, producerId: 'P-PRODUCER-TERMINAL' }),
  rights('blue-anchor-docs', { materialClass: 'operational', nonUse: ['No aggregation across carriers', 'No model training', 'No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: true, producerId: 'P-PRODUCER-BLUEANCHOR' }),
  rights('port-custody-system', { materialClass: 'operational', nonUse: ['No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: false, producerId: 'P-PRODUCER-PCO' }),
  rights('meridian-yard-log', { materialClass: 'operational', nonUse: ['No aggregation', 'No model training', 'No internal research', 'No proprietary strategy', 'No trading'], redistribution: 'licensed', attributionRequired: true, producerId: 'P-CLAIMANT-MERIDIAN' }),
  rights('harbourline-deals', { materialClass: 'operational', nonUse: ['No customer delivery', 'No aggregation', 'No model training', 'No redistribution', 'No proprietary strategy', 'No trading'], redistribution: 'internal_only', attributionRequired: false, producerId: 'P-SPONSOR-HARBOURLINE' }),
];

const REL_1 = 'REL-CAR-2026.08.11';
const REL_2 = 'REL-CAR-2026.08.25';
const REL_3 = 'REL-CAR-2026.09.01';

const rec = (r: Omit<CorpusRecord, 'canonicalId' | 'subjectCanonicalId'> & { subjectCanonicalId?: string }): CorpusRecord => ({
  ...r,
  canonicalId: uri(r.predicate === 'identity.sample_of_lot' ? 'observation' : 'claim', `${r.subjectId}/${r.predicate}/${r.recordId}`),
  subjectCanonicalId: r.subjectCanonicalId ?? uri('entity', `${r.subjectType.toLowerCase()}/${r.subjectId.replace(/^(LOT|SAMPLE)-/, '')}`),
});

const REPORTED_MEASURED = { claimStrength: 'reported', productionClass: 'measured', interest: 'disinterested' } as const;

/** Provenance with the data-os capture binding of the artifact the record was extracted from. */
const prov = (sourceId: string, artifactId: string, producerId: string, transformId?: string) => {
  const c = captureFor(artifactId, sourceId);
  return { sourceId, artifactId, contentHash: digestOf(`artifact:${artifactId}`), contentDigest: c.evidence.contentDigest, storageKey: c.evidence.storageKey, receiptId: c.receipt.receiptId, producerId, ...(transformId ? { transformId } : {}) };
};

export const CARAVAN_RECORDS: CorpusRecord[] = [
  /* ── Lot 2E-118 (release 1) ── */
  rec({ recordId: 'REC-0101', firstReleaseId: REL_1, subjectId: 'SAMPLE-S-4377', subjectType: 'Sample', predicate: 'condition.moisture', title: 'Moisture, as received', value: 5.8, unit: '%', basis: 'As received', uncertainty: { low: 5.6, high: 6.0, semantics: 'Laboratory reported ±0.2 %' }, validFrom: '2026-08-03T10:00:00Z', knownAt: '2026-08-05T08:30:00Z', observedAt: '2026-08-03T10:00:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('northgate-lims', 'EV-CERT-NIS-4377', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0102', firstReleaseId: REL_1, subjectId: 'SAMPLE-S-4377', subjectType: 'Sample', predicate: 'identity.sample_of_lot', title: 'Sample drawn from lot', value: 'LOT-2E-118', validFrom: '2026-08-03T10:00:00Z', knownAt: '2026-08-05T08:30:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'disinterested' }, provenance: prov('northgate-lims', 'EV-CERT-NIS-4377', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED' }),

  /* ── Lot 3F-440 (release 1; withdrawn in release 3) ── */
  rec({ recordId: 'REC-0111', firstReleaseId: REL_1, subjectId: 'SAMPLE-S-4390', subjectType: 'Sample', predicate: 'condition.moisture', title: 'Moisture, as received', value: 5.8, unit: '%', basis: 'As received', uncertainty: { low: 5.6, high: 6.0, semantics: 'Laboratory reported ±0.2 %' }, validFrom: '2026-08-10T09:00:00Z', knownAt: '2026-08-12T08:30:00Z', observedAt: '2026-08-10T09:00:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('northgate-lims', 'EV-CERT-NIS-4390', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED', retractedByRetractionId: 'RET-0002' }),
  rec({ recordId: 'REC-0112', firstReleaseId: REL_1, subjectId: 'SAMPLE-S-4390', subjectType: 'Sample', predicate: 'identity.sample_of_lot', title: 'Sample drawn from lot', value: 'LOT-3F-440', validFrom: '2026-08-10T09:00:00Z', knownAt: '2026-08-12T08:30:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'disinterested' }, provenance: prov('northgate-lims', 'EV-CERT-NIS-4390', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED', retractedByRetractionId: 'RET-0002' }),

  /* ── Lot 5B-221 (release 2; corrected in release 2) ── */
  rec({ recordId: 'REC-0201', firstReleaseId: REL_2, subjectId: 'SAMPLE-S-4402', subjectType: 'Sample', predicate: 'condition.moisture', title: 'Moisture, as received', value: 5.1, unit: '%', basis: 'As received', uncertainty: { low: 4.9, high: 5.3, semantics: 'Laboratory reported ±0.2 %' }, validFrom: '2026-08-16T09:30:00Z', knownAt: '2026-08-18T09:30:00Z', observedAt: '2026-08-16T09:30:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('northgate-lims', 'EV-CERT-NIS-4402', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0202', firstReleaseId: REL_2, subjectId: 'SAMPLE-S-4402', subjectType: 'Sample', predicate: 'identity.sample_of_lot', title: 'Sample drawn from lot', value: 'LOT-5B-221', validFrom: '2026-08-16T09:30:00Z', knownAt: '2026-08-18T09:30:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'measured', interest: 'disinterested' }, provenance: prov('port-custody-system', 'EV-CUSTODY-PCO-5102', 'P-PRODUCER-PCO'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0203', firstReleaseId: REL_2, subjectId: 'LOT-5B-221', subjectType: 'Lot', predicate: 'quantity.gross', title: 'Gross quantity', value: 40.0, unit: 't', basis: 'Gross weight, draft survey (estimated)', uncertainty: { semantics: 'Estimate; no stated bound' }, validFrom: '2026-08-17T16:00:00Z', knownAt: '2026-08-18T09:30:00Z', observedAt: '2026-08-17T16:30:00Z', evidenceClass: { claimStrength: 'estimated', productionClass: 'computed', interest: 'unknown' }, provenance: prov('blue-anchor-docs', 'EV-DRAFT-BAL-DS-118', 'P-PRODUCER-BLUEANCHOR'), visibility: 'COUNTERPARTY_SHARED', supersededByRecordId: 'REC-0204' }),
  rec({ recordId: 'REC-0204', firstReleaseId: REL_2, subjectId: 'LOT-5B-221', subjectType: 'Lot', predicate: 'quantity.gross', title: 'Gross quantity', value: 40.12, unit: 't', basis: 'Gross weight, terminal weighbridge', uncertainty: { low: 40.08, high: 40.16, semantics: 'Weighbridge stated accuracy ±0.040 t' }, validFrom: '2026-08-17T15:20:00Z', knownAt: '2026-08-25T14:00:00Z', observedAt: '2026-08-17T15:20:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('terminal-weighbridge', 'EV-WEIGHT-WB-2277', 'P-PRODUCER-TERMINAL', uri('transform', 'quantity.gross.normalize/0.3.0')), visibility: 'COUNTERPARTY_SHARED', supersedesRecordId: 'REC-0203' }),
  rec({ recordId: 'REC-0205', firstReleaseId: REL_2, subjectId: 'LOT-5B-221', subjectType: 'Lot', predicate: 'quantity.gross.declared', title: 'Gross quantity, shipper declared', value: 40.0, unit: 't', basis: 'Shipper declaration on bill of lading', uncertainty: { semantics: 'Declaration; no stated bound' }, validFrom: '2026-08-17T16:00:00Z', knownAt: '2026-08-18T09:30:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'unknown' }, provenance: prov('blue-anchor-docs', 'EV-BOL-BAL-77790', 'P-PRODUCER-BLUEANCHOR'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0206', firstReleaseId: REL_2, subjectId: 'LOT-5B-221', subjectType: 'Lot', predicate: 'custody.loading_completed', title: 'Loading completed', value: '2026-08-17T16:00:00Z', basis: 'Port custody record', validFrom: '2026-08-17T16:00:00Z', knownAt: '2026-08-18T09:30:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'measured', interest: 'disinterested' }, provenance: prov('port-custody-system', 'EV-CUSTODY-PCO-5102', 'P-PRODUCER-PCO'), visibility: 'COUNTERPARTY_SHARED' }),

  /* ── Lot 7C-104 (release 2 and 3; no identity link in any release) ── */
  rec({ recordId: 'REC-0301', firstReleaseId: REL_2, subjectId: 'SAMPLE-S-4418', subjectType: 'Sample', predicate: 'condition.moisture', title: 'Moisture, as received', value: 6.4, unit: '%', basis: 'As received', uncertainty: { low: 6.2, high: 6.6, semantics: 'Laboratory reported ±0.2 %' }, validFrom: '2026-08-25T14:10:00Z', knownAt: '2026-08-26T10:30:00Z', observedAt: '2026-08-25T14:10:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('northgate-lims', 'EV-CERT-NIS-4418', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0302', firstReleaseId: REL_2, subjectId: 'LOT-7C-104', subjectType: 'Lot', predicate: 'quantity.gross', title: 'Gross quantity', value: 19.96, unit: 't', basis: 'Gross weight, port weighbridge', uncertainty: { low: 19.94, high: 19.98, semantics: 'Weighbridge stated accuracy ±0.020 t' }, validFrom: '2026-08-25T16:35:00Z', knownAt: '2026-08-26T10:30:00Z', observedAt: '2026-08-25T16:35:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('port-weighbridge', 'EV-WEIGHT-WB-2291', 'P-PRODUCER-WEIGHBRIDGE', uri('transform', 'quantity.gross.normalize/0.3.0')), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0303', firstReleaseId: REL_3, subjectId: 'LOT-7C-104', subjectType: 'Lot', predicate: 'quantity.gross.declared', title: 'Gross quantity, shipper declared', value: 20.0, unit: 't', basis: 'Shipper declaration on bill of lading', uncertainty: { semantics: 'Declaration; no stated bound' }, validFrom: '2026-08-28T14:00:00Z', knownAt: '2026-08-28T16:00:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'unknown' }, provenance: prov('blue-anchor-docs', 'EV-BOL-BAL-77812', 'P-PRODUCER-BLUEANCHOR'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0304', firstReleaseId: REL_3, subjectId: 'LOT-7C-104', subjectType: 'Lot', predicate: 'custody.loading_completed', title: 'Loading completed', value: '2026-08-28T14:00:00Z', basis: 'Claimant custody log', validFrom: '2026-08-28T14:00:00Z', knownAt: '2026-08-29T08:50:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'self_reported' }, provenance: prov('meridian-yard-log', 'EV-CUSTODY-MER-0931', 'P-CLAIMANT-MERIDIAN'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0305', firstReleaseId: REL_2, subjectId: 'LOT-7C-104', subjectType: 'Lot', predicate: 'contract.moisture_max', title: 'Contract moisture maximum', value: 8.0, unit: '%', basis: 'Sale contract HB-3310', validFrom: '2026-08-24T12:00:00Z', knownAt: '2026-08-26T10:30:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'negotiating_position' }, provenance: prov('harbourline-deals', 'EV-CONTRACT-HB-3310', 'P-SPONSOR-HARBOURLINE'), visibility: 'PRIVATE_PREFLIGHT' }),

  /* ── Lots 8D-902 and 6C-305 (release 3) ── */
  rec({ recordId: 'REC-0401', firstReleaseId: REL_3, subjectId: 'SAMPLE-S-4436', subjectType: 'Sample', predicate: 'condition.moisture', title: 'Moisture, as received', value: 5.8, unit: '%', basis: 'As received', uncertainty: { low: 5.6, high: 6.0, semantics: 'Laboratory reported ±0.2 %' }, validFrom: '2026-08-31T09:00:00Z', knownAt: '2026-09-01T09:40:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('northgate-lims', 'EV-CERT-NIS-4436', 'P-PRODUCER-NORTHGATE'), visibility: 'PRIVATE_PREFLIGHT' }),
  rec({ recordId: 'REC-0402', firstReleaseId: REL_3, subjectId: 'SAMPLE-S-4436', subjectType: 'Sample', predicate: 'identity.sample_of_lot', title: 'Sample drawn from lot', value: 'LOT-8D-902', validFrom: '2026-08-31T09:00:00Z', knownAt: '2026-09-01T09:40:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'disinterested' }, provenance: prov('northgate-lims', 'EV-CERT-NIS-4436', 'P-PRODUCER-NORTHGATE'), visibility: 'PRIVATE_PREFLIGHT' }),
  rec({ recordId: 'REC-0411', firstReleaseId: REL_3, subjectId: 'SAMPLE-S-4434', subjectType: 'Sample', predicate: 'condition.moisture', title: 'Moisture, as received', value: 5.8, unit: '%', basis: 'As received', uncertainty: { low: 5.6, high: 6.0, semantics: 'Laboratory reported ±0.2 %' }, validFrom: '2026-08-30T11:00:00Z', knownAt: '2026-09-01T10:20:00Z', evidenceClass: REPORTED_MEASURED, provenance: prov('northgate-lims', 'EV-CERT-NIS-4434', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED' }),
  rec({ recordId: 'REC-0412', firstReleaseId: REL_3, subjectId: 'SAMPLE-S-4434', subjectType: 'Sample', predicate: 'identity.sample_of_lot', title: 'Sample drawn from lot', value: 'LOT-6C-305', validFrom: '2026-08-30T11:00:00Z', knownAt: '2026-09-01T10:20:00Z', evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest: 'disinterested' }, provenance: prov('northgate-lims', 'EV-CERT-NIS-4434', 'P-PRODUCER-NORTHGATE'), visibility: 'COUNTERPARTY_SHARED' }),
];

export const CARAVAN_RETRACTIONS: Retraction[] = [
  {
    retractionId: 'RET-0001',
    kind: 'CORRECTION',
    issuedAt: '2026-08-25T14:00:00Z',
    releaseId: REL_2,
    affectedRecordIds: ['REC-0203'],
    replacementRecordIds: ['REC-0204'],
    reason: 'Gross quantity of lot 5B-221 was carried from a carrier draft survey (estimated). A terminal weighbridge ticket (WB-2277, measured, ±0.040 t) for the same weighing event became knowable and supersedes it: 40.120 t replaces 40.000 t.',
    sourceId: 'terminal-weighbridge',
    affectedRulingIds: ['RUL-5B221-r1'],
    visibility: 'COUNTERPARTY_SHARED',
  },
  {
    retractionId: 'RET-0002',
    kind: 'WITHDRAWAL',
    issuedAt: '2026-08-30T15:00:00Z',
    releaseId: REL_3,
    affectedRecordIds: ['REC-0111', 'REC-0112'],
    reason: 'Northgate Inspection Services withdrew certificate NIS-4390 (withdrawal notice NIS-W-0071) citing a sample chain-of-custody defect at the laboratory. The moisture record and the sample-to-lot link it supported are withdrawn. This is not a finding about the cargo.',
    sourceId: 'northgate-lims',
    affectedRulingIds: ['RUL-3F440-r1'],
    visibility: 'COUNTERPARTY_SHARED',
  },
];

const release = (r: Omit<CorpusRelease, 'fixture_only' | 'corpusId' | 'corpusTitle' | 'domain' | 'sources' | 'releaseDigest'>): CorpusRelease => ({
  fixture_only: true,
  corpusId: CORPUS_ID,
  corpusTitle: 'Caravan — specialty cargo (demonstration corpus)',
  domain: 'CARAVAN',
  sources: CARAVAN_SOURCES,
  releaseDigest: digestOf(`release:${r.releaseId}`),
  ...r,
});

const BUILT_AT_2026_08_11 = '2026-08-12T12:05:00Z';
const INPUTS_2026_08_11 = [{ label: 'northgate-lims export 2026-08-12', sha256: digestOf('artifact:EV-CERT-NIS-4390') }, { label: 'northgate-lims export 2026-08-05', sha256: digestOf('artifact:EV-CERT-NIS-4377') }];
const BUILT_AT_2026_08_25 = '2026-08-26T09:35:00Z';
const INPUTS_2026_08_25 = [{ label: 'terminal-weighbridge tickets to 2026-08-25', sha256: digestOf('artifact:EV-WEIGHT-WB-2277') }, { label: 'port-weighbridge tickets to 2026-08-26', sha256: digestOf('artifact:EV-WEIGHT-WB-2291') }, { label: 'northgate-lims export 2026-08-26', sha256: digestOf('artifact:EV-CERT-NIS-4418') }, { label: 'port-custody-system to 2026-08-18', sha256: digestOf('artifact:EV-CUSTODY-PCO-5102') }];
const BUILT_AT_2026_09_01 = '2026-09-01T12:05:00Z';
const INPUTS_2026_09_01 = [{ label: 'blue-anchor-docs to 2026-08-28', sha256: digestOf('artifact:EV-BOL-BAL-77812') }, { label: 'meridian-yard-log to 2026-08-29', sha256: digestOf('artifact:EV-CUSTODY-MER-0931') }, { label: 'northgate-lims export 2026-09-01', sha256: digestOf('artifact:EV-CERT-NIS-4434') }];

/** The twelve stages of the shared production system, as they ran for one build. Honest about what did not run. */
function stagesFor(at: string, opts: { releasedAt: string; verification: string; correction?: string; recall?: string }): StageRecord[] {
  return [
    { stage: 'acquisition', status: 'COMPLETED', note: 'Artifacts read from the authorized sources named in the rights schedule (operational and scientific material only in this corpus); each content-addressed on ingest.', at },
    { stage: 'extraction', status: 'COMPLETED', note: 'Bounded fields extracted from each artifact: declared identifiers, values, units, bases, sampling and weighing times. Raw bytes stay in the evidence store.', at },
    { stage: 'normalization', status: 'COMPLETED', note: 'Units and bases normalized; transform quantity.gross.normalize 0.3.0 recorded as lineage where applied.', at },
    { stage: 'identity', status: 'COMPLETED', note: 'Samples and lots kept distinct; a sample reaches a lot only through an identity-link record supplied by evidence. Similarity never merges.', at },
    { stage: 'ontology', status: 'COMPLETED', note: 'Predicates aligned to the demonstration vocabulary (quantity.gross, condition.moisture, custody.*, identity.sample_of_lot).', at },
    { stage: 'computation', status: 'NOT_APPLICABLE', note: 'No derived quantities in this corpus beyond unit normalization.' },
    { stage: 'storage', status: 'NOT_RUN', note: 'No production storage: this repository holds committed fixtures. A live build writes canonical state to the release store here.' },
    { stage: 'indexing', status: 'COMPLETED', note: 'Subject, predicate and time index built for as-of queries.', at },
    { stage: 'verification', status: 'COMPLETED', note: opts.verification, at },
    { stage: 'release', status: 'COMPLETED', note: 'Release manifest produced and committed; commitment recorded in the certification.', at: opts.releasedAt },
    { stage: 'correction', status: opts.correction ? 'COMPLETED' : 'NOT_APPLICABLE', note: opts.correction ?? 'No correction issued against this release.', ...(opts.correction ? { at } : {}) },
    { stage: 'recall', status: opts.recall ? 'COMPLETED' : 'NOT_APPLICABLE', note: opts.recall ?? 'No recall issued against this release.', ...(opts.recall ? { at } : {}) },
  ];
}

export const CARAVAN_RELEASES: CorpusRelease[] = [
  release({
    releaseId: REL_1,
    knownAt: '2026-08-12T12:00:00Z',
    build: { buildId: 'build-caravan-sc-2026.08.11', builtAt: BUILT_AT_2026_08_11, methodology: { methodologyId: 'payload-methodology', version: '0.1.0', status: 'research' }, inputDigests: INPUTS_2026_08_11, deterministic: true, stages: stagesFor(BUILT_AT_2026_08_11, { releasedAt: '2026-08-12T12:10:00Z', verification: 'Every record recomputed from its artifact and compared; no divergence. Internal recompute only.' }) },
    certification: { status: 'CERTIFIED', certifiedAt: '2026-08-12T12:10:00Z', basis: 'Release digest recomputed by this system over the canonical record set and the manifest committed. Demonstration corpus: not audited, not independently verified.', verification: 'internal_recompute', manifestCommitment: digestOf('releaseManifest:REL-CAR-2026.08.11') },
    supersededByReleaseId: REL_2,
    status: 'SUPERSEDED',
    coverage: 'Lots 2E-118 and 3F-440. Certificates only; no weight or custody records yet.',
    note: 'Superseded. Carried certificate NIS-4390, later withdrawn; this release still shows it as it stood.',
  }),
  release({
    releaseId: REL_2,
    knownAt: '2026-08-26T09:30:00Z',
    build: { buildId: 'build-caravan-sc-2026.08.25', builtAt: BUILT_AT_2026_08_25, methodology: { methodologyId: 'payload-methodology', version: '0.1.0', status: 'research' }, inputDigests: INPUTS_2026_08_25, deterministic: true, stages: stagesFor(BUILT_AT_2026_08_25, { releasedAt: '2026-08-26T09:40:00Z', verification: 'Every record recomputed from its artifact and compared; the draft-survey quantity was found superseded by a measured ticket. Internal recompute only.', correction: 'RET-0001 issued: the lot 5B-221 gross quantity corrected from an estimated draft survey to a measured terminal ticket; the earlier release left as it stood.' }) },
    certification: { status: 'CERTIFIED', certifiedAt: '2026-08-26T09:40:00Z', basis: 'Release digest recomputed by this system over the canonical record set and the manifest committed. Demonstration corpus: not audited, not independently verified.', verification: 'internal_recompute', manifestCommitment: digestOf('releaseManifest:REL-CAR-2026.08.25') },
    supersedesReleaseId: REL_1,
    supersededByReleaseId: REL_3,
    status: 'SUPERSEDED',
    coverage: 'Lots 2E-118, 3F-440, 5B-221, 7C-104. Includes the RET-0001 correction of the 5B-221 draft-survey quantity.',
    note: 'Superseded by the 2026-09-01 release.',
  }),
  release({
    releaseId: REL_3,
    knownAt: '2026-09-01T12:00:00Z',
    build: { buildId: 'build-caravan-sc-2026.09.01', builtAt: BUILT_AT_2026_09_01, methodology: { methodologyId: 'payload-methodology', version: '0.1.0', status: 'research' }, inputDigests: INPUTS_2026_09_01, deterministic: true, stages: stagesFor(BUILT_AT_2026_09_01, { releasedAt: '2026-09-01T12:10:00Z', verification: 'Every record recomputed from its artifact and compared; certificate NIS-4390 found withdrawn by its producer. Internal recompute only.', recall: 'RET-0002 issued: certificate NIS-4390 and the sample-to-lot link it supported recalled; the ruling that relied on them (RUL-3F440-r1) named; earlier releases left as they stood.' }) },
    certification: { status: 'CERTIFIED', certifiedAt: '2026-09-01T12:10:00Z', basis: 'Release digest recomputed by this system over the canonical record set and the manifest committed. Demonstration corpus: not audited, not independently verified.', verification: 'internal_recompute', manifestCommitment: digestOf('releaseManifest:REL-CAR-2026.09.01') },
    supersedesReleaseId: REL_2,
    status: 'CURRENT',
    coverage: 'All seven demonstration lots. Includes the RET-0002 withdrawal of certificate NIS-4390.',
    note: 'Current release. Fixture clock 2026-09-01 12:00 UTC.',
  }),
];

export const CARAVAN_CORPUS: Corpus = {
  fixture_only: true,
  corpusId: CORPUS_ID,
  title: 'Caravan — specialty cargo (demonstration corpus)',
  domain: 'CARAVAN',
  description: 'Point-in-time facts about specialty-cargo lots and the samples drawn from them: quantity, condition, custody and identity links, each with uncertainty bounds, validity bounds, both clocks, provenance, evidence class and rights. Synthetic and deterministic.',
  releases: CARAVAN_RELEASES,
  records: CARAVAN_RECORDS,
  retractions: CARAVAN_RETRACTIONS,
  governance: {
    tenantIsolation: 'Customer evidence and customer contributions are tenant-isolated. A claimant-supplied artifact is delivered only to the parties named on its case.',
    informationBarrier: 'No source or customer contribution may be drawn on for proprietary strategy or trading. Neither use appears in any rights schedule in this corpus, so both are prohibited by construction.',
    releaseTiming: 'Nothing derived from a release may be acted on in a principal capacity before that release is delivered to the customers entitled to it. Recorded as policy; not enforced by this repository.',
    nonUse: ['No model training on any source that does not list model_training.', 'No aggregation across sources that do not list aggregation.', 'No redistribution beyond what each licence permits.'],
    enforcement: 'This repository enforces customer_delivery at the feed (rights guard before visibility) and records the rest as policy.',
  },
};
