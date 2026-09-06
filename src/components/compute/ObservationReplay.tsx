'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { BLOCKER_MEANING, DISTINCTIONS, LIMITATION_MEANING, SURFACE_NONCLAIMS, comparisonsFor, diagramLayout, distinctionsFor, formatNs, formatTransform, frameChain, timelineModel, type Computation, type Distinction, type Manifest } from '@/domain/observationReplay';
import type { ReplayRow } from '@/observation/replay';

export interface ObservationReplayProps {
  mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED';
  manifest: Manifest;
  computation: Computation;
  artifact: { id: string; content: unknown; contentDigest: string };
}

const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };
const STATE_COLOR: Record<string, string> = { VALID: 'var(--check-passed)', INVALID: 'var(--status-refused)', UNAVAILABLE: 'var(--text-muted)', IDLE: 'var(--border-default)', FRAME: 'var(--text-heading)', PLACED_ESTIMATE: 'var(--check-passed)', UNPLACED: 'var(--status-conditional)', RESIDUAL_ONLY: 'var(--info)', UNRESOLVED: 'var(--status-conditional)', POSE: 'var(--text-secondary)' };
const DISTINCTION_COLOR: Record<Distinction, string> = { SYNTHETIC_INPUT: 'var(--status-pending)', RECORDED_INPUT: 'var(--check-passed)', SUPPLIED_ESTIMATE: 'var(--info)', NO_ESTIMATE: 'var(--text-muted)', PLACED_ESTIMATE: 'var(--check-passed)', UNRESOLVED_PLACEMENT: 'var(--status-conditional)', RESIDUAL_ONLY: 'var(--info)' };

