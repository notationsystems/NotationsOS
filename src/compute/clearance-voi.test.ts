import { describe, expect, it } from 'vitest';
import { localRecordDigest } from '../data-os/local-record';
import { type ClearanceExperiment } from './clearance-contract';
import { evaluateClearanceDecision } from './clearance-voi';

const ref = (id: string) => ({ acquisitionId: id, acquisitionDigest: localRecordDigest({ acquisition: id }), contentDigest: localRecordDigest({ content: id }) });
function oracle(): ClearanceExperiment {
  const states: ClearanceExperiment['model']['states'] = [];
  for (const openingWidthM of [2, 2.4]) for (const equipmentWidthM of [1.78, 1.82]) for (const alignmentOffsetM of [0, 0.2]) {
    states.push({ id: `state-${states.length}`, probability: 0.125, openingWidthM, equipmentWidthM, alignmentOffsetM });
  }
  const actions: ClearanceExperiment['model']['actions'] = [
    { id: 'alignment', label: 'Measure alignment', target: 'ALIGNMENT_OFFSET', cost: 1, permission: 'DECLARED_PERMITTED', evidence: ref('alignment'), outcomeIds: ['centered', 'offset'] },
    { id: 'equipment', label: 'Measure equipment', target: 'EQUIPMENT_WIDTH', cost: 0.5, permission: 'DECLARED_PERMITTED', evidence: ref('equipment'), outcomeIds: ['smaller', 'larger'] },
    { id: 'opening', label: 'Measure opening', target: 'OPENING_WIDTH', cost: 4, permission: 'DECLARED_PERMITTED', evidence: ref('opening'), outcomeIds: ['narrow', 'wide'] },
  ];
  const jointOutcomes = states.map((s, i) => ({ id: `joint-${i}`, values: [
    { actionId: 'alignment', outcomeId: s.alignmentOffsetM === 0 ? 'centered' : 'offset' },
    { actionId: 'equipment', outcomeId: s.equipmentWidthM === 1.78 ? 'smaller' : 'larger' },
    { actionId: 'opening', outcomeId: s.openingWidthM === 2 ? 'narrow' : 'wide' },
  ] }));
  return { schema: 'payload.clearance-voi-experiment.v1', experimentId: 'exact-oracle', purpose: 'clearance-measurement-design',
    evidenceClass: 'SYNTHETIC_TEST', description: 'Hand-computable eight-state software oracle.', validationDomain: 'Invented lateral rectangles.',
    exclusions: ['Not a calibrated building, instrument, or independent field validation.'],
    frame: { id: 'lateral', kind: 'LOCAL_CARTESIAN', units: 'METRE', axis: 'X' }, minimumSideClearanceM: 0.05,
    loss: { unit: 'DECLARED_LOSS_UNIT', unsafeAccept: 100, unnecessaryReject: 10, evidence: ref('loss') },
    model: { evidence: ref('model'), assumptions: { state: 'DECLARED', description: 'Exact invented finite model.', evidence: ref('assumptions') },
      states, actions, jointOutcomes, likelihoodByState: states.map((s, i) => ({ stateId: s.id, probabilities: states.map((_, j) => Number(i === j)) })) },
    validation: { independence: { state: 'DECLARED', description: 'Algorithm test declaration, not field evidence.', evidence: ref('independence') },
      cases: states.map((s, i) => ({ id: `case-${i}`, groupId: `group-${i % 2}`, evidence: ref(`reference-${i}`), measurementId: `measurement-${i}`,
        referenceMinSideClearanceM: (s.openingWidthM - s.equipmentWidthM) / 2 - Math.abs(s.alignmentOffsetM), outcomes: jointOutcomes[i].values })) },
  };
}
const action = (r: ReturnType<typeof evaluateClearanceDecision>, id: string) => r.actions.find((a) => a.actionId === id)!;
const baseline = (r: ReturnType<typeof evaluateClearanceDecision>, name: string) => r.baselines.find((b) => b.strategy === name)!;

