import { describe, expect, it } from 'vitest';
import { REFERENCE_KINDS, RESOLUTION_MEANING, resolveReference, resolveReferences, type NotationEvidenceReference } from './evidenceReference';
import { FIXTURE_EVIDENCE_REFERENCES, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT } from '@/fixtures/notations/evidenceReferences';

describe('evidence references on notations', () => {
  it('the fixtures show every resolution state exactly once each way, deterministically, with attachment disabled', () => {
    const resolved = resolveReferences(FIXTURE_EVIDENCE_REFERENCES, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT);
    expect(resolved.map((r) => [r.reference.kind, r.resolution.state])).toEqual([
      ['CORPUS_RECORD', 'RESOLVED'], ['CANDIDATE_BUILD', 'RESOLVED'], ['CANDIDATE', 'CHANGED'], ['ACQUISITION', 'UNAVAILABLE'], ['RELEASE', 'UNRESOLVED'],
    ]);
    for (const r of resolved) {
      expect(r.attachment).toBe('DISABLED');
      expect(r.resolution.resolvedAt).toBe(FIXTURE_RESOLVED_AT);
      expect(r.reference.interpretation.text.length).toBeGreaterThan(10);
      expect(RESOLUTION_MEANING[r.resolution.state]).toBeTruthy();
    }
    expect(resolveReferences(FIXTURE_EVIDENCE_REFERENCES, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT)).toEqual(resolved);
    const changed = resolved.find((r) => r.resolution.state === 'CHANGED')!;
    expect(changed.resolution.currentDigest).toMatch(/^sha256:/);
    expect(changed.resolution.currentDigest).not.toBe(changed.reference.digest);
  });

  it('a reference copies nothing and asserts nothing: the resolver reads digests only and never rewrites the reference', () => {
    const ref = FIXTURE_EVIDENCE_REFERENCES[2];
    const before = JSON.stringify(ref);
    resolveReference(ref, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT);
    expect(JSON.stringify(ref)).toBe(before);
    const keys = Object.keys(ref).sort();
    expect(keys).toEqual(['context', 'digest', 'interpretation', 'kind', 'notationId', 'referenceId', 'schema', 'targetId', 'temporal']);
    expect(REFERENCE_KINDS).toContain(ref.kind);
  });

  it('a record reference resolves only inside the release it names, and a record unknown to that release is unavailable', () => {
    const record: NotationEvidenceReference = { ...FIXTURE_EVIDENCE_REFERENCES[0], targetId: 'REC-0401', context: { domain: 'CARAVAN', releaseId: 'REL-CAR-2026.08.11' } };
    expect(resolveReference(record, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT).resolution.state).toBe('UNAVAILABLE');
    const wrongVersion = { ...FIXTURE_EVIDENCE_REFERENCES[0], digest: 'deadbeef' };
    expect(resolveReference(wrongVersion, FIXTURE_REFERENCE_WORLD, FIXTURE_RESOLVED_AT).resolution.state).toBe('CHANGED');
  });
});
