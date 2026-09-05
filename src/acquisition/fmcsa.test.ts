import { describe, expect, it } from 'vitest';
import { SourceConnectorError } from './errors';
import {
  buildCensusUrl, CENSUS_FIELDS, CENSUS_MAX_BYTES, parseCensusBytes, parseSourceCaptureRequest,
  type SourceCaptureRequest,
} from './fmcsa';

function request(usdot = ['80806']): SourceCaptureRequest {
  return { schema: 'payload.source-capture-request.v1', requestId: 'qualification_1', sourceId: 'fmcsa-company-census', usdot };
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dot_number: '80806', legal_name: 'SYNTHETIC CENSUS CORPORATION', business_org_desc: 'CORPORATION', phy_country: 'US',
    ...overrides,
  };
}

function parse(rows: unknown = [row()], selected = request()) {
  return parseCensusBytes(Buffer.from(JSON.stringify(rows)), selected);
}

function expectCode(action: () => unknown, code: string, status = 502) {
  try { action(); } catch (error) {
    expect(error).toBeInstanceOf(SourceConnectorError);
    expect(error).toMatchObject({ code, status });
    return;
  }
  throw new Error('Expected the source boundary to reject the input.');
}

describe('closed Company Census requests', () => {
  it('sorts independent canonical identifiers numerically without changing caller input', () => {
    const input = request(['80806', '12', '3']);
    const result = parseSourceCaptureRequest(input);
    expect(result).toEqual(request(['3', '12', '80806']));
    expect(input.usdot).toEqual(['80806', '12', '3']);
    result.usdot.push('20');
    expect(input.usdot).toHaveLength(3);
  });

  it('accepts the maximum bounded selection and safe request ID characters', () => {
    const input = { ...request(Array.from({ length: 25 }, (_, index) => String(index + 1))), requestId: '_-A09'.repeat(16) };
    expect(parseSourceCaptureRequest(input)).toEqual(input);
  });

  it.each([
    null, [], 'request', {}, { ...request(), url: 'https://private.invalid' },
    { ...request(), schema: 'other' }, { ...request(), sourceId: 'fmcsa-qcmobile' },
    { ...request(), requestId: '' }, { ...request(), requestId: 'x'.repeat(81) },
    { ...request(), requestId: '../escape' }, { ...request(), requestId: 'namespace:id' },
    { ...request(), requestId: 'space id' }, { ...request(), requestId: 'é' },
    request([]), request(['1', '1']), request(['0']), request(['01']), request(['-1']),
    request(['1.0']), request(['1e2']), request([' 1']), request(['1 ']), request(['１２']),
    request(['100000000']), request(Array.from({ length: 26 }, (_, index) => String(index + 1))),
    { ...request(), usdot: [80806] }, { ...request(), usdot: '80806' },
  ])('rejects malformed or expansive input %#', (value) => {
    expectCode(() => parseSourceCaptureRequest(value), 'INVALID_REQUEST', 400);
  });

  it('rejects inherited, accessor and hidden extra request fields', () => {
    expectCode(() => parseSourceCaptureRequest(Object.create(request())), 'INVALID_REQUEST', 400);
    const accessor = { ...request() };
    Object.defineProperty(accessor, 'requestId', { get() { throw new Error('Must not invoke callers.'); } });
    expectCode(() => parseSourceCaptureRequest(accessor), 'INVALID_REQUEST', 400);
    const hidden = { ...request() };
    Object.defineProperty(hidden, 'hidden', { value: true });
    expectCode(() => parseSourceCaptureRequest(hidden), 'INVALID_REQUEST', 400);
    const symbol = { ...request(), [Symbol('extra')]: 'not JSON' };
    expectCode(() => parseSourceCaptureRequest(symbol), 'INVALID_REQUEST', 400);
  });

  it('builds only the code-owned endpoint and exactly four bounded query parameters', () => {
    const url = buildCensusUrl(request(['80806', '12']));
    expect(url.origin).toBe('https://data.transportation.gov');
    expect(url.pathname).toBe('/resource/az4n-8mr2.json');
    expect([...url.searchParams]).toEqual([
      ['$select', CENSUS_FIELDS.join(',')],
      ['$where', "dot_number in(12,80806) AND business_org_desc='CORPORATION' AND phy_country='US'"],
      ['$order', 'dot_number'], ['$limit', '2'],
    ]);
    expect(url.username + url.password + url.hash).toBe('');
    expect(CENSUS_FIELDS).toHaveLength(15);
    expect(CENSUS_FIELDS).not.toContain('email_address');
    expect(CENSUS_FIELDS).not.toContain('phy_street');
    expect(() => (CENSUS_FIELDS as unknown as string[]).push('phone')).toThrow();
  });

  it('revalidates requests passed directly into query or response parsers', () => {
    const invalid = { ...request(), usdot: ['1) OR 1=1'] };
    expectCode(() => buildCensusUrl(invalid), 'INVALID_REQUEST', 400);
    expectCode(() => parse([], invalid), 'INVALID_REQUEST', 400);
  });
});

