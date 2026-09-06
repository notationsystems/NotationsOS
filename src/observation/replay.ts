import { localRecordDigest } from '../data-os/local-record';
import { MAX_REPLAY_REPORT_BYTES, parseReplayManifest, type ReplayManifest } from './contract';
import { comparePositions, placePoint, type Vec3 } from './rigid';

export const REPLAY_METHOD = Object.freeze({
  id: 'payload.recorded-observation-replay', version: '1.0.0',
  transforms: 'ACTIVE_XYZW_SENSOR_TO_BODY_THEN_BODY_TO_WORLD',
  time: 'INTEGER_NS_EXPLICIT_OFFSET_HALF_OPEN_VALIDITY_EXACT_POSE_ONLY',
  covariance: 'PRESERVED_NOT_PROPAGATED', association: 'OPERATOR_ASSERTION_NOT_IDENTITY',
});

type AlignedTime = { timelineId: string; timeNs: string; uncertaintyNs: string | null };
export type ReplayRow = {
  observationId: string; sensorId: string; sessionId: string; modality: string;
  alignedTime: AlignedTime | null; poseDeltaNs: string | null;
  state: 'UNPLACED' | 'PLACED_ESTIMATE'; blockers: string[];
  worldFrameId: string; worldPointM: Vec3 | null; associationId: string | null;
  uncertainty: 'NOT_PROPAGATED';
};

function align(m: ReplayManifest, stamp: { clockId: string; timeNs: string }): AlignedTime | null {
  const a = m.clocks.find((clock) => clock.id === stamp.clockId)!.alignment;
  if (!a || BigInt(stamp.timeNs) < BigInt(a.validFromNs) || BigInt(stamp.timeNs) >= BigInt(a.validUntilNs)) return null;
  return { timelineId: a.timelineId, timeNs: String(BigInt(stamp.timeNs) + BigInt(a.offsetNs)), uncertaintyNs: a.uncertaintyNs };
}

/** Pure deterministic computation. The store verifies retained evidence/policy before calling this. */
export function compileReplay(value: unknown) {
  const m = parseReplayManifest(value);
  const rows: ReplayRow[] = m.observations.map((o) => {
    const sensor = m.sensors.find((s) => s.id === o.sensorId)!;
    const session = m.sessions.find((s) => s.id === sensor.sessionId)!;
    const time = align(m, o.stamp);
    const point = o.pointEstimate;
    const row: ReplayRow = {
      observationId: o.id, sensorId: sensor.id, sessionId: session.id, modality: sensor.modality,
      alignedTime: time, poseDeltaNs: null, state: 'UNPLACED', blockers: [],
      worldFrameId: session.worldFrameId, worldPointM: null, associationId: point?.associationId ?? null,
      uncertainty: 'NOT_PROPAGATED',
    };
    if (!time) row.blockers.push('CLOCK_ALIGNMENT_UNAVAILABLE');
    if (!point) row.blockers.push('NO_POINT_ESTIMATE');
    if (point) {
      const c = m.calibrations.find((c) => c.id === point.calibrationId)!;
      const pose = m.poses.find((p) => p.id === point.poseId)!;
      const poseTime = align(m, pose.stamp);
      if (point.temporalSupport !== 'AT_REFERENCE_STAMP') row.blockers.push('POINT_TIME_UNRESOLVED');
      if (o.timestampMeaning === 'UNKNOWN') row.blockers.push('TIMESTAMP_MEANING_UNRESOLVED');
      if (!time || c.timelineId !== time.timelineId || BigInt(time.timeNs) < BigInt(c.validFromNs) || BigInt(time.timeNs) >= BigInt(c.validUntilNs)) {
        row.blockers.push('CALIBRATION_NOT_VALID_AT_OBSERVATION');
      }
      if (!poseTime || !time || poseTime.timelineId !== time.timelineId) row.blockers.push('POSE_CLOCK_ALIGNMENT_UNAVAILABLE');
      else {
        row.poseDeltaNs = String(BigInt(poseTime.timeNs) - BigInt(time.timeNs));
        if (row.poseDeltaNs !== '0') row.blockers.push('POSE_TIME_MISMATCH');
      }
      if (row.blockers.length === 0) {
        row.worldPointM = placePoint(c.sensorToBody, pose.bodyToWorld, point.sensorPointM);
        row.state = 'PLACED_ESTIMATE';
      }
    }
    row.blockers.sort();
    return row;
  }).sort((a, b) => {
    // Compare only a declared shared timeline. No assumed equivalence across unknown clock bases.
    const ak = a.alignedTime?.timelineId ?? '\uffff', bk = b.alignedTime?.timelineId ?? '\uffff';
    if (ak !== bk) return ak < bk ? -1 : 1;
    if (a.alignedTime && b.alignedTime) {
      const delta = BigInt(a.alignedTime.timeNs) - BigInt(b.alignedTime.timeNs);
      if (delta !== BigInt(0)) return delta < BigInt(0) ? -1 : 1;
    }
    return a.observationId < b.observationId ? -1 : 1;
  });
  const comparisons: Array<{
    associationId: string; leftObservationId: string; rightObservationId: string;
    crossSession: boolean; state: 'RESIDUAL_ONLY' | 'UNRESOLVED'; blockers: string[];
    deltaM: Vec3 | null; distanceM: number | null; timestampDeltaNs: string | null; accuracyEstablished: false;
    limitations: string[];
  }> = [];
  for (const association of m.associations) {
    const selected = rows.filter((r) => r.associationId === association.id);
    for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
      const left = selected[i], right = selected[j];
      const blockers: string[] = [];
      if (!left.worldPointM || !right.worldPointM) blockers.push('POSITION_UNAVAILABLE');
      if (left.worldFrameId !== right.worldFrameId) blockers.push('WORLD_FRAME_MISMATCH');
      // Object persistence/motion and correspondence have NOT been inferred from proximity.
      const residual = blockers.length === 0 ? comparePositions(left.worldPointM!, right.worldPointM!) : null;
      comparisons.push({ associationId: association.id, leftObservationId: left.observationId, rightObservationId: right.observationId,
        crossSession: left.sessionId !== right.sessionId, state: residual ? 'RESIDUAL_ONLY' : 'UNRESOLVED', blockers,
        deltaM: residual?.deltaM ?? null, distanceM: residual?.distanceM ?? null,
        timestampDeltaNs: left.alignedTime && right.alignedTime && left.alignedTime.timelineId === right.alignedTime.timelineId
          ? String(BigInt(right.alignedTime.timeNs) - BigInt(left.alignedTime.timeNs)) : null,
        accuracyEstablished: false, limitations: ['UNCERTAINTY_NOT_PROPAGATED', 'ASSOCIATION_UNVERIFIED', 'NO_STATIC_SCENE_OR_MOTION_MODEL'] });
    }
  }
  const payload = {
    schema: 'payload.recorded-observation-computation.v1' as const,
    datasetId: m.datasetId, evidenceClass: m.evidenceClass,
    manifestDigest: localRecordDigest(m, MAX_REPLAY_REPORT_BYTES),
    method: REPLAY_METHOD, methodDigest: localRecordDigest(REPLAY_METHOD),
    authority: 'LOCAL_DERIVED_INSPECTION' as const, canonicalAdmission: false, earthProjectionEligible: false,
    sensorFusionPerformed: false, objectIdentityEstablished: false, accuracyEstablished: false,
    rows, comparisons,
  };
  return { ...payload, digest: localRecordDigest(payload, MAX_REPLAY_REPORT_BYTES) };
}

export type ReplayComputation = ReturnType<typeof compileReplay>;
