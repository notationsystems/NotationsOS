import { z } from 'zod';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';

export const MAX_REPLAY_MANIFEST_BYTES = 256 * 1024;
export const MAX_REPLAY_REPORT_BYTES = 512 * 1024;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const text = z.string().min(1).max(512).refine((s) => !!s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
// Never pass sensor timestamps through IEEE-754 numbers or JavaScript Date.
export const nanoseconds = z.string().regex(/^(0|-?[1-9][0-9]{0,20})$/);
const duration = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const number = z.number().finite().min(-1e8).max(1e8);
const vec3 = z.tuple([number, number, number]);
const quaternion = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine((q) => Math.abs(Math.hypot(...q) - 1) <= 1e-10, 'A unit xyzw quaternion is required; no implicit normalization.');
const transform = z.object({ translationM: vec3, rotationXyzw: quaternion }).strict();

/** Validate a supplied covariance, but do not infer or propagate one. */
function covariance(size: number) {
  return z.array(z.array(z.number().finite().min(-1e12).max(1e12)).length(size)).length(size).refine((a) => {
    const scale = Math.max(1, ...a.flat().map(Math.abs));
    const lower = Array.from({ length: size }, () => Array<number>(size).fill(0));
    for (let i = 0; i < size; i++) {
      if (a[i][i] < 0) return false;
      for (let j = 0; j <= i; j++) {
        if (Math.abs(a[i][j] - a[j][i]) > 1e-12 * scale) return false;
        let residual = a[i][j] / scale;
        for (let k = 0; k < j; k++) residual -= lower[i][k] * lower[j][k];
        if (i === j) {
          if (residual < -1e-12) return false;
          lower[i][j] = Math.sqrt(Math.max(0, residual));
        } else if (lower[j][j] > 1e-12) lower[i][j] = residual / lower[j][j];
        else if (Math.abs(residual) > 1e-12) return false;
      }
    }
    return true;
  }, 'Covariance must be symmetric positive semidefinite within 1e-12 scaled numerical tolerance.').nullable();
}
const poseCovariance = z.object({
  convention: z.literal('PARENT_FRAME_XYZ_METRE_ROTATION_VECTOR_RADIAN_LEFT_PERTURBATION'),
  matrix: covariance(6).unwrap(),
}).strict().nullable();

export const artifactReference = z.object({
  acquisitionId: text.refine((s) => !/\s/.test(s)), acquisitionDigest: digest, contentDigest: digest,
}).strict();
const method = z.object({ id, version: text, description: text }).strict();
const artifacts = z.array(artifactReference).min(1).max(8);
const stamp = z.object({ clockId: id, timeNs: nanoseconds }).strict();

const manifestSchema = z.object({
  schema: z.literal('payload.recorded-observation-manifest.v1'),
  datasetId: id,
  // This distinction survives compilation and readback. Tests never become field evidence.
  evidenceClass: z.enum(['SYNTHETIC_TEST', 'RECORDED_DATA']),
  purpose: z.literal('recorded-observation-replay'),
  frames: z.array(z.object({
    id, kind: z.literal('LOCAL_CARTESIAN'), units: z.literal('METRE'), handedness: z.literal('RIGHT'),
    axes: text, origin: text,
  }).strict()).min(1).max(64),
  sessions: z.array(z.object({ id, worldFrameId: id, bodyFrameId: id }).strict()).min(1).max(8),
  clocks: z.array(z.object({
    id, basis: z.enum(['UTC', 'GPS', 'DEVICE_MONOTONIC', 'DATASET']), epoch: text,
    // Exact bounded offset to a named common timeline. No implicit GPS/UTC conversion or drift model.
    alignment: z.object({
      timelineId: id, offsetNs: nanoseconds, validFromNs: nanoseconds, validUntilNs: nanoseconds,
      uncertaintyNs: duration.nullable(), method, evidence: artifacts,
    }).strict().nullable(),
  }).strict()).min(1).max(16),
  sensors: z.array(z.object({
    id, sessionId: id, frameId: id,
    modality: z.enum(['CAMERA', 'LIDAR', 'RADAR', 'GNSS', 'IMU', 'WHEEL_ODOMETRY']),
  }).strict()).min(1).max(32),
  calibrations: z.array(z.object({
    id, version: text, sensorId: id, fromFrameId: id, toFrameId: id,
    timelineId: id, validFromNs: nanoseconds, validUntilNs: nanoseconds,
    sensorToBody: transform, covariance6: poseCovariance, method, evidence: artifacts,
  }).strict()).max(32),
  poses: z.array(z.object({
    id, sessionId: id, bodyFrameId: id, worldFrameId: id, stamp,
    bodyToWorld: transform, covariance6: poseCovariance, method, evidence: artifacts,
  }).strict()).max(128),
  associations: z.array(z.object({
    id, authority: z.literal('OPERATOR_ASSERTION'), description: text, uncertaintyDescription: text,
  }).strict()).max(32),
  observations: z.array(z.object({
    id, sensorId: id, stamp, timestampMeaning: z.enum(['INSTANT', 'START', 'MIDPOINT', 'END', 'UNKNOWN']),
    durationNs: duration.nullable(), rawArtifact: artifactReference,
    encoding: text, processing: method,
    gnss: z.object({
      rawSolutionStatus: text.nullable(),
      receiverSolution: z.enum(['RTK_FIXED', 'RTK_FLOAT', 'OTHER', 'UNKNOWN']),
      correctionService: text.nullable(), correctionAgeNs: duration.nullable(),
    }).strict().nullable(),
    // Points are explicitly supplied estimates, not extraction from the raw sensor bytes.
    pointEstimate: z.object({
      sensorPointM: vec3, covarianceM2: covariance(3), associationId: id,
      calibrationId: id, poseId: id, method, evidence: artifacts,
      temporalSupport: z.enum(['AT_REFERENCE_STAMP', 'UNRESOLVED']),
    }).strict().nullable(),
  }).strict()).min(1).max(64),
}).strict();

export type ReplayManifest = z.infer<typeof manifestSchema>;
export type ArtifactReference = z.infer<typeof artifactReference>;
export const replayRequestSchema = z.object({
  schema: z.literal('payload.recorded-observation-replay-request.v1'), replayId: id, manifest: artifactReference,
}).strict();
export type ReplayRequest = z.infer<typeof replayRequestSchema>;

function unique<T extends { id: string }>(items: T[]): Map<string, T> {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('REPLAY_DUPLICATE_ID');
  return new Map(items.map((item) => [item.id, item]));
}
function requireLink<T>(map: Map<string, T>, key: string): T {
  const value = map.get(key);
  if (!value) throw new Error('REPLAY_UNRESOLVED_REFERENCE');
  return value;
}
function interval(from: string, until: string) {
  if (BigInt(from) >= BigInt(until)) throw new Error('REPLAY_INVALID_INTERVAL');
}

export function parseReplayManifest(value: unknown): ReplayManifest {
  const m = manifestSchema.parse(JSON.parse(encodeLocalRecord(value, MAX_REPLAY_MANIFEST_BYTES).toString('utf8')));
  const frames = unique(m.frames), sessions = unique(m.sessions), clocks = unique(m.clocks);
  const sensors = unique(m.sensors), calibrations = unique(m.calibrations), poses = unique(m.poses);
  const associations = unique(m.associations);
  unique(m.observations);
  for (const session of m.sessions) {
    requireLink(frames, session.worldFrameId); requireLink(frames, session.bodyFrameId);
    if (session.worldFrameId === session.bodyFrameId) throw new Error('REPLAY_FRAME_ROLE_COLLISION');
  }
  for (const clock of m.clocks) if (clock.alignment) interval(clock.alignment.validFromNs, clock.alignment.validUntilNs);
  for (const sensor of m.sensors) {
    const session = requireLink(sessions, sensor.sessionId); requireLink(frames, sensor.frameId);
    if ([session.worldFrameId, session.bodyFrameId].includes(sensor.frameId)) throw new Error('REPLAY_FRAME_ROLE_COLLISION');
  }
  const worldFrames = new Set(m.sessions.map((s) => s.worldFrameId));
  if (m.sessions.some((s) => worldFrames.has(s.bodyFrameId)) || m.sensors.some((s) => worldFrames.has(s.frameId))) {
    throw new Error('REPLAY_FRAME_ROLE_COLLISION');
  }
  for (const c of m.calibrations) {
    const sensor = requireLink(sensors, c.sensorId), session = requireLink(sessions, sensor.sessionId);
    if (c.fromFrameId !== sensor.frameId || c.toFrameId !== session.bodyFrameId) throw new Error('REPLAY_CALIBRATION_DIRECTION');
    interval(c.validFromNs, c.validUntilNs);
  }
  for (const p of m.poses) {
    const session = requireLink(sessions, p.sessionId); requireLink(clocks, p.stamp.clockId);
    if (p.bodyFrameId !== session.bodyFrameId || p.worldFrameId !== session.worldFrameId) throw new Error('REPLAY_POSE_DIRECTION');
  }
  for (const o of m.observations) {
    const sensor = requireLink(sensors, o.sensorId); requireLink(clocks, o.stamp.clockId);
    if ((sensor.modality === 'GNSS') !== (o.gnss !== null)) throw new Error('REPLAY_GNSS_METADATA_SCOPE');
    if (o.gnss && o.gnss.receiverSolution !== 'UNKNOWN' && o.gnss.rawSolutionStatus === null) throw new Error('REPLAY_GNSS_STATUS_NOT_SUPPLIED');
    if (o.timestampMeaning === 'INSTANT' && o.durationNs !== '0') throw new Error('REPLAY_INSTANT_DURATION');
    if (o.pointEstimate) {
      const point = o.pointEstimate;
      const calibration = requireLink(calibrations, point.calibrationId), pose = requireLink(poses, point.poseId);
      requireLink(associations, point.associationId);
      if (calibration.sensorId !== sensor.id || pose.sessionId !== sensor.sessionId) throw new Error('REPLAY_SENSOR_POSE_BINDING');
    }
  }
  const pairs = m.associations.reduce((total, a) => {
    const count = m.observations.filter((o) => o.pointEstimate?.associationId === a.id).length;
    return total + count * (count - 1) / 2;
  }, 0);
  if (pairs > 256) throw new Error('REPLAY_TOO_MANY_COMPARISONS');
  return m;
}

export function manifestArtifactReferences(m: ReplayManifest): ArtifactReference[] {
  const refs = [
    ...m.clocks.flatMap((c) => c.alignment?.evidence ?? []),
    ...m.calibrations.flatMap((c) => c.evidence), ...m.poses.flatMap((p) => p.evidence),
    ...m.observations.flatMap((o) => [o.rawArtifact, ...(o.pointEstimate?.evidence ?? [])]),
  ];
  const byId = new Map<string, ArtifactReference>();
  for (const ref of refs) {
    const prior = byId.get(ref.acquisitionId);
    if (prior && localRecordDigest(prior) !== localRecordDigest(ref)) throw new Error('REPLAY_ARTIFACT_REFERENCE_CONFLICT');
    byId.set(ref.acquisitionId, ref);
  }
  if (byId.size > 128) throw new Error('REPLAY_TOO_MANY_ARTIFACTS');
  return [...byId.values()].sort((a, b) => a.acquisitionId < b.acquisitionId ? -1 : a.acquisitionId > b.acquisitionId ? 1 : 0);
}