describe('source-scoped Company Census observations', () => {
  it('preserves every selected provider field as source text, with unresolved identity', () => {
    const source = row({ status_code: 'A', carrier_operation: 'A', phy_state: 'AR', power_units: '25280', total_drivers: '24116',
      mcs150_date: '20250707', mcs150_mileage: '1629835251', mcs150_mileage_year: '2024',
      docket1prefix: 'MC', docket1: '135797', docket1_status_code: 'A' });
    expect(parse([source])).toEqual({
      schema: 'payload.fmcsa-census-observations.v1', sourceId: 'fmcsa-company-census',
      records: [{ ...source, identityStatus: 'UNRESOLVED', canonicalId: null }], notReturned: [],
    });
    expect(Object.keys(parse([source]).records[0])).toHaveLength(17);
    expect(parse([source]).records[0]).not.toHaveProperty('capturedAt');
    expect(parse([source]).records[0]).not.toHaveProperty('validTime');
  });

  it('makes absent optional fields explicit null, never invented zero values', () => {
    const record = parse().records[0];
    for (const field of CENSUS_FIELDS) expect(record).toHaveProperty(field);
    for (const field of CENSUS_FIELDS.filter((name) => !Object.hasOwn(row(), name))) expect(record[field]).toBeNull();
    expect(parse([row({ power_units: null, mcs150_date: null, docket1: null })]).records[0]).toEqual(record);
  });

  it('preserves explicitly reported zeroes, the mileage-year sentinel and untrimmed legal names', () => {
    const record = parse([row({ legal_name: '  SOURCE CORPORATION  ', power_units: '0', total_drivers: '0',
      mcs150_mileage: '0', mcs150_mileage_year: '0', docket1: '0' })]).records[0];
    expect(record).toMatchObject({ legal_name: '  SOURCE CORPORATION  ', power_units: '0', total_drivers: '0',
      mcs150_mileage: '0', mcs150_mileage_year: '0', docket1: '0' });
  });

  it('returns sorted observations and exact missing-query members, not nonexistence assertions', () => {
    const result = parse([row(), row({ dot_number: '3' })], request(['12', '80806', '3']));
    expect(result.records.map((record) => record.dot_number)).toEqual(['3', '80806']);
    expect(result.notReturned).toEqual(['12']);
    expect(parse([], request(['12', '3']))).toEqual({
      schema: 'payload.fmcsa-census-observations.v1', sourceId: 'fmcsa-company-census', records: [], notReturned: ['3', '12'],
    });
  });

  it.each([
    null, {}, '[]', [null], [[]], [80806], [row(), row()],
    [row({ dot_number: '999' })], [row({ dot_number: 80806 })], [row({ dot_number: '080806' })],
    [row({ business_org_desc: 'SOLE PROPRIETOR' })], [row({ business_org_desc: null })],
    [row({ phy_country: 'CA' })], [row({ phy_country: null })],
    [row({ legal_name: '' })], [row({ legal_name: '  ' })], [row({ legal_name: 'x'.repeat(301) })],
    [row({ legal_name: 'bad\nname' })], [row({ legal_name: 42 })], [row({ phone: 'PRIVATE_CONTACT' })],
    [row({ canonicalId: 'injected' })], [row({ identityStatus: 'VERIFIED' })],
  ])('rejects mismatched, expansive, or malformed provider rows %#', (value) => {
    expectCode(() => parse(value), 'SOURCE_SCHEMA_MISMATCH');
  });

  it('rejects duplicate USDOT rows even within the requested record-count cap', () => {
    expectCode(() => parse([row(), row()], request(['1', '80806'])), 'SOURCE_SCHEMA_MISMATCH');
  });

  it.each(['dot_number', 'legal_name', 'business_org_desc', 'phy_country'])('requires provider field %s', (field) => {
    const source = row();
    delete source[field];
    expectCode(() => parse([source]), 'SOURCE_SCHEMA_MISMATCH');
  });

  it.each([
    ['power_units', '-1'], ['power_units', '01'], ['power_units', '100000000'], ['power_units', 1],
    ['total_drivers', '1.5'], ['total_drivers', '1e3'], ['total_drivers', '1 '],
    ['mcs150_mileage', '1000000000000'], ['mcs150_mileage', ''], ['mcs150_mileage', {}],
    ['mcs150_mileage_year', '1'], ['mcs150_mileage_year', '1899'], ['mcs150_mileage_year', '10000'],
    ['docket1', '-1'], ['docket1', '100000000'], ['docket1prefix', 'XX'],
    ['phy_state', 'Arkansas'], ['phy_state', 'ar'], ['status_code', 'ACTIVE'],
    ['carrier_operation', 'a'], ['docket1_status_code', true],
  ])('rejects invalid bounded source value %s = %s', (field, value) => {
    expectCode(() => parse([row({ [field]: value })]), 'SOURCE_SCHEMA_MISMATCH');
  });

  it.each(['20240229', '20000229', '19000101', '99991231'])('accepts real source calendar date %s unchanged', (date) => {
    expect(parse([row({ mcs150_date: date })]).records[0].mcs150_date).toBe(date);
  });

  it.each(['20230229', '19000229', '20260431', '20260001', '20260100', '20261301', '18991231',
    '2026-01-01', '202601011', '0', '', 20260101])('rejects impossible or noncanonical source date %s', (date) => {
    expectCode(() => parse([row({ mcs150_date: date })]), 'SOURCE_SCHEMA_MISMATCH');
  });

  it('rejects invalid UTF-8 and non-buffer content before parsing', () => {
    expectCode(() => parseCensusBytes(Buffer.from([0x5b, 0xc0, 0xaf, 0x5d]), request()), 'SOURCE_INVALID_ENCODING');
    expectCode(() => parseCensusBytes('[]' as unknown as Buffer, request()), 'SOURCE_INVALID_ENCODING');
  });

  it.each(['', '[', 'null extra', '[{},]', '\ufeff[]'])('rejects malformed JSON or BOM %#', (json) => {
    expectCode(() => parseCensusBytes(Buffer.from(json), request()), 'SOURCE_INVALID_JSON');
  });

  it('enforces the byte limit before decoding and accepts a valid exact-limit document', () => {
    expectCode(() => parseCensusBytes(Buffer.alloc(CENSUS_MAX_BYTES + 1, 0xff), request()), 'SOURCE_BODY_TOO_LARGE');
    expect(parseCensusBytes(Buffer.from('[]' + ' '.repeat(CENSUS_MAX_BYTES - 2)), request()).records).toEqual([]);
  });

  it.each([
    '[{"dot_number":"80806","dot_number":"80806"}]',
    '[{"dot_number":"80806","dot_\\u006eumber":"80806"}]',
  ])('rejects duplicate keys including escaped equivalents %#', (json) => {
    expectCode(() => parseCensusBytes(Buffer.from(json), request()), 'SOURCE_INVALID_JSON');
  });

  it('does not confuse quoted punctuation or escaped quotes in source strings with duplicate keys', () => {
    const legal_name = 'CORPORATION "dot_number":{},[] \\ É';
    expect(parse([row({ legal_name })]).records[0].legal_name).toBe(legal_name);
  });

  it('uses fixed backend diagnostics, never source values or response bodies', () => {
    try { parse([row({ phone: 'PRIVATE_PHONE_DO_NOT_ECHO' })]); } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_PHONE_DO_NOT_ECHO');
      expect(error).toMatchObject({ code: 'SOURCE_SCHEMA_MISMATCH', status: 502 });
      return;
    }
    throw new Error('Expected closed-field rejection.');
  });
});
