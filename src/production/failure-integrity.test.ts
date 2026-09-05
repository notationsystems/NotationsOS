import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest } from '../data-os/evidence-capture';
import * as localFiles from '../data-os/local-files';
import { localRecordDigest } from '../data-os/local-record';
import type { ProductionCommand, ProductionCorpusDefinition, ProductionOutputRef, ProductionRef,
  ProductionResult, ProductionRun, ProductionSourceConfig } from './contracts';
import { ProductionError } from './errors';
import { LocalProductionStore } from './store';

const content = readFileSync('examples/carrier/source.json');
const policy = JSON.parse(readFileSync('examples/carrier/acquisition.json', 'utf8')).sourceRegistration as SourceRegistration;
const purpose = 'CARAVAN_LOCAL_DEVELOPMENT';
const at = '2026-09-06T12:00:00.000Z';
let temporary: string;
let root: string;
let store: LocalProductionStore;

const definition = (): ProductionCorpusDefinition => ({
  schema: 'payload.production-corpus-definition.v1', id: 'failure-test-carrier-corpus', version: '1.0.0',
  domain: 'CARAVAN', recordType: 'Carrier', requiredSubjects: ['Carrier'], requiredFields: ['legalName'],
  coverage: { geography: 'Synthetic local scope', temporal: 'One supplied artifact' },
  freshness: 'Operator declaration; no freshness verification', evidenceClasses: ['OPERATOR_DECLARATION'], intendedUses: [purpose],
});
function command<T extends Omit<ProductionCommand, 'schema' | 'requestId'>>(requestId: string, value: T) {
  return { schema: 'payload.production-command.v1', requestId, ...value };
}
const reference = (value: ProductionRef): ProductionRef => ({ id: value.id, digest: value.digest });
function output(result: ProductionResult, kind: ProductionOutputRef['kind']): ProductionRef {
  const found = result.run.outputs.find((value) => value.kind === kind);
  expect(found, `Fixture must retain ${kind}`).toBeDefined();
  return reference(found!);
}
function setup(customPolicy = policy) {
  const corpus = output(store.execute(command('register-corpus', { kind: 'REGISTER_CORPUS', definition: definition() })), 'CORPUS');
  const config: ProductionSourceConfig = {
    schema: 'payload.production-source-config.v1', id: 'failure-test-carrier-source', version: '1.0.0', corpus,
    provider: 'Synthetic failure-integrity fixture', method: 'LOCAL_INLINE_BYTES',
    adapter: { id: 'caravan.carrier-json/v1', version: '1.0.0' }, supportedCoverage: definition().coverage,
    policy: structuredClone(customPolicy),
  };
  const source = output(store.execute(command('register-source', { kind: 'REGISTER_SOURCE', source: config })), 'SOURCE');
  return { corpus, source };
}
function acquire(source: ProductionRef, id = 'capture-original') {
  return store.execute(command(id, { kind: 'ACQUIRE', source, purpose, contentBase64: content.toString('base64') }));
}
function normalize(source: ProductionRef, acquisition: ProductionRef, id = 'normalize-original') {
  return store.execute(command(id, { kind: 'NORMALIZE', source, acquisition, purpose }));
}
function build(corpus: ProductionRef, members: ProductionRef[], id = 'build-original') {
  return store.execute(command(id, { kind: 'BUILD_CANDIDATES', corpus, members, purpose }));
}
function files(directory = root, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const key = prefix ? `${prefix}/${name}` : name;
    const path = join(directory, name);
    return lstatSync(path).isDirectory() ? Object.entries(files(path, key)) : [[key, byteDigest(readFileSync(path))]];
  }));
}
function runPath(id: string) {
  return join(root, 'production-v1', 'runs', `${byteDigest(Buffer.from(id)).slice(7)}.json`);
}
function rehash(run: ProductionRun) {
  const { digest: _digest, ...payload } = run;
  void _digest;
  run.digest = localRecordDigest(payload, 512 * 1024);
}
function prohibitExecution(repository: LocalProductionStore) {
  const unexpected = () => { throw new Error('Historical receipt access must not execute production work'); };
  return [vi.spyOn(repository.intake, 'capture').mockImplementation(unexpected),
    vi.spyOn(repository.normalizations, 'normalize').mockImplementation(unexpected),
    vi.spyOn(repository.builds, 'build').mockImplementation(unexpected)];
}
function expectRejected(result: ProductionResult, request: unknown, mutate: (run: ProductionRun) => void) {
  expect(result.run.state).toBe('FAILED');
  const record = JSON.parse(readFileSync(runPath(result.run.id), 'utf8')) as ProductionRun;
  mutate(record);
  rehash(record);
  expect(record.digest).not.toBe(result.run.digest);
  // Rehash only the owned failed receipt. Its original intent, request ID and
  // every real upstream record remain unchanged; digest mismatch is not the test.
  writeFileSync(runPath(record.id), JSON.stringify(record));
  const before = files();
  const restarted = new LocalProductionStore(root, () => '2027-01-01T00:00:00.000Z');
  const execution = prohibitExecution(restarted);
  expect(() => restarted.inspect('RUN', reference(record))).toThrow(ProductionError);
  expect(() => restarted.execute(request)).toThrow(ProductionError);
  for (const method of execution) expect(method).not.toHaveBeenCalled();
  expect(files()).toEqual(before);
}
function expectHistorical(result: ProductionResult, request: unknown) {
  expect(result.run.state).toBe('FAILED');
  const before = files();
  const restarted = new LocalProductionStore(root, () => '2027-01-01T00:00:00.000Z');
  const execution = prohibitExecution(restarted);
  expect(restarted.inspect('RUN', reference(result.run))).toMatchObject({
    historical: true, currentPermissionGranted: false, integrity: 'RECOMPUTED_LOCAL', data: result.run,
  });
  expect(restarted.execute(request)).toEqual({ status: 'EXISTING', historicalRetry: true, run: result.run });
  for (const retained of result.run.outputs) expect(restarted.inspect(retained.kind, reference(retained)).integrity).toBe('RECOMPUTED_LOCAL');
  for (const method of execution) expect(method).not.toHaveBeenCalled();
  expect(files()).toEqual(before);
}
function deniedNormalization() {
  const registered = setup({ ...policy, allowedOperations: ['INGEST'] });
  const acquisition = output(acquire(registered.source), 'ACQUISITION');
  const request = command('denied-normalization', { kind: 'NORMALIZE', source: registered.source, acquisition, purpose });
  const result = store.execute(request);
  expect(result.run.failure?.code).toBe('DERIVATION_DISALLOWED');
  return { ...registered, acquisition, request, result };
}
function publishedFailure(kind: 'NORMALIZE' | 'BUILD_CANDIDATES') {
  const registered = setup();
  const acquisition = output(acquire(registered.source), 'ACQUISITION');
  const normalization = kind === 'BUILD_CANDIDATES' ? output(normalize(registered.source, acquisition), 'NORMALIZATION') : undefined;
  const request = kind === 'NORMALIZE'
    ? command('published-then-failed', { kind, source: registered.source, acquisition, purpose })
    : command('published-then-failed', { kind, corpus: registered.corpus, members: [normalization!], purpose });
  if (kind === 'NORMALIZE') {
    const real = store.normalizations.normalize.bind(store.normalizations);
    vi.spyOn(store.normalizations, 'normalize').mockImplementationOnce((...args) => {
      real(...args); throw new Error('Synthetic failure immediately after immutable normalization publication');
    });
  } else {
    const real = store.builds.build.bind(store.builds);
    vi.spyOn(store.builds, 'build').mockImplementationOnce((...args) => {
      real(...args); throw new Error('Synthetic failure immediately after immutable candidate-build publication');
    });
  }
  const result = store.execute(request);
  expect(result.run).toMatchObject({ state: 'FAILED', failure: { code: 'STAGE_FAILED', artifactRetained: true, receiptRetained: true } });
  return { ...registered, acquisition, normalization, request, result };
}

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-production-failure-integrity-'));
  root = join(temporary, 'evidence');
  store = new LocalProductionStore(root, () => at);
});
afterEach(() => { vi.restoreAllMocks(); rmSync(temporary, { recursive: true, force: true }); });

