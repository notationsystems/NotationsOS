import { transformPoint, type Quaternion, type RigidTransform, type Vec3 } from '../observation/rigid';

/** Matched controls; source coordinates are exact, target error is independent isotropic Gaussian. */
export type RigidRegistrationControl = { id: string; sourceM: Vec3; targetM: Vec3; varianceM2: number };

const PARAMETER_ORDER = Object.freeze([
  'rotationXRad', 'rotationYRad', 'rotationZRad',
  'centroidTranslationXM', 'centroidTranslationYM', 'centroidTranslationZM',
] as const);
const MAX_COORDINATE_M = 1e6;
const MIN_VARIANCE_M2 = 1e-8;
const MAX_VARIANCE_M2 = 1e6;
const MIN_SOURCE_RMS_M = 1e-6;
const MIN_SECOND_SCATTER_RATIO = 1e-8;
const MIN_HORN_GAP = 1e-10;
const MIN_SCALED_PIVOT = 1e-12;
const MAX_SCALED_CONDITION = 1e10;
const JACOBI_TOLERANCE = 2e-15;
const JACOBI_MAX_ROTATIONS = 256;

export const RIGID_REGISTRATION_NUMERICS = Object.freeze({
  solver: 'WEIGHTED_HORN_SYMMETRIC_JACOBI',
  covariance: 'LOCAL_GAUSS_NEWTON_INVERSE_INFORMATION',
  covarianceParameterization: 'TARGET_FRAME_ROTATION_AT_WEIGHTED_SOURCE_CENTROID_AND_CENTROID_TRANSLATION',
  covarianceParameterOrder: PARAMETER_ORDER,
  minimumControls: 3, maximumControls: 64,
  maximumAbsoluteCoordinateM: MAX_COORDINATE_M,
  minimumVarianceM2: MIN_VARIANCE_M2, maximumVarianceM2: MAX_VARIANCE_M2,
  minimumSourceRmsMExclusive: MIN_SOURCE_RMS_M,
  minimumSourceScatterSecondToFirstRatioExclusive: MIN_SECOND_SCATTER_RATIO,
  minimumHornRelativeEigenGapExclusive: MIN_HORN_GAP,
  minimumScaledPivotExclusive: MIN_SCALED_PIVOT,
  maximumScaledConditionInfinity: MAX_SCALED_CONDITION,
  jacobiRelativeOffDiagonalTolerance: JACOBI_TOLERANCE,
  jacobiMaximumRotations: JACOBI_MAX_ROTATIONS,
} as const);

export type RigidRegistrationSolution = {
  /** Active proper rotation, source -> target; no scale or reflection parameter. */
  transform: RigidTransform;
  sourceCentroidM: Vec3;
  targetCentroidM: Vec3;
  /** Mixed units: rad² rotation block, m² translation block, rad*m cross block. */
  covariance: number[][];
  /** Predicted target - observed target; output retains caller control order. */
  residuals: Array<{ id: string; residualM: Vec3; normM: number; standardizedNorm: number }>;
  weightedResidualSumSquares: number;
  degreesOfFreedom: number;
  numerics: {
    solver: typeof RIGID_REGISTRATION_NUMERICS.solver;
    covariance: typeof RIGID_REGISTRATION_NUMERICS.covariance;
    covarianceParameterization: typeof RIGID_REGISTRATION_NUMERICS.covarianceParameterization;
    covarianceParameterOrder: typeof PARAMETER_ORDER;
    sourceScatterSecondToFirstRatio: number;
    hornRelativeEigenGap: number;
    scaledInformationConditionInfinity: number;
  };
};

function invalid(): never { throw new Error('REGISTRATION_INVALID_INPUT'); }
function degenerate(): never { throw new Error('REGISTRATION_DEGENERATE_GEOMETRY'); }
function illConditioned(): never { throw new Error('REGISTRATION_ILL_CONDITIONED'); }

function closedObject(value: unknown, expected: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) invalid();
  if (keys.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) invalid();
}

/** Only ordinary dense arrays: do not evaluate accessors, iterators or extra fields. */
function denseArray(value: unknown, minLength: number, maxLength: number): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < minLength || value.length > maxLength) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
  }
}

function coordinate(value: unknown): asserts value is Vec3 {
  denseArray(value, 3, 3);
  if (value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry) || Math.abs(entry) > MAX_COORDINATE_M)) invalid();
}

function zeros(size: number): number[][] { return Array.from({ length: size }, () => Array<number>(size).fill(0)); }
function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = sum + adjusted;
    compensation = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}
