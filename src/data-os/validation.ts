/** Runtime checks for local declared-policy and evidence compatibility records. */
export function requireRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${field} must be a plain object.`);
  }
}

export function requireText(value: unknown, field: string, maximum = 512): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${field} must be non-empty text of at most ${maximum} characters without control characters.`);
  }
  return value;
}

export function requireIdentifier(value: unknown, field: string): string {
  const text = requireText(value, field);
  if (text.trim() !== text || /\s/.test(text)) throw new Error(`${field} must be an identifier without whitespace.`);
  return text;
}

/** Explicit timezone, millisecond precision, and a real calendar date; no Date.parse rollover. */
export function parseISOInstant(value: unknown, field: string): number {
  if (typeof value !== 'string') throw new Error(`${field} must be an ISO 8601 instant with an explicit timezone.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new Error(`${field} must be an ISO 8601 instant with an explicit timezone.`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 ||
      (match[8] !== 'Z' && (Number(match[10]) > 23 || Number(match[11]) > 59))) {
    throw new Error(`${field} must be a real ISO 8601 calendar instant.`);
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new Error(`${field} must be a valid ISO 8601 instant.`);
  return instant;
}
