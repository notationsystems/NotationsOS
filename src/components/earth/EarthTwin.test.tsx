import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionSpec } from '@/projection/spec';
import { EarthTwin, type EarthRecord } from './EarthTwin';

// The engine is a fake injected through the loader: nothing here needs WebGL. The browser suite runs the real one.
const listeners: Array<() => void> = [];
const flyTo = vi.fn();
const setView = vi.fn();
const requestRender = vi.fn();
const fromUrl = vi.fn(async () => ({ imagery: true }));
const ion = { defaultAccessToken: 'x' };
function fakeEngine() {
  class Cartesian3 { constructor(public x = 0, public y = 0, public z = 0) {} static fromDegrees(lon: number, lat: number, h: number) { return new Cartesian3(lon, lat, h); } }
  class Matrix3 { static multiplyByVector(_m: unknown, v: Cartesian3) { return v; } }
  class Viewer {
    scene = { globe: { enableLighting: false }, requestRender };
    clock = { shouldAnimate: true, currentTime: null as unknown };
    canvas = document.createElement('canvas');
    camera = { setView, flyTo, moveEnd: { addEventListener: (fn: () => void) => listeners.push(fn) }, positionCartographic: { longitude: -1.7, latitude: 0.53, height: 1_200_000 }, heading: 0.2, pitch: -0.8 };
    destroy = vi.fn();
  }
  return {
    Ion: ion,
    TileMapServiceImageryProvider: { fromUrl },
    buildModuleUrl: (p: string) => `/cesium/${p}`,
    ImageryLayer: class { constructor(public provider: unknown) {} },
    EllipsoidTerrainProvider: class {},
    Viewer, Cartesian3, Matrix3,
    JulianDate: { fromIso8601: (iso: string) => ({ iso }) },
    Math: { toDegrees: (r: number) => r * 180 / Math.PI, toRadians: (d: number) => d * Math.PI / 180 },
    Simon1994PlanetaryPositions: { computeSunPositionInEarthInertialFrame: () => new Cartesian3(1, 0, 0) },
    TimeInterval: class { constructor(public options: unknown) {} },
    Transforms: { computeIcrfToFixedMatrix: () => undefined, computeTemeToPseudoFixedMatrix: () => new Matrix3(), preloadIcrfFixed: async () => undefined },
    Cartographic: { fromCartesian: () => ({ longitude: 0.5, latitude: 0.25 }) },
  } as unknown as typeof import('cesium');
}
const loadEngine = async () => fakeEngine();

const source: ProjectionSpec['source'] = { kind: 'CORPUS_RELEASE', corpusId: 'caravan', releaseId: 'REL-X', releaseDigest: 'a'.repeat(64), manifestCommitment: 'b'.repeat(64), snapshotDigest: `sha256:${'c'.repeat(64)}` };
const release = { releaseId: 'REL-X', corpusId: 'caravan', knownAt: '2026-09-01T12:00:00.000Z' };
const records: EarthRecord[] = [
  { recordId: 'REC-1', title: 'Gross quantity', subjectId: 'LOT-1', predicate: 'quantity.gross', validFrom: '2026-08-03T10:00:00Z' },
  { recordId: 'REC-2', title: 'Hidden', subjectId: 'LOT-2', predicate: 'x', validFrom: '2026-08-10T00:00:00Z', validTo: '2026-08-20T00:00:00Z' },
];

function api(answer: (body: ProjectionSpec) => { status: number; json: unknown }) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => { const body = JSON.parse(String(init?.body)) as ProjectionSpec; const reply = answer(body); return { status: reply.status, ok: reply.status === 200, json: async () => reply.json }; });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const unavailable = { status: 200, json: { status: 'UNAVAILABLE', error: 'GEOMETRY_NOT_AVAILABLE' } };

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); listeners.length = 0; flyTo.mockReset(); setView.mockReset(); window.history.replaceState(null, '', '/earth'); });

