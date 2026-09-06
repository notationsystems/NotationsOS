import type { StateDoiFilingRecord, LoanCollateralAsset } from '@/domain/insurabilityDynamics';
import type { ProjectMilestoneDrawContext } from '@/domain/n11MeasurementEconomy';

export const FIXTURE_STATE_DOI_FILINGS: readonly StateDoiFilingRecord[] = [
  {
    filingId: 'FILING-CA-CDI-2026-8812',
    serffTrackingNumber: 'PACH-133982144',
    jurisdiction: 'CA_CDI',
    stateCode: 'CA',
    carrierNaic: '24740',
    carrierGroup: 'Pacific Horizon Insurance Group',
    lineOfBusiness: 'COMMERCIAL_PROPERTY_MULTI_PERIL',
    actionType: 'FULL_MARKET_WITHDRAWAL',
    primaryPeril: 'WILDFIRE',
    filingDate: '2026-07-10T14:30:00Z',
    effectiveDate: '2026-10-15T00:00:00Z',
    targetGeographies: [
      {
        fipsCode: '06061',
        countyName: 'Placer County',
        zipCodePrefixes: ['956', '957'],
      },
      {
        fipsCode: '06017',
        countyName: 'El Dorado County',
        zipCodePrefixes: ['956', '961'],
      },
    ],
    filingTerms: {
      withdrawalPctOfBook: 100,
      projectedPoliciesImpacted: 6420,
    },
    provenance: {
      sourceUrl: 'https://insurance.ca.gov/0250-insurers/0300-insurers/filings/2026/pach-133982144.pdf',
      archiveArtifactDigest: 'sha256:8894ab102c91834211094812efca819203918230192830192830192830192831',
      capturedAt: '2026-07-11T09:15:00Z',
    },
  },
  {
    filingId: 'FILING-FL-OIR-2026-0419',
    serffTrackingNumber: 'EVPC-134011293',
    jurisdiction: 'FL_OIR',
    stateCode: 'FL',
    carrierNaic: '19445',
    carrierGroup: 'Everglades Property & Casualty Corp',
    lineOfBusiness: 'COMMERCIAL_PROPERTY_MULTI_PERIL',
    actionType: 'COUNTY_MORATORIUM_DECLARED',
    primaryPeril: 'COASTAL_HURRICANE_SURGE',
    filingDate: '2026-08-01T11:00:00Z',
    effectiveDate: '2026-08-01T00:00:00Z',
    targetGeographies: [
      {
        fipsCode: '12103',
        countyName: 'Pinellas County',
        zipCodePrefixes: ['337'],
      },
      {
        fipsCode: '12057',
        countyName: 'Hillsborough County',
        zipCodePrefixes: ['336'],
      },
    ],
    filingTerms: {
      withdrawalPctOfBook: 65,
      projectedPoliciesImpacted: 14890,
    },
    provenance: {
      sourceUrl: 'https://floir.com/orders/emergency-moratorium-2026-0419.pdf',
      archiveArtifactDigest: 'sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      capturedAt: '2026-08-01T14:20:00Z',
    },
  },
  {
    filingId: 'FILING-TX-TDI-2026-9041',
    serffTrackingNumber: 'LONE-133884102',
    jurisdiction: 'TX_TDI',
    stateCode: 'TX',
    carrierNaic: '31127',
    carrierGroup: 'Lone Star Underwriters Alliance',
    lineOfBusiness: 'COMMERCIAL_PROPERTY_MULTI_PERIL',
    actionType: 'MANDATORY_DEDUCTIBLE_SPIKE',
    primaryPeril: 'SEVERE_CONVECTIVE_STORM_HAIL',
    filingDate: '2026-08-15T16:00:00Z',
    effectiveDate: '2026-10-01T00:00:00Z',
    targetGeographies: [
      {
        fipsCode: '48085',
        countyName: 'Collin County',
        zipCodePrefixes: ['750'],
      },
      {
        fipsCode: '48113',
        countyName: 'Dallas County',
        zipCodePrefixes: ['752'],
      },
    ],
    filingTerms: {
      deductibleChange: {
        priorDeductiblePct: 1.0,
        newMandatoryDeductiblePct: 5.0,
      },
      projectedPoliciesImpacted: 22400,
    },
    provenance: {
      sourceUrl: 'https://tdi.texas.gov/filings/commercial/hail-endorsements-2026-9041.pdf',
      archiveArtifactDigest: 'sha256:8843d7f92416211de9ebb963ff4ce28125932878ffc61d289fb94704c7038f6e',
      capturedAt: '2026-08-16T08:00:00Z',
    },
  },
];

