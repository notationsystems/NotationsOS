import { parseISOInstant, requireIdentifier, requireText } from './validation';

export type CarrierAdapterErrorCode =
  | 'INVALID_SOURCE_ENCODING'
  | 'INVALID_SOURCE_JSON'
  | 'SCHEMA_MISMATCH'
  | 'RECORD_CONTRACT_MISMATCH'
  | 'SOURCE_TOO_LARGE';

export class CarrierAdapterError extends Error {
  constructor(public readonly code: CarrierAdapterErrorCode, message: string) {
    super(message);
    this.name = 'CarrierAdapterError';
  }
}

export interface CarrierCandidateData {
  sourceRecordId: string;
  fields: { legalName: string; registrationNumber?: string; operatingSite?: string };
  missingFields: string[];
  validTime:
    | { state: 'UNOBSERVED'; from: null; to: null }
    | { state: 'OBSERVED'; from: string; to: string | null };
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

/** Local deterministic parser contract; the caller binds it to one acquired source. */
export const CARRIER_ADAPTER = freeze({
  id: 'caravan.carrier-json/v1',
  version: '1.0.0',
  domain: 'CARAVAN',
  recordType: 'Carrier',
  sourceSchema: 'caravan.carrier-source.v1',
  expectedMediaType: 'application/json',
  sourceEncoding: 'UTF-8',
  maximumSourceBytes: 64 * 1024,
  duplicateObjectKeys: 'REJECT',
  unknownFields: 'REJECT',
  requiredInputFields: ['schema', 'sourceRecordId', 'legalName', 'registrationNumber', 'operatingSite', 'validTime'],
  sourceRecordId: { maximumCharacters: 180, normalization: 'NONE', semantics: 'OPAQUE_SOURCE_IDENTIFIER_WITHOUT_WHITESPACE' },
  fields: {
    legalName: { type: 'NONEMPTY_TEXT', maximumCharacters: 300, normalization: 'TRIM_ONLY' },
    registrationNumber: { type: 'NONEMPTY_TEXT_OR_NULL', maximumCharacters: 180, normalization: 'TRIM_ONLY' },
    operatingSite: { type: 'NONEMPTY_TEXT_OR_NULL', maximumCharacters: 180, normalization: 'TRIM_ONLY' },
  },
  missingness: { input: 'EXPLICIT_NULL_ONLY', output: 'OMIT_FIELD_AND_LIST_NAME', ordering: 'UTF16_LEXICAL' },
  validTime: {
    requiredFields: ['state', 'from', 'to'],
    unobserved: { state: 'UNOBSERVED', from: null, to: null },
    observed: { from: 'REQUIRED_ISO_INSTANT', to: 'ISO_INSTANT_OR_NULL', order: 'FROM_LESS_THAN_OR_EQUAL_TO' },
    normalization: 'UTC_ISO_MILLISECONDS',
  },
  knowledgeTime: 'ASSIGNED_BY_NORMALIZATION_RUN_AFTER_EVIDENCE_STORAGE',
  identityResolution: false,
  sourceTruthClaimed: false,
  fieldAccuracyClaimed: false,
} as const);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** JSON.parse validates syntax first; this iterative pass detects even escaped duplicate keys. */
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
        const key: string = JSON.parse(json.slice(start, index + 1));
        if (current.keys.has(key)) {
          throw new CarrierAdapterError('INVALID_SOURCE_JSON', 'Carrier source JSON contains duplicate object keys.');
        }
        current.keys.add(key);
        current.expectingKey = false;
      }
    }
  }
}

function fieldText(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new Error('Expected text.');
  return requireText(value.trim(), 'carrier field', maximum);
}

function validTime(value: unknown): CarrierCandidateData['validTime'] {
  if (!record(value) || !exactKeys(value, ['state', 'from', 'to'])) throw new Error('Invalid valid-time contract.');
  if (value.state === 'UNOBSERVED') {
    if (value.from !== null || value.to !== null) throw new Error('Invalid unobserved time.');
    return { state: 'UNOBSERVED', from: null, to: null };
  }
  if (value.state !== 'OBSERVED') throw new Error('Unknown valid-time state.');
  const from = parseISOInstant(value.from, 'validTime.from');
  const to = value.to === null ? null : parseISOInstant(value.to, 'validTime.to');
  if (to !== null && to < from) throw new Error('Reversed valid-time interval.');
  return { state: 'OBSERVED', from: new Date(from).toISOString(), to: to === null ? null : new Date(to).toISOString() };
}

/** Parse one exact carrier JSON record from captured bytes; performs no I/O or policy evaluation. */
export function parseCarrierEvidence(bytes: Uint8Array): CarrierCandidateData {
  if (!(bytes instanceof Uint8Array)) throw new CarrierAdapterError('INVALID_SOURCE_ENCODING', 'Carrier source must be UTF-8 bytes.');
  if (bytes.byteLength > CARRIER_ADAPTER.maximumSourceBytes) throw new CarrierAdapterError('SOURCE_TOO_LARGE', 'Carrier source exceeds 64 KiB.');
  let json: string;
  try { json = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CarrierAdapterError('INVALID_SOURCE_ENCODING', 'Carrier source contains invalid UTF-8.'); }
  let source: unknown;
  try { source = JSON.parse(json); }
  catch { throw new CarrierAdapterError('INVALID_SOURCE_JSON', 'Carrier source must be valid JSON.'); }
  rejectDuplicateKeys(json);
  if (!record(source) || source.schema !== CARRIER_ADAPTER.sourceSchema || !exactKeys(source, CARRIER_ADAPTER.requiredInputFields)) {
    throw new CarrierAdapterError('SCHEMA_MISMATCH', 'Carrier source does not match the declared schema and exact field set.');
  }
  try {
    requireIdentifier(source.sourceRecordId, 'sourceRecordId');
    if ((source.sourceRecordId as string).length > CARRIER_ADAPTER.sourceRecordId.maximumCharacters) throw new Error('Identifier exceeds its limit.');
    const fields: CarrierCandidateData['fields'] = { legalName: fieldText(source.legalName, 300) };
    const missingFields: string[] = [];
    for (const name of ['registrationNumber', 'operatingSite'] as const) {
      if (source[name] === null) missingFields.push(name);
      else fields[name] = fieldText(source[name], 180);
    }
    return { sourceRecordId: source.sourceRecordId as string, fields, missingFields: missingFields.sort(), validTime: validTime(source.validTime) };
  } catch {
    throw new CarrierAdapterError('RECORD_CONTRACT_MISMATCH', 'Carrier source fields or valid-time values violate the declared record contract.');
  }
}