describe('EarthTwin', () => {
  it('says the globe is not shown, and why, when the engine assets are not on this origin', () => {
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} assetsReady={false} loadEngine={loadEngine} />);
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE');
    expect(screen.getByTestId('earth-unavailable')).toHaveTextContent('npm run earth:assets');
    expect(screen.getByTestId('fly-global')).toBeDisabled();
  });

  it('starts the engine keyless from bundled imagery, lists every layer with its state, asks the compiler for one record on the globe and shows its refusal without drawing', async () => {
    const fetch = api((body) => body.selection.recordIds[0] === 'REC-1' ? unavailable : { status: 404, json: { fixture_only: true, error: 'SELECTION_NOT_AVAILABLE' } });
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(ion.defaultAccessToken).toBe('');
    expect(fromUrl).toHaveBeenCalledWith('/cesium/Assets/Textures/NaturalEarthII');
    expect(setView).toHaveBeenCalledTimes(1);
    const layers = within(screen.getByTestId('earth-layers')).getAllByRole('listitem');
    expect(layers.map((l) => `${l.getAttribute('data-layer')}:${l.getAttribute('data-state')}`)).toEqual(['surface:BUNDLED', 'sun:COMPUTED', 'corpus:FIXTURE', 'signals:NOT_INTEGRATED', 'notations:UNAVAILABLE']);
    expect(document.querySelectorAll('[data-signal][data-integration="NOT_INTEGRATED"]')).toHaveLength(21);

    const projection = screen.getByTestId('earth-projection');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(projection).toHaveAttribute('data-code', 'GEOMETRY_NOT_AVAILABLE');
    expect(projection).toHaveTextContent('invents none');
    const spec = JSON.parse(String(fetch.mock.calls[0][1]?.body)) as ProjectionSpec;
    expect(spec.view).toEqual({ mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' });
    expect(spec.selection).toEqual({ recordIds: ['REC-1'], knownAt: release.knownAt, validAt: '2026-08-03T10:00:00Z' });
    expect(screen.getByTestId('earth-valid-at')).toHaveTextContent('2026-08-03 10:00:00 UTC');
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('computed by CesiumJS');
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('TEME approximation');

    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'REFUSED'));
    expect(projection).toHaveAttribute('data-code', 'SELECTION_NOT_AVAILABLE');
    expect(projection).toHaveTextContent('nothing withheld is disclosed');
    expect(screen.getByTestId('earth-valid-at')).toHaveTextContent('2026-08-10 00:00:00 UTC');
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body)).selection.validAt).toBe('2026-08-10T00:00:00Z');
  });

  it('keeps the view as a link: the camera writes a bounded hash when it stops, presets fly the camera, and a bad hash is ignored', async () => {
    api(() => unavailable);
    window.history.replaceState(null, '', '/earth#v=999,0,1,0,0');
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(screen.getByTestId('earth-link')).toHaveTextContent('#v=0.0000,0.0000,26000000,0.0,-90.0');
    act(() => { for (const listener of listeners) listener(); });
    expect(window.location.hash).toBe('#v=-97.4028,30.3668,1200000,11.5,-45.8');
    expect(screen.getByTestId('earth-camera')).toHaveTextContent('30.3668°, -97.4028° · 1,200 km');
    await user.click(screen.getByTestId('fly-global'));
    expect(flyTo).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('fly-subsolar'));
    expect(flyTo).toHaveBeenCalledTimes(2);
    // jsdom raises hashchange itself when the hash is set, as a browser does.
    window.location.hash = '#v=10.0000,20.0000,500000,90.0,-30.0';
    await waitFor(() => expect(screen.getByTestId('earth-link')).toHaveTextContent('#v=10.0000,20.0000,500000,90.0,-30.0'));
    expect(flyTo).toHaveBeenCalledTimes(3);
    window.location.hash = '#v=nonsense';
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flyTo).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('earth-link')).toHaveTextContent('#v=10.0000,20.0000,500000,90.0,-30.0');
    expect(flyTo.mock.calls[1][0].destination).toMatchObject({ x: expect.closeTo(28.6479, 3), y: expect.closeTo(14.3239, 3) });
  });
});