function Pill({ text, color, title }: { text: string; color: string; title?: string }) {
  return <span className="pill text-[10px] px-1.5" style={{ color, borderColor: 'currentColor' }} title={title}>{text.replace(/_/g, ' ')}</span>;
}
function Part({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = `replay-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <section className="surface p-3 flex flex-col gap-2" aria-labelledby={id} data-testid={testId}><h2 id={id} className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</h2>{children}</section>;
}
function Badges({ items }: { items: Distinction[] }) {
  return <span className="inline-flex flex-wrap gap-1">{items.map((d) => <Pill key={d} text={DISTINCTIONS[d].label} color={DISTINCTION_COLOR[d]} title={DISTINCTIONS[d].meaning} />)}</span>;
}
function Artifact({ reference }: { reference: { acquisitionId: string; acquisitionDigest: string; contentDigest: string } }) {
  return <span className="inline-flex flex-wrap items-baseline gap-x-2 text-[11.5px]"><span className="id break-all">{reference.acquisitionId}</span><span style={faint}>acquisition</span><Digest value={reference.acquisitionDigest} copy={false} /><span style={faint}>content</span><Digest value={reference.contentDigest} copy={false} /></span>;
}

function FrameDiagram({ manifest, selected, onSelect }: { manifest: Manifest; selected: ReplayRow | null; onSelect: (sensorId: string) => void }) {
  const diagram = useMemo(() => diagramLayout(manifest, selected), [manifest, selected]);
  const at = (id: string) => diagram.nodes.find((n) => n.id === id)!;
  const sensorOf = (frameId: string) => manifest.sensors.find((s) => s.frameId === frameId)?.id ?? null;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${diagram.width} ${diagram.height}`} width={diagram.width} height={diagram.height} role="group" aria-label="Frame diagram: sensor frames, calibrations to body frames, poses to world frames" data-testid="frame-diagram" style={{ maxWidth: '100%', height: 'auto', fontFamily: 'var(--font-mono)' }}>
        <defs><marker id="replay-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker></defs>
        {[['sensor frames', 0], ['body frames', 1], ['world frames', 2]].map(([label, column]) => <text key={String(label)} x={[90, 330, 570][column as number]} y={12} textAnchor="middle" fontSize="9" fill="var(--text-muted)" letterSpacing="0.08em">{String(label).toUpperCase()}</text>)}
        {diagram.edges.map((edge) => {
          const from = at(edge.from), to = at(edge.to);
          const x1 = from.x + 80, x2 = to.x - 80, midX = (x1 + x2) / 2, midY = (from.y + to.y) / 2;
          const color = STATE_COLOR[edge.state];
          return <g key={edge.id} data-edge={edge.id} data-state={edge.state} color={color}>
            <line x1={x1} y1={from.y} x2={x2} y2={to.y} stroke={color} strokeWidth={edge.state === 'IDLE' ? 1 : 2} strokeDasharray={edge.state === 'INVALID' ? '4 3' : edge.state === 'UNAVAILABLE' ? '1 3' : undefined} markerEnd="url(#replay-arrow)" />
            {edge.state !== 'IDLE' && <text x={midX} y={midY - 5} textAnchor="middle" fontSize="8.5" fill={color}>{edge.label} · {edge.state.toLowerCase()}</text>}
          </g>;
        })}
        {diagram.nodes.map((node) => {
          const sensorId = node.column === 0 ? sensorOf(node.id) : null;
          const stroke = node.active ? 'var(--accent)' : 'var(--border-default)';
          return <g key={node.id} data-node={node.id} data-active={String(node.active)} transform={`translate(${node.x - 80}, ${node.y - 13})`} style={sensorId ? { cursor: 'pointer' } : undefined} onClick={sensorId ? () => onSelect(sensorId) : undefined} role={sensorId ? 'button' : undefined} tabIndex={sensorId ? 0 : undefined} aria-label={sensorId ? `Select the observation of ${sensorId}` : undefined} onKeyDown={sensorId ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(sensorId); } } : undefined}>
            <rect width={160} height={26} rx={5} fill={node.active ? 'var(--highlight-bg)' : 'var(--bg-inset)'} stroke={stroke} strokeWidth={node.active ? 1.5 : 1} />
            <text x={8} y={11} fontSize="9.5" fill="var(--text-heading)">{node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}</text>
            <text x={8} y={21} fontSize="8" fill="var(--text-muted)">{node.sub}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}

function TimelineView({ manifest, computation, selectedId, onSelect }: { manifest: Manifest; computation: Computation; selectedId: string | null; onSelect: (observationId: string) => void }) {
  const timeline = useMemo(() => timelineModel(manifest, computation), [manifest, computation]);
  const left = 190, width = 720, top = 24, step = 11;
  // A lane is as tall as its largest cluster of coincident ticks needs.
  const laneHeight = (lane: string) => Math.max(26, (timeline.laneStacks[lane] ?? 1) * step + 10);
  const laneTop: Record<string, number> = {};
  let cursor = top; for (const lane of timeline.lanes) { laneTop[lane] = cursor; cursor += laneHeight(lane); }
  const height = cursor + 28;
  const x = (seconds: number) => left + (seconds / timeline.spanSeconds) * (width - left - 16);
  const laneY = (lane: string) => laneTop[lane] + laneHeight(lane) / 2;
  const tickY = (t: { lane: string; stack: number; stackSize: number }) => laneY(t.lane) + (t.stack - (t.stackSize - 1) / 2) * step;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * timeline.spanSeconds);
  return (
    <div className="flex flex-col gap-2">
      {timeline.timelineId ? (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="group" aria-label={`Timeline on ${timeline.timelineId}`} data-testid="timeline" data-timeline={timeline.timelineId} style={{ maxWidth: '100%', height: 'auto', fontFamily: 'var(--font-mono)' }}>
            {axisTicks.map((s) => <g key={s}><line x1={x(s)} y1={top - 6} x2={x(s)} y2={height - 20} stroke="var(--border-subtle)" /><text x={x(s)} y={height - 8} textAnchor="middle" fontSize="8.5" fill="var(--text-muted)">{s.toFixed(2)} s</text></g>)}
            <text x={left} y={12} fontSize="8.5" fill="var(--text-muted)">seconds after {timeline.originNs} ns on {timeline.timelineId}; exact nanoseconds on every mark</text>
            {timeline.lanes.map((lane) => <text key={lane} x={left - 8} y={laneY(lane) + 3} textAnchor="end" fontSize="8.5" fill="var(--text-secondary)">{lane}</text>)}
            {timeline.windows.map((w) => <g key={w.id} data-window={w.id} data-kind={w.kind}><rect x={x(w.fromSeconds)} y={laneTop[w.lane] + 6} width={Math.max(2, x(w.untilSeconds) - x(w.fromSeconds))} height={laneHeight(w.lane) - 12} rx={3} fill={w.kind === 'CLOCK' ? 'var(--info)' : 'var(--check-passed)'} opacity={0.28}><title>{`${w.label} · [${w.fromSeconds} s, ${w.untilSeconds} s)`}</title></rect></g>)}
            {timeline.mismatches.map((m) => <g key={m.observationId} data-mismatch={m.observationId}><line x1={x(m.fromSeconds)} y1={laneTop[m.lane] + 3} x2={x(m.toSeconds) + 6} y2={laneTop[m.lane] + 3} stroke="var(--status-refused)" strokeWidth={2} /><text x={x(m.toSeconds) + 9} y={laneTop[m.lane] + 6} fontSize="8" fill="var(--status-refused)">{m.observationId}: pose +{formatNs(m.deltaNs).human}</text></g>)}
            {timeline.ticks.map((t) => t.kind === 'POSE'
              ? <g key={t.id} data-tick={t.id} data-kind="POSE"><rect x={x(t.seconds) - 4} y={tickY(t) - 4} width={8} height={8} transform={`rotate(45 ${x(t.seconds)} ${tickY(t)})`} fill="var(--text-secondary)"><title>{`${t.id} · ${t.exactNs} ns`}</title></rect></g>
              : <g key={t.id} data-tick={t.id} data-kind="OBSERVATION" data-selected={String(t.id === selectedId)} role="button" tabIndex={0} aria-label={`Select ${t.id}`} style={{ cursor: 'pointer' }} onClick={() => onSelect(t.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(t.id); } }}><circle cx={x(t.seconds)} cy={tickY(t)} r={t.id === selectedId ? 5 : 4} fill={STATE_COLOR[t.state]} stroke={t.id === selectedId ? 'var(--accent)' : 'var(--bg-void)'} strokeWidth={t.id === selectedId ? 2 : 1}><title>{`${t.id} · ${t.exactNs} ns · ${t.state}`}</title></circle></g>)}
          </svg>
        </div>
      ) : <p className="m-0 text-[12px]" style={faint}>No clock declares a common timeline.</p>}
      {timeline.unaligned.length > 0 && (
        <div className="text-[12px]" data-testid="timeline-unaligned"><span className="label-sm">Not on the timeline</span>
          <ul className="m-0 pl-4">{timeline.unaligned.map((u) => <li key={u.observationId}><button type="button" className="btn btn-sm btn-quiet" onClick={() => onSelect(u.observationId)}>{u.observationId}</button> <span style={muted}>on <span className="mono">{u.clockId}</span> ({u.basis}) at <span className="mono">{u.timeNs}</span> ns; no declared mapping, so no place on the timeline and no comparison with anything on it.</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

/** The recorded-observation replay contract, understandable: frames, time, each observation's evidence, estimate, placement and comparisons, with what each is and is not. */
export function ObservationReplay({ mode, manifest, computation, artifact }: ObservationReplayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = computation.rows.find((r) => r.observationId === selectedId) ?? null;
  const observation = selected ? manifest.observations.find((o) => o.id === selected.observationId)! : null;
  const chain = selected ? frameChain(manifest, selected) : [];
  const comparisons = selected ? comparisonsFor(computation, selected.observationId) : [];
  const selectSensor = (sensorId: string) => { const row = computation.rows.find((r) => r.sensorId === sensorId); if (row) setSelectedId(row.observationId); };
  const association = observation?.pointEstimate ? manifest.associations.find((a) => a.id === observation.pointEstimate!.associationId) : null;
  return (
    <div className={`workspace${selected ? ' has-inspector' : ''}`} data-testid="observation-replay" data-selected={selectedId ?? 'none'}>
      <div className="workspace-top flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">Inquiry · Compute</span><Pill text={mode} color="var(--status-pending)" title="An in-memory synthetic preview: no acquisition receipt, no policy decision and no retained report are asserted." /><Pill text={`evidence class ${manifest.evidenceClass}`} color="var(--status-pending)" title={DISTINCTIONS.SYNTHETIC_INPUT.meaning} /></div>
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Observation replay</h1>
          <p className="m-0 text-[13px]" style={muted}>One recorded-observation manifest and its replay, read together: the frames a supplied point travels through, the clocks and validity windows that decide whether it can travel at all, each observation’s retained evidence and computed result, and the differences between placements under an asserted association. Every state is named; nothing is inferred.</p>
        </header>

        <section className="surface-inset p-3 flex flex-col gap-1 text-[12px]" aria-label="Replay boundary" data-testid="replay-boundary">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5"><span>dataset <span className="id">{computation.datasetId}</span></span><span>method <span className="mono">{computation.method.id}</span> {computation.method.version}</span><span>manifest <Digest value={computation.manifestDigest} copy={false} /></span><span>computation <Digest value={computation.digest} copy={false} /></span><span>input artifact <span className="id">{artifact.id}</span> <Digest value={artifact.contentDigest} copy={false} /></span></div>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 text-[11px] mono" style={faint} data-testid="replay-flags" aria-label="Non-claims of the computation">{(['canonicalAdmission', 'earthProjectionEligible', 'sensorFusionPerformed', 'objectIdentityEstablished', 'accuracyEstablished'] as const).map((flag) => <li key={flag}>{flag} {String(computation[flag])}</li>)}</ul>
          <ul className="m-0 pl-4 flex flex-col gap-0.5" style={muted}>{SURFACE_NONCLAIMS.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>

        <Part title="Frames: sensor → body → world" testId="frames">
          <p className="m-0 text-[12px]" style={muted}>A supplied point travels from its sensor frame through the named calibration into the session’s body frame, then through the named pose into the declared world frame. Select an observation to see its chain judged at its aligned time: a solid link is valid there, a dashed one is not, a dotted one has no time to be judged at. Nothing links two world frames.</p>
          <FrameDiagram manifest={manifest} selected={selected} onSelect={selectSensor} />
        </Part>

        <Part title="Time: clocks, validity and stamps" testId="time">
          <p className="m-0 text-[12px]" style={muted}>Each clock maps to the common timeline by an exact offset inside a half-open window; each calibration is valid inside its own window; every observation and pose is a stamp. A pose supports a point only at the same nanosecond: a red bracket is a pose that arrived later.</p>
          <TimelineView manifest={manifest} computation={computation} selectedId={selectedId} onSelect={setSelectedId} />
        </Part>

        <Part title={`Observations · ${computation.rows.length}`} testId="observations">
          <div className="overflow-x-auto">
            <table className="ledger-table text-[11.5px]" data-testid="observation-register">
              <thead><tr><th>Observation</th><th>Sensor</th><th>Session</th><th>Aligned time</th><th>State</th><th>Blockers</th><th>Kinds</th></tr></thead>
              <tbody>
                {computation.rows.map((row) => (
                  <tr key={row.observationId} className="row-selectable" data-observation={row.observationId} data-state={row.state} aria-selected={row.observationId === selectedId} onClick={() => setSelectedId(row.observationId)}>
                    <td><button type="button" className="btn btn-sm btn-quiet id whitespace-nowrap" onClick={(event) => { event.stopPropagation(); setSelectedId(row.observationId); }}>{row.observationId}</button></td>
                    <td><span className="mono">{row.modality}</span> <span style={faint}>{row.sensorId}</span></td>
                    <td className="mono">{row.sessionId}</td>
                    <td>{row.alignedTime ? <span className="mono">{row.alignedTime.timeNs} ns <span style={faint}>on {row.alignedTime.timelineId}</span></span> : <span style={faint}>unaligned</span>}</td>
                    <td><span className="mono" style={{ color: STATE_COLOR[row.state] }}>{row.state}</span></td>
                    <td className="mono">{row.blockers.length ? row.blockers.join(' ') : <span style={faint}>none</span>}</td>
                    <td><Badges items={distinctionsFor(manifest, row)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Part>

        <Part title={`Comparisons · ${computation.comparisons.length}`} testId="comparisons">
          <p className="m-0 text-[12px]" style={muted}>Every pair of observations under one operator-asserted association, in one declared world frame. A residual is right minus left, a difference and nothing more.</p>
          <div className="overflow-x-auto">
            <table className="ledger-table text-[11.5px]" data-testid="comparison-register">
              <thead><tr><th>Association</th><th>Left</th><th>Right</th><th>Sessions</th><th>State</th><th>Δ (m)</th><th>Distance (m)</th><th>Time gap</th><th>Limitations</th></tr></thead>
              <tbody>
                {computation.comparisons.map((c) => (
                  <tr key={`${c.leftObservationId}:${c.rightObservationId}`} data-comparison={`${c.leftObservationId}:${c.rightObservationId}`} data-state={c.state}>
                    <td className="mono">{c.associationId}</td>
                    <td><button type="button" className="btn btn-sm btn-quiet id whitespace-nowrap" onClick={() => setSelectedId(c.leftObservationId)}>{c.leftObservationId}</button></td>
                    <td><button type="button" className="btn btn-sm btn-quiet id whitespace-nowrap" onClick={() => setSelectedId(c.rightObservationId)}>{c.rightObservationId}</button></td>
                    <td className="mono">{c.crossSession ? 'cross' : 'same'}</td>
                    <td><span className="mono" style={{ color: STATE_COLOR[c.state] }}>{c.state}</span>{c.blockers.length > 0 && <span className="mono" style={faint}> {c.blockers.join(' ')}</span>}</td>
                    <td className="mono">{c.deltaM ? c.deltaM.map((v) => v.toFixed(3)).join(', ') : <span style={faint}>none</span>}</td>
                    <td className="mono">{c.distanceM === null ? <span style={faint}>none</span> : c.distanceM.toFixed(3)}</td>
                    <td className="mono">{c.timestampDeltaNs === null ? <span style={faint}>not comparable</span> : `${formatNs(c.timestampDeltaNs).human} (${c.timestampDeltaNs} ns)`}</td>
                    <td className="mono text-[10.5px]">{c.limitations.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Part>
      </div>

      {selected && observation && (
        <Inspector id="replay-inspector" kicker={`${selected.modality} observation · ${selected.sessionId}`} title={selected.observationId} subtitle={<Badges items={distinctionsFor(manifest, selected)} />} onClose={() => setSelectedId(null)} focusOnNarrow testId="replay-inspector">
          <div className="inspector-body text-[12px]">
            <section className="inspector-section"><h3>Stamp</h3>
              <dl className="kv m-0"><dt style={faint}>Clock</dt><dd className="m-0 mono">{observation.stamp.clockId} · {manifest.clocks.find((c) => c.id === observation.stamp.clockId)?.basis}</dd><dt style={faint}>Native</dt><dd className="m-0 mono">{observation.stamp.timeNs} ns</dd><dt style={faint}>Meaning</dt><dd className="m-0 mono">{observation.timestampMeaning}{observation.durationNs !== null && ` · duration ${observation.durationNs} ns`}</dd><dt style={faint}>Aligned</dt><dd className="m-0 mono">{selected.alignedTime ? `${selected.alignedTime.timeNs} ns on ${selected.alignedTime.timelineId}${selected.alignedTime.uncertaintyNs ? ` ± ${selected.alignedTime.uncertaintyNs} ns` : ''}` : 'none: no declared mapping to a common timeline'}</dd></dl>
            </section>
            <section className="inspector-section" data-testid="inspector-evidence"><h3>Retained evidence</h3>
              <div><Artifact reference={observation.rawArtifact} /></div>
              <div style={faint}>encoding <span className="mono">{observation.encoding}</span> · processing <span className="mono">{observation.processing.id}</span> {observation.processing.version}</div>
              <div style={faint}>{observation.processing.description}</div>
              {observation.gnss && <div data-testid="inspector-gnss"><span className="label-sm">GNSS</span> <span className="mono">{observation.gnss.receiverSolution}</span> <span style={faint}>· a receiver solution status as recorded, not an accuracy · raw {observation.gnss.rawSolutionStatus ?? 'null'} · corrections {observation.gnss.correctionService ?? 'null'} · age {observation.gnss.correctionAgeNs ?? 'null'}</span></div>}
            </section>
            <section className="inspector-section" data-testid="inspector-estimate"><h3>Supplied estimate</h3>
              {observation.pointEstimate ? (
                <dl className="kv m-0">
                  <dt style={faint}>Point</dt><dd className="m-0 mono">({observation.pointEstimate.sensorPointM.join(', ')}) m in {manifest.sensors.find((s) => s.id === observation.sensorId)?.frameId}</dd>
                  <dt style={faint}>Covariance</dt><dd className="m-0 mono">{observation.pointEstimate.covarianceM2 ? JSON.stringify(observation.pointEstimate.covarianceM2) : 'none supplied'}</dd>
                  <dt style={faint}>Support</dt><dd className="m-0 mono">{observation.pointEstimate.temporalSupport}</dd>
                  <dt style={faint}>Method</dt><dd className="m-0"><span className="mono">{observation.pointEstimate.method.id}</span> {observation.pointEstimate.method.version} <span style={faint}>· {observation.pointEstimate.method.description}</span></dd>
                  <dt style={faint}>Evidence</dt><dd className="m-0">{observation.pointEstimate.evidence.map((e) => <div key={e.acquisitionId}><Artifact reference={e} /></div>)}</dd>
                  <dt style={faint}>Association</dt><dd className="m-0"><span className="mono">{association?.id}</span> <span style={faint}>· {association?.authority} · {association?.description} · {association?.uncertaintyDescription}</span></dd>
                </dl>
              ) : <p className="m-0" style={faint}>{DISTINCTIONS.NO_ESTIMATE.meaning}</p>}
            </section>
            <section className="inspector-section" data-testid="inspector-chain"><h3>Chain at the observation’s time</h3>
              <ol className="m-0 p-0 list-none flex flex-col gap-1">{chain.map((step) => <li key={`${step.role}:${step.id}`} data-step={step.role} data-state={step.state} className="flex flex-col"><div><span className="label-sm">{step.role}</span> <span className="id">{step.id}</span> {step.state !== 'FRAME' && <span className="mono" style={{ color: STATE_COLOR[step.state] }}>{step.state}</span>}</div><div style={faint}>{step.detail}</div>{step.transform && <div className="mono" style={faint}>{formatTransform(step.transform)}</div>}</li>)}</ol>
            </section>
            <section className="inspector-section" data-testid="inspector-placement" data-state={selected.state}><h3>Computed placement</h3>
              {selected.state === 'PLACED_ESTIMATE' ? <div><span className="mono" style={{ color: STATE_COLOR.PLACED_ESTIMATE }}>PLACED_ESTIMATE</span> <span className="mono">({selected.worldPointM!.map((v) => v.toFixed(3)).join(', ')}) m</span> <span style={faint}>in {selected.worldFrameId} · uncertainty {selected.uncertainty} · {DISTINCTIONS.PLACED_ESTIMATE.meaning}</span></div>
                : <div><span className="mono" style={{ color: STATE_COLOR.UNPLACED }}>UNPLACED</span><ul className="m-0 pl-4">{selected.blockers.map((code) => <li key={code}><span className="mono">{code}</span> <span style={faint}>· {BLOCKER_MEANING[code] ?? code}</span></li>)}</ul></div>}
            </section>
            <section className="inspector-section" data-testid="inspector-comparisons"><h3>Comparisons involving it · {comparisons.length}</h3>
              {comparisons.length === 0 ? <p className="m-0" style={faint}>None: no other observation shares an association with it.</p> : <ul className="m-0 p-0 list-none flex flex-col gap-1">{comparisons.map((c) => { const other = c.leftObservationId === selected.observationId ? c.rightObservationId : c.leftObservationId; return <li key={`${c.leftObservationId}:${c.rightObservationId}`} className="flex flex-col"><div><button type="button" className="btn btn-sm btn-quiet id whitespace-nowrap" onClick={() => setSelectedId(other)}>{other}</button> <span className="mono" style={{ color: STATE_COLOR[c.state] }}>{c.state}</span> {c.distanceM !== null && <span className="mono">{c.distanceM.toFixed(3)} m</span>} {c.crossSession && <span style={faint}>· across sessions</span>}</div><div style={faint}>{c.state === 'RESIDUAL_ONLY' ? DISTINCTIONS.RESIDUAL_ONLY.meaning : c.blockers.map((b) => BLOCKER_MEANING[b] ?? b).join(' ')}</div><div className="text-[10.5px]" style={faint}>{c.limitations.map((l) => LIMITATION_MEANING[l] ?? l).join(' ')}</div></li>; })}</ul>}
            </section>
          </div>
        </Inspector>
      )}
    </div>
  );
}