describe('request-bound integrity of rehashed FAILED production receipts', () => {
  it('rejects an unrelated but valid acquisition substituted for the inspected source', () => {
    const fixture = deniedNormalization();
    const unrelated = output(acquire(fixture.source, 'capture-unrelated'), 'ACQUISITION');
    expect(unrelated.id).not.toBe(fixture.acquisition.id);
    expectRejected(fixture.result, fixture.request, (run) => {
      run.outputs = [{ kind: 'ACQUISITION', ...unrelated }];
      run.stages[0].outputs = run.outputs;
    });
  });

  it('rejects a valid acquisition from another request advertised after failed capture', () => {
    const registered = setup();
    const unrelated = output(acquire(registered.source, 'capture-unrelated'), 'ACQUISITION');
    const request = command('capture-failed', { kind: 'ACQUIRE', source: registered.source, purpose, contentBase64: content.toString('base64') });
    vi.spyOn(store.intake, 'capture').mockImplementationOnce(() => { throw new Error('Synthetic capture failure'); });
    const result = store.execute(request);
    expect(result.run.outputs.map((value) => value.kind)).toEqual(['CONTENT']);
    expectRejected(result, request, (run) => {
      run.outputs = [{ kind: 'ACQUISITION', ...unrelated }];
      run.failure!.receiptRetained = true;
    });
  });

  it.each(['NORMALIZE', 'BUILD_CANDIDATES'] as const)('rejects a valid %s output with another request-generated identity', (kind) => {
    const fixture = publishedFailure(kind);
    const retainedKind = kind === 'NORMALIZE' ? 'NORMALIZATION' : 'CANDIDATE_BUILD';
    const other = kind === 'NORMALIZE'
      ? output(normalize(fixture.source, fixture.acquisition, 'other-normalization'), retainedKind)
      : output(build(fixture.corpus, [fixture.normalization!], 'other-build'), retainedKind);
    expect(other.id).not.toBe(output(fixture.result, retainedKind).id);
    expectRejected(fixture.result, fixture.request, (run) => {
      run.outputs = run.outputs.map((value) => value.kind === retainedKind ? { kind: retainedKind, ...other } : value);
    });
  });

  it.each(['REPLACED_STAGE', 'FORGED_CODE', 'REMOVED_STAGE', 'REMOVED_REFERENCE'] as const)('rejects a fabricated completed evidence prefix: %s', (variant) => {
    const fixture = deniedNormalization();
    expectRejected(fixture.result, fixture.request, (run) => {
      if (variant === 'REPLACED_STAGE') run.stages[0].stage = 'EXTRACTION';
      else if (variant === 'FORGED_CODE') run.stages[0].code = 'SOURCE_AUTHORITY_VERIFIED';
      else if (variant === 'REMOVED_STAGE') run.stages.shift();
      else {
        run.stages[0].outputs = [];
        run.outputs = [];
        run.failure!.artifactRetained = false;
        run.failure!.receiptRetained = false;
      }
    });
  });

  it('rejects a completed extraction claimed before an early evidence-reference failure', () => {
    const registered = setup();
    const acquired = output(acquire(registered.source), 'ACQUISITION');
    const normalization = output(normalize(registered.source, acquired), 'NORMALIZATION');
    const request = command('wrong-exact-acquisition', { kind: 'NORMALIZE', source: registered.source,
      acquisition: { ...acquired, digest: `sha256:${'0'.repeat(64)}` }, purpose });
    const result = store.execute(request);
    expect(result.run.failure?.code).toBe('REFERENCE_MISMATCH');
    expectRejected(result, request, (run) => {
      const ref: ProductionOutputRef = { kind: 'NORMALIZATION', ...normalization };
      run.outputs = [ref];
      run.stages.unshift({ stage: 'EXTRACTION', state: 'COMPLETED', code: 'STRUCTURED_JSON_DECODED', outputs: [ref] });
      run.failure!.artifactRetained = true;
      run.failure!.receiptRetained = true;
    });
  });

  it.each(['DERIVATION_DISALLOWED', 'INGEST_DISALLOWED'] as const)('rejects an impossible denial code on early normalization evidence inspection: %s', (code) => {
    const registered = setup();
    const acquired = output(acquire(registered.source), 'ACQUISITION');
    const request = command('wrong-exact-acquisition', { kind: 'NORMALIZE', source: registered.source,
      acquisition: { ...acquired, digest: `sha256:${'0'.repeat(64)}` }, purpose });
    const result = store.execute(request);
    expect(result.run).toMatchObject({ outputs: [],
      stages: [{ stage: 'EVIDENCE_INSPECTION', state: 'FAILED', code: 'REFERENCE_MISMATCH', outputs: [] }],
      failure: { artifactRetained: false, receiptRetained: false } });
    expectRejected(result, request, (run) => {
      // Keep the request, phase and retention flags unchanged. DERIVE has not
      // been reached here, and NORMALIZE never performs an INGEST operation.
      run.stages[0].code = code;
      run.failure!.code = code;
    });
  });

  it('rejects an impossible completed assembly before assembly failure', () => {
    const fixture = publishedFailure('BUILD_CANDIDATES');
    expectRejected(fixture.result, fixture.request, (run) => {
      run.stages.unshift({ stage: 'CANDIDATE_ASSEMBLY', state: 'COMPLETED', code: 'UNADMITTED_MEMBERSHIP_ASSEMBLED',
        outputs: [run.outputs.find((value) => value.kind === 'CANDIDATE_BUILD')!] });
    });
  });

  it('rejects removal of a selected source normalization from a partially published build receipt', () => {
    const fixture = publishedFailure('BUILD_CANDIDATES');
    expectRejected(fixture.result, fixture.request, (run) => {
      run.outputs = run.outputs.filter((value) => value.kind !== 'NORMALIZATION');
    });
  });

  it('rejects substituting a nonmember for the verified prefix of a failed build', () => {
    const registered = setup();
    const acquired = output(acquire(registered.source), 'ACQUISITION');
    const member = output(normalize(registered.source, acquired), 'NORMALIZATION');
    const unrelated = output(normalize(registered.source, acquired, 'nonmember-normalization'), 'NORMALIZATION');
    const request = command('build-missing-second-member', { kind: 'BUILD_CANDIDATES', corpus: registered.corpus,
      members: [member, { id: 'zz-missing-normalization', digest: `sha256:${'0'.repeat(64)}` }], purpose });
    const result = store.execute(request);
    expect(result.run.outputs).toEqual([{ kind: 'NORMALIZATION', ...member }]);
    expectRejected(result, request, (run) => { run.outputs = [{ kind: 'NORMALIZATION', ...unrelated }]; });
  });

  it('rejects injecting a valid source registration into a failed normalization output list', () => {
    const fixture = deniedNormalization();
    expectRejected(fixture.result, fixture.request, (run) => { run.outputs.push({ kind: 'SOURCE', ...fixture.source }); });
  });
});

