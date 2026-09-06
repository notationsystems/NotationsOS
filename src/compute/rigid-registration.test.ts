import { describe, expect, it } from 'vitest';
import { transformPoint, type Quaternion, type RigidTransform, type Vec3 } from '../observation/rigid';
import { RIGID_REGISTRATION_NUMERICS, solveRigidRegistration, type RigidRegistrationControl } from './rigid-registration';

const TETRAHEDRON: Vec3[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
const IDENTITY: RigidTransform = { rotationXyzw: [0, 0, 0, 1], translationM: [0, 0, 0] };
function controls(points = TETRAHEDRON, transform = IDENTITY, varianceM2 = 1): RigidRegistrationControl[] {
  return points.map((sourceM, at) => ({ id: `control_${at}`, sourceM: [...sourceM], targetM: transformPoint(transform, sourceM), varianceM2 }));
}
function closeTuple(actual: readonly number[], expected: readonly number[], digits = 10) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));
}
function zRotation(angle: number): Quaternion { return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]; }
function maxError(input: RigidRegistrationControl[], transform: RigidTransform): number {
  return Math.max(...input.map((control) => Math.hypot(...transformPoint(transform, control.sourceM).map((value, at) => value - control.targetM[at]))));
}
function callUnknown(value: unknown) { return solveRigidRegistration(value as RigidRegistrationControl[]); }

