/**
 * The recorded-observation replay contract, made understandable: pure
 * derivations over a manifest and its computation for the frame diagram, the
 * timeline, the observation register and the inspector. Nothing here computes
 * a placement, propagates an uncertainty or infers an identity; every number
 * shown is the contract's or the computation's, and every state is named.
 */
import type { ReplayManifest } from '@/observation/contract';
import type { ReplayComputation, ReplayRow } from '@/observation/replay';

export type Manifest = ReplayManifest;
export type Computation = ReplayComputation;
export type Comparison = ReplayComputation['comparisons'][number];
type Transform = Manifest['calibrations'][number]['sensorToBody'];

export const BLOCKER_MEANING: Record<string, string> = {
  CLOCK_ALIGNMENT_UNAVAILABLE: 'The observation’s clock declares no mapping to the common timeline, or the stamp falls outside the mapping’s validity. No implicit conversion is made.',
  NO_POINT_ESTIMATE: 'No point estimate was supplied for this observation. Nothing is extracted from the raw bytes.',
  POINT_TIME_UNRESOLVED: 'The supplied point is not asserted to refer to the observation’s reference stamp, so no pose can support it.',
  TIMESTAMP_MEANING_UNRESOLVED: 'The stamp’s meaning (instant, start, midpoint, end) is unknown, so the point has no defined time.',
  CALIBRATION_NOT_VALID_AT_OBSERVATION: 'The named calibration’s half-open validity window does not contain the observation’s aligned time, or lies on another timeline.',
  POSE_CLOCK_ALIGNMENT_UNAVAILABLE: 'The named pose’s stamp cannot be aligned to the same timeline as the observation.',
  POSE_TIME_MISMATCH: 'The named pose is stamped at a different nanosecond than the observation. Exact support only: no interpolation, no nearest pose.',
  POSITION_UNAVAILABLE: 'One side of the comparison has no computed placement.',
  WORLD_FRAME_MISMATCH: 'The two placements are in different declared world frames; no equivalence between world frames is inferred.',
};

export const LIMITATION_MEANING: Record<string, string> = {
  UNCERTAINTY_NOT_PROPAGATED: 'Supplied covariances are preserved as supplied; none is propagated through the transforms.',
  ASSOCIATION_UNVERIFIED: 'The correspondence between the two observations is an operator assertion, not a verified identity.',
  NO_STATIC_SCENE_OR_MOTION_MODEL: 'Nothing assumes the object stood still or moved in any particular way between the two observations.',
};

/** The closed vocabulary that keeps kinds of thing apart on the surface. */
export const DISTINCTIONS = {
  SYNTHETIC_INPUT: { label: 'synthetic input', meaning: 'Invented analytic input. It is never field evidence, whatever it is used to demonstrate.' },
  RECORDED_INPUT: { label: 'recorded input', meaning: 'Bytes retained from a recording under a declared source registration.' },
  SUPPLIED_ESTIMATE: { label: 'supplied estimate', meaning: 'A point supplied by the declared method with its own evidence; not extracted from the raw bytes by this system.' },
  NO_ESTIMATE: { label: 'no estimate', meaning: 'The observation carries raw bytes and a stamp, and no point.' },
  PLACED_ESTIMATE: { label: 'placed estimate', meaning: 'The supplied point, carried through the named calibration and pose into the declared world frame. Uncertainty is not propagated; accuracy is not established.' },
  UNRESOLVED_PLACEMENT: { label: 'unresolved placement', meaning: 'The point could not be placed: its support fails in the ways the blockers name.' },
  RESIDUAL_ONLY: { label: 'residual only', meaning: 'The difference between two placed estimates under one operator-asserted association. Not accuracy, not identity, not motion.' },
} as const;
export type Distinction = keyof typeof DISTINCTIONS;

