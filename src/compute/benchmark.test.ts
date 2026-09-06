import { describe, expect, it } from 'vitest';
import { syntheticScalarBenchmark } from '../../examples/compute/scalar-benchmark';
import { benchmarkReferences, parseScalarBenchmark, type ScalarBenchmark } from './benchmark-contract';
import { evaluateScalarBenchmark } from './benchmark';

const ref = (id: string, code: string) => ({ acquisitionId: id, acquisitionDigest: `sha256:${code.repeat(64)}`, contentDigest: `sha256:${code.repeat(64)}` });
const fixture = () => syntheticScalarBenchmark({ assumptions: ref('assumptions', 'a'), developmentInput: ref('development-input', 'b'),
  developmentReference: ref('development-reference', 'c'), heldOutInput: ref('held-out-input', 'd'), heldOutReference: ref('held-out-reference', 'e') });

describe('a conventional model with declared held-out comparisons', () => {
  it('matches an analytic oracle, preserves joint uncertainty and refuses to call it physical validation', () => {
    const input = fixture(), before = structuredClone(input); const result = evaluateScalarBenchmark(input);
    expect(input).toEqual(before); expect(evaluateScalarBenchmark(input)).toEqual(result);
    expect(result).toMatchObject({ evidenceClass: 'SYNTHETIC_TEST', interpretation: 'ANALYTIC_SOFTWARE_BENCHMARK_ONLY',
      independentVerification: false, fieldAccuracyEstablished: false, canonicalAdmission: false,
      physicalActionAuthorized: false, learnedModelTrained: false, fullSensorFusionPerformed: false, earthProjectionEligible: false });
    const fit = result.cases[0].fit!;
    expect(fit.states[0].meanM).toBeCloseTo(1 / 3, 12);
    expect(fit.states[1].meanM).toBeCloseTo(5 / 3, 12);
    expect(fit.states[0].varianceM2).toBeCloseTo(2 / 3, 12);
    expect(fit.covarianceM2[0][1]).toBeCloseTo(1 / 3, 12);
    expect(result.cases[0].metrics.rmseM).toBeCloseTo(1 / 3, 12);
    expect(result.cases[0].comparisons[0].predictiveResidualVarianceM2).toBeCloseTo(2 / 3 + 0.25, 12);
    expect(result.summary).toMatchObject([{ split: 'DEVELOPMENT', groupCount: 1, allCasesComputed: true }, { split: 'HELD_OUT', groupCount: 1, allCasesComputed: true }]);
  });
  it('never passes reference values or reference variances to the solver', () => {
    const input = fixture(), before = evaluateScalarBenchmark(input);
    for (const c of input.cases) for (const r of c.references) { r.valueM += 100; r.varianceM2 = 100; }
    const after = evaluateScalarBenchmark(input);
    expect(after.cases.map((c) => c.fit)).toEqual(before.cases.map((c) => c.fit));
    expect(after.cases[0].metrics.rmseM).toBeGreaterThan(99);
  });
  it('returns detached model metadata and names fitted residuals without implying z-score calibration', () => {
    const input = fixture(), result = evaluateScalarBenchmark(input), expected = structuredClone(result);
    expect(result.model.fittedResidualSemantics).toContain('NOT_INDEPENDENT_UNIT_NORMAL');
    expect(result.model.numericalContract.maximumScaledConditionInfinity).toBe(1e10);
    Object.assign(result.model.numericalContract, { maximumStates: 999 });
    (result.model.assumptions as string[]).push('not an assumption');
    expect(evaluateScalarBenchmark(input)).toEqual(expected);
  });
  it('holds out whole groups and keeps development and held-out metrics separate', () => {
    const input = fixture(); input.cases[0].references[0].valueM = 100;
    const result = evaluateScalarBenchmark(input);
    expect(result.summary[0].rmseM).toBeGreaterThan(50);
    expect(result.summary[1].rmseM).toBeCloseTo(1 / 3, 12);
  });
  it('retains raw reference residuals but does not normalize unknown/correlated uncertainty', () => {
    const input = fixture(); input.cases[0].references[0].varianceM2 = null;
    input.cases[1].independentReferenceNoise.state = 'UNRESOLVED';
    const result = evaluateScalarBenchmark(input);
    expect(result.cases[0].comparisons[0]).toMatchObject({ predictiveResidualVarianceM2: null, standardizedResidual: null, uncertaintyComparison: 'REFERENCE_VARIANCE_UNAVAILABLE' });
    expect(result.cases[0].comparisons[0].residualM).toBeCloseTo(1 / 3, 12);
    expect(result.cases[1].comparisons[0]).toMatchObject({ standardizedResidual: null, uncertaintyComparison: 'REFERENCE_INDEPENDENCE_UNRESOLVED' });
  });
  it.each([
    ['variance', 'FACTOR_VARIANCE_UNAVAILABLE'], ['representation', 'FIXED_REPRESENTATION_UNRESOLVED'], ['independence', 'FACTOR_NOISE_INDEPENDENCE_UNRESOLVED'],
  ])('records missing %s without defaulting certainty or silently dropping a factor', (field, code) => {
    const input = fixture();
    if (field === 'variance') input.cases[0].factors[0].varianceM2 = null;
    else if (field === 'representation') input.cases[0].fixedRepresentation.state = 'UNRESOLVED';
    else input.cases[0].independentFactorNoise.state = 'UNRESOLVED';
    const result = evaluateScalarBenchmark(input);
    expect(result.cases[0]).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', fit: null, blockers: [code], metrics: { rmseM: null, evaluatedReferenceCount: 0 } });
    expect(result.summary[0]).toMatchObject({ allCasesComputed: false, computedCaseCount: 0, rmseM: null });
    expect(result.cases[1].state).toBe('COMPUTED');
  });
  it('does not let withheld references anchor an otherwise unobservable graph', () => {
    const input = fixture(); input.cases[0].factors = input.cases[0].factors.filter((f) => f.kind === 'RELATIVE');
    expect(evaluateScalarBenchmark(input).cases[0]).toMatchObject({ state: 'UNRESOLVED_REQUIREMENTS', fit: null, blockers: ['GAUSSIAN_UNANCHORED_COMPONENT'] });
  });
  it('retains refusal for numerically unsafe precision ratios instead of adding jitter', () => {
    const input = fixture(); input.cases[0].factors = input.cases[0].factors.slice(0, 2);
    input.cases[0].factors[0].varianceM2 = 1e6; input.cases[0].factors[1].varianceM2 = 1e-8;
    expect(evaluateScalarBenchmark(input).cases[0]).toMatchObject({ fit: null, blockers: ['GAUSSIAN_ILL_CONDITIONED'] });
  });
  it('does not promote a declared recorded-data input to verified field accuracy', () => {
    const input = fixture(); input.evidenceClass = 'RECORDED_MEASUREMENTS';
    expect(evaluateScalarBenchmark(input)).toMatchObject({ inputInterpretationAuthority: 'OPERATOR_DECLARATION',
      interpretation: 'DECLARED_REFERENCE_COMPARISON_ONLY', fieldAccuracyEstablished: false, independentVerification: false });
  });
});

