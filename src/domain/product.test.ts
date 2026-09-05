import { describe, expect, it } from 'vitest';
import { ENGINES } from './product';

describe('honest live source presence', () => {
  it('names only the bounded internal Company Census connector as present', () => {
    const data = ENGINES.find((engine) => engine.id === 'data_systems')!;
    expect(data.inThisRepository.find((entry) => entry.item.includes('FMCSA Company Census'))).toMatchObject({
      presence: 'PRESENT', item: expect.stringMatching(/operator-only internal qualification; no customer redistribution or canonical admission/),
    });
    expect(data.inThisRepository.find((entry) => entry.item.startsWith('Production source fleet'))?.presence).toBe('ABSENT');
    expect(data.inThisRepository.find((entry) => entry.item === 'Feed API')?.presence).toBe('FIXTURE');
  });
  it('does not promote the other firm-wide absences through a successful source capture', () => {
    const entries = ENGINES.flatMap((engine) => engine.inThisRepository);
    for (const item of ['Production storage and identity', 'Deployed customer delivery', 'Independent verification', 'A completed pilot', 'Managed execution of customer workloads']) {
      expect(entries.find((entry) => entry.item === item)?.presence).toBe('ABSENT');
    }
  });
});
