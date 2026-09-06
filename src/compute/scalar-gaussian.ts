/**
 * Bounded scalar linear-Gaussian model, not sensor fusion or admission authority.
 *
 * Caller-declared factor noises are independent, zero-mean Gaussian with known
 * variances in m². ABSOLUTE measures x; RELATIVE measures x[to] - x[from].
 * The returned covariance is the full inverse information matrix, conditional
 * on those declarations. Residuals do not estimate or rescale the noise.
 *
 * Solve D^-1 H D^-1 using Cholesky, where D[i] = sqrt(H[i,i]). Refuse a
 * normalized pivot <= 1e-12 or an infinity-norm condition estimate > 1e10.
 * These are conservative numerical refusal thresholds, not added information:
 * no implicit anchor, jitter, damping, or guessed variance is ever introduced.
 */
export type ScalarFactor =
  | { id: string; kind: 'ABSOLUTE'; stateId: string; meanM: number; varianceM2: number }
  | { id: string; kind: 'RELATIVE'; fromStateId: string; toStateId: string; deltaM: number; varianceM2: number };

export type ScalarGaussianSolution = {
  states: Array<{ id: string; meanM: number; varianceM2: number }>;
  covarianceM2: number[][];
  factorResiduals: Array<{ id: string; residualM: number; standardizedResidual: number }>;
  weightedResidualSumSquares: number;
  degreesOfFreedom: number;
};

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MIN_PIVOT = 1e-12;
const MAX_SCALED_CONDITION = 1e10;

export const SCALAR_GAUSSIAN_NUMERICS = Object.freeze({
  solver: 'DIAGONALLY_SCALED_CHOLESKY', covariance: 'FULL_INVERSE_INFORMATION',
  minimumScaledPivotExclusive: MIN_PIVOT, maximumScaledConditionInfinity: MAX_SCALED_CONDITION,
  maximumStates: 16, maximumFactors: 64, minimumVarianceM2: 1e-8, maximumVarianceM2: 1e6,
  maximumAbsoluteMeasurementM: 1e6,
});

function invalid(): never { throw new Error('GAUSSIAN_INVALID_INPUT'); }
function illConditioned(): never { throw new Error('GAUSSIAN_ILL_CONDITIONED'); }
function identifier(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function checkFields(value: unknown, expected: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) invalid();
  // Accessor evaluation is not part of this numerical input contract.
  if (keys.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) invalid();
}

function zeros(size: number): number[][] {
  return Array.from({ length: size }, () => Array<number>(size).fill(0));
}

function normInfinity(matrix: readonly (readonly number[])[]): number {
  return Math.max(...matrix.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)));
}

function cholesky(matrix: number[][]): number[][] {
  const lower = zeros(matrix.length);
  for (let row = 0; row < matrix.length; row++) {
    for (let column = 0; column <= row; column++) {
      let value = matrix[row][column];
      for (let k = 0; k < column; k++) value -= lower[row][k] * lower[column][k];
      if (row === column) {
        if (!Number.isFinite(value) || value <= MIN_PIVOT) illConditioned();
        lower[row][column] = Math.sqrt(value);
      } else {
        lower[row][column] = value / lower[column][column];
      }
    }
  }
  return lower;
}

function solveCholesky(lower: number[][], rhs: readonly number[]): number[] {
  const result = Array<number>(rhs.length).fill(0);
  for (let row = 0; row < rhs.length; row++) {
    let value = rhs[row];
    for (let column = 0; column < row; column++) value -= lower[row][column] * result[column];
    result[row] = value / lower[row][row];
  }
  for (let row = rhs.length - 1; row >= 0; row--) {
    let value = result[row];
    for (let column = row + 1; column < rhs.length; column++) value -= lower[column][row] * result[column];
    result[row] = value / lower[row][row];
  }
  if (result.some((value) => !Number.isFinite(value))) illConditioned();
  return result;
}

