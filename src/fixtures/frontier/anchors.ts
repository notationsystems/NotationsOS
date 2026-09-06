import type {
  DisclosureAssurancePack,
  InsurabilityChangeFeedEvent,
  CapexProgressVerification,
} from '@/domain/frontierWedges';

export const FIXTURE_DISCLOSURE_PACKS: readonly DisclosureAssurancePack[] = [
  {
    packId: 'PACK-CBAM-2026-001',
    framework: 'CBAM',
    facilityId: 'FAC-STEEL-DE-441',
    facilityName: 'RHEIN-RUHR ELEKTROSTAHLWERKE GMBH',
    countryCode: 'DE',
    sector: 'STEEL',
    reportingPeriod: {
      periodStart: '2026-01-01T00:00:00Z',
      periodEnd: '2026-06-30T23:59:59Z',
    },
    metrics: {
      directTonsCo2e: 42180.5,
      indirectTonsCo2e: 18450.2,
      productionVolumeTons: 110500.0,
      specificIntensityPerTonProduct: 0.5486,
      uncertaintyMarginRatio: 0.038,
    },
    evidenceSubstrate: {
      primaryMeterLogDigest: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      rawIntakeDigest: 'sha256:d48e02d6b2c2ef7e02b78a088924b1764eb8cf3dcf443e2e8e3d64fc56447ec1',
      gridEmissionFactorSourceId: 'ENTSO-E-DE-REALTIME-GRID-2026',
      verifiedRunDigest: 'sha256:9118e69888d3e9112bf5a18a54d4f828a2a7f5c531d8713d31b6e41b250ad852',
      evidenceClass: 'DIRECT_CONTINUOUS_MEASUREMENT',
    },
    systemBoundary: {
      scope: 'CRADLE_TO_GATE',
      includedGases: ['CO2', 'N2O'],
      declaredExclusions: ['Downstream finishing mill line 4 (separate legal entity)'],
    },
    auditReadiness: {
      targetAuditorTier: 'BIG_4_INDEPENDENT_ASSURANCE',
      substrateStatus: 'ASSURANCE_READY_SUBSTRATE',
      assuranceStandard: 'EU_CBAM_IMPL_REG',
      disclaimer: 'Evidence substrate only; third-party assurance opinion must be rendered by accredited verifier.',
    },
    validAt: '2026-06-30T23:59:59Z',
    knownAt: '2026-07-15T08:00:00Z',
  },
  {
    packId: 'PACK-CBAM-2026-002',
    framework: 'CBAM',
    facilityId: 'FAC-ALUM-CA-109',
    facilityName: 'SAGUENAY HYDRO-ALUMINUM SMELTER CORP',
    countryCode: 'CA',
    sector: 'ALUMINUM',
    reportingPeriod: {
      periodStart: '2026-01-01T00:00:00Z',
      periodEnd: '2026-06-30T23:59:59Z',
    },
    metrics: {
      directTonsCo2e: 168200.0,
      indirectTonsCo2e: 8400.0,
      productionVolumeTons: 89000.0,
      specificIntensityPerTonProduct: 1.9842,
      uncertaintyMarginRatio: 0.042,
    },
    evidenceSubstrate: {
      primaryMeterLogDigest: 'sha256:1a82f3c09b110a3948e894082159187319582103847291048201847192847192',
      rawIntakeDigest: 'sha256:8819203847291038471092837401928374019283740192837401928374019283',
      gridEmissionFactorSourceId: 'HYDRO-QUEBEC-DEDICATED-PPA-2026',
      verifiedRunDigest: 'sha256:3910294820194820194820194820194820194820194820194820194820194820',
      evidenceClass: 'DIRECT_CONTINUOUS_MEASUREMENT',
    },
    systemBoundary: {
      scope: 'CRADLE_TO_GATE',
      includedGases: ['CO2', 'PFC'],
      declaredExclusions: ['Anode manufacturing facility offsite'],
    },
    auditReadiness: {
      targetAuditorTier: 'BIG_4_INDEPENDENT_ASSURANCE',
      substrateStatus: 'ASSURANCE_READY_SUBSTRATE',
      assuranceStandard: 'ISAE_3000',
      disclaimer: 'Evidence substrate only; third-party assurance opinion must be rendered by accredited verifier.',
    },
    validAt: '2026-06-30T23:59:59Z',
    knownAt: '2026-07-20T10:30:00Z',
  },
];

