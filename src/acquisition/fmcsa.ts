import { SourceConnectorError } from './errors';

export const CENSUS_FIELDS = Object.freeze([
  'dot_number', 'legal_name', 'business_org_desc', 'status_code', 'carrier_operation',
  'phy_country', 'phy_state', 'power_units', 'total_drivers', 'mcs150_date',
  'mcs150_mileage', 'mcs150_mileage_year', 'docket1prefix', 'docket1', 'docket1_status_code',
] as const);
export const CENSUS_MAX_BYTES = 256 * 1024;

export interface SourceCaptureRequest {
  schema: 'payload.source-capture-request.v1';
  requestId: string;
  sourceId: 'fmcsa-company-census';
  usdot: string[];
}

export type CensusSourceRecord = Record<typeof CENSUS_FIELDS[number], string | null> & {
  dot_number: string;
  legal_name: string;
  business_org_desc: 'CORPORATION';
  phy_country: 'US';
  identityStatus: 'UNRESOLVED';
  canonicalId: null;
};

export interface CensusObservations {
  schema: 'payload.fmcsa-census-observations.v1';
  sourceId: 'fmcsa-company-census';
  records: CensusSourceRecord[];
  /** Not returned by this bounded, corporate-only query; not proof of nonexistence. */
  notReturned: string[];
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function invalidRequest(): never {
  throw new SourceConnectorError('INVALID_REQUEST', 'Provide an exact source capture request and 1 to 25 unique USDOT identifiers.');
}

function invalidSource(): never {
  throw new SourceConnectorError('SOURCE_SCHEMA_MISMATCH', 'The source response does not match the bounded company census contract.', 502);
}

/** Closed command: callers cannot select hosts, queries, contacts, clocks, or canonical identities. */
export function parseSourceCaptureRequest(value: unknown): SourceCaptureRequest {
  const fields = ['schema', 'requestId', 'sourceId', 'usdot'];
  if (!plainRecord(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, field)!, 'value'))) invalidRequest();
  if (value.schema !== 'payload.source-capture-request.v1' || value.sourceId !== 'fmcsa-company-census'
    || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.requestId)
    || !Array.isArray(value.usdot) || value.usdot.length < 1 || value.usdot.length > 25) invalidRequest();
  const usdot: string[] = [];
  for (const item of value.usdot) {
    if (typeof item !== 'string' || !/^[1-9][0-9]{0,7}$/.test(item)) invalidRequest();
    usdot.push(item);
  }
  if (new Set(usdot).size !== usdot.length) invalidRequest();
  return {
    schema: 'payload.source-capture-request.v1', requestId: value.requestId,
    sourceId: 'fmcsa-company-census', usdot: usdot.sort((left, right) => Number(left) - Number(right)),
  };
}

/** The distinct public Company Census dataset is not a replacement identity for QCMobile. */
export function buildCensusUrl(request: SourceCaptureRequest): URL {
  const selected = parseSourceCaptureRequest(request);
  const url = new URL('https://data.transportation.gov/resource/az4n-8mr2.json');
  url.searchParams.set('$select', CENSUS_FIELDS.join(','));
  url.searchParams.set('$where', `dot_number in(${selected.usdot.join(',')}) AND business_org_desc='CORPORATION' AND phy_country='US'`);
  url.searchParams.set('$order', 'dot_number');
  url.searchParams.set('$limit', String(selected.usdot.length));
  return url;
}

/** Syntax is checked by JSON.parse first; scan decoded keys to reject escaped duplicate names. */
function rejectDuplicateKeys(json: string): void {
  const stack: Array<{ kind: 'array' } | { kind: 'object'; keys: Set<string>; expectingKey: boolean }> = [];
  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (character === '{') stack.push({ kind: 'object', keys: new Set(), expectingKey: true });
    else if (character === '[') stack.push({ kind: 'array' });
    else if (character === '}' || character === ']') stack.pop();
    else if (character === ',') {
      const current = stack.at(-1);
      if (current?.kind === 'object') current.expectingKey = true;
    } else if (character === '"') {
      const start = index;
      for (index++; index < json.length; index++) {
        if (json[index] === '\\') index++;
        else if (json[index] === '"') break;
      }
      const current = stack.at(-1);
      if (current?.kind === 'object' && current.expectingKey) {
        const key = JSON.parse(json.slice(start, index + 1)) as string;
        if (current.keys.has(key)) throw new SourceConnectorError('SOURCE_INVALID_JSON', 'Duplicate source JSON keys are not permitted.', 502);
        current.keys.add(key);
        current.expectingKey = false;
      }
    }
  }
}

