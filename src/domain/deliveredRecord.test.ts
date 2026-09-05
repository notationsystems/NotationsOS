import { describe, expect, it } from 'vitest';
import { DELIVERED_RECORD_CONTRACT, ENVELOPE_FIELDS, answers, answersAll, valueAt } from './deliveredRecord';
import { asOfPayload, recordsPayload } from '@/adapter/feed';
import { runMcpTool } from '@/mcp/tools';

const RELEASES = ['REL-CAR-2026.08.11', 'REL-CAR-2026.08.25', 'REL-CAR-2026.09.01'];

describe('the delivered-record contract', () => {
  it('asks ten questions, each carried by named fields', () => {
    expect(DELIVERED_RECORD_CONTRACT.questions.map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const q of DELIVERED_RECORD_CONTRACT.questions) expect(q.required.length + q.declared.length, q.question).toBeGreaterThan(0);
  });

  it('every record the feed delivers, on both projections and in both releases, answers all ten', async () => {
    let seen = 0;
    for (const releaseId of RELEASES) for (const viewer of ['COUNTERPARTY_SHARED', 'PUBLIC_RULING'] as const) {
      const payload = await recordsPayload(releaseId, viewer);
      expect(payload, releaseId).toBeDefined();
      for (const path of ENVELOPE_FIELDS) expect(valueAt(payload, path).value, `${releaseId} envelope ${path}`).toBeTruthy();
      for (const r of payload!.records) {
        seen++;
        const a = answers(r);
        expect(a.filter((x) => !x.answered), `${releaseId} ${viewer} ${r.recordId}`).toEqual([]);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('an as-of answer and a tool result are delivered records too', async () => {
    const q = { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-09-01T12:00:00Z' };
    const p = (await asOfPayload('REL-CAR-2026.09.01', q))!;
    expect(p.answer).not.toBeNull();
    expect(answersAll(p.answer!)).toBe(true);
    const t = (await runMcpTool('list_records', { releaseId: 'REL-CAR-2026.09.01' })) as { records: Parameters<typeof answersAll>[0][] };
    for (const r of t.records) expect(answersAll(r), r.recordId).toBe(true);
  });

  it('reports exactly what is missing when a record does not answer', () => {
    const broken = { recordId: 'x', canonicalId: 'notation://x', subject: { subjectId: 's', canonicalId: 'notation://s', subjectType: 'Lot' }, predicate: 'p', title: 't', value: 1, unit: null, evidenceClass: { productionClass: 'computed', claimStrength: 'derived', interest: 'unknown' }, provenance: { sourceId: 'src', transformId: null }, validity: { validFrom: '2026-01-01T00:00:00Z' }, knownAt: '2026-01-01T00:00:00Z', visibility: 'PUBLIC_RULING', rights: null, firstReleaseId: 'R' } as unknown as Parameters<typeof answers>[0];
    const a = answers(broken);
    expect(a.find((x) => x.n === 2)?.undeclared).toEqual(['basis']);
    expect(a.find((x) => x.n === 3)?.missing).toEqual(['provenance.artifactId', 'provenance.contentDigest', 'provenance.storageKey', 'provenance.receiptId', 'rights.sourceId']);
    expect(a.find((x) => x.n === 4)?.missing).toEqual(['basis', 'provenance.producerId']);
    expect(a.find((x) => x.n === 4)?.undeclared).toEqual(['basis', 'provenance.producerId']);
    expect(a.find((x) => x.n === 8)?.answered).toBe(false);
    expect(a.find((x) => x.n === 10)?.undeclared).toEqual(['supersedesRecordId', 'supersededByRecordId', 'retractedByRetractionId']);
  });
});
