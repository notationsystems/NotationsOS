/**
 * Algorithmic Dispatch Liability & Streamed Notary Archive Fixtures — fixture_only: true.
 *
 * Demonstrates the notary wedge for 3PLs, automated freight brokerages, and commercial casualty underwriters.
 * Implements an immutable cryptographic event stream with rolling attestation windows.
 * Directly answers the product-liability question in discovery: "What did the automated dispatch system know at Tk?"
 */
import type { AlgorithmicDispatchDecision, BitemporalDefenseReconstruction } from '@/domain/dispatchLiability';
import { computeDispatchEventDigest } from '@/domain/dispatchLiability';
import { digestOf } from '../digestLookup';

const MANIFEST_COMMITMENT = digestOf('release:caravan.specialty-cargo:2026.09.01');
const GENESIS_PREV_DIGEST = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

const rawEvent0 = {
  decisionId: 'DISP-EVT-2026-0801',
  sequenceIndex: 0,
  previousEventDigest: GENESIS_PREV_DIGEST,
  decisionTimestamp: '2026-08-28T09:12:00Z',
  knowledgeCutoff: '2026-08-28T09:12:00Z',
  broker: {
    brokerId: 'BRK-7710',
    name: 'APEX LOGISTICS FREIGHT SERVICES INC',
    algorithmPolicyId: 'POLICY-NEGLIGENT-SELECTION-DEFENSE-v2',
    algorithmVersion: 'dispatch-engine-v4.1.0',
  },
  load: {
    loadId: 'LOD-99201',
    origin: 'Seattle, WA',
    destination: 'Boise, ID',
    requiredEquipment: '53_DRY_VAN',
    commodity: 'General Department Store Freight',
    hazmat: false,
    declaredValueCents: 12000000, // $120,000.00
  },
  carrierSafetySnapshot: {
    usdot: '992011',
    mc: 'MC-331092',
    legalName: 'PACIFIC NORTHWEST FREIGHTWAYS INC',
    operatingAuthorityStatus: 'ACTIVE_COMMON' as const,
    safetyRating: 'SATISFACTORY' as const,
    vehicleOosRate: 14.2,
    nationalVehicleOosAvg: 21.4,
    driverOosRate: 3.1,
    nationalDriverOosAvg: 5.8,
    crashHistory24Mo: { fatal: 0, injury: 1, towaway: 2 },
    insuranceFilingStatus: {
      bipdRequiredCents: 75000000,
      bipdOnFileCents: 100000000, // $1,000,000.00
      cargoOnFileCents: 25000000,
      insurer: 'Great American Insurance Co',
      policyEffectiveDate: '2026-01-01T00:00:00Z',
    },
    chameleonCarrierIndicators: {
      addressMatchesRevokedEntity: false,
      recentReincorporationDays: null,
      flagged: false,
    },
  },
  qualificationVerdict: {
    selectionAllowed: true,
    doctrineCompliance: 'DEFENSIBLE_SELECTION' as const,
    safeHarborCriteriaMet: [
      'Active Operating Authority on MCMIS at Tk',
      'Satisfactory Safety Rating',
      'Vehicle & Driver OOS rates below national median',
      'BMC-91X primary liability filing verified ($1.0M on file)',
      'Zero fatal collisions in trailing 24 months',
    ],
    riskScorePercentile: 18,
    legalSummary: 'Selection adheres fully to prudent 3PL standard of care. Bitemporal proof locked in attestation stream.',
  },
  rollingAttestation: {
    windowBlockId: 'WIN-2026-W35-B01',
    windowStart: '2026-08-28T09:00:00Z',
    windowEnd: '2026-08-28T10:00:00Z',
    merkleBlockRoot: 'sha256:aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    manifestCommitment: MANIFEST_COMMITMENT,
  },
};

const digest0 = computeDispatchEventDigest(rawEvent0);
export const EVENT_0: AlgorithmicDispatchDecision = {
  ...rawEvent0,
  eventDigest: digest0,
};

