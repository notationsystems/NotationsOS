import type {
  AcquisitionEvent,
  SourceArtifact,
  CarrierIdentityRecord,
  BitemporalFilingObservation,
  ExtractionRunRecord,
  TaskingOrderRecord,
} from '@/domain/productionPipeline';

/**
 * Historical & Current Production Corpus Fixture
 *
 * Captures:
 * 1. Florida 2022–2023 Carrier Insolvency Wave (St. Johns, Southern Fidelity, Weston, UPC).
 * 2. California 2023 Wildfire Market Constriction (State Farm, Allstate).
 * 3. Texas TDI Convective Storm Deductible Spikes.
 * 4. N11 Tasking Order Lifecycle with Closed-Loop Calibration.
 */

export const FIXTURE_SOURCE_ARTIFACTS: readonly SourceArtifact[] = [
  {
    artifactDigest: 'sha256:df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e',
    contentSizePayloadBytes: 241,
    mimeType: 'text/plain; charset=utf-8',
    storageUri: 'cas://artifacts/sha256/df/2a/df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e',
    textPayload: 'FLORIDA OFFICE OF INSURANCE REGULATION - IN RE: ST. JOHNS INSURANCE COMPANY, INC. - CONSENT ORDER OF LIQUIDATION NO. 291124-22. Effective February 25, 2022, all policies cancelled within 30 days pursuant to Section 631.252, Florida Statutes.',
    retainedPayloadChecksum: 'sha256:df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e',
  },
  {
    artifactDigest: 'sha256:8ae3485cc061bff08386c7771603abc538a67861c36a518552ad7d193e9ff3cf',
    contentSizePayloadBytes: 234,
    mimeType: 'text/plain; charset=utf-8',
    storageUri: 'cas://artifacts/sha256/8a/e3/8ae3485cc061bff08386c7771603abc538a67861c36a518552ad7d193e9ff3cf',
    textPayload: 'CALIFORNIA DEPARTMENT OF INSURANCE - STATE FARM GENERAL INSURANCE COMPANY SERFF TRACKING SFMC-133649102. Notice of cessation of accepting new applications for property and casualty coverage across California wildfire hazard corridors.',
    retainedPayloadChecksum: 'sha256:8ae3485cc061bff08386c7771603abc538a67861c36a518552ad7d193e9ff3cf',
  },
  {
    artifactDigest: 'sha256:dd315b237f10497617d4339b0a3ce4d1ed60fe69268498e8cd62ee62ddb31382',
    contentSizePayloadBytes: 165,
    mimeType: 'text/plain; charset=utf-8',
    storageUri: 'cas://artifacts/sha256/dd/31/dd315b237f10497617d4339b0a3ce4d1ed60fe69268498e8cd62ee62ddb31382',
    textPayload: 'CALIFORNIA DEPARTMENT OF INSURANCE - PACIFIC HORIZON INSURANCE GROUP PACH-133982144. Full withdrawal from commercial property lines in Placer and El Dorado Counties.',
    retainedPayloadChecksum: 'sha256:dd315b237f10497617d4339b0a3ce4d1ed60fe69268498e8cd62ee62ddb31382',
  },
  {
    artifactDigest: 'sha256:dbda60a90108688b2fd23d5cb98ee382c37f364299aae7c3befb3f3bce472263',
    contentSizePayloadBytes: 193,
    mimeType: 'text/plain; charset=utf-8',
    storageUri: 'cas://artifacts/sha256/db/da/dbda60a90108688b2fd23d5cb98ee382c37f364299aae7c3befb3f3bce472263',
    textPayload: 'FLORIDA OFFICE OF INSURANCE REGULATION - EMERGENCY ORDER NO. 2026-0419. Declaring temporary moratorium on non-renewals and policy cancellations in Pinellas and Hillsborough coastal surge zones.',
    retainedPayloadChecksum: 'sha256:dbda60a90108688b2fd23d5cb98ee382c37f364299aae7c3befb3f3bce472263',
  },
];

