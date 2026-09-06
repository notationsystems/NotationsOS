import { describe, expect, it, vi } from 'vitest';
import {
  ACCESS_GEOMETRY_ALGORITHM,
  evaluateAccessGeometry,
  type AccessEdge,
  type AccessGeometryInput,
} from './access-geometry';

function graph(): AccessGeometryInput {
  return {
    frame: { id: 'building-local', kind: 'LOCAL_CARTESIAN', units: 'METRE', handedness: 'RIGHT_HANDED' },
    nodes: [
      { id: 'room-a', positionM: [0, 0, 0] }, { id: 'room-b', positionM: [1, 0, 0] },
      { id: 'hall-a', positionM: [0, 5, 0] }, { id: 'hall-b', positionM: [1, 5, 0] },
      { id: 'outside-a', positionM: [0, 10, 0] }, { id: 'outside-b', positionM: [1, 10, 0] },
    ],
    edges: [
      { id: 'a-to-hall', fromNodeId: 'room-a', toNodeId: 'hall-a', direction: 'BIDIRECTIONAL', lengthM: 5, access: 'PERMITTED' },
      { id: 'hall-passage', fromNodeId: 'hall-a', toNodeId: 'hall-b', direction: 'BIDIRECTIONAL', lengthM: 1, access: 'PERMITTED' },
      { id: 'b-to-hall', fromNodeId: 'hall-b', toNodeId: 'room-b', direction: 'BIDIRECTIONAL', lengthM: 5, access: 'PERMITTED' },
      { id: 'a-to-outside', fromNodeId: 'room-a', toNodeId: 'outside-a', direction: 'BIDIRECTIONAL', lengthM: 10, access: 'PERMITTED' },
      { id: 'outside-passage', fromNodeId: 'outside-a', toNodeId: 'outside-b', direction: 'BIDIRECTIONAL', lengthM: 1, access: 'PERMITTED' },
      { id: 'b-to-outside', fromNodeId: 'outside-b', toNodeId: 'room-b', direction: 'BIDIRECTIONAL', lengthM: 10, access: 'PERMITTED' },
      { id: 'unknown-door', fromNodeId: 'room-a', toNodeId: 'room-b', direction: 'BIDIRECTIONAL', lengthM: 1, access: 'UNKNOWN' },
      { id: 'prohibited-door', fromNodeId: 'room-a', toNodeId: 'room-b', direction: 'BIDIRECTIONAL', lengthM: 1, access: 'PROHIBITED' },
    ],
    startNodeId: 'room-a', endNodeId: 'room-b',
    scenarios: [
      { id: 'hall-closed', closedEdgeIds: ['hall-passage'] },
      { id: 'all-closed', closedEdgeIds: ['outside-passage', 'hall-passage'] },
    ],
  };
}
function tiny(): AccessGeometryInput {
  return {
    frame: graph().frame,
    nodes: [{ id: 'a', positionM: [0, 0, 0] }, { id: 'b', positionM: [0, 0, 0] }],
    edges: [{ id: 'ab', fromNodeId: 'a', toNodeId: 'b', direction: 'DIRECTED', lengthM: 1, access: 'PERMITTED' }],
    startNodeId: 'a', endNodeId: 'b', scenarios: [],
  };
}
function evaluateUnknown(input: unknown) { return evaluateAccessGeometry(input as AccessGeometryInput); }

