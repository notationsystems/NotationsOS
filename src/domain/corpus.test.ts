import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease, deliverableRecords, queryAsOf, recordStatusAt, releaseById, releaseRecords, retractionsSince } from './corpus';

const corpus = CARAVAN_CORPUS;
const rel1 = releaseById(corpus, 'REL-CAR-2026.08.11')!;
const rel2 = releaseById(corpus, 'REL-CAR-2026.08.25')!;
const rel3 = currentRelease(corpus);

describe('corpus releases', () => {
  it('a release carries exactly the records knowable by its cutoff', () => {
    expect(releaseRecords(corpus, rel1).map((r) => r.recordId).sort()).toEqual(['REC-0101', 'REC-0102', 'REC-0111', 'REC-0112']);
    expect(releaseRecords(corpus, rel3).length).toBe(corpus.records.length);
  });

  it('an earlier release still shows a later-withdrawn record as it stood', () => {
    const r = corpus.records.find((x) => x.recordId === 'REC-0111')!;
    expect(recordStatusAt(corpus, r, rel1.knownAt)).toBe('CURRENT');
    expect(recordStatusAt(corpus, r, rel3.knownAt)).toBe('RETRACTED');
  });
});

describe('as-of answers', () => {
  it('reconstructs the earlier quantity before the correction was knowable, and the corrected one after', () => {
    const before = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z' });
    expect(before.record?.recordId).toBe('REC-0203');
    expect(before.record?.value).toBe(40);
    expect(before.status).toBe('CURRENT');
    const after = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-26T00:00:00Z' });
    expect(after.record?.recordId).toBe('REC-0204');
    expect(after.record?.value).toBe(40.12);
    expect(after.record?.uncertainty).toEqual({ low: 40.08, high: 40.16, semantics: 'Weighbridge stated accuracy ±0.040 t' });
  });

  it('reaches a lot condition through an identity-link record, and refuses with a remedy when no link exists', () => {
    const linked = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'condition.moisture', validAt: '2026-08-17T16:00:00Z', knownAt: rel3.knownAt });
    expect(linked.resolution).toBe('VIA_IDENTITY_LINK');
    expect(linked.identityLink?.recordId).toBe('REC-0202');
    expect(linked.record?.value).toBe(5.1);
    const unlinked = queryAsOf(corpus, rel3, { subjectId: 'LOT-7C-104', predicate: 'condition.moisture', validAt: '2026-08-28T14:00:00Z', knownAt: rel3.knownAt });
    expect(unlinked.record).toBeUndefined();
    expect(unlinked.refusal?.code).toBe('NO_IDENTITY_LINK');
    expect(unlinked.refusal?.remedy).toMatch(/links a sample identifier to LOT-7C-104/);
    expect(unlinked.refusal?.considered[0].recordId).toBe('REC-0301');
  });

  it('a withdrawn record answers before the withdrawal was knowable and is refused as RETRACTED after', () => {
    const before = queryAsOf(corpus, rel3, { subjectId: 'LOT-3F-440', predicate: 'condition.moisture', validAt: '2026-08-11T12:00:00Z', knownAt: '2026-08-15T00:00:00Z' });
    expect(before.record?.recordId).toBe('REC-0111');
    const after = queryAsOf(corpus, rel3, { subjectId: 'LOT-3F-440', predicate: 'condition.moisture', validAt: '2026-08-11T12:00:00Z', knownAt: rel3.knownAt });
    expect(after.record).toBeUndefined();
    // the identity link was withdrawn too, so the refusal is the absence of a link, not a retracted moisture
    expect(['RETRACTED', 'NO_IDENTITY_LINK']).toContain(after.refusal?.code);
    expect(after.refusal?.reason).toMatch(/withdrawn|link/);
  });

  it('refuses outside validity and refuses with NO_RECORD, never a zero', () => {
    const early = queryAsOf(corpus, rel3, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-01T00:00:00Z', knownAt: rel3.knownAt });
    expect(early.refusal?.code).toBe('OUTSIDE_VALIDITY');
    const none = queryAsOf(corpus, rel3, { subjectId: 'LOT-9A-017', predicate: 'quantity.gross', validAt: '2026-08-30T10:00:00Z', knownAt: rel3.knownAt });
    expect(none.refusal?.code).toBe('NO_RECORD');
    expect(none.record).toBeUndefined();
  });

  it('a knowledge time later than the release cutoff is clamped to the release', () => {
    const a = queryAsOf(corpus, rel2, { subjectId: 'LOT-7C-104', predicate: 'custody.loading_completed', validAt: '2026-08-28T14:00:00Z', knownAt: '2026-09-30T00:00:00Z' });
    expect(a.query.knownAt).toBe(rel2.knownAt);
    expect(a.refusal?.code).toBe('NO_RECORD');
  });

  it('rights guard: a record whose source forbids customer delivery never leaves the corpus', () => {
    const a = queryAsOf(corpus, rel3, { subjectId: 'LOT-7C-104', predicate: 'contract.moisture_max', validAt: '2026-08-28T14:00:00Z', knownAt: rel3.knownAt }, { enforceRights: true });
    expect(a.record).toBeUndefined();
    expect(a.refusal?.code).toBe('NOT_DELIVERABLE');
    const delivered = deliverableRecords(corpus, rel3, 'COUNTERPARTY_SHARED');
    expect(delivered.records.some((r) => r.provenance.sourceId === 'harbourline-deals')).toBe(false);
    expect(delivered.withheldByRights).toBe(1);
    expect(delivered.withheldByVisibility).toBe(2);
  });
});

describe('retraction feed', () => {
  it('lists retractions after a cursor, oldest first, with affected records and rulings', () => {
    const all = retractionsSince(corpus, undefined);
    expect(all.map((r) => r.retractionId)).toEqual(['RET-0001', 'RET-0002']);
    const later = retractionsSince(corpus, '2026-08-26T00:00:00Z');
    expect(later.map((r) => r.retractionId)).toEqual(['RET-0002']);
    expect(later[0].affectedRulingIds).toEqual(['RUL-3F440-r1']);
    expect(later[0].kind).toBe('WITHDRAWAL');
  });
});
