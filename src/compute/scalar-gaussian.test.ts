import { describe, expect, it } from 'vitest';
import { solveScalarGaussian, type ScalarFactor } from './scalar-gaussian';

const absolute = (id = 'anchor', stateId = 'x', meanM = 0, varianceM2 = 1): ScalarFactor =>
  ({ id, kind: 'ABSOLUTE', stateId, meanM, varianceM2 });
const relative = (id = 'edge', fromStateId = 'x', toStateId = 'y', deltaM = 1, varianceM2 = 1): ScalarFactor =>
  ({ id, kind: 'RELATIVE', fromStateId, toStateId, deltaM, varianceM2 });

describe('bounded scalar linear-Gaussian solve', () => {
  it('uses declared inverse variances for two observations of one state', () => {
    const solved = solveScalarGaussian(['x'], [absolute('a', 'x', 1, 4), absolute('b', 'x', 3, 1)]);
    expect(solved.states).toHaveLength(1);
    expect(solved.states[0].id).toBe('x');
    expect(solved.states[0].varianceM2).toBeCloseTo(0.8, 12);
    expect(solved.states[0].meanM).toBeCloseTo(2.6, 12);
    expect(solved.covarianceM2[0][0]).toBeCloseTo(0.8, 12);
    expect(solved.factorResiduals[0].residualM).toBeCloseTo(1.6, 12);
    expect(solved.factorResiduals[0].standardizedResidual).toBeCloseTo(0.8, 12);
    expect(solved.factorResiduals[1].residualM).toBeCloseTo(-0.4, 12);
    expect(solved.factorResiduals[1].standardizedResidual).toBeCloseTo(-0.4, 12);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(0.8, 12);
    expect(solved.degreesOfFreedom).toBe(1);
  });

  it('propagates an anchored chain with nonzero off-diagonal covariance', () => {
    const solved = solveScalarGaussian(['x', 'y'], [absolute('a', 'x', 0, 4), relative('r', 'x', 'y', 10, 9)]);
    expect(solved.states[0].meanM).toBeCloseTo(0, 12);
    expect(solved.states[1].meanM).toBeCloseTo(10, 12);
    expect(solved.covarianceM2[0][0]).toBeCloseTo(4, 12);
    expect(solved.covarianceM2[0][1]).toBeCloseTo(4, 12);
    expect(solved.covarianceM2[1][0]).toBeCloseTo(4, 12);
    expect(solved.covarianceM2[1][1]).toBeCloseTo(13, 12);
    expect(solved.degreesOfFreedom).toBe(0);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(0, 12);
  });

  it('matches a two-anchor closed form without rescaling covariance by residuals', () => {
    const solved = solveScalarGaussian(['x', 'y'], [
      absolute('a', 'x', 0, 4), absolute('b', 'y', 12, 4), relative('r', 'x', 'y', 10, 1),
    ]);
    expect(solved.states[0].meanM).toBeCloseTo(8 / 9, 12);
    expect(solved.states[1].meanM).toBeCloseTo(100 / 9, 12);
    expect(solved.covarianceM2[0][0]).toBeCloseTo(20 / 9, 12);
    expect(solved.covarianceM2[1][1]).toBeCloseTo(20 / 9, 12);
    expect(solved.covarianceM2[0][1]).toBeCloseTo(16 / 9, 12);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(4 / 9, 12);
    expect(solved.degreesOfFreedom).toBe(1);
  });

  it('does not turn exact-fit zero residuals into zero uncertainty', () => {
    const solved = solveScalarGaussian(['x'], [absolute('a', 'x', 2, 4)]);
    expect(solved.states[0].varianceM2).toBeCloseTo(4, 12);
    expect(solved.weightedResidualSumSquares).toBe(0);
    expect(solved.degreesOfFreedom).toBe(0);
  });

  it('keeps covariance conditional on noise declarations, not the measured values', () => {
    const first = solveScalarGaussian(['x'], [absolute('a', 'x', 0, 4), absolute('b', 'x', 0, 1)]);
    const inconsistent = solveScalarGaussian(['x'], [absolute('a', 'x', -1e6, 4), absolute('b', 'x', 1e6, 1)]);
    expect(inconsistent.covarianceM2).toEqual(first.covarianceM2);
    expect(inconsistent.weightedResidualSumSquares).toBeGreaterThan(1e11);
  });

  it('treats independently anchored disconnected components independently', () => {
    const solved = solveScalarGaussian(['x', 'y'], [absolute('a', 'x', 5, 1e-8), absolute('b', 'y', -7, 1e6)]);
    expect(solved.states[0].meanM).toBeCloseTo(5, 12);
    expect(solved.states[1].meanM).toBeCloseTo(-7, 12);
    expect(solved.covarianceM2[0][0]).toBeCloseTo(1e-8, 15);
    expect(solved.covarianceM2[1][1]).toBeCloseTo(1e6, 5);
    expect(solved.covarianceM2[0][1]).toBe(0);
    expect(solved.covarianceM2[1][0]).toBe(0);
  });

  it('handles the maximum bounded state count with accumulated chain covariance', () => {
    const ids = Array.from({ length: 16 }, (_, index) => `x${index}`);
    const factors = [absolute('a', ids[0], 1e6, 1e6),
      ...ids.slice(1).map((id, at) => relative(`r${at}`, ids[at], id, 1e6, 1e6))];
    const solved = solveScalarGaussian(ids, factors);
    expect(solved.states[15].meanM).toBeCloseTo(16e6, 4);
    expect(solved.covarianceM2[15][15]).toBeCloseTo(16e6, 4);
    expect(solved.covarianceM2[3][15]).toBeCloseTo(4e6, 4);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(0, 10);
  });

  it('handles the maximum bounded factor count', () => {
    const solved = solveScalarGaussian(['x'], Array.from({ length: 64 }, (_, index) => absolute(`f${index}`, 'x', 10, 64)));
    expect(solved.states[0].meanM).toBe(10);
    expect(solved.states[0].varianceM2).toBe(1);
    expect(solved.degreesOfFreedom).toBe(63);
  });

  it('preserves state order while permuting means and both covariance axes correctly', () => {
    const factors = [absolute('a', 'x', -2, 4), relative('r1', 'x', 'y', 3, 5), relative('r2', 'y', 'z', -7, 6), absolute('b', 'z', -5, 2)];
    const normal = solveScalarGaussian(['x', 'y', 'z'], factors);
    const permuted = solveScalarGaussian(['z', 'x', 'y'], factors);
    expect(permuted.states.map((state) => state.id)).toEqual(['z', 'x', 'y']);
    const mapping = [2, 0, 1];
    for (let row = 0; row < 3; row++) {
      expect(permuted.states[row].meanM).toBeCloseTo(normal.states[mapping[row]].meanM, 11);
      for (let column = 0; column < 3; column++) {
        expect(permuted.covarianceM2[row][column]).toBeCloseTo(normal.covarianceM2[mapping[row]][mapping[column]], 11);
      }
    }
    expect(permuted.weightedResidualSumSquares).toBeCloseTo(normal.weightedResidualSumSquares, 11);
  });

  it('is reproducible under factor reordering while preserving report order', () => {
    const factors = [absolute('b', 'x', 1, 2), relative('c', 'x', 'y', 8, 4), absolute('a', 'y', 10, 3)];
    const normal = solveScalarGaussian(['x', 'y'], factors);
    const reversed = solveScalarGaussian(['x', 'y'], [...factors].reverse());
    expect(reversed.states).toEqual(normal.states);
    expect(reversed.covarianceM2).toEqual(normal.covarianceM2);
    expect(reversed.weightedResidualSumSquares).toBe(normal.weightedResidualSumSquares);
    expect(reversed.factorResiduals).toEqual([...normal.factorResiduals].reverse());
  });

  it('keeps the relative direction explicit', () => {
    const solved = solveScalarGaussian(['x', 'y'], [absolute('a', 'y', 10, 1), relative('r', 'x', 'y', 3, 1)]);
    expect(solved.states[0].meanM).toBeCloseTo(7, 12);
    expect(solved.states[1].meanM).toBeCloseTo(10, 12);
  });

  it('does not mutate frozen input arrays or factor records', () => {
    const states = Object.freeze(['x', 'y']);
    const factors = Object.freeze([Object.freeze(relative()), Object.freeze(absolute())]);
    const before = JSON.stringify({ states, factors });
    solveScalarGaussian(states, factors);
    expect(JSON.stringify({ states, factors })).toBe(before);
  });

  it('satisfies the information inverse and zero weighted-gradient equations on a loop', () => {
    const solved = solveScalarGaussian(['x', 'y', 'z'], [
      absolute('a', 'x', 2, 2), relative('b', 'x', 'y', 3, 1),
      relative('c', 'y', 'z', 5, 4), relative('d', 'z', 'x', -7, 5), absolute('e', 'z', 11, 10),
    ]);
    const information = [[1.7, -1, -0.2], [-1, 1.25, -0.25], [-0.2, -0.25, 0.55]];
    const rhs = [1 - 3 - 1.4, 3 - 1.25, 1.25 + 1.4 + 1.1];
    for (let row = 0; row < 3; row++) {
      const gradient = information[row].reduce((sum, value, column) => sum + value * solved.states[column].meanM, 0) - rhs[row];
      expect(gradient).toBeCloseTo(0, 12);
      for (let column = 0; column < 3; column++) {
        const product = information[row].reduce((sum, value, at) => sum + value * solved.covarianceM2[at][column], 0);
        expect(product).toBeCloseTo(row === column ? 1 : 0, 12);
      }
    }
  });

  it('returns independent mutable result arrays without altering subsequent solves', () => {
    const first = solveScalarGaussian(['x', 'y'], [absolute(), relative()]);
    first.covarianceM2[0][0] = 100;
    first.states[0].meanM = 100;
    const second = solveScalarGaussian(['x', 'y'], [absolute(), relative()]);
    expect(second.covarianceM2[0][0]).toBeCloseTo(1, 12);
    expect(second.states[0].meanM).toBeCloseTo(0, 12);
    expect(first.covarianceM2[1][0]).toBeCloseTo(1, 12);
  });

  it.each([
    { states: ['x', 'y'], factors: [relative()] },
    { states: ['x', 'y', 'z'], factors: [relative('r1', 'x', 'y'), relative('r2', 'y', 'z'), relative('r3', 'z', 'x')] },
    { states: ['x', 'y'], factors: [absolute()] },
    { states: ['x', 'y', 'z'], factors: [absolute(), relative('r', 'y', 'z')] },
  ])('requires an explicit absolute anchor in every component: $states', ({ states, factors }) => {
    expect(() => solveScalarGaussian(states, factors)).toThrowError(/^GAUSSIAN_UNANCHORED_COMPONENT$/);
  });

  it.each([1e-8, 1e-5])('refuses weak absolute information against strong relative information (%s)', (varianceM2) => {
    expect(() => solveScalarGaussian(['x', 'y'], [absolute('a', 'x', 0, 1e6), relative('r', 'x', 'y', 1, varianceM2)]))
      .toThrowError(/^GAUSSIAN_ILL_CONDITIONED$/);
  });

  it('accepts a strongly differing but numerically qualified precision ratio', () => {
    const solved = solveScalarGaussian(['x', 'y'], [absolute('a', 'x', 0, 1), relative('r', 'x', 'y', 1, 1e-6)]);
    expect(solved.states[0].meanM).toBeCloseTo(0, 7);
    expect(solved.states[1].meanM).toBeCloseTo(1, 7);
    expect(solved.states[0].varianceM2).toBeCloseTo(1, 7);
    expect(solved.states[1].varianceM2).toBeCloseTo(1.000001, 7);
  });

  it('allows floating-point squared residual sums greater than the integer-exact range', () => {
    const solved = solveScalarGaussian(['x'], [absolute('a', 'x', -1e6, 1e-8), absolute('b', 'x', 1e6, 1e-8)]);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(2e20, -6);
    expect(Number.isFinite(solved.weightedResidualSumSquares)).toBe(true);
  });
});

