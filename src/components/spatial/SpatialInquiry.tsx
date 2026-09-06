'use client';

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import { ACCESS_MEANING, FAILURE_MEANING, REACHABILITY_MEANING, REACHABILITY_TONE, GRAPH_RENDERING_LOSS, SPATIAL_NONCLAIMS, SPATIAL_REMEDY, NODE, changeText, depthText, formatSelection, graphLayout, isSpatialId, meanDepthText, parseSelection, passagesOf, planGeometry, readComparison, readInspection, spaceReadings, type Access, type Comparison, type InspectedAnalysis, type Reachability } from '@/domain/spatial';
import { fmtUtc, shortHash } from '@/lib/format';

export interface SpatialInquiryProps {
  /** Whether the server started with the local analysis service enabled; without it nothing is fetched and the page says why. */
  enabled: boolean;
  baselineId?: string;
  scenarioId?: string;
}

type Loaded =
  | { state: 'IDLE' }
  | { state: 'LOADING' }
  | { state: 'READY'; analysis: InspectedAnalysis }
  | { state: 'FAILED'; code: string; message: string };
type Compared = { state: 'IDLE' } | { state: 'LOADING' } | { state: 'READY'; comparison: Comparison } | { state: 'FAILED'; code: string; message: string };
type View = 'baseline' | 'scenario';

const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };
const ACCESS_TONE: Record<Access, string> = { OPEN: 'var(--check-passed)', CLOSED: 'var(--status-refused)', UNKNOWN: 'var(--status-conditional)' };

/** The service's failure envelope, read without guessing: the code verbatim, the message as given. */
async function failure(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = await response.json() as { error?: { code?: unknown; message?: unknown } };
    const code = typeof body.error?.code === 'string' ? body.error.code : `HTTP_${response.status}`;
    const message = typeof body.error?.message === 'string' ? body.error.message : response.statusText;
    return { code, message };
  } catch { return { code: `HTTP_${response.status}`, message: 'The service answered outside its error contract.' }; }
}

async function inspect(requestId: string, signal: AbortSignal): Promise<Loaded> {
  if (!isSpatialId(requestId)) return { state: 'FAILED', code: 'INVALID_SPATIAL_ID', message: 'Supply a bounded spatial request id.' };
  try {
    const response = await fetch(`/api/spatial/analyses/${encodeURIComponent(requestId)}`, { cache: 'no-store', signal });
    if (!response.ok) return { state: 'FAILED', ...(await failure(response)) };
    return { state: 'READY', analysis: readInspection(await response.json()) };
  } catch (error) {
    if (signal.aborted) return { state: 'LOADING' };
    return { state: 'FAILED', code: error instanceof Error && error.message.includes('v1 contract') ? 'INVALID_SPATIAL_PROJECTION' : 'SPATIAL_ANALYSIS_NOT_AVAILABLE', message: error instanceof Error ? error.message : 'The service could not be reached.' };
  }
}

