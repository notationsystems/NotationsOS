import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceRegistration } from './contracts';
import * as adapter from './caravan-carrier-adapter';
import { byteDigest } from './evidence-capture';
import { LocalEvidenceIntake, type LocalIntakeManifest } from './local-intake';
import * as files from './local-files';
import { localRecordDigest } from './local-record';
import { LocalNormalizationStore, parseNormalizationRequest, type LocalNormalizationRun, type NormalizationRequest } from './local-normalization';

const CAPTURED = '2026-09-05T10:00:00Z';
const STORED = '2026-09-05T12:00:00Z';
const NORMALIZED = '2026-09-05T13:00:00Z';
const EXPIRY = '2026-09-07T00:00:00Z';
let temporary: string;
let root: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-normalization-test-')); root = join(temporary, 'evidence'); });
afterEach(() => { vi.restoreAllMocks(); rmSync(temporary, { recursive: true, force: true }); });

function declaration(registration: Partial<SourceRegistration> = {}, mediaType = 'application/json'): LocalIntakeManifest {
  return {
    schema: 'payload.local-intake-request.v1', acquisitionId: 'carrier-acquisition-1', evidenceId: 'carrier-evidence-1',
    purpose: 'NORMALIZATION_TEST', mediaType, capturedAt: CAPTURED,
    sourceRegistration: {
      registrationId: 'carrier-policy-1', sourceId: 'notation://source/local/carrier-demo',
      displayName: 'Synthetic carrier source', sourceClass: 'SYNTHETIC_DEMONSTRATION', licenseId: 'local-declaration',
      policyVersion: '1.0.0', effectiveFrom: '2026-09-01T00:00:00Z', effectiveUntil: EXPIRY,
      permittedPurposes: ['NORMALIZATION_TEST', 'ALTERNATE_TEST'], allowedOperations: ['INGEST', 'DERIVE'],
      allowedAudiences: ['INTERNAL'], retention: { mode: 'UNTIL_SOURCE_EXPIRY' }, ...registration,
    },
  };
}

function source(changes: Record<string, unknown> = {}) {
  return {
    schema: 'caravan.carrier-source.v1', sourceRecordId: 'carrier:source-local-01', legalName: '  Synthetic Freight Ltd.  ',
    registrationNumber: '  000007  ', operatingSite: null,
    validTime: { state: 'OBSERVED', from: '2026-09-04T08:00:00-04:00', to: '2026-09-06T12:00:00Z' }, ...changes,
  };
}

const encodeSource = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');

function request(): NormalizationRequest {
  return {
    schema: 'payload.local-normalization-request.v1', normalizationId: 'carrier-normalization-1',
    acquisitionId: 'carrier-acquisition-1', purpose: 'NORMALIZATION_TEST',
    profile: { id: 'synthetic-carrier-profile', version: '1.0.0', sourceRegistrationId: 'carrier-policy-1',
      sourceId: 'notation://source/local/carrier-demo', adapterId: 'caravan.carrier-json/v1' },
  };
}

function capture(options: { bytes?: Uint8Array; registration?: Partial<SourceRegistration>; mediaType?: string } = {}) {
  const bytes = options.bytes ?? encodeSource(source());
  const manifest = declaration(options.registration, options.mediaType);
  const acquisition = new LocalEvidenceIntake(root).capture(manifest, bytes, STORED).acquisition;
  return { bytes, manifest, acquisition };
}

function recordPath(kind: 'normalizations' | 'acquisitions', id: string) {
  return join(root, kind, `${byteDigest(Buffer.from(id)).slice(7)}.json`);
}

function runPath() { return recordPath('normalizations', request().normalizationId); }

