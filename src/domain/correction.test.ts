import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { AS_OF_CONTRACT, DELIVERY_LEDGER, DERIVED_CLASSES, TAINT_LABEL, TRACEABILITY_LABEL, correctionImpact } from './correction';

const corpus = CARAVAN_CORPUS;
const retractions = corpus.retractions;

describe('correction and recall machinery', () => {
  it('covers every derived artifact class exactly once, each labelled', () => {
    const ids = DERIVED_CLASSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of DERIVED_CLASSES) {
      expect(TRACEABILITY_LABEL[c.traceability]).toBeTruthy();
      expect(c.dependency.trim().length).toBeGreaterThan(30);
      expect(c.toClose.trim().length).toBeGreaterThan(30);
    }
  });

  it('computes the blast radius of every retraction the corpus carries', () => {
    expect(retractions.length).toBeGreaterThan(0);
    for (const retraction of retractions) {
      const impact = correctionImpact(corpus, retraction);
      expect(impact.retractionId).toBe(retraction.retractionId);
      expect(impact.affected.length).toBe(retraction.affectedRecordIds.length);
      expect(impact.classes.length).toBe(DERIVED_CLASSES.length);
      for (const c of impact.classes) expect(TAINT_LABEL[c.taint]).toBeTruthy();
    }
  });

  it('names the rulings the corpus knows relied on a corrected record', () => {
    const withRulings = retractions.find((r) => (r.affectedRulingIds ?? []).length > 0);
    expect(withRulings, 'the demonstration corpus should carry a retraction that reached a ruling').toBeTruthy();
    const impact = correctionImpact(corpus, withRulings!);
    const rulings = impact.classes.find((c) => c.id === 'RULING')!;
    expect(rulings.taint).toBe('TAINTED');
    expect(rulings.identifiers).toEqual(withRulings!.affectedRulingIds);
    expect(rulings.traceability).toBe('RECORDED');
  });

  it('reports a correction as reaching a replacement and a withdrawal as reaching none', () => {
    const correction = retractions.find((r) => r.kind === 'CORRECTION');
    if (correction) {
      const impact = correctionImpact(corpus, correction);
      expect(impact.replacements.length).toBeGreaterThan(0);
    }
    for (const r of retractions.filter((x) => x.kind === 'WITHDRAWAL')) {
      expect(correctionImpact(corpus, r).replacements).toEqual([]);
    }
  });

  /**
   * The point of the module: what cannot be decided is stated, not hidden.
   * If a producer later records one of these dependencies, this test is the
   * one that has to change, which is the intended signal.
   */
  it('states plainly which classes cannot be decided today, and why', () => {
    const impact = correctionImpact(corpus, retractions[0]);
    expect(impact.undetermined).toContain('DELIVERED_RECORD');
    expect(impact.undetermined).toContain('CANDIDATE_BUILD');
    expect(impact.undetermined).toContain('COMPUTE_RUN');
    expect(impact.undetermined).toContain('NOTATION');
    for (const id of impact.undetermined) {
      const c = impact.classes.find((x) => x.id === id)!;
      expect(c.because.trim().length).toBeGreaterThan(30);
    }
  });

  it('keeps a pinned projection clean, because a release does not change under it', () => {
    const impact = correctionImpact(corpus, retractions[0]);
    const projection = impact.classes.find((c) => c.id === 'PROJECTION')!;
    expect(projection.taint).toBe('CLEAN');
    expect(projection.because).toMatch(/pinned/);
  });

  it('specifies the delivery ledger without populating it', () => {
    expect(DELIVERY_LEDGER.state).toBe('SPECIFIED_AND_EMPTY');
    expect(DELIVERY_LEDGER.fields).toContain('recipientId');
    expect(DELIVERY_LEDGER.fields).toContain('deliveredAt');
    expect(DELIVERY_LEDGER.why).toMatch(/no customer exists/i);
    // A populated ledger here would be a fabricated record, so the module must expose no entries at all.
    expect((DELIVERY_LEDGER as Record<string, unknown>).entries).toBeUndefined();
  });

  it('keeps the as-of contract honest on both sides', () => {
    expect(AS_OF_CONTRACT.present.length).toBeGreaterThan(3);
    expect(AS_OF_CONTRACT.absent.length).toBeGreaterThan(0);
    expect(AS_OF_CONTRACT.present.join(' ')).toMatch(/valid time and knowledge time separately/);
    expect(AS_OF_CONTRACT.present.join(' ')).toMatch(/typed refusal/);
    expect(AS_OF_CONTRACT.absent.join(' ')).toMatch(/delivery ledger/);
  });
});