describe('explicit access geometry', () => {
  it('distinguishes adjacent rooms from their declared permitted walking route', () => {
    const result = evaluateAccessGeometry(graph());
    expect(result.straightLine).toEqual({ metric: 'EUCLIDEAN_3D', distanceM: 1 });
    expect(result.base).toEqual({
      metric: 'PERMITTED_NETWORK_LENGTH', status: 'REACHABLE', distanceM: 11,
      nodeIds: ['room-a', 'hall-a', 'hall-b', 'room-b'], edgeIds: ['a-to-hall', 'hall-passage', 'b-to-hall'],
      excludedUnknownEdgeIds: ['unknown-door'], excludedProhibitedEdgeIds: ['prohibited-door'], closedEdgeIds: [],
    });
  });

  it('removes a passage for a scenario without changing the base result', () => {
    const result = evaluateAccessGeometry(graph());
    expect(result.scenarios.find((scenario) => scenario.id === 'hall-closed')?.result).toMatchObject({
      status: 'REACHABLE', distanceM: 21,
      nodeIds: ['room-a', 'outside-a', 'outside-b', 'room-b'], edgeIds: ['a-to-outside', 'outside-passage', 'b-to-outside'],
      closedEdgeIds: ['hall-passage'],
    });
    expect(result.base.distanceM).toBe(11);
  });

  it('preserves unreachable as null and never falls back to the straight line', () => {
    const result = evaluateAccessGeometry(graph());
    expect(result.scenarios.find((scenario) => scenario.id === 'all-closed')?.result).toMatchObject({
      status: 'UNREACHABLE', distanceM: null, nodeIds: [], edgeIds: [],
      closedEdgeIds: ['hall-passage', 'outside-passage'],
    });
    expect(result.straightLine.distanceM).toBe(1);
  });

  it('does not turn declared permission into live, safe, timed, ellipsoidal, or mesh routing', () => {
    expect(evaluateAccessGeometry(graph()).claims).toEqual({
      liveAccessVerified: false, safetyEstablished: false, travelTimeEstimated: false,
      ellipsoidalDistanceComputed: false, surfaceMeshDistanceComputed: false,
    });
  });

  it('uses three coordinates including height in Euclidean distance', () => {
    const input = tiny();
    const result = evaluateAccessGeometry({
      ...input, nodes: [{ id: 'a', positionM: [1, 2, 3] }, { id: 'b', positionM: [4, 6, 15] }],
      edges: [{ ...input.edges[0], lengthM: 20 }],
    });
    expect(result.straightLine.distanceM).toBe(13);
    expect(result.base.distanceM).toBe(20);
  });

  it('uses declared polyline length rather than endpoint chord as edge cost', () => {
    const input = tiny();
    expect(evaluateAccessGeometry({ ...input, edges: [{ ...input.edges[0], lengthM: 15 }] }).base.distanceM).toBe(15);
  });

  it('obeys one-way edges', () => {
    const input = tiny();
    expect(evaluateAccessGeometry(input).base.status).toBe('REACHABLE');
    expect(evaluateAccessGeometry({ ...input, startNodeId: 'b', endNodeId: 'a' }).base.status).toBe('UNREACHABLE');
  });

  it('allows both directions only when explicitly declared', () => {
    const input = tiny();
    expect(evaluateAccessGeometry({
      ...input, edges: [{ ...input.edges[0], direction: 'BIDIRECTIONAL' }], startNodeId: 'b', endNodeId: 'a',
    }).base).toMatchObject({ status: 'REACHABLE', distanceM: 1, nodeIds: ['b', 'a'], edgeIds: ['ab'] });
  });

  it('removes both directions of a bidirectional edge when closed', () => {
    const input = tiny();
    const result = evaluateAccessGeometry({
      ...input, edges: [{ ...input.edges[0], direction: 'BIDIRECTIONAL' }], startNodeId: 'b', endNodeId: 'a',
      scenarios: [{ id: 'closed', closedEdgeIds: ['ab'] }],
    });
    expect(result.base.status).toBe('REACHABLE');
    expect(result.scenarios[0].result.status).toBe('UNREACHABLE');
  });

  it.each(['PROHIBITED', 'UNKNOWN'] as const)('does not traverse %s edges', (access) => {
    const input = tiny();
    const result = evaluateAccessGeometry({ ...input, edges: [{ ...input.edges[0], access }] });
    expect(result.base).toMatchObject({ status: 'UNREACHABLE', distanceM: null });
    expect(result.base[access === 'UNKNOWN' ? 'excludedUnknownEdgeIds' : 'excludedProhibitedEdgeIds']).toEqual(['ab']);
  });

  it('a scenario cannot grant access by listing an already non-permitted edge', () => {
    const input = tiny();
    const result = evaluateAccessGeometry({ ...input, edges: [{ ...input.edges[0], access: 'UNKNOWN' }],
      scenarios: [{ id: 'unknown-closed', closedEdgeIds: ['ab'] }] });
    expect(result.scenarios[0].result).toMatchObject({ status: 'UNREACHABLE', closedEdgeIds: ['ab'], excludedUnknownEdgeIds: ['ab'] });
  });

  it('reports zero length for the same start and end, with no edge traversal', () => {
    const input = tiny();
    const result = evaluateAccessGeometry({ ...input, endNodeId: 'a', scenarios: [{ id: 'closed', closedEdgeIds: ['ab'] }] });
    expect(result.straightLine.distanceM).toBe(0);
    expect(result.base).toMatchObject({ status: 'REACHABLE', distanceM: 0, nodeIds: ['a'], edgeIds: [] });
    expect(result.scenarios[0].result).toMatchObject({ status: 'REACHABLE', distanceM: 0, nodeIds: ['a'], edgeIds: [] });
  });

  it('selects shorter parallel edges and does not collapse their separate identities', () => {
    const input = tiny();
    const result = evaluateAccessGeometry({ ...input, edges: [
      { ...input.edges[0], id: 'long', lengthM: 2 }, { ...input.edges[0], id: 'short', lengthM: 1 },
    ], scenarios: [{ id: 'short-closed', closedEdgeIds: ['short'] }] });
    expect(result.base.edgeIds).toEqual(['short']);
    expect(result.scenarios[0].result).toMatchObject({ distanceM: 2, edgeIds: ['long'] });
  });

  it('breaks exact parallel-edge ties lexicographically by edge ID', () => {
    const input = tiny();
    const edges = ['z', 'a', 'b'].map((id) => ({ ...input.edges[0], id }));
    expect(evaluateAccessGeometry({ ...input, edges }).base.edgeIds).toEqual(['a']);
    expect(evaluateAccessGeometry({ ...input, edges: [...edges].reverse() }).base.edgeIds).toEqual(['a']);
  });

  it('breaks whole-path ties by edge sequence rather than arrival or node ordering', () => {
    const input = tiny();
    const nodes = [...input.nodes, { id: 'z', positionM: [0, 0, 0] as const }, { id: 'c', positionM: [0, 0, 0] as const }];
    const edges: AccessEdge[] = [
      { ...input.edges[0], id: 'c-first', toNodeId: 'c', lengthM: 1 },
      { ...input.edges[0], id: 'd-last', fromNodeId: 'c', lengthM: 3 },
      { ...input.edges[0], id: 'a-first', toNodeId: 'z', lengthM: 3 },
      { ...input.edges[0], id: 'b-last', fromNodeId: 'z', lengthM: 1 },
    ];
    expect(evaluateAccessGeometry({ ...input, nodes, edges }).base).toMatchObject({
      distanceM: 4, nodeIds: ['a', 'z', 'b'], edgeIds: ['a-first', 'b-last'],
    });
  });

  it('does not turn approximately equal costs into an exact tie', () => {
    const input = tiny();
    expect(evaluateAccessGeometry({ ...input, edges: [
      { ...input.edges[0], id: 'a-longer', lengthM: 1 + 1e-12 }, { ...input.edges[0], id: 'z-shorter' },
    ] }).base.edgeIds).toEqual(['z-shorter']);
  });

  it('is independent of declaration order and closure order', () => {
    const input = graph();
    const reordered = { ...input, nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse(),
      scenarios: [...input.scenarios].reverse().map((scenario) => ({ ...scenario, closedEdgeIds: [...scenario.closedEdgeIds].reverse() })) };
    expect(evaluateAccessGeometry(reordered)).toEqual(evaluateAccessGeometry(input));
  });

  it('sorts IDs with ASCII comparisons, not locale-dependent collation', () => {
    const input = tiny();
    expect(evaluateAccessGeometry({ ...input, edges: ['a', 'Z', '_', '0'].map((id) => ({ ...input.edges[0], id })) }).base.edgeIds).toEqual(['0']);
  });

  it('accepts frozen inputs without mutation and detaches result arrays and frame', () => {
    const input = graph();
    const before = structuredClone(input);
    for (const node of input.nodes) { Object.freeze(node.positionM); Object.freeze(node); }
    input.edges.forEach(Object.freeze);
    for (const scenario of input.scenarios) { Object.freeze(scenario.closedEdgeIds); Object.freeze(scenario); }
    Object.freeze(input.nodes); Object.freeze(input.edges); Object.freeze(input.scenarios); Object.freeze(input.frame); Object.freeze(input);
    const result = evaluateAccessGeometry(input);
    result.frame.id = 'changed';
    if (result.base.status !== 'REACHABLE') throw new Error('EXPECTED_REACHABLE_TEST_GRAPH');
    result.base.nodeIds.push('changed');
    result.base.excludedUnknownEdgeIds.push('changed');
    result.scenarios[0].result.closedEdgeIds.push('changed');
    expect(input).toEqual(before);
    expect(evaluateAccessGeometry(input).base.nodeIds).not.toContain('changed');
  });

  it('does not share mutable arrays between base and scenarios', () => {
    const input = tiny();
    const result = evaluateAccessGeometry({ ...input, scenarios: [{ id: 'unchanged', closedEdgeIds: [] }] });
    if (result.base.status !== 'REACHABLE') throw new Error('EXPECTED_REACHABLE_TEST_GRAPH');
    result.base.edgeIds.push('changed');
    expect(result.scenarios[0].result.edgeIds).toEqual(['ab']);
  });
});