describe('local normalization and candidate persistence', () => {
  it('reopens files and reparses actual evidence into an unadmitted candidate with exact clocks and provenance', () => {
    const { bytes, manifest, acquisition } = capture();
    const result = new LocalNormalizationStore(root).normalize(request(), NORMALIZED);
    expect(result.status).toBe('CREATED');
    expect(result.run).toMatchObject({
      state: 'NORMALIZED', reasons: ['CONTRACT_MATCH'], mode: 'LOCAL_DEVELOPMENT', policyAuthority: 'OPERATOR_DECLARATION',
      canonicalAdmission: false, sourceTruthClaimed: false, fieldAccuracyClaimed: false, independentlyVerified: false,
      normalizedAt: NORMALIZED,
    });
    expect(result.run.candidate).toMatchObject({
      candidateId: 'carrier-normalization-1:candidate', domain: 'CARAVAN', recordType: 'Carrier', state: 'UNADMITTED',
      identity: { state: 'UNRESOLVED', sourceId: manifest.sourceRegistration.sourceId, sourceRecordId: 'carrier:source-local-01', canonicalId: null },
      fields: { legalName: 'Synthetic Freight Ltd.', registrationNumber: '000007' }, missingFields: ['operatingSite'],
      validTime: { state: 'OBSERVED', from: '2026-09-04T12:00:00.000Z', to: '2026-09-06T12:00:00.000Z' }, knownAt: NORMALIZED,
    });
    expect(result.run.candidate!.fields).not.toHaveProperty('operatingSite');
    expect(result.run.candidate!.provenance).toEqual({
      acquisition: { id: manifest.acquisitionId, digest: acquisition.digest },
      evidence: { id: manifest.evidenceId, contentDigest: byteDigest(bytes) },
      receipt: { id: acquisition.capture.receipt.receiptId, digest: localRecordDigest(acquisition.capture.receipt) },
      sourcePolicy: { id: manifest.sourceRegistration.registrationId, digest: localRecordDigest(manifest.sourceRegistration) },
      derivation: { id: result.run.deriveDecision.decisionId, digest: localRecordDigest(result.run.deriveDecision) },
      adapter: { id: adapter.CARRIER_ADAPTER.id, version: adapter.CARRIER_ADAPTER.version, contractDigest: localRecordDigest(adapter.CARRIER_ADAPTER) },
    });
    expect(result.run.deriveDecision).toMatchObject({ state: 'ALLOWED', evaluatedAt: NORMALIZED, request: { operation: 'DERIVE', audience: 'INTERNAL', requestedAt: NORMALIZED } });
    const parse = vi.spyOn(adapter, 'parseCarrierEvidence');
    const reopened = new LocalNormalizationStore(root).inspect(request().normalizationId);
    expect(reopened).toEqual(result.run);
    expect(parse).toHaveBeenCalledWith(bytes);
    expect(JSON.parse(readFileSync(runPath(), 'utf8'))).toEqual(result.run);
    expect(new LocalEvidenceIntake(root).objects.get(acquisition.request.contentDigest)).toEqual(bytes);
  });

  it('keeps explicit unobserved valid time and both optional fields missing', () => {
    capture({ bytes: encodeSource(source({ registrationNumber: null, operatingSite: null, validTime: { state: 'UNOBSERVED', from: null, to: null } })) });
    const candidate = new LocalNormalizationStore(root).normalize(request(), NORMALIZED).run.candidate;
    expect(candidate).toMatchObject({
      fields: { legalName: 'Synthetic Freight Ltd.' }, missingFields: ['operatingSite', 'registrationNumber'],
      validTime: { state: 'UNOBSERVED', from: null, to: null }, knownAt: NORMALIZED,
    });
    expect(Object.keys(candidate!.fields)).toEqual(['legalName']);
  });

  it('refuses DERIVE when the source grants only INGEST and creates no normalization state', () => {
    capture({ registration: { allowedOperations: ['INGEST'] } });
    expect(() => new LocalNormalizationStore(root).normalize(request(), NORMALIZED)).toThrow('DERIVATION_NOT_ALLOWED');
    expect(existsSync(join(root, 'normalizations'))).toBe(false);
  });

  it('refuses approval-required derivation without treating ingestion as approval', () => {
    capture({ registration: { allowedOperations: ['INGEST'], approvalRequiredOperations: ['DERIVE'] } });
    expect(() => new LocalNormalizationStore(root).normalize(request(), NORMALIZED)).toThrow('EXPLICIT_APPROVAL_REQUIRED');
    expect(existsSync(join(root, 'normalizations'))).toBe(false);
  });

  it('checks the half-open source policy window at derivation time', () => {
    capture();
    expect(() => new LocalNormalizationStore(root).normalize(request(), EXPIRY)).toThrow('OUTSIDE_EFFECTIVE_WINDOW');
    expect(existsSync(join(root, 'normalizations'))).toBe(false);
  });

  it.each(['sourceId', 'sourceRegistrationId'] as const)('refuses a profile bound to the wrong %s', (field) => {
    capture();
    const changed = request();
    changed.profile[field] = 'another-source';
    expect(() => new LocalNormalizationStore(root).normalize(changed, NORMALIZED)).toThrow('SOURCE_PROFILE_MISMATCH');
    expect(existsSync(join(root, 'normalizations'))).toBe(false);
  });

  it('refuses normalization earlier than immutable evidence storage', () => {
    capture();
    expect(() => new LocalNormalizationStore(root).normalize(request(), '2026-09-05T11:59:59Z')).toThrow('cannot precede evidence storage');
    expect(existsSync(join(root, 'normalizations'))).toBe(false);
  });

  it.each([
    { defect: 'media', mediaType: 'text/plain', bytes: encodeSource(source()), reason: 'MEDIA_TYPE_MISMATCH' },
    { defect: 'schema', mediaType: 'application/json', bytes: encodeSource(source({ schema: 'caravan.carrier-source.v2' })), reason: 'SCHEMA_MISMATCH' },
    { defect: 'data', mediaType: 'application/json', bytes: encodeSource(source({ legalName: '' })), reason: 'RECORD_CONTRACT_MISMATCH' },
    { defect: 'UTF-8', mediaType: 'application/json', bytes: Buffer.from([0xc3, 0x28]), reason: 'INVALID_SOURCE_ENCODING' },
    { defect: 'JSON', mediaType: 'application/json', bytes: Buffer.from('{broken'), reason: 'INVALID_SOURCE_JSON' },
    { defect: 'size', mediaType: 'application/json', bytes: Buffer.alloc(64 * 1024 + 1, 32), reason: 'SOURCE_TOO_LARGE' },
  ])('persists and reopens $defect quarantine without a candidate', ({ mediaType, bytes, reason }) => {
    capture({ mediaType, bytes });
    const result = new LocalNormalizationStore(root).normalize(request(), NORMALIZED);
    expect(result).toMatchObject({ status: 'CREATED', run: { state: 'QUARANTINED', reasons: [reason], candidate: null, canonicalAdmission: false } });
    expect(new LocalNormalizationStore(root).inspect(request().normalizationId)).toEqual(result.run);
    expect(readFileSync(runPath(), 'utf8')).not.toContain('Synthetic Freight Ltd.');
  });

  it.each(['NORMALIZED', 'QUARANTINED'])('reuses the original %s receipt and timestamp after exact retry, even after policy expiry', (state) => {
    capture(state === 'QUARANTINED' ? { bytes: Buffer.from('{broken') } : {});
    const first = new LocalNormalizationStore(root).normalize(request(), NORMALIZED);
    const original = readFileSync(runPath());
    const reordered = Object.fromEntries(Object.entries(request()).reverse());
    const retry = new LocalNormalizationStore(root).normalize(reordered, '2026-09-08T00:00:00Z');
    expect(first.run.state).toBe(state);
    expect(retry).toEqual({ status: 'EXISTING', run: first.run });
    expect(retry.run.normalizedAt).toBe(NORMALIZED);
    expect(readFileSync(runPath())).toEqual(original);
    expect(readdirSync(join(root, 'normalizations'))).toHaveLength(1);
  });

  it('refuses an existing normalization id rebound to a different valid request', () => {
    capture();
    new LocalNormalizationStore(root).normalize(request(), NORMALIZED);
    const before = readFileSync(runPath());
    const changed = { ...request(), purpose: 'ALTERNATE_TEST' };
    expect(() => new LocalNormalizationStore(root).normalize(changed, NORMALIZED)).toThrow('NORMALIZATION_CONFLICT');
    expect(readFileSync(runPath())).toEqual(before);
  });

  it.each(['rehashed candidate', 'run digest', 'run JSON', 'acquisition', 'source bytes'])('rejects corrupt $defect evidence without repair', (defect) => {
    const { acquisition } = capture();
    new LocalNormalizationStore(root).normalize(request(), NORMALIZED);
    let corruptedPath = runPath();
    if (defect === 'source bytes') {
      corruptedPath = join(root, 'objects', ...acquisition.capture.evidence.storageKey.split('/'));
      writeFileSync(corruptedPath, 'corrupt source');
    } else if (defect === 'acquisition') {
      corruptedPath = recordPath('acquisitions', request().acquisitionId);
      const changed = JSON.parse(readFileSync(corruptedPath, 'utf8'));
      changed.sourceTruthClaimed = true;
      writeFileSync(corruptedPath, JSON.stringify(changed));
    } else if (defect === 'run JSON') writeFileSync(corruptedPath, '{broken');
    else {
      const changed: LocalNormalizationRun = JSON.parse(readFileSync(corruptedPath, 'utf8'));
      if (defect === 'rehashed candidate') {
        changed.candidate!.fields.legalName = 'Invented Carrier';
        const { digest: candidateDigest, ...candidateBody } = changed.candidate!;
        expect(candidateDigest).toMatch(/^sha256:/);
        changed.candidate!.digest = localRecordDigest(candidateBody);
        const { digest: runDigest, ...runBody } = changed;
        expect(runDigest).toMatch(/^sha256:/);
        changed.digest = localRecordDigest(runBody);
      } else changed.digest = `sha256:${'0'.repeat(64)}`;
      writeFileSync(corruptedPath, JSON.stringify(changed));
    }
    const corruptedBytes = readFileSync(corruptedPath);
    const store = new LocalNormalizationStore(root);
    expect(() => store.inspect(request().normalizationId)).toThrow();
    expect(() => store.normalize(request(), NORMALIZED)).toThrow();
    expect(readFileSync(corruptedPath)).toEqual(corruptedBytes);
  });

  it('recovers the exact concurrent winner and its original normalized time', () => {
    capture();
    const publish = files.publishImmutableFile;
    let racing = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((selectedRoot, segments, bytes, maximum) => {
      if (segments[0] === 'normalizations' && !racing) {
        racing = true;
        new LocalNormalizationStore(root).normalize(request(), '2026-09-05T12:30:00Z');
      }
      return publish(selectedRoot, segments, bytes, maximum);
    });
    const result = new LocalNormalizationStore(root).normalize(request(), NORMALIZED);
    expect(result.status).toBe('EXISTING');
    expect(result.run.normalizedAt).toBe('2026-09-05T12:30:00Z');
    expect(result.run.candidate!.knownAt).toBe('2026-09-05T12:30:00Z');
    expect(readdirSync(join(root, 'normalizations'))).toHaveLength(1);
  });

  it('reports conflict when a different valid concurrent request wins and retains that winner', () => {
    capture();
    const publish = files.publishImmutableFile;
    const other = { ...request(), purpose: 'ALTERNATE_TEST' };
    let racing = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((selectedRoot, segments, bytes, maximum) => {
      if (segments[0] === 'normalizations' && !racing) {
        racing = true;
        new LocalNormalizationStore(root).normalize(other, '2026-09-05T12:30:00Z');
      }
      return publish(selectedRoot, segments, bytes, maximum);
    });
    const store = new LocalNormalizationStore(root);
    expect(() => store.normalize(request(), NORMALIZED)).toThrow('NORMALIZATION_CONFLICT');
    expect(store.inspect(request().normalizationId)?.request.manifest).toEqual(other);
    expect(readdirSync(join(root, 'normalizations'))).toHaveLength(1);
  });

  it('returns an absent inspection without creating directories and requires acquired evidence', () => {
    const store = new LocalNormalizationStore(root);
    expect(store.inspect(request().normalizationId)).toBeUndefined();
    expect(() => store.normalize(request(), NORMALIZED)).toThrow('ACQUISITION_NOT_FOUND');
    expect(existsSync(root)).toBe(false);
  });
});

describe('normalization request parsing', () => {
  it('snapshots the profile without mutating the caller', () => {
    const original = request();
    const parsed = parseNormalizationRequest(original);
    original.profile.version = 'changed';
    expect(parsed.profile.version).toBe('1.0.0');
  });

  it.each([
    null, [], { ...request(), schema: 'unknown' }, { ...request(), audience: 'PUBLIC' },
    { ...request(), normalizationId: '' }, { ...request(), profile: { ...request().profile, executable: 'command' } },
    { ...request(), profile: { ...request().profile, adapterId: 'unknown-adapter' } },
  ])('rejects unsupported schema, fields or adapter before writes', (value) => {
    expect(() => new LocalNormalizationStore(root).normalize(value, NORMALIZED)).toThrow();
    expect(existsSync(root)).toBe(false);
  });
});
