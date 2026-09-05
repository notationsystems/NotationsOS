import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceRegistration } from './contracts';
import { byteDigest } from './evidence-capture';
import { LocalEvidenceIntake, type LocalIntakeManifest } from './local-intake';
import * as files from './local-files';
import { localRecordDigest } from './local-record';
import { LocalNormalizationStore, type NormalizationRequest } from './local-normalization';
import { LocalCandidateBuildStore, type CandidateBuildRequest } from './local-candidate-build';

const CAPTURED = '2026-09-05T10:00:00.000Z';
const STORED = '2026-09-05T12:00:00.000Z';
const NORMALIZED = '2026-09-05T13:00:00.000Z';
const CUTOFF = '2026-09-05T14:00:00.000Z';
const BUILT = '2026-09-05T15:00:00.000Z';
const EXPIRY = '2026-09-07T00:00:00.000Z';
const SOURCE_CLASS = 'SYNTHETIC_DEMONSTRATION';
let temporary: string;
let root: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-candidate-build-test-')); root = join(temporary, 'evidence'); });
afterEach(() => { vi.restoreAllMocks(); rmSync(temporary, { recursive: true, force: true }); });

function member(suffix = 'one', options: {
  sourceId?: string; sourceRecordId?: string; normalizedAt?: string; bytes?: Uint8Array;
  registration?: Partial<SourceRegistration>; legalName?: string;
} = {}) {
  const registration: SourceRegistration = {
    registrationId: `policy-${suffix}`, sourceId: options.sourceId ?? `notation://source/local/${suffix}`,
    displayName: 'Synthetic carrier source', sourceClass: SOURCE_CLASS, licenseId: 'operator-declaration', policyVersion: '1.0.0',
    effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: EXPIRY,
    permittedPurposes: ['NORMALIZATION_TEST', 'BUILD_TEST', 'ALTERNATE_BUILD'], allowedOperations: ['INGEST', 'DERIVE'],
    allowedAudiences: ['INTERNAL'], retention: { mode: 'UNTIL_SOURCE_EXPIRY' }, ...options.registration,
  };
  const declaration: LocalIntakeManifest = {
    schema: 'payload.local-intake-request.v1', acquisitionId: `acquisition-${suffix}`, evidenceId: `evidence-${suffix}`,
    purpose: 'NORMALIZATION_TEST', mediaType: 'application/json', capturedAt: CAPTURED, sourceRegistration: registration,
  };
  const bytes = options.bytes ?? Buffer.from(JSON.stringify({
    schema: 'caravan.carrier-source.v1', sourceRecordId: options.sourceRecordId ?? `carrier:${suffix}`,
    legalName: options.legalName ?? '  Identical Example Carrier  ', registrationNumber: '000007', operatingSite: null,
    validTime: { state: 'UNOBSERVED', from: null, to: null },
  }));
  const acquisition = new LocalEvidenceIntake(root).capture(declaration, bytes, STORED).acquisition;
  const normalization: NormalizationRequest = {
    schema: 'payload.local-normalization-request.v1', normalizationId: `normalization-${suffix}`,
    acquisitionId: declaration.acquisitionId, purpose: 'NORMALIZATION_TEST',
    profile: { id: `profile-${suffix}`, version: '1.0.0', sourceRegistrationId: registration.registrationId,
      sourceId: registration.sourceId, adapterId: 'caravan.carrier-json/v1' },
  };
  const run = new LocalNormalizationStore(root).normalize(normalization, options.normalizedAt ?? NORMALIZED).run;
  return { declaration, bytes, acquisition, normalization, run };
}

function request(ids = ['normalization-one']): CandidateBuildRequest {
  return {
    schema: 'payload.local-candidate-build-request.v1', buildId: 'carrier-candidate-build-1', purpose: 'BUILD_TEST', knownThrough: CUTOFF,
    definition: { id: 'local-caravan-carriers', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: [SOURCE_CLASS] },
    normalizationIds: ids,
  };
}

function pathFor(kind: string, id: string) {
  return join(root, kind, `${byteDigest(Buffer.from(id)).slice(7)}.json`);
}

