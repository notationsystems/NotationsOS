import { localRecordDigest } from '../data-os/local-record';
import { MAX_BENCHMARK_REPORT_BYTES, parseScalarBenchmark, type BenchmarkCase } from './benchmark-contract';
import { SCALAR_GAUSSIAN_NUMERICS, solveScalarGaussian, type ScalarFactor } from './scalar-gaussian';

export const SCALAR_BASELINE_MODEL = Object.freeze({
  id: 'payload.scalar-linear-gaussian-baseline', version: '1.0.0',
  family: 'CONVENTIONAL_PROBABILISTIC_ESTIMATION', task: 'SCALAR_POSITION_FROM_ABSOLUTE_AND_RELATIVE_FACTORS',
  solver: 'SCALED_CHOLESKY_FULL_INVERSE_INFORMATION',
  numericalContract: SCALAR_GAUSSIAN_NUMERICS,
  uncertaintyMethod: 'CONDITIONAL_GAUSSIAN_COVARIANCE_KNOWN_INDEPENDENT_NOISE',
  fittedResidualSemantics: 'MEASUREMENT_SIGMA_SCALED_NOT_INDEPENDENT_UNIT_NORMAL_Z_SCORES',
  assumptions: Object.freeze(['LINEAR_SCALAR_MEASUREMENTS', 'KNOWN_POSITIVE_VARIANCES', 'INDEPENDENT_ZERO_MEAN_GAUSSIAN_FACTOR_ERRORS',
    'EXPLICIT_ABSOLUTE_ANCHOR_PER_COMPONENT', 'FIXED_FRAME_CLOCK_AND_CALIBRATION', 'NO_OUTLIER_MODEL']),
  learnedParameters: false, referenceDataUsedInSolve: false, automaticAdmission: false,
});
const numericalFailures = new Set(['GAUSSIAN_UNANCHORED_COMPONENT', 'GAUSSIAN_ILL_CONDITIONED']);

function evaluateCase(c: BenchmarkCase) {
  const blockers: string[] = [];
  if (c.fixedRepresentation.state !== 'DECLARED') blockers.push('FIXED_REPRESENTATION_UNRESOLVED');
  if (c.independentFactorNoise.state !== 'DECLARED') blockers.push('FACTOR_NOISE_INDEPENDENCE_UNRESOLVED');
  if (c.factors.some((f) => f.varianceM2 === null)) blockers.push('FACTOR_VARIANCE_UNAVAILABLE');
  let fit: ReturnType<typeof solveScalarGaussian> | null = null;
  if (!blockers.length) {
    // Construct only the scientific solver inputs. Held-out reference values never enter this call.
    const factors: ScalarFactor[] = c.factors.map((f) => f.kind === 'ABSOLUTE'
      ? { id: f.id, kind: f.kind, stateId: f.stateId, meanM: f.meanM, varianceM2: f.varianceM2! }
      : { id: f.id, kind: f.kind, fromStateId: f.fromStateId, toStateId: f.toStateId, deltaM: f.deltaM, varianceM2: f.varianceM2! });
    try { fit = solveScalarGaussian(c.states.map((s) => s.id), factors); }
    catch (error) {
      if (!(error instanceof Error) || !numericalFailures.has(error.message)) throw error;
      blockers.push(error.message);
    }
  }
  const comparisons = c.references.map((ref) => {
    const estimated = fit?.states.find((s) => s.id === ref.stateId);
    const residualM = estimated ? estimated.meanM - ref.valueM : null;
    const canNormalize = estimated && ref.varianceM2 !== null && c.independentReferenceNoise.state === 'DECLARED';
    // Reference measurement error is included only under an explicit independence assertion.
    const predictiveResidualVarianceM2 = canNormalize ? estimated.varianceM2 + ref.varianceM2! : null;
    return { referenceId: ref.id, stateId: ref.stateId, residualM,
      predictiveResidualVarianceM2,
      standardizedResidual: residualM !== null && predictiveResidualVarianceM2 !== null ? residualM / Math.sqrt(predictiveResidualVarianceM2) : null,
      uncertaintyComparison: !estimated ? 'ESTIMATE_UNAVAILABLE' : ref.varianceM2 === null ? 'REFERENCE_VARIANCE_UNAVAILABLE'
        : c.independentReferenceNoise.state !== 'DECLARED' ? 'REFERENCE_INDEPENDENCE_UNRESOLVED' : 'CONDITIONAL_ON_DECLARED_INDEPENDENCE',
      independentVerification: false };
  });
  const residuals = comparisons.flatMap((r) => r.residualM === null ? [] : [r.residualM]);
  return { caseId: c.id, groupId: c.groupId, split: c.split, state: fit ? 'COMPUTED' : 'UNRESOLVED_REQUIREMENTS', blockers: blockers.sort(),
    inputCounts: { states: c.states.length, factors: c.factors.length, references: c.references.length },
    fit, comparisons, metrics: { referenceCount: comparisons.length, evaluatedReferenceCount: residuals.length,
      rmseM: residuals.length ? Math.sqrt(residuals.reduce((sum, v) => sum + v * v, 0) / residuals.length) : null,
      maxAbsoluteErrorM: residuals.length ? Math.max(...residuals.map(Math.abs)) : null },
    scope: 'SCALAR_MODEL_ONLY', fieldAccuracyEstablished: false };
}

/** Pure model evaluation, not proof that declared measurements match their referenced artifacts. */
export function evaluateScalarBenchmark(value: unknown) {
  const benchmark = parseScalarBenchmark(value);
  const cases = benchmark.cases.map(evaluateCase);
  const summary = (['DEVELOPMENT', 'HELD_OUT'] as const).map((split) => {
    const selected = cases.filter((c) => c.split === split);
    const residuals = selected.flatMap((c) => c.comparisons.flatMap((r) => r.residualM === null ? [] : [r.residualM]));
    return { split, groupCount: new Set(selected.map((c) => c.groupId)).size, caseCount: selected.length,
      computedCaseCount: selected.filter((c) => c.fit).length, evaluatedReferenceCount: residuals.length,
      rmseM: residuals.length ? Math.sqrt(residuals.reduce((sum, v) => sum + v * v, 0) / residuals.length) : null,
      allCasesComputed: selected.every((c) => c.fit !== null) };
  });
  const payload = { schema: 'payload.scalar-gaussian-benchmark-result.v1', benchmarkId: benchmark.benchmarkId,
    evidenceClass: benchmark.evidenceClass, inputInterpretationAuthority: 'OPERATOR_DECLARATION',
    model: structuredClone(SCALAR_BASELINE_MODEL), modelDigest: localRecordDigest(SCALAR_BASELINE_MODEL),
    manifestDigest: localRecordDigest(benchmark, MAX_BENCHMARK_REPORT_BYTES),
    validationDomain: benchmark.validationDomain, splitBy: benchmark.splitBy, cases, summary,
    interpretation: benchmark.evidenceClass === 'SYNTHETIC_TEST' ? 'ANALYTIC_SOFTWARE_BENCHMARK_ONLY' : 'DECLARED_REFERENCE_COMPARISON_ONLY',
    independentVerification: false, fieldAccuracyEstablished: false, canonicalAdmission: false, physicalActionAuthorized: false,
    learnedModelTrained: false, fullSensorFusionPerformed: false, earthProjectionEligible: false,
  };
  return { ...payload, digest: localRecordDigest(payload, MAX_BENCHMARK_REPORT_BYTES) };
}
export type ScalarBenchmarkResult = ReturnType<typeof evaluateScalarBenchmark>;
