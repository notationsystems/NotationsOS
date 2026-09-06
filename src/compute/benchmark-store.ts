import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { type ArtifactReference } from '../observation/contract';
import { parseReplayJson as parseEvidenceJson } from '../observation/json';
import { benchmarkReferences, benchmarkRequestSchema, MAX_BENCHMARK_BYTES, MAX_BENCHMARK_REPORT_BYTES,
  parseScalarBenchmark, type BenchmarkRequest, type ScalarBenchmark } from './benchmark-contract';
import { evaluateScalarBenchmark, type ScalarBenchmarkResult } from './benchmark';

const MAX_DEPENDENCY_BYTES = 64 * 1024 * 1024;
const timingSchema = z.object({
  scope: z.literal('NEW_RUN_PRE_PUBLICATION_EXCLUDES_PERSISTENCE_AND_READBACK'),
  elapsedMs: z.number().finite().min(0).max(600_000),
  nodeVersion: z.string().regex(/^v[0-9A-Za-z.+-]{1,63}$/),
  platform: z.string().regex(/^[a-z0-9]{1,24}$/), architecture: z.string().regex(/^[a-z0-9_]{1,24}$/),
  independentlyVerified: z.literal(false),
}).strict();
type RuntimeObservation = z.infer<typeof timingSchema>;
type Dependency = ArtifactReference & { byteLength: number; capturedAt: string; storedAt: string;
  decision: ReturnType<typeof evaluateSourceUse> };
export interface BenchmarkRun {
  schema: 'payload.scientific-benchmark-run.v1'; request: BenchmarkRequest; requestDigest: string; evaluatedAt: string;
  modelExecution: ScalarBenchmarkResult; dependencies: Dependency[]; runtimeObservation: RuntimeObservation;
  policyAuthority: 'OPERATOR_DECLARATION'; independentVerification: false; digest: string;
}
function location(id: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('BENCHMARK_INVALID_ID');
  return ['scientific-benchmarks', `${byteDigest(Buffer.from(id)).slice(7)}.json`];
}
function finish(core: Omit<BenchmarkRun, 'runtimeObservation' | 'digest'>, runtimeObservation: RuntimeObservation): BenchmarkRun {
  const payload = { ...core, runtimeObservation: timingSchema.parse(runtimeObservation) };
  return { ...payload, digest: localRecordDigest(payload, MAX_BENCHMARK_REPORT_BYTES) };
}

/** Fixed local model only: no caller-supplied program, training framework, network or admission route. */
export class ScientificBenchmarkStore {
  readonly root: string;
  readonly intake: LocalEvidenceIntake;
  constructor(root: string) { this.root = resolve(root); this.intake = new LocalEvidenceIntake(this.root); }

  private compute(request: BenchmarkRequest, evaluatedAt: string) {
    const at = parseISOInstant(evaluatedAt, 'evaluatedAt');
    if (new Date(at).toISOString() !== evaluatedAt) throw new Error('BENCHMARK_TIME_FORMAT');
    const dependencies = new Map<string, Dependency>(); let total = 0;
    const verify = (ref: ArtifactReference) => {
      const prior = dependencies.get(ref.acquisitionId);
      if (prior) {
        if (prior.acquisitionDigest !== ref.acquisitionDigest || prior.contentDigest !== ref.contentDigest) throw new Error('BENCHMARK_REFERENCE_CONFLICT');
        return;
      }
      const a = this.intake.inspect(ref.acquisitionId);
      if (!a || a.digest !== ref.acquisitionDigest || a.request.contentDigest !== ref.contentDigest) throw new Error('BENCHMARK_EVIDENCE_UNAVAILABLE_OR_CHANGED');
      total += a.request.byteLength;
      if (total > MAX_DEPENDENCY_BYTES) throw new Error('BENCHMARK_DEPENDENCY_BUDGET');
      if (at < parseISOInstant(a.capture.receipt.storedAt, 'storedAt')) throw new Error('BENCHMARK_BEFORE_STORAGE');
      const registration = a.request.manifest.sourceRegistration;
      const decision = evaluateSourceUse(registration, { requestId: `${request.runId}:derive:${dependencies.size}`,
        registrationId: registration.registrationId, purpose: 'scientific-model-benchmark', operation: 'DERIVE', audience: 'INTERNAL', requestedAt: evaluatedAt });
      if (decision.state !== 'ALLOWED') throw new Error('BENCHMARK_DERIVATION_NOT_ALLOWED');
      dependencies.set(ref.acquisitionId, { ...ref, byteLength: a.request.byteLength,
        capturedAt: a.request.manifest.capturedAt, storedAt: a.capture.receipt.storedAt, decision });
    };
    verify(request.manifest);
    const bytes = this.intake.objects.get(request.manifest.contentDigest);
    if (!bytes) throw new Error('BENCHMARK_MANIFEST_UNAVAILABLE');
    const manifest = parseScalarBenchmark(parseEvidenceJson(bytes, MAX_BENCHMARK_BYTES));
    for (const ref of benchmarkReferences(manifest)) verify(ref);
    return { manifest, core: { schema: 'payload.scientific-benchmark-run.v1' as const, request,
      requestDigest: localRecordDigest(request), evaluatedAt, modelExecution: evaluateScalarBenchmark(manifest),
      dependencies: [...dependencies.values()], policyAuthority: 'OPERATOR_DECLARATION' as const, independentVerification: false as const } };
  }

