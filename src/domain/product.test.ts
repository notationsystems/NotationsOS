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
  it('distinguishes the offline-tested Samsara adapter from a connected fleet or inferred visits', () => {
    const data = ENGINES.find((engine) => engine.id === 'data_systems')!;
    expect(data.inThisRepository.find((entry) => entry.item.startsWith('Samsara single-vehicle'))).toMatchObject({
      presence: 'PRESENT', item: expect.stringContaining('offline-tested; live fleet qualification, continuous sync and inferred visits remain absent'),
    });
    expect(data.inThisRepository.find((entry) => entry.item === 'Feed API')?.presence).toBe('FIXTURE');
  });
  it('states source normalization and membership as internal unadmitted production, not a live customer feed', () => {
    const data = ENGINES.find((engine) => engine.id === 'data_systems')!;
    expect(data.inThisRepository.find((entry) => entry.item.startsWith('FMCSA typed normalization'))).toMatchObject({
      presence: 'PRESENT', item: expect.stringMatching(/operator CLI only, UNADMITTED, outside customer feeds/),
    });
    expect(data.inThisRepository.find((entry) => entry.item === 'Feed API')?.presence).toBe('FIXTURE');
  });
  it('labels the scalar baseline as local and synthetic without claiming hosted or validated prediction', () => {
    const compute = ENGINES.find((e) => e.id === 'compute')!;
    expect(compute.inThisRepository.find((e) => e.item.startsWith('Local scalar linear-Gaussian'))).toMatchObject({
      presence: 'PRESENT', item: expect.stringContaining('synthetic demonstration, not field validation'),
    });
    expect(compute.inThisRepository.find((e) => e.item.startsWith('Trained neural models'))?.presence).toBe('ABSENT');
    expect(compute.inThisRepository.find((e) => e.item === 'Managed execution of customer workloads')?.presence).toBe('ABSENT');
  });
  it('links the spatial instrument without promoting the synthetic experiment to validated routing', () => {
    const compute = ENGINES.find((e) => e.id === 'compute')!;
    expect(compute.inThisRepository.find((e) => e.item.startsWith('Local weighted rigid registration'))).toMatchObject({
      presence: 'PRESENT', where: '/compute/registration', item: expect.stringContaining('not physical validation or live routing'),
    });
  });
});
