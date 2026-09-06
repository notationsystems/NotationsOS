import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CensusNormalizationStore, type CensusNormalizationRun } from '../acquisition/census-normalization';
import type { SourceCaptureRequest } from '../acquisition/fmcsa';
import { SourceCaptureStore } from '../acquisition/store';
import { byteDigest } from './evidence-capture';
import * as files from './local-files';
import { localRecordDigest } from './local-record';
import { CANDIDATE_BUILD_CONTRACT } from './local-candidate-build';
import {
  CENSUS_CANDIDATE_BUILD_CONTRACT, CensusCandidateBuildStore, MAX_CENSUS_CANDIDATE_BUILD_BYTES,
  parseCensusCandidateBuildRequest, type CensusCandidateBuildRequest,
} from './local-census-candidate-build';

const NORMALIZED = '2026-09-06T13:00:00.000Z';
const CUTOFF = '2026-09-06T14:00:00.000Z';
const BUILT = '2026-09-06T15:00:00.000Z';
const EXPIRED = '2026-10-06T00:00:00.000Z';
const SOURCE_CLASS = 'public-government-company-census';
const DUMMY_DIGEST = `sha256:${'a'.repeat(64)}`;
let temporary: string;
let root: string;
let captureNumber: number;

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'payload-census-build-test-'));
  root = join(temporary, 'evidence'); captureNumber = 0;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Tests must never contact a provider.'); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); rmSync(temporary, { recursive: true, force: true }); });

async function capture(usdot: string[], returned = usdot) {
  const number = captureNumber++;
  const request: SourceCaptureRequest = {
    schema: 'payload.source-capture-request.v1', requestId: `synthetic-capture-${number}`,
    sourceId: 'fmcsa-company-census', usdot,
  };
  const bytes = Buffer.from(JSON.stringify(returned.map((dot_number) => ({
    dot_number, legal_name: `SYNTHETIC LEGAL NAME ${dot_number}`, business_org_desc: 'CORPORATION',
    phy_country: 'US', phy_state: 'CA', power_units: '12', total_drivers: '18',
    mcs150_date: '20240131', mcs150_mileage: '400', mcs150_mileage_year: '2023',
  }))));
  const clock = `2026-09-06T10:${String(number).padStart(2, '0')}:00.000Z`;
  const source = new SourceCaptureStore(root, {
    now: () => clock,
    fetch: async () => ({ bytes, mediaType: 'application/json', lastModified: null, etag: null }),
  });
  const inspection = await source.capture(request, true);
  expect(inspection.state).toBe('CAPTURED');
  return { request, inspection };
}

async function member(id = 'normalization-1', usdot = '101', options: { returned?: boolean; at?: string } = {}) {
  const source = await capture([usdot], options.returned === false ? [] : [usdot]);
  return new CensusNormalizationStore(root).normalize({
    schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: id,
    purpose: 'source-qualification', capture: { requestId: source.request.requestId, receiptDigest: source.inspection.receipt!.digest }, usdot,
  }, options.at ?? NORMALIZED).run;
}

function request(runs: CensusNormalizationRun[] = []): CensusCandidateBuildRequest {
  return {
    schema: 'payload.local-candidate-build-request.v2', buildId: 'census-build-1', purpose: 'source-qualification', knownThrough: CUTOFF,
    definition: { id: 'caravan-census-observations', version: '1.0.0', domain: 'CARAVAN', recordType: 'FMCSACompanyCensusObservation', sourceClasses: [SOURCE_CLASS] },
    normalizations: runs.length ? runs.map((run) => ({ id: run.request.manifest.normalizationId, digest: run.digest }))
      : [{ id: 'normalization-1', digest: DUMMY_DIGEST }],
  };
}

function pathFor(kind: string, id: string) { return join(root, kind, `${byteDigest(Buffer.from(id)).slice(7)}.json`); }
function buildPath(id = 'census-build-1') { return pathFor('source-candidate-builds', id); }
function history() {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
    const path = join(entry.parentPath, entry.name); return [path, byteDigest(readFileSync(path))];
  }).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}
const throws = (operation: () => unknown, code: string) => expect(operation).toThrowError(expect.objectContaining({ code }));

