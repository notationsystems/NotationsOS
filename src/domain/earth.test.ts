import { describe, expect, it } from 'vitest';
import { parseProjectionSpec } from '@/projection/spec';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { describeProjectionSource } from '@/projection/source';
import { ADOPTED, EARTH_ENGINE, EARTH_TWIN_ORIGIN, GEV_SIGNAL_SOURCES, GLOBAL_VIEW, LAYER_STATE_MEANING, NOT_ADOPTED, TERMS_CLASS_LABEL, TWIN_LAYERS, TWIN_NONCLAIMS, formatView, globeSpec, integrationBlockers, parseView, projectionOutcome } from './earth';

describe('the Earth Twin as data', () => {
  it('pins exactly what it is built from and names what it adopted and refused', () => {
    expect(EARTH_TWIN_ORIGIN.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(EARTH_TWIN_ORIGIN.dataSourcesBlob).toMatch(/^[a-f0-9]{40}$/);
    expect(EARTH_TWIN_ORIGIN.codeLicense).toMatch(/MIT/);
    expect(EARTH_ENGINE).toMatchObject({ name: 'CesiumJS', version: '1.124.0', license: 'Apache-2.0', assetsPath: '/cesium/' });
    expect(ADOPTED.length).toBeGreaterThanOrEqual(3);
    expect(NOT_ADOPTED.join(' ')).toMatch(/without any key/);
    expect(NOT_ADOPTED.join(' ')).toMatch(/no source is acquired here/);
  });

  it('gives every layer a source, terms, what it draws and a state from the closed vocabulary; only bundled, computed and declared-corpus layers draw anything', () => {
    expect(TWIN_LAYERS.map((l) => l.id)).toEqual(['surface', 'sun', 'corpus', 'signals', 'notations']);
    for (const layer of TWIN_LAYERS) {
      expect(layer.source).toMatch(/\S/);
      expect(layer.terms).toMatch(/\S/);
      expect(layer.draws).toMatch(/\S/);
      expect(Object.keys(LAYER_STATE_MEANING)).toContain(layer.state);
    }
    expect(TWIN_LAYERS.filter((l) => !l.draws.startsWith('Nothing')).map((l) => l.id)).toEqual(['surface', 'sun', 'corpus']);
    expect(TWIN_LAYERS.find((l) => l.id === 'corpus')?.draws).toMatch(/declares/);
  });

  it('carries the twenty-one live sources of the pinned DATA_SOURCES.md as a registry, none integrated, each with terms and blockers', () => {
    expect(GEV_SIGNAL_SOURCES).toHaveLength(21);
    expect(new Set(GEV_SIGNAL_SOURCES.map((s) => s.id)).size).toBe(21);
    for (const source of GEV_SIGNAL_SOURCES) {
      expect(source.integrationState).toBe('NOT_INTEGRATED');
      expect(source.terms).toMatch(/\S/);
      expect(source.attribution).toMatch(/\S/);
      expect(Object.keys(TERMS_CLASS_LABEL)).toContain(source.termsClass);
      const blockers = integrationBlockers(source);
      expect(blockers.length).toBeGreaterThanOrEqual(3);
      expect(blockers[0]).toMatch(/No source registration/);
    }
    expect(integrationBlockers(GEV_SIGNAL_SOURCES.find((s) => s.id === 'opensky')!)).toHaveLength(4);
    expect(integrationBlockers(GEV_SIGNAL_SOURCES.find((s) => s.id === 'google-map-tiles')!).at(-1)).toMatch(/metered/);
    expect(integrationBlockers(GEV_SIGNAL_SOURCES.find((s) => s.id === 'usgs-earthquakes')!)).toHaveLength(3);
  });

  it('serializes a view into a bounded link and rejects anything that is not exactly a bounded view', () => {
    const view = { longitude: -97.7431, latitude: 30.2672, height: 1_200_000, heading: 12.5, pitch: -45 };
    const hash = formatView(view);
    expect(hash).toBe('v=-97.7431,30.2672,1200000,12.5,-45.0');
    expect(parseView(`#${hash}`)).toEqual(view);
    expect(parseView(formatView(GLOBAL_VIEW))).toEqual(GLOBAL_VIEW);
    expect(formatView({ ...GLOBAL_VIEW, heading: 359.99 })).toBe('v=0.0000,0.0000,26000000,0.0,-90.0');
    expect(formatView({ ...GLOBAL_VIEW, heading: -0.01 })).toBe('v=0.0000,0.0000,26000000,0.0,-90.0');
    expect(parseView(formatView({ ...GLOBAL_VIEW, heading: 359.99 }))).not.toBeNull();
    for (const bad of ['', '#', 'v=', 'v=1,2,3', 'v=181,0,1000000,0,-90', 'v=0,91,1000000,0,-90', 'v=0,0,999,0,-90', 'v=0,0,1000000,360,-90', 'v=0,0,1000000,0,1', 'v=0,0,1000000,0,-90,extra', 'v=NaN,0,1000000,0,-90', `v=0,0,1000000,0,-90${'0'.repeat(100)}`, 'v=0,0,1e6,0,-90']) expect(parseView(bad), bad).toBeNull();
  });

  it('asks the projection compiler for one record on the globe under the release’s own commitments, and reads its answer without inventing geometry', () => {
    const descriptor = describeProjectionSource(CARAVAN_CORPUS.releases[0].releaseId);
    const spec = globeSpec(descriptor.source, 'REC-0101', { knownAt: descriptor.knownAt, validAt: '2026-08-03T10:00:00Z' });
    expect(parseProjectionSpec(spec).view).toEqual({ mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' });
    expect(projectionOutcome(200, { status: 'UNAVAILABLE', error: 'GEOMETRY_NOT_AVAILABLE' })).toMatchObject({ state: 'UNAVAILABLE', code: 'GEOMETRY_NOT_AVAILABLE' });
    expect(projectionOutcome(200, { status: 'READY', error: null }).state).toBe('READY');
    expect(projectionOutcome(404, { error: 'SELECTION_NOT_AVAILABLE' })).toMatchObject({ state: 'REFUSED', code: 'SELECTION_NOT_AVAILABLE' });
    expect(projectionOutcome(503, {})).toMatchObject({ state: 'REFUSED', code: 'PROJECTION_UNAVAILABLE' });
    expect(TWIN_NONCLAIMS.join(' ')).toMatch(/No position is invented/);
  });
});