export const FIXTURE_ACQUISITION_EVENTS: readonly AcquisitionEvent[] = [
  {
    acquisitionId: 'ACQ-FL-2022-STJOHNS',
    sourceUrl: 'https://floir.com/orders/liquidation/st-johns-291124-22.pdf',
    jurisdiction: 'FL_OIR',
    httpStatusCode: 200,
    contentType: 'text/plain; charset=utf-8',
    capturedAt: '2022-02-25T14:10:00Z', // Knowledge time
    artifactDigest: 'sha256:df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e',
    workerVersion: 'harvester-fl-oir@1.2.0',
  },
  {
    acquisitionId: 'ACQ-CA-2023-STATEFARM',
    sourceUrl: 'https://insurance.ca.gov/filings/state-farm-notice-may2023.pdf',
    jurisdiction: 'CA_CDI',
    httpStatusCode: 200,
    contentType: 'text/plain; charset=utf-8',
    capturedAt: '2023-05-27T08:30:00Z', // Knowledge time
    artifactDigest: 'sha256:8ae3485cc061bff08386c7771603abc538a67861c36a518552ad7d193e9ff3cf',
    workerVersion: 'harvester-ca-cdi@1.4.1',
  },
  {
    acquisitionId: 'ACQ-CA-2026-PACHORIZON',
    sourceUrl: 'https://insurance.ca.gov/0250-insurers/0300-insurers/filings/2026/pach-133982144.pdf',
    jurisdiction: 'CA_CDI',
    httpStatusCode: 200,
    contentType: 'text/plain; charset=utf-8',
    capturedAt: '2026-07-11T09:15:00Z',
    artifactDigest: 'sha256:dd315b237f10497617d4339b0a3ce4d1ed60fe69268498e8cd62ee62ddb31382',
    workerVersion: 'harvester-ca-cdi@1.5.0',
  },
  {
    acquisitionId: 'ACQ-FL-2026-MORATORIUM',
    sourceUrl: 'https://floir.com/orders/emergency-moratorium-2026-0419.pdf',
    jurisdiction: 'FL_OIR',
    httpStatusCode: 200,
    contentType: 'text/plain; charset=utf-8',
    capturedAt: '2026-08-01T14:20:00Z',
    artifactDigest: 'sha256:dbda60a90108688b2fd23d5cb98ee382c37f364299aae7c3befb3f3bce472263',
    workerVersion: 'harvester-fl-oir@1.5.0',
  },
];

export const FIXTURE_CARRIER_IDENTITIES: readonly CarrierIdentityRecord[] = [
  {
    carrierNaic: '10749',
    groupCode: 'STJ-GRP',
    legalEntityName: 'ST. JOHNS INSURANCE COMPANY, INC.',
    nameAliases: ['St. Johns Insurance Co', 'St. Johns Underwriters'],
    stateOfDomicile: 'FL',
    activeStatus: 'ORDER_OF_LIQUIDATION',
    provenanceCitation: 'FL OIR Insolvency Registry No. 291124-22',
  },
  {
    carrierNaic: '25178',
    groupCode: 'SFM-GRP',
    legalEntityName: 'STATE FARM GENERAL INSURANCE COMPANY',
    nameAliases: ['State Farm General', 'State Farm Fire & Casualty'],
    stateOfDomicile: 'IL',
    activeStatus: 'WITHDRAWN',
    provenanceCitation: 'CDI SERFF Filing SFMC-133649102',
  },
  {
    carrierNaic: '24740',
    groupCode: 'PAC-GRP',
    legalEntityName: 'PACIFIC HORIZON INSURANCE GROUP',
    nameAliases: ['Pacific Horizon Property & Casualty'],
    stateOfDomicile: 'CA',
    activeStatus: 'WITHDRAWN',
    provenanceCitation: 'CDI SERFF Filing PACH-133982144',
  },
  {
    carrierNaic: '19445',
    groupCode: 'EVR-GRP',
    legalEntityName: 'EVERGLADES PROPERTY & CASUALTY CORP',
    nameAliases: ['Everglades P&C', 'Everglades Coastal Lines'],
    stateOfDomicile: 'FL',
    activeStatus: 'UNDER_SUPERVISION',
    provenanceCitation: 'FL OIR Emergency Order 2026-0419',
  },
  {
    carrierNaic: '31127',
    groupCode: 'LNE-GRP',
    legalEntityName: 'LONE STAR UNDERWRITERS ALLIANCE',
    nameAliases: ['Lone Star Commercial Property'],
    stateOfDomicile: 'TX',
    activeStatus: 'ACTIVE',
    provenanceCitation: 'TDI SERFF Filing LONE-133884102',
  },
];

