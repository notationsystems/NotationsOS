import { digest, METHOD, parseLayout, parseRequest, type AnalysisRequest, type Access, type SpatialLayout } from './contracts';

export function analyze(input: SpatialLayout, supplied: AnalysisRequest) {
  const layout = parseLayout(input), request = parseRequest(supplied), layoutDigest = digest(layout);
  if (!layout.spaces.some(s => s.id === request.rootSpaceId)) throw new Error('Root is not in this layout.');
  const scenario = request.scenario;
  if (scenario && (scenario.baselineLayoutDigest !== layoutDigest || !layout.passages.some(p => p.id === scenario.passageId) || scenario.provenance.sourceIds.some(id => !layout.sourceArtifacts.some(s => s.id === id)))) throw new Error('Scenario does not bind this layout.');
  const passages = layout.passages.map(p => {
    const assumed = scenario?.passageId === p.id;
    const state = assumed ? scenario!.assumedState : p.state;
    const effectiveState: Access = state === 'CLOSED' || p.conditions.some(c => c.state === 'UNSATISFIED') ? 'CLOSED'
      : state === 'UNKNOWN' || p.conditions.some(c => c.state === 'UNKNOWN') ? 'UNKNOWN' : 'OPEN';
    return { id: p.id, from: p.from, to: p.to, direction: p.direction, declaredState: p.state, effectiveState, assumed, conditions: p.conditions };
  });
  function graph(possible: boolean) {
    const outgoing = new Map(layout.spaces.map(s => [s.id, new Set<string>()]));
    const incoming = new Map(layout.spaces.map(s => [s.id, new Set<string>()]));
    function edge(a: string, b: string) { outgoing.get(a)!.add(b); incoming.get(b)!.add(a); }
    passages.forEach(p => { if (p.effectiveState === 'OPEN' || (possible && p.effectiveState === 'UNKNOWN')) { edge(p.from, p.to); if (p.direction === 'BOTH') edge(p.to, p.from); } });
    const depths = new Map<string, number>([[request.rootSpaceId, 0]]), queue = [request.rootSpaceId];
    for (let i = 0; i < queue.length; i++) for (const next of outgoing.get(queue[i])!) if (!depths.has(next)) { depths.set(next, depths.get(queue[i])! + 1); queue.push(next); }
    const spaces = layout.spaces.map(s => ({ id: s.id, depth: depths.get(s.id) ?? null, incomingNeighbors: incoming.get(s.id)!.size, outgoingNeighbors: outgoing.get(s.id)!.size }));
    const nonRoot = [...depths.values()].filter(d => d > 0);
    return { spaces, reachableCount: depths.size, unreachableIds: spaces.filter(s => s.depth === null).map(s => s.id), meanDepth: nonRoot.length ? nonRoot.reduce((a, b) => a + b, 0) / nonRoot.length : null, meanDepthDenominator: nonRoot.length };
  }
  const confirmed = graph(false), possible = graph(true);
  const payload = { schema: 'payload.spatial-analysis-result.v1' as const, source: request.layout, layoutDigest,
    scenarioDigest: scenario ? digest(scenario) : null, scenario, method: METHOD, parameters: { rootSpaceId: request.rootSpaceId },
    coverage: { spaceCount: layout.spaces.length, passageCount: passages.length, unresolvedPassageIds: passages.filter(p => p.effectiveState === 'UNKNOWN').map(p => p.id), geometryUsedForTraversal: false as const },
    passages, confirmed, possible,
    reachability: confirmed.spaces.map((s, i) => ({ id: s.id, status: s.depth !== null ? 'CONFIRMED' : possible.spaces[i].depth !== null ? 'POSSIBLE_ONLY' : 'DISCONNECTED' })) };
  return { ...payload, digest: digest(payload) };
}
export type AnalysisResult = ReturnType<typeof analyze>;
export function compare(baseline: AnalysisResult, scenario: AnalysisResult) {
  if (baseline.scenario !== null || scenario.scenario === null || baseline.layoutDigest !== scenario.layoutDigest || digest(baseline.source) !== digest(scenario.source) || digest(baseline.method) !== digest(scenario.method) || digest(baseline.parameters) !== digest(scenario.parameters)) throw new Error('Comparison requires compatible baseline and scenario results.');
  return { schema: 'payload.spatial-comparison.v1', baselineDigest: baseline.digest, scenarioDigest: scenario.digest,
    changes: baseline.reachability.map((space, i) => ({ id: space.id, baseline: { reachability: space.status, confirmedDepth: baseline.confirmed.spaces[i].depth, possibleDepth: baseline.possible.spaces[i].depth }, scenario: { reachability: scenario.reachability[i].status, confirmedDepth: scenario.confirmed.spaces[i].depth, possibleDepth: scenario.possible.spaces[i].depth } })).filter(c => digest(c.baseline) !== digest(c.scenario)) };
}
