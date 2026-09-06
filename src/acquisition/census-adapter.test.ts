import { describe, expect, it } from 'vitest';
import { CENSUS_NORMALIZATION_ADAPTER, parseCensusCandidateData } from './census-adapter';
import { CENSUS_FIELDS, CENSUS_MAX_BYTES, parseCensusBytes, type SourceCaptureRequest } from './fmcsa';

const request: SourceCaptureRequest = {
  schema: 'payload.source-capture-request.v1', requestId: 'synthetic-census-normalization-test',
  sourceId: 'fmcsa-company-census', usdot: ['80806', '99999999'],
};
const row = (changes: Record<string, unknown> = {}) => ({
  dot_number: '80806', legal_name: '  Synthetic Census Corporation  ', business_org_desc: 'CORPORATION',
  status_code: 'A', carrier_operation: 'A', phy_country: 'US', phy_state: 'CA',
  power_units: '12', total_drivers: '9', mcs150_date: '20240229', mcs150_mileage: '123456',
  mcs150_mileage_year: '2023', docket1prefix: 'MC', docket1: '123456', docket1_status_code: 'I', ...changes,
});
const bytes = (rows: unknown = [row()]) => Buffer.from(JSON.stringify(rows));
const parse = (rows: unknown = [row()], usdot = '80806') => parseCensusCandidateData(bytes(rows), request, usdot);
const optionalFields = CENSUS_FIELDS.filter((name) => !['dot_number', 'legal_name', 'business_org_desc', 'phy_country'].includes(name));

