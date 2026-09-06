import type { SourceRegistration } from '../data-os/contracts';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord } from '../data-os/local-record';
import { parseISOInstant } from '../data-os/validation';
import type { ArtifactReference } from '../observation/contract';
import { parseReplayJson } from '../observation/json';
import { parseSamsaraAuthorization, SAMSARA_PURPOSE, type SamsaraAuthorization } from './samsara-contract';
import type { SamsaraHistoryQuery } from './samsara-http';
import { SamsaraCaptureStore } from './samsara-store';

/** An invented offline response, not a captured fleet position or a facility visit. */
export function syntheticSamsaraGpsResponse(scope: SamsaraHistoryQuery) {
  const start = parseISOInstant(scope.startTime, 'startTime');
  return { data: [{ id: scope.vehicleId, name: 'SYNTHETIC vehicle; no real fleet', gps: [
    { time: new Date(start).toISOString(), latitude: 43.65, longitude: -79.38, speedMilesPerHour: 12, isEcuSpeed: false, headingDegrees: 90 },
    { time: new Date(start + 60_000).toISOString(), latitude: 43.65, longitude: -79.379 },
    { time: new Date(start + 120_000).toISOString(), latitude: 43.65, longitude: -79.379, speedMilesPerHour: 0, isEcuSpeed: true },
  ] }], pagination: { endCursor: '', hasNextPage: false } };
}

export function samsaraDemoPolicy(at: string): SourceRegistration {
  const time = parseISOInstant(at, 'now'), from = new Date(time - 1000).toISOString(), until = new Date(time + 7 * 24 * 3600_000).toISOString();
  return { registrationId: 'samsara-synthetic-demo-policy-v1', sourceId: 'samsara-vehicle-gps', displayName: 'Synthetic Samsara-shaped local test; no provider permission',
    sourceClass: 'synthetic-test', licenseId: 'operator-declaration:synthetic-only', policyVersion: '1.0.0', effectiveFrom: from, effectiveUntil: until,
    permittedPurposes: [SAMSARA_PURPOSE], allowedOperations: ['INGEST', 'DERIVE', 'RETRIEVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'UNTIL', until } };
}

/** Explicit offline transport; never reads PAYLOAD_SAMSARA_TOKEN or contacts any provider. */
export async function runSamsaraDemo(root: string, at = new Date().toISOString()) {
  // A mistaken --root must not contaminate an already bound fleet with synthetic artifacts.
  const binding = readImmutableFile(root, ['samsara-binding.json'], 4096);
  const expectedBinding = encodeLocalRecord({ schema: 'payload.samsara-local-binding.v1', connectionId: 'samsara-synthetic-connection',
    fleetId: 'synthetic-fleet', region: 'CA', organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED' });
  if (binding && !binding.equals(expectedBinding)) throw new Error('SAMSARA_LOCAL_BINDING_CONFLICT');
  const intake = new LocalEvidenceIntake(root), authorizationId = 'samsara-synthetic-authorization-v1';
  const existing = intake.inspect(authorizationId);
  let authorization: ArtifactReference;
  if (existing) authorization = { acquisitionId: authorizationId, acquisitionDigest: existing.digest, contentDigest: existing.request.contentDigest };
  else {
    // Reuse a partial demo's original declaration without renewing its finite window.
    const termsId = 'samsara-synthetic-terms-v1', priorTerms = intake.inspect(termsId);
    const policy = priorTerms?.request.manifest.sourceRegistration ?? samsaraDemoPolicy(at);
    const originalTime = priorTerms?.request.manifest.capturedAt ?? at;
    const end = Math.floor((parseISOInstant(originalTime, 'now') - 1000) / 60_000) * 60_000;
    const scope: SamsaraHistoryQuery = { region: 'CA', vehicleId: '900000000000001', startTime: new Date(end - 10 * 60_000).toISOString(), endTime: new Date(end).toISOString() };
    const capture = (id: string, value: unknown) => {
      const acquired = intake.capture({ schema: 'payload.local-intake-request.v1', acquisitionId: id, evidenceId: `${id}:evidence`,
        sourceRegistration: policy, purpose: SAMSARA_PURPOSE, mediaType: 'application/json', capturedAt: originalTime }, encodeLocalRecord(value), at).acquisition;
      return { acquisitionId: id, acquisitionDigest: acquired.digest, contentDigest: acquired.request.contentDigest };
    };
    const termsEvidence = capture(termsId, { evidenceClass: 'SYNTHETIC_TEST', statement: 'Invented offline records only. This document grants no access to Samsara or customer data.' });
    const declaration: SamsaraAuthorization = { schema: 'payload.samsara-authorization.v1', connectionId: 'samsara-synthetic-connection', fleetId: 'synthetic-fleet',
      authority: 'FLEET_OPERATOR_DECLARATION', evidenceClass: 'SYNTHETIC_TEST', organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED', providerApiVersion: 'UNVERIFIED',
      privacyBasis: 'No real vehicle, driver, fleet or physical visit; explicit synthetic test.', termsEvidence, scope, sourceRegistration: policy };
    authorization = capture(authorizationId, declaration);
  }
  const acquired = intake.inspect(authorizationId)!;
  const declaration = parseSamsaraAuthorization(parseReplayJson(intake.objects.get(acquired.request.contentDigest)!, 32 * 1024));
  const store = new SamsaraCaptureStore(root, { mode: 'SYNTHETIC_OFFLINE', now: () => at,
    token: () => 'SYNTHETIC-NOT-A-CREDENTIAL', fetch: async (scope) => {
      if (JSON.stringify(scope) !== JSON.stringify(declaration.scope)) throw new Error('SAMSARA_DEMO_SCOPE_MISMATCH');
      return { bytes: encodeLocalRecord(syntheticSamsaraGpsResponse(scope)), mediaType: 'application/json' };
    } });
  return store.capture({ schema: 'payload.samsara-capture-request.v1', requestId: 'samsara-synthetic-capture-v1', authorization }, true);
}
