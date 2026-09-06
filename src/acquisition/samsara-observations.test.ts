import { describe, expect, it } from 'vitest';
import { assertSamsaraRetentionScope, parseSamsaraGpsBytes, SAMSARA_GPS_MAX_BYTES, SAMSARA_GPS_MAX_POINTS, SAMSARA_GPS_MAX_SPEED_MPH } from './samsara-observations';
import type { SamsaraHistoryQuery } from './samsara-http';

const query: SamsaraHistoryQuery = {
  region: 'US', vehicleId: '123', startTime: '2026-09-05T12:00:00.000Z', endTime: '2026-09-05T12:15:00.000Z',
};
const point = () => ({ time: '2026-09-05T12:01:00.000Z', latitude: 43.5, longitude: -79.5 });
const page = (gps: unknown = [point()]) => ({ data: [{ id: '123', gps }], pagination: { endCursor: '', hasNextPage: false } });
const parse = (value: unknown, selected = query) => parseSamsaraGpsBytes(Buffer.from(JSON.stringify(value)), selected);

describe('Samsara GPS history page interpretation', () => {
  it('preserves observations without granting canonical identity or survey positioning claims', () => {
    const result = parse(page());
    expect(result).toEqual({
      schema: 'payload.samsara-gps-observations.v1',
      observations: [{ vehicleId: '123', sourceTime: '2026-09-05T12:01:00.000Z', timeNs: '1788609660000000000',
        latitudeDegrees: 43.5, longitudeDegrees: -79.5, speedMph: null, speedSource: 'UNKNOWN',
        headingDegrees: null, rawGpsIndex: 0, identityStatus: 'UNRESOLVED', canonicalId: null,
        positioningAccuracy: 'NOT_PROVIDED', rtkStatus: 'NOT_PROVIDED' }],
      pagination: { endCursor: '', hasNextPage: false }, coverage: 'SINGLE_PAGE_ONLY', availability: 'OBSERVATIONS_RETURNED',
    });
  });

  it('keeps exact source order, duplicate timestamps and conflicting positions without averaging', () => {
    const result = parse(page([
      { ...point(), time: '2026-09-05T12:01:00.000000009Z' },
      { ...point(), time: '2026-09-05T12:01:00.000000001Z' },
      { ...point(), time: '2026-09-05T12:01:00.000000001Z', longitude: -80 },
    ]));
    expect(result.observations.map((value) => value.timeNs)).toEqual(['1788609660000000009', '1788609660000000001', '1788609660000000001']);
    expect(result.observations.map((value) => value.rawGpsIndex)).toEqual([0, 1, 2]);
    expect(result.observations.map((value) => value.longitudeDegrees)).toEqual([-79.5, -79.5, -80]);
  });

  it.each([
    ['2026-09-05T12:01:00Z', '1788609660000000000'],
    ['2026-09-05T12:01:00.1Z', '1788609660100000000'],
    ['2026-09-05T12:01:00.123456789Z', '1788609660123456789'],
    ['2026-09-05T08:01:00.123456789-04:00', '1788609660123456789'],
    ['2026-09-05T17:31:00.123456789+05:30', '1788609660123456789'],
    ['2026-09-06T02:01:00.123456789+14:00', '1788609660123456789'],
    ['2026-09-05T12:01:00+00:00', '1788609660000000000'],
  ])('converts %s to exact integer UTC nanoseconds and retains source text', (time, expected) => {
    const observation = parse(page([{ ...point(), time }])).observations[0];
    expect(observation.sourceTime).toBe(time);
    expect(observation.timeNs).toBe(expected);
  });

  it('accepts both declared query endpoints without asserting provider endpoint inclusion semantics', () => {
    expect(parse(page([{ ...point(), time: query.startTime }, { ...point(), time: query.endTime }])).observations).toHaveLength(2);
  });

  it('handles leap days, year zero and negative UTC epochs without Date year coercion', () => {
    for (const startTime of ['2024-02-29T00:00:00.000Z', '0000-01-01T00:00:00.000Z', '1960-01-01T00:00:00.000Z']) {
      const selected = { ...query, startTime, endTime: startTime.replace('00:00:00', '00:01:00') };
      const time = startTime.replace('.000Z', '.123456789Z');
      const expected = BigInt(Date.parse(startTime)) * BigInt(1_000_000) + BigInt(123456789);
      expect(parse(page([{ ...point(), time }]), selected).observations[0].timeNs).toBe(expected.toString());
    }
  });

  it.each([
    { data: [], pagination: { endCursor: '', hasNextPage: false } },
    { data: [{ id: '123' }], pagination: { endCursor: '', hasNextPage: false } },
    page([]),
  ])('keeps absent observations as NOT_RETURNED without no-movement or no-vehicle inference', (value) => {
    const result = parse(value);
    expect(result.observations).toEqual([]);
    expect(result.availability).toBe('NOT_RETURNED');
    expect(result.coverage).toBe('SINGLE_PAGE_ONLY');
  });

  it.each([[], [{ id: '123' }], [{ id: '123', gps: [] }], [{ id: '123', gps: [point()] }]].map((data) => ({ data })))('keeps a partial page partial even when empty', ({ data }) => {
    const result = parse({ data, pagination: { endCursor: 'opaque +/= cursor!?', hasNextPage: true } });
    expect(result.coverage).toBe('PARTIAL_PAGE');
    expect(result.pagination).toEqual({ endCursor: 'opaque +/= cursor!?', hasNextPage: true });
  });

  it.each([[true, 'ECU'], [false, 'GPS'], [undefined, 'UNKNOWN']] as const)('does not invent a speed source: flag %s', (isEcuSpeed, expected) => {
    const gps = { ...point(), speedMilesPerHour: 12.34, isEcuSpeed };
    const observation = parse(page([gps])).observations[0];
    expect(observation.speedMph).toBe(12.34);
    expect(observation.speedSource).toBe(expected);
  });

  it('preserves supplied zero speed and zero heading distinctly from missing values', () => {
    const observation = parse(page([{ ...point(), speedMilesPerHour: 0, headingDegrees: 0 }])).observations[0];
    expect(observation.speedMph).toBe(0);
    expect(observation.headingDegrees).toBe(0);
    expect(observation.speedSource).toBe('UNKNOWN');
  });

  it('accepts the bounded coordinate and measurement endpoints', () => {
    const result = parse(page([
      { ...point(), latitude: -90, longitude: -180, headingDegrees: 0, speedMilesPerHour: 0 },
      { ...point(), latitude: 90, longitude: 180, headingDegrees: 360, speedMilesPerHour: SAMSARA_GPS_MAX_SPEED_MPH },
    ]));
    expect(result.observations).toHaveLength(2);
  });

  it('validates but does not promote names, external IDs, addresses, or reverse geocodes', () => {
    const result = parse({ data: [{ id: '123', name: 'Truck A', externalIds: { 'samsara.vin': 'customer-vin' },
      gps: [{ ...point(), address: { id: 'facility-id', name: 'Facility' }, reverseGeo: { formattedLocation: '123 Location' } }] }],
    pagination: { endCursor: 'unused-cursor', hasNextPage: false } });
    expect(JSON.stringify(result)).not.toMatch(/customer-vin|facility-id|Facility|123 Location|Truck A/);
    expect(result.observations[0].canonicalId).toBeNull();
  });

  it('accepts empty optional context objects without fabricating their missing values', () => {
    expect(parse({ data: [{ id: '123', name: '', externalIds: {}, gps: [{ ...point(), address: {}, reverseGeo: {} }] }],
      pagination: { endCursor: '', hasNextPage: false } }).observations).toHaveLength(1);
  });

  it('accepts the point and cursor count boundaries', () => {
    expect(parse({ ...page(Array.from({ length: SAMSARA_GPS_MAX_POINTS }, point)),
      pagination: { endCursor: 'x'.repeat(2048), hasNextPage: true } }).observations).toHaveLength(1000);
  });

  it.each([
    '2026-02-30T12:01:00Z', '2026-02-29T12:01:00Z', '2026-09-31T12:01:00Z',
    '2026-09-05T24:00:00Z', '2026-09-05T12:60:00Z', '2026-09-05T12:01:60Z',
    '2026-09-05T12:01:00.1234567890Z', '2026-09-05T12:01:00.Z', '2026-09-05T12:01:00',
    '2026-09-05 12:01:00Z', '2026-09-05T12:01:00z', '2026-09-05T12:01:00-00:00',
    '2026-09-05T12:01:00+24:00', '2026-09-05T12:01:00+00:60',
    '2026-09-05T11:59:59.999999999Z', '2026-09-05T12:15:00.000000001Z',
    'not-a-time', '', null, 1788609660000,
  ])('rejects invalid, unknown-offset, or out-of-window source time %s', (time) => {
    expect(() => parse(page([{ ...point(), time }]))).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each([
    ['latitude', -90.0001], ['latitude', 90.0001], ['latitude', '43.5'], ['latitude', null],
    ['longitude', -180.0001], ['longitude', 180.0001], ['longitude', false],
    ['speedMilesPerHour', -0.1], ['speedMilesPerHour', 1000.1], ['speedMilesPerHour', '12'], ['speedMilesPerHour', null],
    ['headingDegrees', -1], ['headingDegrees', 360.001], ['headingDegrees', null],
    ['isEcuSpeed', 'false'], ['isEcuSpeed', 0], ['isEcuSpeed', null],
    ['address', null], ['address', []], ['address', { id: 123 }], ['address', { name: null }],
    ['reverseGeo', null], ['reverseGeo', []], ['reverseGeo', { formattedLocation: 123 }],
    ['address', { name: 'x'.repeat(513) }], ['reverseGeo', { formattedLocation: 'x'.repeat(2049) }],
  ])('rejects malformed optional/required field %s=%s', (field, value) => {
    expect(() => parse(page([{ ...point(), [field as string]: value }]))).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each(['time', 'latitude', 'longitude'])('rejects missing required GPS field %s', (field) => {
    const gps: Record<string, unknown> = point(); delete gps[field];
    expect(() => parse(page([gps]))).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each(['latitude', 'longitude', 'speedMilesPerHour', 'headingDegrees'])('rejects nonfinite JSON number for %s', (field) => {
    const value = JSON.stringify(page([{ ...point(), [field]: 'NUMBER_MARKER' }])).replace('"NUMBER_MARKER"', '1e999');
    expect(() => parseSamsaraGpsBytes(Buffer.from(value), query)).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each([
    null, [], {}, { data: [], pagination: null }, { pagination: { endCursor: '', hasNextPage: false } },
    { data: {}, pagination: { endCursor: '', hasNextPage: false } },
    { data: [{ id: 'other', gps: [point()] }], pagination: { endCursor: '', hasNextPage: false } },
    { data: [{ gps: [point()] }], pagination: { endCursor: '', hasNextPage: false } },
    { data: [{ id: 123, gps: [point()] }], pagination: { endCursor: '', hasNextPage: false } },
    { data: [{ id: '123' }, { id: '123' }], pagination: { endCursor: '', hasNextPage: false } },
    { data: [null], pagination: { endCursor: '', hasNextPage: false } },
    page(null), page({}), page([null]), page([[]]), page(Array.from({ length: SAMSARA_GPS_MAX_POINTS + 1 }, point)),
  ])('rejects invalid response/vehicle/GPS container shapes', (value) => {
    expect(() => parse(value)).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each([
    {}, [], { endCursor: '' }, { hasNextPage: false }, { endCursor: null, hasNextPage: false },
    { endCursor: '', hasNextPage: true }, { endCursor: '', hasNextPage: 'false' },
    { endCursor: 'x'.repeat(2049), hasNextPage: false }, { endCursor: '秘密', hasNextPage: true },
    { endCursor: 'cursor\nnext', hasNextPage: true },
  ])('rejects invalid pagination without assuming final page', (pagination) => {
    expect(() => parse({ ...page(), pagination })).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each([
    { name: null }, { name: 'x'.repeat(257) }, { name: 'Truck\nSecret' }, { externalIds: null },
    { externalIds: [] }, { externalIds: { arbitrary: 123 } }, { externalIds: { arbitrary: 'x'.repeat(513) } },
    { externalIds: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`id${index}`, 'value'])) },
  ])('rejects malformed contextual fields without normalizing them', (context) => {
    expect(() => parse({ ...page(), data: [{ id: '123', gps: [point()], ...context }] })).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each([
    { ...page(), diagnostics: 'secret' },
    { ...page(), data: [{ id: '123', gps: [point()], driver: { id: 'secret' } }] },
    { ...page(), data: [{ id: '123', gps: [point()], engineStates: [] }] },
    page([{ ...point(), accuracyMeters: 1 }]), page([{ ...point(), rtkStatus: 'FIXED' }]),
    page([{ ...point(), decorations: {} }]), page([{ ...point(), altitude: 0 }]),
    page([{ ...point(), address: { id: '123', latitude: 0 } }]),
    page([{ ...point(), reverseGeo: { formattedLocation: 'Location', coordinates: [] } }]),
    { ...page(), pagination: { endCursor: '', hasNextPage: false, total: 1 } },
  ])('quarantines schema additions or unrequested diagnostics as observable schema change', (value) => {
    expect(() => parse(value)).toThrow('SAMSARA_GPS_SCHEMA_CHANGED');
  });

  it.each([
    Buffer.alloc(0), Buffer.from('{'), Buffer.from([0xc3, 0x28]), Buffer.from('\ufeff{}'),
    Buffer.from('{"data":[],"data":[],"pagination":{"endCursor":"","hasNextPage":false}}'),
    Buffer.from('{"data":[],"d\\u0061ta":[],"pagination":{"endCursor":"","hasNextPage":false}}'),
    Buffer.from('{"data":[],"pagination":{"endCursor":"","hasNextPage":false,"hasNextPage":true}}'),
    Buffer.alloc(SAMSARA_GPS_MAX_BYTES + 1, 0x20),
  ])('rejects invalid, duplicate-key or excessive JSON with a fixed safe error', (bytes) => {
    expect(() => parseSamsaraGpsBytes(bytes, query)).toThrow('SAMSARA_GPS_INVALID_JSON');
  });

  it('accepts exactly the local JSON byte bound', () => {
    const body = JSON.stringify(page());
    expect(parseSamsaraGpsBytes(Buffer.from(body.padEnd(SAMSARA_GPS_MAX_BYTES, ' ')), query).observations).toHaveLength(1);
  });

  it.each([
    null, {}, { ...query, region: 'AU' }, { ...query, vehicleId: '123,456' }, { ...query, vehicleId: '' },
    { ...query, startTime: '2026-09-05T12:00:00Z' }, { ...query, endTime: query.startTime },
    { ...query, endTime: '2026-09-05T12:15:00.001Z' }, { ...query, endTime: '2026-09-05T11:59:59.000Z' },
    { ...query, startTime: '2026-02-30T12:00:00.000Z' }, { ...query, after: 'opaque' },
  ])('rejects invalid direct-call query before parsing response', (selected) => {
    expect(() => parse(page(), selected as SamsaraHistoryQuery)).toThrow('SAMSARA_GPS_INVALID_QUERY');
  });

  it('rejects query accessors without invoking them', () => {
    let invoked = false;
    const selected = Object.defineProperty({ ...query }, 'vehicleId', { get() { invoked = true; return '123'; } });
    expect(() => parse(page(), selected)).toThrow('SAMSARA_GPS_INVALID_QUERY');
    expect(invoked).toBe(false);
  });

  it('never echoes provider values in a refusal', () => {
    expect(() => parse(page([{ ...point(), time: 'secret-provider-value' }]))).toThrow(/^SAMSARA_GPS_INVALID_RESPONSE$/);
  });
});

describe('Samsara private response pre-retention scope guard', () => {
  const guard = (value: unknown) => assertSamsaraRetentionScope(Buffer.from(JSON.stringify(value)), query);

  it.each([
    page(), page([]), { data: [], pagination: { endCursor: '', hasNextPage: false } },
    { data: [{ id: '123' }], pagination: { endCursor: 'opaque', hasNextPage: true } },
    page([{ ...point(), time: query.startTime }, { ...point(), time: query.endTime }]),
    page([{ ...point(), time: '2026-09-05T08:01:00.123456789-04:00' }]),
    { ...page(), data: [{ id: '123', name: 'Requested vehicle', externalIds: { 'samsara.vin': 'declared-value' },
      gps: [{ ...point(), address: { id: 'address-1', name: 'Source address' }, reverseGeo: { formattedLocation: 'Source label' } }] }] },
  ])('permits only inspectable requested vehicle/time data and supported contextual fields', (value) => {
    expect(() => guard(value)).not.toThrow();
  });

  it.each([
    page([{ ...point(), latitude: 999 }]), page([{ time: point().time, longitude: point().longitude }]),
    page([{ ...point(), longitude: null }]), page([{ ...point(), headingDegrees: 999 }]),
    page([{ ...point(), speedMilesPerHour: -1 }]), page([{ ...point(), speedMilesPerHour: 'invalid-source-value' }]),
    page([{ ...point(), isEcuSpeed: 'unknown-source-value' }]),
  ])('allows scope-safe malformed measurement scalars to be retained for parser quarantine', (value) => {
    expect(() => guard(value)).not.toThrow();
    expect(() => parse(value)).toThrow('SAMSARA_GPS_INVALID_RESPONSE');
  });

  it.each([
    { ...page(), data: [{ id: '456', gps: [point()] }] },
    { ...page(), data: [{ id: '123', gps: [point()] }, { id: '456', gps: [point()] }] },
    { ...page(), data: [{ gps: [point()] }] },
    page([{ ...point(), time: '2026-09-05T11:59:59.999999999Z' }]),
    page([{ ...point(), time: '2026-09-05T12:15:00.000000001Z' }]),
    page([{ ...point(), time: '2026-09-05T12:01:00-00:00' }]),
    page([{ ...point(), time: '2026-02-30T12:01:00Z' }]),
    page([{ ...point(), time: null }]), page([{ latitude: 43, longitude: -79 }]),
    page([{ ...point(), latitude: { privateDriver: 'outside scope' } }]),
    page([{ ...point(), speedMilesPerHour: ['hidden data'] }]),
    page([{ ...point(), headingDegrees: 'x'.repeat(129) }]),
    page([{ ...point(), longitude: 'hidden\ncontent' }]),
    page([{ ...point(), decorations: { engineStates: [] } }]),
    page([{ ...point(), accuracyMeters: 1 }]),
    page([{ ...point(), reverseGeo: { formattedLocation: 'label', driver: 'unexpected' } }]),
    page([{ ...point(), address: { name: 'label', gps: [point()] } }]),
    { ...page(), data: [{ id: '123', gps: [point()], engineStates: [] }] },
    { ...page(), data: [{ id: '123', gps: [point()], driver: { name: 'unknown' } }] },
    { ...page(), data: [{ id: '123', gps: [point()], externalIds: { nested: { secret: 'hidden' } } }] },
    { ...page(), organization: { contacts: ['unexpected'] } },
    { ...page(), pagination: { endCursor: 'opaque', hasNextPage: false, vehicles: ['unexpected'] } },
    page(null), page({}), page([null]), page([[]]),
    { data: null, pagination: { endCursor: '', hasNextPage: false } },
    { data: [], pagination: { endCursor: { secret: 'hidden' }, hasNextPage: false } },
    { data: [], pagination: { endCursor: '', hasNextPage: 'not-boolean' } },
  ])('refuses retention when private field, vehicle or time scope cannot be established', (value) => {
    expect(() => guard(value)).toThrow(/^SAMSARA_GPS_RETENTION_SCOPE_INVALID$/);
  });

  it('rejects overflowed numbers rather than retaining a nonfinite malformed scalar', () => {
    const bytes = Buffer.from(JSON.stringify(page([{ ...point(), latitude: 'OVERFLOW' }])).replace('"OVERFLOW"', '1e999'));
    expect(() => assertSamsaraRetentionScope(bytes, query)).toThrow('SAMSARA_GPS_RETENTION_SCOPE_INVALID');
  });

  it.each([
    Buffer.alloc(0), Buffer.from('{'), Buffer.from([0xc3, 0x28]), Buffer.alloc(SAMSARA_GPS_MAX_BYTES + 1, 0x20),
    Buffer.from('{"data":[],"data":[{"id":"other"}],"pagination":{"endCursor":"","hasNextPage":false}}'),
  ])('does not retain unparseable, duplicate-key or excessive bytes', (bytes) => {
    expect(() => assertSamsaraRetentionScope(bytes, query)).toThrow(/^SAMSARA_GPS_RETENTION_SCOPE_INVALID$/);
  });

  it('rejects an invalid query independently of whether the response is empty', () => {
    const bytes = Buffer.from(JSON.stringify({ data: [], pagination: { endCursor: '', hasNextPage: false } }));
    expect(() => assertSamsaraRetentionScope(bytes, { ...query, vehicleId: '123,456' })).toThrow('SAMSARA_GPS_RETENTION_SCOPE_INVALID');
  });
});
