'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProjectionSpec } from '@/projection/spec';
import { ADOPTED, CLOCK_MEANING, EARTH_ENGINE, EARTH_TWIN_ORIGIN, GEV_SIGNAL_SOURCES, GLOBAL_VIEW, LAYER_STATE_MEANING, NOT_ADOPTED, TERMS_CLASS_LABEL, TWIN_LAYERS, TWIN_NONCLAIMS, formatView, globeSpec, integrationBlockers, parseView, projectionOutcome, type LayerState, type ProjectionOutcome, type TwinView } from '@/domain/earth';
import { fmtUtc } from '@/lib/format';

type CesiumModule = typeof import('cesium');
type Viewer = import('cesium').Viewer;

export interface EarthRecord { recordId: string; title: string; subjectId: string; predicate: string; validFrom: string; validTo?: string }
export interface EarthTwinProps {
  release: { releaseId: string; corpusId: string; knownAt: string };
  source: ProjectionSpec['source'];
  records: EarthRecord[];
  /** Whether public/cesium carries the engine's module, workers and bundled imagery (scripts/earth-assets.mjs). */
  assetsReady: boolean;
  /** How the engine is obtained; the default loads its prebuilt module from this origin. Tests inject a fake. */
  loadEngine?: () => Promise<CesiumModule>;
}

/**
 * The engine is an asset of this origin, like its workers and imagery: its
 * prebuilt module is loaded at runtime from /cesium/index.js rather than
 * bundled, so there is exactly one copy of it and no bundler can split it.
 */
export async function loadEngineFromOrigin(): Promise<CesiumModule> {
  const url = `${EARTH_ENGINE.assetsPath}index.js`;
  return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as CesiumModule;
}

type Status = { state: 'LOADING' } | { state: 'READY'; renderer: string } | { state: 'UNAVAILABLE'; reason: string; remedy: string };

const STATE_COLOR: Record<LayerState, string> = { BUNDLED: 'var(--check-passed)', COMPUTED: 'var(--info)', FIXTURE: 'var(--status-conditional)', UNAVAILABLE: 'var(--status-refused)', NOT_INTEGRATED: 'var(--text-muted)' };
const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };

const KEY_LABEL = { NONE: 'no key', FREE_KEY: 'free key', OPTIONAL_KEY: 'optional key', METERED_KEY: 'metered key' } as const;

