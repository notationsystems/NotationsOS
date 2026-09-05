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
const viewers: FakeViewer[] = [];
class FakeViewer {
  scene = { globe: { enableLighting: false }, requestRender };
  clock = { shouldAnimate: true, currentTime: null as unknown };
  canvas = document.createElement('canvas');
  camera = {
    setView, flyTo,
    moveEnd: { addEventListener: (fn: () => void) => {
      listeners.push(fn);
      return () => { const index = listeners.indexOf(fn); if (index !== -1) listeners.splice(index, 1); };
    } },
    positionCartographic: { longitude: -1.7, latitude: 0.53, height: 1_200_000 }, heading: 0.2, pitch: -0.8,
  };
  destroy = vi.fn();
  constructor() { viewers.push(this); }
}
function fakeEngine(options: { imagery?: () => Promise<unknown>; preload?: () => Promise<void>; longitude?: number } = {}) {
  class Cartesian3 { constructor(public x = 0, public y = 0, public z = 0) {} static fromDegrees(lon: number, lat: number, h: number) { return new Cartesian3(lon, lat, h); } }
  class Matrix3 { static multiplyByVector(_m: unknown, v: Cartesian3) { return v; } }
  return {
    Ion: ion,
    TileMapServiceImageryProvider: { fromUrl: options.imagery ?? fromUrl },
    buildModuleUrl: (p: string) => `/cesium/${p}`,
    ImageryLayer: class { constructor(public provider: unknown) {} },
    EllipsoidTerrainProvider: class {},
    Viewer: FakeViewer, Cartesian3, Matrix3,
    JulianDate: { fromIso8601: (iso: string) => ({ iso }) },
    Math: { toDegrees: (r: number) => r * 180 / Math.PI, toRadians: (d: number) => d * Math.PI / 180 },
    Simon1994PlanetaryPositions: { computeSunPositionInEarthInertialFrame: () => new Cartesian3(1, 0, 0) },
    TimeInterval: class { constructor(public options: unknown) {} },
    Transforms: { computeIcrfToFixedMatrix: () => undefined, computeTemeToPseudoFixedMatrix: () => new Matrix3(), preloadIcrfFixed: options.preload ?? (async () => undefined) },
    Cartographic: { fromCartesian: () => ({ longitude: options.longitude ?? 0.5, latitude: 0.25 }) },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  viewers.length = 0;
  fromUrl.mockReset().mockResolvedValue({ imagery: true });
  requestRender.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); listeners.length = 0; flyTo.mockReset(); setView.mockReset(); window.history.replaceState(null, '', '/earth'); });

