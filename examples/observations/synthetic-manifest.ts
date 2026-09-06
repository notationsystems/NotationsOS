import type { ArtifactReference, ReplayManifest } from '../../src/observation/contract';

/** Analytic test only: these bytes, points and clocks are NOT recorded sensor measurements. */
export function syntheticReplayManifest(ref: ArtifactReference): ReplayManifest {
  const method = { id: 'synthetic-test-declaration', version: '1.0.0', description: 'Analytic invented inputs; no extraction, field observation or calibration measurement.' };
  const evidence = [ref];
  const identity = { translationM: [0, 0, 0] as [number, number, number], rotationXyzw: [0, 0, 0, 1] as [number, number, number, number] };
  const sessions = ['session-a', 'session-b'].map((id) => ({ id, worldFrameId: 'world', bodyFrameId: `${id}-body` }));
  const modalities = ['LIDAR', 'CAMERA', 'GNSS', 'IMU'] as const;
  const sensors = sessions.flatMap((s) => modalities.map((modality) => ({ id: `${s.id}-${modality}`, sessionId: s.id, frameId: `${s.id}-${modality}-frame`, modality })));
  const frames = ['world', ...sessions.map((s) => s.bodyFrameId), ...sensors.map((s) => s.frameId)].map((id) => ({
    id, kind: 'LOCAL_CARTESIAN' as const, units: 'METRE' as const, handedness: 'RIGHT' as const,
    axes: 'Synthetic right-handed x-forward y-left z-up.', origin: 'Invented analytic origin; no geographic registration.',
  }));
  const nativeTime = (session: string) => session === 'session-a' ? '1600000000000000001' : '1600000001000000001';
  const clocks = sessions.map((s) => ({ id: `${s.id}-clock`, basis: 'DATASET' as const, epoch: 'Synthetic arbitrary ns epoch, not UTC or GPS.',
    alignment: { timelineId: 'test-timeline', offsetNs: '0', validFromNs: '1600000000000000000', validUntilNs: '1600000010000000000',
      uncertaintyNs: null, method, evidence } }));
  const calibrations = sensors.filter((s) => ['LIDAR', 'CAMERA'].includes(s.modality)).map((s) => ({
    id: `${s.id}-calibration`, version: '1.0.0', sensorId: s.id, fromFrameId: s.frameId, toFrameId: `${s.sessionId}-body`,
    timelineId: 'test-timeline', validFromNs: '1600000000000000000', validUntilNs: '1600000010000000000',
    sensorToBody: { ...identity, translationM: [s.modality === 'LIDAR' ? 1 : 0, 0, 0] as [number, number, number] },
    covariance6: null, method, evidence,
  }));
  const poses = sessions.map((s) => ({
    id: `${s.id}-pose`, sessionId: s.id, bodyFrameId: s.bodyFrameId, worldFrameId: 'world',
    stamp: { clockId: `${s.id}-clock`, timeNs: nativeTime(s.id) },
    bodyToWorld: { ...identity, translationM: [s.id === 'session-a' ? 10 : 11, 0, 0] as [number, number, number] },
    covariance6: null, method, evidence,
  }));
  const observations = sensors.map((s) => ({
    id: `${s.id}-observation`, sensorId: s.id, stamp: { clockId: `${s.sessionId}-clock`, timeNs: nativeTime(s.sessionId) },
    timestampMeaning: 'INSTANT' as const, durationNs: '0', rawArtifact: ref,
    encoding: 'SYNTHETIC_TEST_TEXT_NOT_SENSOR_DATA', processing: method,
    gnss: s.modality === 'GNSS' ? { rawSolutionStatus: null, receiverSolution: 'UNKNOWN' as const, correctionService: null, correctionAgeNs: null } : null,
    pointEstimate: ['LIDAR', 'CAMERA'].includes(s.modality) ? {
      sensorPointM: [s.modality === 'LIDAR' ? (s.sessionId === 'session-a' ? 5 : 4) : (s.sessionId === 'session-a' ? 6 : 5.05), 0, 0] as [number, number, number],
      covarianceM2: null, associationId: 'invented-static-object', calibrationId: `${s.id}-calibration`, poseId: `${s.sessionId}-pose`,
      method, evidence, temporalSupport: 'AT_REFERENCE_STAMP' as const,
    } : null,
  }));
  return { schema: 'payload.recorded-observation-manifest.v1', datasetId: 'synthetic-replay-test', evidenceClass: 'SYNTHETIC_TEST',
    purpose: 'recorded-observation-replay', frames, sessions, clocks, sensors, calibrations, poses,
    associations: [{ id: 'invented-static-object', authority: 'OPERATOR_ASSERTION', description: 'Invented stationary object for analytic residual testing.',
      uncertaintyDescription: 'Unquantified; correspondence is an operator assertion, not verified identity.' }], observations };
}
