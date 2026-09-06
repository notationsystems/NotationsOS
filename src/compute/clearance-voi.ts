import { localRecordDigest } from '../data-os/local-record';
import { CLEARANCE_PROBABILITY_TOLERANCE, MAX_CLEARANCE_RESULT_BYTES, parseClearanceExperiment,
  type ClearanceExperiment, type ClearanceAction } from './clearance-contract';

export const CLEARANCE_VOI_MODEL = Object.freeze({
  id: 'payload.exact-clearance-value-of-information', version: '1.0.0',
  family: 'FINITE_BAYESIAN_DECISION_ANALYSIS', solver: 'EXACT_JOINT_STATE_AND_OUTCOME_ENUMERATION',
  criterion: 'EXPECTED_REDUCTION_IN_DECISION_LOSS_MINUS_MEASUREMENT_COST',
  geometry: 'MINIMUM_OF_LEFT_AND_RIGHT_LATERAL_CLEARANCES',
  fitPredicate: 'EXACT_DECIMAL_NUMBER_TO_STRING_OPENING_MINUS_EQUIPMENT_MINUS_TWICE_ABSOLUTE_OFFSET_GTE_TWICE_THRESHOLD',
  referencePredicate: 'EXACT_DECIMAL_NUMBER_TO_STRING_INCLUSIVE_THRESHOLD',
  displayedMargins: 'IEEE754_APPROXIMATE_PROJECTIONS_NOT_FIT_PREDICATE',
  uncertainty: 'DECLARED_FINITE_JOINT_PRIOR_AND_JOINT_MEASUREMENT_CHANNEL',
  decisionTie: 'REJECT_FIT', measurementTie: 'LEXICOGRAPHIC_ACTION_ID_WITHIN_DECLARED_SELECTION_TOLERANCE_OF_BEST',
  decisionRiskTieTolerance: '1E-12_TIMES_MAXIMUM_ABSOLUTE_DECISION_RISK_WITHOUT_ABSOLUTE_FLOOR',
  selectionHorizon: 'ONE_MEASUREMENT_THEN_DECISION',
  probabilityTolerance: CLEARANCE_PROBABILITY_TOLERANCE,
  selectionTolerance: '1E-12_TIMES_MAXIMUM_OF_ONE_CURRENT_RISK_POSTERIOR_RISK_AND_COST',
  ambiguousPositiveNet: 'RETAIN_VALUE_REPORT_AMBIGUITY_AND_DO_NOT_RECOMMEND',
  normalization: 'DECLARED_UNIT_MASSES_WITHIN_TOLERANCE_ONLY_WITH_DIAGNOSTIC',
  assumptions: ['STATIC_LATERAL_RECTANGULAR_CLEARANCE', 'DECLARED_JOINT_STATE_SUPPORT',
    'DECLARED_JOINT_OUTCOME_LIKELIHOODS', 'COST_AND_LOSS_SHARE_DECLARED_UNIT'],
});

type Decision = 'ACCEPT_FIT' | 'REJECT_FIT';
type Outcome = { actionId: string; outcomeId: string };
type Posterior = Array<{ stateId: string; probability: number }>;
type Diagnostic = { code: string; subject: string; value: number };
type Risks = { acceptFit: number; rejectFit: number };
type Belief = { fitProbability: number; risks: Risks; decision: Decision; expectedDecisionLoss: number;
  expectedDecisionError: number; expectedBrierScore: number; entropyNats: number; posterior: Posterior };
type Branch = { outcomes: Outcome[]; probability: number; posterior: Posterior | null; fitProbability: number | null;
  risks: Risks | null; decision: Decision | null; posteriorExpectedLoss: number | null; entropyNats: number | null };
type Evaluation = { actionIds: string[]; cost: number; branches: Branch[]; expectedDecisionLoss: number;
  expectedDecisionError: number; expectedBrierScore: number; expectedTotalLoss: number;
  expectedPosteriorEntropyNats: number; expectedValueOfSampleInformation: number; netValue: number;
  selectionTolerance: number; selectionState: 'POSITIVE_BEYOND_NUMERICAL_TOLERANCE' | 'NONPOSITIVE' | 'NUMERICALLY_AMBIGUOUS';
  numericalDiagnostics: Diagnostic[] };
type Strategy = 'NONE' | 'VOI' | 'CHEAPEST_FIRST' | 'LARGEST_VARIANCE_FIRST' | 'MEASURE_ALL';
type ValidationMetrics = { decisionErrorRate: number; meanDecisionLoss: number; meanMeasurementCost: number;
  meanTotalLoss: number; brierScore: number };
