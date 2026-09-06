import { z } from 'zod';
import type { SourceRegistration } from '../data-os/contracts';
import { parseLocalIntakeManifest } from '../data-os/local-intake';
import { encodeLocalRecord } from '../data-os/local-record';
import { parseISOInstant } from '../data-os/validation';
import { artifactReference } from '../observation/contract';
import { buildSamsaraHistoryUrl, type SamsaraHistoryQuery } from './samsara-http';

export const SAMSARA_PURPOSE = 'caravan-fleet-qualification';
export const SAMSARA_MAX_RECORD = 512 * 1024;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const text = z.string().min(1).max(512).refine((s) => !!s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const requestSchema = z.object({ schema: z.literal('payload.samsara-capture-request.v1'), requestId: id, authorization: artifactReference }).strict();
export type SamsaraCaptureRequest = z.infer<typeof requestSchema>;
const authorizationSchema = z.object({
  schema: z.literal('payload.samsara-authorization.v1'), connectionId: id, fleetId: id,
  authority: z.literal('FLEET_OPERATOR_DECLARATION'), evidenceClass: z.enum(['CUSTOMER_FLEET', 'SYNTHETIC_TEST']),
  organizationBinding: z.literal('OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED'), providerApiVersion: z.literal('UNVERIFIED'),
  privacyBasis: text, termsEvidence: artifactReference,
  scope: z.object({ region: z.enum(['US', 'EU', 'CA']), vehicleId: z.string(), startTime: z.string(), endTime: z.string() }).strict(),
  sourceRegistration: z.unknown(),
}).strict();
export type SamsaraAuthorization = Omit<z.infer<typeof authorizationSchema>, 'sourceRegistration' | 'scope'> & {
  sourceRegistration: SourceRegistration; scope: SamsaraHistoryQuery;
};

export function parseSamsaraCaptureRequest(value: unknown): SamsaraCaptureRequest {
  return requestSchema.parse(JSON.parse(encodeLocalRecord(value, 4096).toString('utf8')));
}
export function parseSamsaraAuthorization(value: unknown): SamsaraAuthorization {
  const a = authorizationSchema.parse(JSON.parse(encodeLocalRecord(value, 32 * 1024).toString('utf8')));
  buildSamsaraHistoryUrl(a.scope); // Code-owned region, one vehicle, GPS only, <=15 minutes, no cursor.
  const registration = parseLocalIntakeManifest({ schema: 'payload.local-intake-request.v1', acquisitionId: 'validate-samsara-policy',
    evidenceId: 'validate-samsara-policy-evidence', purpose: SAMSARA_PURPOSE, mediaType: 'application/json',
    capturedAt: '2020-01-01T00:00:00.000Z', sourceRegistration: a.sourceRegistration }).sourceRegistration;
  const equal = (a: readonly string[], b: readonly string[]) => a.length === b.length && b.every((v) => a.includes(v));
  // This qualification connector cannot confer public/customer distribution, training or capital use.
  if (registration.sourceId !== 'samsara-vehicle-gps' ||
    registration.sourceClass !== (a.evidenceClass === 'SYNTHETIC_TEST' ? 'synthetic-test' : 'authorized-fleet-telematics') ||
    !equal(registration.permittedPurposes, [SAMSARA_PURPOSE]) ||
    !equal(registration.allowedOperations, ['INGEST', 'DERIVE', 'RETRIEVE']) ||
    !equal(registration.allowedAudiences, ['INTERNAL']) ||
    (registration.approvalRequiredOperations?.length ?? 0) !== 0 ||
    !registration.effectiveUntil || registration.retention.mode !== 'UNTIL' || !registration.retention.until) throw new Error('SAMSARA_POLICY_SCOPE_INVALID');
  const from = parseISOInstant(registration.effectiveFrom, 'effectiveFrom'), until = parseISOInstant(registration.effectiveUntil, 'effectiveUntil');
  const retention = parseISOInstant(registration.retention.until, 'retention.until');
  if (until - from > 31 * 24 * 3600_000 || retention <= from || retention > until) throw new Error('SAMSARA_POLICY_WINDOW_INVALID');
  return { ...a, sourceRegistration: registration };
}