describe('EarthTwin', () => {
  it('says the globe is not shown, and why, when the engine assets are not on this origin', async () => {
    api(() => unavailable);
    render(<EarthTwin release={release} source={source} records={records} assetsReady={false} loadEngine={loadEngine} />);
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE');
    expect(screen.getByTestId('earth-unavailable')).toHaveTextContent('npm run earth:assets');
    expect(screen.getByTestId('fly-global')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'UNAVAILABLE'));
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

  it.each(['engine', 'imagery'] as const)('ignores a late rejected %s load after a replacement is ready', async (stage) => {
    api(() => unavailable);
    const pending = deferred<never>();
    const oldImagery = vi.fn(() => pending.promise);
    const oldLoader = stage === 'engine' ? () => pending.promise : async () => fakeEngine({ imagery: oldImagery });
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={oldLoader} />);
    if (stage === 'imagery') await waitFor(() => expect(oldImagery).toHaveBeenCalledOnce());
    rerender(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    await act(async () => { pending.reject(new Error('superseded failure')); });
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY');
    expect(screen.queryByText('superseded failure')).not.toBeInTheDocument();
    expect(viewers).toHaveLength(1);
    expect(viewers[0].destroy).not.toHaveBeenCalled();
  });

  it.each(['engine', 'imagery'] as const)('ignores a late resolved %s load after a replacement is ready', async (stage) => {
    api(() => unavailable);
    const enginePending = deferred<typeof import('cesium')>();
    const imageryPending = deferred<unknown>();
    const oldImagery = vi.fn(() => imageryPending.promise);
    const oldLoader = stage === 'engine' ? () => enginePending.promise : async () => fakeEngine({ imagery: oldImagery });
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={oldLoader} />);
    if (stage === 'imagery') await waitFor(() => expect(oldImagery).toHaveBeenCalledOnce());
    rerender(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    await act(async () => { enginePending.resolve(fakeEngine()); imageryPending.resolve({ imagery: true }); });
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY');
    expect(viewers).toHaveLength(1);
    expect(setView).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(1);
  });

  it('shows loading during replacement and initializes the replacement at the unchanged pinned world time', async () => {
    api(() => unavailable);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    const old = viewers[0];
    expect(old.clock.currentTime).toEqual({ iso: records[0].validFrom });
    const pending = deferred<typeof import('cesium')>();
    const nextLoader = () => pending.promise;
    rerender(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={nextLoader} />);
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'LOADING');
    expect(screen.getByTestId('fly-global')).toBeDisabled();
    expect(screen.getByTestId('fly-subsolar')).toBeDisabled();
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('not computed');
    expect(old.destroy).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(fakeEngine()); });
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(viewers).toHaveLength(2);
    expect(viewers[1].clock.currentTime).toEqual({ iso: records[0].validFrom });
    expect(viewers[1].clock.shouldAnimate).toBe(false);
    expect(listeners).toHaveLength(1);
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('computed by CesiumJS');
  });

  it('disables a ready viewer when assets fail verification, and starts a fresh viewer when verified again', async () => {
    api(() => unavailable);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    const oldMoveEnd = listeners[0];
    rerender(<EarthTwin release={release} source={source} records={records} assetsReady={false} loadEngine={loadEngine} />);
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE');
    expect(screen.getByTestId('earth-unavailable')).toHaveTextContent('missing or failed verification');
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('not computed');
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
    act(() => { oldMoveEnd(); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(window.location.hash).toBe('');
    expect(flyTo).not.toHaveBeenCalled();
    rerender(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(viewers).toHaveLength(2);
    expect(viewers[1].clock.currentTime).toEqual({ iso: records[0].validFrom });
  });

  it('destroys a partially initialized viewer immediately and recovers with another loader', async () => {
    api(() => unavailable);
    setView.mockImplementationOnce(() => { throw new Error('camera initialization failed'); });
    const { rerender, unmount } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE'));
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
    expect(screen.getByTestId('fly-global')).toBeDisabled();
    const nextLoader = async () => fakeEngine();
    rerender(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={nextLoader} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY'));
    expect(viewers[1].clock.currentTime).toEqual({ iso: records[0].validFrom });
    unmount();
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(viewers[1].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
  });

  it.each(['resolve', 'reject'] as const)('ignores an engine %s after unmount', async (completion) => {
    api(() => unavailable);
    const pending = deferred<typeof import('cesium')>();
    const { unmount } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={() => pending.promise} />);
    unmount();
    await act(async () => { if (completion === 'resolve') pending.resolve(fakeEngine()); else pending.reject(new Error('unmounted load')); });
    expect(viewers).toHaveLength(0);
    expect(fromUrl).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });

  it('does not let an old frame preload replace the current viewer’s sub-solar result', async () => {
    api(() => unavailable);
    const pending = deferred<void>();
    const firstLoader = async () => fakeEngine({ preload: () => pending.promise, longitude: 1 });
    const { rerender, unmount } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={firstLoader} />);
    await waitFor(() => expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('57.30°'));
    rerender(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('28.65°'));
    await act(async () => { pending.resolve(); });
    expect(screen.getByTestId('earth-subsolar')).toHaveTextContent('28.65°');
    expect(screen.getByTestId('earth-subsolar')).not.toHaveTextContent('57.30°');
    unmount();
    expect(viewers.every((viewer) => viewer.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('initializes with the latest world time when the selected record changes while loading', async () => {
    api(() => unavailable);
    const pending = deferred<typeof import('cesium')>();
    const user = userEvent.setup();
    render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={() => pending.promise} />);
    await user.selectOptions(screen.getByLabelText('Record'), 'REC-2');
    await act(async () => { pending.resolve(fakeEngine()); });
    expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY');
    expect(viewers[0].clock.currentTime).toEqual({ iso: records[1].validFrom });
  });

  it.each(['resolve', 'reject'] as const)('ignores an imagery %s after unmount', async (completion) => {
    api(() => unavailable);
    const pending = deferred<unknown>();
    const imagery = vi.fn(() => pending.promise);
    const { unmount } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={async () => fakeEngine({ imagery })} />);
    await waitFor(() => expect(imagery).toHaveBeenCalledOnce());
    unmount();
    await act(async () => { if (completion === 'resolve') pending.resolve({ imagery: true }); else pending.reject(new Error('unmounted imagery')); });
    expect(viewers).toHaveLength(0);
    expect(listeners).toHaveLength(0);
  });

  it('removes listeners and destroys the viewer if renderer inspection fails after listener installation', async () => {
    api(() => unavailable);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => { throw new Error('context lost'); });
    const { unmount } = render(<EarthTwin release={release} source={source} records={records} assetsReady loadEngine={loadEngine} />);
    await waitFor(() => expect(screen.getByTestId('twin-status')).toHaveAttribute('data-state', 'UNAVAILABLE'));
    expect(viewers).toHaveLength(1);
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(flyTo).not.toHaveBeenCalled();
    unmount();
    expect(viewers[0].destroy).toHaveBeenCalledOnce();
  });

  it.each(['releaseId', 'corpusId', 'releaseDigest', 'manifestCommitment', 'snapshotDigest', 'knownAt'] as const)('does not display an old answer when %s changes at the same record ID and world time', async (field) => {
    const pending = deferred<{ status: number; json: () => Promise<unknown> }>();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => unavailable.json })
      .mockImplementationOnce(() => pending.promise);
    vi.stubGlobal('fetch', fetch);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} assetsReady={false} />);
    await waitFor(() => expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-code', 'GEOMETRY_NOT_AVAILABLE'));
    const nextSource = { ...source };
    const nextRelease = { ...release };
    if (field === 'knownAt') nextRelease.knownAt = '2026-09-01T11:00:00.000Z';
    else if (field === 'releaseId') { nextSource.releaseId = 'REL-Y'; nextRelease.releaseId = 'REL-Y'; }
    else if (field === 'corpusId') { nextSource.corpusId = 'another-corpus'; nextRelease.corpusId = 'another-corpus'; }
    else nextSource[field] = field === 'snapshotDigest' ? `sha256:${'d'.repeat(64)}` : 'd'.repeat(64);
    rerender(<EarthTwin release={nextRelease} source={nextSource} records={records} assetsReady={false} />);
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'ASKING');
    expect(screen.getByTestId('earth-projection')).not.toHaveAttribute('data-code');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    const request = JSON.parse(fetch.mock.calls[1][1].body);
    expect(request.source).toEqual(nextSource);
    expect(request.selection).toEqual({ recordIds: [records[0].recordId], validAt: records[0].validFrom, knownAt: nextRelease.knownAt });
    await act(async () => { pending.resolve({ status: 404, json: async () => ({ error: 'SELECTION_NOT_AVAILABLE' }) }); });
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-code', 'SELECTION_NOT_AVAILABLE');
  });

  it('ignores a superseded projection response even if the transport finishes after abort', async () => {
    const oldBody = deferred<unknown>();
    const currentReply = deferred<{ status: number; json: () => Promise<unknown> }>();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: () => oldBody.promise })
      .mockImplementationOnce(() => currentReply.promise);
    vi.stubGlobal('fetch', fetch);
    const { rerender } = render(<EarthTwin release={release} source={source} records={records} assetsReady={false} />);
    await act(async () => {});
    rerender(<EarthTwin release={{ ...release, knownAt: '2026-09-01T11:00:00.000Z' }} source={{ ...source, snapshotDigest: `sha256:${'d'.repeat(64)}` }} records={records} assetsReady={false} />);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { oldBody.resolve({ status: 'READY' }); });
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'ASKING');
    await act(async () => { currentReply.resolve({ status: 404, json: async () => ({ error: 'SOURCE_VERSION_MISMATCH' }) }); });
    expect(screen.getByTestId('earth-projection')).toHaveAttribute('data-code', 'SOURCE_VERSION_MISMATCH');
  });
});
