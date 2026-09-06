import { syntheticReplayManifest } from '../../examples/observations/synthetic-manifest';
import { LocalEvidenceIntake, type LocalAcquisition, type LocalIntakeManifest } from '../data-os/local-intake';
import { encodeLocalRecord } from '../data-os/local-record';
import { MAX_REPLAY_MANIFEST_BYTES, type ArtifactReference } from './contract';
import { ObservationReplayStore } from './store';

function ref(a: LocalAcquisition): ArtifactReference {
  return { acquisitionId: a.request.manifest.acquisitionId, acquisitionDigest: a.digest, contentDigest: a.request.contentDigest };
}
function declaration(acquisitionId: string): LocalIntakeManifest {
  return { schema: 'payload.local-intake-request.v1', acquisitionId, evidenceId: `${acquisitionId}:evidence`,
    capturedAt: '2020-01-01T00:00:00.000Z', mediaType: 'application/json', purpose: 'recorded-observation-replay',
    sourceRegistration: { registrationId: 'synthetic-observation-replay:v1', sourceId: 'synthetic-observation-replay',
      displayName: 'SYNTHETIC analytic replay inputs — not field evidence', sourceClass: 'synthetic-test',
      licenseId: 'operator-declaration:synthetic-local-test', policyVersion: '1.0.0', effectiveFrom: '2020-01-01T00:00:00.000Z',
      permittedPurposes: ['recorded-observation-replay'], allowedOperations: ['INGEST', 'DERIVE'],
      allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' } } };
}

/** Explicit synthetic demonstration, separate from source qualification and customer fixtures. */
export function runReplayDemo(root: string, now = new Date().toISOString()) {
  const intake = new LocalEvidenceIntake(root);
  const raw = intake.capture(declaration('synthetic-replay-input-v1'), encodeLocalRecord({
    schema: 'payload.synthetic-observation-input.v1', evidenceClass: 'SYNTHETIC_TEST',
    description: 'Invented analytic input: not an image, point cloud, GNSS fix, calibration survey or IMU measurement.',
  }), now).acquisition;
  const manifest = syntheticReplayManifest(ref(raw));
  const captured = intake.capture(declaration('synthetic-replay-manifest-v1'), encodeLocalRecord(manifest, MAX_REPLAY_MANIFEST_BYTES), now).acquisition;
  return new ObservationReplayStore(root).replay({ schema: 'payload.recorded-observation-replay-request.v1',
    replayId: 'synthetic-replay-v1', manifest: ref(captured) }, now);
}