function difference(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

/** Symmetric largest-off-diagonal Jacobi; scaled first, no power iteration or artificial perturbation. */
function eigenSymmetric(matrix: number[][]): Array<{ value: number; vector: number[] }> {
  const size = matrix.length;
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) degenerate();
  const a = matrix.map((row) => row.map((value) => value / scale));
  const vectors = zeros(size);
  for (let index = 0; index < size; index++) vectors[index][index] = 1;
  let converged = false;
  for (let iteration = 0; iteration < JACOBI_MAX_ROTATIONS; iteration++) {
    let p = 0;
    let q = 1;
    for (let row = 0; row < size; row++) for (let column = row + 1; column < size; column++) {
      if (Math.abs(a[row][column]) > Math.abs(a[p][q])) { p = row; q = column; }
    }
    if (Math.abs(a[p][q]) <= JACOBI_TOLERANCE) { converged = true; break; }
    const tau = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const tangent = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.hypot(1, tau));
    const cosine = 1 / Math.hypot(1, tangent);
    const sine = tangent * cosine;
    const offDiagonal = a[p][q];
    a[p][p] -= tangent * offDiagonal;
    a[q][q] += tangent * offDiagonal;
    a[p][q] = 0;
    a[q][p] = 0;
    for (let row = 0; row < size; row++) {
      if (row !== p && row !== q) {
        const oldP = a[row][p];
        const oldQ = a[row][q];
        a[row][p] = a[p][row] = cosine * oldP - sine * oldQ;
        a[row][q] = a[q][row] = sine * oldP + cosine * oldQ;
      }
      const oldP = vectors[row][p];
      const oldQ = vectors[row][q];
      vectors[row][p] = cosine * oldP - sine * oldQ;
      vectors[row][q] = sine * oldP + cosine * oldQ;
    }
  }
  if (!converged) illConditioned();
  return a.map((row, column) => ({ value: row[column] * scale, vector: vectors.map((vector) => vector[column]) }))
    .sort((left, right) => right.value - left.value);
}

function invertInformation(information: number[][]): { covariance: number[][]; condition: number } {
  const size = information.length;
  const scale = information.map((row, index) => Math.sqrt(row[index]));
  if (scale.some((value) => !Number.isFinite(value) || value <= 0)) illConditioned();
  const scaled = information.map((row, at) => row.map((value, column) => value / (scale[at] * scale[column])));
  const lower = zeros(size);
  for (let row = 0; row < size; row++) for (let column = 0; column <= row; column++) {
    let value = scaled[row][column];
    for (let k = 0; k < column; k++) value -= lower[row][k] * lower[column][k];
    if (row === column) {
      if (!Number.isFinite(value) || value <= MIN_SCALED_PIVOT) illConditioned();
      lower[row][column] = Math.sqrt(value);
    } else lower[row][column] = value / lower[column][column];
  }
  const inverse = zeros(size);
  for (let column = 0; column < size; column++) {
    const result = Array<number>(size).fill(0);
    for (let row = 0; row < size; row++) {
      let value = row === column ? 1 : 0;
      for (let k = 0; k < row; k++) value -= lower[row][k] * result[k];
      result[row] = value / lower[row][row];
    }
    for (let row = size - 1; row >= 0; row--) {
      let value = result[row];
      for (let k = row + 1; k < size; k++) value -= lower[k][row] * result[k];
      result[row] = value / lower[row][row];
    }
    for (let row = 0; row < size; row++) inverse[row][column] = result[row];
  }
  const infinityNorm = (matrix: number[][]) => Math.max(...matrix.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)));
  const condition = infinityNorm(scaled) * infinityNorm(inverse);
  if (!Number.isFinite(condition) || condition > MAX_SCALED_CONDITION) illConditioned();
  const covariance = inverse.map((row, at) => row.map((value, column) =>
    (value + inverse[column][at]) / (2 * scale[at] * scale[column])));
  if (covariance.some((row, at) => row[at] <= 0 || row.some((value) => !Number.isFinite(value)))) illConditioned();
  return { covariance, condition };
}

/**
 * Weighted proper rigid fit: min sum_i ||R source_i + t - target_i||² / variance_i.
 * Correspondences are supplied, not discovered. No source covariance, anisotropic
 * target covariance, robust loss, scale/reflection fitting, or outlier removal.
 *
 * Covariance is the LOCAL Gauss-Newton inverse J' W J, with parameters
 * (target-frame small rotation radians, target-frame centroid translation m):
 * predicted_i(delta) = Exp([deltaRotation]x) R(source_i-sourceCentroid)
 *                      + targetCentroid + deltaCentroidTranslation.
 * It is NOT the covariance of the transform's origin translation. For point
 * propagation use centered source coordinates. Source points/weights/frames are
 * held exact; known variances are not inferred or rescaled from fitting error.
 * Fitted residuals are not independent standard-normal accuracy observations.
 *
 * Deterministic ID-ordered accumulation; planar noncollinear controls are valid.
 * Coincident, collinear, near-collinear, eigengap-ambiguous or numerically unstable
 * geometry is refused, never repaired by adding constraints or jitter.
 */