type ValidationCase = { caseId: string; groupId: string; state: 'SCORED' | 'UNSCORED'; reason: string | null;
  fitObserved: boolean; fitProbability: number | null; decision: Decision | null; decisionError: number | null;
  decisionLoss: number | null; measurementCost: number | null; totalLoss: number | null; brierScore: number | null };
type Validation = { state: 'NO_CASES' | 'UNRESOLVED_INDEPENDENCE' | 'INCOMPLETE_MODEL_CONTRADICTION' | 'DECLARED_REFERENCE_COMPARISON';
  caseCount: number; scoredCaseCount: number; groupCount: number; metrics: ValidationMetrics | null; cases: ValidationCase[] };

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function sum(values: readonly number[]): number {
  let total = 0, correction = 0;
  for (const value of values) { const next = value - correction, result = total + next; correction = (result - total) - next; total = result; }
  return total;
}
function normalized(values: number[], subject: string, diagnostics: Diagnostic[]): number[] {
  const mass = sum(values);
  if (!Number.isFinite(mass) || Math.abs(mass - 1) > CLEARANCE_PROBABILITY_TOLERANCE) throw new Error('CLEARANCE_PROBABILITY_MASS');
  if (mass !== 1) diagnostics.push({ code: 'UNIT_MASS_NORMALIZED_WITHIN_TOLERANCE', subject, value: mass });
  return values.map((v) => v / mass);
}
function probabilityProduct(a: number, b: number): number {
  const result = a * b;
  if (a > 0 && b > 0 && result === 0) throw new Error('CLEARANCE_PROBABILITY_UNDERFLOW');
  return result;
}
function lossProduct(probability: number, loss: number): number {
  const result = probability * loss;
  if (probability > 0 && loss > 0 && result === 0) throw new Error('CLEARANCE_LOSS_UNDERFLOW');
  return result;
}
/** Interpret each validated number as its shortest declared decimal, not its binary expansion. */
function decimal(value: number) {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const fractionLength = mantissa.split('.')[1]?.length ?? 0;
  return { coefficient: BigInt(mantissa.replace('.', '')), exponent: Number(exponent) - fractionLength };
}
function exactDecimalSumNonnegative(terms: Array<{ value: number; multiplier: number }>): boolean {
  const values = terms.map((term) => ({ ...decimal(term.value), multiplier: BigInt(term.multiplier) }));
  const exponent = Math.min(...values.map((v) => v.exponent));
  let total = BigInt(0);
  for (const v of values) total += v.coefficient * v.multiplier * BigInt(10) ** BigInt(v.exponent - exponent);
  return total >= BigInt(0);
}
function chooseDecision(risks: Risks) {
  const tolerance = CLEARANCE_PROBABILITY_TOLERANCE * Math.max(Math.abs(risks.acceptFit), Math.abs(risks.rejectFit));
  const difference = risks.rejectFit - risks.acceptFit;
  return { decision: difference > tolerance ? 'ACCEPT_FIT' as const : 'REJECT_FIT' as const,
    numericalTieApplied: difference !== 0 && Math.abs(difference) <= tolerance, difference };
}
const outcomeKey = (values: Outcome[]) => JSON.stringify([...values].sort((a, b) => compare(a.actionId, b.actionId)));
function geometry(m: ClearanceExperiment) {
  return [...m.model.states].sort((a, b) => compare(a.id, b.id)).map((s) => {
    const halfGap = (s.openingWidthM - s.equipmentWidthM) / 2;
    const leftClearanceM = halfGap + s.alignmentOffsetM, rightClearanceM = halfGap - s.alignmentOffsetM;
    const minSideClearanceM = halfGap - Math.abs(s.alignmentOffsetM);
    const fits = exactDecimalSumNonnegative([{ value: s.openingWidthM, multiplier: 1 },
      { value: s.equipmentWidthM, multiplier: -1 }, { value: Math.abs(s.alignmentOffsetM), multiplier: -2 },
      { value: m.minimumSideClearanceM, multiplier: -2 }]);
    return { ...s, leftClearanceM, rightClearanceM, minSideClearanceM, fits };
  });
}