export const FIXTURE_LOAN_PORTFOLIO: readonly LoanCollateralAsset[] = [
  {
    loanId: 'LN-CRE-CA-001',
    borrowerName: 'SIERRA FOOTHILLS LOGISTICS PARK LLC',
    propertyType: 'INDUSTRIAL_LOGISTICS',
    address: '4200 Rocklin Commerce Pkwy, Rocklin, CA',
    countyFips: '06061',
    countyName: 'Placer County',
    stateCode: 'CA',
    originalAppraisedValueCents: 6500000000, // $65M
    outstandingLoanBalanceCents: 4200000000, // $42M
    currentAnnualNoiCents: 455000000, // $4.55M
    annualDebtServiceCents: 310000000, // $3.10M (DSCR 1.47x)
    currentInsurancePremiumCents: 18500000, // $185k/yr
    currentInsuringCarrierNaic: '24740', // Pacific Horizon (Withdrawing)
  },
  {
    loanId: 'LN-CRE-FL-002',
    borrowerName: 'TAMPA BAY WATERFRONT MULTIFAMILY JV',
    propertyType: 'MULTIFAMILY',
    address: '1100 Gulf Shore Blvd, St. Petersburg, FL',
    countyFips: '12103',
    countyName: 'Pinellas County',
    stateCode: 'FL',
    originalAppraisedValueCents: 11000000000, // $110M
    outstandingLoanBalanceCents: 7800000000, // $78M
    currentAnnualNoiCents: 740000000, // $7.40M
    annualDebtServiceCents: 580000000, // $5.80M (DSCR 1.28x)
    currentInsurancePremiumCents: 52000000, // $520k/yr
    currentInsuringCarrierNaic: '19445', // Everglades (Moratorium declared)
  },
  {
    loanId: 'LN-CRE-TX-003',
    borrowerName: 'PLANO TECH CORRIDOR OFFICE TOWERS',
    propertyType: 'COMMERCIAL_OFFICE',
    address: '5800 Legacy Drive, Plano, TX',
    countyFips: '48085',
    countyName: 'Collin County',
    stateCode: 'TX',
    originalAppraisedValueCents: 8500000000, // $85M
    outstandingLoanBalanceCents: 5600000000, // $56M
    currentAnnualNoiCents: 680000000, // $6.80M
    annualDebtServiceCents: 490000000, // $4.90M (DSCR 1.39x)
    currentInsurancePremiumCents: 24000000, // $240k/yr
    currentInsuringCarrierNaic: '31127', // Lone Star (5% deductible spike)
  },
  {
    loanId: 'LN-CRE-VA-004',
    borrowerName: 'POTOMAC ASYMMETRY DIGITAL CAMPUS',
    propertyType: 'DATA_CENTER',
    address: '21400 Beaumeade Circle, Ashburn, VA',
    countyFips: '51107',
    countyName: 'Loudoun County',
    stateCode: 'VA',
    originalAppraisedValueCents: 24000000000, // $240M
    outstandingLoanBalanceCents: 16000000000, // $160M
    currentAnnualNoiCents: 1920000000, // $19.2M
    annualDebtServiceCents: 1280000000, // $12.8M (DSCR 1.50x)
    currentInsurancePremiumCents: 45000000, // $450k/yr
    currentInsuringCarrierNaic: '23035', // Unaffected
  },
];

export const FIXTURE_PROJECT_DRAWS: readonly ProjectMilestoneDrawContext[] = [
  {
    projectId: 'PRJ-DC-LOUDOUN-08',
    projectName: 'Potomac Gateway Hyperscale Campus (Phase II)',
    megaprojectSector: 'DATA_CENTER',
    milestoneTitle: 'Structural Steel Enclosure & 345kV Substation Civils',
    requestedDrawAmountCents: 4850000000, // $48.5M
    estimatedDefectCostAtRiskCents: 750000000, // $7.5M delay/defect loss
    priorDefectProbability: 0.14, // 14% historical subcontractor variance
    maxAllowedLatencyHours: 48,
  },
  {
    projectId: 'PRJ-FAB-PHOENIX-03',
    projectName: 'Desert Silicon Advanced Foundry Module A',
    megaprojectSector: 'SEMICONDUCTOR_FAB',
    milestoneTitle: 'Vibration-Isolated Subfab Slab & Process Piping Trenching',
    requestedDrawAmountCents: 9200000000, // $92.0M
    estimatedDefectCostAtRiskCents: 1850000000, // $18.5M defect loss
    priorDefectProbability: 0.18, // 18% cleanroom slab flatness tolerance failure
    maxAllowedLatencyHours: 48,
  },
  {
    projectId: 'PRJ-BATT-GEORGIA-01',
    projectName: 'Blue Ridge Clean Mobility Gigafactory',
    megaprojectSector: 'BATTERY_GIGAFACTORY',
    milestoneTitle: 'Dry Room HVAC Moisture Barrier & Cathode Line Craneway',
    requestedDrawAmountCents: 6500000000, // $65.0M
    estimatedDefectCostAtRiskCents: 1200000000, // $12.0M moisture breach loss
    priorDefectProbability: 0.15,
    maxAllowedLatencyHours: 36,
  },
];