export const FIXTURE_INSURABILITY_EVENTS: readonly InsurabilityChangeFeedEvent[] = [
  {
    eventId: 'INS-EVT-2026-0901',
    sequenceIndex: 0,
    carrierNaic: '24740',
    carrierName: 'PACIFIC HORIZON INDEMNITY CO',
    stateDoiCode: 'CA-CDI',
    actionType: 'MARKET_WITHDRAWAL_FILING',
    filingDate: '2026-08-15T14:30:00Z',
    effectiveDate: '2026-11-15T00:00:00Z',
    geography: {
      fipsCode: '06061',
      countyName: 'Placer County',
      stateCode: 'CA',
      primaryHazardPeril: 'WILDFIRE',
      parcelCountInCorridor: 34180,
    },
    impactAssessment: {
      estimatedParcelsExposed: 8420,
      coverageGapDeltaBps: 2460, // 24.6% of local market leaving
      collateralRepricingRisk: 'SEVERE',
      leadTimeDaysToCollateralRepricing: 42,
    },
    filingArtifactDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    validAt: '2026-08-15T14:30:00Z',
    knownAt: '2026-08-16T06:00:00Z',
  },
  {
    eventId: 'INS-EVT-2026-0902',
    sequenceIndex: 1,
    carrierNaic: '19445',
    carrierName: 'EVERGLADES PROPERTY & CASUALTY CORP',
    stateDoiCode: 'FL-OIR',
    actionType: 'MORATORIUM_DECLARED',
    filingDate: '2026-08-20T09:15:00Z',
    effectiveDate: '2026-08-20T00:00:00Z',
    geography: {
      fipsCode: '12103',
      countyName: 'Pinellas County',
      stateCode: 'FL',
      primaryHazardPeril: 'COASTAL_FLOOD',
      parcelCountInCorridor: 71200,
    },
    impactAssessment: {
      estimatedParcelsExposed: 14890,
      coverageGapDeltaBps: 2090,
      collateralRepricingRisk: 'CRITICAL',
      leadTimeDaysToCollateralRepricing: 18,
    },
    filingArtifactDigest: 'sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    validAt: '2026-08-20T09:15:00Z',
    knownAt: '2026-08-20T12:00:00Z',
  },
  {
    eventId: 'INS-EVT-2026-0903',
    sequenceIndex: 2,
    carrierNaic: '31127',
    carrierName: 'LONE STAR UNDERWRITERS ALLIANCE',
    stateDoiCode: 'TX-TDI',
    actionType: 'DEDUCTIBLE_SPIKE_FILING',
    filingDate: '2026-08-25T11:00:00Z',
    effectiveDate: '2026-10-01T00:00:00Z',
    geography: {
      fipsCode: '48085',
      countyName: 'Collin County',
      stateCode: 'TX',
      primaryHazardPeril: 'SEVERE_CONVECTIVE_STORM',
      parcelCountInCorridor: 112000,
    },
    impactAssessment: {
      estimatedParcelsExposed: 28400,
      coverageGapDeltaBps: 1150,
      collateralRepricingRisk: 'ELEVATED',
      leadTimeDaysToCollateralRepricing: 65,
    },
    filingArtifactDigest: 'sha256:8843d7f92416211de9ebb963ff4ce28125932878ffc61d289fb94704c7038f6e',
    validAt: '2026-08-25T11:00:00Z',
    knownAt: '2026-08-26T08:00:00Z',
  },
];

