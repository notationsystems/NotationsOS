import { describe, expect, it } from 'vitest';
import { CASE_7C104 } from '@/fixtures/caravan/refused-7c104';
import { CASE_5B221 } from '@/fixtures/caravan/admitted-5b221';
import { FIXTURE_CASES } from '@/fixtures';
import {
  ASSURANCE_SEMANTICS,
  STATUS_SEMANTICS,
  highlightsForInvariant,
  isVisible,
  lineagePathFor,
  projectAtKnowledgeTime,
  projectForViewer,
  summarizeQueue,
  tenSecondSummary,
} from './selectors';
import { ASSURANCE_CLASSES, RULING_STATUSES } from './types';

describe('status semantics', () => {
  it('every ruling status has a distinct label, glyph and colour token', () => {
    const labels = new Set(RULING_STATUSES.map((s) => STATUS_SEMANTICS[s].label));
    const glyphs = new Set(RULING_STATUSES.map((s) => STATUS_SEMANTICS[s].glyph));
    const vars = new Set(RULING_STATUSES.map((s) => STATUS_SEMANTICS[s].cssVar));
    expect(labels.size).toBe(RULING_STATUSES.length);
    expect(glyphs.size).toBe(RULING_STATUSES.length);
    expect(vars.size).toBe(RULING_STATUSES.length);
  });

  it('refusal language is scoped and does not imply falsity or misconduct', () => {
    const m = STATUS_SEMANTICS.REFUSED.meaning.toLowerCase();
    expect(m).toContain('not admissible');
    expect(m).toContain('declared use');
    expect(m).toMatch(/not a finding of falsity/);
    expect(m).not.toMatch(/\bfraud\b|\bfalse\b(?! or)|\binvalid\b|\bwrong\b/);
  });

  it('assurance classes are not conflated: each has a distinct label and none is a bare "verified"', () => {
    const labels = ASSURANCE_CLASSES.map((a) => ASSURANCE_SEMANTICS[a].label);
    expect(new Set(labels).size).toBe(ASSURANCE_CLASSES.length);
    expect(labels).not.toContain('Verified');
    expect(ASSURANCE_SEMANTICS.UNVERIFIED_EVALUATION.meaning).toMatch(/no independent, cryptographic or human/i);
    expect(ASSURANCE_SEMANTICS.HUMAN_REVIEWED.meaning).toMatch(/not cryptographic/i);
    expect(ASSURANCE_SEMANTICS.VERIFIED_ATTESTATION.meaning).toMatch(/not external witnessing/i);
  });
});

describe('visibility projection', () => {
  it('a public viewer sees only PUBLIC_RULING objects', () => {
    expect(isVisible('PUBLIC_RULING', 'PUBLIC_RULING')).toBe(true);
    expect(isVisible('COUNTERPARTY_SHARED', 'PUBLIC_RULING')).toBe(false);
    expect(isVisible('PRIVATE_PREFLIGHT', 'PUBLIC_RULING')).toBe(false);
    expect(isVisible('INTERNAL_ONLY', 'PUBLIC_RULING')).toBe(false);
  });

  it('the counterparty projection of the refused case excludes the private contract and the internal reviewer note', () => {
    const p = projectForViewer(CASE_7C104, 'COUNTERPARTY_SHARED');
    expect(p.bundle.evidence.map((e) => e.evidenceId)).not.toContain('EV-CONTRACT-HB-3310');
    expect(p.withheld.evidence).toBe(1);
    const ids = p.bundle.currentRuling!.invariantResults.map((r) => r.invariantId);
    expect(ids).not.toContain('CAR-101/R-02');
    expect(p.bundle.events.some((e) => e.kind === 'REVIEWER_FINDING')).toBe(false);
    // GOV-201's detail is PRIVATE_PREFLIGHT; the counterparty sees only its public summary
    const gov = p.bundle.currentRuling!.invariantResults.find((r) => r.invariantId === 'GOV-201')!;
    expect(gov.summary).toBe('Disclosure policy satisfied.');
    expect(gov.evidenceIds).toEqual([]);
    expect(JSON.stringify(p.bundle)).not.toContain('Price basis');
    expect(JSON.stringify(p.bundle)).not.toContain('rotation B');
  });

  it('the internal projection keeps everything', () => {
    const p = projectForViewer(CASE_7C104, 'INTERNAL_ONLY');
    expect(p.withheld).toEqual({ claims: 0, evidence: 0, events: 0, parties: 0, checks: 0, reducedChecks: 0 });
    expect(p.bundle.currentRuling!.invariantResults.some((r) => r.origin === 'REVIEWER')).toBe(true);
  });
});