// Event 1 (Hazmat specialized carrier selection)
const rawEvent1 = {
  decisionId: 'DISP-EVT-2026-0802',
  sequenceIndex: 1,
  previousEventDigest: digest0,
  decisionTimestamp: '2026-08-28T11:45:00Z',
  knowledgeCutoff: '2026-08-28T11:45:00Z',
  broker: {
    brokerId: 'BRK-7710',
    name: 'APEX LOGISTICS FREIGHT SERVICES INC',
    algorithmPolicyId: 'POLICY-NEGLIGENT-SELECTION-DEFENSE-v2',
    algorithmVersion: 'dispatch-engine-v4.1.0',
  },
  load: {
    loadId: 'LOD-99202',
    origin: 'Portland, OR',
    destination: 'Sacramento, CA',
    requiredEquipment: 'INSULATED_TANKER',
    commodity: 'Class 3 Flammable Liquid (Industrial Solvent)',
    hazmat: true,
    declaredValueCents: 28000000, // $280,000.00
  },
  carrierSafetySnapshot: {
    usdot: '401928',
    mc: 'MC-219084',
    legalName: 'CASCADE LIQUID CARRIERS CORP',
    operatingAuthorityStatus: 'ACTIVE_COMMON' as const,
    safetyRating: 'SATISFACTORY' as const,
    vehicleOosRate: 8.4,
    nationalVehicleOosAvg: 21.4,
    driverOosRate: 1.2,
    nationalDriverOosAvg: 5.8,
    crashHistory24Mo: { fatal: 0, injury: 0, towaway: 1 },
    insuranceFilingStatus: {
      bipdRequiredCents: 500000000, // $5M Hazmat required
      bipdOnFileCents: 500000000,
      cargoOnFileCents: 50000000,
      insurer: 'Travelers Casualty and Surety Co',
      policyEffectiveDate: '2025-11-01T00:00:00Z',
    },
    chameleonCarrierIndicators: {
      addressMatchesRevokedEntity: false,
      recentReincorporationDays: null,
      flagged: false,
    },
  },
  qualificationVerdict: {
    selectionAllowed: true,
    doctrineCompliance: 'DEFENSIBLE_SELECTION' as const,
    safeHarborCriteriaMet: [
      'Active Hazmat Safety Permit (HMSP) on MCMIS at Tk',
      'Mandatory $5,000,000.00 BMC-91X filing confirmed',
      'Vehicle OOS rate 8.4% (significantly superior to 21.4% national avg)',
      'Hazmat driver endorsement registry cross-verified',
    ],
    riskScorePercentile: 9,
    legalSummary: 'Specialized Hazmat safe harbor statutory threshold verified at Tk. Zero negligence exposure.',
  },
  rollingAttestation: {
    windowBlockId: 'WIN-2026-W35-B02',
    windowStart: '2026-08-28T11:00:00Z',
    windowEnd: '2026-08-28T12:00:00Z',
    merkleBlockRoot: 'sha256:bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66ee77',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    manifestCommitment: MANIFEST_COMMITMENT,
  },
};

const digest1 = computeDispatchEventDigest(rawEvent1);
export const EVENT_1: AlgorithmicDispatchDecision = {
  ...rawEvent1,
  eventDigest: digest1,
};

