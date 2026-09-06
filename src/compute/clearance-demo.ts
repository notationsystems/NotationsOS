import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference } from '../observation/contract';
import { CLEARANCE_PURPOSE, MAX_CLEARANCE_MANIFEST_BYTES, type ClearanceExperiment } from './clearance-contract';
import { evaluateClearanceDecision } from './clearance-voi';
import { ClearanceStore } from './clearance-store';

const roles = ['model', 'actions', 'loss', 'references', 'assumptions'] as const;
type Role = typeof roles[number];

/** Exact invented eight-state oracle; a center offset, not a translation changing an object's width. */
export function syntheticClearanceExperiment(refs: Record<Role, ArtifactReference>): ClearanceExperiment {
  const states = [2, 2.4].flatMap((openingWidthM, o) => [1.78, 1.82].flatMap((equipmentWidthM, w) => [0, 0.2].map((alignmentOffsetM, a) => ({
    id: `state-${o}-${w}-${a}`, probability: 1 / 8, openingWidthM, equipmentWidthM, alignmentOffsetM,
  }))));
  const jointOutcomes = states.map((state, i) => ({ id: `joint-${i}`, values: [
    { actionId: 'measure-opening', outcomeId: state.openingWidthM === 2 ? 'narrow' : 'wide' },
    { actionId: 'measure-equipment', outcomeId: state.equipmentWidthM === 1.78 ? 'small' : 'large' },
    { actionId: 'measure-alignment', outcomeId: state.alignmentOffsetM === 0 ? 'centered' : 'offset' },
  ] }));
  return {
    schema: 'payload.clearance-voi-experiment.v1', experimentId: 'synthetic-clearance-voi-v1', purpose: CLEARANCE_PURPOSE, evidenceClass: 'SYNTHETIC_TEST',
    description: 'One invented opening/equipment clearance inquiry; exact joint states, perfect categorical measurements and declared loss units.',
    validationDomain: 'Analytic software oracle only: eight possible scenes and three hypothetical measurements.',
    exclusions: ['No independent physical measurements or calibrated likelihoods', 'No GAT execution, parsed BIM or measured building',
      'No source query, physical action, permission grant or canonical admission', 'No variational free-energy solver, active-inference engine or platform-wide Markov blanket'],
    frame: { id: 'synthetic-opening-relative-frame', kind: 'LOCAL_CARTESIAN', axis: 'X', units: 'METRE' }, minimumSideClearanceM: 0.05,
    loss: { unit: 'DECLARED_LOSS_UNIT', unsafeAccept: 100, unnecessaryReject: 10, evidence: refs.loss },
    model: {
      evidence: refs.model, assumptions: { state: 'DECLARED', evidence: refs.assumptions,
        description: 'Invented finite joint prior and joint outcome likelihoods. Center offset is shared across both side margins. Measurements are perfect only in this software oracle.' },
      states,
      actions: [
        { id: 'measure-opening', label: 'Measure the opening', target: 'OPENING_WIDTH', cost: 4, permission: 'DECLARED_PERMITTED', evidence: refs.actions, outcomeIds: ['narrow', 'wide'] },
        { id: 'measure-equipment', label: 'Verify equipment width', target: 'EQUIPMENT_WIDTH', cost: 0.5, permission: 'DECLARED_PERMITTED', evidence: refs.actions, outcomeIds: ['small', 'large'] },
        { id: 'measure-alignment', label: 'Measure relative center alignment', target: 'ALIGNMENT_OFFSET', cost: 1, permission: 'DECLARED_PERMITTED', evidence: refs.actions, outcomeIds: ['centered', 'offset'] },
      ],
      jointOutcomes, likelihoodByState: states.map((s, i) => ({ stateId: s.id, probabilities: states.map((_, j) => i === j ? 1 : 0) })),
    },
    validation: {
      independence: { state: 'UNRESOLVED', evidence: refs.assumptions, description: 'The separate synthetic reference artifact repeats constructed oracle scenes. It is not independently acquired holdout evidence; empirical scoring is withheld.' },
      cases: states.map((s, i) => ({ id: `reference-${i}`, groupId: 'invented-oracle-scenes', evidence: refs.references, measurementId: `oracle-${i}`,
        referenceMinSideClearanceM: (s.openingWidthM - s.equipmentWidthM) / 2 - Math.abs(s.alignmentOffsetM), outcomes: jointOutcomes[i].values })),
    },
  };
}