export function solveRigidRegistration(controls: readonly RigidRegistrationControl[]): RigidRegistrationSolution {
  denseArray(controls, 3, 64);
  const ids = new Set<string>();
  for (const control of controls) {
    closedObject(control, ['id', 'sourceM', 'targetM', 'varianceM2']);
    if (typeof control.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(control.id) || ids.has(control.id)) invalid();
    ids.add(control.id);
    coordinate(control.sourceM);
    coordinate(control.targetM);
    if (typeof control.varianceM2 !== 'number' || !Number.isFinite(control.varianceM2) ||
        control.varianceM2 < MIN_VARIANCE_M2 || control.varianceM2 > MAX_VARIANCE_M2) invalid();
  }
  const ordered = [...controls].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const weights = ordered.map((control) => 1 / control.varianceM2);
  const weightSum = compensatedSum(weights);
  const normalizedWeights = weights.map((weight) => weight / weightSum);
  const centroid = (field: 'sourceM' | 'targetM'): Vec3 => [0, 1, 2].map((axis) =>
    ordered[0][field][axis] + compensatedSum(ordered.map((control, index) =>
      normalizedWeights[index] * (control[field][axis] - ordered[0][field][axis])))) as Vec3;
  const sourceCentroidM = centroid('sourceM');
  const targetCentroidM = centroid('targetM');
  const source = ordered.map((control) => difference(control.sourceM, sourceCentroidM));
  const target = ordered.map((control) => difference(control.targetM, targetCentroidM));
  const scatter = zeros(3);
  const cross = zeros(3);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    scatter[row][column] = compensatedSum(ordered.map((_, at) => normalizedWeights[at] * source[at][row] * source[at][column]));
    cross[row][column] = compensatedSum(ordered.map((_, at) => normalizedWeights[at] * source[at][row] * target[at][column]));
  }
  const sourceSpectrum = eigenSymmetric(scatter);
  const sourceScatterSecondToFirstRatio = sourceSpectrum[1].value / sourceSpectrum[0].value;
  if (scatter[0][0] + scatter[1][1] + scatter[2][2] <= MIN_SOURCE_RMS_M ** 2 ||
      !Number.isFinite(sourceScatterSecondToFirstRatio) || sourceScatterSecondToFirstRatio <= MIN_SECOND_SCATTER_RATIO) degenerate();

  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = cross;
  // Horn's symmetric quaternion matrix uses scalar-FIRST eigenvectors.
  const horn = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const spectrum = eigenSymmetric(horn);
  const spectralScale = Math.max(...spectrum.map(({ value }) => Math.abs(value)));
  const hornRelativeEigenGap = (spectrum[0].value - spectrum[1].value) / spectralScale;
  if (!Number.isFinite(hornRelativeEigenGap) || hornRelativeEigenGap <= MIN_HORN_GAP) degenerate();
  const eigenvector = spectrum[0].vector;
  // Unique representation of +/-q, including exact 180-degree rotations.
  let dominant = 0;
  for (let index = 1; index < 4; index++) if (Math.abs(eigenvector[index]) > Math.abs(eigenvector[dominant])) dominant = index;
  const multiplier = (eigenvector[dominant] < 0 ? -1 : 1) / Math.hypot(...eigenvector);
  const [w, x, y, z] = eigenvector.map((value) => value * multiplier);
  const rotationXyzw: Quaternion = [x, y, z, w];
  const rotation: RigidTransform = { translationM: [0, 0, 0], rotationXyzw };
  const rotatedCentroid = transformPoint(rotation, sourceCentroidM);
  const transform: RigidTransform = { rotationXyzw, translationM: difference(targetCentroidM, rotatedCentroid) };
  const rotated = source.map((point) => transformPoint(rotation, point));
  const jacobians = rotated.map(([rx, ry, rz]) => [
    [0, rz, -ry, 1, 0, 0], [-rz, 0, rx, 0, 1, 0], [ry, -rx, 0, 0, 0, 1],
  ]);
  const information = zeros(6);
  for (let row = 0; row < 6; row++) for (let column = 0; column <= row; column++) {
    information[row][column] = information[column][row] = compensatedSum(ordered.map((_, at) =>
      weights[at] * compensatedSum([0, 1, 2].map((axis) => jacobians[at][axis][row] * jacobians[at][axis][column]))));
  }
  const { covariance, condition } = invertInformation(information);
  // Centered evaluation avoids cancellation from transform-origin translation.
  const byId = new Map(ordered.map((control, at) => {
    const residualM = difference(rotated[at], target[at]);
    const normM = Math.hypot(...residualM);
    return [control.id, { id: control.id, residualM, normM, standardizedNorm: normM / Math.sqrt(control.varianceM2) }];
  }));
  const weightedResidualSumSquares = compensatedSum(ordered.map((control) => byId.get(control.id)!.standardizedNorm ** 2));
  if (!Number.isFinite(weightedResidualSumSquares)) illConditioned();
  return {
    transform, sourceCentroidM, targetCentroidM, covariance,
    residuals: controls.map((control) => byId.get(control.id)!),
    weightedResidualSumSquares, degreesOfFreedom: 3 * controls.length - 6,
    numerics: {
      solver: RIGID_REGISTRATION_NUMERICS.solver,
      covariance: RIGID_REGISTRATION_NUMERICS.covariance,
      covarianceParameterization: RIGID_REGISTRATION_NUMERICS.covarianceParameterization,
      covarianceParameterOrder: PARAMETER_ORDER,
      sourceScatterSecondToFirstRatio, hornRelativeEigenGap,
      scaledInformationConditionInfinity: condition,
    },
  };
}