function optionalField(record: Record<string, unknown>, field: typeof CENSUS_FIELDS[number], pattern: RegExp): string | null {
  if (!Object.hasOwn(record, field) || record[field] === null) return null;
  const value = record[field];
  if (typeof value !== 'string' || !pattern.test(value)) invalidSource();
  return value;
}

function sourceFilingDate(record: Record<string, unknown>): string | null {
  const value = optionalField(record, 'mcs150_date', /^[1-9][0-9]{7}$/);
  if (value === null) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) invalidSource();
  return value; // Source filing date only: never promote this to capture time or canonical valid time.
}

function parseRow(value: unknown, requested: Set<string>): CensusSourceRecord {
  if (!plainRecord(value) || Object.keys(value).some((field) => !CENSUS_FIELDS.includes(field as typeof CENSUS_FIELDS[number]))
    || typeof value.dot_number !== 'string' || !requested.has(value.dot_number)
    || value.business_org_desc !== 'CORPORATION' || value.phy_country !== 'US'
    || typeof value.legal_name !== 'string' || !value.legal_name.trim() || value.legal_name.length > 300
    || /[\u0000-\u001f\u007f]/.test(value.legal_name)) invalidSource();
  const mileageYear = optionalField(value, 'mcs150_mileage_year', /^(?:0|[1-9][0-9]{3})$/);
  if (mileageYear !== null && mileageYear !== '0' && Number(mileageYear) < 1900) invalidSource();
  return {
    dot_number: value.dot_number, legal_name: value.legal_name,
    business_org_desc: 'CORPORATION', phy_country: 'US',
    status_code: optionalField(value, 'status_code', /^[A-Z]$/),
    carrier_operation: optionalField(value, 'carrier_operation', /^[A-Z]$/),
    phy_state: optionalField(value, 'phy_state', /^[A-Z]{2}$/),
    power_units: optionalField(value, 'power_units', /^(?:0|[1-9][0-9]{0,7})$/),
    total_drivers: optionalField(value, 'total_drivers', /^(?:0|[1-9][0-9]{0,7})$/),
    mcs150_date: sourceFilingDate(value),
    mcs150_mileage: optionalField(value, 'mcs150_mileage', /^(?:0|[1-9][0-9]{0,11})$/),
    mcs150_mileage_year: mileageYear,
    docket1prefix: optionalField(value, 'docket1prefix', /^(?:MC|MX|FF)$/),
    docket1: optionalField(value, 'docket1', /^(?:0|[1-9][0-9]{0,7})$/),
    docket1_status_code: optionalField(value, 'docket1_status_code', /^[A-Z]$/),
    identityStatus: 'UNRESOLVED', canonicalId: null,
  };
}

/** Pure, source-scoped observations. No identity resolution, normalization, admission, or network access. */
export function parseCensusBytes(bytes: Buffer, request: SourceCaptureRequest): CensusObservations {
  const selected = parseSourceCaptureRequest(request);
  if (!Buffer.isBuffer(bytes)) throw new SourceConnectorError('SOURCE_INVALID_ENCODING', 'The source response must be UTF-8 bytes.', 502);
  if (bytes.byteLength > CENSUS_MAX_BYTES) throw new SourceConnectorError('SOURCE_BODY_TOO_LARGE', 'The source response exceeds the byte limit.', 502);
  let json: string;
  try { json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new SourceConnectorError('SOURCE_INVALID_ENCODING', 'The source response contains invalid UTF-8.', 502); }
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new SourceConnectorError('SOURCE_INVALID_JSON', 'The source response must be valid JSON.', 502); }
  rejectDuplicateKeys(json);
  if (!Array.isArray(value) || value.length > selected.usdot.length) invalidSource();
  const requested = new Set(selected.usdot);
  const records = value.map((row) => parseRow(row, requested));
  const returned = new Set(records.map((record) => record.dot_number));
  if (returned.size !== records.length) invalidSource();
  records.sort((left, right) => Number(left.dot_number) - Number(right.dot_number));
  return {
    schema: 'payload.fmcsa-census-observations.v1', sourceId: 'fmcsa-company-census', records,
    notReturned: selected.usdot.filter((id) => !returned.has(id)),
  };
}