/** Exact finite enumeration under operator-declared probabilities, not empirical validation or action authority. */
export function evaluateClearanceDecision(value: unknown) {
  const m = parseClearanceExperiment(value);
  const states = geometry(m), actions = [...m.model.actions].sort((a, b) => compare(a.id, b.id));
  const diagnostics: Diagnostic[] = [];
  const diagnosedRiskTies = new Set<string>();
  const prior = normalized(states.map((s) => s.probability), 'PRIOR', diagnostics);
  const orderedJoints = m.model.jointOutcomes.map((j, index) => ({ ...j, index })).sort((a, b) => compare(a.id, b.id));
  const channel = states.map((s) => {
    const row = m.model.likelihoodByState.find((r) => r.stateId === s.id)!;
    return normalized(orderedJoints.map((j) => row.probabilities[j.index]), s.id, diagnostics);
  });
  const posterior = (probabilities: number[]): Posterior => states.map((s, i) => ({ stateId: s.id, probability: probabilities[i] }));
  const belief = (probabilities: number[], subject: string): Belief => {
    const fitMass = sum(probabilities.filter((_, i) => states[i].fits));
    const unsafeMass = sum(probabilities.filter((_, i) => !states[i].fits));
    // A probability ratio remains in [0,1] without clipping a rounded unit sum.
    const fitProbability = fitMass / (fitMass + unsafeMass);
    const unsafeProbability = unsafeMass / (fitMass + unsafeMass);
    const risks = { acceptFit: lossProduct(unsafeProbability, m.loss.unsafeAccept), rejectFit: lossProduct(fitProbability, m.loss.unnecessaryReject) };
    const choice = chooseDecision(risks), decision = choice.decision;
    if (choice.numericalTieApplied && !diagnosedRiskTies.has(subject)) {
      diagnostics.push({ code: 'CONSERVATIVE_DECISION_RISK_NUMERICAL_TIE', subject, value: choice.difference });
      diagnosedRiskTies.add(subject);
    }
    return { fitProbability, risks, decision, expectedDecisionLoss: decision === 'ACCEPT_FIT' ? risks.acceptFit : risks.rejectFit,
      expectedDecisionError: decision === 'ACCEPT_FIT' ? unsafeProbability : fitProbability,
      expectedBrierScore: sum(probabilities.map((p, i) => p * (fitProbability - Number(states[i].fits)) ** 2)),
      entropyNats: sum(probabilities.map((p) => p === 0 || p === 1 ? 0 : -p * Math.log(p))), posterior: posterior(probabilities) };
  };
  const currentBelief = belief(prior, 'CURRENT');
  const targetValue = (s: typeof states[number], target: ClearanceAction['target']) => target === 'OPENING_WIDTH'
    ? s.openingWidthM : target === 'EQUIPMENT_WIDTH' ? s.equipmentWidthM : s.alignmentOffsetM;
  const variance = (a: ClearanceAction) => {
    const mean = sum(states.map((s, i) => prior[i] * targetValue(s, a.target)));
    return sum(states.map((s, i) => prior[i] * (targetValue(s, a.target) - mean) ** 2));
  };
  const evaluate = (selected: ClearanceAction[]): Evaluation => {
    const actionIds = selected.map((a) => a.id).sort(compare), selectedIds = new Set(actionIds);
    if (selected.length === 0) return { actionIds: [], cost: 0, branches: [{ outcomes: [], probability: 1,
      posterior: structuredClone(currentBelief.posterior), fitProbability: currentBelief.fitProbability,
      risks: { ...currentBelief.risks }, decision: currentBelief.decision, posteriorExpectedLoss: currentBelief.expectedDecisionLoss,
      entropyNats: currentBelief.entropyNats }], expectedDecisionLoss: currentBelief.expectedDecisionLoss,
      expectedDecisionError: currentBelief.expectedDecisionError, expectedBrierScore: currentBelief.expectedBrierScore,
      expectedTotalLoss: currentBelief.expectedDecisionLoss, expectedPosteriorEntropyNats: currentBelief.entropyNats,
      expectedValueOfSampleInformation: 0, netValue: 0,
      selectionTolerance: CLEARANCE_PROBABILITY_TOLERANCE * Math.max(1, currentBelief.expectedDecisionLoss),
      selectionState: 'NONPOSITIVE', numericalDiagnostics: [] };
    const groups = new Map<string, { outcomes: Outcome[]; columns: number[] }>();
    orderedJoints.forEach((joint, index) => {
      const outcomes = joint.values.filter((o) => selectedIds.has(o.actionId)).sort((a, b) => compare(a.actionId, b.actionId));
      const key = outcomeKey(outcomes), found = groups.get(key);
      if (found) found.columns.push(index); else groups.set(key, { outcomes, columns: [index] });
    });
    // Include declared but impossible single-action outcomes, so their absence cannot imply observation certainty.
    if (selected.length === 1) for (const outcomeId of selected[0].outcomeIds) {
      const outcomes = [{ actionId: selected[0].id, outcomeId }], key = outcomeKey(outcomes);
      if (!groups.has(key)) groups.set(key, { outcomes, columns: [] });
    }
    const detailed = [...groups.entries()].sort(([a], [b]) => compare(a, b)).map(([, group]) => {
      const weights = states.map((_, i) => sum(group.columns.map((column) => probabilityProduct(prior[i], channel[i][column]))));
      const probability = sum(weights);
      const b = probability > 0 ? belief(weights.map((w) => w / probability), `MEASUREMENT:${actionIds.join(',')}:OUTCOME:${outcomeKey(group.outcomes)}`) : null;
      const branch: Branch = { outcomes: group.outcomes, probability, posterior: b?.posterior ?? null,
        fitProbability: b?.fitProbability ?? null, risks: b?.risks ?? null, decision: b?.decision ?? null,
        posteriorExpectedLoss: b?.expectedDecisionLoss ?? null, entropyNats: b?.entropyNats ?? null };
      // Unnormalized branch risks preserve the zero-probability case and avoid unnecessary division in EVSI.
      const accept = lossProduct(sum(weights.filter((_, i) => !states[i].fits)), m.loss.unsafeAccept);
      const reject = lossProduct(sum(weights.filter((_, i) => states[i].fits)), m.loss.unnecessaryReject);
      // Account for the decision actually shown, including conservative numerical risk ties.
      return { branch, b, riskContribution: b?.decision === 'ACCEPT_FIT' ? accept : reject };
    });
    const numericalDiagnostics: Diagnostic[] = [];
    const predictiveMass = sum(detailed.map((d) => d.branch.probability));
    if (Math.abs(predictiveMass - 1) > CLEARANCE_PROBABILITY_TOLERANCE) throw new Error('CLEARANCE_PROBABILITY_MASS');
    if (predictiveMass !== 1) numericalDiagnostics.push({ code: 'PREDICTIVE_UNIT_MASS_NORMALIZED_WITHIN_TOLERANCE',
      subject: actionIds.join(','), value: predictiveMass });
    for (const d of detailed) d.branch.probability /= predictiveMass;
    const expectedDecisionLoss = sum(detailed.map((d) => d.riskContribution)) / predictiveMass;
    let expectedValueOfSampleInformation = currentBelief.expectedDecisionLoss - expectedDecisionLoss;
    if (expectedValueOfSampleInformation < 0) {
      const tolerance = CLEARANCE_PROBABILITY_TOLERANCE * Math.max(1, currentBelief.expectedDecisionLoss);
      if (expectedValueOfSampleInformation < -tolerance) throw new Error('CLEARANCE_NEGATIVE_INFORMATION_VALUE');
      numericalDiagnostics.push({ code: 'TINY_NEGATIVE_EVSI_CONSERVATIVE_TIE_OR_ROUNDOFF', subject: actionIds.join(',') || 'NONE', value: expectedValueOfSampleInformation });
      expectedValueOfSampleInformation = 0;
    }
    const cost = sum(selected.map((a) => a.cost));
    const netValue = expectedValueOfSampleInformation - cost;
    const selectionTolerance = CLEARANCE_PROBABILITY_TOLERANCE * Math.max(1, currentBelief.expectedDecisionLoss, expectedDecisionLoss, cost);
    const selectionState = netValue > selectionTolerance ? 'POSITIVE_BEYOND_NUMERICAL_TOLERANCE' as const
      : netValue > 0 ? 'NUMERICALLY_AMBIGUOUS' as const : 'NONPOSITIVE' as const;
    if (selectionState === 'NUMERICALLY_AMBIGUOUS') numericalDiagnostics.push({ code: 'POSITIVE_NET_WITHIN_SELECTION_ROUNDOFF_TOLERANCE',
      subject: actionIds.join(','), value: netValue });
    return { actionIds, cost, branches: detailed.map((d) => d.branch), expectedDecisionLoss,
      expectedDecisionError: sum(detailed.map((d) => d.branch.probability * (d.b?.expectedDecisionError ?? 0))),
      expectedBrierScore: sum(detailed.map((d) => d.branch.probability * (d.b?.expectedBrierScore ?? 0))),
      expectedPosteriorEntropyNats: sum(detailed.map((d) => d.branch.probability * (d.b?.entropyNats ?? 0))),
      expectedTotalLoss: expectedDecisionLoss + cost, expectedValueOfSampleInformation,
      netValue, selectionTolerance, selectionState, numericalDiagnostics };
  };
  const requirements = m.model.assumptions.state === 'DECLARED' ? [] : ['MODEL_ASSUMPTIONS_UNRESOLVED'];
  const actionResults = actions.map((a) => ({ actionId: a.id, label: a.label, target: a.target, permission: a.permission,
    eligible: a.permission === 'DECLARED_PERMITTED', targetPriorVarianceM2: variance(a),
    evaluation: requirements.length ? null : evaluate([a]) }));
  const eligible = actions.filter((a) => a.permission === 'DECLARED_PERMITTED');
  const ranked = actionResults.filter((a) => a.eligible && a.evaluation?.selectionState === 'POSITIVE_BEYOND_NUMERICAL_TOLERANCE')
    .sort((a, b) => b.evaluation!.netValue - a.evaluation!.netValue || compare(a.actionId, b.actionId));
  const best = ranked.length ? ranked.filter((a) => ranked[0].evaluation!.netValue - a.evaluation!.netValue <=
    Math.max(ranked[0].evaluation!.selectionTolerance, a.evaluation!.selectionTolerance)).sort((a, b) => compare(a.actionId, b.actionId))[0] : null;
  const ambiguous = actionResults.some((a) => a.eligible && a.evaluation?.selectionState === 'NUMERICALLY_AMBIGUOUS');
  const recommendation: { state: 'MEASUREMENT_RECOMMENDED' | 'NO_MEASUREMENT' | 'UNRESOLVED_REQUIREMENTS'; actionId: string | null; reason: string } =
    requirements.length ? { state: 'UNRESOLVED_REQUIREMENTS', actionId: null, reason: 'MODEL_ASSUMPTIONS_UNRESOLVED' }
      : best ? { state: 'MEASUREMENT_RECOMMENDED', actionId: best.actionId, reason: 'HIGHEST_POSITIVE_NET_VALUE_AMONG_DECLARED_PERMITTED_ACTIONS' }
        : { state: 'NO_MEASUREMENT', actionId: null, reason: !eligible.length ? 'NO_DECLARED_PERMITTED_ACTION'
          : ambiguous ? 'NUMERICALLY_AMBIGUOUS_NET_VALUE' : 'NO_POSITIVE_NET_VALUE' };

  // Reference outcomes are examined only after model-only recommendations and baseline strategies have been fixed.
  const validate = (evaluation: Evaluation): Validation => {
    const independent = m.validation.independence.state === 'DECLARED';
    const scoredCases: ValidationCase[] = [...m.validation.cases].sort((a, b) => compare(a.id, b.id)).map((c) => {
      const key = outcomeKey(c.outcomes), full = orderedJoints.findIndex((j) => outcomeKey(j.values) === key);
      const fullProbability = full < 0 ? 0 : sum(states.map((_, i) => probabilityProduct(prior[i], channel[i][full])));
      const selected = c.outcomes.filter((o) => evaluation.actionIds.includes(o.actionId));
      const branch = evaluation.branches.find((b) => outcomeKey(b.outcomes) === outcomeKey(selected));
      const fitObserved = exactDecimalSumNonnegative([{ value: c.referenceMinSideClearanceM, multiplier: 1 },
        { value: m.minimumSideClearanceM, multiplier: -1 }]);
      const reason = !independent ? 'REFERENCE_INDEPENDENCE_UNRESOLVED' : fullProbability === 0 || !branch?.decision
        ? 'MODEL_CONTRADICTION_ZERO_PROBABILITY_OUTCOME' : null;
      const decision = reason ? null : branch!.decision;
      const fitProbability = reason ? null : branch!.fitProbability;
      const decisionError = decision ? Number((decision === 'ACCEPT_FIT') !== fitObserved) : null;
      const decisionLoss = decision ? decision === 'ACCEPT_FIT' ? (fitObserved ? 0 : m.loss.unsafeAccept)
        : (fitObserved ? m.loss.unnecessaryReject : 0) : null;
      return { caseId: c.id, groupId: c.groupId, state: reason ? 'UNSCORED' : 'SCORED', reason, fitObserved, fitProbability, decision,
        decisionError, decisionLoss, measurementCost: reason ? null : evaluation.cost,
        totalLoss: decisionLoss === null ? null : decisionLoss + evaluation.cost,
        brierScore: fitProbability === null ? null : (fitProbability - Number(fitObserved)) ** 2 };
    });
    const scored = scoredCases.filter((c) => c.state === 'SCORED');
    const complete = scored.length > 0 && scored.length === scoredCases.length;
    const metrics = complete ? { decisionErrorRate: sum(scored.map((c) => c.decisionError!)) / scored.length,
      meanDecisionLoss: sum(scored.map((c) => c.decisionLoss!)) / scored.length,
      meanMeasurementCost: evaluation.cost, meanTotalLoss: sum(scored.map((c) => c.totalLoss!)) / scored.length,
      brierScore: sum(scored.map((c) => c.brierScore!)) / scored.length } : null;
    return { state: !scoredCases.length ? 'NO_CASES' : !independent ? 'UNRESOLVED_INDEPENDENCE'
      : complete ? 'DECLARED_REFERENCE_COMPARISON' : 'INCOMPLETE_MODEL_CONTRADICTION',
    caseCount: scoredCases.length, scoredCaseCount: scored.length, groupCount: new Set(scoredCases.map((c) => c.groupId)).size, metrics, cases: scoredCases };
  };
  const cheapest = [...eligible].sort((a, b) => a.cost - b.cost || compare(a.id, b.id))[0];
  const largest = [...eligible].sort((a, b) => variance(b) - variance(a) || compare(a.id, b.id))[0];
  const strategies: Array<{ strategy: Strategy; selected: ClearanceAction[] }> = [
    { strategy: 'NONE', selected: [] }, { strategy: 'VOI', selected: best ? [actions.find((a) => a.id === best.actionId)!] : [] },
    { strategy: 'CHEAPEST_FIRST', selected: cheapest ? [cheapest] : [] },
    { strategy: 'LARGEST_VARIANCE_FIRST', selected: largest ? [largest] : [] },
    { strategy: 'MEASURE_ALL', selected: eligible },
  ];
  const baselines = requirements.length ? [] : strategies.map(({ strategy, selected }) => {
    const evaluation = evaluate(selected);
    return { strategy, actionIds: evaluation.actionIds, evaluation, validation: validate(evaluation) };
  });
  const payload = { schema: 'payload.clearance-voi-result.v1', experimentId: m.experimentId, evidenceClass: m.evidenceClass,
    state: requirements.length ? 'UNRESOLVED_REQUIREMENTS' : 'COMPUTED', requirements,
    model: structuredClone(CLEARANCE_VOI_MODEL), modelDigest: localRecordDigest(CLEARANCE_VOI_MODEL),
    manifestDigest: localRecordDigest(m, MAX_CLEARANCE_RESULT_BYTES), frame: m.frame, minimumSideClearanceM: m.minimumSideClearanceM,
    loss: m.loss, validationDomain: m.validationDomain, exclusions: m.exclusions,
    states: states.map((s, i) => ({ ...s, probability: prior[i] })), current: requirements.length ? null : currentBelief,
    actions: actionResults, recommendation, baselines, numericalDiagnostics: diagnostics,
    dependencyExplanation: 'One alignment offset enters both lateral clearances with opposite signs. Both widths and the shared offset remain in each joint state; joint outcome channels are marginalized by summation, never independent multiplication. This is declared model structure, not an established Markov blanket.',
    interpretation: m.evidenceClass === 'SYNTHETIC_TEST' ? 'ANALYTIC_SOFTWARE_EXPERIMENT_ONLY' : 'OPERATOR_DECLARED_MODEL_AND_REFERENCE_COMPARISON_ONLY',
    expectedMetricsMeaning: 'UNDER_DECLARED_MODEL_NOT_EMPIRICAL_CALIBRATION',
    empiricalMetricsMeaning: 'DESCRIPTIVE_DECLARED_REFERENCE_COMPARISON_NOT_INDEPENDENT_CERTIFICATION',
    inputInterpretationAuthority: 'OPERATOR_DECLARATION', independentVerification: false, fieldAccuracyEstablished: false,
    physicalActionAuthorized: false, sourceQueryExecuted: false, canonicalAdmission: false, activeInferenceImplemented: false,
    markovBlanketEstablished: false, freeEnergyPrincipleEstablished: false, sequentialPolicyOptimized: false };
  return { ...payload, digest: localRecordDigest(payload, MAX_CLEARANCE_RESULT_BYTES) };
}
export type ClearanceDecisionResult = ReturnType<typeof evaluateClearanceDecision>;
