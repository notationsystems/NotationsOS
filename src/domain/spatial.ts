/**
 * Spatial Inquiry as the surfaces read it: one floor's explicitly declared
 * access, analysed by the local spatial service (docs/spatial/inquiry-v1.md)
 * and drawn as a plan, a graph and a table that share one selection by space
 * id. Nothing here computes access. Depths, reachability, neighbour counts
 * and means are read from the retained result; a null depth is drawn as
 * unknown or unreachable, never as zero; geometry is drawn from validated
 * polygons and is never used to make a passage. Browser-safe; nothing here
 * renders.
 */
import type { AnalysisRequest, EvidenceReference, SpatialLayout } from '@/spatial/contracts';
import type { AnalysisResult } from '@/spatial/analysis';

export type Reachability = 'CONFIRMED' | 'POSSIBLE_ONLY' | 'DISCONNECTED';
export type Access = 'OPEN' | 'CLOSED' | 'UNKNOWN';
/** The closed vocabularies the surfaces accept. Values are validated at this boundary, never cast: a status outside them is a refusal, not a colour. */
export const REACHABILITY_VALUES: readonly Reachability[] = ['CONFIRMED', 'POSSIBLE_ONLY', 'DISCONNECTED'];
export const ACCESS_VALUES: readonly Access[] = ['OPEN', 'CLOSED', 'UNKNOWN'];
const DIRECTION_VALUES = ['BOTH', 'FROM_TO'] as const;
export type Comparison = ReturnType<typeof import('@/spatial/analysis').compare>;
export type SpatialChange = Comparison['changes'][number];
export type ResultPassage = AnalysisResult['passages'][number];

/** The distinct local-analysis projection the service assembles from retained artifacts. It never impersonates the corpus-release projection. */
export interface SpatialProjection {
  schema: 'payload.spatial-analysis-projection.v1';
  sourceKind: 'LOCAL_ANALYSIS';
  receiptDigest: string;
  resultDigest: string;
  source: EvidenceReference;
  layout: SpatialLayout;
  result: AnalysisResult;
  inspection: 'HISTORICAL';
  currentRightsGrant: false;
  mode: 'LOCAL_DEVELOPMENT';
  canonicalAdmission: false;
  independentlyVerified: false;
  sourceTruthClaimed: false;
}
/**
 * The inspection response: a verified receipt and the historical projection.
 * It is not the submission response (which adds `status: CREATED | EXISTING`);
 * a missing or incomplete analysis arrives as a refusal (404, 409), never as
 * an empty projection. The two are typed and handled as different responses.
 */
