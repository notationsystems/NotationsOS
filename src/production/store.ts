import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CARRIER_ADAPTER } from '../data-os/caravan-carrier-adapter';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalCandidateBuildStore } from '../data-os/local-candidate-build';
import { LocalEvidenceIntake, type LocalAcquisition } from '../data-os/local-intake';
import { LocalNormalizationStore } from '../data-os/local-normalization';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { decodeProductionContent, parseProductionCommand, parseProductionRef, productionId, validateProductionDefinition,
  validateProductionSource, type ProductionCommand, type ProductionCorpusDefinition, type ProductionObjectKind, type ProductionOutputRef,
  type ProductionRef, type ProductionResult, type ProductionRun, type ProductionSourceConfig, type ProductionStage, type ProductionStageName } from './contracts';
import { ProductionError } from './errors';

const MAX_RECORD = 512 * 1024;
const digest = (value: unknown) => localRecordDigest(value, MAX_RECORD);
type Registration = { schema: 'payload.production-registration.v1'; kind: 'CORPUS' | 'SOURCE'; id: string;
  registeredAt: string; spec: ProductionCorpusDefinition | ProductionSourceConfig; digest: string };
interface Intent { schema: 'payload.production-intent.v1'; id: string; request: Record<string, unknown>; requestDigest: string; startedAt: string; digest: string }
const reference = (kind: ProductionObjectKind, id: string, digest: string): ProductionOutputRef => ({ kind, id, digest });
const generated = (kind: string, requestId: string) => `production:${kind}:${byteDigest(Buffer.from(requestId)).slice(7)}`;
const mediaType = (source: ProductionSourceConfig) => source.adapter.id === CARRIER_ADAPTER.id ? 'application/json' : 'application/x-step';
function prepared(command: ProductionCommand): Record<string, unknown> {
  if (command.kind !== 'ACQUIRE') return structuredClone(command);
  const { contentBase64, ...metadata } = command;
  const content = decodeProductionContent(contentBase64);
  return { ...metadata, content: { digest: byteDigest(content), byteLength: content.byteLength } };
}
function validatePrepared(value: Record<string, unknown>) {
  if (value.kind !== 'ACQUIRE') { parseProductionCommand(value); return; }
  exactFields(value, ['schema', 'requestId', 'kind', 'source', 'purpose', 'content']);
  exactFields(value.content, ['digest', 'byteLength']);
  parseProductionRef({ id: 'content', digest: value.content.digest });
  if (typeof value.content.byteLength !== 'number' || !Number.isSafeInteger(value.content.byteLength) || value.content.byteLength < 1 || value.content.byteLength > 1024 * 1024) throw new Error();
  const { content: _content, ...metadata } = value;
  void _content;
  parseProductionCommand({ ...metadata, contentBase64: 'YQ==' });
}