describe('scalar Gaussian contract refusals', () => {
  const invalidSolve = (states: unknown, factors: unknown) =>
    expect(() => solveScalarGaussian(states as string[], factors as ScalarFactor[])).toThrowError(/^GAUSSIAN_INVALID_INPUT$/);

  it.each([null, undefined, {}, 'x', [], Array.from({ length: 17 }, (_, index) => `s${index}`)])('refuses invalid state collections %j', (states) => {
    invalidSolve(states, [absolute()]);
  });
  it.each(['', 'white space', 'a/b', 'a.b', 'é', 'a'.repeat(81), 1, null, undefined])('refuses invalid state IDs %j', (id) => {
    invalidSolve([id], [absolute()]);
  });
  it('refuses duplicate state IDs', () => invalidSolve(['x', 'x'], [absolute()]));
  it('refuses a sparse state array', () => invalidSolve(Array(1), [absolute()]));
  it.each([null, undefined, {}, 'factors', [], Array.from({ length: 65 }, (_, index) => absolute(`f${index}`))])('refuses invalid factor collections %j', (factors) => {
    invalidSolve(['x'], factors);
  });
  it('refuses a sparse factor array', () => invalidSolve(['x'], Array(1)));
  it.each([null, undefined, 1, 'factor', [], {}, { ...absolute(), kind: 'OTHER' }])('refuses invalid factors %j', (factor) => {
    invalidSolve(['x'], [factor]);
  });
  it.each(['', 'white space', 'a/b', 'é', 'a'.repeat(81), 1, null, undefined])('refuses invalid factor IDs %j', (id) => {
    invalidSolve(['x'], [{ ...absolute(), id }]);
  });
  it('accepts the boundary-length ASCII identifier without imposing a namespace prefix', () => {
    const id = `A_-${'z'.repeat(77)}`;
    expect(solveScalarGaussian([id], [absolute(id, id)]).states[0].id).toBe(id);
  });
  it('refuses duplicate factor IDs', () => invalidSolve(['x'], [absolute(), absolute()]));
  it.each([-1, 0, 1e-9, 1e6 + 1, NaN, Infinity, -Infinity, '1', null, undefined])('refuses an invalid variance %j', (varianceM2) => {
    invalidSolve(['x'], [{ ...absolute(), varianceM2 }]);
    invalidSolve(['x', 'y'], [absolute(), { ...relative(), varianceM2 }]);
  });
  it.each([-1e6 - 1, 1e6 + 1, NaN, Infinity, -Infinity, '1', null, undefined])('refuses invalid observed scalar values %j', (value) => {
    invalidSolve(['x'], [{ ...absolute(), meanM: value }]);
    invalidSolve(['x', 'y'], [absolute(), { ...relative(), deltaM: value }]);
  });
  it('does not interpret absent or null variance as a default', () => {
    const { varianceM2: _omitted, ...missing } = absolute();
    void _omitted;
    invalidSolve(['x'], [missing]);
    invalidSolve(['x'], [{ ...absolute(), varianceM2: null }]);
  });
  it('refuses unresolved references on either factor type or either relative endpoint', () => {
    invalidSolve(['x'], [absolute('a', 'unknown')]);
    invalidSolve(['x', 'y'], [absolute(), relative('r', 'unknown', 'y')]);
    invalidSolve(['x', 'y'], [absolute(), relative('r', 'x', 'unknown')]);
  });
  it('refuses self-relative factors even alongside an anchor', () => {
    invalidSolve(['x'], [absolute(), relative('r', 'x', 'x')]);
  });
  it('refuses undeclared fields including held-out/reference values', () => {
    invalidSolve(['x'], [{ ...absolute(), groundTruthM: 1 }]);
    invalidSolve(['x'], [{ ...absolute(), reference: { meanM: 1 } }]);
    invalidSolve(['x', 'y'], [absolute(), { ...relative(), meanM: 1 }]);
  });
  it('refuses symbol fields and exotic prototype records', () => {
    invalidSolve(['x'], [{ ...absolute(), [Symbol('extra')]: 1 }]);
    const inherited = Object.assign(Object.create({ extra: 1 }), absolute());
    invalidSolve(['x'], [inherited]);
  });
  it('refuses accessor inputs without evaluating them', () => {
    let reads = 0;
    const factor = { ...absolute(), get meanM() { reads++; return 0; } };
    invalidSolve(['x'], [factor]);
    const kindAccessor = { ...absolute(), get kind() { reads++; return 'ABSOLUTE'; } };
    invalidSolve(['x'], [kindAccessor]);
    expect(reads).toBe(0);
  });
});