describe('FMCSA source-specific candidate membership', () => {
  it('builds exact reference-only membership with historical policy and unchanged v1 contract', async () => {
    const first = await member('normalization-a', '101');
    const second = await member('normalization-Z', '102');
    const manifest = request([first, second]);
    manifest.definition.sourceClasses = [SOURCE_CLASS, 'ADDITIONAL_DECLARED_CLASS'];
    const original = structuredClone(manifest);
    const legacyDigest = localRecordDigest(CANDIDATE_BUILD_CONTRACT);
    const result = new CensusCandidateBuildStore(root).build(manifest, BUILT);
    expect(result.status).toBe('CREATED');
    expect(manifest).toEqual(original);
    const build = result.build;
    expect(build).toMatchObject({ schema: 'payload.local-candidate-build.v2', state: 'UNADMITTED', mode: 'LOCAL_SOURCE_QUALIFICATION',
      policyAuthority: 'OPERATOR_DECLARATION', canonicalAdmission: false, canonicalStateMutated: false, identityResolved: false,
      releaseActivated: false, sourceTruthClaimed: false, independentlyVerified: false, completenessClaimed: false,
      customerDistributionPermitted: false, knownThrough: CUTOFF, builtAt: BUILT, recordCount: 2 });
    expect(build.request.manifest.normalizations.map((item) => item.id)).toEqual(['normalization-Z', 'normalization-a']);
    expect(build.request.manifest.definition.sourceClasses).toEqual(['ADDITIONAL_DECLARED_CLASS', SOURCE_CLASS]);
    expect(build.request.members).toEqual([second, first].map((run) => ({
      normalization: { id: run.request.manifest.normalizationId, digest: run.digest },
      candidate: { id: run.candidate!.candidateId, digest: run.candidate!.digest },
    })));
    for (const [index, run] of [second, first].entries()) {
      expect(build.members[index]).toMatchObject({ ...build.request.members[index], identity: run.candidate!.identity,
        validTime: run.candidate!.validTime, knownAt: NORMALIZED, sourceClass: SOURCE_CLASS,
        sourcePolicy: run.candidate!.provenance.sourcePolicy,
        deriveDecision: { state: 'ALLOWED', evaluatedAt: BUILT,
          request: { operation: 'DERIVE', audience: 'INTERNAL', purpose: 'source-qualification', requestedAt: BUILT } } });
      expect(build.members[index].deriveDecision.decisionId).not.toBe(run.deriveDecision.decisionId);
    }
    expect(build.request.contractDigest).toBe(localRecordDigest(CENSUS_CANDIDATE_BUILD_CONTRACT));
    expect(build.definitionDigest).toBe(localRecordDigest(build.request.manifest.definition));
    expect(build.requestDigest).toBe(localRecordDigest(build.request, MAX_CENSUS_CANDIDATE_BUILD_BYTES));
    expect(build.recordsRoot).toBe(localRecordDigest({ domain: 'payload.local-census-candidate-membership.v2',
      definitionDigest: build.definitionDigest, contractDigest: build.request.contractDigest, members: build.request.members }));
    const { digest, ...payload } = build;
    expect(digest).toBe(localRecordDigest(payload, MAX_CENSUS_CANDIDATE_BUILD_BYTES));
    expect(JSON.stringify(build)).not.toContain('SYNTHETIC LEGAL NAME');
    expect(build.members.every((value) => !Object.hasOwn(value, 'fields'))).toBe(true);
    expect(existsSync(join(root, 'candidate-builds'))).toBe(false);
    expect(localRecordDigest(CANDIDATE_BUILD_CONTRACT)).toBe(legacyDigest);
    const before = history();
    expect(new CensusCandidateBuildStore(root).inspect(manifest.buildId)).toEqual(build);
    expect(history()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries the exact build after policy expiry without a clock, write or permission renewal', async () => {
    const run = await member(); const manifest = request([run]);
    const expected = new CensusCandidateBuildStore(root).build(manifest, BUILT).build;
    const before = history();
    vi.useFakeTimers(); vi.setSystemTime(new Date(EXPIRED));
    try {
      const store = new CensusCandidateBuildStore(root);
      expect(store.inspect(manifest.buildId)).toEqual(expected);
      expect(store.build(manifest)).toEqual({ status: 'EXISTING', build: expected });
      expect(store.build(manifest, 'not a new clock')).toEqual({ status: 'EXISTING', build: expected });
      throws(() => store.build({ ...manifest, buildId: 'new-expired-build' }), 'CENSUS_BUILD_DERIVATION_NOT_ALLOWED');
    } finally { vi.useRealTimers(); }
    expect(history()).toEqual(before);
  });

  it('uses the current backend clock for a new build when none is supplied', async () => {
    const run = await member();
    vi.useFakeTimers(); vi.setSystemTime(new Date(BUILT));
    try { expect(new CensusCandidateBuildStore(root).build(request([run])).build.builtAt).toBe(BUILT); }
    finally { vi.useRealTimers(); }
  });

  it.each(['missing', 'mismatch', 'not-returned', 'cutoff', 'class'] as const)('refuses %s members without writing a build', async (condition) => {
    const run = await member('normalization-1', '101', { returned: condition !== 'not-returned' });
    const manifest = request([run]);
    const codes = { missing: 'CENSUS_BUILD_MEMBER_NOT_FOUND', mismatch: 'CENSUS_BUILD_MEMBER_REFERENCE_MISMATCH',
      'not-returned': 'CENSUS_BUILD_MEMBER_NOT_ELIGIBLE', cutoff: 'CENSUS_BUILD_MEMBER_AFTER_CUTOFF', class: 'CENSUS_BUILD_SOURCE_CLASS_NOT_DECLARED' };
    if (condition === 'missing') manifest.normalizations[0].id = 'missing-normalization';
    if (condition === 'mismatch') manifest.normalizations[0].digest = DUMMY_DIGEST;
    if (condition === 'cutoff') manifest.knownThrough = '2026-09-06T12:59:59.999Z';
    if (condition === 'class') manifest.definition.sourceClasses = ['SYNTHETIC_OTHER_CLASS'];
    const before = history();
    throws(() => new CensusCandidateBuildStore(root).build(manifest, BUILT), codes[condition]);
    expect(history()).toEqual(before);
    expect(existsSync(join(root, 'source-candidate-builds'))).toBe(false);
    if (condition === 'not-returned') expect(run).toMatchObject({ state: 'NOT_RETURNED', candidate: null, notReturned: ['101'] });
  });

  it('refuses two observations of the same source-scoped identity rather than selecting a newer one', async () => {
    const first = await member('older-observation', '101');
    const second = await member('newer-observation', '101', { at: '2026-09-06T13:30:00.000Z' });
    const before = history();
    throws(() => new CensusCandidateBuildStore(root).build(request([first, second]), BUILT), 'CENSUS_BUILD_SOURCE_IDENTITY_CONFLICT');
    expect(history()).toEqual(before);
  });

  it.each(['2026-09-06T13:59:59.999Z', '2026-09-06T15:00:00Z', '2026-09-06T15:00:00.000+00:00', 'invalid'])('refuses invalid build chronology or clock %s', async (at) => {
    const run = await member(); const before = history();
    throws(() => new CensusCandidateBuildStore(root).build(request([run]), at), 'INVALID_CENSUS_CANDIDATE_BUILD_TIME');
    expect(history()).toEqual(before);
  });

  it('allows exact knowledge/cutoff/build time equality without manufacturing valid time', async () => {
    const run = await member(); const manifest = { ...request([run]), knownThrough: NORMALIZED };
    const build = new CensusCandidateBuildStore(root).build(manifest, NORMALIZED).build;
    expect(build.members[0].validTime).toEqual(run.candidate!.validTime);
    expect(build.members[0].knownAt).toBe(build.builtAt);
  });

  it('reserves an immutable build identity for its original request', async () => {
    const run = await member(); const manifest = request([run]); const store = new CensusCandidateBuildStore(root);
    const expected = store.build(manifest, BUILT).build; const before = history();
    throws(() => store.build({ ...manifest, knownThrough: NORMALIZED }, BUILT), 'CENSUS_CANDIDATE_BUILD_CONFLICT');
    expect(store.inspect(manifest.buildId)).toEqual(expected); expect(history()).toEqual(before);
  });

  it.each(['recordCount', 'contractDigest', 'recordsRoot', 'canonicalAdmission', 'memberIdentity', 'sourceDecision', 'memberDigest'] as const)(
    'recomputes semantic commitments, rejecting rehashed %s tampering', async (field) => {
      const run = await member(); const manifest = request([run]);
      new CensusCandidateBuildStore(root).build(manifest, BUILT);
      const record = JSON.parse(readFileSync(buildPath(), 'utf8'));
      if (field === 'recordCount') record.recordCount = 99;
      if (field === 'contractDigest') record.request.contractDigest = DUMMY_DIGEST;
      if (field === 'recordsRoot') record.recordsRoot = DUMMY_DIGEST;
      if (field === 'canonicalAdmission') record.canonicalAdmission = true;
      if (field === 'memberIdentity') record.members[0].identity.sourceRecordId = '999';
      if (field === 'sourceDecision') record.members[0].deriveDecision.request.audience = 'PUBLIC';
      if (field === 'memberDigest') record.members[0].candidate.digest = DUMMY_DIGEST;
      const { digest: ignored, ...payload } = record; void ignored;
      record.digest = localRecordDigest(payload, MAX_CENSUS_CANDIDATE_BUILD_BYTES);
      writeFileSync(buildPath(), JSON.stringify(record));
      const before = history();
      throws(() => new CensusCandidateBuildStore(root).inspect(manifest.buildId), 'CENSUS_CANDIDATE_BUILD_INVALID');
      throws(() => new CensusCandidateBuildStore(root).build(manifest, BUILT), 'CENSUS_CANDIDATE_BUILD_INVALID');
      expect(history()).toEqual(before);
    },
  );

  it.each(['normalization', 'source-bytes'] as const)('reopens upstream %s rather than trusting stored membership', async (target) => {
    const run = await member(); const manifest = request([run]);
    new CensusCandidateBuildStore(root).build(manifest, BUILT);
    if (target === 'normalization') writeFileSync(pathFor('source-normalizations', run.request.manifest.normalizationId), '{}');
    else {
      const files = readdirSync(join(root, 'objects'), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
      expect(files).toHaveLength(1); writeFileSync(join(files[0].parentPath, files[0].name), '[]');
    }
    const before = history();
    throws(() => new CensusCandidateBuildStore(root).inspect(manifest.buildId), 'CENSUS_CANDIDATE_BUILD_INVALID');
    expect(history()).toEqual(before);
  });

  it('returns a verified concurrent winner with its original build clock', async () => {
    const run = await member(); const manifest = request([run]); const publish = files.publishImmutableFile; let racing = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((directory, segments, bytes, maximum) => {
      if (segments[0] === 'source-candidate-builds' && !racing) {
        racing = true; new CensusCandidateBuildStore(root).build(manifest, '2026-09-06T14:30:00.000Z');
      }
      return publish(directory, segments, bytes, maximum);
    });
    const result = new CensusCandidateBuildStore(root).build(manifest, BUILT);
    expect(result.status).toBe('EXISTING'); expect(result.build.builtAt).toBe('2026-09-06T14:30:00.000Z');
    expect(readdirSync(join(root, 'source-candidate-builds'))).toHaveLength(1);
  });

  it('preserves a different concurrent winner and reports a conflict', async () => {
    const run = await member(); const manifest = request([run]); const publish = files.publishImmutableFile; let racing = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((directory, segments, bytes, maximum) => {
      if (segments[0] === 'source-candidate-builds' && !racing) {
        racing = true; new CensusCandidateBuildStore(root).build({ ...manifest, knownThrough: NORMALIZED }, BUILT);
      }
      return publish(directory, segments, bytes, maximum);
    });
    const store = new CensusCandidateBuildStore(root);
    throws(() => store.build(manifest, BUILT), 'CENSUS_CANDIDATE_BUILD_CONFLICT');
    expect(store.inspect(manifest.buildId)?.knownThrough).toBe(NORMALIZED);
  });

  it('requires successful publication readback and preserves corrupted output for inspection', async () => {
    const run = await member(); const publish = files.publishImmutableFile;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((directory, segments, bytes, maximum) => {
      const status = publish(directory, segments, bytes, maximum);
      if (segments[0] === 'source-candidate-builds') writeFileSync(join(directory, ...segments), '{}');
      return status;
    });
    throws(() => new CensusCandidateBuildStore(root).build(request([run]), BUILT), 'CENSUS_CANDIDATE_BUILD_SAVE_UNCONFIRMED');
    expect(readFileSync(buildPath(), 'utf8')).toBe('{}');
  });

  it('supports 64 exact real-store members and 16 source classes under the byte limit', async () => {
    const runs: CensusNormalizationRun[] = [];
    for (let offset = 0; offset < 64; offset += 25) {
      const usdot = Array.from({ length: Math.min(25, 64 - offset) }, (_, index) => String(1000 + offset + index));
      const source = await capture(usdot);
      for (const value of usdot) runs.push(new CensusNormalizationStore(root).normalize({
        schema: 'payload.fmcsa-census-normalization-request.v1', normalizationId: `observation-${value}`,
        purpose: 'source-qualification', capture: { requestId: source.request.requestId, receiptDigest: source.inspection.receipt!.digest }, usdot: value,
      }, NORMALIZED).run);
    }
    const manifest = request(runs.reverse());
    manifest.definition.sourceClasses = [SOURCE_CLASS, ...Array.from({ length: 15 }, (_, index) => `ADDITIONAL_CLASS_${index}`)];
    const build = new CensusCandidateBuildStore(root).build(manifest, BUILT).build;
    expect(build.recordCount).toBe(64); expect(build.members).toHaveLength(64);
    expect(readFileSync(buildPath()).byteLength).toBeLessThanOrEqual(MAX_CENSUS_CANDIDATE_BUILD_BYTES);
    expect(new CensusCandidateBuildStore(root).inspect(manifest.buildId)).toEqual(build);
  }, 30_000);

  it('reports an absent build without creating storage', () => {
    expect(new CensusCandidateBuildStore(root).inspect('absent')).toBeUndefined(); expect(existsSync(root)).toBe(false);
  });
});

describe('closed census candidate build requests', () => {
  const initial = request();
  it.each([
    ['null', null], ['array', []], ['legacy schema', { ...initial, schema: 'payload.local-candidate-build-request.v1' }],
    ['extra field', { ...initial, canonicalAdmission: true }], ['empty id', { ...initial, buildId: '' }],
    ['path id', { ...initial, buildId: '../outside' }], ['oversized id', { ...initial, buildId: 'x'.repeat(81) }],
    ['wrong purpose', { ...initial, purpose: 'customer-distribution' }], ['invalid clock', { ...initial, knownThrough: '2026-02-30T00:00:00.000Z' }],
    ['noncanonical clock', { ...initial, knownThrough: '2026-09-06T14:00:00Z' }],
    ['empty members', { ...initial, normalizations: [] }],
    ['duplicate member id', { ...initial, normalizations: [...initial.normalizations, { ...initial.normalizations[0], digest: `sha256:${'b'.repeat(64)}` }] }],
    ['65 members', { ...initial, normalizations: Array.from({ length: 65 }, (_, index) => ({ id: `n-${index}`, digest: DUMMY_DIGEST })) }],
    ['member digest absent', { ...initial, normalizations: [{ id: 'n' }] }],
    ['member digest malformed', { ...initial, normalizations: [{ id: 'n', digest: 'a'.repeat(64) }] }],
    ['member id path', { ...initial, normalizations: [{ id: '../n', digest: DUMMY_DIGEST }] }],
    ['member unknown field', { ...initial, normalizations: [{ id: 'n', digest: DUMMY_DIGEST, candidate: true }] }],
    ['wrong domain', { ...initial, definition: { ...initial.definition, domain: 'LANDSHARK' } }],
    ['legacy record', { ...initial, definition: { ...initial.definition, recordType: 'Carrier' } }],
    ['extra definition field', { ...initial, definition: { ...initial.definition, admission: true } }],
    ['empty classes', { ...initial, definition: { ...initial.definition, sourceClasses: [] } }],
    ['duplicate classes', { ...initial, definition: { ...initial.definition, sourceClasses: [SOURCE_CLASS, SOURCE_CLASS] } }],
    ['17 classes', { ...initial, definition: { ...initial.definition, sourceClasses: Array.from({ length: 17 }, (_, index) => `CLASS_${index}`) } }],
    ['oversized class', { ...initial, definition: { ...initial.definition, sourceClasses: ['x'.repeat(181)] } }],
  ])('rejects %s before creating any storage', (_name, value) => {
    throws(() => parseCensusCandidateBuildRequest(value), 'INVALID_CENSUS_CANDIDATE_BUILD_REQUEST');
    throws(() => new CensusCandidateBuildStore(root).build(value, BUILT), 'INVALID_CENSUS_CANDIDATE_BUILD_REQUEST');
    expect(existsSync(root)).toBe(false);
  });
});