/** Local operator-declared configuration and receipts, never a released/canonical corpus. */
export class LocalProductionStore {
  readonly root: string;
  readonly intake: LocalEvidenceIntake;
  readonly normalizations: LocalNormalizationStore;
  readonly builds: LocalCandidateBuildStore;
  constructor(root: string, private readonly now: () => string = () => new Date().toISOString()) {
    this.root = resolve(root); this.intake = new LocalEvidenceIntake(this.root);
    this.normalizations = new LocalNormalizationStore(this.root); this.builds = new LocalCandidateBuildStore(this.root);
  }
  private time() { const time = this.now(); parseISOInstant(time, 'backend clock'); return time; }
  private path(folder: string, id: string) { productionId(id); return ['production-v1', folder, `${byteDigest(Buffer.from(id)).slice(7)}.json`]; }
  private read(folder: string, id: string): Record<string, unknown> | undefined {
    try {
      const bytes = readImmutableFile(this.root, this.path(folder, id), MAX_RECORD);
      if (!bytes) return undefined;
      const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!record || typeof record !== 'object' || record.id !== id) throw new Error();
      const { digest: recorded, ...payload } = record;
      if (digest(payload) !== recorded) throw new Error();
      return record;
    } catch { throw new ProductionError('STORED_RECORD_INVALID', 'Preserve the local production files; a stored record did not validate.', 503); }
  }
  private publish(folder: string, id: string, payload: Record<string, unknown>) {
    const record = { ...payload, digest: digest(payload) };
    const status = publishImmutableFile(this.root, this.path(folder, id), encodeLocalRecord(record, MAX_RECORD), MAX_RECORD);
    return { status, record };
  }
  private names(folder: string, maximum: number) {
    const directory = join(this.root, 'production-v1', folder);
    for (const path of [this.root, join(this.root, 'production-v1'), directory]) {
      try { const stat = lstatSync(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(); }
      catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
        throw new ProductionError('STORED_RECORD_INVALID', 'Catalog directories must be regular local directories.', 503);
      }
    }
    const names = readdirSync(directory).filter((name) => !/^\.payload-[a-f0-9-]+\.tmp$/.test(name));
    if (names.length > maximum || names.some((name) => !/^[a-f0-9]{64}\.json$/.test(name))) throw new ProductionError('CATALOG_CAPACITY', 'The bounded local catalog cannot be enumerated safely.', 409);
    return names.sort();
  }
  private capacity(folder: string, maximum: number) {
    if (this.names(folder, maximum).length >= maximum) throw new ProductionError('CATALOG_CAPACITY', 'Preserve this local catalog; create a separately configured workspace to continue.', 409);
  }
  private reserved<T>(action: () => T): T {
    // Only count-and-reserve/publication is serialized, not evidence processing
    // or historical inspection. Never steal a lock left by a killed worker.
    this.names('intents', 128);
    const directory = join(this.root, 'production-v1');
    mkdirSync(directory, { recursive: true });
    const lockPath = join(directory, 'catalog.lock'); let lock: number;
    try { lock = openSync(lockPath, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') throw new ProductionError('PRODUCTION_BUSY', 'A catalog reservation is active or requires operator recovery. Retry without deleting a live lock.', 503,
        { outputs: [], retry: { sameRequest: true, newRequestRequired: false }, remediation: ['WAIT_FOR_ACTIVE_RESERVATION', 'OPERATOR_VERIFY_OWNER_BEFORE_LOCK_RECOVERY'] });
      throw new ProductionError('LOCAL_STORAGE_UNAVAILABLE', 'The catalog reservation could not be acquired.', 503);
    }
    try { return action(); }
    finally { closeSync(lock); unlinkSync(lockPath); }
  }
  private registration(kind: 'CORPUS' | 'SOURCE', ref: ProductionRef): Registration {
    const record = this.read(kind === 'CORPUS' ? 'corpora' : 'sources', ref.id);
    if (!record) throw new ProductionError('REFERENCE_NOT_FOUND', 'The exact registered dependency is unavailable.', 404);
    try {
      exactFields(record, ['schema', 'kind', 'id', 'registeredAt', 'spec', 'digest']);
      if (record.schema !== 'payload.production-registration.v1' || record.kind !== kind || record.digest !== ref.digest) throw new Error();
      parseISOInstant(record.registeredAt, 'registeredAt');
      if (kind === 'CORPUS') validateProductionDefinition(record.spec); else validateProductionSource(record.spec);
      if (record.spec.id !== ref.id) throw new Error();
      return record as unknown as Registration;
    } catch { throw new ProductionError('REFERENCE_MISMATCH', 'The registration does not match its exact reference and contract.', 409); }
  }
  private corpus(ref: ProductionRef) { return this.registration('CORPUS', ref).spec as ProductionCorpusDefinition; }
  private source(ref: ProductionRef) {
    const source = this.registration('SOURCE', ref).spec as ProductionSourceConfig;
    const corpus = this.corpus(source.corpus); this.sourceBinding(source, corpus);
    return source;
  }
  private sourceBinding(source: ProductionSourceConfig, corpus: ProductionCorpusDefinition) {
    if (!corpus.evidenceClasses.includes(source.policy.sourceClass) || localJson(source.supportedCoverage) !== localJson(corpus.coverage) ||
        (corpus.recordType === 'Carrier' ? source.adapter.id !== CARRIER_ADAPTER.id : source.adapter.id !== 'payload.ifc-artifact/v1')) {
      throw new ProductionError('SOURCE_BINDING_MISMATCH', 'Source class, declared coverage and fixed adapter must match the registered corpus.', 409);
    }
  }
  private purpose(corpus: ProductionCorpusDefinition, purpose: string) {
    if (!corpus.intendedUses.includes(purpose)) throw new ProductionError('PURPOSE_NOT_DECLARED', 'The intended use is not declared by this corpus definition.', 403);
  }
  private permitted(policy: SourceRegistration, purpose: string, operation: 'INGEST' | 'DERIVE', at: string, id: string) {
    const decision = evaluateSourceUse(policy, { requestId: `${id}:${operation.toLowerCase()}`, registrationId: policy.registrationId,
      operation, audience: 'INTERNAL', purpose, requestedAt: at });
    if (decision.state !== 'ALLOWED') throw new ProductionError(operation === 'INGEST' ? 'INGEST_DISALLOWED' : 'DERIVATION_DISALLOWED', 'The current operation is not allowed by the declared source policy.', 403);
    return decision;
  }
  private acquisition(ref: ProductionRef) {
    let acquisition: LocalAcquisition | undefined;
    try { acquisition = this.intake.inspect(ref.id); }
    catch { throw new ProductionError('EVIDENCE_INTEGRITY_FAILED', 'The retained evidence or acquisition receipt did not verify.', 409); }
    if (!acquisition) throw new ProductionError('REFERENCE_NOT_FOUND', 'The exact acquisition is unavailable.', 404);
    if (acquisition.digest !== ref.digest) throw new ProductionError('REFERENCE_MISMATCH', 'The acquisition digest does not match.', 409);
    return acquisition;
  }
  private register(kind: 'CORPUS' | 'SOURCE', spec: ProductionCorpusDefinition | ProductionSourceConfig, at: string): ProductionOutputRef {
    return this.reserved(() => this.registerReserved(kind, spec, at));
  }
  private registerReserved(kind: 'CORPUS' | 'SOURCE', spec: ProductionCorpusDefinition | ProductionSourceConfig, at: string): ProductionOutputRef {
    const folder = kind === 'CORPUS' ? 'corpora' : 'sources';
    const existing = this.read(folder, spec.id);
    if (existing) {
      const checked = this.registration(kind, { id: spec.id, digest: existing.digest as string });
      if (localJson(checked.spec) !== localJson(spec)) throw new ProductionError('REGISTRATION_CONFLICT', 'This immutable registration identifier already names a different definition.', 409);
      return reference(kind, spec.id, checked.digest);
    }
    this.capacity(folder, 64);
    try {
      const { record } = this.publish(folder, spec.id, { schema: 'payload.production-registration.v1', kind, id: spec.id, registeredAt: at, spec });
      this.registration(kind, { id: spec.id, digest: record.digest });
      return reference(kind, spec.id, record.digest);
    } catch (error) {
      const winner = this.read(folder, spec.id);
      if (winner && localJson(winner.spec) === localJson(spec)) return reference(kind, spec.id, winner.digest as string);
      if (winner) throw new ProductionError('REGISTRATION_CONFLICT', 'Another request registered a different definition under this identifier.', 409);
      throw error;
    }
  }
  private intent(id: string): Intent | undefined {
    const value = this.read('intents', id);
    if (!value) return undefined;
    try {
      exactFields(value, ['schema', 'id', 'request', 'requestDigest', 'startedAt', 'digest']);
      if (value.schema !== 'payload.production-intent.v1') throw new Error();
      validatePrepared(value.request as Record<string, unknown>);
      if ((value.request as Record<string, unknown>).requestId !== id || digest(value.request) !== value.requestDigest) throw new Error();
      parseISOInstant(value.startedAt, 'startedAt'); return value as unknown as Intent;
    } catch { throw new ProductionError('STORED_RECORD_INVALID', 'The saved operation intent did not validate.', 503); }
  }
  private retained(intent: Intent): ProductionOutputRef[] {
    try { return this.discoverRetained(intent); }
    catch { return []; } // Unverified artifacts are not successful retained-output claims.
  }
  private discoverRetained(intent: Intent): ProductionOutputRef[] {
    const id = intent.id;
    // Only output identities generated by this operation are searched. Corrupt
    // or incomplete artifacts are never advertised as verified references.
      if (intent.request.kind === 'ACQUIRE') {
        const acquisition = this.intake.inspect(generated('acquisition', id));
        if (acquisition && acquisition.request.manifest.capturedAt === intent.startedAt && acquisition.request.contentDigest === (intent.request.content as { digest: string }).digest) {
          return [reference('ACQUISITION', acquisition.request.manifest.acquisitionId, acquisition.digest)];
        }
        const contentDigest = (intent.request.content as { digest: string }).digest;
        if (this.intake.objects.get(contentDigest)) return [reference('CONTENT', contentDigest, contentDigest)];
      } else if (intent.request.kind === 'NORMALIZE') {
        const run = this.normalizations.inspect(generated('normalization', id));
        if (run) {
          const source = this.source(intent.request.source as ProductionRef);
          const acquisition = intent.request.acquisition as ProductionRef;
          if (run.normalizedAt !== intent.startedAt || run.request.acquisitionDigest !== acquisition.digest ||
              run.request.manifest.acquisitionId !== acquisition.id || run.request.manifest.purpose !== intent.request.purpose ||
              localJson(run.request.manifest.profile) !== localJson({ id: source.id, version: source.version,
                sourceRegistrationId: source.policy.registrationId, sourceId: source.policy.sourceId, adapterId: CARRIER_ADAPTER.id })) throw new Error();
          return [reference('NORMALIZATION', run.request.manifest.normalizationId, run.digest)];
        }
      } else if (intent.request.kind === 'BUILD_CANDIDATES') {
        const build = this.builds.inspect(generated('build', id));
        if (build) {
          const corpus = this.corpus(intent.request.corpus as ProductionRef);
          if (build.builtAt !== intent.startedAt || build.knownThrough !== intent.startedAt || build.request.manifest.purpose !== intent.request.purpose ||
              localJson(build.request.members.map((member) => member.normalization)) !== localJson(intent.request.members) ||
              localJson(build.request.manifest.definition) !== localJson({ id: corpus.id, version: corpus.version,
                domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: [...corpus.evidenceClasses].sort() })) throw new Error();
          return [reference('CANDIDATE_BUILD', build.buildId, build.digest)];
        }
      } else {
        const kind = intent.request.kind === 'REGISTER_CORPUS' ? 'CORPUS' : 'SOURCE';
        const spec = (intent.request.definition ?? intent.request.source) as ProductionCorpusDefinition | ProductionSourceConfig;
        const record = this.read(kind === 'CORPUS' ? 'corpora' : 'sources', spec.id);
        if (record && localJson(record.spec) === localJson(spec)) return [reference(kind, spec.id, record.digest as string)];
      }
    return [];
  }
  private run(id: string): ProductionRun | undefined {
    const value = this.read('runs', id);
    if (!value) return undefined;
    try {
      exactFields(value, ['schema', 'id', 'mode', 'request', 'requestDigest', 'startedAt', 'completedAt', 'state', 'stages', 'outputs', 'failure',
        'policyAuthority', 'canonicalAdmission', 'releaseActivated', 'sourceTruthClaimed', 'completenessClaimed',
        'coverageVerified', 'freshnessVerified', 'definitionRequirementsVerified', 'digest']);
      const intent = this.intent(id);
      if (!intent || value.schema !== 'payload.production-run.v1' || value.mode !== 'LOCAL_DEVELOPMENT' ||
          value.policyAuthority !== 'OPERATOR_DECLARATION' || value.canonicalAdmission !== false || value.releaseActivated !== false ||
          value.sourceTruthClaimed !== false || value.completenessClaimed !== false || value.requestDigest !== intent.requestDigest ||
          value.coverageVerified !== false || value.freshnessVerified !== false || value.definitionRequirementsVerified !== false ||
          value.startedAt !== intent.startedAt || localJson(value.request) !== localJson(intent.request) ||
          parseISOInstant(value.completedAt, 'completedAt') < parseISOInstant(value.startedAt, 'startedAt') ||
          !['COMPLETED', 'FAILED', 'QUARANTINED'].includes(String(value.state)) || !Array.isArray(value.stages) || !Array.isArray(value.outputs)) throw new Error();
      for (const output of value.outputs as ProductionOutputRef[]) {
        exactFields(output, ['kind', 'id', 'digest']); if (output.kind === 'RUN') throw new Error();
        this.inspect(output.kind, parseProductionRef({ id: output.id, digest: output.digest }));
      }
      this.validateOutcome(value as unknown as ProductionRun, intent);
      return value as unknown as ProductionRun;
    } catch (error) {
      if (error instanceof ProductionError) throw error;
      throw new ProductionError('STORED_RECORD_INVALID', 'The historical run or its retained dependencies did not validate.', 503);
    }
  }
  private validateOutcome(run: ProductionRun, intent: Intent) {
    if (run.outputs.length > 65 || run.stages.length < 1 || run.stages.length > 4 ||
        new Set(run.outputs.map((ref) => localJson(ref))).size !== run.outputs.length) throw new Error();
    for (const stage of run.stages) {
      exactFields(stage, ['stage', 'state', 'code', 'outputs']);
      if (!['REGISTRATION', 'CAPTURE', 'EVIDENCE_INSPECTION', 'EXTRACTION', 'NORMALIZATION', 'CANDIDATE_ASSEMBLY', 'BUILD_INSPECTION'].includes(stage.stage) ||
          !['COMPLETED', 'FAILED', 'QUARANTINED', 'NOT_RUN'].includes(stage.state) || !/^[A-Z][A-Z0-9_]{0,79}$/.test(stage.code) || !Array.isArray(stage.outputs)) throw new Error();
      for (const ref of stage.outputs) if (!run.outputs.some((output) => localJson(output) === localJson(ref))) throw new Error();
    }
    if (run.state === 'COMPLETED') { if (run.failure !== null) throw new Error(); }
    else {
      if (!run.failure) throw new Error();
      exactFields(run.failure, ['code', 'artifactRetained', 'receiptRetained', 'runReceiptRetained', 'retry', 'remediation'], ['additionalOutputRetention']);
      exactFields(run.failure.retry, ['sameRequest', 'newRequestRequired']);
      if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(run.failure.code) || ![true, false, 'UNCONFIRMED'].includes(run.failure.artifactRetained) ||
          ![true, false, 'UNCONFIRMED'].includes(run.failure.receiptRetained) || run.failure.runReceiptRetained !== true ||
          run.failure.retry.sameRequest !== true || run.failure.retry.newRequestRequired !== true || !Array.isArray(run.failure.remediation) ||
          run.failure.remediation.length < 1 || run.failure.remediation.length > 4 || run.failure.remediation.some((step) => !/^[A-Z_]{1,80}$/.test(step))) throw new Error();
      if (run.failure.additionalOutputRetention !== undefined &&
          (run.failure.additionalOutputRetention !== 'UNCONFIRMED' || run.state !== 'FAILED' || !['NORMALIZE', 'BUILD_CANDIDATES'].includes(String(intent.request.kind)))) throw new Error();
      const hasReceipt = run.outputs.some((ref) => ['ACQUISITION', 'NORMALIZATION', 'CANDIDATE_BUILD'].includes(ref.kind));
      const hasArtifact = hasReceipt || run.outputs.some((ref) => ref.kind === 'CONTENT');
      if (hasReceipt ? run.failure.receiptRetained !== true : run.failure.receiptRetained === true) throw new Error();
      if (hasArtifact ? run.failure.artifactRetained !== true : run.failure.artifactRetained === true) throw new Error();
      if (run.failure.code === 'INGEST_DISALLOWED' && (run.failure.artifactRetained !== false || run.failure.receiptRetained !== false)) throw new Error();
      if (run.state === 'FAILED') {
        const last = run.stages[run.stages.length - 1];
        if (last.state !== 'FAILED' || last.code !== run.failure.code || run.stages.slice(0, -1).some((stage) => stage.state !== 'COMPLETED')) throw new Error();
        return;
      }
    }
    const request = intent.request;
    const expected: ProductionStage[] = [];
    const completed = (stage: ProductionStageName, code: string, outputs: ProductionOutputRef[]) => expected.push({ stage, state: 'COMPLETED', code, outputs });
    if (request.kind === 'REGISTER_CORPUS' || request.kind === 'REGISTER_SOURCE') {
      if (run.state !== 'COMPLETED' || run.outputs.length !== 1) throw new Error();
      const spec = (request.definition ?? request.source) as ProductionCorpusDefinition | ProductionSourceConfig;
      const kind = request.kind === 'REGISTER_CORPUS' ? 'CORPUS' : 'SOURCE'; const ref = run.outputs[0];
      if (ref.kind !== kind || ref.id !== spec.id || localJson(this.registration(kind, ref).spec) !== localJson(spec)) throw new Error();
      completed('REGISTRATION', 'CONFIGURATION_ONLY', [ref]);
    } else if (request.kind === 'ACQUIRE') {
      if (run.state !== 'COMPLETED' || run.outputs.length !== 1 || run.outputs[0].kind !== 'ACQUISITION' || run.outputs[0].id !== generated('acquisition', run.id)) throw new Error();
      const source = this.source(request.source as ProductionRef); const acquisition = this.acquisition(run.outputs[0]);
      const content = request.content as { digest: string; byteLength: number };
      if (acquisition.request.contentDigest !== content.digest || acquisition.request.byteLength !== content.byteLength ||
          acquisition.request.manifest.capturedAt !== intent.startedAt || acquisition.request.manifest.purpose !== request.purpose ||
          acquisition.request.manifest.mediaType !== mediaType(source) || localJson(acquisition.request.manifest.sourceRegistration) !== localJson(source.policy)) throw new Error();
      completed('CAPTURE', 'BYTES_AND_RECEIPT_VERIFIED', run.outputs);
      expected.push({ stage: 'EXTRACTION', state: 'NOT_RUN', code: 'SEPARATE_OPERATION_REQUIRED', outputs: [] });
    } else if (request.kind === 'NORMALIZE') {
      if (run.outputs.length !== 2 || run.outputs[0].kind !== 'ACQUISITION' || run.outputs[1].kind !== 'NORMALIZATION' ||
          run.outputs[0].id !== (request.acquisition as ProductionRef).id || run.outputs[0].digest !== (request.acquisition as ProductionRef).digest ||
          run.outputs[1].id !== generated('normalization', run.id)) throw new Error();
      const source = this.source(request.source as ProductionRef); const normalization = this.normalizations.inspect(run.outputs[1].id)!;
      if (normalization.normalizedAt !== intent.startedAt || normalization.request.manifest.purpose !== request.purpose ||
          normalization.request.acquisitionDigest !== run.outputs[0].digest || normalization.request.manifest.profile.id !== source.id ||
          normalization.request.manifest.profile.version !== source.version || normalization.request.manifest.profile.sourceId !== source.policy.sourceId ||
          normalization.request.manifest.profile.sourceRegistrationId !== source.policy.registrationId) throw new Error();
      completed('EVIDENCE_INSPECTION', 'HISTORICAL_INTEGRITY_RECOMPUTED', [run.outputs[0]]);
      const refs = [run.outputs[1]];
      if (normalization.state === 'NORMALIZED') {
        if (run.state !== 'COMPLETED') throw new Error();
        completed('EXTRACTION', 'STRUCTURED_JSON_DECODED', refs); completed('NORMALIZATION', 'UNRESOLVED_UNADMITTED_CANDIDATE', refs);
      } else {
        const code = normalization.reasons[0]; const extractionFailed = ['INVALID_SOURCE_ENCODING', 'INVALID_SOURCE_JSON', 'SOURCE_TOO_LARGE'].includes(code);
        if (run.state !== 'QUARANTINED' || run.failure?.code !== code || run.failure.artifactRetained !== true || run.failure.receiptRetained !== true) throw new Error();
        expected.push({ stage: 'EXTRACTION', state: extractionFailed ? 'QUARANTINED' : 'COMPLETED', code: extractionFailed ? code : 'STRUCTURED_JSON_DECODED', outputs: refs });
        expected.push({ stage: 'NORMALIZATION', state: extractionFailed ? 'NOT_RUN' : 'QUARANTINED', code, outputs: refs });
      }
    } else if (request.kind === 'BUILD_CANDIDATES') {
      const members = request.members as ProductionRef[]; const ref = run.outputs[run.outputs.length - 1];
      if (run.state !== 'COMPLETED' || run.outputs.length !== members.length + 1 || ref.kind !== 'CANDIDATE_BUILD' || ref.id !== generated('build', run.id)) throw new Error();
      if (localJson(run.outputs.slice(0, -1)) !== localJson(members.map((member) => reference('NORMALIZATION', member.id, member.digest)))) throw new Error();
      const corpus = this.corpus(request.corpus as ProductionRef); const build = this.builds.inspect(ref.id)!;
      if (build.builtAt !== intent.startedAt || build.knownThrough !== intent.startedAt || build.request.manifest.purpose !== request.purpose ||
          localJson(build.request.manifest.definition) !== localJson({ id: corpus.id, version: corpus.version, domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: [...corpus.evidenceClasses].sort() }) ||
          localJson(build.request.members.map((member) => member.normalization)) !== localJson(members)) throw new Error();
      completed('CANDIDATE_ASSEMBLY', 'UNADMITTED_MEMBERSHIP_ASSEMBLED', [ref]); completed('BUILD_INSPECTION', 'HISTORICAL_INTEGRITY_RECOMPUTED', [ref]);
    } else throw new Error();
    if (localJson(expected) !== localJson(run.stages)) throw new Error();
  }
  execute(input: unknown): ProductionResult {
    const command = parseProductionCommand(input); const request = prepared(command); const requestDigest = digest(request);
    const priorIntent = this.intent(command.requestId);
    if (priorIntent) {
      if (priorIntent.requestDigest !== requestDigest) throw new ProductionError('REQUEST_CONFLICT', 'This request identity already names different inputs.', 409);
      const prior = this.run(command.requestId);
      if (prior) return { status: 'EXISTING', historicalRetry: true, run: prior };
      throw new ProductionError('OPERATION_INCOMPLETE', 'An operation is still running or was interrupted. Do not blindly rerun it; inspect retained outputs and use a new request identity for a new operation.', 409,
        { outputs: this.retained(priorIntent), retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_RETAINED_OUTPUTS', 'WAIT_FOR_ACTIVE_OPERATION_OR_USE_NEW_REQUEST_ID'] });
    }
    if (command.kind === 'REGISTER_SOURCE') this.sourceBinding(command.source, this.corpus(command.source.corpus));
    if (command.kind === 'REGISTER_CORPUS' && !this.read('corpora', command.definition.id)) this.capacity('corpora', 64);
    if (command.kind === 'REGISTER_SOURCE' && !this.read('sources', command.source.id)) this.capacity('sources', 64);
    const startedAt = this.time();
    let claimed: ReturnType<LocalProductionStore['publish']>;
    try { claimed = this.reserved(() => {
      const existing = this.intent(command.requestId);
      if (existing) return { status: 'EXISTING' as const, record: existing };
      this.capacity('intents', 128);
      return this.publish('intents', command.requestId, { schema: 'payload.production-intent.v1', id: command.requestId, request, requestDigest, startedAt });
    }); }
    catch (error) {
      const winner = this.intent(command.requestId);
      if (winner) return this.execute(command);
      if (error instanceof ProductionError) throw error;
      throw new ProductionError('LOCAL_STORAGE_UNAVAILABLE', 'The operation intent could not be retained; no successful execution is confirmed.', 503);
    }
    if (claimed.status === 'EXISTING') return this.execute(command);
    const outputs: ProductionOutputRef[] = []; const stages: ProductionStage[] = [];
    let active: ProductionStageName = command.kind.startsWith('REGISTER') ? 'REGISTRATION' : command.kind === 'ACQUIRE' ? 'CAPTURE' : command.kind === 'NORMALIZE' ? 'EVIDENCE_INSPECTION' : 'CANDIDATE_ASSEMBLY';
    let failure: ProductionRun['failure'] = null; let state: ProductionRun['state'] = 'COMPLETED';
    const stage = (name: ProductionStageName, code: string, refs: ProductionOutputRef[] = []) => { stages.push({ stage: name, state: 'COMPLETED', code, outputs: refs }); };
    try {
      if (command.kind === 'REGISTER_CORPUS') {
        const ref = this.register('CORPUS', command.definition, startedAt); outputs.push(ref); stage('REGISTRATION', 'CONFIGURATION_ONLY', [ref]);
      } else if (command.kind === 'REGISTER_SOURCE') {
        this.sourceBinding(command.source, this.corpus(command.source.corpus));
        const ref = this.register('SOURCE', command.source, startedAt); outputs.push(ref); stage('REGISTRATION', 'CONFIGURATION_ONLY', [ref]);
      } else if (command.kind === 'ACQUIRE') {
        const source = this.source(command.source); this.purpose(this.corpus(source.corpus), command.purpose);
        this.permitted(source.policy, command.purpose, 'INGEST', startedAt, command.requestId);
        const acquisitionId = generated('acquisition', command.requestId);
        const captured = this.intake.capture({ schema: 'payload.local-intake-request.v1', acquisitionId,
          evidenceId: generated('evidence', command.requestId), sourceRegistration: source.policy,
          purpose: command.purpose, mediaType: mediaType(source), capturedAt: startedAt }, decodeProductionContent(command.contentBase64), startedAt);
        const ref = reference('ACQUISITION', acquisitionId, captured.acquisition.digest);
        this.acquisition(ref); outputs.push(ref); stage('CAPTURE', 'BYTES_AND_RECEIPT_VERIFIED', [ref]);
        stages.push({ stage: 'EXTRACTION', state: 'NOT_RUN', code: 'SEPARATE_OPERATION_REQUIRED', outputs: [] });
      } else if (command.kind === 'NORMALIZE') {
        const source = this.source(command.source); this.purpose(this.corpus(source.corpus), command.purpose);
        const acquisition = this.acquisition(command.acquisition); const evidenceRef = reference('ACQUISITION', command.acquisition.id, acquisition.digest);
        outputs.push(evidenceRef); stage('EVIDENCE_INSPECTION', 'HISTORICAL_INTEGRITY_RECOMPUTED', [evidenceRef]); active = 'NORMALIZATION';
        if (localJson(acquisition.request.manifest.sourceRegistration) !== localJson(source.policy) || acquisition.capture.evidence.mediaType !== mediaType(source)) throw new ProductionError('SOURCE_BINDING_MISMATCH', 'The acquisition does not bind the exact configured source and media contract.', 409);
        if (source.adapter.id !== CARRIER_ADAPTER.id) throw new ProductionError('OPERATION_UNAVAILABLE', 'IFC artifacts require the separate pinned IFC audit adapter, not Carrier normalization.', 409);
        this.permitted(source.policy, command.purpose, 'DERIVE', startedAt, command.requestId);
        const normalizationId = generated('normalization', command.requestId);
        const result = this.normalizations.normalize({ schema: 'payload.local-normalization-request.v1', normalizationId,
          acquisitionId: command.acquisition.id, purpose: command.purpose, profile: { id: source.id, version: source.version,
            sourceRegistrationId: source.policy.registrationId, sourceId: source.policy.sourceId, adapterId: CARRIER_ADAPTER.id } }, startedAt);
        const ref = reference('NORMALIZATION', normalizationId, result.run.digest); this.inspect('NORMALIZATION', { id: ref.id, digest: ref.digest }); outputs.push(ref);
        if (result.run.state === 'QUARANTINED') {
          const code = result.run.reasons[0]; const extractionFailed = ['INVALID_SOURCE_ENCODING', 'INVALID_SOURCE_JSON', 'SOURCE_TOO_LARGE'].includes(code);
          stages.push({ stage: 'EXTRACTION', state: extractionFailed ? 'QUARANTINED' : 'COMPLETED', code: extractionFailed ? code : 'STRUCTURED_JSON_DECODED', outputs: [ref] });
          stages.push({ stage: 'NORMALIZATION', state: extractionFailed ? 'NOT_RUN' : 'QUARANTINED', code, outputs: [ref] });
          state = 'QUARANTINED'; failure = { code, artifactRetained: true, receiptRetained: true, runReceiptRetained: true,
            retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_QUARANTINE', 'CAPTURE_CORRECTED_SOURCE_UNDER_NEW_REQUEST_ID'] };
        } else { stage('EXTRACTION', 'STRUCTURED_JSON_DECODED', [ref]); stage('NORMALIZATION', 'UNRESOLVED_UNADMITTED_CANDIDATE', [ref]); }
      } else {
        const corpus = this.corpus(command.corpus); this.purpose(corpus, command.purpose);
        if (corpus.domain !== 'CARAVAN' || corpus.recordType !== 'Carrier') throw new ProductionError('OPERATION_UNAVAILABLE', 'Candidate assembly currently supports only the fixed Caravan Carrier contract.', 409);
        for (const member of command.members) {
          const inspected = this.normalizations.inspect(member.id);
          if (!inspected || inspected.digest !== member.digest) throw new ProductionError('REFERENCE_MISMATCH', 'A selected normalization does not match its exact reference.', 409);
          outputs.push(reference('NORMALIZATION', member.id, member.digest));
          if (inspected.state !== 'NORMALIZED' || !inspected.candidate) throw new ProductionError('MEMBER_NOT_ELIGIBLE', 'A selected normalization is quarantined or has no candidate.', 409);
          const sourceRecord = this.read('sources', inspected.request.manifest.profile.id);
          if (!sourceRecord) throw new ProductionError('SOURCE_BINDING_MISMATCH', 'A selected candidate has no exact registered production source.', 409);
          const source = this.source({ id: sourceRecord.id as string, digest: sourceRecord.digest as string });
          if (localJson(source.corpus) !== localJson(command.corpus) || source.version !== inspected.request.manifest.profile.version) throw new ProductionError('SOURCE_BINDING_MISMATCH', 'Selected candidates must belong to this exact corpus definition and source version.', 409);
          const acquired = this.acquisition({ id: inspected.request.manifest.acquisitionId, digest: inspected.request.acquisitionDigest });
          if (localJson(acquired.request.manifest.sourceRegistration) !== localJson(source.policy)) throw new ProductionError('SOURCE_BINDING_MISMATCH', 'The candidate source policy must match the configured immutable source declaration.', 409);
          this.permitted(source.policy, command.purpose, 'DERIVE', startedAt, `${command.requestId}:${outputs.length}`);
        }
        const buildId = generated('build', command.requestId);
        const result = this.builds.build({ schema: 'payload.local-candidate-build-request.v1', buildId, purpose: command.purpose,
          knownThrough: startedAt, definition: { id: corpus.id, version: corpus.version, domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: corpus.evidenceClasses },
          normalizationIds: command.members.map((member) => member.id) }, startedAt);
        const ref = reference('CANDIDATE_BUILD', buildId, result.build.digest); outputs.push(ref); stage('CANDIDATE_ASSEMBLY', 'UNADMITTED_MEMBERSHIP_ASSEMBLED', [ref]);
        active = 'BUILD_INSPECTION'; this.inspect('CANDIDATE_BUILD', { id: ref.id, digest: ref.digest }); stage('BUILD_INSPECTION', 'HISTORICAL_INTEGRITY_RECOMPUTED', [ref]);
      }
    } catch (error) {
      const known = error instanceof ProductionError ? error.code : /^SOURCE_IDENTITY_CONFLICT:/.test(error instanceof Error ? error.message : '') ? 'SOURCE_IDENTITY_CONFLICT' : 'STAGE_FAILED';
      state = 'FAILED'; stages.push({ stage: active, state: 'FAILED', code: known, outputs: [] });
      let unconfirmed = false;
      let additionalOutputRetention: 'UNCONFIRMED' | undefined;
      if (command.kind === 'ACQUIRE' && known === 'STAGE_FAILED') {
        try {
          const acquisition = this.intake.inspect(generated('acquisition', command.requestId));
          if (acquisition) outputs.push(reference('ACQUISITION', acquisition.request.manifest.acquisitionId, acquisition.digest));
          else { const content = (request.content as { digest: string }).digest;
            if (this.intake.objects.get(content)) outputs.push(reference('CONTENT', content, content)); }
        } catch { unconfirmed = true; }
      }
      if (command.kind === 'NORMALIZE' || command.kind === 'BUILD_CANDIDATES') {
        try {
          const discovered = this.discoverRetained(this.intent(command.requestId)!);
          for (const ref of discovered) if (!outputs.some((existing) => localJson(existing) === localJson(ref))) outputs.push(ref);
        } catch {
          additionalOutputRetention = 'UNCONFIRMED';
          const ownKind = command.kind === 'NORMALIZE' ? 'NORMALIZATION' : 'CANDIDATE_BUILD';
          const ownId = generated(command.kind === 'NORMALIZE' ? 'normalization' : 'build', command.requestId);
          const verified = (ref: ProductionOutputRef) => !(ref.kind === ownKind && ref.id === ownId);
          outputs.splice(0, outputs.length, ...outputs.filter(verified));
          for (const stage of stages) stage.outputs = stage.outputs.filter(verified);
        }
      }
      const receiptRetained = outputs.some((ref) => ['ACQUISITION', 'NORMALIZATION', 'CANDIDATE_BUILD'].includes(ref.kind));
      failure = { code: known, artifactRetained: unconfirmed ? 'UNCONFIRMED' : receiptRetained || outputs.some((ref) => ref.kind === 'CONTENT'),
        receiptRetained: unconfirmed ? 'UNCONFIRMED' : receiptRetained, runReceiptRetained: true,
        ...(additionalOutputRetention ? { additionalOutputRetention } : {}),
        retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_RETAINED_OUTPUTS', 'REVIEW_EXACT_DEPENDENCIES_AND_DECLARED_POLICY', 'USE_NEW_REQUEST_ID_FOR_REMEDIATED_OPERATION'] };
    }
    const completedAt = this.time();
    if (parseISOInstant(completedAt, 'completedAt') < parseISOInstant(startedAt, 'startedAt')) throw new ProductionError('CLOCK_ORDER_INVALID', 'The backend clock moved backwards; preserve and inspect retained outputs before starting a new operation.', 503,
      { outputs, retry: { sameRequest: true, newRequestRequired: true }, remediation: ['INSPECT_RETAINED_OUTPUTS', 'VERIFY_OPERATOR_CLOCK', 'USE_NEW_REQUEST_ID'] });
    const payload = { schema: 'payload.production-run.v1' as const, id: command.requestId, mode: 'LOCAL_DEVELOPMENT' as const,
      request, requestDigest, startedAt, completedAt, state, stages, outputs, failure,
      policyAuthority: 'OPERATOR_DECLARATION' as const, canonicalAdmission: false as const, releaseActivated: false as const,
      sourceTruthClaimed: false as const, completenessClaimed: false as const,
      coverageVerified: false as const, freshnessVerified: false as const, definitionRequirementsVerified: false as const };
    try {
      this.publish('runs', command.requestId, payload);
      const run = this.run(command.requestId); if (!run) throw new Error();
      return { status: 'CREATED', historicalRetry: false, run };
    } catch (error) {
      if (error instanceof ProductionError) throw error;
      throw new ProductionError('RUN_SAVE_UNCONFIRMED', 'The stage may have retained outputs, but its final receipt is unconfirmed. Retry the identical request to inspect its historical outcome.', 503,
        { outputs, retry: { sameRequest: true, newRequestRequired: false }, remediation: ['RETRY_IDENTICAL_REQUEST', 'INSPECT_RETAINED_OUTPUTS'] });
    }
  }
  inspect(kind: ProductionObjectKind, input: ProductionRef) {
    const ref = parseProductionRef(input); let data: unknown;
    if (kind === 'CORPUS' || kind === 'SOURCE') data = kind === 'SOURCE' ? { ...this.registration(kind, ref), spec: this.source(ref) } : this.registration(kind, ref);
    else if (kind === 'CONTENT') {
      if (ref.id !== ref.digest) throw new ProductionError('REFERENCE_MISMATCH', 'Content references must name their exact byte digest.', 409);
      try { const bytes = this.intake.objects.get(ref.digest); if (!bytes) throw new Error();
        data = { contentDigest: ref.digest, byteLength: bytes.byteLength, sourceBound: false, acquisitionReceiptClaimed: false }; }
      catch { throw new ProductionError('EVIDENCE_INTEGRITY_FAILED', 'The exact retained content did not verify.', 409); }
    } else if (kind === 'ACQUISITION') {
      const value = this.acquisition(ref);
      data = { id: ref.id, digest: value.digest, evidence: { id: value.capture.evidence.evidenceId, contentDigest: value.request.contentDigest,
        byteLength: value.request.byteLength, mediaType: value.capture.evidence.mediaType },
        receipt: { id: value.capture.receipt.receiptId, digest: digest(value.capture.receipt), storedAt: value.capture.receipt.storedAt },
        sourcePolicy: { id: value.request.manifest.sourceRegistration.registrationId, digest: digest(value.request.manifest.sourceRegistration),
          policyVersion: value.request.manifest.sourceRegistration.policyVersion }, capturedAt: value.request.manifest.capturedAt, ingestDecision: value.decision };
    } else if (kind === 'RUN') {
      const value = this.run(ref.id); if (!value || value.digest !== ref.digest) throw new ProductionError('REFERENCE_MISMATCH', 'The historical run does not match the exact reference.', 409); data = value;
    } else if (kind === 'NORMALIZATION' || kind === 'CANDIDATE_BUILD') {
      try {
        const value = kind === 'NORMALIZATION' ? this.normalizations.inspect(ref.id) : this.builds.inspect(ref.id);
        if (!value || value.digest !== ref.digest) throw new Error(); data = value;
      } catch { throw new ProductionError('DEPENDENCY_INTEGRITY_FAILED', 'The exact historical output or its upstream evidence did not verify.', 409); }
    } else throw new ProductionError('INVALID_REQUEST', 'Unsupported production object kind.');
    return { schema: 'payload.production-inspection.v1' as const, mode: 'LOCAL_DEVELOPMENT' as const, kind, reference: ref,
      integrity: 'RECOMPUTED_LOCAL' as const, historical: true as const, currentPermissionGranted: false as const,
      rawBytesIncluded: false as const, canonicalAdmission: false as const, data };
  }
  catalog() {
    const registrations = (kind: 'CORPUS' | 'SOURCE') => this.names(kind === 'CORPUS' ? 'corpora' : 'sources', 64).map((name) => {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readImmutableFile(this.root, ['production-v1', kind === 'CORPUS' ? 'corpora' : 'sources', name], MAX_RECORD)!));
      const ref = { id: value.id, digest: value.digest }; const record = this.registration(kind, ref);
      if (kind === 'SOURCE') this.source(ref);
      return kind === 'CORPUS' ? { reference: ref, version: record.spec.version, domain: (record.spec as ProductionCorpusDefinition).domain, recordType: (record.spec as ProductionCorpusDefinition).recordType }
        : { reference: ref, version: record.spec.version, corpus: (record.spec as ProductionSourceConfig).corpus, provider: (record.spec as ProductionSourceConfig).provider,
          adapter: (record.spec as ProductionSourceConfig).adapter, configurationOnly: true };
    });
    const runs = this.names('intents', 128).map((name) => {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readImmutableFile(this.root, ['production-v1', 'intents', name], MAX_RECORD)!));
      const intent = this.intent(value.id)!; const run = this.run(intent.id);
      return run ? { id: run.id, kind: intent.request.kind, state: run.state, reference: { id: run.id, digest: run.digest }, startedAt: run.startedAt, outputCount: run.outputs.length }
        : { id: intent.id, kind: intent.request.kind, state: 'INCOMPLETE_OR_RUNNING', reference: null, startedAt: intent.startedAt, outputs: this.retained(intent) };
    });
    return { schema: 'payload.production-catalog.v1' as const, mode: 'LOCAL_DEVELOPMENT' as const, corpora: registrations('CORPUS'), sources: registrations('SOURCE'), runs,
      configurationEstablishesConnectivity: false, configurationGrantsPermission: false, rawBytesIncluded: false, canonicalAdmission: false,
      coverageVerified: false, freshnessVerified: false, definitionRequirementsVerified: false };
  }
}
