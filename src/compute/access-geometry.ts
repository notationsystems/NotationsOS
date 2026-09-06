/**
 * Two explicit distance semantics over one declared local Cartesian frame.
 *
 * Edge lengths are caller-declared walking-polyline lengths, not inferred from
 * endpoint chords. Only PERMITTED edges participate; UNKNOWN is not permission.
 * Scenarios remove edges from the immutable base graph. A disconnected route
 * stays UNREACHABLE: Euclidean distance is never substituted for a path.
 */
export type AccessVec3 = readonly [number, number, number];
export type AccessFrame = {
  id: string;
  kind: 'LOCAL_CARTESIAN';
  units: 'METRE';
  handedness: 'RIGHT_HANDED';
};
export type AccessNode = { id: string; positionM: AccessVec3 };
export type AccessEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  direction: 'DIRECTED' | 'BIDIRECTIONAL';
  lengthM: number;
  access: 'PERMITTED' | 'PROHIBITED' | 'UNKNOWN';
};
export type AccessScenario = { id: string; closedEdgeIds: readonly string[] };
export type AccessGeometryInput = {
  frame: AccessFrame;
  nodes: readonly AccessNode[];
  edges: readonly AccessEdge[];
  startNodeId: string;
  endNodeId: string;
  scenarios: readonly AccessScenario[];
};

type RouteExclusions = {
  metric: 'PERMITTED_NETWORK_LENGTH';
  excludedUnknownEdgeIds: string[];
  excludedProhibitedEdgeIds: string[];
  closedEdgeIds: string[];
};
export type AccessRouteResult = RouteExclusions & (
  | { status: 'REACHABLE'; distanceM: number; nodeIds: string[]; edgeIds: string[] }
  | { status: 'UNREACHABLE'; distanceM: null; nodeIds: []; edgeIds: [] }
);
export type AccessGeometryResult = {
  frame: AccessFrame;
  startNodeId: string;
  endNodeId: string;
  straightLine: { metric: 'EUCLIDEAN_3D'; distanceM: number };
  base: AccessRouteResult;
  scenarios: Array<{ id: string; result: AccessRouteResult }>;
  claims: {
    liveAccessVerified: false;
    safetyEstablished: false;
    travelTimeEstimated: false;
    ellipsoidalDistanceComputed: false;
    surfaceMeshDistanceComputed: false;
  };
};

export const ACCESS_GEOMETRY_ALGORITHM = Object.freeze({
  id: 'LOCAL_CARTESIAN_AND_PERMITTED_NETWORK', version: '1.0.0',
  straightLine: 'EUCLIDEAN_3D', network: 'DIJKSTRA_POSITIVE_DECLARED_LENGTH',
  tieBreak: 'EXACT_DISTANCE_THEN_LEXICOGRAPHIC_EDGE_IDS_THEN_NODE_IDS',
  maximumNodes: 128, maximumEdges: 256, maximumScenarios: 8,
  maximumAbsoluteCoordinateM: 1e6, minimumEdgeLengthM: 1e-6, maximumEdgeLengthM: 1e7,
  chordToleranceAbsoluteM: 1e-9, chordToleranceRelative: 1e-12,
  chordToleranceMeaning: 'VALIDATION_ROUNDOFF_ONLY_NOT_MEASUREMENT_UNCERTAINTY',
});