describe('knowledge-time projection', () => {
  it('before the custody record was known, the applicable ruling is r1 PENDING_EVIDENCE and later evidence is hidden', () => {
    const k = projectAtKnowledgeTime(CASE_7C104, '2026-08-28T00:00:00Z');
    expect(k.applicableRuling?.rulingId).toBe('RUL-7C104-r1');
    // r1 was later superseded, but at this cutoff it was current
    expect(k.applicableRuling?.status).toBe('PENDING_EVIDENCE');
    expect(k.statusAtCutoff).toBe('PENDING_EVIDENCE');
    expect(k.evidence.map((e) => e.evidenceId)).not.toContain('EV-CUSTODY-MER-0931');
    expect(k.evidence.map((e) => e.evidenceId)).not.toContain('EV-BOL-BAL-77812');
    expect(k.hidden.evidence).toBe(2);
    expect(k.hidden.rulings).toBe(1);
  });

  it('after the refusal, the applicable ruling is r2 REFUSED and all evidence is visible', () => {
    const k = projectAtKnowledgeTime(CASE_7C104, '2026-08-29T10:00:00Z');
    expect(k.applicableRuling?.rulingId).toBe('RUL-7C104-r2');
    expect(k.applicableRuling?.status).toBe('REFUSED');
    expect(k.hidden.evidence).toBe(0);
  });

  it('before the case existed, nothing is known', () => {
    const k = projectAtKnowledgeTime(CASE_7C104, '2026-08-01T00:00:00Z');
    expect(k.claims).toEqual([]);
    expect(k.applicableRuling).toBeUndefined();
    expect(k.statusAtCutoff).toBe('DRAFT');
  });

  it('superseded rulings remain inspectable: the admitted case exposes r1 as previous and r2 as current', () => {
    expect(CASE_5B221.previousRulings.map((r) => r.rulingId)).toEqual(['RUL-5B221-r1']);
    expect(CASE_5B221.previousRulings[0].status).toBe('SUPERSEDED');
    expect(CASE_5B221.currentRuling?.supersedesRulingId).toBe('RUL-5B221-r1');
    const k = projectAtKnowledgeTime(CASE_5B221, '2026-08-20T00:00:00Z');
    expect(k.applicableRuling?.rulingId).toBe('RUL-5B221-r1');
    expect(k.applicableRuling?.status).toBe('ADMITTED');
  });
});

describe('highlight linking', () => {
  it('selecting the failed invariant highlights its affected claims, inspected evidence and broken lineage edges', () => {
    const h = highlightsForInvariant(CASE_7C104, 'CAR-101');
    expect([...h.claimIds]).toEqual(['C-7C104-1', 'C-7C104-3']);
    expect([...h.evidenceIds].sort()).toEqual(['EV-BOL-BAL-77812', 'EV-CERT-NIS-4418', 'EV-CUSTODY-MER-0931']);
    expect(h.brokenEdges.length).toBeGreaterThan(0);
    expect(h.missingEvidence[0]).toMatch(/S-4418/);
    expect([...h.remediationIds]).toEqual(['REM-7C104-1', 'REM-7C104-2', 'REM-7C104-3']);
  });

  it('no selection highlights nothing', () => {
    const h = highlightsForInvariant(CASE_7C104, undefined);
    expect(h.claimIds.size).toBe(0);
  });
});

describe('lineage path', () => {
  it('traces the refused ruling back to source artifacts', () => {
    const p = lineagePathFor(CASE_7C104, 'n:ruling:RUL-7C104-r2');
    const kinds = new Set(p.upstream.map((n) => n.kind));
    expect(kinds.has('SOURCE_ARTIFACT')).toBe(true);
    expect(p.upstream.map((n) => n.refId)).toContain('EV-CERT-NIS-4418');
  });
  it('traces a corrected artifact forward to affected rulings', () => {
    const p = lineagePathFor(CASE_5B221, 'n:art:EV-WEIGHT-WB-2277');
    expect(p.downstream.map((n) => n.refId)).toContain('RUL-5B221-r2');
  });
});

describe('queue summary and ten-second summary', () => {
  it('counts statuses, actions and expiring rulings across fixtures', () => {
    const s = summarizeQueue([...FIXTURE_CASES]);
    expect(s.total).toBe(7);
    expect(s.byStatus.REFUSED).toBe(1);
    expect(s.byStatus.ADMITTED_WITH_CONDITIONS).toBe(1);
    expect(s.byStatus.PENDING_EVIDENCE).toBe(1);
    expect(s.byStatus.REVOKED).toBe(1);
    expect(s.byStatus.DRAFT).toBe(1);
    expect(s.byStatus.ADMITTED).toBe(1);
    expect(s.byStatus.EVALUATING).toBe(1);
    expect(s.nearingExpiry).toBe(1);
    expect(s.requiresAction).toBe(5);
  });
  it('the refused case names the blocking invariant and a required action', () => {
    const t = tenSecondSummary(CASE_7C104);
    expect(t.blockingInvariant?.invariantId).toBe('CAR-101');
    expect(t.requiredAction).toMatch(/CAR-101/);
  });
});