function material() {
  const placeholder = { acquisitionId: 'unbound', acquisitionDigest: `sha256:${'0'.repeat(64)}`, contentDigest: `sha256:${'0'.repeat(64)}` };
  const m = syntheticClearanceExperiment(Object.fromEntries(roles.map((role) => [role, placeholder])) as Record<Role, ArtifactReference>);
  const content: Record<Role, unknown> = {
    model: { evidenceClass: 'SYNTHETIC_TEST', states: m.model.states, jointOutcomes: m.model.jointOutcomes, likelihoodByState: m.model.likelihoodByState,
      frame: m.frame, minimumSideClearanceM: m.minimumSideClearanceM },
    actions: { evidenceClass: 'SYNTHETIC_TEST', actions: m.model.actions.map(({ id, label, target, cost, permission, outcomeIds }) => ({ id, label, target, cost, permission, outcomeIds })), note: 'Hypothetical labels, costs and permission declarations, not authorization to measure anything.' },
    loss: { evidenceClass: 'SYNTHETIC_TEST', unit: m.loss.unit, unsafeAccept: m.loss.unsafeAccept, unnecessaryReject: m.loss.unnecessaryReject },
    references: { evidenceClass: 'SYNTHETIC_TEST', cases: m.validation.cases.map(({ id, groupId, measurementId, referenceMinSideClearanceM, outcomes }) => ({ id, groupId, measurementId, referenceMinSideClearanceM, outcomes })), note: 'Constructed oracle repeats; not independent validation data.' },
    assumptions: { evidenceClass: 'SYNTHETIC_TEST', model: m.model.assumptions.description, validation: m.validation.independence.description },
  };
  return content;
}

/** Server-side synthetic descriptors only; no reads from retained histories and no real acquisition receipts. */
export function buildClearancePreview() {
  const content = material();
  const artifacts = roles.map((r) => ({ id: `clearance-preview-${r}-v1`, content: content[r], contentDigest: byteDigest(encodeLocalRecord(content[r], MAX_CLEARANCE_MANIFEST_BYTES)) }));
  const refs = Object.fromEntries(roles.map((r, i) => [r, { acquisitionId: artifacts[i].id, contentDigest: artifacts[i].contentDigest,
    acquisitionDigest: localRecordDigest({ kind: 'SYNTHETIC_PREVIEW_DESCRIPTOR_NOT_ACQUISITION', id: artifacts[i].id, contentDigest: artifacts[i].contentDigest }) }])) as Record<Role, ArtifactReference>;
  const manifest = syntheticClearanceExperiment(refs);
  return { mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED' as const, manifest, result: evaluateClearanceDecision(manifest), artifacts };
}

export function clearanceDemoDeclaration(id: string): LocalIntakeManifest {
  return { schema: 'payload.local-intake-request.v1', acquisitionId: id, evidenceId: `${id}:evidence`, mediaType: 'application/json',
    capturedAt: '2020-01-01T00:00:00.000Z', purpose: CLEARANCE_PURPOSE,
    sourceRegistration: { registrationId: 'synthetic-clearance-voi-v1', sourceId: 'synthetic-clearance-voi', displayName: 'Synthetic clearance oracle; no physical observation',
      sourceClass: 'synthetic-test', licenseId: 'operator-declaration:synthetic-local-test', policyVersion: '1.0.0', effectiveFrom: '2020-01-01T00:00:00.000Z',
      permittedPurposes: [CLEARANCE_PURPOSE], allowedOperations: ['INGEST', 'DERIVE', 'RETRIEVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' } } };
}
export function runClearanceDemo(root: string, at = new Date().toISOString()) {
  const store = new ClearanceStore(root, { now: () => at });
  const existing = store.inspect('synthetic-clearance-voi-v1');
  if (existing) return { status: 'EXISTING' as const, ...existing };
  const intake = new LocalEvidenceIntake(root), content = material();
  const capture = (id: string, value: unknown): ArtifactReference => {
    const a = intake.capture(clearanceDemoDeclaration(id), encodeLocalRecord(value, MAX_CLEARANCE_MANIFEST_BYTES), at).acquisition;
    return { acquisitionId: id, acquisitionDigest: a.digest, contentDigest: a.request.contentDigest };
  };
  const refs = Object.fromEntries(roles.map((r) => [r, capture(`synthetic-clearance-${r}-v1`, content[r])])) as Record<Role, ArtifactReference>;
  const manifest = capture('synthetic-clearance-manifest-v1', syntheticClearanceExperiment(refs));
  return store.run({ schema: 'payload.clearance-voi-request.v1', runId: 'synthetic-clearance-voi-v1', manifest });
}
