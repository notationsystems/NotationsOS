import { describe, expect, it } from 'vitest';
import { NON_CLAIM_LABEL, PRODUCTION_BOUNDARY, cutoffChecks, nonClaims, refusalCode, refusalMeaning, type LocalCandidateBuild } from './production';

describe('production view model', () => {
  it('lists only the false-valued non-claims a record carries, in a fixed order', () => {
    expect(nonClaims({ sourceTruthClaimed: false, canonicalAdmission: false, other: false, independentlyVerified: true })).toEqual([
      { key: 'canonicalAdmission', label: NON_CLAIM_LABEL.canonicalAdmission },
      { key: 'sourceTruthClaimed', label: NON_CLAIM_LABEL.sourceTruthClaimed },
    ]);
    expect(nonClaims({})).toEqual([]);
  });

  it('reads the refusal code as the first token and explains it without inventing one', () => {
    expect(refusalCode('MEMBER_AFTER_CUTOFF: demo-x.')).toBe('MEMBER_AFTER_CUTOFF');
    expect(refusalMeaning('MEMBER_AFTER_CUTOFF: demo-x.')).toMatch(/cutoff is not advanced/);
    expect(refusalCode('no colon')).toBe('no colon');
    expect(refusalMeaning('SOMETHING_ELSE: x')).toMatch(/wrote nothing/);
  });

  it('checks knowledge time member by member: knownAt ≤ cutoff ≤ builtAt', () => {
    const build = {
      knownThrough: '2026-09-05T00:30:00.000Z', builtAt: '2026-09-05T01:00:00.000Z',
      members: [
        { normalization: { id: 'a', digest: 'd' }, knownAt: '2026-09-05T00:10:00.000Z' },
        { normalization: { id: 'b', digest: 'd' }, knownAt: '2026-09-05T00:45:00.000Z' },
      ],
    } as unknown as LocalCandidateBuild;
    expect(cutoffChecks(build).map((c) => [c.normalizationId, c.withinCutoff])).toEqual([['a', true], ['b', false]]);
  });

  it('states the boundary in the terms the mandate uses', () => {
    const text = PRODUCTION_BOUNDARY.join(' ');
    for (const phrase of ['UNADMITTED', 'Canonical admission', 'any corpus release', '/api/v1', 'MCP tools', 'canonicalId is null', 'Source truth', 'operator declaration']) expect(text).toContain(phrase);
  });
});
