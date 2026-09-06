import { parseReplayJson } from '../observation/json';
import type { SamsaraHistoryQuery } from './samsara-http';

export const SAMSARA_GPS_MAX_BYTES = 256 * 1024;
export const SAMSARA_GPS_MAX_POINTS = 1000;
/** Local parser bound, not a Samsara hardware specification or accuracy claim. */
export const SAMSARA_GPS_MAX_SPEED_MPH = 1000;

export interface SamsaraGpsObservation {
  vehicleId: string;
  sourceTime: string;
  timeNs: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  speedMph: number | null;
  speedSource: 'ECU' | 'GPS' | 'UNKNOWN';
  headingDegrees: number | null;
  rawGpsIndex: number;
  identityStatus: 'UNRESOLVED';
  canonicalId: null;
  positioningAccuracy: 'NOT_PROVIDED';
  rtkStatus: 'NOT_PROVIDED';
}

export interface SamsaraGpsObservations {
  schema: 'payload.samsara-gps-observations.v1';
  observations: SamsaraGpsObservation[];
  pagination: { endCursor: string; hasNextPage: boolean };
  coverage: 'PARTIAL_PAGE' | 'SINGLE_PAGE_ONLY';
  availability: 'OBSERVATIONS_RETURNED' | 'NOT_RETURNED';
}

const INVALID = 'SAMSARA_GPS_INVALID_RESPONSE';
const SCHEMA_CHANGED = 'SAMSARA_GPS_SCHEMA_CHANGED';
const QUERY_FIELDS = ['region', 'vehicleId', 'startTime', 'endTime'];
const ROOT_FIELDS = ['data', 'pagination'];
const PAGE_FIELDS = ['endCursor', 'hasNextPage'];
const VEHICLE_FIELDS = ['id', 'name', 'externalIds', 'gps'];
const GPS_FIELDS = ['time', 'latitude', 'longitude', 'headingDegrees', 'speedMilesPerHour', 'isEcuSpeed', 'address', 'reverseGeo'];

function fail(): never { throw new Error(INVALID); }

function object(value: unknown, allowed?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) fail();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
    if (allowed && !allowed.includes(key)) throw new Error(SCHEMA_CHANGED);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail();
  return value;
}

/** Exact RFC 3339 instant; no millisecond rounding, rollover, leap-second or unknown-offset guessing. */
function timeNs(value: unknown): bigint {
  if (typeof value !== 'string') fail();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) fail();
  const [, date, hour, minute, second, fraction = '', offset] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || offset === '-00:00') fail();
  const wallTime = `${date}T${hour}:${minute}:${second}.000Z`;
  const wallMs = Date.parse(wallTime);
  if (!Number.isFinite(wallMs) || new Date(wallMs).toISOString() !== wallTime) fail();
  let offsetMinutes = 0;
  if (offset !== 'Z') {
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.slice(4, 6));
    if (hours > 23 || minutes > 59) fail();
    offsetMinutes = (hours * 60 + minutes) * (offset[0] === '+' ? 1 : -1);
  }
  return BigInt(wallMs - offsetMinutes * 60_000) * BigInt(1_000_000) + BigInt(fraction.padEnd(9, '0') || '0');
}

function queryBounds(query: SamsaraHistoryQuery): { vehicleId: string; start: bigint; end: bigint } {
  try {
    const value = object(query, QUERY_FIELDS);
    if (Object.keys(value).length !== QUERY_FIELDS.length
      || !['US', 'EU', 'CA'].includes(value.region as string)
      || typeof value.vehicleId !== 'string' || !/^[1-9]\d{0,31}$/.test(value.vehicleId)
      || typeof value.startTime !== 'string' || typeof value.endTime !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.startTime)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.endTime)) fail();
    const start = timeNs(value.startTime);
    const end = timeNs(value.endTime);
    if (end <= start || end - start > BigInt(900_000_000_000)) fail();
    return { vehicleId: value.vehicleId, start, end };
  } catch { throw new Error('SAMSARA_GPS_INVALID_QUERY'); }
}

/** These contextual source labels stay in retained bytes; they are not facility or vehicle identity decisions. */
function validateContext(value: Record<string, unknown>): void {
  if (Object.hasOwn(value, 'name') && !text(value.name, 256)) fail();
  if (Object.hasOwn(value, 'externalIds')) {
    const externalIds = object(value.externalIds);
    if (Object.keys(externalIds).length > 64) fail();
    for (const [key, id] of Object.entries(externalIds)) if (!text(key, 128) || !text(id, 512)) fail();
  }
}

function validateAddress(value: Record<string, unknown>): void {
  if (Object.hasOwn(value, 'address')) {
    const address = object(value.address, ['id', 'name']);
    if (Object.hasOwn(address, 'id') && !text(address.id, 256)) fail();
    if (Object.hasOwn(address, 'name') && !text(address.name, 512)) fail();
  }
  if (Object.hasOwn(value, 'reverseGeo')) {
    const reverseGeo = object(value.reverseGeo, ['formattedLocation']);
    if (Object.hasOwn(reverseGeo, 'formattedLocation') && !text(reverseGeo.formattedLocation, 2048)) fail();
  }
}

/**
 * BEFORE retaining private provider bytes, prove their inspectable vehicle/time/field scope.
 * This is not GPS validation: bounded malformed measurement scalars may be preserved for
 * quarantine, but other vehicles, unknown fields, hidden structures and unbounded timestamps may not.
 */
