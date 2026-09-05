import { describe, expect, it } from 'vitest';
import { CARAVAN_LOT_STATE, INFORMATION_PRODUCTS } from './informationProduct';
import { answersAll } from './deliveredRecord';
import { CUSTOMER_CATEGORIES } from './product';
import { CARAVAN_CORPUS, CARAVAN_RELEASES } from '@/fixtures/caravan/release';
import { asOfPayload } from '@/adapter/feed';

const product = CARAVAN_LOT_STATE;

describe('the first information product, held to the demonstration corpus', () => {
  it('names customers that exist and fields that cover the whole corpus', () => {
    expect(INFORMATION_PRODUCTS).toHaveLength(1);
    const categories = new Set(CUSTOMER_CATEGORIES.map((c) => c.id));
    for (const c of product.customerCategories) expect(categories.has(c), c).toBe(true);
    const specified = new Set(product.fields.map((f) => f.predicate));
    const inCorpus = new Set(CARAVAN_CORPUS.records.map((r) => r.predicate));
    expect([...inCorpus].sort()).toEqual([...specified].sort());
    const subjectTypes = new Set(product.subjects.map((s) => s.subjectType));
    for (const r of CARAVAN_CORPUS.records) expect(subjectTypes.has(r.subjectType), r.recordId).toBe(true);
  });

  it('every released record of every field meets the stated evidence requirement, on the stated subject type, in the stated unit', () => {
    const violations: string[] = [];
    for (const r of CARAVAN_CORPUS.records) {
      const f = product.fields.find((x) => x.predicate === r.predicate)!;
      if (!f.subjectTypes.includes(r.subjectType)) violations.push(`${r.recordId}: subject ${r.subjectType}`);
      if (f.unit && r.unit !== f.unit) violations.push(`${r.recordId}: unit ${r.unit}`);
      if (!f.acceptable.productionClass.includes(r.evidenceClass.productionClass)) violations.push(`${r.recordId}: productionClass ${r.evidenceClass.productionClass}`);
      if (!f.acceptable.claimStrength.includes(r.evidenceClass.claimStrength)) violations.push(`${r.recordId}: claimStrength ${r.evidenceClass.claimStrength}`);
      if (!f.acceptable.interest.includes(r.evidenceClass.interest)) violations.push(`${r.recordId}: interest ${r.evidenceClass.interest}`);
      if (r.evidenceClass.productionClass === 'derived' && !r.provenance.transformId) violations.push(`${r.recordId}: derived without a transform`);
      if (r.evidenceClass.productionClass === 'computed' && (!r.basis || !r.provenance.producerId)) violations.push(`${r.recordId}: computed without a stated basis and producer`);
    }
    expect(violations).toEqual([]);
  });

  it('states the freshness, rights and correction behaviour the corpus actually has', () => {
    expect(CARAVAN_RELEASES.map((r) => r.knownAt.slice(0, 10)).sort()).toEqual(['2026-08-12', '2026-08-26', '2026-09-01']);
    for (const release of CARAVAN_RELEASES) for (const s of release.sources) for (const p of product.permittedUses.prohibitedPurposes) expect(s.registration.prohibitedPurposes, `${release.releaseId} ${s.sourceId}`).toContain(p);
    expect([...new Set(CARAVAN_CORPUS.retractions.map((r) => r.kind))].sort()).toEqual([...product.correction.kinds].sort());
    for (const ret of CARAVAN_CORPUS.retractions) {
      for (const id of ret.affectedRecordIds) expect(CARAVAN_CORPUS.records.find((r) => r.recordId === id), id).toBeDefined();
      if (ret.kind === 'CORRECTION') expect(ret.replacementRecordIds?.length ?? 0).toBeGreaterThan(0);
      if (ret.kind === 'WITHDRAWAL') expect(ret.replacementRecordIds ?? []).toEqual([]);
    }
  });

  it('answers the customer question through the feed as a delivered record, at two knowledge times, without erasing the earlier answer', async () => {
    const q = { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z' };
    const early = (await asOfPayload('REL-CAR-2026.09.01', { ...q, knownAt: '2026-08-20T00:00:00Z' }))!;
    const late = (await asOfPayload('REL-CAR-2026.09.01', { ...q, knownAt: '2026-09-01T12:00:00Z' }))!;
    expect(early.answer).not.toBeNull();
    expect(late.answer).not.toBeNull();
    expect(answersAll(early.answer!)).toBe(true);
    expect(answersAll(late.answer!)).toBe(true);
    expect(early.answer!.rights?.deliveryDecision?.state).toBe('ALLOWED');
    expect(early.answer!.recordId).not.toBe(late.answer!.recordId);
    expect(late.answer!.supersedesRecordId).toBe(early.answer!.recordId);
  });

  it('marks the acceptance target honestly: the two reached steps and the missing bridge', () => {
    expect(product.acceptance.map((a) => a.reachedHere)).toEqual([true, false, false, true]);
  });
});
