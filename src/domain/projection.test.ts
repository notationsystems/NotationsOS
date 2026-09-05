import { describe, expect, it } from 'vitest';
import { COORDINATE_SEMANTICS, ENGINE_ROLE, PROJECTION_ENGINES, PROJECTION_MODES, PROJECTION_NONCLAIMS, PROJECTION_ROUTING, REPRESENTATIONS, routeFor, routeProjection } from './projection';
import { ProjectionError } from '@/projection/spec';
import { compileProjection } from '@/projection/compile';
import { describeProjectionSource } from '@/projection/source';
import { recordsPayload } from '@/adapter/feed';

describe('projection routing table', () => {
  it('agrees with the one router for every combination: listed routes go to their engine, every other combination is rejected', () => {
    let listed = 0;
    for (const mode of PROJECTION_MODES) for (const coordinateSemantics of COORDINATE_SEMANTICS) for (const representation of REPRESENTATIONS) {
      const view = { mode, coordinateSemantics, representation };
      const route = routeFor(view);
      if (route) { listed++; expect(routeProjection(view), JSON.stringify(view)).toBe(route.engine); }
      else expect(() => routeProjection(view), JSON.stringify(view)).toThrow(ProjectionError);
    }
    expect(listed).toBe(PROJECTION_ROUTING.length);
    expect(new Set(PROJECTION_ROUTING.map((r) => r.engine))).toEqual(new Set(PROJECTION_ENGINES));
    for (const engine of PROJECTION_ENGINES) expect(ENGINE_ROLE[engine].question.length).toBeGreaterThan(10);
  });

  it('the fixture compiler returns what the table says it returns, keeps identity, and states its non-claims', async () => {
    const descriptor = describeProjectionSource('REL-CAR-2026.09.01');
    const feed = (await recordsPayload('REL-CAR-2026.09.01', 'COUNTERPARTY_SHARED'))!;
    const record = feed.records[0];
    // A geodetic route is READY only for a record whose subject declares a position; lot 5B-221's weighbridge record is one.
    const placeable = feed.records.find((entry) => entry.recordId === 'REC-0204')!;
    const spec = (view: object, chosen = record) => ({ schema: 'payload.projection-spec.v1', source: descriptor.source, selection: { recordIds: [chosen.recordId], knownAt: descriptor.knownAt, validAt: chosen.validity.validFrom }, view, viewer: 'COUNTERPARTY_SHARED' });
    for (const route of PROJECTION_ROUTING) {
      const chosen = route.coordinateSemantics === 'GEODETIC' ? placeable : record;
      const result = compileProjection(spec({ mode: route.mode, coordinateSemantics: route.coordinateSemantics, representation: route.representation }, chosen));
      expect(result.engine, route.note).toBe(route.engine);
      expect(result.status, route.note).toBe(route.currentResult);
      expect(result.records[0].canonicalId).toBe(chosen.canonicalId);
      expect(Object.keys(result.nonclaims).sort()).toEqual([...PROJECTION_NONCLAIMS].sort());
      for (const key of PROJECTION_NONCLAIMS) expect(result.nonclaims[key]).toBe(false);
    }
  });
});
