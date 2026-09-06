import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { ProductionError } from '../production/errors';
import { analyze, compare, type AnalysisResult } from './analysis';
import { digest, id, MAX_SPATIAL_BYTES, METHOD, parseLayout, parseRequest, type AnalysisRequest, type EvidenceReference, type SpatialLayout } from './contracts';

const path = (kind: string, key: string) => ['spatial', kind, `${byteDigest(Buffer.from(key)).slice(7)}.json`];
const invalid = () => new ProductionError('INVALID_STORED_SPATIAL_ANALYSIS', 'Retained spatial artifacts or their source bindings failed verification.', 503);
const incomplete = () => new ProductionError('SPATIAL_ANALYSIS_INCOMPLETE', 'This request is reserved without a confirmed result. Inspect it; use a new request id for a deliberate new execution.', 409);
interface Reservation { request: AnalysisRequest; startedAt: string; digest: string }
interface Receipt { schema: 'payload.spatial-receipt.v1'; reservationDigest: string; request: AnalysisRequest; startedAt: string; completedAt: string; method: typeof METHOD; decisions: ReturnType<typeof evaluateSourceUse>[]; result: AnalysisResult; digest: string }

/** A distinct local analysis projection. Labels are plain text; never render as HTML. */
function project(layout: SpatialLayout, receipt: Receipt) {
  return { schema: 'payload.spatial-analysis-projection.v1', sourceKind: 'LOCAL_ANALYSIS',
    receiptDigest: receipt.digest, resultDigest: receipt.result.digest, source: receipt.request.layout,
    layout, result: receipt.result, inspection: 'HISTORICAL', currentRightsGrant: false,
    mode: 'LOCAL_DEVELOPMENT', canonicalAdmission: false, independentlyVerified: false, sourceTruthClaimed: false };
}
export class SpatialAnalysisService {
  private intake: LocalEvidenceIntake;
  constructor(private root: string, private clock = () => new Date().toISOString(), private compute = analyze) { this.intake = new LocalEvidenceIntake(root); }
  private read<T>(kind: string, key: string): T | undefined {
    const bytes = readImmutableFile(this.root, path(kind, key), MAX_SPATIAL_BYTES);
    return bytes ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T : undefined;
  }
  private source(ref: EvidenceReference, request: AnalysisRequest, at: string) {
    const acquisition = this.intake.inspect(ref.acquisition.id);
    if (!acquisition || acquisition.digest !== ref.acquisition.digest || acquisition.request.manifest.evidenceId !== ref.evidence.id || acquisition.request.contentDigest !== ref.evidence.contentDigest) throw new ProductionError('SPATIAL_SOURCE_MISMATCH', 'The exact retained source could not be verified.', 409);
    if (parseISOInstant(at, 'execution time') < parseISOInstant(acquisition.capture.receipt.storedAt, 'source storage time')) throw new ProductionError('SPATIAL_SOURCE_TIME', 'Source retention must precede analysis.');
    const policy = acquisition.request.manifest.sourceRegistration;
    const decision = evaluateSourceUse(policy, { requestId: `${request.requestId}:derive`, registrationId: policy.registrationId, purpose: request.purpose, operation: 'DERIVE', audience: 'INTERNAL', requestedAt: at });
    if (decision.state !== 'ALLOWED') throw new ProductionError('SPATIAL_PROCESSING_DISALLOWED', 'The source policy does not allow this analysis.', 403);
    return { acquisition, decision };
  }
  private inputs(request: AnalysisRequest, at: string) {
    const primary = this.source(request.layout, request, at);
    if (primary.acquisition.request.manifest.mediaType !== 'application/json') throw new ProductionError('SPATIAL_LAYOUT_MEDIA', 'Spatial layouts must be retained JSON.');
    const bytes = this.intake.objects.get(request.layout.evidence.contentDigest)!;
    if (bytes.byteLength > MAX_SPATIAL_BYTES) throw new ProductionError('SPATIAL_LAYOUT_TOO_LARGE', 'The layout exceeds the analysis limit.');
    let layout: SpatialLayout;
    try { layout = parseLayout(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
    catch { throw new ProductionError('INVALID_SPATIAL_LAYOUT', 'The retained layout does not match the bounded v1 contract.'); }
    return { layout, decisions: [primary.decision, ...layout.sourceArtifacts.map(s => this.source(s.reference, request, at).decision)] };
  }
  inspect(requestId: string) {
    try { id(requestId); } catch { throw new ProductionError('INVALID_SPATIAL_ID', 'Supply a bounded spatial request id.'); }
    try {
      const reservation = this.read<Reservation>('requests', requestId), receipt = this.read<Receipt>('receipts', requestId);
      if (!reservation && !receipt) return undefined;
      if (!reservation) throw invalid();
      exactFields(reservation, ['request', 'startedAt', 'digest']);
      const { digest: reservedDigest, ...reserved } = reservation;
      const request = parseRequest(reservation.request);
      if (request.requestId !== requestId || digest(reserved) !== reservedDigest) throw invalid();
      if (!receipt) throw incomplete();
      exactFields(receipt, ['schema', 'reservationDigest', 'request', 'startedAt', 'completedAt', 'method', 'decisions', 'result', 'digest']);
      const { digest: receiptDigest, ...record } = receipt;
      if (receipt.schema !== 'payload.spatial-receipt.v1' || digest(record) !== receiptDigest || receipt.reservationDigest !== reservedDigest || digest(receipt.request) !== digest(request) || receipt.startedAt !== reservation.startedAt || digest(receipt.method) !== digest(METHOD)) throw invalid();
      if (parseISOInstant(receipt.completedAt, 'completedAt') < parseISOInstant(receipt.startedAt, 'startedAt')) throw invalid();
      const { layout, decisions } = this.inputs(request, reservation.startedAt);
      const result = receipt.result;
      exactFields(result, ['schema', 'source', 'layoutDigest', 'scenarioDigest', 'scenario', 'method', 'parameters', 'coverage', 'passages', 'confirmed', 'possible', 'reachability', 'digest']);
      const { digest: resultDigest, ...payload } = result;
      if (result.schema !== 'payload.spatial-analysis-result.v1' || digest(payload) !== resultDigest || digest(result.source) !== digest(request.layout) || result.layoutDigest !== digest(layout) || digest(result.scenario) !== digest(request.scenario) || result.scenarioDigest !== (request.scenario ? digest(request.scenario) : null) || digest(result.parameters) !== digest({ rootSpaceId: request.rootSpaceId }) || digest(result.method) !== digest(METHOD) || digest(decisions) !== digest(receipt.decisions)) throw invalid();
      validateMeasures(result, layout);
      // Integrity and binding validation only: inspecting never runs graph analysis.
      return { receipt, projection: project(layout, receipt) };
    } catch (error) { if (error instanceof ProductionError && error.code === 'SPATIAL_ANALYSIS_INCOMPLETE') throw error; throw invalid(); }
  }
  submit(input: unknown) {
    const request = parseRequest(input), previous = this.inspect(request.requestId);
    if (previous) {
      if (digest(previous.receipt.request) !== digest(request)) throw new ProductionError('SPATIAL_REQUEST_CONFLICT', 'This request id already binds different inputs.', 409);
      return { status: 'EXISTING', ...previous };
    }
    const startedAt = this.clock(), { layout, decisions } = this.inputs(request, startedAt);
    // Validate semantic parameters before reserving an execution identity.
    if (!layout.spaces.some(s => s.id === request.rootSpaceId) || (request.scenario && (request.scenario.baselineLayoutDigest !== digest(layout) || !layout.passages.some(p => p.id === request.scenario!.passageId) || request.scenario.provenance.sourceIds.some(id => !layout.sourceArtifacts.some(s => s.id === id))))) throw new ProductionError('SPATIAL_PARAMETERS_MISMATCH', 'The root or scenario does not bind this layout.');
    const reserved = { request, startedAt }, reservation = { ...reserved, digest: digest(reserved) };
    // Create-only reservation prevents concurrent submissions from executing twice.
    try {
      const status = publishImmutableFile(this.root, path('requests', request.requestId), encodeLocalRecord(reservation, MAX_SPATIAL_BYTES), MAX_SPATIAL_BYTES);
      if (status !== 'CREATED') throw incomplete();
    } catch { throw incomplete(); }
    const result = this.compute(layout, request);
    const payload = { schema: 'payload.spatial-receipt.v1' as const, reservationDigest: reservation.digest, request, startedAt, completedAt: this.clock(), method: METHOD, decisions, result };
    const receipt: Receipt = { ...payload, digest: digest(payload) };
    publishImmutableFile(this.root, path('receipts', request.requestId), encodeLocalRecord(receipt, MAX_SPATIAL_BYTES), MAX_SPATIAL_BYTES);
    return { status: 'CREATED', ...this.inspect(request.requestId)! };
  }
  compare(baselineId: string, scenarioId: string) {
    const baseline = this.inspect(baselineId), scenario = this.inspect(scenarioId);
    if (!baseline || !scenario) throw new ProductionError('SPATIAL_ANALYSIS_NOT_FOUND', 'Both saved analyses are required.', 404);
    try { return compare(baseline.receipt.result, scenario.receipt.result); }
    catch { throw new ProductionError('SPATIAL_COMPARISON_INCOMPATIBLE', 'Compare a baseline and scenario with identical source, layout, method and root.', 409); }
  }
}

/** Validate retained measure shapes and summaries, without traversing the graph. */
function validateMeasures(result: AnalysisResult, layout: SpatialLayout) {
  const count = layout.spaces.length;
  const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
  for (const graph of [result.confirmed, result.possible]) {
    exactFields(graph, ['spaces', 'reachableCount', 'unreachableIds', 'meanDepth', 'meanDepthDenominator']);
    if (!Array.isArray(graph.spaces) || graph.spaces.length !== count) throw invalid();
    graph.spaces.forEach((s, i) => {
      exactFields(s, ['id', 'depth', 'incomingNeighbors', 'outgoingNeighbors']);
      if (s.id !== layout.spaces[i].id || (s.depth !== null && !integer(s.depth, count - 1)) || !integer(s.incomingNeighbors, count - 1) || !integer(s.outgoingNeighbors, count - 1) || (s.id === result.parameters.rootSpaceId ? s.depth !== 0 : s.depth === 0)) throw invalid();
    });
    const reached = graph.spaces.filter(s => s.depth !== null), other = reached.filter(s => s.depth! > 0);
    if (graph.reachableCount !== reached.length || graph.meanDepthDenominator !== other.length || graph.meanDepth !== (other.length ? other.reduce((sum, s) => sum + s.depth!, 0) / other.length : null) || digest(graph.unreachableIds) !== digest(graph.spaces.filter(s => s.depth === null).map(s => s.id))) throw invalid();
  }
  if (!Array.isArray(result.reachability) || result.reachability.length !== count) throw invalid();
  result.reachability.forEach((s, i) => {
    exactFields(s, ['id', 'status']);
    const a = result.confirmed.spaces[i].depth, b = result.possible.spaces[i].depth;
    if (s.id !== layout.spaces[i].id || s.status !== (a !== null ? 'CONFIRMED' : b !== null ? 'POSSIBLE_ONLY' : 'DISCONNECTED') || (a !== null && (b === null || b > a))) throw invalid();
  });
  if (!Array.isArray(result.passages) || result.passages.length !== layout.passages.length) throw invalid();
  result.passages.forEach((p, i) => {
    exactFields(p, ['id', 'from', 'to', 'direction', 'declaredState', 'effectiveState', 'assumed', 'conditions']);
    const source = layout.passages[i];
    if (p.id !== source.id || p.from !== source.from || p.to !== source.to || p.direction !== source.direction || p.declaredState !== source.state || digest(p.conditions) !== digest(source.conditions) || p.assumed !== (result.scenario?.passageId === p.id) || !['OPEN', 'CLOSED', 'UNKNOWN'].includes(p.effectiveState)) throw invalid();
  });
  exactFields(result.coverage, ['spaceCount', 'passageCount', 'unresolvedPassageIds', 'geometryUsedForTraversal']);
  if (result.coverage.spaceCount !== count || result.coverage.passageCount !== layout.passages.length || result.coverage.geometryUsedForTraversal !== false || digest(result.coverage.unresolvedPassageIds) !== digest(result.passages.filter(p => p.effectiveState === 'UNKNOWN').map(p => p.id))) throw invalid();
}
