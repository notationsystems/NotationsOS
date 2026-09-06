import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { DOMAINS } from './domains';
import { IDENTITY_LINK_PREDICATE } from './corpus';
import { CROSS_LINE_JOIN, CORE_STATE_LABEL, FAMILY_STATE_LABEL, IDENTIFIER_FAMILIES, IDENTITY_CORE, JOIN_KEYS, identityStanding } from './identity';

describe('one identity core, per-line identifier families, one join', () => {
  it('states every core facility once, labelled, with the missing half named', () => {
    const ids = IDENTITY_CORE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of IDENTITY_CORE) {
      expect(CORE_STATE_LABEL[f.state]).toBeTruthy();
      expect(f.obligation.trim().length).toBeGreaterThan(40);
      // Anything not fully present must say what it costs.
      if (f.state !== 'PRESENT') expect(f.missing?.trim().length ?? 0).toBeGreaterThan(30);
      else expect(f.missing).toBeUndefined();
    }
  });

  it('gives every domain product a family and says why it is line-specific', () => {
    expect(IDENTIFIER_FAMILIES.map((f) => f.domain).sort()).toEqual(DOMAINS.map((d) => d.id).sort());
    for (const family of IDENTIFIER_FAMILIES) {
      expect(family.identifiers.length).toBeGreaterThan(0);
      expect(family.whyLineSpecific.trim().length).toBeGreaterThan(40);
      for (const i of family.identifiers) expect(FAMILY_STATE_LABEL[i.state]).toBeTruthy();
    }
  });

  it('marks identifiers IN_USE only for the line that has records', () => {
    const inUse = IDENTIFIER_FAMILIES.filter((f) => f.identifiers.some((i) => i.state === 'IN_USE'));
    expect(inUse.map((f) => f.domain)).toEqual(['CARAVAN']);
  });

  it('keeps the cross-line join absent and names exactly what it needs', () => {
    expect(CROSS_LINE_JOIN.state).toBe('ABSENT');
    expect(CROSS_LINE_JOIN.requires.length).toBe(3);
    expect(CROSS_LINE_JOIN.requires.join(' ')).toMatch(/resolution decision/i);
    expect(CROSS_LINE_JOIN.discipline).toMatch(/evidence-bearing mappings/);
  });

  it('gives every join key its hazard, so a cheap join is not mistaken for a real one', () => {
    for (const key of JOIN_KEYS) expect(key.hazard.trim().length).toBeGreaterThan(40);
    const spatial = JOIN_KEYS.find((k) => k.id === 'SPATIAL_CELL')!;
    expect(spatial.state).toBe('ABSENT');
    expect(spatial.hazard).toMatch(/not a relationship/);
    const resolved = JOIN_KEYS.find((k) => k.id === 'RESOLVED_ENTITY')!;
    expect(resolved.hazard).toMatch(/matching name is not a resolution/);
    // Time is the one key the corpus can already compute, because both clocks exist.
    expect(JOIN_KEYS.find((k) => k.id === 'TIME_INTERVAL')!.state).toBe('PRESENT');
  });

  it('counts identity standing from the corpus without asserting beyond it', () => {
    const standing = identityStanding(CARAVAN_CORPUS);
    expect(standing.linkPredicate).toBe(IDENTITY_LINK_PREDICATE);
    expect(standing.subjects).toBeGreaterThan(0);
    expect(standing.links).toBeGreaterThan(0);
    expect(standing.linkedSubjects.length).toBeGreaterThan(0);
    for (const id of standing.linkedSubjects) {
      expect(CARAVAN_CORPUS.records.some((r) => r.subjectId === id && r.predicate === IDENTITY_LINK_PREDICATE)).toBe(true);
    }
  });
});