export function assertSamsaraRetentionScope(bytes: Buffer, query: SamsaraHistoryQuery): void {
  try {
    const bounds = queryBounds(query);
    if (!Buffer.isBuffer(bytes)) fail();
    const root = object(parseReplayJson(bytes, SAMSARA_GPS_MAX_BYTES), ROOT_FIELDS);
    if (!Array.isArray(root.data) || root.data.length > 1) fail();
    const page = object(root.pagination, PAGE_FIELDS);
    // Pagination is provider metadata, but opaque cursor values must still be bounded scalar strings.
    if (typeof page.endCursor !== 'string' || page.endCursor.length > 2048 || !/^[\x20-\x7e]*$/.test(page.endCursor)
      || typeof page.hasNextPage !== 'boolean' || (page.hasNextPage && !page.endCursor.length)) fail();
    if (!root.data.length) return;
    const vehicle = object(root.data[0], VEHICLE_FIELDS);
    if (vehicle.id !== bounds.vehicleId) fail();
    validateContext(vehicle);
    if (!Object.hasOwn(vehicle, 'gps')) return;
    if (!Array.isArray(vehicle.gps) || vehicle.gps.length > SAMSARA_GPS_MAX_POINTS) fail();
    for (const value of vehicle.gps) {
      const gps = object(value, GPS_FIELDS);
      const instant = timeNs(gps.time);
      if (instant < bounds.start || instant > bounds.end) fail();
      validateAddress(gps);
      for (const key of ['latitude', 'longitude', 'headingDegrees', 'speedMilesPerHour', 'isEcuSpeed']) {
        if (!Object.hasOwn(gps, key)) continue;
        const scalar = gps[key];
        if (scalar === null || typeof scalar === 'boolean') continue;
        if (typeof scalar === 'number' && Number.isFinite(scalar)) continue;
        if (text(scalar, 128)) continue;
        fail(); // Never retain nested private content disguised as a malformed measurement.
      }
    }
  } catch { throw new Error('SAMSARA_GPS_RETENTION_SCOPE_INVALID'); }
}

/** One preserved GPS history page, never an assertion of fleet/window completeness or an admitted position. */
export function parseSamsaraGpsBytes(bytes: Buffer, query: SamsaraHistoryQuery): SamsaraGpsObservations {
  const bounds = queryBounds(query);
  let parsed: unknown;
  try {
    if (!Buffer.isBuffer(bytes)) throw new Error('BYTES_REQUIRED');
    parsed = parseReplayJson(bytes, SAMSARA_GPS_MAX_BYTES);
  } catch { throw new Error('SAMSARA_GPS_INVALID_JSON'); }
  const root = object(parsed, ROOT_FIELDS);
  if (!Array.isArray(root.data) || root.data.length > 1) fail();
  const page = object(root.pagination, PAGE_FIELDS);
  if (typeof page.endCursor !== 'string' || page.endCursor.length > 2048
    || !/^[\x20-\x7e]*$/.test(page.endCursor) || typeof page.hasNextPage !== 'boolean'
    || (page.hasNextPage && !page.endCursor.length)) fail();
  const observations: SamsaraGpsObservation[] = [];
  if (root.data.length) {
    const vehicle = object(root.data[0], VEHICLE_FIELDS);
    if (vehicle.id !== bounds.vehicleId) fail();
    validateContext(vehicle);
    if (Object.hasOwn(vehicle, 'gps')) {
      if (!Array.isArray(vehicle.gps) || vehicle.gps.length > SAMSARA_GPS_MAX_POINTS) fail();
      for (let rawGpsIndex = 0; rawGpsIndex < vehicle.gps.length; rawGpsIndex++) {
        const gps = object(vehicle.gps[rawGpsIndex], GPS_FIELDS);
        const instant = timeNs(gps.time);
        // Provider inclusion semantics are not asserted; both declared endpoints are accepted.
        if (instant < bounds.start || instant > bounds.end) fail();
        const latitudeDegrees = boundedNumber(gps.latitude, -90, 90);
        const longitudeDegrees = boundedNumber(gps.longitude, -180, 180);
        const speedMph = Object.hasOwn(gps, 'speedMilesPerHour')
          ? boundedNumber(gps.speedMilesPerHour, 0, SAMSARA_GPS_MAX_SPEED_MPH) : null;
        const headingDegrees = Object.hasOwn(gps, 'headingDegrees') ? boundedNumber(gps.headingDegrees, 0, 360) : null;
        if (Object.hasOwn(gps, 'isEcuSpeed') && typeof gps.isEcuSpeed !== 'boolean') fail();
        validateAddress(gps);
        observations.push({
          vehicleId: bounds.vehicleId, sourceTime: gps.time as string, timeNs: instant.toString(),
          latitudeDegrees, longitudeDegrees, speedMph,
          speedSource: gps.isEcuSpeed === true ? 'ECU' : gps.isEcuSpeed === false ? 'GPS' : 'UNKNOWN',
          headingDegrees, rawGpsIndex, identityStatus: 'UNRESOLVED', canonicalId: null,
          positioningAccuracy: 'NOT_PROVIDED', rtkStatus: 'NOT_PROVIDED',
        });
      }
    }
  }
  return {
    schema: 'payload.samsara-gps-observations.v1', observations,
    pagination: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
    coverage: page.hasNextPage ? 'PARTIAL_PAGE' : 'SINGLE_PAGE_ONLY',
    availability: observations.length ? 'OBSERVATIONS_RETURNED' : 'NOT_RETURNED',
  };
}
