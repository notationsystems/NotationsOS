import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest, storageKeyFor } from '../data-os/evidence-capture';
import { localRecordDigest } from '../data-os/local-record';
import * as localFiles from '../data-os/local-files';
import type { LocalNormalizationRun } from '../data-os/local-normalization';
import { decodeProductionContent, parseProductionCommand, parseProductionRef, type ProductionCommand,
  type ProductionCorpusDefinition, type ProductionOutputRef, type ProductionRef, type ProductionResult, type ProductionSourceConfig } from './contracts';
import { ProductionError } from './errors';
import { LocalProductionStore } from './store';

let temporary: string;
let root: string;
let now: string;
let store: LocalProductionStore;
const content = readFileSync('examples/carrier/source.json');
const policy = JSON.parse(readFileSync('examples/carrier/acquisition.json', 'utf8')).sourceRegistration as SourceRegistration;
const purpose = 'CARAVAN_LOCAL_DEVELOPMENT';
const definition = (): ProductionCorpusDefinition => ({ schema: 'payload.production-corpus-definition.v1', id: 'carrier-corpus-v1', version: '1.0.0',
  domain: 'CARAVAN', recordType: 'Carrier', requiredSubjects: ['Carrier'], requiredFields: ['legalName'],
  coverage: { geography: 'Synthetic local scope', temporal: 'One supplied artifact' }, freshness: 'Operator selected; no freshness measured',
  evidenceClasses: ['OPERATOR_DECLARATION'], intendedUses: [purpose] });
function command<T extends Omit<ProductionCommand, 'schema' | 'requestId'>>(requestId: string, value: T) {
  return { schema: 'payload.production-command.v1', requestId, ...value };
}
const ref = (value: ProductionOutputRef): ProductionRef => ({ id: value.id, digest: value.digest });
const output = (result: ProductionResult, kind: ProductionOutputRef['kind']) => ref(result.run.outputs.find((value) => value.kind === kind)!);
function source(corpus: ProductionRef, customPolicy = policy): ProductionSourceConfig {
  return { schema: 'payload.production-source-config.v1', id: 'carrier-source-v1', version: '1.0.0', corpus,
    provider: 'Notation Systems synthetic demonstration', method: 'LOCAL_INLINE_BYTES', adapter: { id: 'caravan.carrier-json/v1', version: '1.0.0' },
    supportedCoverage: definition().coverage, policy: structuredClone(customPolicy) };
}
function setup(customPolicy = policy) {
  const corpus = output(store.execute(command('register-corpus', { kind: 'REGISTER_CORPUS', definition: definition() })), 'CORPUS');
  const config = source(corpus, customPolicy);
  const sourceRef = output(store.execute(command('register-source', { kind: 'REGISTER_SOURCE', source: config })), 'SOURCE');
  return { corpus, source: sourceRef, config };
}
function capture(source: ProductionRef, requestId = 'capture-1', bytes = content) {
  return store.execute(command(requestId, { kind: 'ACQUIRE', source, purpose, contentBase64: bytes.toString('base64') }));
}
function normalize(source: ProductionRef, acquisition: ProductionRef, requestId = 'normalize-1') {
  return store.execute(command(requestId, { kind: 'NORMALIZE', source, acquisition, purpose }));
}
function files(directory: string, path = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const key = path ? `${path}/${name}` : name; const target = join(directory, name);
    return lstatSync(target).isDirectory() ? Object.entries(files(target, key)) : [[key, byteDigest(readFileSync(target))]];
  }));
}
function runPath(id: string) { return join(root, 'production-v1', 'runs', `${byteDigest(Buffer.from(id)).slice(7)}.json`); }
function rehash(value: Record<string, unknown>) {
  const { digest: _digest, ...payload } = value; void _digest; value.digest = localRecordDigest(payload, 512 * 1024);
}
function worker(value: unknown): Promise<{ ok: boolean; value?: ProductionResult; error?: { code: string } }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['.stamp/production-worker.mjs'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PAYLOAD_PRODUCTION_LOCAL: '1', PAYLOAD_PRODUCTION_DIR: root } });
    let output = ''; child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', reject); child.on('close', () => { try { resolve(JSON.parse(output)); } catch (error) { reject(error); } });
    child.stdin.end(JSON.stringify({ schema: 'payload.production-worker.v1', action: 'EXECUTE', command: value }));
  });
}
beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-production-test-')); root = join(temporary, 'evidence'); now = '2026-09-06T12:00:00.000Z'; store = new LocalProductionStore(root, () => now); });
afterEach(() => { vi.restoreAllMocks(); rmSync(temporary, { recursive: true, force: true }); });

