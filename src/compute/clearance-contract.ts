import { z } from 'zod';
import { artifactReference, type ArtifactReference } from '../observation/contract';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';

export const MAX_CLEARANCE_MANIFEST_BYTES = 256 * 1024;
export const MAX_CLEARANCE_RESULT_BYTES = 1024 * 1024;
export const CLEARANCE_PURPOSE = 'clearance-measurement-design';
export const CLEARANCE_PROBABILITY_TOLERANCE = 1e-12;
export const MIN_CLEARANCE_LOSS = 1e-9;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const text = z.string().min(1).max(512).refine((s) => !!s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const probability = z.number().finite().min(0).max(1);
const positiveMetres = z.number().finite().min(0.001).max(1000);
const outcome = z.object({ actionId: id, outcomeId: id }).strict();
const assumption = z.object({ state: z.enum(['DECLARED', 'UNRESOLVED']), description: text, evidence: artifactReference }).strict();
const schema = z.object({
  schema: z.literal('payload.clearance-voi-experiment.v1'), experimentId: id,
  purpose: z.literal(CLEARANCE_PURPOSE), evidenceClass: z.enum(['SYNTHETIC_TEST', 'RECORDED_DECLARATION']),
  description: text, validationDomain: text, exclusions: z.array(text).min(1).max(16),
  frame: z.object({ id, kind: z.literal('LOCAL_CARTESIAN'), units: z.literal('METRE'), axis: z.literal('X') }).strict(),
  minimumSideClearanceM: z.number().finite().min(0).max(10),
  loss: z.object({ unit: z.literal('DECLARED_LOSS_UNIT'), unsafeAccept: z.number().finite().min(MIN_CLEARANCE_LOSS).max(1e6),
    unnecessaryReject: z.number().finite().min(MIN_CLEARANCE_LOSS).max(1e6), evidence: artifactReference }).strict(),
  model: z.object({
    evidence: artifactReference, assumptions: assumption,
    states: z.array(z.object({ id, probability, openingWidthM: positiveMetres, equipmentWidthM: positiveMetres,
      alignmentOffsetM: z.number().finite().min(-1000).max(1000) }).strict()).min(2).max(16),
    actions: z.array(z.object({ id, label: text, target: z.enum(['OPENING_WIDTH', 'EQUIPMENT_WIDTH', 'ALIGNMENT_OFFSET']),
      cost: z.number().finite().min(0).max(1e6), permission: z.enum(['DECLARED_PERMITTED', 'PROHIBITED', 'UNRESOLVED']),
      evidence: artifactReference, outcomeIds: z.array(id).min(2).max(4) }).strict()).min(1).max(4),
    // One explicit joint measurement channel. Marginals are sums, never products of independent guesses.
    jointOutcomes: z.array(z.object({ id, values: z.array(outcome).min(1).max(4) }).strict()).min(1).max(64),
    likelihoodByState: z.array(z.object({ stateId: id, probabilities: z.array(probability).min(1).max(64) }).strict()).min(2).max(16),
  }).strict(),
  validation: z.object({
    independence: assumption,
    cases: z.array(z.object({ id, groupId: id, evidence: artifactReference, measurementId: id,
      referenceMinSideClearanceM: z.number().finite().min(-1000).max(1000), outcomes: z.array(outcome).min(1).max(4) }).strict()).max(64),
  }).strict(),
}).strict();
export type ClearanceExperiment = z.infer<typeof schema>;
export type ClearanceState = ClearanceExperiment['model']['states'][number];
export type ClearanceAction = ClearanceExperiment['model']['actions'][number];
export const clearanceRequestSchema = z.object({ schema: z.literal('payload.clearance-voi-request.v1'), runId: id, manifest: artifactReference }).strict();
export type ClearanceRequest = z.infer<typeof clearanceRequestSchema>;

function unique(ids: string[]) { if (new Set(ids).size !== ids.length) throw new Error('CLEARANCE_DUPLICATE_ID'); }
function unitMass(values: number[]) {
  if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > CLEARANCE_PROBABILITY_TOLERANCE) throw new Error('CLEARANCE_PROBABILITY_MASS');
}
export function clearanceReferences(m: ClearanceExperiment): ArtifactReference[] {
  const refs = [m.loss.evidence, m.model.evidence, m.model.assumptions.evidence, m.validation.independence.evidence,
    ...m.model.actions.map((a) => a.evidence), ...m.validation.cases.map((c) => c.evidence)];
  const byId = new Map<string, ArtifactReference>();
  for (const ref of refs) {
    const prior = byId.get(ref.acquisitionId);
    if (prior && localRecordDigest(prior) !== localRecordDigest(ref)) throw new Error('CLEARANCE_REFERENCE_CONFLICT');
    byId.set(ref.acquisitionId, ref);
  }
  if (byId.size > 64) throw new Error('CLEARANCE_DEPENDENCY_LIMIT');
  return [...byId.values()].sort((a, b) => a.acquisitionId < b.acquisitionId ? -1 : a.acquisitionId > b.acquisitionId ? 1 : 0);
}
export function parseClearanceExperiment(value: unknown): ClearanceExperiment {
  const m = schema.parse(JSON.parse(encodeLocalRecord(value, MAX_CLEARANCE_MANIFEST_BYTES).toString('utf8')));
  unique(m.model.states.map((s) => s.id)); unique(m.model.actions.map((a) => a.id)); unique(m.model.jointOutcomes.map((o) => o.id));
  unique(m.model.likelihoodByState.map((row) => row.stateId)); unique(m.validation.cases.map((c) => c.id));
  unitMass(m.model.states.map((s) => s.probability));
  const actions = new Map(m.model.actions.map((a) => [a.id, a]));
  for (const a of actions.values()) unique(a.outcomeIds);
  const checkOutcomes = (values: Array<{ actionId: string; outcomeId: string }>) => {
    unique(values.map((v) => v.actionId));
    if (values.length !== actions.size || values.some((v) => !actions.get(v.actionId)?.outcomeIds.includes(v.outcomeId))) throw new Error('CLEARANCE_OUTCOME_BINDING');
    return JSON.stringify([...values].sort((a, b) => a.actionId < b.actionId ? -1 : 1));
  };
  unique(m.model.jointOutcomes.map((o) => checkOutcomes(o.values)));
  if (m.model.likelihoodByState.length !== m.model.states.length) throw new Error('CLEARANCE_STATE_BINDING');
  for (const row of m.model.likelihoodByState) {
    if (!m.model.states.some((s) => s.id === row.stateId) || row.probabilities.length !== m.model.jointOutcomes.length) throw new Error('CLEARANCE_STATE_BINDING');
    unitMass(row.probabilities);
  }
  // Exact joint states, not duplicate coordinates split across misleading identifiers.
  unique(m.model.states.map((s) => JSON.stringify([s.openingWidthM, s.equipmentWidthM, s.alignmentOffsetM])));
  const modelBytes = new Set([m.model.evidence, m.model.assumptions.evidence, m.loss.evidence, ...m.model.actions.map((a) => a.evidence)].map((r) => r.contentDigest));
  const measurements = new Set<string>();
  for (const c of m.validation.cases) {
    checkOutcomes(c.outcomes);
    if (modelBytes.has(c.evidence.contentDigest)) throw new Error('CLEARANCE_VALIDATION_LEAKAGE');
    const key = `${c.evidence.contentDigest}:${c.measurementId}`;
    if (measurements.has(key)) throw new Error('CLEARANCE_MEASUREMENT_REUSE');
    measurements.add(key);
  }
  clearanceReferences(m);
  return m;
}