function Part({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = `earth-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <section className="inspector-section" aria-labelledby={id} data-testid={testId}><h3 id={id}>{title}</h3>{children}</section>;
}

function StatePill({ state }: { state: LayerState }) {
  return <span className="pill text-[10px] px-1.5" style={{ color: STATE_COLOR[state], borderColor: 'currentColor' }} title={LAYER_STATE_MEANING[state]}>{state.replace('_', ' ')}</span>;
}

/** The sun's ground point at an instant, from the engine's own ephemeris. Precise when the frame data has loaded; otherwise the TEME approximation the engine itself falls back to. */
function subSolarPoint(Cesium: CesiumModule, iso: string): { longitude: number; latitude: number; precise: boolean } | null {
  try {
    const time = Cesium.JulianDate.fromIso8601(iso);
    const inertial = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, new Cesium.Cartesian3());
    const icrf = Cesium.Transforms.computeIcrfToFixedMatrix(time, new Cesium.Matrix3());
    const matrix = icrf ?? Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, new Cesium.Matrix3());
    const fixed = Cesium.Matrix3.multiplyByVector(matrix, inertial, new Cesium.Cartesian3());
    const carto = Cesium.Cartographic.fromCartesian(fixed);
    if (!carto) return null;
    return { longitude: Cesium.Math.toDegrees(carto.longitude), latitude: Cesium.Math.toDegrees(carto.latitude), precise: Boolean(icrf) };
  } catch { return null; }
}

function readView(Cesium: CesiumModule, viewer: Viewer): TwinView {
  const c = viewer.camera.positionCartographic;
  return { longitude: Cesium.Math.toDegrees(c.longitude), latitude: Cesium.Math.toDegrees(c.latitude), height: c.height, heading: Cesium.Math.toDegrees(viewer.camera.heading), pitch: Cesium.Math.toDegrees(viewer.camera.pitch) };
}

/**
 * The Earth Twin: a keyless, offline CesiumJS globe served from this origin,
 * with an inspector that says what every layer is, where it comes from, and
 * what it does not do. Nothing here fetches from anywhere but this origin;
 * nothing here invents a position.
 */
export function EarthTwin({ release, source, records, assetsReady, loadEngine = loadEngineFromOrigin }: EarthTwinProps) {
  const container = useRef<HTMLDivElement>(null);
  const credits = useRef<HTMLDivElement>(null);
  const engine = useRef<{ Cesium: CesiumModule; viewer: Viewer } | null>(null);
  const [status, setStatus] = useState<Status>(assetsReady ? { state: 'LOADING' } : { state: 'UNAVAILABLE', reason: 'The engine’s workers and bundled imagery are not under /cesium on this origin.', remedy: 'Run npm run earth:assets (it runs before dev and build), then reload.' });
  const [view, setView] = useState<TwinView>(GLOBAL_VIEW);
  const [linkable, setLinkable] = useState(true);
  const [recordId, setRecordId] = useState(records[0]?.recordId ?? '');
  const [answer, setAnswer] = useState<{ key: string; outcome: ProjectionOutcome } | null>(null);
  const [sun, setSun] = useState<{ longitude: number; latitude: number; precise: boolean } | null>(null);
  const [copied, setCopied] = useState('');
  const record = records.find((r) => r.recordId === recordId);
  const clock = useMemo(() => ({ knownAt: release.knownAt, validAt: record?.validFrom ?? release.knownAt }), [release.knownAt, record?.validFrom]);
  const askKey = record ? `${record.recordId}@${clock.validAt}` : '';
  const outcome: ProjectionOutcome | { state: 'ASKING' } | { state: 'NONE' } = !record ? { state: 'NONE' } : answer?.key === askKey ? answer.outcome : { state: 'ASKING' };

  // Mount the engine once the assets are known to be on this origin; tear it down with the page.
  useEffect(() => {
    if (!assetsReady || !container.current) return;
    let cancelled = false;
    let viewer: Viewer | undefined;
    const onHashChange = () => {
      const current = engine.current;
      const target = parseView(window.location.hash);
      if (!current || !target) return;
      current.viewer.camera.flyTo({ destination: current.Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height), orientation: { heading: current.Cesium.Math.toRadians(target.heading), pitch: current.Cesium.Math.toRadians(target.pitch), roll: 0 }, duration: 0 });
      setView(target);
    };
    (async () => {
      try {
        (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = EARTH_ENGINE.assetsPath;
        const Cesium = await loadEngine();
        if (cancelled || !container.current) return;
        Cesium.Ion.defaultAccessToken = '';
        const imagery = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'));
        if (cancelled || !container.current) return;
        viewer = new Cesium.Viewer(container.current, {
          baseLayer: new Cesium.ImageryLayer(imagery), terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          timeline: false, animation: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, vrButton: false, selectionIndicator: false, infoBox: false,
          creditContainer: credits.current ?? undefined, requestRenderMode: true, maximumRenderTimeChange: Infinity,
          contextOptions: { webgl: { preserveDrawingBuffer: true } },
        });
        viewer.scene.globe.enableLighting = true;
        viewer.clock.shouldAnimate = false;
        engine.current = { Cesium, viewer };
        const initial = parseView(window.location.hash) ?? GLOBAL_VIEW;
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(initial.longitude, initial.latitude, initial.height), orientation: { heading: Cesium.Math.toRadians(initial.heading), pitch: Cesium.Math.toRadians(initial.pitch), roll: 0 } });
        setView(initial);
        viewer.camera.moveEnd.addEventListener(() => {
          if (!engine.current) return;
          const next = readView(Cesium, engine.current.viewer);
          setView(next);
          const hash = formatView(next);
          const ok = parseView(hash) !== null;
          setLinkable(ok);
          if (ok) window.history.replaceState(null, '', `#${hash}`);
        });
        // A link pasted into this page's address bar is a view too: a valid hash flies the camera there; an invalid one is ignored.
        window.addEventListener('hashchange', onHashChange);
        const gl = viewer.canvas.getContext('webgl2') ?? viewer.canvas.getContext('webgl');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'WebGL';
        setStatus({ state: 'READY', renderer });
      } catch (failure) {
        setStatus({ state: 'UNAVAILABLE', reason: failure instanceof Error ? failure.message : 'The engine could not start.', remedy: 'WebGL must be available in this browser and the engine assets under /cesium. Nothing else is shown in the globe’s place.' });
      }
    })();
    return () => { cancelled = true; window.removeEventListener('hashchange', onHashChange); engine.current = null; viewer?.destroy(); };
  }, [assetsReady, loadEngine]);

  // The twin's world time drives the engine's clock and lighting, and the sub-solar point follows.
  useEffect(() => {
    const current = engine.current;
    if (!current || status.state !== 'READY') return;
    const { Cesium, viewer } = current;
    const time = Cesium.JulianDate.fromIso8601(clock.validAt);
    viewer.clock.currentTime = time;
    viewer.scene.requestRender();
    setSun(subSolarPoint(Cesium, clock.validAt));
    // The precise Earth-orientation data is served from this origin with the engine; once it has loaded, the point is recomputed exactly.
    let stale = false;
    Cesium.Transforms.preloadIcrfFixed(new Cesium.TimeInterval({ start: time, stop: time })).then(() => { if (!stale) setSun(subSolarPoint(Cesium, clock.validAt)); }).catch(() => { /* The approximation stands and says so. */ });
    return () => { stale = true; };
  }, [clock.validAt, status.state]);

  // The corpus is asked for one record on the globe under the release's own commitments.
  useEffect(() => {
    if (!record) return;
    const controller = new AbortController();
    const key = `${record.recordId}@${clock.validAt}`;
    fetch('/api/projections/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(globeSpec(source, record.recordId, clock)), signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!controller.signal.aborted) setAnswer({ key, outcome: projectionOutcome(response.status, body) }); })
      .catch(() => { if (!controller.signal.aborted) setAnswer({ key, outcome: { state: 'REFUSED', code: 'PROJECTION_UNAVAILABLE', detail: 'The projection service could not be reached on this origin.' } }); });
    return () => controller.abort();
  }, [record, source, clock]);

  const flyTo = useCallback((target: TwinView) => {
    const current = engine.current;
    if (!current) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    current.viewer.camera.flyTo({ destination: current.Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height), orientation: { heading: current.Cesium.Math.toRadians(target.heading), pitch: current.Cesium.Math.toRadians(target.pitch), roll: 0 }, duration: reduced ? 0 : 1.2 });
  }, []);

  async function copyLink() {
    const url = `${window.location.origin}/earth#${formatView(view)}`;
    try { await navigator.clipboard.writeText(url); setCopied('Link copied.'); } catch { setCopied(url); }
  }

  const corpusLayer = TWIN_LAYERS.find((l) => l.id === 'corpus')!;
  return (
    <>
    <link rel="stylesheet" href={`${EARTH_ENGINE.assetsPath}Widgets/widgets.css`} precedence="default" />
    <div className="earth-layout" data-testid="earth-twin" data-status={status.state}>
      <div className="earth-stage" data-testid="earth-stage">
        <div ref={container} className="earth-canvas" aria-label="Earth Twin globe" role="img" />
        <div className="earth-hud" aria-live="polite">
          <span className="label-sm">Earth Twin</span>
          <span className="pill text-[10px] px-1.5" data-testid="twin-status" data-state={status.state} style={{ color: status.state === 'READY' ? 'var(--check-passed)' : status.state === 'LOADING' ? 'var(--status-pending)' : 'var(--status-refused)', borderColor: 'currentColor' }}>{status.state}</span>
          <span className="mono text-[11px]" style={faint}>{fmtUtc(clock.validAt, { seconds: true })} world time</span>
        </div>
        {status.state === 'UNAVAILABLE' && (
          <div className="earth-unavailable" role="alert" data-testid="earth-unavailable">
            <h2 className="m-0 text-[15px] font-semibold">The globe is not shown</h2>
            <p className="m-0 text-[12.5px]" style={muted}>{status.reason}</p>
            <p className="m-0 text-[12.5px]" style={muted}>{status.remedy}</p>
          </div>
        )}
        <div ref={credits} className="earth-credits" aria-label="Engine and imagery credits" />
      </div>

      <aside className="inspector earth-inspector" aria-labelledby="earth-inspector-title" data-testid="earth-inspector">
        <div className="inspector-head">
          <div className="min-w-0">
            <div className="label-sm">Instrument · projection fabric</div>
            <h2 id="earth-inspector-title" className="m-0 text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>Payload OS Earth Twin</h2>
            <div className="text-[12px] mt-0.5" style={faint}>{EARTH_ENGINE.name} {EARTH_ENGINE.version} · {EARTH_ENGINE.license} · keyless · served from this origin</div>
          </div>
        </div>
        <div className="inspector-body">
          <Part title="What this instrument is" testId="earth-instrument">
            <p className="m-0 text-[12.5px]" style={muted}><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{EARTH_ENGINE.role.question}</span> {EARTH_ENGINE.role.role}</p>
            <dl className="kv m-0 text-[12px]">
              <dt>Engine</dt><dd>{status.state === 'READY' ? <span data-testid="earth-renderer">{EARTH_ENGINE.name} on {status.renderer}</span> : status.state === 'LOADING' ? 'Starting…' : <span style={{ color: 'var(--status-refused)' }}>Not running</span>}</dd>
              <dt>Built on</dt><dd><a href={EARTH_TWIN_ORIGIN.repository} style={{ color: 'var(--info)' }}>{EARTH_TWIN_ORIGIN.name}</a> at <span className="mono">{EARTH_TWIN_ORIGIN.commit.slice(0, 12)}</span> · {EARTH_TWIN_ORIGIN.codeLicense}</dd>
              <dt>Source list</dt><dd><span className="mono">{EARTH_TWIN_ORIGIN.dataSourcesPath}</span> blob <span className="mono">{EARTH_TWIN_ORIGIN.dataSourcesBlob.slice(0, 12)}</span></dd>
            </dl>
            <details className="text-[12px]"><summary className="cursor-pointer">Adopted, and deliberately not</summary>
              <ul className="m-0 mt-1 pl-4 flex flex-col gap-0.5" style={muted}>{ADOPTED.map((a) => <li key={a}><span style={{ color: 'var(--check-passed)' }}>adopted</span> {a}</li>)}{NOT_ADOPTED.map((a) => <li key={a}><span style={{ color: 'var(--status-refused)' }}>not</span> {a}</li>)}</ul>
            </details>
            <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[11.5px]" style={faint} aria-label="What the twin does not claim" data-testid="earth-nonclaims">{TWIN_NONCLAIMS.map((n) => <li key={n}><span aria-hidden="true">✕</span> {n}</li>)}</ul>
          </Part>

          <Part title="Layers" testId="earth-layers">
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
              {TWIN_LAYERS.map((layer) => (
                <li key={layer.id} className="surface-inset p-2 text-[12px] flex flex-col gap-0.5" data-layer={layer.id} data-state={layer.state}>
                  <div className="flex items-baseline justify-between gap-2"><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{layer.label}</span><StatePill state={layer.state} /></div>
                  <div style={muted}>{layer.source}</div>
                  <div style={faint}><span className="label-sm">terms</span> {layer.terms}</div>
                  <div style={faint}><span className="label-sm">draws</span> {layer.draws}</div>
                </li>
              ))}
            </ul>
          </Part>

          <Part title="Time" testId="earth-time">
            <dl className="kv m-0 text-[12px]">
              <dt>Known at</dt><dd><span className="ts">{fmtUtc(clock.knownAt, { seconds: true })}</span><div style={faint}>{CLOCK_MEANING.knownAt}</div></dd>
              <dt>World time</dt><dd><span className="ts" data-testid="earth-valid-at">{fmtUtc(clock.validAt, { seconds: true })}</span><div style={faint}>{CLOCK_MEANING.validAt} It follows the selected record’s validity start.</div></dd>
              <dt>Sub-solar</dt><dd data-testid="earth-subsolar">{sun ? <><span className="mono">{sun.latitude.toFixed(2)}°, {sun.longitude.toFixed(2)}°</span> <span style={faint}>· computed by {EARTH_ENGINE.name}{sun.precise ? '' : ' (TEME approximation until the frame data loads)'}</span></> : <span style={faint}>{status.state === 'READY' ? 'computing…' : 'not computed: the engine is not running'}</span>}</dd>
            </dl>
            <div><button type="button" className="btn btn-sm" disabled={!sun || status.state !== 'READY'} onClick={() => sun && flyTo({ ...GLOBAL_VIEW, longitude: sun.longitude, latitude: sun.latitude })} data-testid="fly-subsolar">Fly to the sub-solar point</button></div>
          </Part>

          <Part title="Corpus on the globe" testId="earth-corpus">
            <p className="m-0 text-[12px]" style={muted}>Release <span className="id">{release.releaseId}</span> asked for one record at a time, view <span className="mono">GLOBE / GEODETIC / GLOBAL_3D</span>, viewer <span className="mono">COUNTERPARTY_SHARED</span>. The compiler decides; the twin inherits its answer.</p>
            {records.length ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="earth-record" className="text-[12px]">Record</label>
                <select id="earth-record" className="surface-inset px-2 py-1.5 text-[12.5px] w-full" value={recordId} onChange={(event) => setRecordId(event.target.value)}>
                  {records.map((r) => <option key={r.recordId} value={r.recordId}>{r.recordId} · {r.title}</option>)}
                </select>
                {record && <div className="text-[11.5px]" style={faint}>{record.subjectId} · {record.predicate} · valid from {fmtUtc(record.validFrom)}{record.validTo ? ` to ${fmtUtc(record.validTo)}` : ', open'}</div>}
              </div>
            ) : <p className="m-0 text-[12px]" style={faint}>The release carries no records.</p>}
            <div className="surface-inset p-2 text-[12px] flex flex-col gap-1" data-testid="earth-projection" data-outcome={outcome.state} data-code={'code' in outcome ? outcome.code : undefined}>
              {outcome.state === 'ASKING' && <span style={faint}>Asking the projection compiler…</span>}
              {outcome.state === 'NONE' && <span style={faint}>Nothing selected.</span>}
              {outcome.state === 'READY' && <><span style={{ color: 'var(--check-passed)' }}>READY</span><span style={muted}>{outcome.detail}</span></>}
              {outcome.state === 'UNAVAILABLE' && <><span className="mono" style={{ color: 'var(--status-refused)' }}>{outcome.code}</span><span style={muted}>{outcome.detail}</span><span style={faint}>{corpusLayer.draws}</span></>}
              {outcome.state === 'REFUSED' && <><span className="mono" style={{ color: 'var(--status-refused)' }}>{outcome.code}</span><span style={muted}>{outcome.detail}</span></>}
            </div>
          </Part>

          <Part title={`World signals · ${GEV_SIGNAL_SOURCES.length} named, 0 integrated`} testId="earth-signals">
            <p className="m-0 text-[12px]" style={muted}>The public signals {EARTH_TWIN_ORIGIN.name} reads, with their terms as its source list records them. Each would enter Payload OS through the acquisition rail under a registration and a rights decision. None has.</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Signal sources">
              {GEV_SIGNAL_SOURCES.map((s) => (
                <li key={s.id} className="surface-inset p-2 text-[12px]" data-signal={s.id} data-integration={s.integrationState}>
                  <details>
                    <summary className="cursor-pointer flex flex-wrap items-baseline gap-x-2"><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{s.name}</span><span style={faint}>{s.supplies}</span><span className="label-sm ml-auto" style={{ color: 'var(--text-muted)' }}>{s.integrationState.replace('_', ' ')}</span></summary>
                    <dl className="kv m-0 mt-1 text-[11.5px]">
                      <dt>terms</dt><dd>{TERMS_CLASS_LABEL[s.termsClass]}: {s.terms}</dd>
                      <dt>attribution</dt><dd>{s.attribution}</dd>
                      <dt>key</dt><dd>{KEY_LABEL[s.key]}</dd>
                      <dt>why not here</dt><dd><ul className="m-0 pl-4">{integrationBlockers(s).map((b) => <li key={b}>{b}</li>)}</ul></dd>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          </Part>

          <Part title="View" testId="earth-view">
            <dl className="kv m-0 text-[12px]">
              <dt>Camera</dt><dd className="mono" data-testid="earth-camera">{view.latitude.toFixed(4)}°, {view.longitude.toFixed(4)}° · {Math.round(view.height / 1000).toLocaleString('en-US')} km · heading {view.heading.toFixed(1)}° · pitch {view.pitch.toFixed(1)}°</dd>
              <dt>Link</dt><dd>{linkable ? <span className="mono break-all" data-testid="earth-link">#{formatView(view)}</span> : <span style={faint}>This view cannot be linked: the camera is above the horizon.</span>}</dd>
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-sm" disabled={status.state !== 'READY'} onClick={() => flyTo(GLOBAL_VIEW)} data-testid="fly-global">Global</button>
              <button type="button" className="btn btn-sm" disabled={!linkable} onClick={() => void copyLink()}>Copy link</button>
              <span className="text-[11.5px] break-all" style={faint} role="status">{copied}</span>
            </div>
            <p className="m-0 text-[11.5px]" style={faint}>Drag to orbit, scroll to zoom. A view is a link: the camera is in the URL hash, bounded and validated; a bad hash is ignored, never clamped.</p>
          </Part>
        </div>
      </aside>
    </div>
    </>
  );
}
