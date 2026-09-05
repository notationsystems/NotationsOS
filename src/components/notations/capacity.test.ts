import { describe, expect, it } from 'vitest';
import { emptyNotationState, type StateKernelSnapshot } from '@/state-kernel/types';
import { KERNEL_CONTRACT_LIMITS, capacityOf, levelOf } from './capacity';

function snapshot(revision: number, savedVersion: number, notations = 0, relations = 0, capacity?: StateKernelSnapshot['capacity']): StateKernelSnapshot {
  return { schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: true, savedVersion, savedDigest: null,
    state: { ...emptyNotationState(), revision, notations: Array.from({ length: notations }, (_, i) => ({ id: `n${i}`, title: 't', body: '' })), relations: Array.from({ length: relations }, (_, i) => ({ id: `r${i}`, from: 'n0', to: 'n1', label: 'l' })) },
    persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false, ...(capacity ? { capacity } : {}) };
}

describe('workspace capacity', () => {
  it('reads usage from the snapshot and limits from the kernel contract when the API reports none, and says so', () => {
    const view = capacityOf(snapshot(10, 2, 3, 1));
    expect(view.source).toBe('CONTRACT');
    expect(view.rows.map((r) => [r.dimension, r.used, r.limit, r.remaining, r.level])).toEqual([
      ['commands', 10, 256, 246, 'ok'], ['versions', 2, 64, 62, 'ok'], ['notations', 3, 64, 61, 'ok'], ['relations', 1, 128, 127, 'ok'],
    ]);
    expect(view.commandsExhausted).toBe(false);
    expect(view.versionsExhausted).toBe(false);
  });

  it('prefers limits and usage the API reports', () => {
    const view = capacityOf(snapshot(10, 2, 0, 0, { commands: { used: 200, limit: 256 }, versions: { used: 60, limit: 64 }, notations: { used: 1, limit: 64 }, relations: { used: 0, limit: 128 } }));
    expect(view.source).toBe('API');
    expect(view.rows.find((r) => r.dimension === 'commands')).toMatchObject({ used: 200, remaining: 56, level: 'ok' });
    expect(view.rows.find((r) => r.dimension === 'versions')).toMatchObject({ used: 60, remaining: 4, level: 'warn' });
  });

  it('warns at ninety percent and reports exhaustion at the limit, with recovery stated', () => {
    expect(levelOf(230, 256)).toBe('ok');
    expect(levelOf(231, 256)).toBe('warn');
    expect(levelOf(256, 256)).toBe('full');
    const full = capacityOf(snapshot(256, 64));
    expect(full.commandsExhausted).toBe(true);
    expect(full.versionsExhausted).toBe(true);
    for (const row of full.rows.filter((r) => r.dimension === 'commands' || r.dimension === 'versions')) {
      expect(row.level).toBe('full');
      expect(row.atLimit).toMatch(/new workspace directory/);
      expect(row.atLimit).toMatch(/not implemented/);
    }
    expect(KERNEL_CONTRACT_LIMITS.commands.limit).toBe(256);
    expect(KERNEL_CONTRACT_LIMITS.versions.limit).toBe(64);
  });
});
