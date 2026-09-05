import { createHash } from 'node:crypto';
import { requireRecord } from './validation';

const DEFAULT_RECORD_BYTES = 64 * 1024;

export function exactFields(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  requireRecord(value, 'record');
  const record = value as Record<string, unknown>;
  if (required.some((key) => !Object.hasOwn(record, key)) || Object.keys(record).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error(`Expected only these fields: ${[...required, ...optional].join(', ')}.`);
  }
}

// Preserve the existing local acquisition encoding byte-for-byte. This is a
// versioned local JSON encoding, not the Kernel canonical object grammar.
export function localJson(value: unknown, depth = 0): string {
  if (depth > 20) throw new Error('Intake metadata is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => localJson(entry, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${localJson((value as Record<string, unknown>)[key], depth + 1)}`).join(',')}}`;
  }
  throw new Error('Intake metadata must contain plain, finite JSON values.');
}

export function encodeLocalRecord(value: unknown, maxBytes = DEFAULT_RECORD_BYTES): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer.');
  const bytes = Buffer.from(localJson(value), 'utf8');
  if (bytes.length > maxBytes) {
    throw new Error(maxBytes === DEFAULT_RECORD_BYTES ? 'Intake metadata exceeds 64 KiB.' : `Local metadata exceeds ${maxBytes} bytes.`);
  }
  return bytes;
}

export function localRecordDigest(value: unknown, maxBytes = DEFAULT_RECORD_BYTES): string {
  return `sha256:${createHash('sha256').update(encodeLocalRecord(value, maxBytes)).digest('hex')}`;
}