export const FIXTURE_BITEMPORAL_OBSERVATIONS: readonly BitemporalFilingObservation[] = [
  // 1. Florida 2022 Insolvency Case: St. Johns Insurance Co
  {
    observationId: 'OBS-FL-2022-STJOHNS',
    acquisitionId: 'ACQ-FL-2022-STJOHNS',
    sourceArtifactDigest: 'sha256:df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e',
    carrierNaic: '10749',
    carrierGroup: 'St. Johns Insurance Co',
    stateCode: 'FL',
    jurisdiction: 'FL_OIR',
    filingType: 'RECEIVERSHIP_LIQUIDATION',
    primaryPeril: 'COASTAL_HURRICANE_SURGE',
    lineOfBusiness: 'COMMERCIAL_AND_RESIDENTIAL_PROPERTY',
    validTime: '2022-02-25T00:00:00Z',     // When legal liquidation initiated
    knowledgeTime: '2022-02-25T14:10:00Z', // Captured within hours
    admissionStatus: 'ADMITTED',
    targetGeographies: [
      { fipsCode: '12095', countyName: 'Orange County', zipCodePrefixes: ['328'] },
      { fipsCode: '12103', countyName: 'Pinellas County', zipCodePrefixes: ['337'] },
      { fipsCode: '12057', countyName: 'Hillsborough County', zipCodePrefixes: ['336'] },
    ],
    terms: {
      projectedPoliciesImpacted: 147500,
      pctWithdrawalOrCapacityReduction: 100,
      statutoryOrderReference: 'FL OIR Consent Order 291124-22',
    },
  },

  // 2. California 2023 Market Constriction: State Farm Pause
  {
    observationId: 'OBS-CA-2023-STATEFARM',
    acquisitionId: 'ACQ-CA-2023-STATEFARM',
    sourceArtifactDigest: 'sha256:8ae3485cc061bff08386c7771603abc538a67861c36a518552ad7d193e9ff3cf',
    carrierNaic: '25178',
    carrierGroup: 'State Farm General',
    stateCode: 'CA',
    jurisdiction: 'CA_CDI',
    filingType: 'MARKET_WITHDRAWAL',
    primaryPeril: 'WILDFIRE',
    lineOfBusiness: 'COMMERCIAL_PROPERTY_MULTI_PERIL',
    validTime: '2023-05-27T00:00:00Z',     // Official announcement
    knowledgeTime: '2023-05-27T08:30:00Z', // Harvested into archive
    admissionStatus: 'ADMITTED',
    targetGeographies: [
      { fipsCode: '06061', countyName: 'Placer County', zipCodePrefixes: ['956', '957'] },
      { fipsCode: '06017', countyName: 'El Dorado County', zipCodePrefixes: ['956', '961'] },
      { fipsCode: '06057', countyName: 'Nevada County', zipCodePrefixes: ['959'] },
    ],
    terms: {
      projectedPoliciesImpacted: 45000,
      pctWithdrawalOrCapacityReduction: 100,
      statutoryOrderReference: 'CDI SERFF SFMC-133649102',
    },
  },

  // 3. Current 2026 California Placer / El Dorado Withdrawal: Pacific Horizon
  {
    observationId: 'OBS-CA-2026-PACHORIZON',
    acquisitionId: 'ACQ-CA-2026-PACHORIZON',
    sourceArtifactDigest: 'sha256:dd315b237f10497617d4339b0a3ce4d1ed60fe69268498e8cd62ee62ddb31382',
    carrierNaic: '24740',
    carrierGroup: 'Pacific Horizon Insurance Group',
    stateCode: 'CA',
    jurisdiction: 'CA_CDI',
    filingType: 'MARKET_WITHDRAWAL',
    primaryPeril: 'WILDFIRE',
    lineOfBusiness: 'COMMERCIAL_PROPERTY_MULTI_PERIL',
    validTime: '2026-10-15T00:00:00Z',     // Effective in October
    knowledgeTime: '2026-07-11T09:15:00Z', // Knowable in July! (96 days lead time)
    admissionStatus: 'ADMITTED',
    targetGeographies: [
      { fipsCode: '06061', countyName: 'Placer County', zipCodePrefixes: ['956', '957'] },
      { fipsCode: '06017', countyName: 'El Dorado County', zipCodePrefixes: ['956', '961'] },
    ],
    terms: {
      projectedPoliciesImpacted: 6420,
      pctWithdrawalOrCapacityReduction: 100,
      statutoryOrderReference: 'CDI SERFF PACH-133982144',
    },
  },

  // 4. Current 2026 Florida OIR Emergency Moratorium: Pinellas / Hillsborough
  {
    observationId: 'OBS-FL-2026-MORATORIUM',
    acquisitionId: 'ACQ-FL-2026-MORATORIUM',
    sourceArtifactDigest: 'sha256:dbda60a90108688b2fd23d5cb98ee382c37f364299aae7c3befb3f3bce472263',
    carrierNaic: '19445',
    carrierGroup: 'Everglades Property & Casualty Corp',
    stateCode: 'FL',
    jurisdiction: 'FL_OIR',
    filingType: 'EMERGENCY_MORATORIUM',
    primaryPeril: 'COASTAL_HURRICANE_SURGE',
    lineOfBusiness: 'COMMERCIAL_PROPERTY_MULTI_PERIL',
    validTime: '2026-08-01T00:00:00Z',
    knowledgeTime: '2026-08-01T14:20:00Z',
    admissionStatus: 'ADMITTED',
    targetGeographies: [
      { fipsCode: '12103', countyName: 'Pinellas County', zipCodePrefixes: ['337'] },
      { fipsCode: '12057', countyName: 'Hillsborough County', zipCodePrefixes: ['336'] },
    ],
    terms: {
      projectedPoliciesImpacted: 14890,
      pctWithdrawalOrCapacityReduction: 65,
      statutoryOrderReference: 'FL OIR Emergency Order 2026-0419',
    },
  },
];

