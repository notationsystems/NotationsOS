import { z } from 'zod';
import { artifactReference, type ArtifactReference } from '../observation/contract';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import { evaluateAccessGeometry } from './access-geometry';

export const MAX_REGISTRATION_MANIFEST_BYTES = 256 * 1024;
export const MAX_REGISTRATION_RUN_BYTES = 512 * 1024;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const text = z.string().min(1).max(512).refine((s) => !!s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const metre = z.number().finite().min(-1e6).max(1e6);
const point = z.tuple([metre, metre, metre]);
const frame = z.object({ id, kind: z.literal('LOCAL_CARTESIAN'), units: z.literal('METRE'), handedness: z.literal('RIGHT_HANDED') }).strict();
const control = z.object({ id, sourceM: point, targetM: point,
  varianceM2: z.number().finite().min(1e-8).max(1e6).nullable(), evidence: artifactReference, measurementId: id }).strict();
const assumption = z.object({ state: z.enum(['DECLARED', 'UNRESOLVED']), description: text, evidence: artifactReference }).strict();
const graph = z.object({
  frame,
  nodes: z.array(z.object({ id, positionM: point }).strict()).min(2).max(128),
  edges: z.array(z.object({ id, fromNodeId: id, toNodeId: id, direction: z.enum(['DIRECTED', 'BIDIRECTIONAL']),
    lengthM: z.number().finite().min(1e-6).max(1e7), access: z.enum(['PERMITTED', 'PROHIBITED', 'UNKNOWN']) }).strict()).min(1).max(256),
  startNodeId: id, endNodeId: id,
  scenarios: z.array(z.object({ id, closedEdgeIds: z.array(id).max(256) }).strict()).max(8),
}).strict();
const schema = z.object({
  schema: z.literal('payload.registration-access-experiment.v1'), experimentId: id,
  purpose: z.literal('spatial-registration-access'), evidenceClass: z.enum(['SYNTHETIC_TEST', 'RECORDED_MEASUREMENTS']),
  description: text, validationDomain: text, exclusions: z.array(text).min(1).max(16),
  sourceFrame: frame, targetFrame: frame,
  sourceSnapshot: z.object({ kind: z.literal('BIM_CONTROL_GEOMETRY'), representationId: id, evidence: artifactReference }).strict(),
  fixedSourceGeometry: assumption, independentIsotropicControlNoise: assumption, independentCheckPoints: assumption,
  controls: z.array(control).min(3).max(64), checkPoints: z.array(control).min(1).max(32),
  access: z.object({ snapshotId: id, evidence: artifactReference, geometry: graph }).strict(),
}).strict();
export type RegistrationAccessExperiment = z.infer<typeof schema>;
export const registrationAccessRequestSchema = z.object({ schema: z.literal('payload.registration-access-request.v1'), runId: id, manifest: artifactReference }).strict();
export type RegistrationAccessRequest = z.infer<typeof registrationAccessRequestSchema>;

export function registrationAccessReferences(m: RegistrationAccessExperiment): ArtifactReference[] {
  const refs = [m.sourceSnapshot.evidence, m.fixedSourceGeometry.evidence, m.independentIsotropicControlNoise.evidence,
    m.independentCheckPoints.evidence, m.access.evidence, ...m.controls.map((c) => c.evidence), ...m.checkPoints.map((c) => c.evidence)];
  const byId = new Map<string, ArtifactReference>();
  for (const ref of refs) {
    const prior = byId.get(ref.acquisitionId);
    if (prior && localRecordDigest(prior) !== localRecordDigest(ref)) throw new Error('SPATIAL_REFERENCE_CONFLICT');
    byId.set(ref.acquisitionId, ref);
  }
  if (byId.size > 64) throw new Error('SPATIAL_DEPENDENCY_LIMIT');
  return [...byId.values()].sort((a, b) => a.acquisitionId < b.acquisitionId ? -1 : a.acquisitionId > b.acquisitionId ? 1 : 0);
}

export function parseRegistrationAccessExperiment(value: unknown): RegistrationAccessExperiment {
  const m = schema.parse(JSON.parse(encodeLocalRecord(value, MAX_REGISTRATION_MANIFEST_BYTES).toString('utf8')));
  if (m.sourceFrame.id === m.targetFrame.id) throw new Error('SPATIAL_DISTINCT_FRAMES_REQUIRED');
  if (localRecordDigest(m.sourceFrame) !== localRecordDigest(m.access.geometry.frame)) throw new Error('SPATIAL_GRAPH_FRAME_MISMATCH');
  const ids = new Set<string>(), measurements = new Set<string>();
  const fitBytes = new Set(m.controls.map((c) => c.evidence.contentDigest));
  // Source geometry and graph must not contain the claimed withheld survey observations.
  const productionBytes = new Set([...fitBytes, m.sourceSnapshot.evidence.contentDigest, m.access.evidence.contentDigest,
    m.fixedSourceGeometry.evidence.contentDigest, m.independentIsotropicControlNoise.evidence.contentDigest]);
  for (const c of m.checkPoints) if (productionBytes.has(c.evidence.contentDigest)) throw new Error('SPATIAL_CHECK_POINT_LEAKAGE');
  for (const c of [...m.controls, ...m.checkPoints]) {
    if (ids.has(c.id)) throw new Error('SPATIAL_DUPLICATE_CONTROL_ID');
    ids.add(c.id);
    const key = `${c.evidence.contentDigest}:${c.measurementId}`;
    if (measurements.has(key)) throw new Error('SPATIAL_MEASUREMENT_REUSE');
    measurements.add(key);
  }
  registrationAccessReferences(m);
  evaluateAccessGeometry(m.access.geometry); // Validate all edges/closures, including currently unreachable ones.
  return m;
}