describe('exact finite clearance value of information', () => {
  it('matches the eight-state hand calculation and preserves shared lateral alignment', () => {
    const result = evaluateClearanceDecision(oracle());
    expect(result.state).toBe('COMPUTED');
    expect(result.current).toMatchObject({ fitProbability: 0.75, risks: { acceptFit: 25, rejectFit: 7.5 }, decision: 'REJECT_FIT',
      expectedDecisionLoss: 7.5, expectedDecisionError: 0.75, expectedBrierScore: 0.1875 });
    expect(result.states.filter((s) => !s.fits)).toHaveLength(2);
    for (const s of result.states) {
      expect(s.leftClearanceM + s.rightClearanceM).toBeCloseTo(s.openingWidthM - s.equipmentWidthM, 14);
      expect(s.minSideClearanceM).toBeCloseTo(Math.min(s.leftClearanceM, s.rightClearanceM), 14);
    }
    expect(action(result, 'alignment').evaluation).toMatchObject({ cost: 1, expectedDecisionLoss: 2.5, expectedDecisionError: 0.25,
      expectedValueOfSampleInformation: 5, netValue: 4, expectedTotalLoss: 3.5, expectedBrierScore: 0.125 });
    expect(action(result, 'opening').evaluation).toMatchObject({ cost: 4, expectedDecisionLoss: 2.5, expectedValueOfSampleInformation: 5, netValue: 1, expectedTotalLoss: 6.5 });
    expect(action(result, 'equipment').evaluation).toMatchObject({ cost: 0.5, expectedDecisionLoss: 7.5, expectedValueOfSampleInformation: 0, netValue: -0.5, expectedTotalLoss: 8 });
    expect(result.recommendation).toMatchObject({ state: 'MEASUREMENT_RECOMMENDED', actionId: 'alignment' });
    expect(baseline(result, 'CHEAPEST_FIRST').actionIds).toEqual(['equipment']);
    expect(baseline(result, 'LARGEST_VARIANCE_FIRST').actionIds).toEqual(['opening']);
    expect(baseline(result, 'MEASURE_ALL').evaluation).toMatchObject({ cost: 5.5, expectedDecisionLoss: 0, expectedTotalLoss: 5.5,
      expectedValueOfSampleInformation: 7.5, expectedBrierScore: 0 });
    expect(action(result, 'opening').targetPriorVarianceM2).toBeCloseTo(0.04, 14);
    expect(action(result, 'alignment').targetPriorVarianceM2).toBeCloseTo(0.01, 14);
    expect(action(result, 'equipment').targetPriorVarianceM2).toBeCloseTo(0.0004, 14);
  });
  it('returns exact hypothetical posterior branches and separates information from decision value', () => {
    const r = evaluateClearanceDecision(oracle());
    const branches = action(r, 'alignment').evaluation!.branches;
    expect(branches.map((b) => [b.outcomes[0].outcomeId, b.probability, b.fitProbability, b.decision, b.posteriorExpectedLoss]))
      .toEqual([['centered', 0.5, 1, 'ACCEPT_FIT', 0], ['offset', 0.5, 0.5, 'REJECT_FIT', 5]]);
    for (const b of branches) expect(b.posterior!.map((s) => s.probability).reduce((x, y) => x + y, 0)).toBe(1);
    expect(r.current!.entropyNats).toBeCloseTo(Math.log(8), 14);
    expect(action(r, 'equipment').evaluation!.expectedPosteriorEntropyNats).toBeCloseTo(Math.log(4), 14);
    expect(action(r, 'equipment').evaluation!.expectedValueOfSampleInformation).toBe(0);
  });
  it('uses complete correlated joint likelihoods, not products of measurement marginals', () => {
    const m = oracle();
    // Every action reads the SAME noisy binary indicator: all-high or all-low only.
    m.model.jointOutcomes = [m.model.jointOutcomes[0], m.model.jointOutcomes[7]];
    m.model.likelihoodByState = m.model.states.map((s) => {
      const fits = (s.openingWidthM - s.equipmentWidthM) / 2 - Math.abs(s.alignmentOffsetM) >= 0.05;
      return { stateId: s.id, probabilities: fits ? [0.99, 0.01] : [0.01, 0.99] };
    });
    m.validation.cases = [];
    const r = evaluateClearanceDecision(m), one = action(r, 'alignment').evaluation!, all = baseline(r, 'MEASURE_ALL').evaluation;
    expect(all.branches).toHaveLength(2);
    expect(all.expectedDecisionLoss).toBeCloseTo(one.expectedDecisionLoss, 14);
    expect(all.expectedValueOfSampleInformation).toBeCloseTo(one.expectedValueOfSampleInformation, 14);
    expect(all.expectedDecisionLoss).toBeCloseTo(0.325, 14);
    expect(all.branches[0].fitProbability).toBeCloseTo(0.7425 / 0.745, 14);
  });
  it('resolves complementary joint information even when each marginal is uninformative', () => {
    const m = oracle();
    const a = m.model.actions[0], b = m.model.actions[1];
    m.model.actions = [a, b];
    m.model.jointOutcomes = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y], i) => ({ id: `xor-${i}`, values: [
      { actionId: a.id, outcomeId: a.outcomeIds[x] }, { actionId: b.id, outcomeId: b.outcomeIds[y] },
    ] }));
    m.model.likelihoodByState = m.model.states.map((s) => ({ stateId: s.id,
      probabilities: (s.openingWidthM - s.equipmentWidthM) / 2 - Math.abs(s.alignmentOffsetM) >= 0.05 ? [0.5, 0, 0, 0.5] : [0, 0.5, 0.5, 0] }));
    m.validation.cases = [];
    const r = evaluateClearanceDecision(m);
    for (const result of r.actions) expect(result.evaluation!.expectedValueOfSampleInformation).toBe(0);
    expect(r.recommendation.state).toBe('NO_MEASUREMENT');
    expect(baseline(r, 'MEASURE_ALL').evaluation.expectedDecisionLoss).toBe(0);
    expect(r.sequentialPolicyOptimized).toBe(false);
  });
  it.each(['PROHIBITED', 'UNRESOLVED'] as const)('excludes %s actions from recommendations and all baselines while retaining forecasts', (permission) => {
    const m = oracle(); m.model.actions[0].permission = permission;
    const r = evaluateClearanceDecision(m);
    expect(action(r, 'alignment')).toMatchObject({ eligible: false, permission });
    expect(action(r, 'alignment').evaluation!.netValue).toBe(4);
    expect(r.recommendation.actionId).toBe('opening');
    for (const b of r.baselines) expect(b.actionIds).not.toContain('alignment');
    expect(baseline(r, 'MEASURE_ALL').evaluation.cost).toBe(4.5);
  });
  it('uses explicit no-measurement when nothing is permitted', () => {
    const m = oracle(); m.model.actions.forEach((a) => { a.permission = 'PROHIBITED'; });
    const r = evaluateClearanceDecision(m);
    expect(r.recommendation).toMatchObject({ state: 'NO_MEASUREMENT', actionId: null, reason: 'NO_DECLARED_PERMITTED_ACTION' });
    for (const b of r.baselines) { expect(b.actionIds).toEqual([]); expect(b.evaluation.expectedTotalLoss).toBe(7.5); }
  });
  it.each([5, 6, 1e6])('chooses no measurement when costs %s consume all information value', (cost) => {
    const m = oracle(); m.model.actions.forEach((a) => { a.cost = cost; });
    expect(evaluateClearanceDecision(m).recommendation).toMatchObject({ state: 'NO_MEASUREMENT', actionId: null });
  });
  it('retains tiny positive values but diagnoses ambiguous selection instead of claiming a useful action', () => {
    const m = oracle(); m.model.actions[0].cost = 5 - 1e-13; m.model.actions[2].permission = 'PROHIBITED';
    const r = evaluateClearanceDecision(m);
    expect(r.recommendation).toMatchObject({ state: 'NO_MEASUREMENT', actionId: null, reason: 'NUMERICALLY_AMBIGUOUS_NET_VALUE' });
    expect(action(r, 'alignment').evaluation!.netValue).toBeGreaterThan(0);
    expect(action(r, 'alignment').evaluation!.netValue).toBeLessThan(1e-12);
    expect(action(r, 'alignment').evaluation!.selectionState).toBe('NUMERICALLY_AMBIGUOUS');
    expect(action(r, 'alignment').evaluation!.numericalDiagnostics.some((d) => d.code === 'POSITIVE_NET_WITHIN_SELECTION_ROUNDOFF_TOLERANCE')).toBe(true);
  });
  it('does not recommend zero-cost uninformative channels because of non-binary roundoff', () => {
    const m = oracle(); m.model.actions.forEach((a) => { a.cost = 0; });
    m.model.states.forEach((s, i) => { s.probability = [0.1, 0.2, 0.05, 0.05, 0.3, 0.1, 0.1, 0.1][i]; });
    m.model.likelihoodByState.forEach((row) => { row.probabilities = [0.1, 0.2, 0.1, 0.15, 0.05, 0.1, 0.2, 0.1]; });
    const r = evaluateClearanceDecision(m);
    expect(r.recommendation.state).toBe('NO_MEASUREMENT');
    expect(baseline(r, 'NONE').evaluation).toMatchObject({ expectedValueOfSampleInformation: 0, netValue: 0, expectedDecisionLoss: r.current!.expectedDecisionLoss });
    for (const a of r.actions) {
      expect(a.evaluation!.expectedValueOfSampleInformation).toBeCloseTo(0, 12);
      expect(a.evaluation!.selectionState).not.toBe('POSITIVE_BEYOND_NUMERICAL_TOLERANCE');
      for (const b of a.evaluation!.branches) { expect(b.probability).toBeLessThanOrEqual(1); expect(b.fitProbability!).toBeLessThanOrEqual(1); }
    }
  });
  it('refuses positive probability underflow instead of inventing an impossible observation', () => {
    const m = oracle(); m.model.states[0].probability = Number.MIN_VALUE; m.model.states[1].probability = 0.25;
    m.model.likelihoodByState[0].probabilities = [0.5, 0.5, 0, 0, 0, 0, 0, 0];
    expect(() => evaluateClearanceDecision(m)).toThrow('CLEARANCE_PROBABILITY_UNDERFLOW');
  });
  it('uses lexicographic action ties and conservative decision ties', () => {
    const m = oracle(); m.model.actions[2].cost = 1;
    let r = evaluateClearanceDecision(m);
    expect(r.recommendation.actionId).toBe('alignment');
    m.loss.unsafeAccept = 30;
    r = evaluateClearanceDecision(m);
    expect(r.current!.risks.acceptFit).toBe(r.current!.risks.rejectFit);
    expect(r.current!.decision).toBe('REJECT_FIT');
  });
  it('treats the threshold as inclusive and handles negative alignment symmetrically', () => {
    const m = oracle();
    m.model.states = m.model.states.map((s) => ({ ...s, alignmentOffsetM: -s.alignmentOffsetM }));
    const r = evaluateClearanceDecision(m);
    expect(r.current!.fitProbability).toBe(0.75);
    m.minimumSideClearanceM = 0.125;
    m.model.states[0].openingWidthM = 2.25; m.model.states[0].equipmentWidthM = 2; m.model.states[0].alignmentOffsetM = 0;
    expect(evaluateClearanceDecision(m).states.find((s) => s.id === 'state-0')!.fits).toBe(true);
  });
  it('uses exact declared-decimal equality instead of a rounded margin to invent a failed fit', () => {
    const m = oracle(); m.model.states.forEach((s, i) => { s.probability = i < 2 ? 0.5 : 0; });
    Object.assign(m.model.states[0], { openingWidthM: 1.2, equipmentWidthM: 1.1, alignmentOffsetM: 0 });
    Object.assign(m.model.states[1], { openingWidthM: 1.4, equipmentWidthM: 1.1, alignmentOffsetM: 0.1 });
    const r = evaluateClearanceDecision(m);
    expect(r.states[0].minSideClearanceM).toBeLessThan(0.05); // Approximate display only, not predicate input.
    expect(r.states[0].fits).toBe(true); expect(r.states[1].fits).toBe(true);
    expect(r.current).toMatchObject({ fitProbability: 1, decision: 'ACCEPT_FIT', expectedDecisionLoss: 0 });
    expect(r.recommendation.state).toBe('NO_MEASUREMENT');
    expect(r.actions.every((a) => a.evaluation!.expectedValueOfSampleInformation === 0)).toBe(true);
    expect(r.model.fitPredicate).toContain('EXACT_DECIMAL_NUMBER_TO_STRING');
    expect(r.model.displayedMargins).toContain('NOT_FIT_PREDICATE');
  });
  it.each([
    [1.1999999999999997, 0, false], [1.2, 0, true], [1.2000000000000002, 0, true],
    [1.3999999999999997, 0.1, false], [1.4, 0.1, true], [1.4000000000000001, 0.1, true],
    [1.3999999999999997, -0.1, false], [1.4, -0.1, true], [1.4000000000000001, -0.1, true],
    [1.2, 1e-20, false], [1.2, -1e-20, false], [1.2000000000000002, 1e-20, true],
  ] as const)('compares declared decimal opening %s and signed offset %s without fit-promoting tolerance', (openingWidthM, alignmentOffsetM, fits) => {
    const m = oracle(); Object.assign(m.model.states[0], { openingWidthM, equipmentWidthM: 1.1, alignmentOffsetM });
    expect(evaluateClearanceDecision(m).states[0].fits).toBe(fits);
  });
  it('applies the same inclusive decimal semantics to separately declared reference clearances', () => {
    const m = oracle();
    m.validation.cases[0].referenceMinSideClearanceM = 0.049999999999999996;
    m.validation.cases[1].referenceMinSideClearanceM = 0.05;
    m.validation.cases[2].referenceMinSideClearanceM = 0.05000000000000001;
    const cases = baseline(evaluateClearanceDecision(m), 'NONE').validation.cases;
    expect(cases.slice(0, 3).map((c) => c.fitObserved)).toEqual([false, true, true]);
  });
  it('rejects conservatively when ordinary decimal risks tie despite binary multiplication roundoff', () => {
    const m = oracle(); m.model.states.forEach((s, i) => { s.probability = i === 0 ? 0.3 : i === 1 ? 0.7 : 0; });
    m.loss.unsafeAccept = 3; m.loss.unnecessaryReject = 7;
    m.model.likelihoodByState.forEach((row) => { row.probabilities = [1, 0, 0, 0, 0, 0, 0, 0]; });
    const r = evaluateClearanceDecision(m);
    expect(r.current!.risks.acceptFit).toBeLessThan(r.current!.risks.rejectFit);
    expect(r.current!.decision).toBe('REJECT_FIT');
    expect(r.current!.expectedDecisionLoss).toBe(2.1);
    expect(r.numericalDiagnostics).toContainEqual({ code: 'CONSERVATIVE_DECISION_RISK_NUMERICAL_TIE', subject: 'CURRENT',
      value: r.current!.risks.rejectFit - r.current!.risks.acceptFit });
    for (const a of r.actions) {
      const branch = a.evaluation!.branches.find((b) => b.probability === 1)!;
      expect(branch.decision).toBe('REJECT_FIT'); expect(branch.posteriorExpectedLoss).toBe(2.1);
      expect(a.evaluation!.expectedDecisionLoss).toBe(2.1);
      expect(a.evaluation!.expectedValueOfSampleInformation).toBe(0);
    }
  });
  it('uses a relative risk tie threshold, not an absolute floor that hides small genuine differences', () => {
    const m = oracle(); m.loss.unsafeAccept = 1e-9; m.loss.unnecessaryReject = 1e-9;
    const r = evaluateClearanceDecision(m);
    expect(r.current!.decision).toBe('ACCEPT_FIT');
    expect(r.current!.expectedDecisionLoss).toBeCloseTo(2.5e-10, 20);
    m.model.states.forEach((s, i) => { s.probability = i === 0 ? 1 : 0; });
    expect(evaluateClearanceDecision(m).current!.decision).toBe('ACCEPT_FIT');
  });
  it('identifies tiny negative information value caused by the conservative tie policy', () => {
    const m = oracle(), p = 0.3000000000003, firstPosterior = 0.3000000000001;
    m.model.states.forEach((s, i) => { s.probability = i === 0 ? p : i === 1 ? 1 - p : 0; });
    m.loss.unsafeAccept = 3; m.loss.unnecessaryReject = 7;
    m.model.jointOutcomes = [m.model.jointOutcomes[0], m.model.jointOutcomes[7]];
    m.model.likelihoodByState.forEach((row, i) => {
      const first = i === 0 ? 0.5 * firstPosterior / p : i === 1 ? 0.5 * (1 - firstPosterior) / (1 - p) : 0.5;
      row.probabilities = [first, 1 - first];
    });
    m.validation.cases = [];
    const r = evaluateClearanceDecision(m), e = action(r, 'alignment').evaluation!;
    expect(r.current!.decision).toBe('ACCEPT_FIT');
    expect(e.branches.map((b) => b.decision)).toEqual(['REJECT_FIT', 'ACCEPT_FIT']);
    expect(e.expectedDecisionLoss).toBeGreaterThan(r.current!.expectedDecisionLoss);
    expect(e.expectedValueOfSampleInformation).toBe(0);
    expect(e.numericalDiagnostics.some((d) => d.code === 'TINY_NEGATIVE_EVSI_CONSERVATIVE_TIE_OR_ROUNDOFF' && d.value < 0)).toBe(true);
  });
  it('refuses a positive weighted loss that underflows instead of calling it a zero-risk tie', () => {
    const m = oracle(); m.loss.unsafeAccept = 1e-9;
    m.model.states.forEach((s, i) => { s.probability = i === 1 ? Number.MIN_VALUE : i === 0 ? 1 : 0; });
    expect(() => evaluateClearanceDecision(m)).toThrow('CLEARANCE_LOSS_UNDERFLOW');
  });
  it('has no recommendation or scoring while model assumptions are unresolved', () => {
    const m = oracle(); m.model.assumptions.state = 'UNRESOLVED';
    const r = evaluateClearanceDecision(m);
    expect(r).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', requirements: ['MODEL_ASSUMPTIONS_UNRESOLVED'], current: null, baselines: [] });
    expect(r.recommendation).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', actionId: null });
    expect(r.actions.every((a) => a.evaluation === null)).toBe(true);
  });
  it('exposes declared but impossible outcomes without manufacturing a posterior', () => {
    const m = oracle(); m.model.actions[0].outcomeIds.push('never');
    const r = evaluateClearanceDecision(m), b = action(r, 'alignment').evaluation!.branches.find((v) => v.outcomes[0].outcomeId === 'never');
    expect(b).toEqual({ outcomes: [{ actionId: 'alignment', outcomeId: 'never' }], probability: 0, posterior: null, fitProbability: null,
      risks: null, decision: null, posteriorExpectedLoss: null, entropyNats: null });
    expect(r.recommendation.actionId).toBe('alignment');
  });
  it('zero-prior states add neither uncertainty nor information and remain inspectable', () => {
    const m = oracle(); m.model.states.forEach((s, i) => { s.probability = i === 0 ? 1 : 0; });
    const r = evaluateClearanceDecision(m);
    expect(r.current).toMatchObject({ fitProbability: 1, expectedDecisionLoss: 0, expectedBrierScore: 0, entropyNats: 0 });
    expect(r.actions.every((a) => a.targetPriorVarianceM2 === 0 && a.evaluation!.expectedValueOfSampleInformation === 0)).toBe(true);
    expect(r.current!.posterior).toHaveLength(8);
    expect(action(r, 'alignment').evaluation!.branches.find((b) => b.probability === 0)!.posterior).toBeNull();
  });
  it('normalizes only within declared mass tolerance and records the original values', () => {
    const m = oracle(); m.model.states[0].probability += 5e-13;
    m.model.likelihoodByState[0].probabilities[0] -= 5e-13;
    const r = evaluateClearanceDecision(m);
    expect(r.numericalDiagnostics).toHaveLength(2);
    expect(r.numericalDiagnostics.every((d) => d.code === 'UNIT_MASS_NORMALIZED_WITHIN_TOLERANCE')).toBe(true);
    expect(r.current!.posterior.reduce((s, p) => s + p.probability, 0)).toBeCloseTo(1, 14);
    m.model.states[0].probability += 2e-12;
    expect(() => evaluateClearanceDecision(m)).toThrow('CLEARANCE_PROBABILITY_MASS');
  });
  it('is deterministic, does not mutate input, and pins detached model/output digests', () => {
    const m = oracle(), before = structuredClone(m), r = evaluateClearanceDecision(m);
    expect(m).toEqual(before); expect(evaluateClearanceDecision(m)).toEqual(r);
    const { digest, ...payload } = r;
    expect(digest).toBe(localRecordDigest(payload, 1024 * 1024));
    r.model.assumptions.push('MUTATED'); r.states[0].fits = !r.states[0].fits;
    expect(evaluateClearanceDecision(m)).not.toEqual(r);
    expect(evaluateClearanceDecision(m).model.assumptions).not.toContain('MUTATED');
  });
  it('is numerically invariant to state/action/joint/reference serialization order', () => {
    const m = oracle(), original = evaluateClearanceDecision(m);
    m.model.states.reverse(); m.model.actions.reverse(); m.model.likelihoodByState.reverse(); m.validation.cases.reverse();
    m.model.jointOutcomes.reverse(); m.model.likelihoodByState.forEach((row) => row.probabilities.reverse());
    m.model.jointOutcomes.forEach((j) => j.values.reverse());
    const r = evaluateClearanceDecision(m);
    expect(r.current).toEqual(original.current); expect(r.actions).toEqual(original.actions); expect(r.baselines).toEqual(original.baselines);
    expect(r.recommendation).toEqual(original.recommendation); expect(r.manifestDigest).not.toBe(original.manifestDigest);
  });
});