describe('local production service with real evidence, normalization and candidate stores', () => {
  it('keeps an empty catalog read-only', () => {
    expect(store.catalog()).toMatchObject({ corpora: [], sources: [], runs: [], configurationGrantsPermission: false,
      coverageVerified: false, freshnessVerified: false, definitionRequirementsVerified: false });
    expect(existsSync(root)).toBe(false);
  });

  it('registers, captures, inspects, normalizes and assembles exact explicit candidates without released-state claims', () => {
    const registered = setup(); const captured = capture(registered.source);
    expect(captured.run).toMatchObject({ state: 'COMPLETED', canonicalAdmission: false, releaseActivated: false, sourceTruthClaimed: false,
      coverageVerified: false, freshnessVerified: false, definitionRequirementsVerified: false,
      stages: [{ stage: 'CAPTURE', state: 'COMPLETED' }, { stage: 'EXTRACTION', state: 'NOT_RUN' }] });
    const acquisition = output(captured, 'ACQUISITION');
    const inspected = store.inspect('ACQUISITION', acquisition);
    expect(inspected).toMatchObject({ historical: true, currentPermissionGranted: false, rawBytesIncluded: false,
      data: { capturedAt: now, evidence: { contentDigest: byteDigest(content), byteLength: content.length }, ingestDecision: { state: 'ALLOWED' } } });
    expect(JSON.stringify(inspected)).not.toContain('storageKey');
    expect(Buffer.from(store.intake.objects.get(byteDigest(content))!)).toEqual(content);
    const normalized = normalize(registered.source, acquisition); const normalization = output(normalized, 'NORMALIZATION');
    expect(normalized.run.stages.map((stage) => `${stage.stage}:${stage.state}`)).toEqual(['EVIDENCE_INSPECTION:COMPLETED', 'EXTRACTION:COMPLETED', 'NORMALIZATION:COMPLETED']);
    const data = store.inspect('NORMALIZATION', normalization).data as LocalNormalizationRun;
    expect(data.candidate).toMatchObject({ state: 'UNADMITTED', identity: { state: 'UNRESOLVED', canonicalId: null },
      provenance: { acquisition, adapter: { id: 'caravan.carrier-json/v1', version: '1.0.0' } } });
    const assembled = store.execute(command('build-1', { kind: 'BUILD_CANDIDATES', corpus: registered.corpus, members: [normalization], purpose }));
    const build = output(assembled, 'CANDIDATE_BUILD');
    expect(store.inspect('CANDIDATE_BUILD', build)).toMatchObject({ data: { state: 'UNADMITTED', releaseActivated: false, recordCount: 1, knownThrough: now } });
    expect(new LocalProductionStore(root).inspect('RUN', { id: assembled.run.id, digest: assembled.run.digest }).data).toEqual(assembled.run);
    expect(store.catalog().runs).toHaveLength(5);
    expect(files(root)).not.toHaveProperty('releases');
  });

  it('returns identical historical retries after policy expiry and rejects changed request identity without writes', () => {
    const registered = setup({ ...policy, effectiveUntil: '2026-09-07T00:00:00Z' });
    const first = capture(registered.source); const before = files(root);
    now = '2026-09-08T12:00:00.000Z';
    const retry = capture(registered.source);
    expect(retry).toEqual({ status: 'EXISTING', historicalRetry: true, run: first.run });
    expect(files(root)).toEqual(before);
    expect(() => capture(registered.source, 'capture-1', Buffer.from('different'))).toThrow(expect.objectContaining({ code: 'REQUEST_CONFLICT' }));
    expect(files(root)).toEqual(before);
    const fresh = capture(registered.source, 'capture-after-expiry');
    expect(fresh.run).toMatchObject({ state: 'FAILED', outputs: [], failure: { code: 'INGEST_DISALLOWED', artifactRetained: false, receiptRetained: false, runReceiptRetained: true } });
    expect(store.inspect('ACQUISITION', output(first, 'ACQUISITION')).historical).toBe(true);
  });

  it('does not infer DERIVE permission from a successful INGEST and preserves evidence on refusal', () => {
    const registered = setup({ ...policy, allowedOperations: ['INGEST'] });
    const acquired = output(capture(registered.source), 'ACQUISITION');
    const result = normalize(registered.source, acquired);
    expect(result.run).toMatchObject({ state: 'FAILED', failure: { code: 'DERIVATION_DISALLOWED', artifactRetained: true, receiptRetained: true },
      stages: [{ stage: 'EVIDENCE_INSPECTION', state: 'COMPLETED' }, { stage: 'NORMALIZATION', state: 'FAILED' }] });
    expect(result.run.outputs).toEqual([{ kind: 'ACQUISITION', ...acquired }]);
    const before = files(root);
    expect(normalize(registered.source, acquired).run).toEqual(result.run);
    expect(files(root)).toEqual(before);
  });

  it('checks fresh DERIVE permission again at normalization and build time while preserving historical inspections', () => {
    const registered = setup({ ...policy, effectiveUntil: '2026-09-07T00:00:00Z' });
    const acquired = output(capture(registered.source), 'ACQUISITION');
    const result = normalize(registered.source, acquired); const normalized = output(result, 'NORMALIZATION');
    now = '2026-09-08T00:00:00.000Z';
    expect(normalize(registered.source, acquired).run).toEqual(result.run);
    expect(store.inspect('NORMALIZATION', normalized).historical).toBe(true);
    expect(normalize(registered.source, acquired, 'new-normalization').run.failure?.code).toBe('DERIVATION_DISALLOWED');
    const built = store.execute(command('expired-build', { kind: 'BUILD_CANDIDATES', corpus: registered.corpus, members: [normalized], purpose }));
    expect(built.run).toMatchObject({ state: 'FAILED', failure: { code: 'DERIVATION_DISALLOWED', artifactRetained: true, receiptRetained: true } });
  });

  it.each([
    ['{"private-source-secret":', 'INVALID_SOURCE_JSON', 'QUARANTINED', 'NOT_RUN'],
    ['{"schema":"unrecognized"}', 'SCHEMA_MISMATCH', 'COMPLETED', 'QUARANTINED'],
  ])('preserves malformed source and exact quarantine metadata %#', (text, code, extraction, normalization) => {
    const registered = setup(); const acquired = output(capture(registered.source, 'malformed', Buffer.from(text)), 'ACQUISITION');
    const result = normalize(registered.source, acquired);
    expect(result.run).toMatchObject({ state: 'QUARANTINED', failure: { code, artifactRetained: true, receiptRetained: true },
      stages: [{ stage: 'EVIDENCE_INSPECTION', state: 'COMPLETED' }, { stage: 'EXTRACTION', state: extraction }, { stage: 'NORMALIZATION', state: normalization }] });
    expect(JSON.stringify(result)).not.toContain('private-source-secret');
    const built = store.execute(command('bad-build', { kind: 'BUILD_CANDIDATES', corpus: registered.corpus, members: [output(result, 'NORMALIZATION')], purpose }));
    expect(built.run).toMatchObject({ state: 'FAILED', failure: { code: 'MEMBER_NOT_ELIGIBLE', artifactRetained: true } });
    expect(Buffer.from(store.intake.objects.get(byteDigest(Buffer.from(text)))!).toString()).toBe(text);
  });

  it('rejects mismatched source coverage, class and adapter before retaining an operation intent', () => {
    const corpus = output(store.execute(command('register-corpus', { kind: 'REGISTER_CORPUS', definition: definition() })), 'CORPUS');
    const before = files(root);
    for (const config of [
      { ...source(corpus), supportedCoverage: { ...definition().coverage, geography: 'Elsewhere' } },
      { ...source(corpus), policy: { ...policy, sourceClass: 'OTHER' } },
      { ...source(corpus), adapter: { id: 'payload.ifc-artifact/v1', version: '1.0.0' } },
    ]) expect(() => store.execute(command('incompatible-registration', { kind: 'REGISTER_SOURCE', source: config }))).toThrow(expect.objectContaining({ code: 'SOURCE_BINDING_MISMATCH' }));
    expect(files(root)).toEqual(before);
  });

  it('refuses conflicting immutable registration IDs but allows a new request to name identical configuration', () => {
    const registered = setup();
    const retry = store.execute(command('register-again', { kind: 'REGISTER_SOURCE', source: registered.config }));
    expect(output(retry, 'SOURCE')).toEqual(registered.source);
    const conflicting = store.execute(command('registration-conflict', { kind: 'REGISTER_SOURCE', source: { ...registered.config, version: '2.0.0' } }));
    expect(conflicting.run.failure?.code).toBe('REGISTRATION_CONFLICT');
    expect(store.inspect('SOURCE', registered.source)).toMatchObject({ data: { spec: { version: '1.0.0' } } });
  });

  it('supports bounded IFC artifact capture but explicitly refuses Carrier normalization for it', () => {
    const ifcDefinition: ProductionCorpusDefinition = { ...definition(), id: 'building-evidence-v1', domain: 'LANDSHARK', recordType: 'IFCArtifact' };
    const corpus = output(store.execute(command('register-ifc', { kind: 'REGISTER_CORPUS', definition: ifcDefinition })), 'CORPUS');
    const config: ProductionSourceConfig = { ...source(corpus), adapter: { id: 'payload.ifc-artifact/v1', version: '1.0.0' } };
    const sourceRef = output(store.execute(command('register-ifc-source', { kind: 'REGISTER_SOURCE', source: config })), 'SOURCE');
    const bytes = Buffer.from('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;');
    const acquired = output(capture(sourceRef, 'ifc-artifact', bytes), 'ACQUISITION');
    expect(store.inspect('ACQUISITION', acquired)).toMatchObject({ data: { evidence: { mediaType: 'application/x-step', contentDigest: byteDigest(bytes) } } });
    expect(normalize(sourceRef, acquired).run.failure?.code).toBe('OPERATION_UNAVAILABLE');
    expect(Buffer.from(store.intake.objects.get(byteDigest(bytes))!)).toEqual(bytes);
  });

  it('retains inspectable orphan content if capture fails after storing bytes but before retaining its acquisition receipt', () => {
    const registered = setup();
    vi.spyOn(store.intake, 'capture').mockImplementationOnce((_manifest, bytes) => { store.intake.objects.put(bytes); throw new Error('C:\\private\\secret receipt path'); });
    const result = capture(registered.source);
    expect(result.run).toMatchObject({ state: 'FAILED', failure: { code: 'STAGE_FAILED', artifactRetained: true, receiptRetained: false, runReceiptRetained: true } });
    const retained = output(result, 'CONTENT');
    expect(store.inspect('CONTENT', retained)).toMatchObject({ data: { contentDigest: byteDigest(content), byteLength: content.length, sourceBound: false, acquisitionReceiptClaimed: false } });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|contentBase64/);
    expect(capture(registered.source).run).toEqual(result.run);
  });

  it.each(['NORMALIZE', 'BUILD_CANDIDATES'] as const)('discovers a verified %s output published immediately before its operation throws, without rerunning it', (kind) => {
    const registered = setup(); const acquired = output(capture(registered.source), 'ACQUISITION');
    const normalized = kind === 'BUILD_CANDIDATES' ? output(normalize(registered.source, acquired), 'NORMALIZATION') : null;
    const request = kind === 'NORMALIZE' ? command('published-then-failed', { kind, source: registered.source, acquisition: acquired, purpose })
      : command('published-then-failed', { kind, corpus: registered.corpus, members: [normalized!], purpose });
    let exact: ProductionRef;
    const perform = kind === 'NORMALIZE' ? (() => {
      const real = store.normalizations.normalize.bind(store.normalizations);
      return vi.spyOn(store.normalizations, 'normalize').mockImplementationOnce((...args) => {
        const result = real(...args); exact = { id: result.run.request.manifest.normalizationId, digest: result.run.digest };
        throw new Error('private post-publication cleanup diagnostic');
      });
    })() : (() => {
      const real = store.builds.build.bind(store.builds);
      return vi.spyOn(store.builds, 'build').mockImplementationOnce((...args) => {
        const result = real(...args); exact = { id: result.build.buildId, digest: result.build.digest };
        throw new Error('private post-publication cleanup diagnostic');
      });
    })();
    const result = store.execute(request); const retainedKind = kind === 'NORMALIZE' ? 'NORMALIZATION' : 'CANDIDATE_BUILD';
    expect(result.run).toMatchObject({ state: 'FAILED', failure: { code: 'STAGE_FAILED', artifactRetained: true, receiptRetained: true } });
    expect(result.run.stages[result.run.stages.length - 1].state).toBe('FAILED');
    expect(result.run.outputs).toContainEqual({ kind: retainedKind, ...exact! });
    expect(store.inspect(retainedKind, exact!).integrity).toBe('RECOMPUTED_LOCAL');
    expect(JSON.stringify(result)).not.toContain('private');
    const before = files(root);
    expect(store.execute(request)).toEqual({ status: 'EXISTING', historicalRetry: true, run: result.run });
    expect(perform).toHaveBeenCalledTimes(1); expect(files(root)).toEqual(before);
  });

  it.each(['NORMALIZE', 'BUILD_CANDIDATES'] as const)('marks an unreadable newly published %s output UNCONFIRMED while preserving earlier verified refs', (kind) => {
    const registered = setup(); const acquired = output(capture(registered.source), 'ACQUISITION');
    const normalized = kind === 'BUILD_CANDIDATES' ? output(normalize(registered.source, acquired), 'NORMALIZATION') : null;
    const request = kind === 'NORMALIZE' ? command('unreadable-publication', { kind, source: registered.source, acquisition: acquired, purpose })
      : command('unreadable-publication', { kind, corpus: registered.corpus, members: [normalized!], purpose });
    let damagedPath: string;
    const damage = (folder: string, id: string) => {
      damagedPath = join(root, folder, `${byteDigest(Buffer.from(id)).slice(7)}.json`);
      writeFileSync(damagedPath, '{unreadable');
      throw new Error('private post-publication readback failure');
    };
    const perform = kind === 'NORMALIZE' ? (() => {
      const real = store.normalizations.normalize.bind(store.normalizations);
      return vi.spyOn(store.normalizations, 'normalize').mockImplementationOnce((...args) => damage('normalizations', real(...args).run.request.manifest.normalizationId));
    })() : (() => {
      const real = store.builds.build.bind(store.builds);
      return vi.spyOn(store.builds, 'build').mockImplementationOnce((...args) => damage('candidate-builds', real(...args).build.buildId));
    })();
    const result = store.execute(request);
    expect(result.run).toMatchObject({ state: 'FAILED', failure: { code: 'STAGE_FAILED', artifactRetained: true,
      receiptRetained: true, additionalOutputRetention: 'UNCONFIRMED' } });
    expect(result.run.outputs).toEqual([{ kind: kind === 'NORMALIZE' ? 'ACQUISITION' : 'NORMALIZATION', ...(normalized ?? acquired) }]);
    const before = files(root);
    expect(store.execute(request).run).toEqual(result.run);
    expect(perform).toHaveBeenCalledTimes(1); expect(files(root)).toEqual(before);
    expect(readFileSync(damagedPath!, 'utf8')).toBe('{unreadable');
  });

  it('returns retained references for an interrupted intent without backdating or duplicating its operation', () => {
    const registered = setup(); const captured = capture(registered.source); const acquisition = output(captured, 'ACQUISITION');
    unlinkSync(runPath(captured.run.id)); // Simulate lost final receipt in this owned temporary fixture only.
    now = '2026-10-01T00:00:00.000Z'; const before = files(root);
    expect(() => capture(registered.source)).toThrow(expect.objectContaining({ code: 'OPERATION_INCOMPLETE',
      details: expect.objectContaining({ outputs: [{ kind: 'ACQUISITION', ...acquisition }], retry: { sameRequest: true, newRequestRequired: true } }) }));
    expect(files(root)).toEqual(before);
    expect(store.catalog().runs).toContainEqual(expect.objectContaining({ id: captured.run.id, state: 'INCOMPLETE_OR_RUNNING', outputs: [{ kind: 'ACQUISITION', ...acquisition }] }));
  });

  it('does not execute a second operation when an identical concurrent intent already owns the publication', () => {
    const registered = setup(); const originalPublish = localFiles.publishImmutableFile;
    const executeCapture = vi.spyOn(store.intake, 'capture');
    vi.spyOn(localFiles, 'publishImmutableFile').mockImplementationOnce((...args) => {
      expect(args[1][1]).toBe('intents');
      originalPublish(...args); // The other owner published the identical intent in the same millisecond.
      return 'EXISTING';
    });
    expect(() => capture(registered.source)).toThrow(expect.objectContaining({ code: 'OPERATION_INCOMPLETE' }));
    expect(executeCapture).not.toHaveBeenCalled();
    expect(existsSync(join(root, 'objects'))).toBe(false);
  });

  it('does not remove another catalog reservation and still permits historical reads and exact completed retries', () => {
    const registered = setup(); const captured = capture(registered.source);
    const path = join(root, 'production-v1', 'catalog.lock'); const lock = openSync(path, 'wx');
    try {
      const before = files(root);
      expect(() => capture(registered.source, 'blocked-by-reservation')).toThrow(expect.objectContaining({ code: 'PRODUCTION_BUSY', details: expect.objectContaining({ retry: { sameRequest: true, newRequestRequired: false } }) }));
      expect(capture(registered.source).run).toEqual(captured.run);
      expect(store.inspect('ACQUISITION', output(captured, 'ACQUISITION')).historical).toBe(true);
      expect(files(root)).toEqual(before); expect(existsSync(path)).toBe(true);
    } finally { closeSync(lock); unlinkSync(path); }
  });

  it('keeps the 128-intent ceiling under simultaneous real worker processes', async () => {
    for (let index = 0; index < 127; index++) store.execute(command(`registration-${index}`, { kind: 'REGISTER_CORPUS', definition: definition() }));
    const results = await Promise.all(['last-a', 'last-b'].map((id) => worker(command(id, { kind: 'REGISTER_CORPUS', definition: definition() }))));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok)!;
    expect(['CATALOG_CAPACITY', 'PRODUCTION_BUSY']).toContain(refused.error?.code);
    expect(readdirSync(join(root, 'production-v1', 'intents'))).toHaveLength(128);
    expect(readdirSync(join(root, 'production-v1', 'corpora'))).toHaveLength(1);
    expect(existsSync(join(root, 'production-v1', 'catalog.lock'))).toBe(false);
  }, 20_000);

  it('keeps the 64-source ceiling under simultaneous real worker registrations', async () => {
    const corpus = output(store.execute(command('corpus', { kind: 'REGISTER_CORPUS', definition: definition() })), 'CORPUS');
    for (let index = 0; index < 63; index++) store.execute(command(`source-request-${index}`, { kind: 'REGISTER_SOURCE', source: { ...source(corpus), id: `source-${index}` } }));
    const results = await Promise.all(['source-final-a', 'source-final-b'].map((id) => worker(command(id, { kind: 'REGISTER_SOURCE', source: { ...source(corpus), id } }))));
    expect(results.filter((result) => result.ok && result.value?.run.state === 'COMPLETED')).toHaveLength(1);
    const refused = results.find((result) => !result.ok || result.value?.run.state === 'FAILED')!;
    expect(['CATALOG_CAPACITY', 'PRODUCTION_BUSY']).toContain(refused.error?.code ?? refused.value?.run.failure?.code);
    expect(readdirSync(join(root, 'production-v1', 'sources'))).toHaveLength(64);
    expect(existsSync(join(root, 'production-v1', 'catalog.lock'))).toBe(false);
  }, 20_000);

  it.each(['STAGE', 'FALSE_COMPLETION', 'CLAIM'])('rejects rehashed outcome tampering: %s', (variant) => {
    const registered = setup(); const acquired = output(capture(registered.source, 'malformed', Buffer.from('{bad')), 'ACQUISITION');
    const result = normalize(registered.source, acquired); const path = runPath(result.run.id);
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (variant === 'STAGE') record.stages[1].code = 'FABRICATED_SUCCESS';
    if (variant === 'FALSE_COMPLETION') { record.state = 'COMPLETED'; record.failure = null; record.stages.forEach((stage: { state: string }) => { stage.state = 'COMPLETED'; }); }
    if (variant === 'CLAIM') record.definitionRequirementsVerified = true;
    rehash(record); writeFileSync(path, JSON.stringify(record));
    const before = files(root);
    expect(() => store.inspect('RUN', { id: result.run.id, digest: record.digest })).toThrow(ProductionError);
    expect(files(root)).toEqual(before);
  });

  it('blocks corrupt evidence on historical read and a fresh operation without exposing diagnostics', () => {
    const registered = setup(); const acquired = output(capture(registered.source), 'ACQUISITION');
    const objectPath = join(root, 'objects', ...storageKeyFor(byteDigest(content)).split('/'));
    writeFileSync(objectPath, 'corrupt');
    expect(() => store.inspect('ACQUISITION', acquired)).toThrow(expect.objectContaining({ code: 'EVIDENCE_INTEGRITY_FAILED' }));
    const result = normalize(registered.source, acquired);
    expect(result.run).toMatchObject({ state: 'FAILED', failure: { code: 'EVIDENCE_INTEGRITY_FAILED' } });
    expect(readFileSync(objectPath, 'utf8')).toBe('corrupt');
  });

  it('hashes maximum-length request identities into bounded inspectable artifact IDs', () => {
    const registered = setup(); const result = capture(registered.source, 'r'.repeat(120));
    const acquired = output(result, 'ACQUISITION'); expect(acquired.id.length).toBeLessThanOrEqual(120);
    expect(parseProductionRef(acquired)).toEqual(acquired);
    expect(store.inspect('ACQUISITION', acquired).integrity).toBe('RECOMPUTED_LOCAL');
  });

  it('rejects an unexpected catalog symlink without following or changing its destination', () => {
    const outside = join(temporary, 'outside'); const other = new LocalProductionStore(outside, () => now);
    other.execute(command('registration', { kind: 'REGISTER_CORPUS', definition: definition() }));
    const before = files(outside);
    symlinkSync(outside, root, 'junction');
    expect(() => store.catalog()).toThrow(expect.objectContaining({ code: 'STORED_RECORD_INVALID' }));
    expect(files(outside)).toEqual(before);
    unlinkSync(root);
  });
});