describe('bounded weighted rigid registration', () => {
  it('recovers identity with nonzero declared uncertainty despite zero fit error', () => {
    const solved = solveRigidRegistration(controls());
    closeTuple(solved.transform.rotationXyzw, [0, 0, 0, 1]);
    closeTuple(solved.transform.translationM, [0, 0, 0]);
    expect(solved.weightedResidualSumSquares).toBe(0);
    expect(solved.degreesOfFreedom).toBe(6);
    expect(solved.covariance[0][0]).toBeCloseTo(1 / 8, 12);
    expect(solved.covariance[3][3]).toBeCloseTo(1 / 4, 12);
  });

  it('recovers an active source-to-target 3D transform', () => {
    const q: Quaternion = [0.2, -0.3, 0.4, Math.sqrt(0.71)];
    const expected = { rotationXyzw: q, translationM: [31, -7, 13] as Vec3 };
    const input = controls(TETRAHEDRON, expected);
    const solved = solveRigidRegistration(input);
    closeTuple(solved.transform.rotationXyzw, q);
    closeTuple(solved.transform.translationM, expected.translationM);
    expect(maxError(input, solved.transform)).toBeLessThan(1e-12);
  });

  it.each([0, Math.PI / 7, Math.PI / 2, Math.PI, -Math.PI / 2, 3.6])('recovers z rotation %s without inverse-direction confusion', (angle) => {
    const expected = { rotationXyzw: zRotation(angle), translationM: [3, 4, 9] as Vec3 };
    const input = controls(TETRAHEDRON, expected);
    expect(maxError(input, solveRigidRegistration(input).transform)).toBeLessThan(1e-12);
  });

  it.each<Quaternion>([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [Math.SQRT1_2, Math.SQRT1_2, 0, 0]])('handles exact 180-degree quaternion %j', (...q) => {
    const input = controls(TETRAHEDRON, { rotationXyzw: q, translationM: [10, 20, 30] });
    const solved = solveRigidRegistration(input);
    expect(maxError(input, solved.transform)).toBeLessThan(1e-12);
    closeTuple(solved.transform.rotationXyzw, q);
  });

  it('accepts minimal planar noncollinear survey controls', () => {
    const input = controls([[0, 0, 0], [2, 0, 0], [0, 3, 0]], {
      rotationXyzw: [0.5, 0.5, 0.5, 0.5], translationM: [-6, 9, 12],
    });
    const solved = solveRigidRegistration(input);
    expect(maxError(input, solved.transform)).toBeLessThan(1e-12);
    expect(solved.degreesOfFreedom).toBe(3);
    expect(solved.covariance).toHaveLength(6);
  });

  it('returns the full analytic inverse information for an isotropic tetrahedron', () => {
    const solved = solveRigidRegistration(controls(TETRAHEDRON, IDENTITY, 4));
    for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
      expect(solved.covariance[row][column]).toBeCloseTo(row === column ? (row < 3 ? 0.5 : 1) : 0, 12);
    }
    expect(solved.numerics.covarianceParameterOrder).toEqual([
      'rotationXRad', 'rotationYRad', 'rotationZRad', 'centroidTranslationXM', 'centroidTranslationYM', 'centroidTranslationZM',
    ]);
    expect(solved.numerics.covarianceParameterization).toBe('TARGET_FRAME_ROTATION_AT_WEIGHTED_SOURCE_CENTROID_AND_CENTROID_TRANSLATION');
  });

  it('retains off-diagonal rotational covariance in the target frame', () => {
    const points: Vec3[] = [[2, 1, 0], [2, -1, 0], [-2, 1, 0], [-2, -1, 0]];
    const solved = solveRigidRegistration(controls(points, { rotationXyzw: zRotation(Math.PI / 4), translationM: [100, 200, 300] }));
    expect(solved.covariance[0][0]).toBeCloseTo(0.15625, 12);
    expect(solved.covariance[1][1]).toBeCloseTo(0.15625, 12);
    expect(solved.covariance[0][1]).toBeCloseTo(0.09375, 12);
    expect(solved.covariance[1][0]).toBeCloseTo(0.09375, 12);
    expect(solved.covariance[2][2]).toBeCloseTo(0.05, 12);
    for (let row = 3; row < 6; row++) expect(solved.covariance[row][row]).toBeCloseTo(0.25, 12);
  });

  it('is centroid-parameterized, not covariance of origin translation', () => {
    const original = solveRigidRegistration(controls());
    const displaced: Vec3[] = TETRAHEDRON.map(([x, y, z]) => [x + 50_000, y + 300_000, z - 80_000]);
    const solved = solveRigidRegistration(controls(displaced, { rotationXyzw: [0, 0, 1, 0], translationM: [10, -5, 4] }));
    for (let row = 0; row < 6; row++) closeTuple(solved.covariance[row], original.covariance[row], 10);
    closeTuple(solved.sourceCentroidM, [50_000, 300_000, -80_000]);
    closeTuple(solved.targetCentroidM, [-49_990, -300_005, -79_996]);
  });

  it('keeps the supplied noise scale rather than estimating it from a small residual', () => {
    const input = controls();
    const expanded = controls().map((control) => ({ ...control, targetM: control.targetM.map((value) => value * 2) as Vec3 }));
    const exact = solveRigidRegistration(input);
    const poorFit = solveRigidRegistration(expanded);
    expect(poorFit.covariance).toEqual(exact.covariance);
    expect(poorFit.weightedResidualSumSquares).toBeCloseTo(12, 12);
    expect(exact.weightedResidualSumSquares).toBe(0);
  });

  it('scales covariance and weighted residuals with the declared target variance', () => {
    const input = controls().map((control) => ({ ...control, targetM: control.targetM.map((value) => value * 2) as Vec3 }));
    const one = solveRigidRegistration(input);
    const four = solveRigidRegistration(input.map((control) => ({ ...control, varianceM2: 4 })));
    expect(four.transform).toEqual(one.transform);
    expect(four.weightedResidualSumSquares).toBeCloseTo(one.weightedResidualSumSquares / 4, 12);
    for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
      expect(four.covariance[row][column]).toBeCloseTo(one.covariance[row][column] * 4, 12);
    }
  });

  it('uses inverse variance, not an unweighted average, for inconsistent repeated survey observations', () => {
    const precise = controls(TETRAHEDRON, IDENTITY, 1).map((control) => ({ ...control, id: `precise_${control.id}` }));
    const imprecise = controls(TETRAHEDRON, { ...IDENTITY, translationM: [10, 0, 0] }, 9).map((control) => ({ ...control, id: `imprecise_${control.id}` }));
    const solved = solveRigidRegistration([...precise, ...imprecise]);
    closeTuple(solved.transform.translationM, [1, 0, 0]);
    closeTuple(solved.transform.rotationXyzw, [0, 0, 0, 1]);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(40, 10);
    expect(solved.covariance[3][3]).toBeCloseTo(0.225, 12);
    expect(solved.residuals[0].residualM[0]).toBeCloseTo(1, 12);
    expect(solved.residuals[4].residualM[0]).toBeCloseTo(-9, 12);
    expect(solved.residuals[4].standardizedNorm).toBeCloseTo(3, 12);
  });

  it('retains all supplied outliers and records their residuals without an implicit robust loss', () => {
    const consistent = controls();
    const outlier = controls(TETRAHEDRON, { ...IDENTITY, translationM: [100, 0, 0] }).map((control) => ({ ...control, id: `outlier_${control.id}` }));
    const solved = solveRigidRegistration([...consistent, ...outlier]);
    closeTuple(solved.transform.translationM, [50, 0, 0]);
    expect(solved.residuals).toHaveLength(8);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(20_000, 8);
  });

  it('is reproducible under arbitrary input order, except report residual ordering', () => {
    const input = controls(TETRAHEDRON, { rotationXyzw: [0.2, -0.3, 0.4, Math.sqrt(0.71)], translationM: [11, 14, 9] });
    input[1].targetM[0] += 0.03;
    input[2].varianceM2 = 0.08;
    const before = structuredClone(input);
    const normal = solveRigidRegistration(input);
    const reversed = solveRigidRegistration([...input].reverse());
    expect({ ...reversed, residuals: [...reversed.residuals].reverse() }).toEqual(normal);
    expect(input).toEqual(before);
  });

  it('accepts frozen input and returns output detached from it', () => {
    const input = controls();
    for (const control of input) { Object.freeze(control.sourceM); Object.freeze(control.targetM); Object.freeze(control); }
    Object.freeze(input);
    const solved = solveRigidRegistration(input);
    solved.sourceCentroidM[0] = 17;
    solved.transform.rotationXyzw[0] = 4;
    solved.residuals[0].residualM[0] = 50;
    expect(input[0].sourceM).toEqual([1, 1, 1]);
    expect(solveRigidRegistration(input).transform.rotationXyzw).toEqual([0, 0, 0, 1]);
  });

  it('has symmetric positive full covariance and satisfies independently constructed information times covariance', () => {
    const input = controls([[0, 0, 0], [3, 1, 0], [-2, 4, 0.2], [1, -2, 5], [3, 3, 4]], {
      rotationXyzw: [0.2, -0.3, 0.4, Math.sqrt(0.71)], translationM: [-5, 7, 3],
    }).map((control, at) => ({ ...control, varianceM2: at + 0.4 }));
    input[2].targetM[0] += 0.01;
    const solved = solveRigidRegistration(input);
    const information = Array.from({ length: 6 }, () => Array<number>(6).fill(0));
    for (const control of input) {
      const centered = control.sourceM.map((value, at) => value - solved.sourceCentroidM[at]) as Vec3;
      const [x, y, z] = transformPoint({ ...solved.transform, translationM: [0, 0, 0] }, centered);
      const j = [[0, z, -y, 1, 0, 0], [-z, 0, x, 0, 1, 0], [y, -x, 0, 0, 0, 1]];
      for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
        information[row][column] += j.reduce((sum, axis) => sum + axis[row] * axis[column], 0) / control.varianceM2;
      }
    }
    for (let row = 0; row < 6; row++) {
      expect(solved.covariance[row][row]).toBeGreaterThan(0);
      for (let column = 0; column < 6; column++) {
        expect(solved.covariance[row][column]).toBe(solved.covariance[column][row]);
        expect(information[row].reduce((sum, value, at) => sum + value * solved.covariance[at][column], 0)).toBeCloseTo(row === column ? 1 : 0, 10);
      }
    }
  });

  it('finds a stationary weighted least-squares fit under noisy nonuniform controls', () => {
    const input = controls([[0, 0, 0], [2, 0, 0], [0, 3, 0], [1, 2, 4], [-3, 1, 2]], {
      rotationXyzw: zRotation(0.75), translationM: [4, -9, 2],
    }).map((control, at) => ({ ...control, varianceM2: 0.1 + at * 0.7 }));
    input[0].targetM[0] += 0.02;
    input[2].targetM[1] -= 0.06;
    input[3].targetM[2] += 0.04;
    const solved = solveRigidRegistration(input);
    const gradient = Array<number>(6).fill(0);
    for (let at = 0; at < input.length; at++) {
      const control = input[at];
      const local = control.sourceM.map((value, axis) => value - solved.sourceCentroidM[axis]) as Vec3;
      const [x, y, z] = transformPoint({ ...solved.transform, translationM: [0, 0, 0] }, local);
      const j = [[0, z, -y, 1, 0, 0], [-z, 0, x, 0, 1, 0], [y, -x, 0, 0, 0, 1]];
      for (let parameter = 0; parameter < 6; parameter++) {
        gradient[parameter] += j.reduce((sum, axis, coordinate) => sum + axis[parameter] * solved.residuals[at].residualM[coordinate], 0) / control.varianceM2;
      }
    }
    closeTuple(gradient, [0, 0, 0, 0, 0, 0], 10);
    expect(solved.weightedResidualSumSquares).toBeGreaterThan(0);
  });

  it('does not fit a scale factor', () => {
    const input = controls().map((control) => ({ ...control, targetM: control.targetM.map((value) => 2 * value) as Vec3 }));
    const solved = solveRigidRegistration(input);
    expect(solved.weightedResidualSumSquares).toBeCloseTo(12, 12);
    expect(Math.hypot(...solved.transform.rotationXyzw)).toBeCloseTo(1, 12);
  });

  it('returns only a proper rotation for a reflected asymmetric cloud, retaining mismatch', () => {
    const input = controls([[3, 1, 2], [3, -1, -2], [-3, 1, -2], [-3, -1, 2]])
      .map((control) => ({ ...control, targetM: [-control.targetM[0], control.targetM[1], control.targetM[2]] as Vec3 }));
    const solved = solveRigidRegistration(input);
    expect(Math.hypot(...solved.transform.rotationXyzw)).toBeCloseTo(1, 12);
    // Sacrifice the least-spread y axis: 4 points * squared 2m residual.
    expect(solved.weightedResidualSumSquares).toBeCloseTo(16, 10);
  });

  it('refuses reflected isotropic geometry whose best proper rotation is nonunique', () => {
    const input = controls().map((control) => ({ ...control, targetM: [-control.targetM[0], control.targetM[1], control.targetM[2]] as Vec3 }));
    expect(() => solveRigidRegistration(input)).toThrow('REGISTRATION_DEGENERATE_GEOMETRY');
  });

  it('handles exactly 64 independent correspondence records', () => {
    const input = Array.from({ length: 16 }, (_, index) => controls().map((control) => ({ ...control, id: `${index}_${control.id}` }))).flat();
    const solved = solveRigidRegistration(input);
    expect(solved.residuals).toHaveLength(64);
    expect(solved.covariance[3][3]).toBeCloseTo(1 / 64, 12);
    expect(solved.degreesOfFreedom).toBe(186);
  });

  it.each([1e-8, 1e6])('accepts declared variance boundary %s', (varianceM2) => {
    const solved = solveRigidRegistration(controls(TETRAHEDRON, IDENTITY, varianceM2));
    expect(solved.covariance[3][3] / varianceM2).toBeCloseTo(1 / 4, 12);
  });

  it('accepts the exact coordinate magnitude bound', () => {
    const input = controls(TETRAHEDRON.map((point) => point.map((value) => value * 1e6) as Vec3));
    expect(solveRigidRegistration(input).weightedResidualSumSquares).toBe(0);
  });

  it.each<Vec3[][]>([
    [[[0, 0, 0], [0, 0, 0], [0, 0, 0]]],
    [[[0, 0, 0], [1, 0, 0], [2, 0, 0]]],
    [[[0, 0, 0], [1, 1, 1], [2, 2, 2]]],
    [[[0, 0, 0], [1, 1e-7, 0], [2, 0, 0]]],
    [[[0, 0, 0], [1e-8, 0, 0], [0, 1e-8, 0]]],
  ])('refuses unsupported source geometry %j without artificial constraints', (points) => {
    expect(() => solveRigidRegistration(controls(points))).toThrow('REGISTRATION_DEGENERATE_GEOMETRY');
  });

  it('accepts well-resolved small geometry above the explicit metric lower bound', () => {
    const input = controls([[0, 0, 0], [1e-4, 0, 0], [0, 1e-4, 0]]);
    expect(solveRigidRegistration(input).weightedResidualSumSquares).toBeCloseTo(0, 20);
  });

  it('refuses weighted effective near-collinearity even when a tiny-weight off-line control exists', () => {
    const input = controls([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]], IDENTITY, 1e-8);
    input[3].varianceM2 = 1e6;
    expect(() => solveRigidRegistration(input)).toThrow('REGISTRATION_DEGENERATE_GEOMETRY');
  });

  it('refuses target collapse and target line ambiguity rather than inventing a rotation', () => {
    expect(() => solveRigidRegistration(controls().map((control) => ({ ...control, targetM: [0, 0, 0] as Vec3 })))).toThrow('REGISTRATION_DEGENERATE_GEOMETRY');
    expect(() => solveRigidRegistration(controls().map((control, at) => ({ ...control, targetM: [at, 0, 0] as Vec3 })))).toThrow('REGISTRATION_DEGENERATE_GEOMETRY');
  });

  it('exports immutable explicit numerical refusal thresholds', () => {
    expect(Object.isFrozen(RIGID_REGISTRATION_NUMERICS)).toBe(true);
    expect(Object.isFrozen(RIGID_REGISTRATION_NUMERICS.covarianceParameterOrder)).toBe(true);
    expect(RIGID_REGISTRATION_NUMERICS.minimumSourceScatterSecondToFirstRatioExclusive).toBe(1e-8);
    expect(RIGID_REGISTRATION_NUMERICS.minimumHornRelativeEigenGapExclusive).toBe(1e-10);
  });
});

