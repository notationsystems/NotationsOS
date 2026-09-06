import { syntheticScalarBenchmark } from '../../examples/compute/scalar-benchmark';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { encodeLocalRecord } from '../data-os/local-record';
import { MAX_BENCHMARK_BYTES } from './benchmark-contract';
import { ScientificBenchmarkStore } from './benchmark-store';

function declaration(acquisitionId: string): LocalIntakeManifest {
  return { schema: 'payload.local-intake-request.v1', acquisitionId, evidenceId: `${acquisitionId}:evidence`,
    mediaType: 'application/json', capturedAt: '2020-01-01T00:00:00.000Z', purpose: 'scientific-model-benchmark',
    sourceRegistration: { registrationId: 'synthetic-scalar-benchmark:v1', sourceId: 'synthetic-scalar-benchmark',
      displayName: 'SYNTHETIC analytic scalar benchmark; no physical measurements', sourceClass: 'synthetic-test',
      licenseId: 'operator-declaration:synthetic-local-test', policyVersion: '1.0.0', effectiveFrom: '2020-01-01T00:00:00.000Z',
      permittedPurposes: ['scientific-model-benchmark'], allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' } } };
}
export function runScalarBenchmarkDemo(root: string, now = new Date().toISOString()) {
  const intake = new LocalEvidenceIntake(root);
  const capture = (id: string, content: unknown) => {
    const a = intake.capture(declaration(id), encodeLocalRecord(content, MAX_BENCHMARK_BYTES), now).acquisition;
    return { acquisitionId: id, acquisitionDigest: a.digest, contentDigest: a.request.contentDigest };
  };
  const assumptions = capture('synthetic-scalar-assumptions-v1', { evidenceClass: 'SYNTHETIC_TEST',
    assumptions: ['Fixed scalar representation', 'Independent Gaussian factor noise, variance 1 square metre',
      'Independent reference noise, variance 0.25 square metre', 'Invented reference values, no field validation'] });
  const developmentInput = capture('synthetic-scalar-development-input-v1', { evidenceClass: 'SYNTHETIC_TEST',
    group: 'development', absolute0M: 0, relative01M: 1, absolute1M: 2, varianceM2: 1 });
  const developmentReference = capture('synthetic-scalar-development-reference-v1', { evidenceClass: 'SYNTHETIC_TEST',
    group: 'development', reference0M: 0, reference1M: 2, varianceM2: 0.25 });
  const heldOutInput = capture('synthetic-scalar-heldout-input-v1', { evidenceClass: 'SYNTHETIC_TEST',
    group: 'held-out', absolute0M: 10, relative01M: 1, absolute1M: 12, varianceM2: 1 });
  const heldOutReference = capture('synthetic-scalar-heldout-reference-v1', { evidenceClass: 'SYNTHETIC_TEST',
    group: 'held-out', reference0M: 10, reference1M: 12, varianceM2: 0.25 });
  const manifest = capture('synthetic-scalar-manifest-v1', syntheticScalarBenchmark({ assumptions, developmentInput, developmentReference, heldOutInput, heldOutReference }));
  return new ScientificBenchmarkStore(root).run({ schema: 'payload.scientific-benchmark-request.v1', runId: 'synthetic-scalar-benchmark-v1', manifest }, now);
}