export function distinctionsFor(manifest: Manifest, row: ReplayRow): Distinction[] {
  const observation = manifest.observations.find((o) => o.id === row.observationId);
  const out: Distinction[] = [manifest.evidenceClass === 'SYNTHETIC_TEST' ? 'SYNTHETIC_INPUT' : 'RECORDED_INPUT'];
  out.push(observation?.pointEstimate ? 'SUPPLIED_ESTIMATE' : 'NO_ESTIMATE');
  if (observation?.pointEstimate) out.push(row.state === 'PLACED_ESTIMATE' ? 'PLACED_ESTIMATE' : 'UNRESOLVED_PLACEMENT');
  return out;
}

const NS = BigInt(1_000_000_000);
/** Exact nanoseconds, and a human reading of them. Never a float in the exact part. */
export function formatNs(ns: string): { exact: string; human: string } {
  const value = BigInt(ns);
  const sign = value < BigInt(0) ? '-' : '';
  const abs = value < BigInt(0) ? -value : value;
  const seconds = abs / NS; const rest = abs % NS;
  const human = seconds >= BigInt(1) ? `${sign}${seconds}.${rest.toString().padStart(9, '0').slice(0, 3)} s`
    : rest >= BigInt(1_000_000) ? `${sign}${(Number(rest) / 1e6).toFixed(3).replace(/\.?0+$/, '')} ms`
      : rest >= BigInt(1000) ? `${sign}${(Number(rest) / 1e3).toFixed(3).replace(/\.?0+$/, '')} µs` : `${sign}${rest} ns`;
  return { exact: ns, human };
}

function inWindow(timeNs: string, fromNs: string, untilNs: string): boolean {
  return BigInt(timeNs) >= BigInt(fromNs) && BigInt(timeNs) < BigInt(untilNs);
}
function aligned(manifest: Manifest, stamp: { clockId: string; timeNs: string }): { timelineId: string; timeNs: string } | null {
  const alignment = manifest.clocks.find((clock) => clock.id === stamp.clockId)?.alignment;
  if (!alignment || !inWindow(stamp.timeNs, alignment.validFromNs, alignment.validUntilNs)) return null;
  return { timelineId: alignment.timelineId, timeNs: String(BigInt(stamp.timeNs) + BigInt(alignment.offsetNs)) };
}

export type ChainStep = { role: 'SENSOR' | 'CALIBRATION' | 'BODY' | 'POSE' | 'WORLD'; id: string; state: 'VALID' | 'INVALID' | 'UNAVAILABLE' | 'FRAME'; detail: string; transform?: Transform };
/** The chain a supplied point travels: sensor frame → calibration → body frame → pose → world frame, each link judged at the observation's aligned time. */
export function frameChain(manifest: Manifest, row: ReplayRow): ChainStep[] {
  const observation = manifest.observations.find((o) => o.id === row.observationId)!;
  const sensor = manifest.sensors.find((s) => s.id === observation.sensorId)!;
  const session = manifest.sessions.find((s) => s.id === sensor.sessionId)!;
  const point = observation.pointEstimate;
  const time = aligned(manifest, observation.stamp);
  const steps: ChainStep[] = [{ role: 'SENSOR', id: sensor.frameId, state: 'FRAME', detail: `${sensor.modality} sensor frame of ${sensor.id}` }];
  if (!point) {
    steps.push({ role: 'CALIBRATION', id: '(none)', state: 'UNAVAILABLE', detail: 'No supplied point, so no calibration is asked to carry one.' });
  } else {
    const calibration = manifest.calibrations.find((c) => c.id === point.calibrationId)!;
    const valid = time !== null && calibration.timelineId === time.timelineId && inWindow(time.timeNs, calibration.validFromNs, calibration.validUntilNs);
    steps.push({ role: 'CALIBRATION', id: calibration.id, state: time === null ? 'UNAVAILABLE' : valid ? 'VALID' : 'INVALID', transform: calibration.sensorToBody,
      detail: `${calibration.fromFrameId} → ${calibration.toFrameId}, version ${calibration.version}, valid [${formatNs(calibration.validFromNs).exact}, ${formatNs(calibration.validUntilNs).exact}) on ${calibration.timelineId}${time === null ? '; the observation has no aligned time to judge it at' : valid ? '; valid at the observation' : '; not valid at the observation'}` });
  }
  steps.push({ role: 'BODY', id: session.bodyFrameId, state: 'FRAME', detail: `Body frame of ${session.id}` });
  if (!point) {
    steps.push({ role: 'POSE', id: '(none)', state: 'UNAVAILABLE', detail: 'No supplied point, so no pose is asked to carry one.' });
  } else {
    const pose = manifest.poses.find((p) => p.id === point.poseId)!;
    const poseTime = aligned(manifest, pose.stamp);
    const comparable = time !== null && poseTime !== null && poseTime.timelineId === time.timelineId;
    const delta = comparable ? String(BigInt(poseTime!.timeNs) - BigInt(time!.timeNs)) : null;
    steps.push({ role: 'POSE', id: pose.id, state: !comparable ? 'UNAVAILABLE' : delta === '0' ? 'VALID' : 'INVALID', transform: pose.bodyToWorld,
      detail: `${pose.bodyFrameId} → ${pose.worldFrameId}, stamped ${pose.stamp.timeNs} on ${pose.stamp.clockId}${!comparable ? '; not alignable with the observation’s time' : delta === '0' ? '; the same nanosecond as the observation' : `; ${formatNs(delta!).human} (${delta} ns) from the observation, so it cannot support the point`}` });
  }
  steps.push({ role: 'WORLD', id: session.worldFrameId, state: 'FRAME', detail: `Declared world frame of ${session.id}; no geographic registration` });
  return steps;
}