describe('genuine FAILED receipts remain historical, inspectable and non-executing', () => {
  it('preserves an INGEST refusal with no evidence outputs', () => {
    const registered = setup({ ...policy, allowedOperations: ['DERIVE'] });
    const request = command('ingest-refused', { kind: 'ACQUIRE', source: registered.source, purpose, contentBase64: content.toString('base64') });
    const result = store.execute(request);
    expect(result.run).toMatchObject({ failure: { code: 'INGEST_DISALLOWED', artifactRetained: false, receiptRetained: false }, outputs: [] });
    expectHistorical(result, request);
  });

  it('preserves a DERIVE refusal and its exact already-inspected acquisition', () => {
    const fixture = deniedNormalization();
    expectHistorical(fixture.result, fixture.request);
  });

  it('preserves a wrong exact acquisition reference without claiming it was inspected', () => {
    const registered = setup();
    const acquired = output(acquire(registered.source), 'ACQUISITION');
    const request = command('wrong-exact-acquisition', { kind: 'NORMALIZE', source: registered.source,
      acquisition: { ...acquired, digest: `sha256:${'0'.repeat(64)}` }, purpose });
    const result = store.execute(request);
    expect(result.run).toMatchObject({ outputs: [], stages: [{ stage: 'EVIDENCE_INSPECTION', state: 'FAILED', code: 'REFERENCE_MISMATCH' }] });
    expectHistorical(result, request);
  });

  it('preserves only the verified member prefix when a later exact build reference is absent', () => {
    const registered = setup();
    const acquired = output(acquire(registered.source), 'ACQUISITION');
    const member = output(normalize(registered.source, acquired), 'NORMALIZATION');
    const request = command('build-missing-second-member', { kind: 'BUILD_CANDIDATES', corpus: registered.corpus,
      members: [member, { id: 'zz-missing-normalization', digest: `sha256:${'0'.repeat(64)}` }], purpose });
    const result = store.execute(request);
    expect(result.run.outputs).toEqual([{ kind: 'NORMALIZATION', ...member }]);
    expect(result.run.failure?.code).toBe('REFERENCE_MISMATCH');
    expectHistorical(result, request);
  });

  it.each(['NORMALIZE', 'BUILD_CANDIDATES'] as const)('preserves an exact %s output published before cleanup failure', (kind) => {
    const fixture = publishedFailure(kind);
    expect(fixture.result.run.outputs).toHaveLength(2);
    expectHistorical(fixture.result, fixture.request);
  });

  it('preserves an explicitly unconfirmed assembly prefix when its subsequent build inspection fails', () => {
    const registered = setup();
    const acquired = output(acquire(registered.source), 'ACQUISITION');
    const member = output(normalize(registered.source, acquired), 'NORMALIZATION');
    const request = command('build-inspection-failed', { kind: 'BUILD_CANDIDATES', corpus: registered.corpus, members: [member], purpose });
    const inspect = store.inspect.bind(store);
    let damaged: string | undefined;
    const inspection = vi.spyOn(store, 'inspect').mockImplementation((kind, ref) => {
      if (kind === 'CANDIDATE_BUILD' && !damaged) {
        damaged = join(root, 'candidate-builds', `${byteDigest(Buffer.from(ref.id)).slice(7)}.json`);
        writeFileSync(damaged, '{unreadable-owned-test-build');
        throw new ProductionError('DEPENDENCY_INTEGRITY_FAILED', 'Synthetic local build inspection failure', 409);
      }
      return inspect(kind, ref);
    });
    const result = store.execute(request);
    inspection.mockRestore();
    expect(result.run).toMatchObject({ outputs: [{ kind: 'NORMALIZATION', ...member }],
      stages: [
        { stage: 'CANDIDATE_ASSEMBLY', state: 'COMPLETED', code: 'UNADMITTED_MEMBERSHIP_ASSEMBLED', outputs: [] },
        { stage: 'BUILD_INSPECTION', state: 'FAILED', code: 'DEPENDENCY_INTEGRITY_FAILED', outputs: [] },
      ], failure: { code: 'DEPENDENCY_INTEGRITY_FAILED', additionalOutputRetention: 'UNCONFIRMED' } });
    expect(damaged).toBeDefined();
    expectHistorical(result, request);
    expect(readFileSync(damaged!, 'utf8')).toBe('{unreadable-owned-test-build');
  });

  it('preserves a failed registration receipt when configuration was published before reservation cleanup failed', () => {
    const request = command('registration-cleanup-failed', { kind: 'REGISTER_CORPUS', definition: definition() });
    const publish = localFiles.publishImmutableFile;
    const publication = vi.spyOn(localFiles, 'publishImmutableFile').mockImplementation((...args) => {
      const result = publish(...args);
      if (args[1][0] === 'production-v1' && args[1][1] === 'corpora') {
        // Remove only this fixture's owned lock after publication, causing the
        // real reservation cleanup to fail before register() can return its ref.
        unlinkSync(join(root, 'production-v1', 'catalog.lock'));
      }
      return result;
    });
    const result = store.execute(request);
    publication.mockRestore();
    expect(result.run).toMatchObject({ outputs: [], stages: [{ stage: 'REGISTRATION', state: 'FAILED', code: 'STAGE_FAILED' }] });
    const catalog = store.catalog();
    expect(catalog.corpora).toHaveLength(1);
    expect(store.inspect('CORPUS', catalog.corpora[0].reference).integrity).toBe('RECOMPUTED_LOCAL');
    expectHistorical(result, request);
  });
});
