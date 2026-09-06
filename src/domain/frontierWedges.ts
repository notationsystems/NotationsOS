import type { Hash, ISODateTime } from './types';

/**
 * Frontier Wedges: Anchor Products 1–3
 *
 * Grounded in the invariant:
 * "Sell the substrate, leave liability, capital, and network positions to others.
 *  The evidence, not the liability; the scheduling, not the sensors;
 *  the index, not the trigger; the compute, not the platform; the corpus, not the coalition."
 */

// ---------------------------------------------------------------------------
// 1. The Disclosure-Assurance Economy (CBAM, CSRD, UFLPA, EUDR)
// Sells: Evidence packs & facility emissions substrate for Big 4 auditors.
// Must not become: The registry of record (standards-body-shaped trap).
// ---------------------------------------------------------------------------

export type DisclosureFramework = 'CBAM' | 'CSRD' | 'UFLPA' | 'EUDR';

export type IndustrialSector =
  | 'STEEL'
  | 'ALUMINUM'
  | 'CEMENT'
  | 'FERTILIZERS'
  | 'HYDROGEN'
  | 'CRITICAL_MINERALS';

export interface EmbeddedEmissionsMetrics {
  directTonsCo2e: number;
  indirectTonsCo2e: number;
  productionVolumeTons: number;
  specificIntensityPerTonProduct: number;
  uncertaintyMarginRatio: number; // e.g. 0.045 for +/- 4.5%
}

export interface DisclosureAssurancePack {
  packId: string;
  framework: DisclosureFramework;
  facilityId: string;
  facilityName: string;
  countryCode: string;
  sector: IndustrialSector;
  reportingPeriod: {
    periodStart: ISODateTime;
    periodEnd: ISODateTime;
  };
  metrics: EmbeddedEmissionsMetrics;
  evidenceSubstrate: {
    primaryMeterLogDigest: Hash;
    rawIntakeDigest: Hash;
    gridEmissionFactorSourceId: string;
    verifiedRunDigest: Hash;
    evidenceClass: 'DIRECT_CONTINUOUS_MEASUREMENT' | 'CALCULATED_RUN_ACTIVITY' | 'TIER_1_SUPPLIER_ATTESTATION';
  };
  systemBoundary: {
    scope: 'CRADLE_TO_GATE';
    includedGases: readonly ('CO2' | 'N2O' | 'PFC')[];
    declaredExclusions: readonly string[];
  };
  auditReadiness: {
    targetAuditorTier: 'BIG_4_INDEPENDENT_ASSURANCE';
    substrateStatus: 'ASSURANCE_READY_SUBSTRATE';
    assuranceStandard: 'ISAE_3000' | 'ISSA_5000' | 'EU_CBAM_IMPL_REG';
    disclaimer: 'Evidence substrate only; third-party assurance opinion must be rendered by accredited verifier.';
  };
  validAt: ISODateTime;
  knownAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// 2. Insurability Dynamics
// Sells: Insurability-change feed from state filings + event archive + Landshark.
// Must not become: Carrier / actuarial underwriting shop.
// ---------------------------------------------------------------------------

export type StateDoiActionType =
  | 'MARKET_WITHDRAWAL_FILING'
  | 'NON_RENEWAL_EXPANSION'
  | 'MORATORIUM_DECLARED'
  | 'WILDFIRE_CONVECTIVE_EXCLUSION'
  | 'DEDUCTIBLE_SPIKE_FILING';

export type HazardPeril =
  | 'WILDFIRE'
  | 'SEVERE_CONVECTIVE_STORM'
  | 'COASTAL_FLOOD'
  | 'HURRICANE_WIND'
  | 'EARTHQUAKE';

export interface InsurabilityChangeFeedEvent {
  eventId: string;
  sequenceIndex: number;
  carrierNaic: string;
  carrierName: string;
  stateDoiCode: string; // e.g. "CA-CDI", "FL-OIR", "TX-TDI"
  actionType: StateDoiActionType;
  filingDate: ISODateTime;
  effectiveDate: ISODateTime;
  geography: {
    fipsCode: string;
    countyName: string;
    stateCode: string;
    primaryHazardPeril: HazardPeril;
    parcelCountInCorridor: number;
  };
  impactAssessment: {
    estimatedParcelsExposed: number;
    coverageGapDeltaBps: number; // basis points of portfolio exposure
    collateralRepricingRisk: 'ELEVATED' | 'SEVERE' | 'CRITICAL';
    leadTimeDaysToCollateralRepricing: number;
  };
  filingArtifactDigest: Hash;
  validAt: ISODateTime;
  knownAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// 3. Capex Progress Verification
// Sells: Verified physical progress states for lenders/agents via N11 VOI.
// Must not become: Certifying engineer of record (stamp/liability trap).
// ---------------------------------------------------------------------------

export type MegaprojectClass =
  | 'HYPERSCALE_DATA_CENTER'
  | 'SEMICONDUCTOR_FAB'
  | 'GRID_INTERCONNECTION_SUBSTATION'
  | 'BATTERY_GIGAFACTORY'
  | 'CLEAN_HYDROGEN_FACILITY';

export interface N11MeasurementDecision {
  decisionLossAtRiskCents: number; // Potential loss if draw is fraudulent or delayed
  selectedInstrument:
    | 'SATELLITE_SAR_AND_OPTICAL'
    | 'DRONE_PHOTOGRAMMETRY'
    | 'TERRESTRIAL_LIDAR_SCAN'
    | 'UTILITY_TELEMETRY_INTERCONNECT';
  instrumentCostCents: number;
  expectedValueOfInformationCents: number;
  netMeasurementSurplusCents: number; // VOI - Cost
}

export interface CapexProgressVerification {
  verificationId: string;
  projectId: string;
  projectName: string;
  projectType: MegaprojectClass;
  borrowerName: string;
  facilityLocation: {
    latitude: number;
    longitude: number;
    countyFips: string;
    parcelId: string;
  };
  drawRequest: {
    drawNumber: number;
    requestedDrawCents: number;
    requestedAt: ISODateTime;
    cumulativeDrawnCents: number;
    totalFacilityCommitmentCents: number;
  };
  milestone: {
    milestoneId: string;
    title: string;
    contractualTargetPct: number;
    verifiedPhysicalPct: number;
    variancePct: number;
  };
  measurementEconomics: N11MeasurementDecision;
  stateFinding: {
    physicalMilestoneCleared: boolean;
    confidenceScorePercentile: number; // e.g. 98.4
    rawSensorArtifactDigest: Hash;
    liabilityNotice: 'Verified physical state only; not an engineering certification of record or draw authorization.';
  };
  validAt: ISODateTime;
  knownAt: ISODateTime;
}
