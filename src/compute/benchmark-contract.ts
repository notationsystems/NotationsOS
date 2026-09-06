import { z } from 'zod';
import { artifactReference, nanoseconds, type ArtifactReference } from '../observation/contract';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';

export const MAX_BENCHMARK_BYTES = 128 * 1024;
export const MAX_BENCHMARK_REPORT_BYTES = 512 * 1024;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const text = z.string().min(1).max(512).refine((s) => !!s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const scalar = z.number().finite().min(-1e6).max(1e6);
const variance = z.number().finite().min(1e-8).max(1e6).nullable();
const lineage = { evidence: artifactReference, measurementId: id };
const factors = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('ABSOLUTE'), stateId: id, meanM: scalar, varianceM2: variance, ...lineage }).strict(),
  z.object({ id, kind: z.literal('RELATIVE'), fromStateId: id, toStateId: id, deltaM: scalar, varianceM2: variance, ...lineage }).strict(),
]);
const assumption = z.object({ state: z.enum(['DECLARED', 'UNRESOLVED']), description: text, evidence: artifactReference }).strict();
const caseSchema = z.object({
  id, groupId: id, split: z.enum(['DEVELOPMENT', 'HELD_OUT']),
  frame: z.object({ id, kind: z.literal('LOCAL_CARTESIAN'), axis: z.enum(['X', 'Y', 'Z']), units: z.literal('METRE'), description: text }).strict(),
  timeline: z.object({ id, epoch: text, unit: z.literal('NANOSECOND') }).strict(),
  // Fixed-frame/timing and independence are explicit MODEL assumptions, not source facts.
  fixedRepresentation: assumption, independentFactorNoise: assumption, independentReferenceNoise: assumption,
  states: z.array(z.object({ id, timeNs: nanoseconds }).strict()).min(1).max(16),
  factors: z.array(factors).min(1).max(64),
  references: z.array(z.object({ id, stateId: id, valueM: scalar, varianceM2: variance, ...lineage }).strict()).min(1).max(16),
}).strict();
const schema = z.object({
  schema: z.literal('payload.scalar-gaussian-benchmark.v1'), benchmarkId: id,
  evidenceClass: z.enum(['SYNTHETIC_TEST', 'RECORDED_MEASUREMENTS']),
  purpose: z.literal('scientific-model-benchmark'),
  splitBy: z.enum(['COLLECTION_SESSION', 'SITE', 'GEOMETRY', 'OPERATING_CONDITION']),
  validationDomain: z.object({ id, description: text, exclusions: z.array(text).min(1).max(16) }).strict(),
  cases: z.array(caseSchema).min(2).max(8),
}).strict();

export type ScalarBenchmark = z.infer<typeof schema>;
export type BenchmarkCase = ScalarBenchmark['cases'][number];
export const benchmarkRequestSchema = z.object({
  schema: z.literal('payload.scientific-benchmark-request.v1'), runId: id, manifest: artifactReference,
}).strict();
export type BenchmarkRequest = z.infer<typeof benchmarkRequestSchema>;

function unique(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new Error('BENCHMARK_DUPLICATE_ID');
}
export function parseScalarBenchmark(value: unknown): ScalarBenchmark {
  const b = schema.parse(JSON.parse(encodeLocalRecord(value, MAX_BENCHMARK_BYTES).toString('utf8')));
  unique(b.cases.map((c) => c.id));
  if (!b.cases.some((c) => c.split === 'DEVELOPMENT') || !b.cases.some((c) => c.split === 'HELD_OUT')) throw new Error('BENCHMARK_SPLIT_REQUIRED');
  const groups = new Map<string, string>();
  const observedBytes = new Map<string, { role: 'INPUT' | 'REFERENCE'; split: string }>();
  const measurements = new Set<string>();
  for (const c of b.cases) {
    if (groups.has(c.groupId) && groups.get(c.groupId) !== c.split) throw new Error('BENCHMARK_GROUP_LEAKAGE');
    groups.set(c.groupId, c.split);
    unique(c.states.map((s) => s.id)); unique([...c.factors, ...c.references].map((m) => m.id));
    const states = new Map(c.states.map((s) => [s.id, s]));
    const times = c.states.map((s) => s.timeNs); unique(times);
    for (const f of c.factors) {
      if (f.kind === 'ABSOLUTE') {
        if (!states.has(f.stateId)) throw new Error('BENCHMARK_UNKNOWN_STATE');
      } else if (!states.has(f.fromStateId) || !states.has(f.toStateId) ||
        BigInt(states.get(f.fromStateId)!.timeNs) >= BigInt(states.get(f.toStateId)!.timeNs)) throw new Error('BENCHMARK_RELATIVE_TIME_ORDER');
    }
    for (const r of c.references) if (!states.has(r.stateId)) throw new Error('BENCHMARK_UNKNOWN_STATE');
    unique(c.references.map((r) => r.stateId));
    // This v1 references WHOLE artifacts. Shared input/reference bytes are not an independent holdout.
    // It detects obvious reuse, not undisclosed copying, derived labels or shared calibration bias.
    for (const [role, values] of [['INPUT', c.factors], ['REFERENCE', c.references]] as const) {
      for (const item of values) {
        const content = item.evidence.contentDigest, prior = observedBytes.get(content);
        if (prior && prior.role !== role) throw new Error('BENCHMARK_REFERENCE_LEAKAGE');
        if (prior && prior.split !== c.split) throw new Error('BENCHMARK_SPLIT_CONTENT_LEAKAGE');
        observedBytes.set(content, { role, split: c.split });
        const key = `${content}:${item.measurementId}`;
        if (measurements.has(key)) throw new Error('BENCHMARK_MEASUREMENT_REUSE');
        measurements.add(key);
      }
    }
  }
  benchmarkReferences(b); // Conflicting acquisition identities fail before computation or storage.
  return b;
}

export function benchmarkReferences(b: ScalarBenchmark): ArtifactReference[] {
  const refs = b.cases.flatMap((c) => [c.fixedRepresentation.evidence, c.independentFactorNoise.evidence, c.independentReferenceNoise.evidence,
    ...c.factors.map((f) => f.evidence), ...c.references.map((r) => r.evidence)]);
  const byId = new Map<string, ArtifactReference>();
  for (const ref of refs) {
    const previous = byId.get(ref.acquisitionId);
    if (previous && localRecordDigest(previous) !== localRecordDigest(ref)) throw new Error('BENCHMARK_REFERENCE_CONFLICT');
    byId.set(ref.acquisitionId, ref);
  }
  if (byId.size > 64) throw new Error('BENCHMARK_DEPENDENCY_LIMIT');
  return [...byId.values()].sort((a, b) => a.acquisitionId < b.acquisitionId ? -1 : a.acquisitionId > b.acquisitionId ? 1 : 0);
}