  run(value: unknown, evaluatedAt = new Date().toISOString()) {
    const started = performance.now();
    const request = benchmarkRequestSchema.parse(JSON.parse(encodeLocalRecord(value).toString('utf8')));
    const existing = this.inspect(request.runId);
    if (existing) {
      if (existing.run.requestDigest !== localRecordDigest(request)) throw new Error('BENCHMARK_ID_CONFLICT');
      return { status: 'EXISTING' as const, ...existing };
    }
    const result = this.compute(request, evaluatedAt);
    const run = finish(result.core, { scope: 'NEW_RUN_PRE_PUBLICATION_EXCLUDES_PERSISTENCE_AND_READBACK',
      elapsedMs: performance.now() - started, nodeVersion: process.version, platform: process.platform, architecture: process.arch,
      independentlyVerified: false });
    let status: 'CREATED' | 'EXISTING';
    try { status = publishImmutableFile(this.root, location(request.runId), encodeLocalRecord(run, MAX_BENCHMARK_REPORT_BYTES), MAX_BENCHMARK_REPORT_BYTES); }
    catch (error) {
      const winner = this.inspect(request.runId);
      if (winner?.run.requestDigest === run.requestDigest) return { status: 'EXISTING' as const, ...winner };
      if (winner) throw new Error('BENCHMARK_ID_CONFLICT');
      throw error;
    }
    const confirmed = this.inspect(request.runId);
    if (!confirmed || confirmed.run.digest !== run.digest) throw new Error('BENCHMARK_SAVE_UNCONFIRMED');
    return { status, ...confirmed };
  }

  /** Recompute numerical results and original policy gates; timing is retained, not remeasured or attested. */
  inspect(runId: string): { run: BenchmarkRun; manifest: ScalarBenchmark; rawBytesIncluded: false } | undefined {
    const bytes = readImmutableFile(this.root, location(runId), MAX_BENCHMARK_REPORT_BYTES);
    if (!bytes) return undefined;
    const record = parseEvidenceJson(bytes, MAX_BENCHMARK_REPORT_BYTES);
    exactFields(record, ['schema', 'request', 'requestDigest', 'evaluatedAt', 'modelExecution', 'dependencies', 'runtimeObservation', 'policyAuthority', 'independentVerification', 'digest']);
    const request = benchmarkRequestSchema.parse(record.request);
    if (request.runId !== runId || typeof record.evaluatedAt !== 'string') throw new Error('BENCHMARK_HISTORY_INVALID');
    const result = this.compute(request, record.evaluatedAt);
    const run = finish(result.core, timingSchema.parse(record.runtimeObservation));
    if (localJson(run) !== localJson(record)) throw new Error('BENCHMARK_HISTORY_INVALID');
    return { run, manifest: result.manifest, rawBytesIncluded: false };
  }
}
