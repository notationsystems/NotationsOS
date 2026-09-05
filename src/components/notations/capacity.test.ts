import { describe, expect, it } from 'vitest';
import { emptyNotationState, notationCapacity, type StateKernelSnapshot } from '@/state-kernel/types';
import { KERNEL_CONTRACT_LIMITS, capacityOf, levelOf } from './capacity';

function snapshot(revision: number, savedVersion: number, notations = 0, relations = 0): StateKernelSnapshot {
  return { schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: true, savedVersion, savedDigest: null,
    state: { ...emptyNotationState(), revision, notations: Array.from({ length: notations }, (_, i) => ({ id: `n${i}`, title: 't', body: '' })), relations: Array.from({ length: relations }, (_, i) => ({ id: `r${i}`, from: 'n0', to: 'n1', label: 'l' })) },
    capacity: notationCapacity(revision, savedVersion), persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false };
}

describe('workspace capacity', () => {
  it('reads commands and versions from the API-reported capacity, notations and relations from the state under the contract limits, and says which', () => {
    const view = capacityOf(snapshot(10, 2, 3, 1));
    expect(view.source).toBe('API');
    expect(view.rows.map((r) => [r.dimension, r.used, r.limit, r.remaining, r.level, r.source])).toEqual([
      ['commands', 10, 256, 246, 'ok', 'API'], ['versions', 2, 64, 62, 'ok', 'API'], ['notations', 3, 64, 61, 'ok', 'CONTRACT'], ['relations', 1, 128, 127, 'ok', 'CONTRACT'],
    ]);
    expect(view.commandsExhausted).toBe(false);
    expect(view.versionsExhausted).toBe(false);
    expect(view.approaching).toBe(false);
  });

  it('warns at the last sixteen commands or four versions, and reports exhaustion at the limit with recovery stated', () => {
    expect(levelOf(17, 16)).toBe('ok');
    expect(levelOf(16, 16)).toBe('warn');
    expect(levelOf(0, 16)).toBe('full');
    expect(capacityOf(snapshot(240, 1)).rows[0].level).toBe('warn');
    expect(capacityOf(snapshot(240, 1)).approaching).toBe(true);
    expect(capacityOf(snapshot(1, 60)).rows[1].level).toBe('warn');
    const full = capacityOf(snapshot(256, 64));
    expect(full.commandsExhausted).toBe(true);
    expect(full.versionsExhausted).toBe(true);
    expect(full.approaching).toBe(false);
    for (const row of full.rows.filter((r) => r.dimension === 'commands' || r.dimension === 'versions')) {
      expect(row.level).toBe('full');
      expect(row.atLimit).toMatch(/new workspace directory/);
      expect(row.atLimit).toMatch(/not implemented/);
    }
    expect(KERNEL_CONTRACT_LIMITS.commands).toBe(256);
    expect(KERNEL_CONTRACT_LIMITS.versions).toBe(64);
  });
});