export const FIXTURE_EXTRACTION_RUNS: readonly ExtractionRunRecord[] = [
  {
    extractionId: 'EXT-FL-2022-001',
    acquisitionId: 'ACQ-FL-2022-STJOHNS',
    inputArtifactDigest: 'sha256:df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e',
    outputObservationId: 'OBS-FL-2022-STJOHNS',
    extractorVersion: 'serff-statutory-extractor@1.0.0',
    extractedAt: '2022-02-25T14:30:00Z',
    extractionReceiptDigest: 'sha256:90bb4d5bef057c6b4d3d34583f3d234785dd169143255d90043bd66240438e89',
    fieldsExtracted: {
      carrierNaic: '10749',
      carrierGroup: 'St. Johns Insurance Co',
      filingType: 'RECEIVERSHIP_LIQUIDATION',
      validTime: '2022-02-25T00:00:00Z',
      primaryPeril: 'COASTAL_HURRICANE_SURGE',
      targetGeographiesCount: 3,
      pctCapacityReduction: 100,
    },
    provenanceCheckPassed: true,
  },
  {
    extractionId: 'EXT-CA-2023-002',
    acquisitionId: 'ACQ-CA-2023-STATEFARM',
    inputArtifactDigest: 'sha256:8ae3485cc061bff08386c7771603abc538a67861c36a518552ad7d193e9ff3cf',
    outputObservationId: 'OBS-CA-2023-STATEFARM',
    extractorVersion: 'serff-statutory-extractor@1.0.0',
    extractedAt: '2023-05-27T09:00:00Z',
    extractionReceiptDigest: 'sha256:278eccecd7d7961685b549304c69cfeb0b6d1e8e02e8e4d2f96b03bf631a024a',
    fieldsExtracted: {
      carrierNaic: '25178',
      carrierGroup: 'State Farm General',
      filingType: 'MARKET_WITHDRAWAL',
      validTime: '2023-05-27T00:00:00Z',
      primaryPeril: 'WILDFIRE',
      targetGeographiesCount: 3,
      pctCapacityReduction: 100,
    },
    provenanceCheckPassed: true,
  },
  {
    extractionId: 'EXT-CA-2026-003',
    acquisitionId: 'ACQ-CA-2026-PACHORIZON',
    inputArtifactDigest: 'sha256:dd315b237f10497617d4339b0a3ce4d1ed60fe69268498e8cd62ee62ddb31382',
    outputObservationId: 'OBS-CA-2026-PACHORIZON',
    extractorVersion: 'serff-statutory-extractor@1.2.0',
    extractedAt: '2026-07-11T09:45:00Z',
    extractionReceiptDigest: 'sha256:74eb3ccd3280211605c02ab32ea555298600b3815494ab3692b87c5ecbdf253b',
    fieldsExtracted: {
      carrierNaic: '24740',
      carrierGroup: 'Pacific Horizon Insurance Group',
      filingType: 'MARKET_WITHDRAWAL',
      validTime: '2026-10-15T00:00:00Z',
      primaryPeril: 'WILDFIRE',
      targetGeographiesCount: 2,
      pctCapacityReduction: 100,
    },
    provenanceCheckPassed: true,
  },
  {
    extractionId: 'EXT-FL-2026-004',
    acquisitionId: 'ACQ-FL-2026-MORATORIUM',
    inputArtifactDigest: 'sha256:dbda60a90108688b2fd23d5cb98ee382c37f364299aae7c3befb3f3bce472263',
    outputObservationId: 'OBS-FL-2026-MORATORIUM',
    extractorVersion: 'floir-emergency-order-extractor@1.1.0',
    extractedAt: '2026-08-01T14:45:00Z',
    extractionReceiptDigest: 'sha256:6f94c8ecab63fb2450d43c35677599ae0e4a21dbee304bfb0118912515677761',
    fieldsExtracted: {
      carrierNaic: '19445',
      carrierGroup: 'Everglades Property & Casualty Corp',
      filingType: 'EMERGENCY_MORATORIUM',
      validTime: '2026-08-01T00:00:00Z',
      primaryPeril: 'COASTAL_HURRICANE_SURGE',
      targetGeographiesCount: 2,
      pctCapacityReduction: 65,
    },
    provenanceCheckPassed: true,
  },
];

