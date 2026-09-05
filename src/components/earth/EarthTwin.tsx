'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProjectionSpec } from '@/projection/spec';
import { ADOPTED, CLOCK_MEANING, EARTH_ENGINE, EARTH_TWIN_ORIGIN, GEV_SIGNAL_SOURCES, GLOBAL_VIEW, LAYER_STATE_MEANING, NOT_ADOPTED, PLACEMENT_TONE, PLACEMENT_VIEW, TERMS_CLASS_LABEL, TWIN_LAYERS, TWIN_NONCLAIMS, formatView, globeSpec, integrationBlockers, parseView, placementLabel, projectionOutcome, type GeodeticPosition, type LayerState, type ProjectionOutcome, type TwinView } from '@/domain/earth';
import { fmtUtc } from '@/lib/format';

type CesiumModule = typeof import('cesium');
type Viewer = import('cesium').Viewer;

export interface EarthRecord { recordId: string; title: string; subjectId: string; predicate: string; validFrom: string; validTo?: string }
export interface EarthTwinProps {
  release: { releaseId: string; corpusId: string; knownAt: string };
  source: ProjectionSpec['source'];
  records: EarthRecord[];
  /** Whether the local engine asset package passed verification (scripts/earth-assets.mjs). */
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
type EngineInstance = { id: symbol; Cesium: CesiumModule; viewer: Viewer };
type SunPoint = { longitude: number; latitude: number; precise: boolean };
const ASSETS_UNAVAILABLE: Status = { state: 'UNAVAILABLE', reason: 'The local engine asset package is missing or failed verification.', remedy: 'Run npm run earth:assets (it runs before dev and build), then reload. If preparation fails, preserve the existing bundle and follow docs/EARTH_TWIN.md.' };
/** What is drawn for one record: the positions the compiler resolved for it, with the record's own title and validity start. */
interface Placement { title: string; validFrom: string; positions: GeodeticPosition[] }
interface PlaceSummary { placed: number; positions: number; unplaced: string[]; refused: Array<{ recordId: string; code: string }> }
const ENTITY_PREFIX = 'place:';

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
  const engine = useRef<EngineInstance | null>(null);
  const session = useMemo(() => ({ assetsReady, loadEngine }), [assetsReady, loadEngine]);
  const [runtime, setRuntime] = useState<{ session: typeof session; status: Status; instance: symbol | null } | null>(null);
  // A replacement is loading immediately, before its effect runs. A completed
  // result from another asset/loader session can never make this session ready.
  const status: Status = !assetsReady ? ASSETS_UNAVAILABLE : runtime?.session === session ? runtime.status : { state: 'LOADING' };
  const activeInstance = status.state === 'READY' && runtime?.session === session ? runtime.instance : null;
  const [view, setView] = useState<TwinView>(GLOBAL_VIEW);
  const [linkable, setLinkable] = useState(true);
  const [recordId, setRecordId] = useState(records[0]?.recordId ?? '');
  const [answer, setAnswer] = useState<{ key: string; outcome: ProjectionOutcome } | null>(null);
  const [sunResult, setSunResult] = useState<{ instance: symbol; validAt: string; point: SunPoint | null } | null>(null);
  const [copied, setCopied] = useState('');
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [placing, setPlacing] = useState<{ done: number; total: number } | null>(null);
  const [placeSummary, setPlaceSummary] = useState<PlaceSummary | null>(null);
  const flyOnResolve = useRef(false);
  /** The records each drawn point stands for, by entity id, so a click on the globe selects one of them. */
  const drawn = useRef(new Map<string, string[]>());
  const selected = useRef(recordId);
  useEffect(() => { selected.current = recordId; }, [recordId]);
  const record = records.find((r) => r.recordId === recordId);
  const clock = useMemo(() => ({ knownAt: release.knownAt, validAt: record?.validFrom ?? release.knownAt }), [release.knownAt, record?.validFrom]);
  // The serialized request is both the wire body and its identity. Record ID
  // and world time alone do not bind knowledge time or the release commitments.
  const askKey = record ? JSON.stringify(globeSpec(source, record.recordId, clock)) : '';
  const outcome: ProjectionOutcome | { state: 'ASKING' } | { state: 'NONE' } = !record ? { state: 'NONE' } : answer?.key === askKey ? answer.outcome : { state: 'ASKING' };
  const sun = sunResult?.instance === activeInstance && sunResult?.validAt === clock.validAt ? sunResult.point : null;
  const worldTime = useRef(clock.validAt);
  // Initialization can finish after a record changes. Publish READY only after
  // assigning the most recent committed world time, not the loader's old one.
  useEffect(() => { worldTime.current = clock.validAt; }, [clock.validAt]);