export interface DiagramNode { id: string; column: 0 | 1 | 2; x: number; y: number; label: string; sub: string; sessionId: string | null; active: boolean }
export interface DiagramEdge { id: string; kind: 'CALIBRATION' | 'POSE'; from: string; to: string; label: string; state: 'VALID' | 'INVALID' | 'UNAVAILABLE' | 'IDLE' }
export interface Diagram { width: number; height: number; nodes: DiagramNode[]; edges: DiagramEdge[] }
const COLUMN_X = [90, 330, 570] as const;
const ROW_H = 34;

/** Sensor frames in the first column, body frames in the second, world frames in the third; the selected observation's chain is active. */
export function diagramLayout(manifest: Manifest, selected: ReplayRow | null): Diagram {
  const chain = selected ? frameChain(manifest, selected) : [];
  const activeIds = new Set(chain.map((step) => step.id));
  const nodes: DiagramNode[] = [];
  let y = 28;
  const worlds = [...new Set(manifest.sessions.map((s) => s.worldFrameId))];
  for (const session of manifest.sessions) {
    const sensors = manifest.sensors.filter((s) => s.sessionId === session.id);
    const top = y;
    for (const sensor of sensors) { nodes.push({ id: sensor.frameId, column: 0, x: COLUMN_X[0], y, label: sensor.id, sub: `${sensor.modality} frame`, sessionId: session.id, active: activeIds.has(sensor.frameId) }); y += ROW_H; }
    const middle = top + Math.max(0, (sensors.length - 1) * ROW_H) / 2;
    nodes.push({ id: session.bodyFrameId, column: 1, x: COLUMN_X[1], y: middle, label: session.bodyFrameId, sub: `body frame · ${session.id}`, sessionId: session.id, active: activeIds.has(session.bodyFrameId) });
    y += 12;
  }
  const height = Math.max(y + 8, 90);
  worlds.forEach((world, index) => nodes.push({ id: world, column: 2, x: COLUMN_X[2], y: height / (worlds.length + 1) * (index + 1), label: world, sub: 'world frame', sessionId: null, active: activeIds.has(world) }));
  const stateOf = (id: string): DiagramEdge['state'] => { const step = chain.find((s) => s.id === id); return step && step.state !== 'FRAME' ? step.state : 'IDLE'; };
  const edges: DiagramEdge[] = [
    ...manifest.calibrations.map((c) => ({ id: c.id, kind: 'CALIBRATION' as const, from: c.fromFrameId, to: c.toFrameId, label: `${c.id} v${c.version}`, state: stateOf(c.id) })),
    ...manifest.poses.map((p) => ({ id: p.id, kind: 'POSE' as const, from: p.bodyFrameId, to: p.worldFrameId, label: p.id, state: stateOf(p.id) })),
  ];
  return { width: 660, height, nodes, edges };
}

