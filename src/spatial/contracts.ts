import { encodeLocalRecord, exactFields, localRecordDigest } from '../data-os/local-record';
import { ProductionError } from '../production/errors';

export const MAX_SPATIAL_BYTES = 512 * 1024;
export const METHOD = { id: 'directed-room-access', version: '1.0.0', scope: 'SINGLE_FLOOR_PEDESTRIAN', unknownPolicy: 'CONFIRMED_AND_POSSIBLE', meanDepth: 'REACHABLE_NON_ROOT_SPACES' } as const;
export type EvidenceReference = { acquisition: { id: string; digest: string }; evidence: { id: string; contentDigest: string } };
export type Provenance = { kind: 'MANUAL_ANNOTATION' | 'SCENARIO_ASSUMPTION'; author: string; note: string; sourceIds: string[] };
export type Access = 'OPEN' | 'CLOSED' | 'UNKNOWN';
export interface SpatialLayout {
  schema: 'payload.spatial-layout.v1'; id: string; label: string; floorId: string;
  sourceArtifacts: { id: string; reference: EvidenceReference }[];
  frame: { id: string; units: 'm' | 'mm'; axes: 'X_RIGHT_Y_UP'; origin: [number, number]; parentFrame: null };
  provenance: Provenance;
  spaces: { id: string; label: string; polygon: [number, number][] | null }[];
  passages: { id: string; from: string; to: string; direction: 'BOTH' | 'FROM_TO'; state: Access; conditions: { id: string; state: 'SATISFIED' | 'UNSATISFIED' | 'UNKNOWN' }[]; provenance: Provenance }[];
}
export interface Scenario { schema: 'payload.spatial-scenario.v1'; baselineLayoutDigest: string; passageId: string; assumedState: 'OPEN' | 'CLOSED'; provenance: Provenance }
export interface AnalysisRequest { schema: 'payload.spatial-analysis-request.v1'; requestId: string; purpose: string; layout: EvidenceReference; rootSpaceId: string; scenario: Scenario | null }
export const digest = (value: unknown) => localRecordDigest(value, MAX_SPATIAL_BYTES);
export function id(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value)) throw new Error('Invalid spatial identifier.'); }
export function hash(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Invalid spatial digest.'); }
function label(value: unknown) { if (typeof value !== 'string' || !value.trim() || value.length > 500 || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid spatial text.'); }
function list(value: unknown, max: number): asserts value is unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error('Invalid or oversized spatial list.'); }
function unique(values: string[]) { if (new Set(values).size !== values.length) throw new Error('Duplicate spatial identifier.'); }
export function reference(value: unknown): asserts value is EvidenceReference {
  exactFields(value, ['acquisition', 'evidence']); exactFields(value.acquisition, ['id', 'digest']); exactFields(value.evidence, ['id', 'contentDigest']);
  id(value.acquisition.id); hash(value.acquisition.digest); id(value.evidence.id); hash(value.evidence.contentDigest);
}
function provenance(value: unknown, kind: Provenance['kind'], sources?: Set<string>) {
  exactFields(value, ['kind', 'author', 'note', 'sourceIds']); if (value.kind !== kind) throw new Error('Incorrect provenance kind.'); label(value.author); label(value.note);
  list(value.sourceIds, 16); value.sourceIds.forEach(id); unique(value.sourceIds as string[]);
  if (kind === 'MANUAL_ANNOTATION' && !value.sourceIds.length) throw new Error('Annotations require source evidence.');
  if (sources && value.sourceIds.some(s => !sources.has(s as string))) throw new Error('Unknown provenance source.');
  (value.sourceIds as string[]).sort();
}
function clone(value: unknown): unknown { return JSON.parse(encodeLocalRecord(value, MAX_SPATIAL_BYTES).toString('utf8')); }
export function parseLayout(input: unknown): SpatialLayout {
  const v = clone(input); exactFields(v, ['schema', 'id', 'label', 'floorId', 'sourceArtifacts', 'frame', 'provenance', 'spaces', 'passages']);
  if (v.schema !== 'payload.spatial-layout.v1') throw new Error('Unsupported spatial layout.'); id(v.id); id(v.floorId); label(v.label);
  list(v.sourceArtifacts, 16); if (!v.sourceArtifacts.length) throw new Error('Source evidence required.');
  v.sourceArtifacts.forEach(s => { exactFields(s, ['id', 'reference']); id(s.id); reference(s.reference); });
  const layout = v as unknown as SpatialLayout;
  unique(layout.sourceArtifacts.map(s => s.id)); const sources = new Set(layout.sourceArtifacts.map(s => s.id));
  exactFields(v.frame, ['id', 'units', 'axes', 'origin', 'parentFrame']); id(v.frame.id);
  const point = (p: unknown) => { if (!Array.isArray(p) || p.length !== 2 || p.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e9)) throw new Error('Invalid drawing coordinate.'); };
  if (!['m', 'mm'].includes(v.frame.units as string) || v.frame.axes !== 'X_RIGHT_Y_UP' || v.frame.parentFrame !== null) throw new Error('Unsupported frame convention.'); point(v.frame.origin);
  provenance(v.provenance, 'MANUAL_ANNOTATION', sources);
  list(v.spaces, 256); if (!v.spaces.length) throw new Error('Spaces required.');
  v.spaces.forEach(s => { exactFields(s, ['id', 'label', 'polygon']); id(s.id); label(s.label); if (s.polygon !== null) { list(s.polygon, 64); if (s.polygon.length < 3) throw new Error('Polygon requires three vertices.'); s.polygon.forEach(point); } });
  unique(layout.spaces.map(s => s.id)); const spaces = new Set(layout.spaces.map(s => s.id));
  list(v.passages, 1024);
  v.passages.forEach(p => {
    exactFields(p, ['id', 'from', 'to', 'direction', 'state', 'conditions', 'provenance']); id(p.id); id(p.from); id(p.to);
    if (!spaces.has(p.from) || !spaces.has(p.to) || p.from === p.to || !['BOTH', 'FROM_TO'].includes(p.direction as string) || !['OPEN', 'CLOSED', 'UNKNOWN'].includes(p.state as string)) throw new Error('Invalid passage.');
    list(p.conditions, 16); p.conditions.forEach(c => { exactFields(c, ['id', 'state']); id(c.id); if (!['SATISFIED', 'UNSATISFIED', 'UNKNOWN'].includes(c.state as string)) throw new Error('Invalid condition.'); });
    unique((p.conditions as { id: string }[]).map(c => c.id)); provenance(p.provenance, 'MANUAL_ANNOTATION', sources);
  });
  unique(layout.passages.map(p => p.id));
  layout.sourceArtifacts.sort(order); layout.spaces.sort(order); layout.passages.sort(order); layout.passages.forEach(p => p.conditions.sort(order));
  return layout;
}
export const order = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function parseRequest(input: unknown): AnalysisRequest {
  try {
    const v = clone(input); exactFields(v, ['schema', 'requestId', 'purpose', 'layout', 'rootSpaceId', 'scenario']);
    if (v.schema !== 'payload.spatial-analysis-request.v1') throw new Error(); id(v.requestId); id(v.purpose); id(v.rootSpaceId); reference(v.layout);
    if (v.scenario !== null) {
      exactFields(v.scenario, ['schema', 'baselineLayoutDigest', 'passageId', 'assumedState', 'provenance']);
      if (v.scenario.schema !== 'payload.spatial-scenario.v1' || !['OPEN', 'CLOSED'].includes(v.scenario.assumedState as string)) throw new Error();
      hash(v.scenario.baselineLayoutDigest); id(v.scenario.passageId); provenance(v.scenario.provenance, 'SCENARIO_ASSUMPTION');
    }
    return v as unknown as AnalysisRequest;
  } catch { throw new ProductionError('INVALID_SPATIAL_REQUEST', 'The spatial request does not match the bounded v1 contract.'); }
}
