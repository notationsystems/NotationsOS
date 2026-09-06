import { SourceConnectorError } from './errors';
import { CENSUS_FIELDS, CENSUS_MAX_BYTES, parseCensusBytes, parseSourceCaptureRequest, type SourceCaptureRequest } from './fmcsa';

type CensusFieldName = typeof CENSUS_FIELDS[number];

export interface CensusCandidateField {
  raw: string | null;
  presence: 'PRESENT' | 'EXPLICIT_NULL' | 'OMITTED';
  value: string | number | null;
  unit: string | null;
  interpretation: string;
}

export interface CensusCandidateData {
  sourceRecordId: string;
  fields: Record<CensusFieldName, CensusCandidateField>;
  validTime: { state: 'UNOBSERVED'; from: null; to: null };
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

/** Versioned source interpretation, not a canonical Carrier or an admission profile. */
export const CENSUS_NORMALIZATION_ADAPTER = freeze({
  id: 'fmcsa.company-census-observation/v1', version: '1.0.0',
  domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation',
  sourceId: 'fmcsa-company-census', sourceSchema: 'payload.fmcsa-census-observations.v1',
  expectedMediaType: 'application/json', sourceEncoding: 'UTF-8', maximumSourceBytes: CENSUS_MAX_BYTES,
  sourceFields: [...CENSUS_FIELDS], validation: 'UNCHANGED_PARSE_CENSUS_BYTES_V1_BEFORE_ROW_SELECTION',
  selection: 'ONE_EXACT_REQUESTED_USDOT', notReturned: 'NULL_CANDIDATE_NOT_PROOF_OF_NONEXISTENCE',
  rawValues: 'UNCHANGED_SOURCE_TEXT_OR_NULL', fieldOrdering: 'CENSUS_FIELDS',
  missingness: 'DISTINGUISH_OMITTED_EXPLICIT_NULL_AND_PRESENT',
  missingInterpretation: 'SOURCE_VALUE_UNAVAILABLE_WITHOUT_INFERRED_REASON',
  identifiers: 'SOURCE_STRINGS_WITHOUT_CANONICAL_RESOLUTION',
  codes: 'PRESERVE_WITHOUT_MEANING_OR_AUTHORITY_MAPPING',
  quantities: {
    power_units: { type: 'NONNEGATIVE_SAFE_INTEGER', unit: 'POWER_UNIT' },
    total_drivers: { type: 'NONNEGATIVE_SAFE_INTEGER', unit: 'DRIVER' },
    mcs150_mileage: { type: 'NONNEGATIVE_SAFE_INTEGER', unit: null, unitVerification: 'UNRESOLVED_DATASET_DICTIONARY' },
    zero: 'PRESENT_SOURCE_VALUE_NOT_MISSINGNESS', conversion: 'NONE',
  },
  filingDate: 'YYYYMMDD_TO_DATE_ONLY_WITHOUT_TIMEZONE_OR_VALID_TIME',
  mileageYear: 'INTEGER_CALENDAR_YEAR_EXCEPT_SOURCE_ZERO_IS_UNRESOLVED_NULL',
  validTime: 'UNOBSERVED_NOT_INFERRED_FROM_FILING_CAPTURE_OR_PROVIDER_TIME',
  clocks: 'CAPTURE_PROVIDER_AND_KNOWLEDGE_TIMES_BOUND_BY_CALLING_STORE_NOT_THIS_ADAPTER',
  geography: 'SOURCE_COUNTRY_AND_STATE_CODES_ONLY_NO_COORDINATES',
  references: [{
    url: 'https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
    basis: 'PRIMARY_PROGRAM_DESCRIPTION_IDENTIFIES_POWER_UNIT_AND_DRIVER_COUNTS',
    independentlyVerified: false,
  }],
  identityResolution: false, canonicalAdmission: false, sourceTruthClaimed: false,
  fieldAccuracyClaimed: false, customerDistributionGranted: false,
} as const);

function presentField(name: CensusFieldName, raw: string): CensusCandidateField {
  const base = { raw, presence: 'PRESENT' as const, value: raw as string | number | null, unit: null as string | null };
  switch (name) {
    case 'dot_number': return { ...base, interpretation: 'SOURCE_SCOPED_IDENTIFIER' };
    case 'legal_name': return { ...base, interpretation: 'SOURCE_TEXT_UNCHANGED' };
    case 'business_org_desc': return { ...base, interpretation: 'SOURCE_ORGANIZATION_DESCRIPTION_UNVERIFIED' };
    case 'status_code':
    case 'carrier_operation':
    case 'docket1_status_code': return { ...base, interpretation: 'SOURCE_CODE_UNINTERPRETED' };
    case 'phy_country':
    case 'phy_state': return { ...base, interpretation: 'SOURCE_REGION_CODE_NOT_GEOMETRY' };
    case 'power_units': return { ...base, value: Number(raw), unit: 'POWER_UNIT', interpretation: 'SOURCE_REPORTED_POWER_UNIT_COUNT' };
    case 'total_drivers': return { ...base, value: Number(raw), unit: 'DRIVER', interpretation: 'SOURCE_REPORTED_DRIVER_COUNT' };
    case 'mcs150_date': return { ...base, value: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`, interpretation: 'SOURCE_FILING_DATE_ONLY' };
    case 'mcs150_mileage': return { ...base, value: Number(raw), interpretation: 'SOURCE_REPORTED_MILEAGE_UNIT_UNRESOLVED' };
    case 'mcs150_mileage_year': return raw === '0'
      ? { ...base, value: null, interpretation: 'SOURCE_ZERO_YEAR_UNRESOLVED' }
      : { ...base, value: Number(raw), interpretation: 'SOURCE_MILEAGE_CALENDAR_YEAR' };
    case 'docket1prefix': return { ...base, interpretation: 'SOURCE_DOCKET_PREFIX_UNINTERPRETED' };
    case 'docket1': return { ...base, interpretation: 'SOURCE_DOCKET_IDENTIFIER' };
  }
}

/**
 * Pure source-specific derivation. The caller must bind exact capture provenance,
 * policy and clocks; parser success alone grants neither permission nor admission.
 */
export function parseCensusCandidateData(bytes: Buffer, request: SourceCaptureRequest, usdot: string): CensusCandidateData | null {
  const selected = parseSourceCaptureRequest(request);
  if (typeof usdot !== 'string' || !selected.usdot.includes(usdot)) {
    throw new SourceConnectorError('INVALID_REQUEST', 'Select one exact USDOT identifier from the original capture request.');
  }
  // Validate the whole response first, including rows other than the selected one.
  const observations = parseCensusBytes(bytes, selected);
  if (observations.notReturned.includes(usdot)) return null;
  // Reparse only already-validated bytes to recover presence; do not change the
  // historical source parser's null-filled observation contract or its digest.
  const rows = JSON.parse(bytes.toString('utf8')) as Array<Record<string, string | null>>;
  const row = rows.find((candidate) => candidate.dot_number === usdot)!;
  const fields = Object.fromEntries(CENSUS_FIELDS.map((name) => {
    const presence = !Object.hasOwn(row, name) ? 'OMITTED' : row[name] === null ? 'EXPLICIT_NULL' : 'PRESENT';
    const field: CensusCandidateField = presence === 'PRESENT' ? presentField(name, row[name]!) : {
      raw: null, presence, value: null, unit: null, interpretation: 'SOURCE_VALUE_UNAVAILABLE_WITHOUT_INFERRED_REASON',
    };
    return [name, field];
  })) as CensusCandidateData['fields'];
  return { sourceRecordId: usdot, fields, validTime: { state: 'UNOBSERVED', from: null, to: null } };
}