describe('closed rigid-registration input boundary', () => {
  it.each([null, undefined, {}, 'controls', [], [null], [1, 2, 3]])('rejects malformed control list %j', (value) => {
    expect(() => callUnknown(value)).toThrow('REGISTRATION_INVALID_INPUT');
  });
  it('rejects fewer than 3 or more than 64 controls', () => {
    expect(() => solveRigidRegistration(controls().slice(0, 2))).toThrow('REGISTRATION_INVALID_INPUT');
    expect(() => solveRigidRegistration(Array.from({ length: 65 }, (_, at) => ({ ...controls()[at % 4], id: `c${at}` })))).toThrow('REGISTRATION_INVALID_INPUT');
  });
  it.each(['', 'a b', 'a/b', 'é', 'x'.repeat(81), 12, null])('rejects malformed ID %j', (id) => {
    const input: unknown[] = controls();
    input[0] = { ...controls()[0], id };
    expect(() => callUnknown(input)).toThrow('REGISTRATION_INVALID_INPUT');
  });
  it('rejects duplicate correspondence IDs', () => {
    const input = controls();
    input[1].id = input[0].id;
    expect(() => solveRigidRegistration(input)).toThrow('REGISTRATION_INVALID_INPUT');
  });
  it.each([null, undefined, 0, -1, 1e-9, 1e7, Infinity, -Infinity, NaN, '1'])('rejects missing or invalid variance %j', (varianceM2) => {
    const input: unknown[] = controls();
    input[0] = { ...controls()[0], varianceM2 };
    expect(() => callUnknown(input)).toThrow('REGISTRATION_INVALID_INPUT');
  });
  for (const field of ['sourceM', 'targetM'] as const) {
    it.each([null, undefined, 'point', [], [0, 1], [0, 1, 2, 3], [NaN, 0, 0], [Infinity, 0, 0], [-Infinity, 0, 0], [1e6 + 1, 0, 0], [-1e6 - 1, 0, 0], ['1', 0, 0]])(`rejects malformed ${field} %j`, (point) => {
      const input: unknown[] = controls();
      input[0] = { ...controls()[0], [field]: point };
      expect(() => callUnknown(input)).toThrow('REGISTRATION_INVALID_INPUT');
    });
  }
  it.each(['truth', 'sourceCovariance', 'robustLoss', 'scale', 'rotation', 'reference'])('rejects undeclared field %s', (extra) => {
    const input: unknown[] = controls();
    input[0] = { ...controls()[0], [extra]: 1 };
    expect(() => callUnknown(input)).toThrow('REGISTRATION_INVALID_INPUT');
  });
  it.each(['id', 'sourceM', 'targetM', 'varianceM2'])('rejects missing field %s', (missing) => {
    const first: Record<string, unknown> = { ...controls()[0] };
    delete first[missing];
    expect(() => callUnknown([first, ...controls().slice(1)])).toThrow('REGISTRATION_INVALID_INPUT');
  });
  it.each(['id', 'sourceM', 'targetM', 'varianceM2'])('refuses %s getters without evaluating them', (field) => {
    let reads = 0;
    const input = controls();
    Object.defineProperty(input[0], field, { get() { reads++; throw new Error('getter evaluated'); }, enumerable: true });
    expect(() => solveRigidRegistration(input)).toThrow('REGISTRATION_INVALID_INPUT');
    expect(reads).toBe(0);
  });
  it('refuses array-element getters without evaluating them', () => {
    let reads = 0;
    const input = controls();
    Object.defineProperty(input, '0', { get() { reads++; throw new Error('getter evaluated'); }, enumerable: true });
    expect(() => solveRigidRegistration(input)).toThrow('REGISTRATION_INVALID_INPUT');
    expect(reads).toBe(0);
  });
  it('refuses coordinate getters without evaluating them', () => {
    let reads = 0;
    const input = controls();
    Object.defineProperty(input[0].sourceM, '0', { get() { reads++; throw new Error('getter evaluated'); }, enumerable: true });
    expect(() => solveRigidRegistration(input)).toThrow('REGISTRATION_INVALID_INPUT');
    expect(reads).toBe(0);
  });
  it('rejects custom array properties, sparse arrays and array subclasses', () => {
    const extra = Object.assign(controls(), { inference: 'hidden' });
    expect(() => solveRigidRegistration(extra)).toThrow('REGISTRATION_INVALID_INPUT');
    const sparse = new Array(4);
    sparse[3] = controls()[3];
    expect(() => callUnknown(sparse)).toThrow('REGISTRATION_INVALID_INPUT');
    class ControlArray extends Array<RigidRegistrationControl> {}
    expect(() => solveRigidRegistration(new ControlArray(...controls()))).toThrow('REGISTRATION_INVALID_INPUT');
    const coordinateExtra = controls();
    Object.assign(coordinateExtra[0].sourceM, { unit: 'metres' });
    expect(() => solveRigidRegistration(coordinateExtra)).toThrow('REGISTRATION_INVALID_INPUT');
  });
  it('rejects prototype inheritance, symbol fields and hidden fields; accepts null-prototype records', () => {
    const inherited = Object.create(controls()[0]);
    expect(() => callUnknown([inherited, ...controls().slice(1)])).toThrow('REGISTRATION_INVALID_INPUT');
    const symbolic = controls();
    Object.defineProperty(symbolic[0], Symbol('extra'), { value: 1 });
    expect(() => solveRigidRegistration(symbolic)).toThrow('REGISTRATION_INVALID_INPUT');
    const hidden = controls();
    Object.defineProperty(hidden[0], 'hidden', { value: 1 });
    expect(() => solveRigidRegistration(hidden)).toThrow('REGISTRATION_INVALID_INPUT');
    const safe = controls().map((control) => Object.assign(Object.create(null), control) as RigidRegistrationControl);
    expect(solveRigidRegistration(safe).weightedResidualSumSquares).toBe(0);
  });
});
