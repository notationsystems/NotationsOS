import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import declaration from '../../examples/evidence/request.json';
import { byteDigest } from './evidence-capture';
import { MAX_EVIDENCE_BYTES } from './file-object-store';
import { LocalEvidenceIntake, MAX_INTAKE_RECORD_BYTES, parseLocalIntakeManifest } from './local-intake';
import * as files from './local-files';

const STORED = '2026-09-05T12:00:00Z';
const content = Buffer.from('Synthetic local evidence.');
const manifest = () => structuredClone(declaration);
let directory: string;
let root: string;

beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'payload-intake-test-')); root = join(directory, 'evidence'); });
afterEach(() => { vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });

function receiptPath() {
  const key = byteDigest(Buffer.from(declaration.acquisitionId)).slice('sha256:'.length);
  return join(root, 'acquisitions', `${key}.json`);
}

describe('local evidence intake', () => {
  it('persists independently recomputable local metadata and source bytes across instances', () => {
    const result = new LocalEvidenceIntake(root).capture(manifest(), content, STORED);
    expect(result.status).toBe('CREATED');
    expect(result.acquisition).toMatchObject({ mode: 'LOCAL_DEVELOPMENT', policyAuthority: 'OPERATOR_DECLARATION', sourceTruthClaimed: false, canonicalAdmission: false });
    expect(result.acquisition.decision).toMatchObject({ state: 'ALLOWED', request: { operation: 'INGEST', audience: 'INTERNAL', requestedAt: declaration.capturedAt } });
    const reopened = new LocalEvidenceIntake(root);
    expect(reopened.inspect(declaration.acquisitionId)).toEqual(result.acquisition);
    expect(reopened.objects.get(result.acquisition.request.contentDigest)).toEqual(content);
    expect(JSON.parse(readFileSync(receiptPath(), 'utf8'))).toEqual(result.acquisition);
  });

  it('reuses the original receipt and time for an exact retry, regardless of object key order', () => {
    const intake = new LocalEvidenceIntake(root);
    const original = intake.capture(manifest(), content, STORED);
    const reordered = Object.fromEntries(Object.entries(manifest()).reverse());
    const retry = new LocalEvidenceIntake(root).capture(reordered, content, '2026-09-06T12:00:00Z');
    expect(retry).toEqual({ status: 'EXISTING', acquisition: original.acquisition });
    expect(readdirSync(join(root, 'acquisitions'))).toHaveLength(1);
  });

  it.each(['content', 'source policy', 'purpose', 'media', 'capture time', 'evidence id'])('refuses an acquisition id rebound to different %s', (field) => {
    const intake = new LocalEvidenceIntake(root);
    intake.capture(manifest(), content, STORED);
    const before = readFileSync(receiptPath());
    const changed = manifest();
    let bytes = content;
    if (field === 'content') bytes = Buffer.from('different');
    if (field === 'source policy') changed.sourceRegistration.policyVersion = '1.0.1';
    if (field === 'purpose') { changed.purpose = 'DIFFERENT'; changed.sourceRegistration.permittedPurposes.push('DIFFERENT'); }
    if (field === 'media') changed.mediaType = 'application/octet-stream';
    if (field === 'capture time') changed.capturedAt = '2026-09-05T01:00:00Z';
    if (field === 'evidence id') changed.evidenceId = 'another-evidence-id';
    expect(() => intake.capture(changed, bytes, STORED)).toThrow('ACQUISITION_CONFLICT');
    expect(readFileSync(receiptPath())).toEqual(before);
  });

  it.each(['denied operation', 'approval required', 'purpose', 'audience', 'expired', 'before capture', 'empty bytes', 'large bytes', 'large metadata'])('refuses %s without creating files', (defect) => {
    const changed = manifest();
    let bytes = content;
    let storedAt = STORED;
    if (defect === 'denied operation') changed.sourceRegistration.allowedOperations = ['RETRIEVE'];
    if (defect === 'approval required') Object.assign(changed.sourceRegistration, { allowedOperations: [], approvalRequiredOperations: ['INGEST'] });
    if (defect === 'purpose') changed.purpose = 'PROPRIETARY_RESEARCH';
    if (defect === 'audience') changed.sourceRegistration.allowedAudiences = ['CUSTOMER'];
    if (defect === 'expired') Object.assign(changed.sourceRegistration, { effectiveUntil: changed.capturedAt });
    if (defect === 'before capture') storedAt = '2026-09-04T12:00:00Z';
    if (defect === 'empty bytes') bytes = Buffer.alloc(0);
    if (defect === 'large bytes') bytes = Buffer.alloc(MAX_EVIDENCE_BYTES + 1);
    if (defect === 'large metadata') changed.sourceRegistration.displayName = 'x'.repeat(MAX_INTAKE_RECORD_BYTES);
    expect(() => new LocalEvidenceIntake(root).capture(changed, bytes, storedAt)).toThrow();
    expect(existsSync(root)).toBe(false);
  });

  it('allows duplicate bytes under distinct acquisitions without merging source identity', () => {
    const intake = new LocalEvidenceIntake(root);
    const first = intake.capture(manifest(), content, STORED);
    const secondManifest = manifest();
    secondManifest.acquisitionId += '-second';
    secondManifest.evidenceId += '-second';
    secondManifest.sourceRegistration.sourceId += '-second';
    const second = intake.capture(secondManifest, content, STORED);
    expect(first.acquisition.request.contentDigest).toBe(second.acquisition.request.contentDigest);
    expect(first.acquisition.capture.evidence.sourceId).not.toBe(second.acquisition.capture.evidence.sourceId);
    expect(readdirSync(join(root, 'acquisitions'))).toHaveLength(2);
    expect(readdirSync(join(intake.objects.root, 'sha256', first.acquisition.request.contentDigest.slice(7, 9)))).toHaveLength(1);
  });

  it('returns undefined for absent metadata without creating a store', () => {
    expect(new LocalEvidenceIntake(root).inspect(declaration.acquisitionId)).toBeUndefined();
    expect(existsSync(root)).toBe(false);
  });

  it.each(['invalid JSON', 'changed source', 'altered receipt', 'digest mismatch', 'authority promotion'])('preserves and refuses %s in a stored acquisition', (defect) => {
    const intake = new LocalEvidenceIntake(root);
    const saved = intake.capture(manifest(), content, STORED).acquisition;
    if (defect === 'changed source') saved.request.manifest.sourceRegistration.sourceId = 'another-source';
    if (defect === 'altered receipt') saved.capture.receipt.storedAt = '2026-09-04T12:00:00Z';
    if (defect === 'digest mismatch') saved.digest = `sha256:${'0'.repeat(64)}`;
    if (defect === 'authority promotion') Object.assign(saved, { canonicalAdmission: true });
    const corruption = defect === 'invalid JSON' ? '{broken' : JSON.stringify(saved);
    writeFileSync(receiptPath(), corruption);
    expect(() => intake.inspect(declaration.acquisitionId)).toThrow();
    expect(() => intake.capture(manifest(), content, STORED)).toThrow();
    expect(readFileSync(receiptPath(), 'utf8')).toBe(corruption);
  });

  it('refuses missing or corrupt source bytes without changing the receipt', () => {
    const intake = new LocalEvidenceIntake(root);
    const saved = intake.capture(manifest(), content, STORED).acquisition;
    const objectPath = join(intake.objects.root, saved.capture.evidence.storageKey);
    const receipt = readFileSync(receiptPath());
    writeFileSync(objectPath, 'corrupt');
    expect(() => intake.inspect(declaration.acquisitionId)).toThrow('digest');
    expect(() => intake.capture(manifest(), content, STORED)).toThrow();
    expect(readFileSync(objectPath, 'utf8')).toBe('corrupt');
    rmSync(objectPath);
    expect(() => intake.inspect(declaration.acquisitionId)).toThrow('do not verify');
    expect(readFileSync(receiptPath())).toEqual(receipt);
  });

  it('keeps verified but unreferenced bytes after metadata publication fails, then recovers on retry', () => {
    const publish = files.publishImmutableFile;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((selectedRoot, segments, bytes, maximum) => {
      if (segments[0] === 'acquisitions') throw new Error('Metadata disk failure');
      return publish(selectedRoot, segments, bytes, maximum);
    });
    const intake = new LocalEvidenceIntake(root);
    expect(() => intake.capture(manifest(), content, STORED)).toThrow('Metadata disk failure');
    expect(intake.inspect(declaration.acquisitionId)).toBeUndefined();
    expect(intake.objects.get(byteDigest(content))).toEqual(content);
    vi.restoreAllMocks();
    expect(intake.capture(manifest(), content, STORED).status).toBe('CREATED');
  });

  it('recovers the winner when another process publishes the same acquisition at another storedAt', () => {
    const publish = files.publishImmutableFile;
    let racing = false;
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((selectedRoot, segments, bytes, maximum) => {
      if (segments[0] === 'acquisitions' && !racing) {
        racing = true;
        new LocalEvidenceIntake(root).capture(manifest(), content, '2026-09-05T11:00:00Z');
      }
      return publish(selectedRoot, segments, bytes, maximum);
    });
    const result = new LocalEvidenceIntake(root).capture(manifest(), content, STORED);
    expect(result.status).toBe('EXISTING');
    expect(result.acquisition.capture.receipt.storedAt).toBe('2026-09-05T11:00:00Z');
    expect(readdirSync(join(root, 'acquisitions'))).toHaveLength(1);
  });

  it('hashes opaque acquisition ids rather than treating them as filesystem paths', () => {
    const input = manifest();
    input.acquisitionId = '../../outside';
    const intake = new LocalEvidenceIntake(root);
    intake.capture(input, content, STORED);
    expect(intake.inspect(input.acquisitionId)?.request.manifest.acquisitionId).toBe('../../outside');
    expect(readdirSync(join(root, 'acquisitions'))[0]).toMatch(/^[a-f0-9]{64}\.json$/);
    expect(readdirSync(directory)).toEqual(['evidence']);
  });

  it('reports the same acquisition conflict if a different concurrent request wins publication', () => {
    const publish = files.publishImmutableFile;
    let racing = false;
    const otherBytes = Buffer.from('Different concurrent evidence.');
    vi.spyOn(files, 'publishImmutableFile').mockImplementation((selectedRoot, segments, bytes, maximum) => {
      if (segments[0] === 'acquisitions' && !racing) {
        racing = true;
        new LocalEvidenceIntake(root).capture(manifest(), otherBytes, STORED);
      }
      return publish(selectedRoot, segments, bytes, maximum);
    });
    const intake = new LocalEvidenceIntake(root);
    expect(() => intake.capture(manifest(), content, STORED)).toThrow('ACQUISITION_CONFLICT');
    expect(intake.inspect(declaration.acquisitionId)?.request.contentDigest).toBe(byteDigest(otherBytes));
  });
});

describe('local intake request parsing', () => {
  it('snapshots the declared registration without altering the caller', () => {
    const original = manifest();
    const parsed = parseLocalIntakeManifest(original);
    original.sourceRegistration.policyVersion = 'changed';
    expect(parsed.sourceRegistration.policyVersion).toBe('1.0.0');
  });

  it.each([
    null, [], { ...declaration, schema: 'unknown' }, { ...declaration, audience: 'CUSTOMER' },
    { ...declaration, acquisitionId: '' }, { ...declaration, capturedAt: 'yesterday' },
    { ...declaration, sourceRegistration: { ...declaration.sourceRegistration, unknownGrant: true } },
    { ...declaration, sourceRegistration: { ...declaration.sourceRegistration, retention: { mode: 'INDEFINITE', delete: true } } },
  ])('rejects malformed or unknown request fields', (input) => { expect(() => parseLocalIntakeManifest(input)).toThrow(); });
});