export interface InspectedAnalysis {
  receipt: { startedAt: string; completedAt: string; digest: string; request: AnalysisRequest; method: { id: string; version: string; scope: string; unknownPolicy: string; meanDepth: string } };
  projection: SpatialProjection;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const SPATIAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
export const isSpatialId = (value: string) => SPATIAL_ID.test(value);

/**
 * The service's answer is trusted only when it is exactly the v1 projection
 * with its flags in the honest position and its result shaped over the same
 * spaces as its layout. Anything else is refused, never drawn.
 */
export function readInspection(value: unknown): InspectedAnalysis {
  const fail = () => new Error('The spatial service returned an inspection outside the v1 contract.');
  if (!isRecord(value) || !isRecord(value.receipt) || !isRecord(value.projection)) throw fail();
  const p = value.projection, r = value.receipt;
  if (p.schema !== 'payload.spatial-analysis-projection.v1' || p.sourceKind !== 'LOCAL_ANALYSIS' || p.inspection !== 'HISTORICAL' || p.mode !== 'LOCAL_DEVELOPMENT') throw fail();
  if (p.currentRightsGrant !== false || p.canonicalAdmission !== false || p.independentlyVerified !== false || p.sourceTruthClaimed !== false) throw fail();
  if (typeof p.receiptDigest !== 'string' || typeof p.resultDigest !== 'string' || !isRecord(p.layout) || !isRecord(p.result) || !isRecord(p.source)) throw fail();
  const layout = p.layout, result = p.result;
  if (layout.schema !== 'payload.spatial-layout.v1' || result.schema !== 'payload.spatial-analysis-result.v1' || !Array.isArray(layout.spaces) || !Array.isArray(layout.passages) || !Array.isArray(result.passages) || !Array.isArray(result.reachability)) throw fail();
  const spaces = layout.spaces as unknown[], passages = layout.passages as unknown[];
  for (const key of ['confirmed', 'possible'] as const) {
    const graph = result[key];
    if (!isRecord(graph) || !Array.isArray(graph.spaces) || graph.spaces.length !== spaces.length || typeof graph.meanDepthDenominator !== 'number' || (graph.meanDepth !== null && typeof graph.meanDepth !== 'number')) throw fail();
    graph.spaces.forEach((space, index) => {
      const declared = spaces[index];
      if (!isRecord(space) || !isRecord(declared) || space.id !== declared.id || (space.depth !== null && (typeof space.depth !== 'number' || !Number.isInteger(space.depth) || space.depth < 0))) throw fail();
    });
  }
  if (result.reachability.length !== spaces.length || result.passages.length !== passages.length) throw fail();
  // Vocabularies are validated here, not cast: the service's types widen them to string.
  result.reachability.forEach((entry, index) => {
    const declared = spaces[index];
    if (!isRecord(entry) || !isRecord(declared) || entry.id !== declared.id || !(REACHABILITY_VALUES as readonly unknown[]).includes(entry.status)) throw fail();
  });
  for (const passage of result.passages) {
    if (!isRecord(passage) || !(ACCESS_VALUES as readonly unknown[]).includes(passage.declaredState) || !(ACCESS_VALUES as readonly unknown[]).includes(passage.effectiveState) || !(DIRECTION_VALUES as readonly unknown[]).includes(passage.direction) || typeof passage.assumed !== 'boolean') throw fail();
  }
  if (typeof r.startedAt !== 'string' || typeof r.completedAt !== 'string' || typeof r.digest !== 'string' || !isRecord(r.request) || !isRecord(r.method)) throw fail();
  return value as unknown as InspectedAnalysis;
}

export function readComparison(value: unknown): Comparison {
  if (!isRecord(value) || value.schema !== 'payload.spatial-comparison.v1' || typeof value.baselineDigest !== 'string' || typeof value.scenarioDigest !== 'string' || !Array.isArray(value.changes)) throw new Error('The spatial service returned a comparison outside the v1 contract.');
  return value as unknown as Comparison;
}

/* ═══ Reading the result without recomputing it ═══ */

export const REACHABILITY_MEANING: Record<Reachability, string> = {
  CONFIRMED: 'Reachable from the root through passages declared open with every condition satisfied.',
  POSSIBLE_ONLY: 'Reachable only if at least one unknown passage or condition turns out to allow access.',
  DISCONNECTED: 'Not reachable from the root even if every unknown passage allowed access.',
};
export const REACHABILITY_TONE: Record<Reachability, string> = { CONFIRMED: 'var(--check-passed)', POSSIBLE_ONLY: 'var(--status-conditional)', DISCONNECTED: 'var(--text-muted)' };
export const ACCESS_MEANING: Record<Access, string> = {
  OPEN: 'Declared open, every condition satisfied: traversable in the confirmed graph.',
  CLOSED: 'Declared closed, or a condition unsatisfied: not traversable in either graph.',
  UNKNOWN: 'Declared unknown, or a condition unknown: traversable only in the possible graph. An unresolved passage.',
};

/** A depth is a count of passages from the root; null is not zero. In the confirmed graph a space that is only possibly reachable has an unknown depth; a space no graph reaches is unreachable. */
export function depthText(confirmed: number | null, possible: number | null): { confirmed: string; possible: string } {
  return {
    confirmed: confirmed !== null ? String(confirmed) : possible !== null ? 'unknown' : 'unreachable',
    possible: possible !== null ? String(possible) : 'unreachable',
  };
}

/** The mean is shown with its denominator: closing a passage shrinks the reachable set, so a smaller mean is not improved access. */
export function meanDepthText(graph: { meanDepth: number | null; meanDepthDenominator: number }): string {
  if (graph.meanDepth === null) return 'none: no space is reachable beyond the root';
  const mean = Number.isInteger(graph.meanDepth) ? String(graph.meanDepth) : graph.meanDepth.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${mean} over ${graph.meanDepthDenominator} reachable non-root ${graph.meanDepthDenominator === 1 ? 'space' : 'spaces'}`;
}

export function changeText(change: SpatialChange): string {
  const before = depthText(change.baseline.confirmedDepth, change.baseline.possibleDepth);
  const after = depthText(change.scenario.confirmedDepth, change.scenario.possibleDepth);
  return `${change.baseline.reachability} (confirmed ${before.confirmed}, possible ${before.possible}) → ${change.scenario.reachability} (confirmed ${after.confirmed}, possible ${after.possible})`;
}

/** Every passage that names the space, with its effective state as the analysis evaluated it. */
export function passagesOf(result: AnalysisResult, spaceId: string): ResultPassage[] {
  return result.passages.filter((passage) => passage.from === spaceId || passage.to === spaceId);
}

export interface SpaceReading {
  id: string; label: string; status: Reachability; confirmedDepth: number | null; possibleDepth: number | null;
  incomingNeighbors: number; outgoingNeighbors: number; polygonVertices: number | null;
}
export function spaceReadings(projection: SpatialProjection): SpaceReading[] {
  const { layout, result } = projection;
  return layout.spaces.map((space, index) => ({
    id: space.id, label: space.label, status: result.reachability[index].status as Reachability, // validated by readInspection against REACHABILITY_VALUES
    confirmedDepth: result.confirmed.spaces[index].depth, possibleDepth: result.possible.spaces[index].depth,
    incomingNeighbors: result.possible.spaces[index].incomingNeighbors, outgoingNeighbors: result.possible.spaces[index].outgoingNeighbors,
    polygonVertices: space.polygon ? space.polygon.length : null,
  }));
}

/* ═══ The plan: validated polygons, Y flipped for the screen ═══ */

export interface PlanSpace { id: string; label: string; points: string | null; centre: [number, number] | null }
export interface PlanPassage { id: string; from: string; to: string; a: [number, number] | null; b: [number, number] | null }
export interface PlanGeometry { viewBox: string; width: number; height: number; padding: number; extent: number; spaces: PlanSpace[]; passages: PlanPassage[]; undrawn: string[]; units: 'm' | 'mm' }

const fmt = (value: number) => Number(value.toFixed(4)).toString();
type Point = [number, number];

/** Where the segment from `from` towards `to` leaves `polygon`: the boundary crossing nearest `to`. Falls back to `from` when the segment crosses no edge. */
function exitPoint(from: Point, to: Point, polygon: Point[]): Point {
  let best: Point | null = null, bestDistance = Infinity;
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const t = ((a[0] - from[0]) * ey - (a[1] - from[1]) * ex) / denominator;
    const u = ((a[0] - from[0]) * dy - (a[1] - from[1]) * dx) / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const point: Point = [from[0] + t * dx, from[1] + t * dy];
    const distance = Math.hypot(to[0] - point[0], to[1] - point[1]);
    if (distance < bestDistance) { best = point; bestDistance = distance; }
  }
  return best ?? from;
}

/** Screen coordinates from layout coordinates: X right stays, Y up becomes Y down. Only the declared frame is drawn; there is no parent frame to compose. */
export function planGeometry(layout: SpatialLayout): PlanGeometry {
  const points = layout.spaces.flatMap((space) => space.polygon ?? []);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const minX = points.length ? Math.min(...xs) : 0, maxX = points.length ? Math.max(...xs) : 1;
  const minY = points.length ? Math.min(...ys) : 0, maxY = points.length ? Math.max(...ys) : 1;
  const extent = Math.max(maxX - minX, maxY - minY, 1e-9);
  const padding = extent * 0.06;
  const flip = ([x, y]: [number, number]): [number, number] => [x, maxY - y];
  const screens = new Map<string, Point[]>();
  const spaces: PlanSpace[] = layout.spaces.map((space) => {
    if (!space.polygon) return { id: space.id, label: space.label, points: null, centre: null };
    const screen = space.polygon.map(flip);
    screens.set(space.id, screen);
    const centre: Point = [screen.reduce((sum, p) => sum + p[0], 0) / screen.length, screen.reduce((sum, p) => sum + p[1], 0) / screen.length];
    return { id: space.id, label: space.label, points: screen.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' '), centre };
  });
  const centres = new Map(spaces.map((space) => [space.id, space.centre]));
  // A passage is drawn from the boundary of one room to the boundary of the other, so it reads as a doorway between them and never crosses a label. Rooms that touch or overlap fall back to centre-to-centre.
  const passages: PlanPassage[] = layout.passages.map((passage) => {
    const from = centres.get(passage.from) ?? null, to = centres.get(passage.to) ?? null;
    if (!from || !to) return { id: passage.id, from: passage.from, to: passage.to, a: from, b: to };
    const a = exitPoint(from, to, screens.get(passage.from)!), b = exitPoint(to, from, screens.get(passage.to)!);
    const connector = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const overlapping = (b[0] - a[0]) * (to[0] - from[0]) + (b[1] - a[1]) * (to[1] - from[1]) <= 0;
    return connector < extent * 1e-3 || overlapping ? { id: passage.id, from: passage.from, to: passage.to, a: from, b: to } : { id: passage.id, from: passage.from, to: passage.to, a, b };
  });
  const width = maxX - minX + 2 * padding, height = maxY - minY + 2 * padding;
  return {
    viewBox: `${fmt(minX - padding)} ${fmt(-padding)} ${fmt(width)} ${fmt(height)}`, width, height, padding, extent,
    spaces, passages, undrawn: spaces.filter((space) => !space.points).map((space) => space.id), units: layout.frame.units,
  };
}

/* ═══ The graph: spaces in depth columns, passages as arcs ═══ */

export interface GraphNode { id: string; label: string; column: number; row: number; x: number; y: number; status: Reachability }
export interface GraphEdge { id: string; from: string; to: string; direction: 'BOTH' | 'FROM_TO'; effectiveState: Access; declaredState: Access; assumed: boolean; x1: number; y1: number; x2: number; y2: number }
export interface GraphLayout { nodes: GraphNode[]; edges: GraphEdge[]; columns: { index: number; label: string; x: number }[]; width: number; height: number }
export const NODE = { width: 116, height: 34, columnGap: 172, rowGap: 52, margin: 24 } as const;

/** Columns are possible-graph depths (the widest reading), disconnected spaces in a last column; positions are a reading order, never a distance. */
export function graphLayout(projection: SpatialProjection): GraphLayout {
  const readings = spaceReadings(projection);
  const maxDepth = Math.max(0, ...readings.map((r) => r.possibleDepth ?? -1));
  const disconnectedColumn = maxDepth + 1;
  const columnOf = (r: SpaceReading) => (r.possibleDepth ?? disconnectedColumn);
  const rows = new Map<number, number>();
  const nodes: GraphNode[] = [...readings].sort((a, b) => columnOf(a) - columnOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((r) => {
    const column = columnOf(r), row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { id: r.id, label: r.label, column, row, x: NODE.margin + column * NODE.columnGap, y: NODE.margin + 18 + row * NODE.rowGap, status: r.status };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = projection.result.passages.map((p) => {
    const a = byId.get(p.from)!, b = byId.get(p.to)!;
    const forward = a.x <= b.x;
    return { id: p.id, from: p.from, to: p.to, direction: p.direction, effectiveState: p.effectiveState, declaredState: p.declaredState, assumed: p.assumed,
      x1: a.x + (forward ? NODE.width : 0), y1: a.y + NODE.height / 2, x2: b.x + (forward ? 0 : NODE.width), y2: b.y + NODE.height / 2 };
  });
  const usedColumns = [...new Set(nodes.map((n) => n.column))].sort((a, b) => a - b);
  const columns = usedColumns.map((index) => ({ index, x: NODE.margin + index * NODE.columnGap, label: index === disconnectedColumn && readings.some((r) => r.possibleDepth === null) ? 'disconnected' : index === 0 ? 'depth 0 · root' : `depth ${index}` }));
  const maxRows = Math.max(1, ...rows.values());
  return { nodes, edges, columns, width: NODE.margin * 2 + (usedColumns.length ? usedColumns[usedColumns.length - 1] : 0) * NODE.columnGap + NODE.width, height: NODE.margin + 18 + maxRows * NODE.rowGap + NODE.margin };
}

/* ═══ A selection is a link ═══ */

/** `#space=<id>`; anything else is ignored whole. */
export function parseSelection(hash: string): string | null {
  const match = /^#?space=([A-Za-z0-9][A-Za-z0-9._:-]{0,95})$/.exec(hash);
  return match ? match[1] : null;
}
export const formatSelection = (spaceId: string) => `space=${spaceId}`;

/* ═══ What this is, and is not ═══ */

export const SPATIAL_NONCLAIMS = [
  'Not Space Syntax: depth and reachability over explicitly declared passages; no integration, choice, axial or visibility measure.',
  'Not behaviour: no footfall, movement or evacuation prediction.',
  'Not measured geometry: the plan is a manually annotated synthetic drawing, and geometry is never used to create a passage — touching outlines are not a doorway.',
  'Not canonical: a local analysis over retained evidence, historically inspected; nothing is admitted to any corpus and no current rights are granted.',
] as const;

export const SPATIAL_REMEDY = 'Start the app with PAYLOAD_PRODUCTION_LOCAL=1 and PAYLOAD_PRODUCTION_DIR pointing at a retained spatial evidence directory. The demonstration is written by: npx esbuild scripts/spatial-demo.ts --bundle --platform=node --format=esm --outfile=.stamp/spatial-demo.mjs && node .stamp/spatial-demo.mjs (evidence in .payload/spatial-demo).';

/** What the service's refusal means for the reader. Codes are shown verbatim beside these. */
export const FAILURE_MEANING: Record<string, string> = {
  LOCAL_MODE_DISABLED: 'The local analysis service is not enabled on this origin.',
  LOCAL_ONLY: 'The service answers only same-origin loopback requests.',
  SPATIAL_ANALYSIS_NOT_FOUND: 'No saved analysis has this request id in the configured evidence directory.',
  SPATIAL_ANALYSIS_INCOMPLETE: 'This request id was reserved but its result was never confirmed; it is inspectable as incomplete and cannot silently rerun.',
  INVALID_STORED_SPATIAL_ANALYSIS: 'The retained artifacts or their source bindings failed integrity verification.',
  INVALID_SPATIAL_ID: 'The request id is outside the bounded identifier form.',
  SPATIAL_COMPARISON_INCOMPATIBLE: 'The two analyses do not share source, layout, method and root, so they cannot be compared.',
  SPATIAL_ANALYSIS_NOT_AVAILABLE: 'The service could not be reached on this origin.',
};
