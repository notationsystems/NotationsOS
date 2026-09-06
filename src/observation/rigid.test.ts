import { describe, expect, it } from 'vitest';
import { comparePositions, placePoint, transformPoint, type Quaternion, type RigidTransform, type Vec3 } from './rigid';

const identity: RigidTransform = { translationM: [0, 0, 0], rotationXyzw: [0, 0, 0, 1] };
const half = Math.SQRT1_2;
const rx: Quaternion = [half, 0, 0, half];
const ry: Quaternion = [0, half, 0, half];
const rz: Quaternion = [0, 0, half, half];
const rigid = (rotationXyzw: Quaternion, translationM: Vec3 = [0, 0, 0]): RigidTransform => ({ rotationXyzw, translationM });
function expectVec(actual: Vec3, expected: Vec3) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
}

describe('bounded right-handed rigid observation geometry', () => {
  it('preserves an identity point without returning its input array or changing its inputs', () => {
    const point: Vec3 = [1, -2, 3];
    const original = structuredClone(identity);
    const result = transformPoint(identity, point);
    expect(result).toEqual(point);
    expect(result).not.toBe(point);
    expect(point).toEqual([1, -2, 3]);
    expect(identity).toEqual(original);
  });

  it.each([
    { rotation: rx, point: [0, 1, 0], expected: [0, 0, 1] },
    { rotation: ry, point: [0, 0, 1], expected: [1, 0, 0] },
    { rotation: rz, point: [1, 0, 0], expected: [0, 1, 0] },
  ])('uses an active positive right-handed quarter turn: $rotation', ({ rotation, point, expected }) => {
    expectVec(transformPoint(rigid(rotation), point as Vec3), expected as Vec3);
  });

  it('rotates the point before adding the parent-frame translation', () => {
    expectVec(transformPoint(rigid(rz, [3, 4, 5]), [2, 0, 0]), [3, 6, 5]);
  });

  it('applies noncommuting sensor and platform rotations in the declared order', () => {
    const sensorToBody = rigid(rz);
    const bodyToWorld = rigid(rx);
    expectVec(placePoint(sensorToBody, bodyToWorld, [1, 0, 0]), [0, 0, 1]);
    expectVec(placePoint(bodyToWorld, sensorToBody, [1, 0, 0]), [0, 1, 0]);
  });

  it('rotates the sensor lever arm with the platform pose rather than adding it in world axes', () => {
    const sensorToBody = rigid(rz, [1, 0, 0]);
    const bodyToWorld = rigid(rx, [10, 20, 30]);
    expectVec(placePoint(sensorToBody, bodyToWorld, [1, 0, 0]), [11, 20, 31]);
    expectVec(placePoint(rigid([0, 0, 0, 1], [1, 0, 0]), rigid(rz, [10, 20, 30]), [0, 0, 0]), [10, 21, 30]);
  });

  it.each([
    { rotation: [1, 0, 0, 0], expected: [1, -2, -3] },
    { rotation: [0, 1, 0, 0], expected: [-1, 2, -3] },
    { rotation: [0, 0, 1, 0], expected: [-1, -2, 3] },
  ])('supports a half turn with zero scalar component: $rotation', ({ rotation, expected }) => {
    expectVec(transformPoint(rigid(rotation as Quaternion), [1, 2, 3]), expected as Vec3);
  });

  it('gives the same position for q and -q', () => {
    const q: Quaternion = [0.5, -0.5, 0.5, -0.5];
    const negative = q.map((value) => -value) as Quaternion;
    expect(transformPoint(rigid(q, [7, 8, 9]), [1, 2, 3])).toEqual(transformPoint(rigid(negative, [7, 8, 9]), [1, 2, 3]));
  });

  it('accepts numeric boundary coordinates and translations without clamping', () => {
    expect(transformPoint(identity, [100_000_000, -100_000_000, 0])).toEqual([100_000_000, -100_000_000, 0]);
    expect(transformPoint(rigid([0, 0, 0, 1], [100_000_000, -100_000_000, 0]), [0, 0, 0])).toEqual([100_000_000, -100_000_000, 0]);
  });

  it('allows a unit-length rounding tolerance without silently normalizing the supplied quaternion', () => {
    const q: Quaternion = [0, 0, half, half + 1e-12];
    const prior = [...q];
    const result = transformPoint(rigid(q), [1, 0, 0]);
    expect(result[1]).toBe(2 * half * (half + 1e-12));
    expect(q).toEqual(prior);
  });

  const malformedVectors: unknown[] = [null, undefined, {}, '1,2,3', [], [1, 2], [1, 2, 3, 4], new Array(3), ['1', 2, 3], [NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity], [100_000_001, 0, 0], [0, -100_000_001, 0], [Number.MAX_VALUE, 0, 0]];
  it.each(malformedVectors.map((value, index) => ({ value, index })))('rejects malformed or out-of-bounds point case $index', ({ value }) => {
    expect(() => transformPoint(identity, value as Vec3)).toThrow(/point/);
  });

  it.each(malformedVectors.map((value, index) => ({ value, index })))('rejects malformed or out-of-bounds translation case $index', ({ value }) => {
    expect(() => transformPoint({ rotationXyzw: [0, 0, 0, 1], translationM: value as Vec3 }, [0, 0, 0])).toThrow(/translationM/);
  });

  it.each([null, undefined, [], 1, 'transform'])('rejects malformed transform %s', (value) => {
    expect(() => transformPoint(value as unknown as RigidTransform, [0, 0, 0])).toThrow(/transform/);
  });

  const malformedQuaternions: unknown[] = [null, undefined, {}, [], [0, 0, 1], [0, 0, 0, 1, 0], new Array(4), ['0', 0, 0, 1], [NaN, 0, 0, 1], [0, Infinity, 0, 1], [0, 0, -Infinity, 1], [0, 0, 0, 0], [0, 0, 0, 2], [0, 0, 0, 1 + 1e-8], [Number.MAX_VALUE, Number.MAX_VALUE, 0, 0]];
  it.each(malformedQuaternions.map((value, index) => ({ value, index })))('rejects malformed, nonfinite or nonunit quaternion case $index', ({ value }) => {
    expect(() => transformPoint(rigid(value as Quaternion), [1, 2, 3])).toThrow(/rotationXyzw/);
  });

  it('refuses transformed coordinates beyond the bound rather than clamping them', () => {
    expect(() => transformPoint(rigid([0, 0, 0, 1], [100_000_000, 0, 0]), [1, 0, 0])).toThrow(/transformed point/);
    const eighth: Quaternion = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
    expect(() => transformPoint(rigid(eighth), [100_000_000, 100_000_000, 0])).toThrow(/transformed point/);
  });

  it('refuses an out-of-bounds intermediate position even if a later translation would bring it back', () => {
    expect(() => placePoint(rigid([0, 0, 0, 1], [100_000_000, 0, 0]), rigid([0, 0, 0, 1], [-1, 0, 0]), [1, 0, 0])).toThrow(/transformed point/);
  });

  it('validates the second transform even when the first is the identity', () => {
    expect(() => placePoint(identity, rigid([0, 0, 0, 2]), [0, 0, 0])).toThrow(/rotationXyzw/);
  });
});