describe('bounded closed access-geometry contract', () => {
  it.each([null, undefined, 1, 'x', [], true])('rejects non-record root %s', (input) => {
    expect(() => evaluateUnknown(input)).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it.each([
    ['extra root field', () => ({ ...tiny(), distanceModel: 'SPHERE' })],
    ['missing scenarios', () => Object.fromEntries(Object.entries(tiny()).filter(([key]) => key !== 'scenarios'))],
    ['ellipsoidal frame', () => ({ ...tiny(), frame: { ...tiny().frame, kind: 'GEODETIC' } })],
    ['unknown units', () => ({ ...tiny(), frame: { ...tiny().frame, units: 'FOOT' } })],
    ['left-handed frame', () => ({ ...tiny(), frame: { ...tiny().frame, handedness: 'LEFT_HANDED' } })],
    ['undeclared frame field', () => ({ ...tiny(), frame: { ...tiny().frame, ellipsoid: 'WGS84' } })],
    ['duplicate node', () => ({ ...tiny(), nodes: [tiny().nodes[0], tiny().nodes[0]] })],
    ['missing node position', () => ({ ...tiny(), nodes: [{ id: 'a' }, tiny().nodes[1]] })],
    ['extra node field', () => ({ ...tiny(), nodes: [{ ...tiny().nodes[0], accuracyM: 0 }, tiny().nodes[1]] })],
    ['two-coordinate position', () => ({ ...tiny(), nodes: [{ id: 'a', positionM: [0, 0] }, tiny().nodes[1]] })],
    ['four-coordinate position', () => ({ ...tiny(), nodes: [{ id: 'a', positionM: [0, 0, 0, 0] }, tiny().nodes[1]] })],
    ['typed-array position', () => ({ ...tiny(), nodes: [{ id: 'a', positionM: new Float64Array(3) }, tiny().nodes[1]] })],
    ['unknown start', () => ({ ...tiny(), startNodeId: 'unknown' })],
    ['unknown end', () => ({ ...tiny(), endNodeId: 'unknown' })],
    ['duplicate edge', () => ({ ...tiny(), edges: [tiny().edges[0], tiny().edges[0]] })],
    ['unknown edge source', () => ({ ...tiny(), edges: [{ ...tiny().edges[0], fromNodeId: 'unknown' }] })],
    ['unknown edge destination', () => ({ ...tiny(), edges: [{ ...tiny().edges[0], toNodeId: 'unknown' }] })],
    ['self edge', () => ({ ...tiny(), edges: [{ ...tiny().edges[0], toNodeId: 'a' }] })],
    ['unknown direction', () => ({ ...tiny(), edges: [{ ...tiny().edges[0], direction: 'BOTH' }] })],
    ['unknown access', () => ({ ...tiny(), edges: [{ ...tiny().edges[0], access: 'OPEN' }] })],
    ['extra edge field', () => ({ ...tiny(), edges: [{ ...tiny().edges[0], speedMps: 1 }] })],
    ['missing edge field', () => ({ ...tiny(), edges: [{ id: 'ab', fromNodeId: 'a', toNodeId: 'b', lengthM: 1, access: 'PERMITTED' }] })],
    ['unknown closure', () => ({ ...tiny(), scenarios: [{ id: 'closed', closedEdgeIds: ['unknown'] }] })],
    ['duplicate closure', () => ({ ...tiny(), scenarios: [{ id: 'closed', closedEdgeIds: ['ab', 'ab'] }] })],
    ['duplicate scenario', () => ({ ...tiny(), scenarios: [{ id: 'closed', closedEdgeIds: [] }, { id: 'closed', closedEdgeIds: [] }] })],
    ['scenario access override', () => ({ ...tiny(), scenarios: [{ id: 'open', closedEdgeIds: [], permitEdgeIds: ['ab'] }] })],
    ['missing closure array', () => ({ ...tiny(), scenarios: [{ id: 'closed' }] })],
    ['sparse node array', () => ({ ...tiny(), nodes: new Array(2) })],
    ['sparse coordinate array', () => ({ ...tiny(), nodes: [{ id: 'a', positionM: new Array(3) }, tiny().nodes[1]] })],
    ['sparse edge array', () => ({ ...tiny(), edges: new Array(1) })],
    ['sparse scenario array', () => ({ ...tiny(), scenarios: new Array(1) })],
    ['sparse closure array', () => ({ ...tiny(), scenarios: [{ id: 'closed', closedEdgeIds: new Array(1) }] })],
    ['non-array nodes', () => ({ ...tiny(), nodes: {} })],
    ['non-array edges', () => ({ ...tiny(), edges: {} })],
    ['non-array scenarios', () => ({ ...tiny(), scenarios: {} })],
    ['non-array closures', () => ({ ...tiny(), scenarios: [{ id: 'closed', closedEdgeIds: {} }] })],
  ])('rejects %s', (_name, build) => {
    expect(() => evaluateUnknown((build as () => unknown)())).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it.each(['', 'a b', 'a/b', '.', 'a'.repeat(81), 'é', 1, null])('rejects invalid ID %s everywhere', (id) => {
    const input = tiny();
    const samples = [
      { ...input, frame: { ...input.frame, id } },
      { ...input, nodes: [{ ...input.nodes[0], id }, input.nodes[1]] },
      { ...input, edges: [{ ...input.edges[0], id }] },
      { ...input, startNodeId: id }, { ...input, endNodeId: id },
      { ...input, edges: [{ ...input.edges[0], fromNodeId: id }] },
      { ...input, edges: [{ ...input.edges[0], toNodeId: id }] },
      { ...input, scenarios: [{ id, closedEdgeIds: [] }] },
      { ...input, scenarios: [{ id: 'closed', closedEdgeIds: [id] }] },
    ];
    for (const sample of samples) expect(() => evaluateUnknown(sample)).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it.each([NaN, Infinity, -Infinity, 1e6 + 1, -1e6 - 1, '0', null, undefined])('rejects invalid coordinate %s', (coordinate) => {
    for (let axis = 0; axis < 3; axis++) {
      const positionM: unknown[] = [0, 0, 0]; positionM[axis] = coordinate;
      expect(() => evaluateUnknown({ ...tiny(), nodes: [{ id: 'a', positionM }, tiny().nodes[1]] })).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
    }
  });

  it.each([NaN, Infinity, -Infinity, 0, -0, -1, 1e-7, 1e7 + 1, '1', null, undefined])('rejects invalid positive bounded edge length %s', (lengthM) => {
    expect(() => evaluateUnknown({ ...tiny(), edges: [{ ...tiny().edges[0], lengthM }] })).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it.each([1e-6, 1e7])('accepts declared edge length bound %s without normalization', (lengthM) => {
    expect(evaluateAccessGeometry({ ...tiny(), edges: [{ ...tiny().edges[0], lengthM }] }).base.distanceM).toBe(lengthM);
  });

  it('accepts the full local coordinate bounds', () => {
    const nodes = [{ id: 'a', positionM: [-1e6, -1e6, -1e6] as const }, { id: 'b', positionM: [1e6, 1e6, 1e6] as const }];
    expect(evaluateAccessGeometry({ ...tiny(), nodes, edges: [{ ...tiny().edges[0], lengthM: 1e7 }] }).straightLine.distanceM)
      .toBeCloseTo(Math.sqrt(3) * 2e6, 6);
  });

  it.each(['PERMITTED', 'PROHIBITED', 'UNKNOWN'] as const)('refuses physically shorter-than-chord %s edge declarations', (access) => {
    const nodes = [{ id: 'a', positionM: [0, 0, 0] as const }, { id: 'b', positionM: [1, 0, 0] as const }];
    expect(() => evaluateAccessGeometry({ ...tiny(), nodes, edges: [{ ...tiny().edges[0], lengthM: 0.9, access }] }))
      .toThrow('ACCESS_GEOMETRY_LENGTH_SHORTER_THAN_CHORD');
  });

  it('declares a roundoff-only chord tolerance and retains a tolerated supplied length exactly', () => {
    const nodes = [{ id: 'a', positionM: [0, 0, 0] as const }, { id: 'b', positionM: [1, 0, 0] as const }];
    const lengthM = 1 - 0.5e-9;
    expect(evaluateAccessGeometry({ ...tiny(), nodes, edges: [{ ...tiny().edges[0], lengthM }] }).base.distanceM).toBe(lengthM);
    expect(ACCESS_GEOMETRY_ALGORITHM.chordToleranceMeaning).toBe('VALIDATION_ROUNDOFF_ONLY_NOT_MEASUREMENT_UNCERTAINTY');
    expect(() => evaluateAccessGeometry({ ...tiny(), nodes, edges: [{ ...tiny().edges[0], lengthM: 1 - 2e-9 }] }))
      .toThrow('ACCESS_GEOMETRY_LENGTH_SHORTER_THAN_CHORD');
  });

  it.each([0, 1, 129])('rejects node cardinality %s', (count) => {
    expect(() => evaluateAccessGeometry({ ...tiny(), nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, positionM: [0, 0, 0] as const })) }))
      .toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it.each([0, 257])('rejects edge cardinality %s', (count) => {
    expect(() => evaluateAccessGeometry({ ...tiny(), edges: Array.from({ length: count }, (_, index) => ({ ...tiny().edges[0], id: `e${index}` })) }))
      .toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it('rejects more than eight scenarios', () => {
    expect(() => evaluateAccessGeometry({ ...tiny(), scenarios: Array.from({ length: 9 }, (_, index) => ({ id: `s${index}`, closedEdgeIds: [] })) }))
      .toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it('rejects more than 256 closures', () => {
    expect(() => evaluateAccessGeometry({ ...tiny(), scenarios: [{ id: 'closed', closedEdgeIds: Array(257).fill('ab') as string[] }] }))
      .toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it('accepts maximum graph size and eight scenarios with bounded long-path addition', () => {
    const nodes = Array.from({ length: 128 }, (_, index) => ({ id: `n${index}`, positionM: [0, 0, 0] as const }));
    const edges: AccessEdge[] = Array.from({ length: 127 }, (_, index) => ({
      id: `chain${index}`, fromNodeId: `n${index}`, toNodeId: `n${index + 1}`, direction: 'DIRECTED', lengthM: 1e7, access: 'PERMITTED',
    }));
    for (let index = edges.length; index < 256; index++) edges.push({ ...edges[0], id: `excluded${index}`, access: 'UNKNOWN' });
    const scenarios = Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, closedEdgeIds: [] }));
    const result = evaluateAccessGeometry({ ...tiny(), nodes, edges, startNodeId: 'n0', endNodeId: 'n127', scenarios });
    expect(result.base.distanceM).toBe(127 * 1e7);
    expect(result.base.nodeIds).toHaveLength(128);
    expect(result.scenarios).toHaveLength(8);
  });

  it('validates unreachable and non-selected nodes and scenarios, not only the chosen path', () => {
    const input = tiny();
    expect(() => evaluateUnknown({ ...input, nodes: [...input.nodes, { id: 'unvisited', positionM: [Infinity, 0, 0] }] })).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
    expect(() => evaluateAccessGeometry({ ...input, endNodeId: 'a', scenarios: [{ id: 'bad', closedEdgeIds: ['unknown'] }] })).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it('rejects object accessors without evaluating them', () => {
    const getter = vi.fn(() => tiny().frame);
    const input = { ...tiny() };
    Object.defineProperty(input, 'frame', { get: getter, enumerable: true });
    expect(() => evaluateAccessGeometry(input)).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects nested accessors without evaluating them', () => {
    const getter = vi.fn(() => 'PERMITTED');
    const edge = { ...tiny().edges[0] };
    Object.defineProperty(edge, 'access', { get: getter, enumerable: true });
    expect(() => evaluateAccessGeometry({ ...tiny(), edges: [edge] })).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects array accessors without evaluating them', () => {
    const getter = vi.fn(() => 0);
    const positionM: [number, number, number] = [0, 0, 0];
    Object.defineProperty(positionM, '0', { get: getter, enumerable: true });
    expect(() => evaluateAccessGeometry({ ...tiny(), nodes: [{ id: 'a', positionM }, tiny().nodes[1]] })).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects extra symbol and non-enumerable fields', () => {
    for (const key of [Symbol('hidden'), 'hidden']) {
      const input = tiny(); Object.defineProperty(input, key, { value: true });
      expect(() => evaluateAccessGeometry(input)).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
    }
  });

  it('rejects extra array fields', () => {
    const input = tiny(); Object.defineProperty(input.nodes, 'extra', { value: true });
    expect(() => evaluateAccessGeometry(input)).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it('rejects custom object and array prototypes', () => {
    const input = tiny(); Object.setPrototypeOf(input.frame, { inherited: true });
    expect(() => evaluateAccessGeometry(input)).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
    const other = tiny(); Object.setPrototypeOf(other.nodes, Object.create(Array.prototype));
    expect(() => evaluateAccessGeometry(other)).toThrow('ACCESS_GEOMETRY_INVALID_INPUT');
  });

  it('accepts closed null-prototype records', () => {
    const input = tiny(); Object.setPrototypeOf(input, null); Object.setPrototypeOf(input.frame, null);
    expect(evaluateAccessGeometry(input).base.status).toBe('REACHABLE');
  });
});

describe('bounded Dijkstra cross-check', () => {
  it('matches independently enumerated simple paths on 50 deterministic directed graphs', () => {
    let seed = 32421;
    const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let trial = 0; trial < 50; trial++) {
      const nodes = Array.from({ length: 6 }, (_, index) => ({ id: `n${index}`, positionM: [0, 0, 0] as const }));
      const edges: AccessEdge[] = [];
      for (let from = 0; from < 6; from++) for (let to = 0; to < 6; to++) {
        if (from === to || next() % 3 !== 0) continue;
        edges.push({ id: `e${from}_${to}`, fromNodeId: `n${from}`, toNodeId: `n${to}`, direction: 'DIRECTED',
          lengthM: 1 + next() % 10, access: next() % 4 === 0 ? 'UNKNOWN' : 'PERMITTED' });
      }
      if (edges.length === 0) edges.push({ ...tiny().edges[0], fromNodeId: 'n0', toNodeId: 'n1' });
      const input = { ...tiny(), nodes, edges, startNodeId: 'n0', endNodeId: 'n5' };
      let shortest = Infinity;
      const walk = (at: string, cost: number, seen: Set<string>): void => {
        if (at === 'n5') { shortest = Math.min(shortest, cost); return; }
        for (const edge of edges) {
          if (edge.fromNodeId !== at || edge.access !== 'PERMITTED' || seen.has(edge.toNodeId)) continue;
          walk(edge.toNodeId, cost + edge.lengthM, new Set([...seen, edge.toNodeId]));
        }
      };
      walk('n0', 0, new Set(['n0']));
      const result = evaluateAccessGeometry(input).base;
      expect(result.distanceM).toBe(Number.isFinite(shortest) ? shortest : null);
      expect(evaluateAccessGeometry({ ...input, nodes: [...nodes].reverse(), edges: [...edges].reverse() }).base).toEqual(result);
    }
  });
});