/** Ticks at the same exact nanosecond in one lane fan out: stack is a tick's place in that cluster, stackSize the cluster's size. */
export interface TimelineTick { id: string; kind: 'OBSERVATION' | 'POSE'; lane: string; seconds: number; exactNs: string; state: 'PLACED_ESTIMATE' | 'UNPLACED' | 'POSE'; stack: number; stackSize: number }
export interface TimelineWindow { id: string; kind: 'CLOCK' | 'CALIBRATION'; lane: string; fromSeconds: number; untilSeconds: number; label: string }
export interface Mismatch { observationId: string; poseId: string; fromSeconds: number; toSeconds: number; deltaNs: string; lane: string }
export interface Timeline { timelineId: string | null; originNs: string | null; spanSeconds: number; lanes: string[]; /** The largest cluster of coincident ticks in each lane. */ laneStacks: Record<string, number>; windows: TimelineWindow[]; ticks: TimelineTick[]; mismatches: Mismatch[]; unaligned: Array<{ observationId: string; clockId: string; basis: string; timeNs: string }> }

/** Everything on the declared common timeline, as seconds from the earliest instant it carries; exact nanoseconds kept beside each. Observations that cannot be aligned are listed apart, on their own clocks. */
export function timelineModel(manifest: Manifest, computation: Computation): Timeline {
  const timelineIds = [...new Set(manifest.clocks.map((c) => c.alignment?.timelineId).filter((id): id is string => !!id))];
  const timelineId = timelineIds[0] ?? null;
  const instants: bigint[] = [];
  const clockWindows = manifest.clocks.filter((c) => c.alignment && c.alignment.timelineId === timelineId).map((c) => ({ clock: c, from: BigInt(c.alignment!.validFromNs) + BigInt(c.alignment!.offsetNs), until: BigInt(c.alignment!.validUntilNs) + BigInt(c.alignment!.offsetNs) }));
  const calibrationWindows = manifest.calibrations.filter((c) => c.timelineId === timelineId).map((c) => ({ calibration: c, from: BigInt(c.validFromNs), until: BigInt(c.validUntilNs) }));
  for (const w of clockWindows) instants.push(w.from, w.until);
  for (const w of calibrationWindows) instants.push(w.from, w.until);
  const observationTimes = computation.rows.map((row) => ({ row, time: row.alignedTime && row.alignedTime.timelineId === timelineId ? BigInt(row.alignedTime.timeNs) : null }));
  const poseTimes = manifest.poses.map((pose) => ({ pose, time: (() => { const a = aligned(manifest, pose.stamp); return a && a.timelineId === timelineId ? BigInt(a.timeNs) : null; })() }));
  for (const o of observationTimes) if (o.time !== null) instants.push(o.time);
  for (const p of poseTimes) if (p.time !== null) instants.push(p.time);
  if (!timelineId || instants.length === 0) return { timelineId, originNs: null, spanSeconds: 0, lanes: [], laneStacks: {}, windows: [], ticks: [], mismatches: [], unaligned: computation.rows.map((row) => { const o = manifest.observations.find((x) => x.id === row.observationId)!; const clock = manifest.clocks.find((c) => c.id === o.stamp.clockId)!; return { observationId: row.observationId, clockId: clock.id, basis: clock.basis, timeNs: o.stamp.timeNs }; }) };
  const origin = instants.reduce((a, b) => (a < b ? a : b));
  const end = instants.reduce((a, b) => (a > b ? a : b));
  const seconds = (ns: bigint) => Number(ns - origin) / 1e9;
  const lanes: string[] = [];
  const lane = (id: string) => { if (!lanes.includes(id)) lanes.push(id); return id; };
  const windows: TimelineWindow[] = [
    ...clockWindows.map((w) => ({ id: w.clock.id, kind: 'CLOCK' as const, lane: lane(`clock · ${w.clock.id}`), fromSeconds: seconds(w.from), untilSeconds: seconds(w.until), label: `${w.clock.id} → ${timelineId}, offset ${w.clock.alignment!.offsetNs} ns${w.clock.alignment!.uncertaintyNs ? ` ± ${w.clock.alignment!.uncertaintyNs} ns` : ''}` })),
    ...calibrationWindows.map((w) => ({ id: w.calibration.id, kind: 'CALIBRATION' as const, lane: lane(`calibration · ${w.calibration.sensorId}`), fromSeconds: seconds(w.from), untilSeconds: seconds(w.until), label: `${w.calibration.id} v${w.calibration.version}` })),
  ];
  const ticks: TimelineTick[] = [];
  for (const o of observationTimes) if (o.time !== null) ticks.push({ id: o.row.observationId, kind: 'OBSERVATION', lane: lane(`observations · ${o.row.sessionId}`), seconds: seconds(o.time), exactNs: o.time.toString(), state: o.row.state, stack: 0, stackSize: 1 });
  for (const p of poseTimes) if (p.time !== null) ticks.push({ id: p.pose.id, kind: 'POSE', lane: lane(`poses · ${p.pose.sessionId}`), seconds: seconds(p.time), exactNs: p.time.toString(), state: 'POSE', stack: 0, stackSize: 1 });
  // Coincident ticks in a lane keep their exact instant and fan out, so each stays visible and selectable.
  const clusters = new Map<string, TimelineTick[]>();
  for (const tick of ticks) { const key = `${tick.lane}@${tick.exactNs}`; clusters.set(key, [...(clusters.get(key) ?? []), tick]); }
  const laneStacks: Record<string, number> = {};
  for (const cluster of clusters.values()) { cluster.forEach((tick, index) => { tick.stack = index; tick.stackSize = cluster.length; }); laneStacks[cluster[0].lane] = Math.max(laneStacks[cluster[0].lane] ?? 1, cluster.length); }
  for (const id of lanes) laneStacks[id] = laneStacks[id] ?? 1;
  const mismatches: Mismatch[] = [];
  for (const o of observationTimes) {
    if (o.time === null || !o.row.poseDeltaNs || o.row.poseDeltaNs === '0') continue;
    const observation = manifest.observations.find((x) => x.id === o.row.observationId)!;
    const poseId = observation.pointEstimate?.poseId; if (!poseId) continue;
    mismatches.push({ observationId: o.row.observationId, poseId, fromSeconds: seconds(o.time), toSeconds: seconds(o.time + BigInt(o.row.poseDeltaNs)), deltaNs: o.row.poseDeltaNs, lane: `observations · ${o.row.sessionId}` });
  }
  const unaligned = observationTimes.filter((o) => o.time === null).map((o) => { const observation = manifest.observations.find((x) => x.id === o.row.observationId)!; const clock = manifest.clocks.find((c) => c.id === observation.stamp.clockId)!; return { observationId: o.row.observationId, clockId: clock.id, basis: clock.basis, timeNs: observation.stamp.timeNs }; });
  return { timelineId, originNs: origin.toString(), spanSeconds: Math.max(seconds(end), 1e-9), lanes, laneStacks, windows, ticks, mismatches, unaligned };
}

/** The comparisons an observation takes part in. */
export function comparisonsFor(computation: Computation, observationId: string): Comparison[] {
  return computation.comparisons.filter((c) => c.leftObservationId === observationId || c.rightObservationId === observationId);
}

export function formatTransform(transform: Transform): string {
  const [x, y, z] = transform.translationM; const [qx, qy, qz, qw] = transform.rotationXyzw;
  return `t = (${x}, ${y}, ${z}) m · q(xyzw) = (${qx}, ${qy}, ${qz}, ${qw})`;
}

export const SURFACE_NONCLAIMS = [
  'Nothing here is field evidence: the preview is invented, and says so on every row.',
  'No placement is inferred: a point is placed only where its named calibration and its named pose support it at the same nanosecond.',
  'No identity is established: an association is an operator assertion, and a residual is a difference, not a match.',
  'No uncertainty is propagated and no accuracy is established; the computation says both.',
] as const;
