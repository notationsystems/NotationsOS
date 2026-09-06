import type { ArtifactReference } from '../../src/observation/contract';
import type { ScalarBenchmark } from '../../src/compute/benchmark-contract';

/** Separate synthetic data and noise assumptions; never filled into the retained sensor-replay fixture. */
export function syntheticScalarBenchmark(refs: {
  assumptions: ArtifactReference; developmentInput: ArtifactReference; developmentReference: ArtifactReference;
  heldOutInput: ArtifactReference; heldOutReference: ArtifactReference;
}): ScalarBenchmark {
  const assumption = () => ({ state: 'DECLARED' as const, description: 'Synthetic analytic benchmark assumption, not measured calibration or field independence.', evidence: { ...refs.assumptions } });
  return { schema: 'payload.scalar-gaussian-benchmark.v1', benchmarkId: 'synthetic-scalar-gaussian-v1',
    purpose: 'scientific-model-benchmark', evidenceClass: 'SYNTHETIC_TEST', splitBy: 'COLLECTION_SESSION',
    validationDomain: { id: 'synthetic-scalar-model', description: 'Invented one-dimensional position constraints with independently declared Gaussian noise.',
      exclusions: ['Not actual GNSS, IMU, LiDAR or camera observations.', 'No rotations, calibration estimation, clock estimation, dynamics or outlier model.',
        'Analytic reference values verify arithmetic; they are not independent field validation.'] },
    cases: (['DEVELOPMENT', 'HELD_OUT'] as const).map((split) => {
      const input = split === 'DEVELOPMENT' ? refs.developmentInput : refs.heldOutInput;
      const reference = split === 'DEVELOPMENT' ? refs.developmentReference : refs.heldOutReference;
      const offset = split === 'DEVELOPMENT' ? 0 : 10;
      return { id: split === 'DEVELOPMENT' ? 'development-case' : 'held-out-case', groupId: `${split}-synthetic-session`, split,
        frame: { id: 'synthetic-cartesian-frame', kind: 'LOCAL_CARTESIAN', axis: 'X', units: 'METRE', description: 'Invented fixed local scalar x axis.' },
        timeline: { id: 'synthetic-timeline', epoch: 'Synthetic arbitrary origin; not a UTC observation.', unit: 'NANOSECOND' },
        fixedRepresentation: assumption(), independentFactorNoise: assumption(), independentReferenceNoise: assumption(),
        states: [{ id: 'x0', timeNs: '0' }, { id: 'x1', timeNs: '1000000000' }],
        factors: [
          { id: 'absolute-0', kind: 'ABSOLUTE', stateId: 'x0', meanM: offset, varianceM2: 1, evidence: input, measurementId: 'absolute-0' },
          { id: 'relative-01', kind: 'RELATIVE', fromStateId: 'x0', toStateId: 'x1', deltaM: 1, varianceM2: 1, evidence: input, measurementId: 'relative-01' },
          { id: 'absolute-1', kind: 'ABSOLUTE', stateId: 'x1', meanM: offset + 2, varianceM2: 1, evidence: input, measurementId: 'absolute-1' },
        ],
        references: [
          { id: 'reference-0', stateId: 'x0', valueM: offset, varianceM2: 0.25, evidence: reference, measurementId: 'reference-0' },
          { id: 'reference-1', stateId: 'x1', valueM: offset + 2, varianceM2: 0.25, evidence: reference, measurementId: 'reference-1' },
        ] };
    }) };
}