function buildPath() { return pathFor('candidate-builds', request().buildId); }

describe('local candidate corpus snapshots', () => {
  it('persists exact candidate membership and provenance without canonical admission or identity resolution', () => {
    const first = member('one');
    const second = member('two', { registration: { sourceClass: 'AUXILIARY_DEMONSTRATION' } });
    const manifest = request(['normalization-two', 'normalization-one']);
    manifest.definition.sourceClasses = [SOURCE_CLASS, 'AUXILIARY_DEMONSTRATION'];
    const result = new LocalCandidateBuildStore(root).build(manifest, BUILT);
    expect(result.status).toBe('CREATED');
    expect(result.build).toMatchObject({
      schema: 'payload.local-candidate-build.v1', buildId: manifest.buildId, state: 'UNADMITTED', mode: 'LOCAL_DEVELOPMENT',
      policyAuthority: 'OPERATOR_DECLARATION', canonicalAdmission: false, canonicalStateMutated: false, identityResolved: false,
      releaseActivated: false, sourceTruthClaimed: false, independentlyVerified: false, completenessClaimed: false,
      recordCount: 2, knownThrough: CUTOFF, builtAt: BUILT,
    });
    expect(result.build.request.manifest.normalizationIds).toEqual(['normalization-one', 'normalization-two']);
    expect(result.build.request.manifest.definition.sourceClasses).toEqual(['AUXILIARY_DEMONSTRATION', SOURCE_CLASS]);
    expect(result.build.request.members).toEqual([first, second].map(({ run }) => ({
      normalization: { id: run.request.manifest.normalizationId, digest: run.digest },
      candidate: { id: run.candidate!.candidateId, digest: run.candidate!.digest },
    })));
    for (const [index, fixture] of [first, second].entries()) {
      const entry = result.build.members[index];
      expect(entry).toMatchObject({
        ...result.build.request.members[index], identity: fixture.run.candidate!.identity,
        sourceClass: fixture.declaration.sourceRegistration.sourceClass, knownAt: NORMALIZED,
        validTime: { state: 'UNOBSERVED', from: null, to: null },
        sourcePolicy: { id: fixture.declaration.sourceRegistration.registrationId, digest: localRecordDigest(fixture.declaration.sourceRegistration) },
        deriveDecision: { state: 'ALLOWED', evaluatedAt: BUILT, request: { operation: 'DERIVE', audience: 'INTERNAL', purpose: 'BUILD_TEST', requestedAt: BUILT } },
      });
      expect(entry.identity.canonicalId).toBeNull();
      expect(entry.identity.state).toBe('UNRESOLVED');
      expect(entry.deriveDecision.requestId).not.toBe(fixture.run.deriveDecision.requestId);
    }
    expect(result.build.definitionDigest).toBe(localRecordDigest(result.build.request.manifest.definition));
    expect(result.build.recordsRoot).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.build.request.contractDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.build.requestDigest).toBe(localRecordDigest(result.build.request, 512 * 1024));
    const { digest, ...body } = result.build;
    expect(digest).toBe(localRecordDigest(body, 512 * 1024));
    const replay = vi.spyOn(LocalNormalizationStore.prototype, 'inspect');
    expect(new LocalCandidateBuildStore(root).inspect(manifest.buildId)).toEqual(result.build);
    expect(replay).toHaveBeenCalledWith('normalization-one');
    expect(replay).toHaveBeenCalledWith('normalization-two');
    expect(JSON.parse(readFileSync(buildPath(), 'utf8'))).toEqual(result.build);
    expect(readFileSync(buildPath(), 'utf8')).not.toContain('Identical Example Carrier');
  });

  it('keeps equal labels and registration numbers separate across source-scoped identities', () => {
    member('one', { sourceRecordId: 'shared-record' });
    member('two', { sourceRecordId: 'shared-record' });
    member('three', { sourceId: 'notation://source/local/one', sourceRecordId: 'different-record' });
    const build = new LocalCandidateBuildStore(root).build(request(['normalization-one', 'normalization-two', 'normalization-three']), BUILT).build;
    expect(build.recordCount).toBe(3);
    expect(new Set(build.members.map((entry) => JSON.stringify([entry.identity.sourceId, entry.identity.sourceRecordId]))).size).toBe(3);
    expect(build.members.every((entry) => entry.identity.canonicalId === null)).toBe(true);
  });

  it('compares source identity pairs structurally rather than through ambiguous colon concatenation', () => {
    member('one', { sourceId: 'source:a', sourceRecordId: 'b:c' });
    member('two', { sourceId: 'source:a:b', sourceRecordId: 'c' });
    expect(new LocalCandidateBuildStore(root).build(request(['normalization-one', 'normalization-two']), BUILT).build.recordCount).toBe(2);
  });

  it.each([false, true])('rejects duplicate source identities even when field content changed: %s', (changed) => {
    member('one', { sourceId: 'source:shared', sourceRecordId: 'shared-record' });
    member('two', { sourceId: 'source:shared', sourceRecordId: 'shared-record', legalName: changed ? 'Changed source observation' : undefined });
    expect(() => new LocalCandidateBuildStore(root).build(request(['normalization-one', 'normalization-two']), BUILT)).toThrow('SOURCE_IDENTITY_CONFLICT');
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('rejects missing members without publishing a partial snapshot', () => {
    member();
    expect(() => new LocalCandidateBuildStore(root).build(request(['normalization-one', 'normalization-missing']), BUILT)).toThrow('MEMBER_NOT_FOUND');
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('rejects quarantine instead of omitting it from membership', () => {
    member('one', { bytes: Buffer.from('{invalid source') });
    expect(() => new LocalCandidateBuildStore(root).build(request(), BUILT)).toThrow('MEMBER_NOT_ELIGIBLE');
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('requires each source class to be explicitly declared', () => {
    member('one', { registration: { sourceClass: 'UNDECLARED_SOURCE' } });
    expect(() => new LocalCandidateBuildStore(root).build(request(), BUILT)).toThrow('SOURCE_CLASS_NOT_DECLARED');
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('evaluates a fresh build-purpose DERIVE grant rather than inheriting normalization permission', () => {
    member('one', { registration: { permittedPurposes: ['NORMALIZATION_TEST'] } });
    expect(() => new LocalCandidateBuildStore(root).build(request(), BUILT)).toThrow('BUILD_DERIVATION_NOT_ALLOWED');
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('refuses a newly built snapshot exactly at source-policy expiry', () => {
    member();
    expect(() => new LocalCandidateBuildStore(root).build(request(), EXPIRY)).toThrow('BUILD_DERIVATION_NOT_ALLOWED');
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('allows knowledge exactly at the cutoff and normalizes equivalent timezone spelling', () => {
    member('one', { normalizedAt: CUTOFF });
    const manifest = { ...request(), knownThrough: '2026-09-05T10:00:00-04:00' };
    const result = new LocalCandidateBuildStore(root).build(manifest, BUILT).build;
    expect(result.knownThrough).toBe(CUTOFF);
    expect(result.request.manifest.knownThrough).toBe(CUTOFF);
  });

  it('preserves observed valid time after the knowledge cutoff and allows building exactly at that cutoff', () => {
    const validTime = { state: 'OBSERVED', from: '2027-01-01T00:00:00.000Z', to: '2027-02-01T00:00:00.000Z' };
    const fixture = member('one', { bytes: Buffer.from(JSON.stringify({
      schema: 'caravan.carrier-source.v1', sourceRecordId: 'carrier:future-observation', legalName: 'Future Effective Carrier',
      registrationNumber: '000007', operatingSite: null, validTime,
    })) });
    const build = new LocalCandidateBuildStore(root).build(request(), CUTOFF).build;
    expect(build.builtAt).toBe(build.knownThrough);
    expect(build.recordCount).toBe(1);
    expect(build.members[0].knownAt).toBe(NORMALIZED);
    expect(build.members[0].validTime).toEqual(validTime);
    expect(build.members[0].candidate.digest).toBe(fixture.run.candidate!.digest);
    expect(new LocalCandidateBuildStore(root).inspect(build.buildId)).toEqual(build);
  });

  it('keeps the membership root stable across build context while binding definition and member changes', () => {
    member();
    member('two');
    const store = new LocalCandidateBuildStore(root);
    const first = store.build(request(), BUILT).build;
    const otherRequest = {
      ...request(), buildId: 'same-members-other-context', purpose: 'ALTERNATE_BUILD', knownThrough: '2026-09-05T14:30:00.000Z',
    };
    const other = store.build(otherRequest, '2026-09-05T16:00:00.000Z').build;
    expect(other.request.members).toEqual(first.request.members);
    expect(other.definitionDigest).toBe(first.definitionDigest);
    expect(other.recordsRoot).toBe(first.recordsRoot);
    expect(other.requestDigest).not.toBe(first.requestDigest);
    expect(other.digest).not.toBe(first.digest);
    expect(other.builtAt).not.toBe(first.builtAt);
    expect(other.knownThrough).not.toBe(first.knownThrough);
    expect(other.members[0].deriveDecision.request.purpose).toBe('ALTERNATE_BUILD');

    const changedDefinition = request();
    changedDefinition.buildId = 'same-members-new-definition';
    changedDefinition.definition.version = '2.0.0';
    const definitionBuild = store.build(changedDefinition, BUILT).build;
    expect(definitionBuild.request.members).toEqual(first.request.members);
    expect(definitionBuild.recordsRoot).not.toBe(first.recordsRoot);
    const changedMembers = { ...request(['normalization-one', 'normalization-two']), buildId: 'additional-member' };
    const membershipBuild = store.build(changedMembers, BUILT).build;
    expect(membershipBuild.definitionDigest).toBe(first.definitionDigest);
    expect(membershipBuild.recordsRoot).not.toBe(first.recordsRoot);
  });

  it('refuses knowledge after the cutoff even when the candidate valid time is unobserved', () => {
    member('one', { normalizedAt: '2026-09-05T14:00:00.001Z' });
    expect(() => new LocalCandidateBuildStore(root).build(request(), BUILT)).toThrow('MEMBER_AFTER_CUTOFF');
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('refuses a build before its declared knowledge cutoff', () => {
    member();
    expect(() => new LocalCandidateBuildStore(root).build(request(), '2026-09-05T13:59:59.999Z')).toThrow();
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
  });

  it('sorts membership using UTF-16 ordering and preserves the original timestamp on reordered retries after expiry', () => {
    member('Z');
    member('a');
    const manifest = request(['normalization-a', 'normalization-Z']);
    manifest.definition.sourceClasses = [SOURCE_CLASS, 'AUXILIARY_DEMONSTRATION'];
    const store = new LocalCandidateBuildStore(root);
    const first = store.build(manifest, BUILT);
    const before = readFileSync(buildPath());
    const retryRequest = structuredClone(manifest);
    retryRequest.normalizationIds.reverse();
    retryRequest.definition.sourceClasses.reverse();
    retryRequest.knownThrough = '2026-09-05T10:00:00-04:00';
    const retry = new LocalCandidateBuildStore(root).build(retryRequest, '2026-09-08T00:00:00.000Z');
    expect(first.build.request.manifest.normalizationIds).toEqual(['normalization-Z', 'normalization-a']);
    expect(retry).toEqual({ status: 'EXISTING', build: first.build });
    expect(retry.build.builtAt).toBe(BUILT);
    expect(readFileSync(buildPath())).toEqual(before);
    expect(readdirSync(join(root, 'candidate-builds'))).toHaveLength(1);
  });

  it.each(['purpose', 'definition', 'cutoff', 'members'])('refuses an existing id rebound to a different valid %s request', (change) => {
    member();
    member('two');
    const store = new LocalCandidateBuildStore(root);
    store.build(request(), BUILT);
    const before = readFileSync(buildPath());
    const changed = request();
    if (change === 'purpose') changed.purpose = 'ALTERNATE_BUILD';
    if (change === 'definition') changed.definition.version = '2.0.0';
    if (change === 'cutoff') changed.knownThrough = '2026-09-05T14:30:00.000Z';
    if (change === 'members') changed.normalizationIds.push('normalization-two');
    expect(() => store.build(changed, BUILT)).toThrow('CANDIDATE_BUILD_CONFLICT');
    expect(readFileSync(buildPath())).toEqual(before);
  });

  it.each(['rehashed identity', 'records root', 'snapshot JSON', 'normalization', 'acquisition', 'source bytes'])('fails closed on corrupt %s without repair', (defect) => {
    const fixture = member();
    const store = new LocalCandidateBuildStore(root);
    store.build(request(), BUILT);
    let target = buildPath();
    if (defect === 'normalization') {
      target = pathFor('normalizations', fixture.normalization.normalizationId);
      const changed = JSON.parse(readFileSync(target, 'utf8'));
      changed.candidate.fields.legalName = 'Fabricated Carrier';
      const { digest: candidateDigest, ...candidate } = changed.candidate;
      expect(candidateDigest).toMatch(/^sha256:/);
      changed.candidate.digest = localRecordDigest(candidate);
      const { digest: runDigest, ...run } = changed;
      expect(runDigest).toMatch(/^sha256:/);
      changed.digest = localRecordDigest(run);
      writeFileSync(target, JSON.stringify(changed));
    } else if (defect === 'acquisition') {
      target = pathFor('acquisitions', fixture.declaration.acquisitionId);
      writeFileSync(target, '{corrupt acquisition');
    } else if (defect === 'source bytes') {
      target = join(root, 'objects', ...fixture.acquisition.capture.evidence.storageKey.split('/'));
      writeFileSync(target, 'corrupt source');
    } else if (defect === 'snapshot JSON') writeFileSync(target, '{corrupt snapshot');
    else {
      const changed = JSON.parse(readFileSync(target, 'utf8'));
      if (defect === 'rehashed identity') changed.members[0].identity.canonicalId = 'invented-canonical-identity';
      else changed.recordsRoot = `sha256:${'0'.repeat(64)}`;
      const { digest, ...body } = changed;
      expect(digest).toMatch(/^sha256:/);
      changed.digest = localRecordDigest(body, 512 * 1024);
      writeFileSync(target, JSON.stringify(changed));
    }
    const corrupted = readFileSync(target);
    expect(() => new LocalCandidateBuildStore(root).inspect(request().buildId)).toThrow();
    expect(() => new LocalCandidateBuildStore(root).build(request(), BUILT)).toThrow();
    expect(readFileSync(target)).toEqual(corrupted);
  });

  it('recovers the same concurrent request and its original build timestamp', () => {
    member();
    const publish = files.publishImmutableFile;
    let racing = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((selectedRoot, segments, bytes, maximum) => {
      if (segments[0] === 'candidate-builds' && !racing) {
        racing = true;
        new LocalCandidateBuildStore(root).build(request(), '2026-09-05T14:30:00.000Z');
      }
      return publish(selectedRoot, segments, bytes, maximum);
    });
    const result = new LocalCandidateBuildStore(root).build(request(), BUILT);
    expect(result.status).toBe('EXISTING');
    expect(result.build.builtAt).toBe('2026-09-05T14:30:00.000Z');
    expect(result.build.members[0].deriveDecision.request.requestedAt).toBe(result.build.builtAt);
    expect(readdirSync(join(root, 'candidate-builds'))).toHaveLength(1);
  });

  it('retains a different concurrent winner and reports a consistent conflict', () => {
    member();
    const publish = files.publishImmutableFile;
    const other = { ...request(), purpose: 'ALTERNATE_BUILD' };
    let racing = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((selectedRoot, segments, bytes, maximum) => {
      if (segments[0] === 'candidate-builds' && !racing) {
        racing = true;
        new LocalCandidateBuildStore(root).build(other, BUILT);
      }
      return publish(selectedRoot, segments, bytes, maximum);
    });
    const store = new LocalCandidateBuildStore(root);
    expect(() => store.build(request(), BUILT)).toThrow('CANDIDATE_BUILD_CONFLICT');
    expect(store.inspect(request().buildId)?.request.manifest.purpose).toBe('ALTERNATE_BUILD');
    expect(readdirSync(join(root, 'candidate-builds'))).toHaveLength(1);
  });

  it('supports the declared 64-member and 16-source-class boundaries with real dependencies', () => {
    const ids = Array.from({ length: 64 }, (_, index) => member(`member-${String(index).padStart(2, '0')}`).normalization.normalizationId);
    const manifest = request(ids);
    manifest.definition.sourceClasses = [SOURCE_CLASS, ...Array.from({ length: 15 }, (_, index) => `DECLARED_CLASS_${index}`)];
    const build = new LocalCandidateBuildStore(root).build(manifest, BUILT).build;
    expect(build.recordCount).toBe(64);
    expect(build.members).toHaveLength(64);
    expect(readFileSync(buildPath()).length).toBeLessThanOrEqual(512 * 1024);
    expect(new LocalCandidateBuildStore(root).inspect(manifest.buildId)).toEqual(build);
  });

  it('hashes opaque build identifiers rather than interpreting them as file paths', () => {
    member();
    const manifest = { ...request(), buildId: '../../outside' };
    const store = new LocalCandidateBuildStore(root);
    store.build(manifest, BUILT);
    expect(store.inspect(manifest.buildId)?.buildId).toBe('../../outside');
    expect(readdirSync(join(root, 'candidate-builds'))[0]).toMatch(/^[a-f0-9]{64}\.json$/);
    expect(readdirSync(temporary)).toEqual(['evidence']);
  });

  it('reports an absent snapshot without creating storage', () => {
    expect(new LocalCandidateBuildStore(root).inspect('absent')).toBeUndefined();
    expect(existsSync(root)).toBe(false);
  });
});

describe('candidate snapshot request bounds', () => {
  it.each([
    { name: 'null', value: null }, { name: 'array', value: [] },
    { name: 'unknown schema', value: { ...request(), schema: 'unknown' } },
    { name: 'extra field', value: { ...request(), releaseActivated: true } },
    { name: 'empty id', value: { ...request(), buildId: '' } },
    { name: 'oversized id', value: { ...request(), buildId: 'x'.repeat(181) } },
    { name: 'oversized purpose', value: { ...request(), purpose: 'x'.repeat(181) } },
    { name: 'bad cutoff', value: { ...request(), knownThrough: '2026-02-30T00:00:00Z' } },
    { name: 'empty membership', value: { ...request(), normalizationIds: [] } },
    { name: 'duplicate membership', value: request(['normalization-one', 'normalization-one']) },
    { name: '65 members', value: request(Array.from({ length: 65 }, (_, index) => `normalization-${index}`)) },
    { name: 'oversized member id', value: request(['x'.repeat(181)]) },
    { name: 'different domain', value: { ...request(), definition: { ...request().definition, domain: 'TRADEWIND' } } },
    { name: 'different record type', value: { ...request(), definition: { ...request().definition, recordType: 'Shipment' } } },
    { name: 'unknown definition field', value: { ...request(), definition: { ...request().definition, canonical: true } } },
    { name: 'empty source classes', value: { ...request(), definition: { ...request().definition, sourceClasses: [] } } },
    { name: 'duplicate source classes', value: { ...request(), definition: { ...request().definition, sourceClasses: [SOURCE_CLASS, SOURCE_CLASS] } } },
    { name: '17 source classes', value: { ...request(), definition: { ...request().definition, sourceClasses: Array.from({ length: 17 }, (_, index) => `CLASS_${index}`) } } },
    { name: 'oversized source class', value: { ...request(), definition: { ...request().definition, sourceClasses: ['x'.repeat(181)] } } },
  ])('rejects $name before creating build storage', ({ value }) => {
    expect(() => new LocalCandidateBuildStore(root).build(value, BUILT)).toThrow('INVALID_CANDIDATE_BUILD');
    expect(existsSync(root)).toBe(false);
  });
});
