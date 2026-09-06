/** Cartesian components in metres; all frames use a right-handed basis. */
export type Vec3 = [number, number, number];
/** Unit quaternion in scalar-last (x, y, z, w) order. */
export type Quaternion = [number, number, number, number];
export type RigidTransform = { translationM: Vec3; rotationXyzw: Quaternion };

const MAX_METRES = 100_000_000;
const UNIT_QUATERNION_TOLERANCE = 1e-10;

function requireMetres(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_METRES) {
    throw new Error(`${label} must be finite and bounded by +/-${MAX_METRES} metres`);
  }
}

function requireVec3(value: unknown, label: string): asserts value is Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must be a 3-element metre tuple`);
  }
  for (let index = 0; index < 3; index += 1) requireMetres(value[index], `${label}[${index}]`);
}

function requireQuaternion(value: unknown): asserts value is Quaternion {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('rotationXyzw must be a 4-element unit quaternion in xyzw order');
  }
  for (let index = 0; index < 4; index += 1) {
    if (typeof value[index] !== 'number' || !Number.isFinite(value[index])) {
      throw new Error('rotationXyzw components must be finite numbers');
    }
  }
  const norm = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > UNIT_QUATERNION_TOLERANCE) {
    throw new Error('rotationXyzw must have unit length within 1e-10; normalization is not performed');
  }
}

/** Active child-to-parent transform: p_parent = R(q) p_child + translationM. */
export function transformPoint(transform: RigidTransform, point: Vec3): Vec3 {
  if (transform === null || typeof transform !== 'object' || Array.isArray(transform)) {
    throw new Error('transform must contain translationM and rotationXyzw');
  }
  requireVec3(transform.translationM, 'translationM');
  requireQuaternion(transform.rotationXyzw);
  requireVec3(point, 'point');

  const [x, y, z, w] = transform.rotationXyzw;
  const [px, py, pz] = point;
  const [tx, ty, tz] = transform.translationM;
  const result: Vec3 = [
    (1 - 2 * (y * y + z * z)) * px + 2 * (x * y - z * w) * py + 2 * (x * z + y * w) * pz + tx,
    2 * (x * y + z * w) * px + (1 - 2 * (x * x + z * z)) * py + 2 * (y * z - x * w) * pz + ty,
    2 * (x * z - y * w) * px + 2 * (y * z + x * w) * py + (1 - 2 * (x * x + y * y)) * pz + tz,
  ];
  requireVec3(result, 'transformed point');
  return result;
}

/** Apply the mounting transform before the platform pose, including both lever arms. */
export function placePoint(sensorToBody: RigidTransform, bodyToWorld: RigidTransform, point: Vec3): Vec3 {
  return transformPoint(bodyToWorld, transformPoint(sensorToBody, point));
}

/** Geometric residual right - left only; neither position is declared to be ground truth. */
export function comparePositions(left: Vec3, right: Vec3): { deltaM: Vec3; distanceM: number } {
  requireVec3(left, 'left position');
  requireVec3(right, 'right position');
  const deltaM: Vec3 = [right[0] - left[0], right[1] - left[1], right[2] - left[2]];
  requireVec3(deltaM, 'position delta');
  const distanceM = Math.hypot(...deltaM);
  requireMetres(distanceM, 'position distance');
  return { deltaM, distanceM };
}