  // Mount the engine once the assets are known to be on this origin; tear it down with the page.
  useEffect(() => {
    if (!session.assetsReady || !container.current) return;
    let cancelled = false;
    let viewer: Viewer | undefined;
    let instance: EngineInstance | null = null;
    let removeMoveEnd: (() => void) | undefined;
    const isCurrent = () => !cancelled && instance !== null && engine.current === instance;
    const onHashChange = () => {
      const current = instance;
      const target = parseView(window.location.hash);
      if (!isCurrent() || !current || !target) return;
      current.viewer.camera.flyTo({ destination: current.Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height), orientation: { heading: current.Cesium.Math.toRadians(target.heading), pitch: current.Cesium.Math.toRadians(target.pitch), roll: 0 }, duration: 0 });
      setView(target);
    };
    const dispose = () => {
      window.removeEventListener('hashchange', onHashChange);
      removeMoveEnd?.();
      removeMoveEnd = undefined;
      if (engine.current === instance) engine.current = null;
      const ownedViewer = viewer;
      viewer = undefined;
      ownedViewer?.destroy();
    };
    (async () => {
      try {
        (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = EARTH_ENGINE.assetsPath;
        const Cesium = await session.loadEngine();
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
        viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(worldTime.current);
        instance = { id: Symbol('earth-viewer'), Cesium, viewer };
        engine.current = instance;
        const initial = parseView(window.location.hash) ?? GLOBAL_VIEW;
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(initial.longitude, initial.latitude, initial.height), orientation: { heading: Cesium.Math.toRadians(initial.heading), pitch: Cesium.Math.toRadians(initial.pitch), roll: 0 } });
        setView(initial);
        removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => {
          if (!isCurrent() || !instance) return;
          const next = readView(Cesium, instance.viewer);
          setView(next);
          const hash = formatView(next);
          const ok = parseView(hash) !== null;
          setLinkable(ok);
          if (ok) window.history.replaceState(null, '', `#${hash}`);
        });
        // A link pasted into this page's address bar is a view too: a valid hash flies the camera there; an invalid one is ignored.
        window.addEventListener('hashchange', onHashChange);
        // A point on the globe is a record: clicking it selects the record it was drawn for.
        viewer.screenSpaceEventHandler.setInputAction((movement: { position: import('cesium').Cartesian2 }) => {
          if (!isCurrent() || !instance) return;
          const current = instance;
          const picked = current.viewer.scene.pick(movement.position) as { id?: { id?: unknown } } | undefined;
          const id = picked?.id?.id;
          const ids = typeof id === 'string' ? drawn.current.get(id) : undefined;
          if (ids?.length && !ids.includes(selected.current)) { flyOnResolve.current = false; setRecordId(ids[0]); }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        const gl = viewer.canvas.getContext('webgl2') ?? viewer.canvas.getContext('webgl');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'WebGL';
        setRuntime({ session, status: { state: 'READY', renderer }, instance: instance.id });
      } catch (failure) {
        dispose();
        if (!cancelled) setRuntime({ session, instance: null, status: { state: 'UNAVAILABLE', reason: failure instanceof Error ? failure.message : 'The engine could not start.', remedy: 'WebGL must be available in this browser and the engine assets under /cesium. Nothing else is shown in the globe’s place.' } });
      }
    })();
    return () => { cancelled = true; dispose(); };
  }, [session]);

  // The twin's world time drives the engine's clock and lighting, and the sub-solar point follows.
  useEffect(() => {
    const current = engine.current;
    if (!current || current.id !== activeInstance) return;
    const { Cesium, viewer } = current;
    const time = Cesium.JulianDate.fromIso8601(clock.validAt);
    viewer.clock.currentTime = time;
    viewer.scene.requestRender();
    setSunResult({ instance: current.id, validAt: clock.validAt, point: subSolarPoint(Cesium, clock.validAt) });
    // The precise Earth-orientation data is served from this origin with the engine; once it has loaded, the point is recomputed exactly.
    let stale = false;
    Cesium.Transforms.preloadIcrfFixed(new Cesium.TimeInterval({ start: time, stop: time })).then(() => { if (!stale && engine.current === current) setSunResult({ instance: current.id, validAt: clock.validAt, point: subSolarPoint(Cesium, clock.validAt) }); }).catch(() => { /* The approximation stands and says so. */ });
    return () => { stale = true; };
  }, [clock.validAt, activeInstance]);

  const flyTo = useCallback((target: TwinView) => {
    const current = engine.current;
    if (!current) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    current.viewer.camera.flyTo({ destination: current.Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height), orientation: { heading: current.Cesium.Math.toRadians(target.heading), pitch: current.Cesium.Math.toRadians(target.pitch), roll: 0 }, duration: reduced ? 0 : 1.2 });
  }, []);

  // The corpus is asked for one record on the globe under the release's own commitments. What it answers with is placed and drawn; nothing else is.
  useEffect(() => {
    if (!askKey || !record) return;
    const controller = new AbortController();
    const key = askKey;
    const asked = { recordId: record.recordId, title: record.title, validFrom: record.validFrom };
    fetch('/api/projections/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        const outcome = projectionOutcome(response.status, body);
        setAnswer({ key, outcome });
        if (outcome.state === 'READY') {
          setPlacements((current) => ({ ...current, [asked.recordId]: { title: asked.title, validFrom: asked.validFrom, positions: outcome.positions } }));
          if (flyOnResolve.current && outcome.positions[0]) { flyOnResolve.current = false; flyTo({ longitude: outcome.positions[0].point.longitude, latitude: outcome.positions[0].point.latitude, ...PLACEMENT_VIEW }); }
        } else {
          setPlacements((current) => { if (!(asked.recordId in current)) return current; const next = { ...current }; delete next[asked.recordId]; return next; });
        }
      })
      .catch(() => { if (!controller.signal.aborted) setAnswer({ key, outcome: { state: 'REFUSED', code: 'PROJECTION_UNAVAILABLE', detail: 'The projection service could not be reached on this origin.' } }); });
    return () => controller.abort();
  }, [askKey, record, flyTo]);

  // Everything placed is drawn: one point per declared position, coloured by the declaring source's interest, its stated uncertainty as a ring, the records placed there as the label.
  useEffect(() => {
    const current = engine.current;
    if (!current || current.id !== activeInstance) return;
    const { Cesium, viewer } = current;
    const groups = new Map<string, { position: GeodeticPosition; records: Array<{ recordId: string; title: string }> }>();
    for (const [recordId, placement] of Object.entries(placements)) {
      for (const position of placement.positions) {
        const group = groups.get(position.positionRecordId) ?? { position, records: [] };
        group.records.push({ recordId, title: placement.title });
        groups.set(position.positionRecordId, group);
      }
    }
    viewer.entities.removeAll();
    drawn.current = new Map();
    for (const [positionRecordId, { position, records: placed }] of groups) {
      const id = `${ENTITY_PREFIX}${positionRecordId}`;
      drawn.current.set(id, placed.map((entry) => entry.recordId).sort());
      const tone = Cesium.Color.fromCssColorString(PLACEMENT_TONE[position.evidenceClass.interest].hex);
      const where = Cesium.Cartesian3.fromDegrees(position.point.longitude, position.point.latitude);
      viewer.entities.add({
        id, position: where,
        point: { pixelSize: 9, color: tone, outlineColor: Cesium.Color.BLACK.withAlpha(0.85), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: placementLabel(position, drawn.current.get(id)!.map((recordId) => placed.find((entry) => entry.recordId === recordId)!)), font: '12px system-ui, sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12), showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#04040a').withAlpha(0.72), disableDepthTestDistance: Number.POSITIVE_INFINITY },
        ...(position.point.horizontalUncertaintyM ? { ellipse: { semiMajorAxis: position.point.horizontalUncertaintyM, semiMinorAxis: position.point.horizontalUncertaintyM, material: tone.withAlpha(0.18), outline: true, outlineColor: tone.withAlpha(0.8) } } : {}),
      });
    }
    viewer.scene.requestRender();
  }, [placements, activeInstance]);

  /** Ask the compiler for every record of the release, each at its own validity start, and draw all that can be placed. Nothing is placed by anything but its own subject's declaration. */
  async function placeAll() {
    if (placing) return;
    setPlacing({ done: 0, total: records.length });
    const next: Record<string, Placement> = {};
    const summary: PlaceSummary = { placed: 0, positions: 0, unplaced: [], refused: [] };
    for (const [index, item] of records.entries()) {
      try {
        const response = await fetch('/api/projections/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(globeSpec(source, item.recordId, { knownAt: release.knownAt, validAt: item.validFrom })), cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        const outcome = projectionOutcome(response.status, body);
        if (outcome.state === 'READY') { next[item.recordId] = { title: item.title, validFrom: item.validFrom, positions: outcome.positions }; summary.placed += 1; summary.positions += outcome.positions.length; }
        else if (outcome.state === 'UNAVAILABLE') summary.unplaced.push(item.recordId);
        else summary.refused.push({ recordId: item.recordId, code: outcome.code });
      } catch { summary.refused.push({ recordId: item.recordId, code: 'PROJECTION_UNAVAILABLE' }); }
      setPlacing({ done: index + 1, total: records.length });
    }
    setPlacements(next);
    setPlaceSummary(summary);
    setPlacing(null);
  }

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
          <span className="mono text-[11px]" style={faint} data-testid="earth-placed" data-count={Object.keys(placements).length}>{Object.keys(placements).length} placed</span>
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
                <select id="earth-record" className="surface-inset px-2 py-1.5 text-[12.5px] w-full" value={recordId} onChange={(event) => { flyOnResolve.current = true; setRecordId(event.target.value); }}>
                  {records.map((r) => <option key={r.recordId} value={r.recordId}>{r.recordId} · {r.title}</option>)}
                </select>
                {record && <div className="text-[11.5px]" style={faint}>{record.subjectId} · {record.predicate} · valid from {fmtUtc(record.validFrom)}{record.validTo ? ` to ${fmtUtc(record.validTo)}` : ', open'}</div>}
              </div>
            ) : <p className="m-0 text-[12px]" style={faint}>The release carries no records.</p>}
            <div className="surface-inset p-2 text-[12px] flex flex-col gap-1" data-testid="earth-projection" data-outcome={outcome.state} data-code={'code' in outcome ? outcome.code : undefined}>
              {outcome.state === 'ASKING' && <span style={faint}>Asking the projection compiler…</span>}
              {outcome.state === 'NONE' && <span style={faint}>Nothing selected.</span>}
              {outcome.state === 'READY' && <><span style={{ color: 'var(--check-passed)' }}>READY</span><span style={muted}>{outcome.detail}</span>
                <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Declared positions">
                  {outcome.positions.map((position) => (
                    <li key={position.positionRecordId} className="surface p-2 flex flex-col gap-0.5" data-position-record={position.positionRecordId} data-interest={position.evidenceClass.interest}>
                      <div className="flex flex-wrap items-baseline gap-x-2"><span className="id">{position.positionRecordId}</span><span className="label-sm" style={{ color: PLACEMENT_TONE[position.evidenceClass.interest].hex }}>{PLACEMENT_TONE[position.evidenceClass.interest].label}</span><span style={faint}>{position.statusAtKnownAt}</span></div>
                      <div className="mono">{position.value} <span style={faint}>· ±{position.point.horizontalUncertaintyM ?? '?'} m · {position.point.datum}</span></div>
                      <div style={faint}>{position.basis}</div>
                      <div style={faint}>source <span className="mono break-all">{position.source.sourceName ?? position.source.sourceId}</span> · {position.evidenceClass.claimStrength} / {position.evidenceClass.productionClass} / {position.evidenceClass.interest}</div>
                      <div style={faint}>valid <span className="ts">{fmtUtc(position.validity.validFrom)}</span> → {position.validity.validTo ? <span className="ts">{fmtUtc(position.validity.validTo)}</span> : 'open'} · known <span className="ts">{fmtUtc(position.knownAt)}</span></div>
                      <div><button type="button" className="btn btn-sm" disabled={status.state !== 'READY'} onClick={() => flyTo({ longitude: position.point.longitude, latitude: position.point.latitude, ...PLACEMENT_VIEW })}>Fly to it</button></div>
                    </li>
                  ))}
                </ul>
                <span style={faint}>Drawn where the source says the subject was over that interval, not where it is. The point’s colour is the declaring source’s interest; the ring is the stated uncertainty.</span></>}
              {outcome.state === 'UNAVAILABLE' && <><span className="mono" style={{ color: 'var(--status-refused)' }}>{outcome.code}</span><span style={muted}>{outcome.detail}</span><span style={faint}>{corpusLayer.draws}</span></>}
              {outcome.state === 'REFUSED' && <><span className="mono" style={{ color: 'var(--status-refused)' }}>{outcome.code}</span><span style={muted}>{outcome.detail}</span></>}
            </div>
          </Part>

          <Part title="Placed on the globe" testId="earth-placements">
            <p className="m-0 text-[12px]" style={muted}>Every record of the release, each asked for at its own validity start, drawn wherever its subject’s own position record declares. The label carries each record’s value and the declaring source’s interest; the twin’s world time stays the selected record’s.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-sm btn-primary" disabled={status.state !== 'READY' || Boolean(placing) || !records.length} onClick={() => void placeAll()} data-testid="place-all">Place every record</button>
              {placing && <span className="text-[12px]" style={faint} role="status">Asking the compiler… {placing.done} / {placing.total}</span>}
              {Object.keys(placements).length > 0 && !placing && <button type="button" className="btn btn-sm" onClick={() => { setPlacements({}); setPlaceSummary(null); }}>Clear</button>}
            </div>
            {placeSummary && (
              <div className="surface-inset p-2 text-[12px] flex flex-col gap-1" data-testid="place-summary" data-placed={placeSummary.placed} data-unplaced={placeSummary.unplaced.length} data-refused={placeSummary.refused.length}>
                <div><span style={{ color: 'var(--check-passed)' }}>{placeSummary.placed} placed</span> at {placeSummary.positions} {placeSummary.positions === 1 ? 'position' : 'positions'} · <span style={{ color: 'var(--status-conditional)' }}>{placeSummary.unplaced.length} unplaced</span> · <span style={{ color: 'var(--status-refused)' }}>{placeSummary.refused.length} refused</span></div>
                {placeSummary.unplaced.length > 0 && <div style={faint}>Unplaced, no declared position for the subject: <span className="mono break-all">{placeSummary.unplaced.join(', ')}</span></div>}
                {placeSummary.refused.length > 0 && <div style={faint}>Refused by the compiler: {placeSummary.refused.map((r) => <span key={r.recordId} className="mono mr-2">{r.recordId} {r.code}</span>)}</div>}
              </div>
            )}
            {Object.keys(placements).length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[12px]" aria-label="Placed records">
                {Object.entries(placements).map(([id, placement]) => <li key={id} className="flex flex-wrap items-baseline gap-x-2" data-placed-record={id}><button type="button" className="btn btn-sm btn-quiet" aria-pressed={id === recordId} onClick={() => { flyOnResolve.current = true; setRecordId(id); if (id === recordId && placement.positions[0]) flyTo({ longitude: placement.positions[0].point.longitude, latitude: placement.positions[0].point.latitude, ...PLACEMENT_VIEW }); }}>{id}</button><span style={muted}>{placement.title}</span><span style={faint}>{placement.positions.map((p) => p.subject.subjectId).join(', ')} · {fmtUtc(placement.validFrom)}</span></li>)}
              </ul>
            )}
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
