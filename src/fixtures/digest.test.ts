import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FIXTURE_CASES, FIXTURE_CORPORA, FIXTURE_PROFILES } from './index';
import { canonicalJson } from './digest';
import { computeAllDigests, registerKey } from './digestPlan';
import digests from './digests.json';
import { allRulings } from '@/domain/selectors';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('fixture digests are content-addressed and committed', () => {
  const recomputed = computeAllDigests(FIXTURE_PROFILES, FIXTURE_CASES, (o) => sha256(canonicalJson(o)), sha256, {}, FIXTURE_CORPORA);
  const table = digests as Record<string, string>;

  it('every committed digest matches recomputation (no drift)', () => {
    for (const [k, v] of Object.entries(recomputed)) {
      expect(table[k], `digest for ${k} — run npm run stamp:digests`).toBe(v);
    }
    expect(Object.keys(table).sort()).toEqual(Object.keys(recomputed).sort());
  });

  it('no fixture carries an unstamped placeholder', () => {
    const json = JSON.stringify({ cases: FIXTURE_CASES, profiles: FIXTURE_PROFILES });
    expect(json).not.toContain('unstamped:');
    expect(json).not.toContain('__REGISTER_DIGEST__');
  });

  it('profile register digest is the sha256 of its canonical invariant list', () => {
    for (const p of FIXTURE_PROFILES) {
      expect(p.registerDigest).toBe(sha256(canonicalJson(p.invariants)));
      expect(p.registerDigest).toBe(table[registerKey(p)]);
    }
  });

  it('every ruling carries the register digest of its profile version', () => {
    for (const c of FIXTURE_CASES) {
      const p = FIXTURE_PROFILES.find((x) => x.profileId === c.profileId && x.version === c.profileVersion)!;
      for (const r of allRulings(c)) expect(r.registerDigest).toBe(p.registerDigest);
    }
  });

  it('every evidence artifact carries a 64-hex content hash', () => {
    for (const c of FIXTURE_CASES) for (const e of c.evidence) expect(e.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