describe('FMCSA source-specific candidate adapter', () => {
  it('preserves all 15 source field names and raw values without admitting or resolving a Carrier', () => {
    const data = parse()!;
    expect(data.sourceRecordId).toBe('80806');
    expect(Object.keys(data.fields)).toEqual(CENSUS_FIELDS);
    for (const field of CENSUS_FIELDS) {
      expect(data.fields[field]).toMatchObject({ raw: row()[field], presence: 'PRESENT' });
      expect(Object.keys(data.fields[field])).toEqual(['raw', 'presence', 'value', 'unit', 'interpretation']);
    }
    expect(data.fields.legal_name.value).toBe('  Synthetic Census Corporation  ');
    expect(data.validTime).toEqual({ state: 'UNOBSERVED', from: null, to: null });
    expect(Object.keys(data)).toEqual(['sourceRecordId', 'fields', 'validTime']);
  });

  it('converts bounded source counts without inventing mileage units or temporal precision', () => {
    const data = parse()!;
    expect(data.fields.power_units).toMatchObject({ value: 12, unit: 'POWER_UNIT' });
    expect(data.fields.total_drivers).toMatchObject({ value: 9, unit: 'DRIVER' });
    expect(data.fields.mcs150_mileage).toMatchObject({ value: 123456, unit: null, interpretation: 'SOURCE_REPORTED_MILEAGE_UNIT_UNRESOLVED' });
    expect(data.fields.mcs150_date).toMatchObject({ raw: '20240229', value: '2024-02-29', unit: null, interpretation: 'SOURCE_FILING_DATE_ONLY' });
    expect(data.fields.mcs150_mileage_year).toMatchObject({ value: 2023, unit: null, interpretation: 'SOURCE_MILEAGE_CALENDAR_YEAR' });
    expect(JSON.stringify(data)).not.toContain('T00:00:00');
  });

  it.each(optionalFields)('distinguishes omitted and explicit-null %s without changing source observations', (name) => {
    const omitted = row(); delete omitted[name];
    const explicit = row({ [name]: null });
    expect(parseCensusBytes(bytes([omitted]), request)).toEqual(parseCensusBytes(bytes([explicit]), request));
    expect(parse([omitted])!.fields[name]).toEqual({ raw: null, presence: 'OMITTED', value: null, unit: null, interpretation: 'SOURCE_VALUE_UNAVAILABLE_WITHOUT_INFERRED_REASON' });
    expect(parse([explicit])!.fields[name]).toEqual({ raw: null, presence: 'EXPLICIT_NULL', value: null, unit: null, interpretation: 'SOURCE_VALUE_UNAVAILABLE_WITHOUT_INFERRED_REASON' });
  });

  it.each(['power_units', 'total_drivers', 'mcs150_mileage'] as const)('preserves present zero in %s', (name) => {
    expect(parse([row({ [name]: '0' })])!.fields[name]).toMatchObject({ raw: '0', presence: 'PRESENT', value: 0 });
  });

  it('keeps source year zero unresolved instead of a false date, absence, or invented year', () => {
    expect(parse([row({ mcs150_mileage_year: '0' })])!.fields.mcs150_mileage_year).toEqual({
      raw: '0', presence: 'PRESENT', value: null, unit: null, interpretation: 'SOURCE_ZERO_YEAR_UNRESOLVED',
    });
  });

  it.each(['dot_number', 'docket1'] as const)('retains the %s identifier as text', (name) => {
    expect(typeof parse()!.fields[name].value).toBe('string');
    expect(parse()!.fields[name].unit).toBeNull();
  });

  it('does not reinterpret a zero-valued docket as a quantity or canonical identity', () => {
    expect(parse([row({ docket1: '0' })])!.fields.docket1).toMatchObject({ raw: '0', value: '0', presence: 'PRESENT', interpretation: 'SOURCE_DOCKET_IDENTIFIER' });
  });

  it.each(['status_code', 'carrier_operation', 'docket1_status_code'] as const)('preserves %s without mapping source codes to authority', (name) => {
    expect(parse([row({ [name]: 'Z' })])!.fields[name]).toEqual({ raw: 'Z', presence: 'PRESENT', value: 'Z', unit: null, interpretation: 'SOURCE_CODE_UNINTERPRETED' });
  });

  it.each(['phy_country', 'phy_state'] as const)('keeps %s as a region code, not point geometry', (name) => {
    expect(parse()!.fields[name].interpretation).toBe('SOURCE_REGION_CODE_NOT_GEOMETRY');
    expect(JSON.stringify(parse())).not.toMatch(/latitude|longitude|coordinates|geometry/);
  });

  it('selects the exact source identity independent of row order and preserves input bytes/request', () => {
    const input = bytes([row({ dot_number: '99999999', legal_name: 'Other Synthetic Corp.' }), row()]);
    const original = Buffer.from(input); const originalRequest = structuredClone(request);
    expect(parseCensusCandidateData(input, request, '99999999')!.fields.legal_name.value).toBe('Other Synthetic Corp.');
    expect(input).toEqual(original); expect(request).toEqual(originalRequest);
  });

  it('returns null only for an originally requested identifier missing from a valid whole response', () => {
    expect(parse([], '80806')).toBeNull();
    expect(parse([row()], '99999999')).toBeNull();
  });

  it.each(['1', '080806', '80806 ', '', 80806, null, undefined])('refuses invalid/unrequested selection %s even for an empty response', (usdot) => {
    expect(() => parseCensusCandidateData(bytes([]), request, usdot as string)).toThrow('Select one exact USDOT');
  });

  it('validates the original request before accepting a selection', () => {
    expect(() => parseCensusCandidateData(bytes(), { ...request, sourceId: 'another' } as unknown as SourceCaptureRequest, '80806')).toThrow();
    expect(() => parseCensusCandidateData(bytes(), { ...request, usdot: ['80806', '80806'] }, '80806')).toThrow();
  });

  it('validates other rows before returning a selected candidate or a not-returned result', () => {
    const invalid = [row({ email_address: 'unexpected@example.invalid' })];
    expect(() => parse(invalid)).toThrow();
    expect(() => parse(invalid, '99999999')).toThrow();
  });

  it.each([
    ['leap date', { mcs150_date: '20230229' }], ['date zero', { mcs150_date: '0' }],
    ['date precision', { mcs150_date: '2024-02-29' }], ['year below range', { mcs150_mileage_year: '1899' }],
    ['quantity number', { power_units: 12 }], ['quantity negative', { total_drivers: '-1' }],
    ['quantity fraction', { mcs150_mileage: '1.2' }], ['quantity overflow', { mcs150_mileage: '1000000000000' }],
    ['out-of-scope country', { phy_country: 'CA' }], ['wrong organization', { business_org_desc: 'INDIVIDUAL' }],
    ['null required name', { legal_name: null }], ['unexpected field', { arbitrary: 'value' }],
  ])('inherits whole-response parser refusal for %s', (_name, changes) => {
    expect(() => parse([row(changes as Record<string, unknown>)])).toThrow();
  });

  it('converts maximum accepted numeric values without loss of integer precision', () => {
    const data = parse([row({ power_units: '99999999', total_drivers: '99999999', mcs150_mileage: '999999999999', mcs150_mileage_year: '9999' })])!;
    for (const name of ['power_units', 'total_drivers', 'mcs150_mileage', 'mcs150_mileage_year'] as const) {
      expect(Number.isSafeInteger(data.fields[name].value)).toBe(true);
      expect(String(data.fields[name].value)).toBe(data.fields[name].raw);
    }
  });

  it.each([
    ['duplicate rows', () => bytes([row(), row()])],
    ['duplicate escaped fields', () => Buffer.from('[{"dot_number":"80806","\\u0064ot_number":"80806"}]')],
    ['invalid UTF-8', () => Buffer.from([0xc3, 0x28])],
    ['malformed JSON', () => Buffer.from('{')],
    ['unexpected JSON object', () => bytes(row())],
    ['byte overflow', () => Buffer.alloc(CENSUS_MAX_BYTES + 1, 32)],
  ])('rejects %s before missingness recovery', (_name, input) => {
    expect(() => parseCensusCandidateData(input(), request, '80806')).toThrow();
  });

  it('accepts the parser byte boundary without relaxing it', () => {
    const input = bytes();
    const padded = Buffer.concat([input, Buffer.alloc(CENSUS_MAX_BYTES - input.length, 32)]);
    expect(parseCensusCandidateData(padded, request, '80806')!.sourceRecordId).toBe('80806');
  });

  it('rejects a Uint8Array instead of silently widening the existing Buffer contract', () => {
    expect(() => parseCensusCandidateData(new Uint8Array(bytes()) as Buffer, request, '80806')).toThrow();
  });

  it('returns independently mutable output without changing later derived values', () => {
    const first = parse()!; first.fields.legal_name.value = 'Changed only in memory'; first.validTime.from = null;
    expect(parse()!.fields.legal_name.value).toBe('  Synthetic Census Corporation  ');
  });

  it('deep-freezes the versioned descriptor and explicitly declares unresolved semantics and nonclaims', () => {
    const verifyFrozen = (value: unknown) => {
      if (value && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(verifyFrozen);
      }
    };
    verifyFrozen(CENSUS_NORMALIZATION_ADAPTER);
    expect(CENSUS_NORMALIZATION_ADAPTER).toMatchObject({
      id: 'fmcsa.company-census-observation/v1', version: '1.0.0', expectedMediaType: 'application/json',
      recordType: 'FMCSACompanyCensusObservation', identityResolution: false, canonicalAdmission: false,
      sourceTruthClaimed: false, fieldAccuracyClaimed: false, customerDistributionGranted: false,
    });
    expect(CENSUS_NORMALIZATION_ADAPTER.quantities.mcs150_mileage.unit).toBeNull();
  });
});