function Part({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = `spatial-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <section className="inspector-section" aria-labelledby={id} data-testid={testId}><h3 id={id}>{title}</h3>{children}</section>;
}

function StatusPill({ status }: { status: Reachability }) {
  return <span className="pill text-[10px] px-1.5" style={{ color: REACHABILITY_TONE[status], borderColor: 'currentColor' }} title={REACHABILITY_MEANING[status]}>{status.replace('_', ' ')}</span>;
}

function Digest({ value }: { value: string }) {
  return <span className="mono" title={value}>{shortHash(value.replace(/^sha256:/, ''), 10, 6)}</span>;
}

function FailureNote({ code, message, testId }: { code: string; message: string; testId?: string }) {
  return (
    <div className="surface-inset p-2 text-[12px] flex flex-col gap-0.5" role="status" data-testid={testId} data-code={code}>
      <span className="mono" style={{ color: 'var(--status-refused)' }}>{code}</span>
      <span style={muted}>{FAILURE_MEANING[code] ?? message}</span>
      {FAILURE_MEANING[code] && message && <span style={faint}>{message}</span>}
    </div>
  );
}

/** Enter or Space activates an SVG element that acts as a button. */
function activate(handler: () => void) {
  return (event: KeyboardEvent<SVGElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handler(); } };
}

/**
 * Spatial Inquiry: one floor's declared access as a plan, a graph and a
 * table that share one selection by space id, beside an inspector that says
 * where every number came from. The page draws what the local service
 * retained and computes nothing itself.
 */
export function SpatialInquiry({ enabled, baselineId = 'spatial-demo-baseline', scenarioId = 'spatial-demo-closed-bridge' }: SpatialInquiryProps) {
  const [ids, setIds] = useState({ baseline: baselineId, scenario: scenarioId });
  const [applied, setApplied] = useState({ baseline: baselineId, scenario: scenarioId });
  // Results are keyed by the request id they answer; a result for another id is never shown as this one's, so "loading" is derived, not set.
  const [baselineAnswer, setBaselineAnswer] = useState<{ id: string; result: Loaded } | null>(null);
  const [scenarioAnswer, setScenarioAnswer] = useState<{ id: string; result: Loaded } | null>(null);
  const [comparedAnswer, setComparedAnswer] = useState<{ key: string; result: Compared } | null>(null);
  const [view, setView] = useState<View>('baseline');
  // A selection is a link: `#space=<id>` is read once and written on every choice. Nothing on the server render depends on it.
  const [selected, setSelected] = useState<string | null>(() => typeof window === 'undefined' ? null : parseSelection(window.location.hash));
  const baseline: Loaded = !enabled ? { state: 'IDLE' } : baselineAnswer?.id === applied.baseline ? baselineAnswer.result : { state: 'LOADING' };
  const scenario: Loaded = !enabled ? { state: 'IDLE' } : scenarioAnswer?.id === applied.scenario ? scenarioAnswer.result : { state: 'LOADING' };

  // Both saved analyses are inspected, never recomputed; a changed request id inspects again.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { baseline: baselineRequest, scenario: scenarioRequest } = applied;
    void inspect(baselineRequest, controller.signal).then((result) => { if (!controller.signal.aborted) setBaselineAnswer({ id: baselineRequest, result }); });
    void inspect(scenarioRequest, controller.signal).then((result) => { if (!controller.signal.aborted) setScenarioAnswer({ id: scenarioRequest, result }); });
    return () => controller.abort();
  }, [enabled, applied]);

  // The comparison is the service's artifact over the two saved results; the page never diffs them itself.
  const compareKey = baseline.state === 'READY' && scenario.state === 'READY' ? `${applied.baseline}|${applied.scenario}|${baseline.analysis.projection.resultDigest}|${scenario.analysis.projection.resultDigest}` : null;
  const compared = useMemo<Compared>(() => compareKey === null ? { state: 'IDLE' } : comparedAnswer?.key === compareKey ? comparedAnswer.result : { state: 'LOADING' }, [compareKey, comparedAnswer]);
  useEffect(() => {
    if (!enabled || compareKey === null) return;
    const controller = new AbortController();
    const key = compareKey, body = JSON.stringify({ baselineRequestId: applied.baseline, scenarioRequestId: applied.scenario });
    (async () => {
      try {
        const response = await fetch('/api/spatial/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal, body });
        if (controller.signal.aborted) return;
        if (!response.ok) { setComparedAnswer({ key, result: { state: 'FAILED', ...(await failure(response)) } }); return; }
        setComparedAnswer({ key, result: { state: 'READY', comparison: readComparison(await response.json()) } });
      } catch (error) {
        if (!controller.signal.aborted) setComparedAnswer({ key, result: { state: 'FAILED', code: 'SPATIAL_ANALYSIS_NOT_AVAILABLE', message: error instanceof Error ? error.message : 'The service could not be reached.' } });
      }
    })();
    return () => controller.abort();
  }, [enabled, compareKey, applied]);

  // A link pasted into this page's address bar is a selection too; a hash naming no space is ignored.
  useEffect(() => {
    const onHashChange = () => { const wanted = parseSelection(window.location.hash); if (wanted) setSelected(wanted); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const shown: Loaded = view === 'scenario' && scenario.state === 'READY' ? scenario : baseline;
  const projection = shown.state === 'READY' ? shown.analysis.projection : null;
  const select = useCallback((spaceId: string | null) => {
    setSelected(spaceId);
    window.history.replaceState(null, '', spaceId ? `#${formatSelection(spaceId)}` : window.location.pathname);
  }, []);

  const readings = useMemo(() => projection ? spaceReadings(projection) : [], [projection]);
  const plan = useMemo(() => projection ? planGeometry(projection.layout) : null, [projection]);
  const graph = useMemo(() => projection ? graphLayout(projection) : null, [projection]);
  // Plan text scales with the drawing: about a fortieth of its extent for a name, a little less for an id, so a wide floor and a deep one read alike.
  const label = plan ? plan.extent * 0.026 : 1, small = plan ? plan.extent * 0.019 : 1;
  const changes = useMemo(() => compared.state === 'READY' ? new Map(compared.comparison.changes.map((change) => [change.id, change])) : new Map<string, Comparison['changes'][number]>(), [compared]);
  const selectedReading = readings.find((reading) => reading.id === selected) ?? null;
  const labelOf = (id: string) => readings.find((reading) => reading.id === id)?.label ?? id;
  const passageTone = (state: Access) => ACCESS_TONE[state];
  const scenarioReady = scenario.state === 'READY';
  const analysis = shown.state === 'READY' ? shown.analysis : null;

  function apply() { setApplied({ ...ids }); }

  return (
    <div className="workspace has-inspector spatial-workspace" data-testid="spatial-inquiry" data-status={!enabled ? 'DISABLED' : shown.state} data-view={view}>
      <div className="workspace-top flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">Inquiry</span><span className="label-sm" style={{ color: 'var(--status-pending)' }}>LOCAL_ANALYSIS</span><span className="label-sm">historical inspection</span></div>
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Spatial Inquiry</h1>
          <p className="m-0 text-[13px]" style={muted}>How does opening or closing one explicitly declared passage change access through one floor? The plan, the graph and the table below share one selection by space id. Every depth, status and mean is read from the analysis the local service retained; this page computes none of them, and geometry is never used to make a passage.</p>
        </header>

        {!enabled && (
          <div className="empty-state" role="status" data-testid="spatial-disabled">
            <h3>The local analysis service is not enabled</h3>
            <p className="m-0">{SPATIAL_REMEDY}</p>
            <p className="m-0" style={faint}>Nothing is fetched and nothing is drawn in its place.</p>
          </div>
        )}

        {enabled && (
          <form className="surface p-3 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); apply(); }} aria-label="Saved analyses to inspect">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[12px]">Baseline request id
                <input className="surface-inset px-2 py-1.5 text-[12.5px] mono" value={ids.baseline} onChange={(event) => setIds({ ...ids, baseline: event.target.value })} data-testid="spatial-baseline-id" />
              </label>
              <label className="flex flex-col gap-1 text-[12px]">Scenario request id
                <input className="surface-inset px-2 py-1.5 text-[12.5px] mono" value={ids.scenario} onChange={(event) => setIds({ ...ids, scenario: event.target.value })} data-testid="spatial-scenario-id" />
              </label>
              <button type="submit" className="btn btn-sm btn-primary">Inspect</button>
              <div className="flex items-center gap-1 ml-auto" role="group" aria-label="View">
                <button type="button" className="btn btn-sm" aria-pressed={view === 'baseline'} onClick={() => setView('baseline')} data-testid="spatial-view-baseline">Baseline</button>
                <button type="button" className="btn btn-sm" aria-pressed={view === 'scenario'} disabled={!scenarioReady} onClick={() => setView('scenario')} data-testid="spatial-view-scenario" title={scenarioReady ? undefined : 'The scenario analysis is not loaded'}>Scenario</button>
              </div>
            </div>
            <div className="text-[12px] flex flex-col gap-1" data-testid="spatial-status">
              {baseline.state === 'LOADING' && <span style={faint} role="status">Inspecting the saved baseline…</span>}
              {baseline.state === 'FAILED' && <FailureNote code={baseline.code} message={baseline.message} testId="spatial-baseline-failure" />}
              {scenario.state === 'FAILED' && <FailureNote code={scenario.code} message={scenario.message} testId="spatial-scenario-failure" />}
              {compared.state === 'FAILED' && <FailureNote code={compared.code} message={compared.message} testId="spatial-compare-failure" />}
            </div>
          </form>
        )}

        {projection && plan && graph && analysis && (
          <>
            <figure className="surface p-3 m-0 flex flex-col gap-2" data-testid="spatial-plan-figure">
              <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>Plan</span>
                <span style={muted}>{projection.layout.label}</span>
                <span style={faint}>frame <span className="mono">{projection.layout.frame.id}</span> · {plan.units}, X right / Y up (flipped for the screen) · {view === 'scenario' ? 'scenario' : 'baseline'} reachability</span>
              </figcaption>
              <svg className="spatial-plan" viewBox={plan.viewBox} role="group" aria-label={`Plan of ${projection.layout.label}: ${plan.spaces.length} spaces; select a space`} data-testid="spatial-plan" preserveAspectRatio="xMidYMid meet">
                {plan.passages.map((passage) => {
                  const result = projection.result.passages.find((p) => p.id === passage.id)!;
                  if (!passage.a || !passage.b) return null;
                  return (
                    <g key={passage.id} data-plan-passage={passage.id} data-state={result.effectiveState}>
                      <line x1={passage.a[0]} y1={passage.a[1]} x2={passage.b[0]} y2={passage.b[1]} stroke={passageTone(result.effectiveState)} strokeWidth={result.assumed ? 4 : 3} strokeDasharray={result.effectiveState === 'UNKNOWN' ? '6 4' : undefined} strokeOpacity={result.effectiveState === 'CLOSED' ? 0.9 : 0.85} vectorEffect="non-scaling-stroke" />
                      {result.effectiveState === 'CLOSED' && <line x1={(passage.a[0] + passage.b[0]) / 2} y1={(passage.a[1] + passage.b[1]) / 2 - small * 1.2} x2={(passage.a[0] + passage.b[0]) / 2} y2={(passage.a[1] + passage.b[1]) / 2 + small * 1.2} stroke={passageTone('CLOSED')} strokeWidth={3} vectorEffect="non-scaling-stroke" />}
                      <text x={(passage.a[0] + passage.b[0]) / 2} y={(passage.a[1] + passage.b[1]) / 2 - small * 1.6} textAnchor="middle" fontSize={small} fill="var(--text-muted)">{passage.id}{result.assumed ? ` · assumed ${result.effectiveState}` : ''}</text>
                    </g>
                  );
                })}
                {plan.spaces.map((space) => {
                  const reading = readings.find((r) => r.id === space.id)!;
                  if (!space.points || !space.centre) return null;
                  const depths = depthText(reading.confirmedDepth, reading.possibleDepth);
                  const active = selected === space.id;
                  return (
                    <g key={space.id} className="spatial-space" role="button" tabIndex={0} aria-pressed={active} aria-label={`${space.label} ${space.id}: ${reading.status.replace('_', ' ').toLowerCase()}, confirmed depth ${depths.confirmed}, possible depth ${depths.possible}`} data-plan-space={space.id} data-status={reading.status} onClick={() => select(space.id)} onKeyDown={activate(() => select(space.id))}>
                      <polygon points={space.points} fill={REACHABILITY_TONE[reading.status]} fillOpacity={reading.status === 'DISCONNECTED' ? 0.12 : 0.22} stroke={active ? 'var(--accent)' : REACHABILITY_TONE[reading.status]} strokeWidth={active ? 2.5 : 1.25} vectorEffect="non-scaling-stroke" />
                      {changes.get(space.id) && <polygon points={space.points} fill="none" stroke="var(--status-refused)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" aria-hidden="true" />}
                      <text x={space.centre[0]} y={space.centre[1] - small * 0.4} textAnchor="middle" fontSize={label} fontWeight={600} fill="var(--text-heading)">{space.label}</text>
                      <text x={space.centre[0]} y={space.centre[1] + small * 1.6} textAnchor="middle" fontSize={small} fill="var(--text-secondary)">{space.id} · {depths.confirmed}{depths.confirmed !== depths.possible ? ` / ${depths.possible}` : ''}{space.id === analysis.projection.result.parameters.rootSpaceId ? ' · root' : ''}</text>
                    </g>
                  );
                })}
              </svg>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" style={faint} aria-label="Plan legend">
                {(['CONFIRMED', 'POSSIBLE_ONLY', 'DISCONNECTED'] as Reachability[]).map((status) => <span key={status}><span aria-hidden="true" style={{ color: REACHABILITY_TONE[status] }}>■</span> {status.replace('_', ' ').toLowerCase()}</span>)}
                <span><span aria-hidden="true" style={{ color: ACCESS_TONE.OPEN }}>—</span> open passage</span>
                <span><span aria-hidden="true" style={{ color: ACCESS_TONE.UNKNOWN }}>- -</span> unknown passage</span>
                <span><span aria-hidden="true" style={{ color: ACCESS_TONE.CLOSED }}>—|—</span> closed passage</span>
                {changes.size > 0 && <span><span aria-hidden="true" style={{ color: 'var(--status-refused)' }}>▢</span> changed by the scenario</span>}
                <span>labels: id · confirmed depth{' '}/ possible depth when they differ</span>
                {plan.undrawn.length > 0 && <span>no polygon declared: <span className="mono">{plan.undrawn.join(', ')}</span></span>}
              </div>
            </figure>

            <figure className="surface p-3 m-0 flex flex-col gap-2" data-testid="spatial-graph-figure">
              <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>Access graph</span>
                <span style={muted}>spaces in columns by possible-graph depth from <span className="mono">{projection.result.parameters.rootSpaceId}</span>; positions are a reading order, not a distance</span>
              </figcaption>
              <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[11.5px]" style={faint} aria-label="What this drawing does not preserve" data-testid="spatial-graph-loss">
                {GRAPH_RENDERING_LOSS.map((loss) => <li key={loss}><span aria-hidden="true">✕</span> {loss}</li>)}
              </ul>
              <div className="overflow-x-auto">
                <svg className="spatial-graph" viewBox={`0 0 ${graph.width} ${graph.height}`} width={graph.width} height={graph.height} role="group" aria-label={`Access graph: ${graph.nodes.length} spaces, ${graph.edges.length} passages; select a space`} data-testid="spatial-graph">
                  <defs>
                    {(['OPEN', 'CLOSED', 'UNKNOWN'] as Access[]).map((state) => (
                      <marker key={state} id={`spatial-arrow-${state}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={ACCESS_TONE[state]} /></marker>
                    ))}
                  </defs>
                  {graph.columns.map((column) => <text key={column.index} x={column.x + NODE.width / 2} y={NODE.margin} textAnchor="middle" fontSize={11} fill="var(--text-muted)" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{column.label}</text>)}
                  {graph.edges.map((edge) => {
                    // A passage between two spaces at the same depth is bowed clear of the
                    // column: drawn straight it would run backwards through the band both
                    // boxes occupy, and the boxes are painted after it.
                    const midX = (edge.x1 + edge.x2) / 2, midY = (edge.y1 + edge.y2) / 2;
                    const apexX = edge.x1 + NODE.bow / 2;
                    const stroke = {
                      stroke: ACCESS_TONE[edge.effectiveState], strokeWidth: edge.assumed ? 3 : 1.75,
                      strokeDasharray: edge.effectiveState === 'UNKNOWN' ? '6 4' : undefined,
                      markerEnd: `url(#spatial-arrow-${edge.effectiveState})`,
                      markerStart: edge.direction === 'BOTH' ? `url(#spatial-arrow-${edge.effectiveState})` : undefined,
                    };
                    return (
                      <g key={edge.id} data-graph-edge={edge.id} data-state={edge.effectiveState} data-same-column={edge.sameColumn ? 'true' : undefined}>
                        {edge.sameColumn
                          ? <path d={`M ${edge.x1} ${edge.y1} Q ${edge.x1 + NODE.bow} ${midY} ${edge.x2} ${edge.y2}`} fill="none" {...stroke} />
                          : <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} {...stroke} />}
                        {edge.effectiveState === 'CLOSED' && (edge.sameColumn
                          ? <line x1={apexX - 7} y1={midY} x2={apexX + 7} y2={midY} stroke={ACCESS_TONE.CLOSED} strokeWidth={3} />
                          : <line x1={midX} y1={midY - 9} x2={midX} y2={midY + 9} stroke={ACCESS_TONE.CLOSED} strokeWidth={3} />)}
                        <text x={edge.sameColumn ? apexX + 8 : midX} y={edge.sameColumn ? midY + 3 : Math.min(edge.y1, edge.y2) - NODE.height / 2 - 4} textAnchor={edge.sameColumn ? 'start' : 'middle'} fontSize={10} fill="var(--text-muted)">{edge.id}{edge.assumed ? ' · assumed' : ''}</text>
                      </g>
                    );
                  })}
                  {graph.nodes.map((node) => {
                    const reading = readings.find((r) => r.id === node.id)!;
                    const depths = depthText(reading.confirmedDepth, reading.possibleDepth);
                    const active = selected === node.id;
                    return (
                      <g key={node.id} className="spatial-node" role="button" tabIndex={0} aria-pressed={active} aria-label={`${node.label} ${node.id}: ${node.status.replace('_', ' ').toLowerCase()}, confirmed depth ${depths.confirmed}, possible depth ${depths.possible}`} data-graph-node={node.id} data-status={node.status} onClick={() => select(node.id)} onKeyDown={activate(() => select(node.id))}>
                        <rect x={node.x} y={node.y} width={NODE.width} height={NODE.height} rx={6} fill="var(--bg-secondary)" stroke={active ? 'var(--accent)' : REACHABILITY_TONE[node.status]} strokeWidth={active ? 2.5 : 1.5} strokeDasharray={node.status === 'POSSIBLE_ONLY' ? '5 3' : undefined} />
                        {changes.get(node.id) && <rect x={node.x - 4} y={node.y - 4} width={NODE.width + 8} height={NODE.height + 8} rx={8} fill="none" stroke="var(--status-refused)" strokeWidth={1.25} strokeDasharray="4 3" aria-hidden="true" />}
                        <text x={node.x + 8} y={node.y + 14} fontSize={11.5} fontWeight={600} fill="var(--text-heading)">{node.label}</text>
                        <text x={node.x + 8} y={node.y + 27} fontSize={10} fill="var(--text-secondary)">{node.id} · {depths.confirmed}{depths.confirmed !== depths.possible ? ` / ${depths.possible}` : ''}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </figure>
          </>
        )}
      </div>

      <Inspector id="spatial-inspector" testId="spatial-inspector" kicker={selectedReading ? 'Selected space' : 'Analysis'} title={selectedReading ? selectedReading.label : analysis ? analysis.projection.layout.label : 'Spatial Inquiry'} subtitle={selectedReading ? <span className="mono">{selectedReading.id}</span> : analysis ? <span className="mono">{applied[view]}</span> : undefined} onClose={selectedReading ? () => select(null) : undefined} focusOnNarrow={Boolean(selectedReading)}>
        {!analysis && <p className="m-0 text-[12.5px]" style={muted}>{enabled ? 'Nothing is loaded. The inspector shows the selected space, its passages and where every number came from once a saved analysis is inspected.' : 'The inspector shows the selected space, its passages and where every number came from once the local analysis service is enabled.'}</p>}
        {analysis && selectedReading && (
          <>
            <Part title="Access" testId="spatial-space-access">
              <dl className="kv m-0 text-[12px]">
                <dt>Status</dt><dd><StatusPill status={selectedReading.status} /><div style={faint}>{REACHABILITY_MEANING[selectedReading.status]}</div></dd>
                <dt>Confirmed depth</dt><dd className="mono" data-testid="spatial-selected-confirmed">{depthText(selectedReading.confirmedDepth, selectedReading.possibleDepth).confirmed}</dd>
                <dt>Possible depth</dt><dd className="mono" data-testid="spatial-selected-possible">{depthText(selectedReading.confirmedDepth, selectedReading.possibleDepth).possible}</dd>
                <dt>Neighbours</dt><dd>{selectedReading.incomingNeighbors} in · {selectedReading.outgoingNeighbors} out <span style={faint}>(distinct spaces in the possible graph; parallel passages do not double-count)</span></dd>
                <dt>Polygon</dt><dd>{selectedReading.polygonVertices !== null ? `${selectedReading.polygonVertices} vertices in frame ${analysis.projection.layout.frame.id} (${analysis.projection.layout.frame.units}); drawn, never traversed` : 'none declared; listed but not drawn'}</dd>
                {changes.get(selectedReading.id) && <><dt>Scenario change</dt><dd data-testid="spatial-selected-change">{changeText(changes.get(selectedReading.id)!)}</dd></>}
              </dl>
            </Part>
            <Part title="Passages" testId="spatial-space-passages">
              {passagesOf(analysis.projection.result, selectedReading.id).length === 0 ? <p className="m-0 text-[12px]" style={faint}>No passage names this space.</p> : (
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5" aria-label="Passages naming the selected space">
                  {passagesOf(analysis.projection.result, selectedReading.id).map((passage) => {
                    const declared = analysis.projection.layout.passages.find((p) => p.id === passage.id)!;
                    return (
                      <li key={passage.id} className="surface-inset p-2 text-[12px] flex flex-col gap-0.5" data-passage={passage.id} data-effective={passage.effectiveState}>
                        <div className="flex flex-wrap items-baseline gap-x-2"><span className="mono font-medium" style={{ color: 'var(--text-heading)' }}>{passage.id}</span><span style={muted}>{labelOf(passage.from)} {passage.direction === 'BOTH' ? '↔' : '→'} {labelOf(passage.to)}</span></div>
                        <div><span className="label-sm">declared</span> <span className="mono" style={{ color: ACCESS_TONE[passage.declaredState] }}>{passage.declaredState}</span> <span className="label-sm ml-2">effective</span> <span className="mono" style={{ color: ACCESS_TONE[passage.effectiveState] }}>{passage.effectiveState}</span>{passage.assumed && <span className="pill text-[10px] px-1.5 ml-2" style={{ color: 'var(--status-pending)', borderColor: 'currentColor' }}>scenario assumption</span>}</div>
                        <div style={faint}>{ACCESS_MEANING[passage.effectiveState]}</div>
                        <div style={faint}><span className="label-sm">conditions</span> {passage.conditions.length ? passage.conditions.map((condition) => `${condition.id}: ${condition.state}`).join('; ') : 'none'}</div>
                        <div style={faint}><span className="label-sm">provenance</span> {declared.provenance.kind.replace('_', ' ').toLowerCase()} · {declared.provenance.author} · sources <span className="mono">{declared.provenance.sourceIds.join(', ')}</span></div>
                        <div style={faint}>{declared.provenance.note}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Part>
          </>
        )}
        {analysis && (
          <>
            <Part title={view === 'scenario' ? 'Scenario analysis' : 'Baseline analysis'} testId="spatial-analysis">
              <dl className="kv m-0 text-[12px]">
                <dt>Request</dt><dd className="mono">{analysis.receipt.request.requestId}</dd>
                <dt>Root</dt><dd><span className="mono">{analysis.projection.result.parameters.rootSpaceId}</span> · {labelOf(analysis.projection.result.parameters.rootSpaceId)} <span style={faint}>(a different root needs a new request id)</span></dd>
                <dt>Method</dt><dd><span className="mono">{analysis.projection.result.method.id}@{analysis.projection.result.method.version}</span><div style={faint}>{analysis.projection.result.method.scope.replace(/_/g, ' ').toLowerCase()} · unknown passages: {analysis.projection.result.method.unknownPolicy.replace(/_/g, ' ').toLowerCase()} · mean over {analysis.projection.result.method.meanDepth.replace(/_/g, ' ').toLowerCase()}</div></dd>
                <dt>Confirmed mean depth</dt><dd data-testid="spatial-mean-confirmed">{meanDepthText(analysis.projection.result.confirmed)}</dd>
                <dt>Possible mean depth</dt><dd data-testid="spatial-mean-possible">{meanDepthText(analysis.projection.result.possible)}</dd>
                <dt>Coverage</dt><dd>{analysis.projection.result.coverage.spaceCount} spaces · {analysis.projection.result.coverage.passageCount} passages · geometry used for traversal: <span className="mono">{String(analysis.projection.result.coverage.geometryUsedForTraversal)}</span></dd>
                <dt>Unresolved passages</dt><dd className="mono" data-testid="spatial-unresolved">{analysis.projection.result.coverage.unresolvedPassageIds.length ? analysis.projection.result.coverage.unresolvedPassageIds.join(', ') : 'none'}</dd>
                {analysis.projection.result.scenario && <><dt>Scenario</dt><dd data-testid="spatial-scenario-provenance"><span className="mono">{analysis.projection.result.scenario.passageId}</span> assumed <span className="mono" style={{ color: ACCESS_TONE[analysis.projection.result.scenario.assumedState] }}>{analysis.projection.result.scenario.assumedState}</span><div style={faint}>{analysis.projection.result.scenario.provenance.kind.replace('_', ' ').toLowerCase()} · {analysis.projection.result.scenario.provenance.author} · sources <span className="mono">{analysis.projection.result.scenario.provenance.sourceIds.join(', ')}</span></div><div style={faint}>{analysis.projection.result.scenario.provenance.note}</div><div style={faint}>Baseline facts are never overwritten: the declared state stays on the passage card beside the assumption.</div></dd></>}
              </dl>
              <p className="m-0 text-[11.5px]" style={faint}>A smaller mean after a closure is not improved access: the reachable set shrank, and the denominator says by how much. These are conditional summaries, not uncertainty bounds.</p>
            </Part>
            <Part title="Source and identity" testId="spatial-source">
              <dl className="kv m-0 text-[12px]">
                <dt>Layout</dt><dd>acquisition <span className="mono">{analysis.projection.source.acquisition.id}</span> <Digest value={analysis.projection.source.acquisition.digest} /><div>evidence <span className="mono">{analysis.projection.source.evidence.id}</span> <Digest value={analysis.projection.source.evidence.contentDigest} /></div></dd>
                <dt>Annotation</dt><dd>{analysis.projection.layout.provenance.kind.replace('_', ' ').toLowerCase()} · {analysis.projection.layout.provenance.author}<div style={faint}>{analysis.projection.layout.provenance.note}</div></dd>
                <dt>Source artifacts</dt><dd>{analysis.projection.layout.sourceArtifacts.map((artifact) => <div key={artifact.id}><span className="mono">{artifact.id}</span> · acquisition <span className="mono">{artifact.reference.acquisition.id}</span> <Digest value={artifact.reference.acquisition.digest} /> · evidence <Digest value={artifact.reference.evidence.contentDigest} /></div>)}<div style={faint}>Retained source drawings are referenced, never embedded here.</div></dd>
                <dt>Layout digest</dt><dd><Digest value={analysis.projection.result.layoutDigest} /></dd>
                <dt>Result</dt><dd><Digest value={analysis.projection.resultDigest} /></dd>
                <dt>Receipt</dt><dd><Digest value={analysis.projection.receiptDigest} /> · executed <span className="ts">{fmtUtc(analysis.receipt.startedAt, { seconds: true })}</span></dd>
                <dt>Standing</dt><dd className="mono text-[11.5px]">inspection {analysis.projection.inspection} · rights grant {String(analysis.projection.currentRightsGrant)} · canonical admission {String(analysis.projection.canonicalAdmission)} · independently verified {String(analysis.projection.independentlyVerified)} · source truth claimed {String(analysis.projection.sourceTruthClaimed)}</dd>
              </dl>
            </Part>
          </>
        )}
        <Part title="What this is not" testId="spatial-nonclaims">
          <ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[11.5px]" style={faint}>{SPATIAL_NONCLAIMS.map((claim) => <li key={claim}><span aria-hidden="true">✕</span> {claim}</li>)}</ul>
        </Part>
      </Inspector>

      <div className="workspace-bottom flex flex-col gap-4">
        {projection && analysis && (
          <section className="surface p-3 flex flex-col gap-2" aria-labelledby="spatial-table-title">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]"><h2 id="spatial-table-title" className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>Spaces</h2><span style={muted}>{view === 'scenario' ? 'scenario' : 'baseline'} depths from the root; select a row to inspect it</span></div>
            <div className="overflow-x-auto">
              <table className="ledger-table w-full text-[12px]" data-testid="spatial-table">
                <thead><tr><th scope="col">Space</th><th scope="col">Label</th><th scope="col">Confirmed depth</th><th scope="col">Possible depth</th><th scope="col">Status</th><th scope="col">Neighbours in / out</th>{changes.size > 0 && <th scope="col">Changed by the scenario</th>}</tr></thead>
                <tbody>
                  {readings.map((reading) => {
                    const depths = depthText(reading.confirmedDepth, reading.possibleDepth);
                    const change = changes.get(reading.id);
                    return (
                      <tr key={reading.id} className="row-selectable" data-selected={selected === reading.id} data-space-row={reading.id} data-status={reading.status}>
                        <td><button type="button" className="btn btn-sm btn-quiet mono" aria-pressed={selected === reading.id} aria-label={`Select ${reading.label} ${reading.id}`} onClick={() => select(reading.id)}>{reading.id}</button></td>
                        <td>{reading.label}{reading.id === projection.result.parameters.rootSpaceId && <span className="label-sm ml-2">root</span>}</td>
                        <td className="mono">{depths.confirmed}</td>
                        <td className="mono">{depths.possible}</td>
                        <td><StatusPill status={reading.status} /></td>
                        <td className="mono">{reading.incomingNeighbors} / {reading.outgoingNeighbors}</td>
                        {changes.size > 0 && <td style={change ? undefined : faint}>{change ? changeText(change) : 'unchanged'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {enabled && (compared.state === 'READY' || compared.state === 'LOADING') && baseline.state === 'READY' && scenario.state === 'READY' && (
          <section className="surface p-3 flex flex-col gap-2" aria-labelledby="spatial-changes-title" data-testid="spatial-changes" data-count={compared.state === 'READY' ? compared.comparison.changes.length : undefined}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]"><h2 id="spatial-changes-title" className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>Changed by the scenario</h2><span style={muted}><span className="mono">{applied.baseline}</span> → <span className="mono">{applied.scenario}</span>, compared by the service over the two saved results</span></div>
            {compared.state === 'LOADING' && <span className="text-[12px]" style={faint} role="status">Comparing the saved analyses…</span>}
            {compared.state === 'READY' && (
              <>
                <dl className="kv m-0 text-[12px]">
                  <dt>Baseline means</dt><dd>confirmed {meanDepthText(baseline.analysis.projection.result.confirmed)} · possible {meanDepthText(baseline.analysis.projection.result.possible)}</dd>
                  <dt>Scenario means</dt><dd>confirmed {meanDepthText(scenario.analysis.projection.result.confirmed)} · possible {meanDepthText(scenario.analysis.projection.result.possible)}</dd>
                  <dt>Unresolved</dt><dd className="mono">baseline {baseline.analysis.projection.result.coverage.unresolvedPassageIds.join(', ') || 'none'} · scenario {scenario.analysis.projection.result.coverage.unresolvedPassageIds.join(', ') || 'none'}</dd>
                  <dt>Compared</dt><dd>result <Digest value={compared.comparison.baselineDigest} /> against <Digest value={compared.comparison.scenarioDigest} /></dd>
                </dl>
                {compared.comparison.changes.length === 0 ? <p className="m-0 text-[12px]" style={faint}>No space changed reachability or depth.</p> : (
                  <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Spaces changed by the scenario">
                    {compared.comparison.changes.map((change) => (
                      <li key={change.id} className="flex flex-wrap items-baseline gap-x-2 text-[12px]" data-changed-space={change.id}>
                        <button type="button" className="btn btn-sm btn-quiet mono" aria-pressed={selected === change.id} onClick={() => select(change.id)}>{change.id}</button>
                        <span style={muted}>{labelOf(change.id)}</span>
                        <span style={faint}>{changeText(change)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