describe('bounded frontend production commands', () => {
  it('enforces canonical base64 and exactly 1 MiB before storage', () => {
    const bytes = Buffer.alloc(1024 * 1024, 97);
    expect(decodeProductionContent(bytes.toString('base64')).equals(bytes)).toBe(true);
    for (const value of ['', 'a', 'YQ', 'YR==', 'YQ==\n', 'a===', Buffer.alloc(1024 * 1024 + 1).toString('base64')]) {
      expect(() => decodeProductionContent(value)).toThrow(ProductionError);
    }
    expect(existsSync(root)).toBe(false);
  });
  it('refuses paths, caller clocks, normalized replacement state and extra authority fields without creating a directory', () => {
    const valid = command('test', { kind: 'REGISTER_CORPUS', definition: definition() });
    for (const value of [null, { ...valid, root: '/private' }, { ...valid, startedAt: now }, { ...valid, state: 'ADMITTED' },
      { ...valid, requestId: '../unsafe' }, { ...valid, kind: 'RUN_SHELL' }, { ...valid, definition: { ...definition(), canonicalAdmission: true } }]) {
      expect(() => store.execute(value)).toThrow(ProductionError);
      expect(existsSync(root)).toBe(false);
    }
  });
  it('requires 1–64 unique exact build members and rejects shorthand digests', () => {
    const exact = { id: 'member', digest: `sha256:${'a'.repeat(64)}` };
    const valid = command('build', { kind: 'BUILD_CANDIDATES', corpus: exact, purpose, members: [exact] });
    expect(parseProductionCommand(valid)).toEqual(valid);
    for (const members of [[], [exact, exact], Array.from({ length: 65 }, (_, index) => ({ ...exact, id: `member-${index}` })), [{ ...exact, digest: 'short' }]]) {
      expect(() => parseProductionCommand({ ...valid, members })).toThrow(ProductionError);
    }
    expect(existsSync(root)).toBe(false);
  });
});