// Event 2 (The Miller v. C.H. Robinson Evidentiary Defense Anchor Case)
const rawEvent2 = {
  decisionId: 'DISP-EVT-2026-0803',
  sequenceIndex: 2,
  previousEventDigest: digest1,
  decisionTimestamp: '2026-08-28T14:15:00Z',
  knowledgeCutoff: '2026-08-28T14:15:00Z',
  broker: {
    brokerId: 'BRK-7710',
    name: 'APEX LOGISTICS FREIGHT SERVICES INC',
    algorithmPolicyId: 'POLICY-NEGLIGENT-SELECTION-DEFENSE-v2',
    algorithmVersion: 'dispatch-engine-v4.1.0',
  },
  load: {
    loadId: 'LOD-99203',
    origin: 'Spokane, WA',
    destination: 'Missoula, MT',
    requiredEquipment: '53_REDUCED_TEMP_REEFER',
    commodity: 'Specialty Pharmaceuticals (Lot 5B-221)',
    hazmat: false,
    declaredValueCents: 42500000, // $425,000.00
  },
  carrierSafetySnapshot: {
    usdot: '80806',
    mc: 'MC-149021',
    legalName: 'NORTHERN CONTINENTAL TRANSPORT LLC',
    operatingAuthorityStatus: 'ACTIVE_COMMON' as const,
    safetyRating: 'SATISFACTORY' as const,
    vehicleOosRate: 11.2,
    nationalVehicleOosAvg: 21.4,
    driverOosRate: 2.8,
    nationalDriverOosAvg: 5.8,
    crashHistory24Mo: { fatal: 0, injury: 1, towaway: 1 },
    insuranceFilingStatus: {
      bipdRequiredCents: 75000000,
      bipdOnFileCents: 100000000,
      cargoOnFileCents: 50000000,
      insurer: 'National Interstate Insurance Co',
      policyEffectiveDate: '2026-03-15T00:00:00Z',
    },
    chameleonCarrierIndicators: {
      addressMatchesRevokedEntity: false,
      recentReincorporationDays: null,
      flagged: false,
    },
  },
  qualificationVerdict: {
    selectionAllowed: true,
    doctrineCompliance: 'DEFENSIBLE_SELECTION' as const,
    safeHarborCriteriaMet: [
      'Active Operating Authority on MCMIS at Tk (2026-08-28T14:15:00Z)',
      'FMCSA Satisfactory Safety Rating',
      'Vehicle OOS 11.2% (well below 21.4% national threshold)',
      'Driver OOS 2.8% (well below 5.8% national threshold)',
      'Active $1,000,000 BIPD and $500,000 Cargo insurance filing',
      'Zero fatal accidents on record in prior 24 months',
    ],
    riskScorePercentile: 14,
    legalSummary:
      'PRUDENT SELECTION ESTABLISHED. Automated dispatch adhered strictly to statutory broker diligence at Tk. Carrier was fully authorized, insured, and possessed superior safety records at decision cutoff.',
  },
  rollingAttestation: {
    windowBlockId: 'WIN-2026-W35-B03',
    windowStart: '2026-08-28T14:00:00Z',
    windowEnd: '2026-08-28T15:00:00Z',
    merkleBlockRoot: 'sha256:cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66ee77ff88',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    manifestCommitment: MANIFEST_COMMITMENT,
  },
};

const digest2 = computeDispatchEventDigest(rawEvent2);
export const EVENT_2: AlgorithmicDispatchDecision = {
  ...rawEvent2,
  eventDigest: digest2,
};