const IDENTIFIER = /^[A-Za-z0-9_-]{1,80}$/;
function invalid(): never { throw new Error('ACCESS_GEOMETRY_INVALID_INPUT'); }
function identifier(value: unknown): value is string { return typeof value === 'string' && IDENTIFIER.test(value); }
function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function fields(value: unknown, expected: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) invalid();
  if (keys.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) invalid();
}
function array(value: unknown, minimum: number, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
  }
}
function compareId(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function chord(left: AccessVec3, right: AccessVec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function validate(input: AccessGeometryInput): void {
  fields(input, ['frame', 'nodes', 'edges', 'startNodeId', 'endNodeId', 'scenarios']);
  fields(input.frame, ['id', 'kind', 'units', 'handedness']);
  if (!identifier(input.frame.id) || input.frame.kind !== 'LOCAL_CARTESIAN' || input.frame.units !== 'METRE' ||
      input.frame.handedness !== 'RIGHT_HANDED') invalid();
  array(input.nodes, 2, 128);
  array(input.edges, 1, 256);
  array(input.scenarios, 0, 8);
  const nodes = new Map<string, AccessNode>();
  for (const node of input.nodes) {
    fields(node, ['id', 'positionM']);
    if (!identifier(node.id) || nodes.has(node.id)) invalid();
    array(node.positionM, 3, 3);
    if (node.positionM.some((coordinate) => !boundedNumber(coordinate, -1e6, 1e6))) invalid();
    nodes.set(node.id, node);
  }
  if (!identifier(input.startNodeId) || !identifier(input.endNodeId) ||
      !nodes.has(input.startNodeId) || !nodes.has(input.endNodeId)) invalid();
  const edgeIds = new Set<string>();
  for (const edge of input.edges) {
    fields(edge, ['id', 'fromNodeId', 'toNodeId', 'direction', 'lengthM', 'access']);
    if (!identifier(edge.id) || edgeIds.has(edge.id) || !identifier(edge.fromNodeId) || !identifier(edge.toNodeId) ||
        !nodes.has(edge.fromNodeId) || !nodes.has(edge.toNodeId) || edge.fromNodeId === edge.toNodeId ||
        (edge.direction !== 'DIRECTED' && edge.direction !== 'BIDIRECTIONAL') ||
        !boundedNumber(edge.lengthM, 1e-6, 1e7) ||
        (edge.access !== 'PERMITTED' && edge.access !== 'PROHIBITED' && edge.access !== 'UNKNOWN')) invalid();
    const separation = chord(nodes.get(edge.fromNodeId)!.positionM, nodes.get(edge.toNodeId)!.positionM);
    const tolerance = ACCESS_GEOMETRY_ALGORITHM.chordToleranceAbsoluteM +
      ACCESS_GEOMETRY_ALGORITHM.chordToleranceRelative * separation;
    if (separation - edge.lengthM > tolerance) throw new Error('ACCESS_GEOMETRY_LENGTH_SHORTER_THAN_CHORD');
    edgeIds.add(edge.id);
  }
  const scenarioIds = new Set<string>();
  for (const scenario of input.scenarios) {
    fields(scenario, ['id', 'closedEdgeIds']);
    if (!identifier(scenario.id) || scenarioIds.has(scenario.id)) invalid();
    array(scenario.closedEdgeIds, 0, 256);
    const closedIds = new Set<string>();
    for (const id of scenario.closedEdgeIds) {
      if (!identifier(id) || !edgeIds.has(id) || closedIds.has(id)) invalid();
      closedIds.add(id);
    }
    scenarioIds.add(scenario.id);
  }
}

type Path = { distanceM: number; nodeIds: string[]; edgeIds: string[] };
function compareIds(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const comparison = compareId(left[index], right[index]);
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length;
}
function comparePaths(left: Path, right: Path): number {
  return left.distanceM - right.distanceM || compareIds(left.edgeIds, right.edgeIds) || compareIds(left.nodeIds, right.nodeIds);
}

function shortestPath(input: AccessGeometryInput, closedEdgeIds: readonly string[]): AccessRouteResult {
  const closed = new Set(closedEdgeIds);
  const exclusions: RouteExclusions = {
    metric: 'PERMITTED_NETWORK_LENGTH',
    excludedUnknownEdgeIds: input.edges.filter((edge) => edge.access === 'UNKNOWN').map((edge) => edge.id).sort(compareId),
    excludedProhibitedEdgeIds: input.edges.filter((edge) => edge.access === 'PROHIBITED').map((edge) => edge.id).sort(compareId),
    closedEdgeIds: [...closedEdgeIds].sort(compareId),
  };
  const adjacency = new Map(input.nodes.map((node) => [node.id, [] as Array<{ edgeId: string; to: string; lengthM: number }>]));
  for (const edge of [...input.edges].sort((left, right) => compareId(left.id, right.id))) {
    if (edge.access !== 'PERMITTED' || closed.has(edge.id)) continue;
    adjacency.get(edge.fromNodeId)!.push({ edgeId: edge.id, to: edge.toNodeId, lengthM: edge.lengthM });
    if (edge.direction === 'BIDIRECTIONAL') {
      adjacency.get(edge.toNodeId)!.push({ edgeId: edge.id, to: edge.fromNodeId, lengthM: edge.lengthM });
    }
  }
  const settled = new Set<string>();
  const paths = new Map<string, Path>([[input.startNodeId, { distanceM: 0, nodeIds: [input.startNodeId], edgeIds: [] }]]);
  const orderedNodeIds = input.nodes.map((node) => node.id).sort(compareId);
  while (settled.size < input.nodes.length) {
    let at: string | undefined;
    let current: Path | undefined;
    for (const nodeId of orderedNodeIds) {
      const candidate = paths.get(nodeId);
      if (!settled.has(nodeId) && candidate && (!current || comparePaths(candidate, current) < 0)) {
        at = nodeId;
        current = candidate;
      }
    }
    if (!at || !current) break;
    if (at === input.endNodeId) return { ...exclusions, status: 'REACHABLE', ...current };
    settled.add(at);
    for (const edge of adjacency.get(at)!) {
      if (settled.has(edge.to)) continue;
      const candidate: Path = {
        distanceM: current.distanceM + edge.lengthM,
        nodeIds: [...current.nodeIds, edge.to], edgeIds: [...current.edgeIds, edge.edgeId],
      };
      const previous = paths.get(edge.to);
      if (!previous || comparePaths(candidate, previous) < 0) paths.set(edge.to, candidate);
    }
  }
  return { ...exclusions, status: 'UNREACHABLE', distanceM: null, nodeIds: [], edgeIds: [] };
}

/** No providers, filesystem, clock, inferred topology, or mutable global state. */
export function evaluateAccessGeometry(input: AccessGeometryInput): AccessGeometryResult {
  validate(input);
  const start = input.nodes.find((node) => node.id === input.startNodeId)!;
  const end = input.nodes.find((node) => node.id === input.endNodeId)!;
  return {
    frame: { ...input.frame }, startNodeId: input.startNodeId, endNodeId: input.endNodeId,
    straightLine: { metric: 'EUCLIDEAN_3D', distanceM: chord(start.positionM, end.positionM) },
    base: shortestPath(input, []),
    scenarios: [...input.scenarios].sort((left, right) => compareId(left.id, right.id))
      .map((scenario) => ({ id: scenario.id, result: shortestPath(input, scenario.closedEdgeIds) })),
    claims: {
      liveAccessVerified: false, safetyEstablished: false, travelTimeEstimated: false,
      ellipsoidalDistanceComputed: false, surfaceMeshDistanceComputed: false,
    },
  };
}