export const FIXTURE_CAPEX_PROGRESS: readonly CapexProgressVerification[] = [
  {
    verificationId: 'CPX-VER-2026-001',
    projectId: 'PRJ-DC-LOUDOUN-08',
    projectName: 'POTOMAC GATEWAY HYPERSCALE CAMPUS (PHASE II)',
    projectType: 'HYPERSCALE_DATA_CENTER',
    borrowerName: 'APEX DIGITAL INFRASTRUCTURE PARTNERS II LP',
    facilityLocation: {
      latitude: 39.0142,
      longitude: -77.5312,
      countyFips: '51107',
      parcelId: 'PIN-098-21-4401',
    },
    drawRequest: {
      drawNumber: 4,
      requestedDrawCents: 4850000000, // $48.5M
      requestedAt: '2026-08-28T16:00:00Z',
      cumulativeDrawnCents: 11200000000, // $112M
      totalFacilityCommitmentCents: 38000000000, // $380M
    },
    milestone: {
      milestoneId: 'M-04-STRUCTURAL-HVAC',
      title: 'Structural Steel Enclosure & 345kV Substation Civils',
      contractualTargetPct: 62.0,
      verifiedPhysicalPct: 61.4,
      variancePct: -0.6,
    },
    measurementEconomics: {
      decisionLossAtRiskCents: 4850000000,
      selectedInstrument: 'SATELLITE_SAR_AND_OPTICAL',
      instrumentCostCents: 1450000, // $14,500 for tasking
      expectedValueOfInformationCents: 184000000, // $1.84M reduction in expected dispute/delay loss
      netMeasurementSurplusCents: 182550000,
    },
    stateFinding: {
      physicalMilestoneCleared: true,
      confidenceScorePercentile: 98.6,
      rawSensorArtifactDigest: 'sha256:d8b1230727259e7e05bdef7055b020469a69713decbe716db4ce4ce0de15bc21',
      liabilityNotice: 'Verified physical state only; not an engineering certification of record or draw authorization.',
    },
    validAt: '2026-08-30T10:00:00Z',
    knownAt: '2026-08-30T14:30:00Z',
  },
  {
    verificationId: 'CPX-VER-2026-002',
    projectId: 'PRJ-FAB-PHOENIX-03',
    projectName: 'DESERT SILICON ADVANCED FOUNDRY MODULE A',
    projectType: 'SEMICONDUCTOR_FAB',
    borrowerName: 'PACIFIC SEMICONDUCTOR MANUFACTURING JV',
    facilityLocation: {
      latitude: 33.6821,
      longitude: -112.1843,
      countyFips: '04013',
      parcelId: 'MC-210-99-012',
    },
    drawRequest: {
      drawNumber: 7,
      requestedDrawCents: 9200000000, // $92.0M
      requestedAt: '2026-08-25T11:30:00Z',
      cumulativeDrawnCents: 34000000000,
      totalFacilityCommitmentCents: 125000000000,
    },
    milestone: {
      milestoneId: 'M-07-CLEANROOM-SUBFAB',
      title: 'Vibration-Isolated Subfab Slab & Process Piping Trenching',
      contractualTargetPct: 78.0,
      verifiedPhysicalPct: 69.2,
      variancePct: -8.8,
    },
    measurementEconomics: {
      decisionLossAtRiskCents: 9200000000,
      selectedInstrument: 'TERRESTRIAL_LIDAR_SCAN',
      instrumentCostCents: 3800000, // $38,000 for terrestrial LiDAR run
      expectedValueOfInformationCents: 412000000, // $4.12M VOI
      netMeasurementSurplusCents: 408200000,
    },
    stateFinding: {
      physicalMilestoneCleared: false, // FLAG FOR LENDER AGENT
      confidenceScorePercentile: 99.2,
      rawSensorArtifactDigest: 'sha256:4dec7bd951394593ed5dd77be92ad01cd1f6eb1db5a0a0d1c2ac941d47d36be7',
      liabilityNotice: 'Verified physical state only; not an engineering certification of record or draw authorization.',
    },
    validAt: '2026-08-27T17:00:00Z',
    knownAt: '2026-08-28T09:00:00Z',
  },
];