// Event 3 (Rejection: Defective Carrier Refused to protect against liability)
const rawEvent3 = {
  decisionId: 'DISP-EVT-2026-0804',
  sequenceIndex: 3,
  previousEventDigest: digest2,
  decisionTimestamp: '2026-08-28T16:20:00Z',
  knowledgeCutoff: '2026-08-28T16:20:00Z',
  broker: {
    brokerId: 'BRK-7710',
    name: 'APEX LOGISTICS FREIGHT SERVICES INC',
    algorithmPolicyId: 'POLICY-NEGLIGENT-SELECTION-DEFENSE-v2',
    algorithmVersion: 'dispatch-engine-v4.1.0',
  },
  load: {
    loadId: 'LOD-99204',
    origin: 'Tacoma, WA',
    destination: 'Salt Lake City, UT',
    requiredEquipment: '53_DRY_VAN',
    commodity: 'Commercial Electronics',
    hazmat: false,
    declaredValueCents: 19500000,
  },
  carrierSafetySnapshot: {
    usdot: '2819001',
    mc: 'MC-810291',
    legalName: 'REDLINE FREIGHT LOGISTICS LLC',
    operatingAuthorityStatus: 'ACTIVE_COMMON' as const,
    safetyRating: 'CONDITIONAL' as const,
    vehicleOosRate: 34.8, // Alarmingly high: 34.8% vs 21.4%
    nationalVehicleOosAvg: 21.4,
    driverOosRate: 9.2, // Alarmingly high: 9.2% vs 5.8%
    nationalDriverOosAvg: 5.8,
    crashHistory24Mo: { fatal: 1, injury: 3, towaway: 5 },
    insuranceFilingStatus: {
      bipdRequiredCents: 75000000,
      bipdOnFileCents: 100000000,
      cargoOnFileCents: 10000000, // Deficient cargo coverage ($100k on $195k load)
      insurer: 'ProAlliance Casualty Ltd',
      policyEffectiveDate: '2026-04-10T00:00:00Z',
    },
    chameleonCarrierIndicators: {
      addressMatchesRevokedEntity: true, // Chameleon carrier alert!
      recentReincorporationDays: 42,
      flagged: true,
    },
  },
  qualificationVerdict: {
    selectionAllowed: false,
    doctrineCompliance: 'HIGH_EXPOSURE_REJECTED' as const,
    safeHarborCriteriaMet: [],
    riskScorePercentile: 96,
    legalSummary:
      'AUTOMATED SELECTION BLOCKED: High risk of broker negligence liability. Carrier possesses CONDITIONAL safety rating, excessive OOS metrics (Vehicle 34.8%, Driver 9.2%), deficient cargo insurance, and matched chameleon carrier address indicator.',
  },
  rollingAttestation: {
    windowBlockId: 'WIN-2026-W35-B04',
    windowStart: '2026-08-28T16:00:00Z',
    windowEnd: '2026-08-28T17:00:00Z',
    merkleBlockRoot: 'sha256:dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66ee77ff88aa99',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    manifestCommitment: MANIFEST_COMMITMENT,
  },
};

const digest3 = computeDispatchEventDigest(rawEvent3);
export const EVENT_3: AlgorithmicDispatchDecision = {
  ...rawEvent3,
  eventDigest: digest3,
};

export const FIXTURE_DISPATCH_STREAM: readonly AlgorithmicDispatchDecision[] = [
  EVENT_0,
  EVENT_1,
  EVENT_2,
  EVENT_3,
];

/**
 * Concrete bitemporal defense reconstruction for DISP-EVT-2026-0803.
 * Demonstrates the exact discovery defense when a catastrophic accident occurs post-dispatch.
 */
export const DEFENSE_RECONSTRUCTION_CASE_0803: BitemporalDefenseReconstruction = {
  decisionId: 'DISP-EVT-2026-0803',
  carrierUsdot: '80806',
  carrierName: 'NORTHERN CONTINENTAL TRANSPORT LLC',
  decisionTimestamp: '2026-08-28T14:15:00Z',
  knowledgeTimeTk: '2026-08-28T14:15:00Z',
  subpoenaTimeTsub: '2026-09-15T09:00:00Z', // Litigation filed after accident
  stateAtTk: {
    authority: 'ACTIVE_COMMON',
    safetyRating: 'SATISFACTORY',
    vehicleOosRate: 11.2,
    fatalCrashes: 0,
    defensible: true,
  },
  stateAtTsub: {
    authority: 'ACTIVE_COMMON',
    safetyRating: 'CONDITIONAL', // Downgraded 14 days later following crash
    vehicleOosRate: 24.1,
    subsequentAccidentCount: 1, // The litigation crash
  },
  evidentiaryFinding:
    'CONFIRMED DEFENSE: The adverse safety downgrade to CONDITIONAL occurred on 2026-09-11, 14 days AFTER the dispatch decision was executed. At knowledge cutoff Tk (2026-08-28T14:15:00Z), the broker possessed verified MCMIS records demonstrating full statutory compliance, 0 fatal crashes, a SATISFACTORY rating, and an OOS rate 48% superior to national average. Pre-existence is cryptographically established by block WIN-2026-W35-B03 manifest commitment.',
};