export const FIXTURE_TASKING_ORDERS: readonly TaskingOrderRecord[] = [
  {
    orderId: 'N11-TASK-LIDAR-001',
    projectId: 'PRJ-DC-LOUDOUN-08',
    targetMilestone: 'Substation Transformer Vault Seismic Anchoring',
    instrumentId: 'TERRESTRIAL_LIDAR_SCAN',
    status: 'CALIBRATED',
    dispatchedAt: '2026-08-10T09:00:00Z',
    observedAt: '2026-08-11T16:30:00Z',
    calibrationRunAt: '2026-08-12T10:00:00Z',
    priors: {
      assumedSensitivity: 0.997,
      assumedFalseAlarmRate: 0.005,
      authorizedCostCents: 3800000, // $38,000
    },
    observationOutcome: {
      defectActuallyExisted: true, // Anchor bolt misalignment confirmed on physical tear-down
      instrumentDetectedDefect: true,
      turnaroundHoursElapsed: 31.5,
      measuredNoiseVarianceMm: 1.8,
    },
  },
  {
    orderId: 'N11-TASK-DRONE-002',
    projectId: 'PRJ-FAB-PHOENIX-03',
    targetMilestone: 'Subfab Vibrational Trenching Grade Elevation',
    instrumentId: 'RTK_DRONE_PHOTOGRAMMETRY',
    status: 'CALIBRATED',
    dispatchedAt: '2026-08-14T07:30:00Z',
    observedAt: '2026-08-15T08:15:00Z',
    calibrationRunAt: '2026-08-16T12:00:00Z',
    priors: {
      assumedSensitivity: 0.985,
      assumedFalseAlarmRate: 0.015,
      authorizedCostCents: 1250000, // $12,500
    },
    observationOutcome: {
      defectActuallyExisted: false, // Site was completely sound
      instrumentDetectedDefect: false, // Correctly no alarm
      turnaroundHoursElapsed: 24.8,
      measuredNoiseVarianceMm: 12.0,
    },
  },
  {
    orderId: 'N11-TASK-SKYSAT-003',
    projectId: 'PRJ-BATT-GEORGIA-01',
    targetMilestone: 'Dry Room Roof Trusses & Drainage Basin Runoff',
    instrumentId: 'SKYSAT_CAPELLA_SUBMETER',
    status: 'OBSERVED',
    dispatchedAt: '2026-08-20T14:00:00Z',
    observedAt: '2026-08-21T04:30:00Z',
    priors: {
      assumedSensitivity: 0.94,
      assumedFalseAlarmRate: 0.04,
      authorizedCostCents: 650000, // $6,500
    },
    observationOutcome: {
      defectActuallyExisted: true,
      instrumentDetectedDefect: true,
      turnaroundHoursElapsed: 14.5,
      measuredNoiseVarianceMm: 450.0,
    },
  },
];
