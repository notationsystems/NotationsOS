import { describe, expect, it } from 'vitest';
import { CARRIER_ADAPTER, CarrierAdapterError, parseCarrierEvidence, type CarrierAdapterErrorCode } from './caravan-carrier-adapter';

const encode = (text: string) => new TextEncoder().encode(text);
const source = (changes: Record<string, unknown> = {}) => ({
  schema: 'caravan.carrier-source.v1', sourceRecordId: 'carrier:Example-001', legalName: '  Example Freight Ltd.  ',
  registrationNumber: '  0000123  ', operatingSite: '  Example Terminal A  ',
  validTime: { state: 'OBSERVED', from: '2026-09-05T12:30:00+02:30', to: '2026-09-06T10:00:00Z' }, ...changes,
});
const parse = (value: unknown) => parseCarrierEvidence(encode(JSON.stringify(value)));

function expectCode(run: () => unknown, code: CarrierAdapterErrorCode) {
  let failure: unknown;
  try { run(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(CarrierAdapterError);
  expect(failure).toMatchObject({ code });
}

describe('Caravan carrier JSON adapter', () => {
  it('parses captured bytes into an exact golden carrier candidate without identity inference', () => {
    const bytes = encode('{"schema":"caravan.carrier-source.v1","sourceRecordId":"carrier:Example-001","legalName":"  Example Freight Ltd.  ","registrationNumber":"  0000123  ","operatingSite":"  Example Terminal A  ","validTime":{"state":"OBSERVED","from":"2026-09-05T12:30:00+02:30","to":"2026-09-06T10:00:00Z"}}');
    const before = new Uint8Array(bytes);
    expect(parseCarrierEvidence(bytes)).toEqual({
      sourceRecordId: 'carrier:Example-001',
      fields: { legalName: 'Example Freight Ltd.', registrationNumber: '0000123', operatingSite: 'Example Terminal A' },
      missingFields: [], validTime: { state: 'OBSERVED', from: '2026-09-05T10:00:00.000Z', to: '2026-09-06T10:00:00.000Z' },
    });
    expect(bytes).toEqual(before);
  });

  it('omits only explicitly null optional fields and lists missing names in stable order', () => {
    expect(parse(source({ registrationNumber: null, operatingSite: null, validTime: { state: 'UNOBSERVED', from: null, to: null } }))).toEqual({
      sourceRecordId: 'carrier:Example-001', fields: { legalName: 'Example Freight Ltd.' },
      missingFields: ['operatingSite', 'registrationNumber'], validTime: { state: 'UNOBSERVED', from: null, to: null },
    });
    const partial = parse(source({ operatingSite: null }));
    expect(partial.fields).toEqual({ legalName: 'Example Freight Ltd.', registrationNumber: '0000123' });
    expect(partial.missingFields).toEqual(['operatingSite']);
  });

  it('preserves case, numeric text, Unicode and opaque source-local identifiers', () => {
    const candidate = parse(source({ sourceRecordId: '../carrier:ACME-01', legalName: '\n Éxample GmbH\t ', registrationNumber: '0', operatingSite: 'éxample Site' }));
    expect(candidate).toMatchObject({ sourceRecordId: '../carrier:ACME-01', fields: { legalName: 'Éxample GmbH', registrationNumber: '0', operatingSite: 'éxample Site' } });
  });

  it('allows observed open-ended and zero-duration intervals without inventing time', () => {
    expect(parse(source({ validTime: { state: 'OBSERVED', from: '2024-02-29T00:00:00.5Z', to: null } })).validTime).toEqual({ state: 'OBSERVED', from: '2024-02-29T00:00:00.500Z', to: null });
    expect(parse(source({ validTime: { state: 'OBSERVED', from: '2026-09-05T10:00:00Z', to: '2026-09-05T12:00:00+02:00' } })).validTime).toEqual({ state: 'OBSERVED', from: '2026-09-05T10:00:00.000Z', to: '2026-09-05T10:00:00.000Z' });
  });

  it('keeps the code-owned descriptor and all nested contracts immutable', () => {
    expect(CARRIER_ADAPTER).toMatchObject({ id: 'caravan.carrier-json/v1', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier', sourceSchema: 'caravan.carrier-source.v1', expectedMediaType: 'application/json' });
    expect(Object.isFrozen(CARRIER_ADAPTER)).toBe(true);
    expect(Object.isFrozen(CARRIER_ADAPTER.fields.legalName)).toBe(true);
    expect(Object.isFrozen(CARRIER_ADAPTER.requiredInputFields)).toBe(true);
    expect(() => Object.assign(CARRIER_ADAPTER.fields.legalName, { maximumCharacters: 999 })).toThrow();
  });

  it.each([
    null, [], 'text', source({ schema: 'caravan.carrier-source.v2' }),
    source({ unknown: 'drift' }), source({ domain: 'TRADEWIND' }),
  ])('rejects source schema or field-set drift', (value) => { expectCode(() => parse(value), 'SCHEMA_MISMATCH'); });

  it.each(['schema', 'sourceRecordId', 'legalName', 'registrationNumber', 'operatingSite', 'validTime'])('requires the declared %s key, even when its value can be null', (field) => {
    const value: Record<string, unknown> = source();
    delete value[field];
    expectCode(() => parse(value), 'SCHEMA_MISMATCH');
  });

  it.each([
    { sourceRecordId: '' }, { sourceRecordId: ' whitespace ' }, { sourceRecordId: 'x'.repeat(181) },
    { sourceRecordId: 12 }, { legalName: '' }, { legalName: ' \n ' }, { legalName: 'x'.repeat(301) },
    { legalName: null }, { legalName: 'Nul\u0000Name' }, { registrationNumber: 0 },
    { registrationNumber: '' }, { registrationNumber: 'x'.repeat(181) }, { operatingSite: false },
    { operatingSite: ' ' }, { operatingSite: 'x'.repeat(181) },
  ])('rejects invalid field values without coercion: %j', (changes) => { expectCode(() => parse(source(changes)), 'RECORD_CONTRACT_MISMATCH'); });

  it.each([
    null, {}, { state: 'UNOBSERVED', from: '2026-09-05T00:00:00Z', to: null },
    { state: 'UNOBSERVED', from: null, to: null, extra: true },
    { state: 'UNKNOWN', from: null, to: null }, { state: 'OBSERVED', from: null, to: null },
    { state: 'OBSERVED', from: '2026-02-29T00:00:00Z', to: null },
    { state: 'OBSERVED', from: '2026-09-05T12:00:00', to: null },
    { state: 'OBSERVED', from: 'September 5, 2026', to: null },
    { state: 'OBSERVED', from: '2026-09-05T12:00:00Z', to: '2026-09-05T11:00:00Z' },
  ])('rejects invalid or contradictory valid time: %j', (validTime) => { expectCode(() => parse(source({ validTime })), 'RECORD_CONTRACT_MISMATCH'); });

  it.each(['', '{broken', '{"schema":NaN}', '{"schema":"x",}', 'undefined'])('reports invalid JSON without returning parser/source details', (text) => {
    expectCode(() => parseCarrierEvidence(encode(text)), 'INVALID_SOURCE_JSON');
  });

  it('rejects duplicate object keys, including escaped equivalents and nested time keys', () => {
    const original = JSON.stringify(source());
    expectCode(() => parseCarrierEvidence(encode(original.replace('"schema":', '"schema":"discarded","schema":'))), 'INVALID_SOURCE_JSON');
    expectCode(() => parseCarrierEvidence(encode(original.replace('"legalName":', '"legalName":"discarded","legal\\u004eame":'))), 'INVALID_SOURCE_JSON');
    expectCode(() => parseCarrierEvidence(encode(original.replace('"state":', '"state":"discarded","state":'))), 'INVALID_SOURCE_JSON');
  });

  it('does not mistake escaped quotes, braces or commas in string values for duplicate keys', () => {
    const legalName = 'Carrier {"legalName":"legalName"}, [Site] \\ Office';
    expect(parse(source({ legalName })).fields.legalName).toBe(legalName);
  });

  it('decodes UTF-8 strictly and bounds bytes before decoding or JSON parsing', () => {
    expectCode(() => parseCarrierEvidence(new Uint8Array([0xc3, 0x28])), 'INVALID_SOURCE_ENCODING');
    expectCode(() => parseCarrierEvidence(new Uint8Array([0xe2, 0x82])), 'INVALID_SOURCE_ENCODING');
    expectCode(() => parseCarrierEvidence('not bytes' as unknown as Uint8Array), 'INVALID_SOURCE_ENCODING');
    expectCode(() => parseCarrierEvidence(new Uint8Array(CARRIER_ADAPTER.maximumSourceBytes + 1)), 'SOURCE_TOO_LARGE');
    const json = JSON.stringify(source());
    const padded = json + ' '.repeat(CARRIER_ADAPTER.maximumSourceBytes - encode(json).length);
    expect(parseCarrierEvidence(encode(padded)).sourceRecordId).toBe('carrier:Example-001');
  });

  it('does not place source field contents into error messages', () => {
    const secret = 'sensitive-source-value';
    let error: unknown;
    try { parse(source({ legalName: { nested: secret } })); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(CarrierAdapterError);
    expect((error as Error).message).not.toContain(secret);
  });
});