describe('benchmark provenance, units and split contract', () => {
  const changes: Array<[string, (b: ScalarBenchmark) => void, string?]> = [
    ['group leakage', (b) => { b.cases[1].groupId = b.cases[0].groupId; }, 'BENCHMARK_GROUP_LEAKAGE'],
    ['reference reused as input', (b) => { b.cases[0].references[0].evidence = b.cases[0].factors[0].evidence; }, 'BENCHMARK_REFERENCE_LEAKAGE'],
    ['content reused in heldout', (b) => { b.cases[1].factors[0].evidence = { ...b.cases[0].factors[0].evidence, acquisitionId: 'disguised-copy' }; }, 'BENCHMARK_SPLIT_CONTENT_LEAKAGE'],
    ['reference bytes reused across split', (b) => { b.cases[1].references[0].evidence = b.cases[0].references[0].evidence; }, 'BENCHMARK_SPLIT_CONTENT_LEAKAGE'],
    ['measurement counted twice', (b) => { b.cases[0].factors[1].measurementId = b.cases[0].factors[0].measurementId; }, 'BENCHMARK_MEASUREMENT_REUSE'],
    ['duplicate states', (b) => { b.cases[0].states.push(b.cases[0].states[0]); }],
    ['duplicate case', (b) => { b.cases.push(b.cases[0]); }],
    ['duplicate timestamp', (b) => { b.cases[0].states[1].timeNs = b.cases[0].states[0].timeNs; }],
    ['fractional timestamp', (b) => { b.cases[0].states[0].timeNs = '0.1'; }],
    ['relative time reversal', (b) => { b.cases[0].states[1].timeNs = '-1'; }, 'BENCHMARK_RELATIVE_TIME_ORDER'],
    ['unknown state', (b) => { b.cases[0].references[0].stateId = 'missing'; }, 'BENCHMARK_UNKNOWN_STATE'],
    ['missing heldout group', (b) => { b.cases[1].split = 'DEVELOPMENT'; }, 'BENCHMARK_SPLIT_REQUIRED'],
    ['zero factor variance', (b) => { b.cases[0].factors[0].varianceM2 = 0; }],
    ['negative reference variance', (b) => { b.cases[0].references[0].varianceM2 = -1; }],
    ['infinite value', (b) => { b.cases[0].references[0].valueM = Infinity; }],
    ['different reference for acquisition', (b) => { b.cases[0].independentFactorNoise.evidence = { ...b.cases[0].fixedRepresentation.evidence, acquisitionDigest: `sha256:${'f'.repeat(64)}` }; }, 'BENCHMARK_REFERENCE_CONFLICT'],
  ];
  it.each(changes)('rejects %s', (_, change, code) => {
    const input = fixture(); change(input);
    if (code) expect(() => parseScalarBenchmark(input)).toThrow(code);
    else expect(() => parseScalarBenchmark(input)).toThrow();
  });
  it.each(['program', 'model', 'admitted', 'threshold', 'randomSplitSeed'])('rejects extra execution/authority field %s', (key) => {
    expect(() => parseScalarBenchmark({ ...fixture(), [key]: 'not supported' })).toThrow();
  });
  it('rejects units or frames incompatible with the fixed scalar model', () => {
    for (const change of [{ units: 'DEGREE' }, { kind: 'GEODETIC' }, { axis: 'YAW' }]) {
      const input = fixture(); Object.assign(input.cases[0].frame, change); expect(() => parseScalarBenchmark(input)).toThrow();
    }
  });
  it('bounds cases, states and factors', () => {
    for (const n of ['cases', 'states', 'factors']) {
      const input = fixture();
      if (n === 'cases') input.cases = Array(9).fill(input.cases[0]);
      if (n === 'states') input.cases[0].states = Array(17).fill(input.cases[0].states[0]);
      if (n === 'factors') input.cases[0].factors = Array(65).fill(input.cases[0].factors[0]);
      expect(() => parseScalarBenchmark(input)).toThrow();
    }
  });
  it('deduplicates shared assumption evidence but preserves separate input/reference bytes', () => {
    expect(benchmarkReferences(fixture())).toHaveLength(5);
  });
});