describe('position comparisons are bounded residuals, not accuracy claims', () => {
  it('reports right minus left and the Euclidean distance', () => {
    expect(comparePositions([10, 20, 30], [13, 16, 30])).toEqual({ deltaM: [3, -4, 0], distanceM: 5 });
    expect(comparePositions([13, 16, 30], [10, 20, 30])).toEqual({ deltaM: [-3, 4, 0], distanceM: 5 });
  });

  it('reports an identical position as zero residual without adding uncertainty or accuracy', () => {
    expect(comparePositions([1, 2, 3], [1, 2, 3])).toEqual({ deltaM: [0, 0, 0], distanceM: 0 });
  });

  it('includes the vertical component in distance', () => {
    expect(comparePositions([0, 0, 0], [2, 3, 6])).toEqual({ deltaM: [2, 3, 6], distanceM: 7 });
  });

  it.each([null, [], [0, 0], [0, 0, 0, 0], [NaN, 0, 0], [Infinity, 0, 0], [100_000_001, 0, 0]])('validates both input positions %s', (value) => {
    expect(() => comparePositions(value as unknown as Vec3, [0, 0, 0])).toThrow(/left position/);
    expect(() => comparePositions([0, 0, 0], value as unknown as Vec3)).toThrow(/right position/);
  });

  it('refuses an out-of-bounds delta from otherwise bounded inputs', () => {
    expect(() => comparePositions([-100_000_000, 0, 0], [100_000_000, 0, 0])).toThrow(/position delta/);
  });

  it('refuses a distance outside the metre bound even when each delta component is bounded', () => {
    expect(() => comparePositions([0, 0, 0], [100_000_000, 100_000_000, 0])).toThrow(/position distance/);
  });
});
