import { syntheticReplayManifest } from '../../examples/observations/synthetic-manifest';
import { byteDigest } from '../data-os/evidence-capture';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference, ReplayManifest } from './contract';
import { compileReplay, type ReplayComputation } from './replay';

export type ObservationReplayPreview = {
  mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED';
  manifest: ReplayManifest;
  computation: ReplayComputation;
  artifact: { id: string; content: unknown; contentDigest: string };
};

/**
 * The synthetic replay manifest with, added for the preview only, the support
 * failures the contract can express: an unaligned clock, a calibration that
 * has expired, a pose stamped after its observation, and a supplied point
 * whose time support is unresolved. Every addition is invented and says so.
 */
export function previewManifest(raw: ArtifactReference): ReplayManifest {
  const m = syntheticReplayManifest(raw);
  const method = { id: 'synthetic-test-declaration', version: '1.0.0', description: 'Analytic invented inputs; no extraction, field observation or calibration measurement.' };
  const evidence = [raw];
  const identity = { translationM: [0, 0, 0] as [number, number, number], rotationXyzw: [0, 0, 0, 1] as [number, number, number, number] };
  const frame = (id: string) => ({ id, kind: 'LOCAL_CARTESIAN' as const, units: 'METRE' as const, handedness: 'RIGHT' as const, axes: 'Synthetic right-handed x-forward y-left z-up.', origin: 'Invented analytic origin; no geographic registration.' });
  m.frames.push(frame('session-b-RADAR-frame'), frame('session-b-drift-LIDAR-frame'));
  m.clocks.push({ id: 'session-b-drift-clock', basis: 'DEVICE_MONOTONIC', epoch: 'Synthetic device counter with no declared mapping to the common timeline.', alignment: null });
  m.sensors.push(
    { id: 'session-b-RADAR', sessionId: 'session-b', frameId: 'session-b-RADAR-frame', modality: 'RADAR' },
    { id: 'session-b-drift-LIDAR', sessionId: 'session-b', frameId: 'session-b-drift-LIDAR-frame', modality: 'LIDAR' },
  );
  m.calibrations.push(
    // Expired before the observation it is asked to support.
    { id: 'session-b-RADAR-calibration', version: '0.9.0', sensorId: 'session-b-RADAR', fromFrameId: 'session-b-RADAR-frame', toFrameId: 'session-b-body', timelineId: 'test-timeline', validFromNs: '1600000000000000000', validUntilNs: '1600000000500000000', sensorToBody: { ...identity, translationM: [0.5, 0, 0] }, covariance6: null, method, evidence },
    { id: 'session-b-drift-LIDAR-calibration', version: '1.0.0', sensorId: 'session-b-drift-LIDAR', fromFrameId: 'session-b-drift-LIDAR-frame', toFrameId: 'session-b-body', timelineId: 'test-timeline', validFromNs: '1600000000000000000', validUntilNs: '1600000010000000000', sensorToBody: { ...identity, translationM: [1, 0, 0] }, covariance6: null, method, evidence },
  );
  // A pose ten milliseconds after the observation that names it: exact support only, no interpolation.
  m.poses.push({ id: 'session-b-late-pose', sessionId: 'session-b', bodyFrameId: 'session-b-body', worldFrameId: 'world', stamp: { clockId: 'session-b-clock', timeNs: '1600000001010000001' }, bodyToWorld: { ...identity, translationM: [11.2, 0, 0] }, covariance6: null, method, evidence });
  m.observations.push(
    { id: 'session-b-RADAR-observation', sensorId: 'session-b-RADAR', stamp: { clockId: 'session-b-clock', timeNs: '1600000001000000001' }, timestampMeaning: 'INSTANT', durationNs: '0', rawArtifact: raw, encoding: 'SYNTHETIC_TEST_TEXT_NOT_SENSOR_DATA', processing: method, gnss: null,
      pointEstimate: { sensorPointM: [4.5, 0, 0], covarianceM2: null, associationId: 'invented-static-object', calibrationId: 'session-b-RADAR-calibration', poseId: 'session-b-late-pose', method, evidence, temporalSupport: 'AT_REFERENCE_STAMP' } },
    { id: 'session-b-drift-LIDAR-observation', sensorId: 'session-b-drift-LIDAR', stamp: { clockId: 'session-b-drift-clock', timeNs: '4242' }, timestampMeaning: 'MIDPOINT', durationNs: '100000000', rawArtifact: raw, encoding: 'SYNTHETIC_TEST_TEXT_NOT_SENSOR_DATA', processing: method, gnss: null,
      pointEstimate: { sensorPointM: [4, 0, 0], covarianceM2: null, associationId: 'invented-static-object', calibrationId: 'session-b-drift-LIDAR-calibration', poseId: 'session-b-pose', method, evidence, temporalSupport: 'UNRESOLVED' } },
  );
  return m;
}

/** In-memory synthetic preview for the browser: no acquisition receipt, no policy decision and no retained report are asserted. */
export function buildObservationReplayPreview(): ObservationReplayPreview {
  const content = { schema: 'payload.synthetic-observation-input.v1', evidenceClass: 'SYNTHETIC_TEST', description: 'Invented analytic input: not an image, point cloud, GNSS fix, calibration survey or IMU measurement.' };
  const contentDigest = byteDigest(encodeLocalRecord(content));
  const id = 'synthetic-preview-input-v1';
  const raw: ArtifactReference = { acquisitionId: id, acquisitionDigest: localRecordDigest({ kind: 'SYNTHETIC_PREVIEW_DESCRIPTOR_NOT_ACQUISITION', id, contentDigest }), contentDigest };
  const manifest = previewManifest(raw);
  return { mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED', manifest, computation: compileReplay(manifest), artifact: { id, content, contentDigest } };
}