/** State and residual output order matches the corresponding input order. */
export function solveScalarGaussian(stateIds: readonly string[], factors: readonly ScalarFactor[]): ScalarGaussianSolution {
  if (!Array.isArray(stateIds) || stateIds.length < 1 || stateIds.length > 16 ||
      !Array.isArray(factors) || factors.length < 1 || factors.length > 64) invalid();
  const indexes = new Map<string, number>();
  for (const id of stateIds) {
    if (!identifier(id) || indexes.has(id)) invalid();
    indexes.set(id, indexes.size);
  }
  const factorIds = new Set<string>();
  const neighbors = stateIds.map(() => new Set<number>());
  const anchored = stateIds.map(() => false);
  for (const factor of factors) {
    if (!factor || typeof factor !== 'object') invalid();
    // Validate the kind descriptor before reading it, so getters are refused.
    const kind = Object.getOwnPropertyDescriptor(factor, 'kind');
    if (!kind || !Object.hasOwn(kind, 'value')) invalid();
    if (kind.value === 'ABSOLUTE') {
      checkFields(factor, ['id', 'kind', 'stateId', 'meanM', 'varianceM2']);
      if (!identifier(factor.stateId) || !indexes.has(factor.stateId) || !boundedNumber(factor.meanM, -1e6, 1e6)) invalid();
      anchored[indexes.get(factor.stateId)!] = true;
    } else if (kind.value === 'RELATIVE') {
      checkFields(factor, ['id', 'kind', 'fromStateId', 'toStateId', 'deltaM', 'varianceM2']);
      if (!identifier(factor.fromStateId) || !identifier(factor.toStateId) ||
          !indexes.has(factor.fromStateId) || !indexes.has(factor.toStateId) ||
          factor.fromStateId === factor.toStateId || !boundedNumber(factor.deltaM, -1e6, 1e6)) invalid();
      const from = indexes.get(factor.fromStateId)!;
      const to = indexes.get(factor.toStateId)!;
      neighbors[from].add(to);
      neighbors[to].add(from);
    } else invalid();
    if (!identifier(factor.id) || factorIds.has(factor.id) || !boundedNumber(factor.varianceM2, 1e-8, 1e6)) invalid();
    factorIds.add(factor.id);
  }

  const visited = new Set<number>();
  for (let start = 0; start < stateIds.length; start++) {
    if (visited.has(start)) continue;
    const pending = [start];
    let hasAnchor = false;
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      hasAnchor ||= anchored[current];
      for (const next of neighbors[current]) if (!visited.has(next)) pending.push(next);
    }
    if (!hasAnchor) throw new Error('GAUSSIAN_UNANCHORED_COMPONENT');
  }

  const information = zeros(stateIds.length);
  const rhs = Array<number>(stateIds.length).fill(0);
  // Stable factor-ID ordering avoids making caller serialization order a
  // summation-order choice; the caller's arrays themselves remain untouched.
  const ordered = [...factors].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  for (const factor of ordered) {
    const weight = 1 / factor.varianceM2;
    if (factor.kind === 'ABSOLUTE') {
      const at = indexes.get(factor.stateId)!;
      information[at][at] += weight;
      rhs[at] += weight * factor.meanM;
    } else {
      const from = indexes.get(factor.fromStateId)!;
      const to = indexes.get(factor.toStateId)!;
      information[from][from] += weight;
      information[to][to] += weight;
      information[from][to] -= weight;
      information[to][from] -= weight;
      rhs[from] -= weight * factor.deltaM;
      rhs[to] += weight * factor.deltaM;
    }
  }
  const scale = information.map((row, at) => Math.sqrt(row[at]));
  const scaled = information.map((row, at) => row.map((value, column) => value / (scale[at] * scale[column])));
  const lower = cholesky(scaled);
  const scaledInverse = zeros(stateIds.length);
  for (let column = 0; column < stateIds.length; column++) {
    const basis = stateIds.map((_, at) => at === column ? 1 : 0);
    const solution = solveCholesky(lower, basis);
    for (let row = 0; row < stateIds.length; row++) scaledInverse[row][column] = solution[row];
  }
  const condition = normInfinity(scaled) * normInfinity(scaledInverse);
  if (!Number.isFinite(condition) || condition > MAX_SCALED_CONDITION) illConditioned();

  const scaledRhs = rhs.map((value, at) => value / scale[at]);
  const scaledMean = solveCholesky(lower, scaledRhs);
  const means = scaledMean.map((value, at) => value / scale[at]);
  const covarianceM2 = scaledInverse.map((row, at) => row.map((value, column) =>
    // Symmetrize only floating-point roundoff from the two triangular solves.
    (value + scaledInverse[column][at]) / (2 * scale[at] * scale[column])));
  const safe = (value: number) => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (means.some((value) => !safe(value)) || covarianceM2.some((row, at) => row.some((value) => !safe(value)) || row[at] <= 0)) illConditioned();

  const factorResiduals = factors.map((factor) => {
    const residualM = factor.kind === 'ABSOLUTE'
      ? means[indexes.get(factor.stateId)!] - factor.meanM
      : means[indexes.get(factor.toStateId)!] - means[indexes.get(factor.fromStateId)!] - factor.deltaM;
    const standardizedResidual = residualM / Math.sqrt(factor.varianceM2);
    if (!safe(residualM) || !safe(standardizedResidual)) illConditioned();
    return { id: factor.id, residualM, standardizedResidual };
  });
  // Sum in factor-ID order for reproducibility without reordering the report.
  const residualById = new Map(factorResiduals.map((factor) => [factor.id, factor.standardizedResidual]));
  let weightedResidualSumSquares = 0;
  let compensation = 0;
  for (const factor of ordered) {
    const residual = residualById.get(factor.id)!;
    const value = residual * residual - compensation;
    const total = weightedResidualSumSquares + value;
    compensation = (total - weightedResidualSumSquares) - value;
    weightedResidualSumSquares = total;
  }
  // Squared residuals may exceed MAX_SAFE_INTEGER without being integer IDs;
  // retain their floating-point meaning, bounded by the declared input limits.
  if (!Number.isFinite(weightedResidualSumSquares) || weightedResidualSumSquares > 1e26) illConditioned();
  return {
    states: stateIds.map((id, at) => ({ id, meanM: means[at], varianceM2: covarianceM2[at][at] })),
    covarianceM2,
    factorResiduals,
    weightedResidualSumSquares,
    degreesOfFreedom: factors.length - stateIds.length,
  };
}
