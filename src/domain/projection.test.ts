import { describe, expect, it } from 'vitest';
import { COORDINATE_SEMANTICS, PROJECTION_INTENTS, REPRESENTATIONS, routeProjection, type ProjectionSpec } from './projection';

const base: ProjectionSpec = {
  source: { kind: 'CORPUS_RELEASE', releaseId: 'REL-CAR-2026.09.01' },
  selection: { entities: ['notation://lot/caravan/LOT-5B-221', 'notation://shipment/caravan/BAL-77812'] },
  coordinateSemantics: 'GEODETIC',
  representation: 'POINT',
  intent: 'PATTERN',
  provenance: { sourceVersion: 'REL-CAR-2026.09.01', compilerVersion: '0.1.0', transformId: 'projection.demo' },
};

function deepFreeze<T>(v: T): T { if (v && typeof v === 'object') for (const c of Object.values(v as object)) deepFreeze(c); return Object.freeze(v); }

describe('projection router', () => {
  it('routes by coordinate semantics and intent: patterns to kepler.gl, geodetic realization to CesiumJS, everything non-geographic to Three.js, listings to the table', () => {
    expect(routeProjection(base).engine).toBe('kepler.gl');
    expect(routeProjection({ ...base, representation: 'POLYGON' }).engine).toBe('kepler.gl');
    expect(routeProjection({ ...base, intent: 'REALIZATION' }).engine).toBe('CesiumJS');
    expect(routeProjection({ ...base, representation: 'MESH' }).engine).toBe('CesiumJS');
    expect(routeProjection({ ...base, representation: 'TRAJECTORY', intent: 'REALIZATION' }).engine).toBe('CesiumJS');
    expect(routeProjection({ ...base, coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'MESH', intent: 'STRUCTURE' }).engine).toBe('Three.js');
    expect(routeProjection({ ...base, coordinateSemantics: 'GRAPH_LAYOUT', representation: 'GRAPH', intent: 'STRUCTURE' }).engine).toBe('Three.js');
    expect(routeProjection({ ...base, coordinateSemantics: 'MODEL_SPACE', representation: 'FIELD', intent: 'PATTERN' }).engine).toBe('Three.js');
    expect(routeProjection({ ...base, representation: 'TABLE' }).engine).toBe('table');
    expect(routeProjection({ ...base, intent: 'LISTING' }).engine).toBe('table');
    expect(routeProjection({ ...base, coordinateSemantics: 'NONE' }).engine).toBe('table');
  });

  it('is total and pure: every combination routes somewhere, the same spec routes the same way, and the spec is not touched', () => {
    for (const coordinateSemantics of COORDINATE_SEMANTICS) for (const representation of REPRESENTATIONS) for (const intent of PROJECTION_INTENTS) {
      const spec = deepFreeze({ ...base, coordinateSemantics, representation, intent });
      const a = routeProjection(spec);
      const b = routeProjection(spec);
      expect(a).toEqual(b);
      expect(['kepler.gl', 'CesiumJS', 'Three.js', 'table']).toContain(a.engine);
      expect(a.reasons.length).toBeGreaterThan(0);
    }
  });

  it('changes representation, never identity, and derives no relation from where things land', () => {
    const plan = routeProjection(deepFreeze({ ...base }));
    expect(plan.referents).toEqual(base.selection.entities);
    expect(plan.derivesRelations).toBe(false);
    expect(plan.mutatesSource).toBe(false);
    expect(plan.provenance).toEqual(base.provenance);
  });
});
