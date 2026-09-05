import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionSpec } from '@/projection/spec';
import { EarthTwin, type EarthRecord } from './EarthTwin';

// The engine is a fake injected through the loader: nothing here needs WebGL. The browser suite runs the real one.
const listeners: Array<() => void> = [];
const clicks: Array<(movement: { position: unknown }) => void> = [];
const flyTo = vi.fn();
const setView = vi.fn();
const requestRender = vi.fn();
const entitiesAdd = vi.fn();
const entitiesRemoveAll = vi.fn();
const pick = vi.fn();
const fromUrl = vi.fn(async () => ({ imagery: true }));
const ion = { defaultAccessToken: 'x' };
function fakeEngine() {
  class Cartesian3 { constructor(public x = 0, public y = 0, public z = 0) {} static fromDegrees(lon: number, lat: number, h: number) { return new Cartesian3(lon, lat, h); } }
  class Matrix3 { static multiplyByVector(_m: unknown, v: Cartesian3) { return v; } }
  class Color {
    constructor(public css = '#000', public alpha = 1) {}
    static WHITE = new Color('#fff'); static BLACK = new Color('#000');
    static fromCssColorString(css: string) { return new Color(css); }
    withAlpha(alpha: number) { return new Color(this.css, alpha); }
  }
  class Viewer {
    scene = { globe: { enableLighting: false }, requestRender, pick };
    entities = { add: entitiesAdd, removeAll: entitiesRemoveAll };
    screenSpaceEventHandler = { setInputAction: (fn: (movement: { position: unknown }) => void) => clicks.push(fn) };
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
    Viewer, Cartesian3, Matrix3, Color,
    Cartesian2: class { constructor(public x = 0, public y = 0) {} },
    LabelStyle: { FILL_AND_OUTLINE: 2 }, VerticalOrigin: { BOTTOM: 1 }, ScreenSpaceEventType: { LEFT_CLICK: 0 },
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
/** One declared position, as the compiler returns it: the subject's own location.position record, with its class, both clocks and its source. */
function declared(recordId: string, positionRecordId: string, interest = 'disinterested', extra: Record<string, unknown> = {}) {
  return {
    recordId, positionRecordId, canonicalId: `caravan:${positionRecordId}`, subject: { subjectId: 'LOT-1', canonicalId: 'caravan:LOT-1', subjectType: 'Lot' },
    point: { datum: 'WGS84', longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 250 }, value: '51.9497 N, 4.0250 E', basis: 'Port custody record',
    validity: { validFrom: '2026-08-15T06:00:00Z', validTo: '2026-08-18T00:00:00Z' }, knownAt: '2026-08-18T09:30:00Z',
    evidenceClass: { claimStrength: 'reported', productionClass: 'asserted', interest }, source: { sourceId: 'caravan:source:port-custody-system', sourceName: 'Port custody system' }, statusAtKnownAt: 'CURRENT', ...extra,
  };
}
const ready = (positions: unknown[], unplaced: string[] = []) => ({ status: 200, json: { status: 'READY', error: null, geometry: { datum: 'WGS84', positions, unplaced } } });

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); listeners.length = 0; clicks.length = 0; flyTo.mockReset(); setView.mockReset(); entitiesAdd.mockReset(); entitiesRemoveAll.mockReset(); pick.mockReset(); window.history.replaceState(null, '', '/earth'); });

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

  it('draws a record at every position its own subject declares, coloured by the declaring source, and flies there when the record is chosen', async () => {
    const fetch = api((body) => body.selection.recordIds[0] === 'REC-2'
      ? ready([declared('REC-2', 'REC-P1'), declared('REC-2', 'REC-P2', 'self_reported', { point: { datum: 'WGS84', longitude: -46.313, latitude: -23.9535, horizontalUncertaintyM: null }, source: { sourceId: 'caravan:source:meridian-yard-log', sourceName: null } })])
      : unavailable);
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    const projection = screen.getByTestId('earth-projection');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(entitiesAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '0');

    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'READY'));
    expect(projection).toHaveTextContent('2 declared positions');
    const positions = within(projection).getAllByRole('listitem');
    expect(positions.map((p) => `${p.getAttribute('data-position-record')}:${p.getAttribute('data-interest')}`)).toEqual(['REC-P1:disinterested', 'REC-P2:self_reported']);
    expect(positions[0]).toHaveTextContent('Port custody system');
    expect(positions[0]).toHaveTextContent('±250 m · WGS84');
    expect(positions[1]).toHaveTextContent('caravan:source:meridian-yard-log');
    expect(positions[1]).toHaveTextContent('±? m');
    // Two entities, one per declaring source; the ring only where an uncertainty is stated; the colour is the interest's.
    await waitFor(() => expect(entitiesAdd).toHaveBeenCalledTimes(2));
    const drawn = entitiesAdd.mock.calls.map((call) => call[0]);
    expect(drawn.map((e) => e.id)).toEqual(['place:REC-P1', 'place:REC-P2']);
    expect(drawn[0].point.color).toMatchObject({ css: '#4ade80' });
    expect(drawn[0].ellipse).toMatchObject({ semiMajorAxis: 250, semiMinorAxis: 250 });
    expect(drawn[0].label.text).toBe('LOT-1 · 51.9497 N, 4.0250 E · disinterested\nREC-2 · Hidden');
    expect(drawn[1].point.color).toMatchObject({ css: '#fbbf24' });
    expect(drawn[1].ellipse).toBeUndefined();
    expect(entitiesRemoveAll).toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalled();
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '1');
    // Choosing the record flew the camera to its first position at the placement height; nothing flew on first load.
    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo.mock.calls[0][0].destination).toMatchObject({ x: 4.025, y: 51.9497, z: 1_000_000 });
    await user.click(within(positions[1]).getByRole('button', { name: 'Fly to it' }));
    expect(flyTo).toHaveBeenCalledTimes(2);
    expect(flyTo.mock.calls[1][0].destination).toMatchObject({ x: -46.313, y: -23.9535 });
    expect(fetch).toHaveBeenCalledTimes(2);

    // Back to a record without a position: its entities go, and nothing is kept for it.
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-1');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '1');
    expect(flyTo).toHaveBeenCalledTimes(2);
  });

  it('places every record of the release on request, each at its own validity start, and reports placed, unplaced and refused without inventing', async () => {
    const fetch = api((body) => {
      const id = body.selection.recordIds[0];
      if (id === 'REC-1' || id === 'REC-4') return ready([declared(id, 'REC-P1')]);
      if (id === 'REC-2') return unavailable;
      return { status: 404, json: { fixture_only: true, error: 'SELECTION_NOT_AVAILABLE' } };
    });
    const user = userEvent.setup();
    const more: EarthRecord[] = [...records, { recordId: 'REC-3', title: 'Withheld', subjectId: 'LOT-3', predicate: 'x', validFrom: '2026-08-12T00:00:00Z' }, { recordId: 'REC-4', title: 'Loading completed', subjectId: 'LOT-1', predicate: 'custody.loading_completed', validFrom: '2026-08-17T16:00:00Z' }];
    render(<EarthTwin release={release} source={source} records={more} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    await waitFor(() => expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'READY'));
    expect(screen.queryByTestId('place-summary')).toBeNull();

    await user.click(screen.getByTestId('place-all'));
    const summary = await screen.findByTestId('place-summary');
    await waitFor(() => expect(screen.queryByText(/Asking the compiler… \d+ \/ \d+/)).toBeNull());
    expect(summary).toHaveAttribute('data-placed', '2');
    expect(summary).toHaveAttribute('data-unplaced', '1');
    expect(summary).toHaveAttribute('data-refused', '1');
    expect(summary).toHaveTextContent('2 placed at 2 positions');
    expect(summary).toHaveTextContent('REC-2');
    expect(summary).toHaveTextContent('REC-3 SELECTION_NOT_AVAILABLE');
    const placed = within(screen.getByRole('list', { name: 'Placed records' })).getAllByRole('listitem');
    expect(placed.map((item) => item.getAttribute('data-placed-record'))).toEqual(['REC-1', 'REC-4']);
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '2');
    // One request per record after the selected record's own, each at that record's validity start under the release's knowledge time.
    const asked = fetch.mock.calls.slice(1).map((call) => JSON.parse(String(call[1]?.body)) as ProjectionSpec).map((spec) => [spec.selection.recordIds[0], spec.selection.validAt, spec.selection.knownAt]);
    expect(asked).toEqual([['REC-1', '2026-08-03T10:00:00Z', release.knownAt], ['REC-2', '2026-08-10T00:00:00Z', release.knownAt], ['REC-3', '2026-08-12T00:00:00Z', release.knownAt], ['REC-4', '2026-08-17T16:00:00Z', release.knownAt]]);
    // Two records at one declared position share one point and one label: the position is what is drawn.
    const last = entitiesAdd.mock.calls.filter((call) => call[0].id === 'place:REC-P1').at(-1)![0];
    expect(entitiesAdd.mock.calls.slice(-1)[0][0].id).toBe('place:REC-P1');
    expect(last.label.text).toBe('LOT-1 · 51.9497 N, 4.0250 E · disinterested\n2 records · REC-1, REC-4');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('place-summary')).toBeNull();
    expect(screen.getByTestId('earth-placed')).toHaveAttribute('data-count', '0');
    await waitFor(() => expect(entitiesRemoveAll.mock.calls.length).toBeGreaterThan(entitiesAdd.mock.calls.length - 1));
  });

  it('selects the record a drawn point was placed for when the point is clicked, and ignores clicks on nothing', async () => {
    api((body) => body.selection.recordIds[0] === 'REC-2' ? ready([declared('REC-2', 'REC-P1')]) : unavailable);
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(clicks).toHaveLength(1);
    const projection = screen.getByTestId('earth-projection');
    // Draw the second record's point, then go back to the first: the point stays, and it stands for the second record.
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'READY'));
    await waitFor(() => expect(entitiesAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'place:REC-P1' })));
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-1');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
    expect(flyTo).toHaveBeenCalledTimes(1);
    pick.mockReturnValueOnce(undefined);
    act(() => { clicks[0]({ position: { x: 1, y: 1 } }); });
    expect(screen.getByLabelText('Record')).toHaveValue('REC-1');
    pick.mockReturnValueOnce({ id: { id: 'place:nothing-drawn' } });
    act(() => { clicks[0]({ position: { x: 1, y: 1 } }); });
    expect(screen.getByLabelText('Record')).toHaveValue('REC-1');
    pick.mockReturnValueOnce({ id: { id: 'place:REC-P1' } });
    act(() => { clicks[0]({ position: { x: 1, y: 1 } }); });
    expect(screen.getByLabelText('Record')).toHaveValue('REC-2');
    await waitFor(() => expect(projection).toHaveAttribute('data-outcome', 'READY'));
    // A click on the globe does not move the camera: the viewer already looks at what was clicked.
    expect(flyTo).toHaveBeenCalledTimes(1);
  });
});