describe('selection before independent-reference comparison', () => {
  it('reports model expectations separately from descriptive empirical scoring', () => {
    const r = evaluateClearanceDecision(oracle()), v = baseline(r, 'VOI').validation;
    expect(v).toMatchObject({ state: 'DECLARED_REFERENCE_COMPARISON', caseCount: 8, scoredCaseCount: 8, groupCount: 2,
      metrics: { decisionErrorRate: 0.25, meanDecisionLoss: 2.5, meanMeasurementCost: 1, meanTotalLoss: 3.5, brierScore: 0.125 } });
    expect(baseline(r, 'NONE').validation.metrics!.brierScore).toBe(0.1875);
    expect(baseline(r, 'MEASURE_ALL').validation.metrics!.brierScore).toBe(0);
    expect(r).toMatchObject({ independentVerification: false, fieldAccuracyEstablished: false, physicalActionAuthorized: false,
      sourceQueryExecuted: false, canonicalAdmission: false, activeInferenceImplemented: false, markovBlanketEstablished: false, freeEnergyPrincipleEstablished: false });
  });
  it('changing reference labels never changes forecasts, selected actions, or model risks', () => {
    const m = oracle(), before = evaluateClearanceDecision(m);
    m.validation.cases.forEach((c) => { c.referenceMinSideClearanceM = -100; });
    const r = evaluateClearanceDecision(m);
    expect(r.current).toEqual(before.current); expect(r.actions).toEqual(before.actions); expect(r.recommendation).toEqual(before.recommendation);
    expect(r.baselines.map((b) => b.evaluation)).toEqual(before.baselines.map((b) => b.evaluation));
    expect(baseline(r, 'VOI').validation.metrics!.meanDecisionLoss).toBe(50);
    expect(baseline(r, 'VOI').evaluation.expectedDecisionLoss).toBe(2.5);
  });
  it('does not infer independent observations from synthetic or recorded metadata', () => {
    const m = oracle(); m.evidenceClass = 'RECORDED_DECLARATION'; m.validation.independence.state = 'UNRESOLVED';
    const r = evaluateClearanceDecision(m);
    for (const b of r.baselines) {
      expect(b.validation).toMatchObject({ state: 'UNRESOLVED_INDEPENDENCE', scoredCaseCount: 0, metrics: null });
      expect(b.validation.cases.every((c) => c.reason === 'REFERENCE_INDEPENDENCE_UNRESOLVED' && c.brierScore === null)).toBe(true);
    }
    expect(r.recommendation.actionId).toBe('alignment'); expect(r.fieldAccuracyEstablished).toBe(false);
  });
  it('has null empirical aggregate if any declared full outcome contradicts model support', () => {
    const m = oracle(); m.model.actions[0].outcomeIds.push('never');
    m.validation.cases[0].outcomes = m.validation.cases[0].outcomes.map((o) => o.actionId === 'alignment' ? { ...o, outcomeId: 'never' } : o);
    const r = evaluateClearanceDecision(m);
    for (const b of r.baselines) {
      expect(b.validation).toMatchObject({ state: 'INCOMPLETE_MODEL_CONTRADICTION', caseCount: 8, scoredCaseCount: 7, metrics: null });
      expect(b.validation.cases[0]).toMatchObject({ state: 'UNSCORED', reason: 'MODEL_CONTRADICTION_ZERO_PROBABILITY_OUTCOME', decisionLoss: null });
    }
  });
  it('recognizes explicit zero-probability joint outcomes as contradictions too', () => {
    const m = oracle(); m.model.states[0].probability = 0; m.model.states[1].probability = 0.25;
    const r = evaluateClearanceDecision(m);
    expect(baseline(r, 'VOI').validation).toMatchObject({ state: 'INCOMPLETE_MODEL_CONTRADICTION', scoredCaseCount: 7, metrics: null });
  });
  it('reports absent references rather than a zero error rate', () => {
    const m = oracle(); m.validation.cases = [];
    for (const b of evaluateClearanceDecision(m).baselines) expect(b.validation).toMatchObject({ state: 'NO_CASES', metrics: null, caseCount: 0 });
  });
});

