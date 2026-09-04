/**
 * Formatting helpers. Every time is rendered in UTC with an explicit clock
 * label supplied by the caller; this module never invents a label like
 * "Updated" or "Date".
 */

import type { ISODateTime } from '@/domain/types';

/** "2026-08-29 09:30 UTC" — unambiguous, sortable, printable. */
export function fmtUtc(iso: ISODateTime | undefined, opts: { seconds?: boolean } = {}): string {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return `${opts.seconds ? `${base}:${p(d.getUTCSeconds())}` : base} UTC`;
}

/** "2026-08-29" */
export function fmtUtcDate(iso: ISODateTime | undefined): string {
  if (!iso) return 'Not recorded';
  return iso.slice(0, 10);
}

/** Relative duration between two instants, signed, coarse. */
export function fmtDelta(from: ISODateTime, to: ISODateTime): string {
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms)) return '';
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  const label = min >= 1440 ? `${Math.round(min / 1440)} d` : min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`;
  return ms >= 0 ? `in ${label}` : `${label} ago`;
}

/** First and last 6 hex chars with a middle ellipsis; full value stays in the title attribute at the call site. */
export function shortHash(h: string | undefined, head = 8, tail = 6): string {
  if (!h) return 'Not recorded';
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function fmtNumber(v: string | number | undefined, unit?: string): string {
  if (v === undefined || v === null || v === '') return 'Not recorded';
  const s = typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 4 }) : v;
  return unit ? `${s} ${unit}` : s;
}

export function humanize(code: string): string {
  return code.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtTolerance(t: { kind: string; value?: number; unit?: string; interval?: [number, number] } | undefined): string {
  if (!t) return 'Not declared';
  switch (t.kind) {
    case 'ABSOLUTE': return `± ${t.value ?? '?'} ${t.unit ?? ''}`.trim();
    case 'RELATIVE': return `± ${t.value ?? '?'}%`;
    case 'INTERVAL': return t.interval ? `[${t.interval[0]}, ${t.interval[1]}] ${t.unit ?? ''}`.trim() : 'Interval not declared';
    case 'PROFILE_DEFINED': return 'Profile-defined';
    default: return t.kind;
  }
}