describe('finite probability/loss contract and information bounds', () => {
  it.each([0.001, 0.1, 1, 10, 100, 1e6])('retains EVSI between zero and perfect-information bound for loss %s', (loss) => {
    const m = oracle(); m.loss.unsafeAccept = loss;
    const r = evaluateClearanceDecision(m), evpi = r.current!.expectedDecisionLoss;
    for (const a of r.actions) {
      expect(a.evaluation!.expectedValueOfSampleInformation).toBeGreaterThanOrEqual(0);
      expect(a.evaluation!.expectedValueOfSampleInformation).toBeLessThanOrEqual(evpi + 1e-12);
    }
    expect(baseline(r, 'MEASURE_ALL').evaluation.expectedValueOfSampleInformation).toBeCloseTo(evpi, 12);
  });
  it.each([0, 0.1, 0.5, 0.9, 1])('handles a noisy, correlated joint channel with noise %s', (noise) => {
    const m = oracle();
    m.model.likelihoodByState.forEach((row, i) => { row.probabilities = row.probabilities.map((_, j) => noise / 8 + (i === j ? 1 - noise : 0)); });
    const r = evaluateClearanceDecision(m);
    for (const a of r.actions) {
      expect(a.evaluation!.expectedValueOfSampleInformation).toBeGreaterThanOrEqual(0);
      expect(a.evaluation!.expectedValueOfSampleInformation).toBeLessThanOrEqual(7.5 + 1e-12);
      expect(a.evaluation!.branches.reduce((total, b) => total + b.probability, 0)).toBeCloseTo(1, 14);
    }
    if (noise === 1) expect(r.recommendation.state).toBe('NO_MEASUREMENT');
  });
  it.each([
    ['negative prior', (m: ClearanceExperiment) => { m.model.states[0].probability = -0.1; }],
    ['excess prior', (m: ClearanceExperiment) => { m.model.states[0].probability = 1.1; }],
    ['invalid mass', (m: ClearanceExperiment) => { m.model.states[0].probability = 0.5; }],
    ['negative likelihood', (m: ClearanceExperiment) => { m.model.likelihoodByState[0].probabilities[0] = -1; }],
    ['likelihood mass', (m: ClearanceExperiment) => { m.model.likelihoodByState[0].probabilities[0] = 0.5; }],
    ['negative cost', (m: ClearanceExperiment) => { m.model.actions[0].cost = -1; }],
    ['zero failure loss', (m: ClearanceExperiment) => { m.loss.unsafeAccept = 0; }],
    ['nonfinite loss', (m: ClearanceExperiment) => { m.loss.unnecessaryReject = Infinity; }],
    ['unknown state', (m: ClearanceExperiment) => { m.model.likelihoodByState[0].stateId = 'missing'; }],
    ['unknown action outcome', (m: ClearanceExperiment) => { m.model.jointOutcomes[0].values[0].outcomeId = 'missing'; }],
    ['duplicate state', (m: ClearanceExperiment) => { m.model.states[1].id = m.model.states[0].id; }],
    ['duplicate joint tuple', (m: ClearanceExperiment) => { m.model.jointOutcomes[1].values = m.model.jointOutcomes[0].values; }],
    ['unbound joint length', (m: ClearanceExperiment) => { m.model.likelihoodByState[0].probabilities.pop(); }],
    ['reference/model leakage', (m: ClearanceExperiment) => { m.validation.cases[0].evidence = m.model.evidence; }],
    ['duplicate measurement', (m: ClearanceExperiment) => { m.validation.cases[1].evidence = m.validation.cases[0].evidence; m.validation.cases[1].measurementId = m.validation.cases[0].measurementId; }],
  ])('rejects %s before numerical selection', (_, mutate) => {
    const m = oracle(); (mutate as (m: ClearanceExperiment) => void)(m);
    expect(() => evaluateClearanceDecision(m)).toThrow();
  });
});
