import { describe, expect, it } from 'vitest';
import { parseSamsaraAuthorization, parseSamsaraCaptureRequest, SAMSARA_PURPOSE, type SamsaraAuthorization } from './samsara-contract';
import { samsaraDemoPolicy } from './samsara-demo';
import { evaluateSourceUse } from '../data-os/source-policy';

const at = '2026-09-05T12:30:00.000Z';
const reference = () => ({ acquisitionId: 'retained-authorization', acquisitionDigest: `sha256:${'a'.repeat(64)}`, contentDigest: `sha256:${'b'.repeat(64)}` });
const request = () => ({ schema: 'payload.samsara-capture-request.v1', requestId: 'bounded-capture-v1', authorization: reference() });
const authorization = (): SamsaraAuthorization => ({
  schema: 'payload.samsara-authorization.v1', connectionId: 'connection-1', fleetId: 'fleet-1',
  authority: 'FLEET_OPERATOR_DECLARATION', evidenceClass: 'SYNTHETIC_TEST',
  organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED', providerApiVersion: 'UNVERIFIED',
  privacyBasis: 'Synthetic fixture only; no actual location collection authority.', termsEvidence: reference(),
  scope: { region: 'CA', vehicleId: '123', startTime: '2026-09-05T12:00:00.000Z', endTime: '2026-09-05T12:15:00.000Z' },
  sourceRegistration: samsaraDemoPolicy(at),
});

describe('Samsara operator authorization contract', () => {
  it('snapshots exact retained request references without embedding credential or inline authority', () => {
    const input = request(), parsed = parseSamsaraCaptureRequest(input);
    expect(parsed).toEqual(input); expect(parsed).not.toBe(input); expect(parsed.authorization).not.toBe(input.authorization);
    input.authorization.contentDigest = `sha256:${'c'.repeat(64)}`;
    expect(parsed.authorization.contentDigest).toBe(`sha256:${'b'.repeat(64)}`);
  });

  it('preserves operator-declared, unverified identity and provider version boundaries', () => {
    const input = authorization(), parsed = parseSamsaraAuthorization(input);
    expect(parsed).toEqual(input); expect(parsed.sourceRegistration).not.toBe(input.sourceRegistration);
    expect(parsed.organizationBinding).toBe('OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED');
    expect(parsed.providerApiVersion).toBe('UNVERIFIED');
  });

  it('permits CUSTOMER_FLEET declarations only with the matching authorized source class', () => {
    const input = authorization(); input.evidenceClass = 'CUSTOMER_FLEET'; input.sourceRegistration.sourceClass = 'authorized-fleet-telematics';
    expect(parseSamsaraAuthorization(input).evidenceClass).toBe('CUSTOMER_FLEET');
  });

  it('grants exactly internal ingest, derive and retrieve, never customer distribution or model training', () => {
    const { sourceRegistration: registration } = parseSamsaraAuthorization(authorization());
    for (const operation of ['INGEST', 'DERIVE', 'RETRIEVE', 'EXPORT', 'PUBLISH', 'INDEX', 'MODEL_TRAINING'] as const) {
      for (const audience of ['INTERNAL', 'CUSTOMER', 'PUBLIC', 'TENANT'] as const) {
        const decision = evaluateSourceUse(registration, { requestId: 'evaluate', registrationId: registration.registrationId,
          purpose: SAMSARA_PURPOSE, operation, audience, requestedAt: at });
        expect(decision.state).toBe(audience === 'INTERNAL' && ['INGEST', 'DERIVE', 'RETRIEVE'].includes(operation) ? 'ALLOWED' : 'DENIED');
      }
    }
  });

  it('accepts reordered exact operation declarations and explicit empty approval requirements', () => {
    const input = authorization(); input.sourceRegistration.allowedOperations = ['RETRIEVE', 'INGEST', 'DERIVE'];
    input.sourceRegistration.approvalRequiredOperations = [];
    expect(parseSamsaraAuthorization(input)).toEqual(input);
  });

  it('accepts exactly 31 days and a strictly positive shorter retention interval', () => {
    const input = authorization(); input.sourceRegistration.effectiveFrom = '2026-09-01T00:00:00.000Z';
    input.sourceRegistration.effectiveUntil = '2026-10-02T00:00:00.000Z';
    input.sourceRegistration.retention = { mode: 'UNTIL', until: '2026-09-20T00:00:00.000Z' };
    expect(parseSamsaraAuthorization(input)).toEqual(input);
  });

  it.each(['', '../capture', 'capture/one', 'capture\\one', 'capture one', 'capture\n', 'x'.repeat(81), 'https://example.test'])('rejects unsafe request and connection identifiers %s', (id) => {
    expect(() => parseSamsaraCaptureRequest({ ...request(), requestId: id })).toThrow();
    expect(() => parseSamsaraAuthorization({ ...authorization(), connectionId: id })).toThrow();
    expect(() => parseSamsaraAuthorization({ ...authorization(), fleetId: id })).toThrow();
  });

  it.each([
    null, {}, { ...request(), schema: 'payload.samsara-capture-request.v2' },
    { ...request(), token: 'never-accepted' }, { ...request(), url: 'https://example.test' },
    { ...request(), enabled: true }, { ...request(), now: at }, { ...request(), authorization: null },
    { ...request(), authorization: { ...reference(), contentDigest: 'sha256:abc' } },
    { ...request(), authorization: { ...reference(), acquisitionDigest: `sha256:${'A'.repeat(64)}` } },
    { ...request(), authorization: { ...reference(), acquisitionId: 'contains whitespace' } },
    { ...request(), authorization: { ...reference(), sourceRegistration: {} } },
  ])('refuses malformed or expanded capture request shapes', (input) => {
    expect(() => parseSamsaraCaptureRequest(input)).toThrow();
  });

  it.each(['acquisitionId', 'acquisitionDigest', 'contentDigest'])('requires every exact artifact-reference part: %s', (field) => {
    const ref: Record<string, unknown> = reference(); delete ref[field];
    expect(() => parseSamsaraCaptureRequest({ ...request(), authorization: ref })).toThrow();
    expect(() => parseSamsaraAuthorization({ ...authorization(), termsEvidence: ref })).toThrow();
  });

  it.each([
    { schema: 'payload.samsara-authorization.v2' }, { authority: 'PROVIDER_VERIFIED' }, { evidenceClass: 'PUBLIC' },
    { organizationBinding: 'PROVIDER_VERIFIED' }, { providerApiVersion: '2026-09-05' }, { privacyBasis: '' },
    { privacyBasis: '   ' }, { privacyBasis: 'x'.repeat(513) }, { privacyBasis: 'line\nsecret' },
    { token: 'secret' }, { audience: 'CUSTOMER' }, { admission: true }, { termsEvidence: null },
  ])('rejects unsupported authority claims and authorization fields', (patch) => {
    expect(() => parseSamsaraAuthorization({ ...authorization(), ...patch })).toThrow();
  });

  it.each([
    { region: 'AU' }, { vehicleId: '123,456' }, { vehicleId: '0' }, { vehicleId: '' }, { vehicleId: 123 },
    { startTime: '2026-09-05T12:00:00Z' }, { endTime: '2026-09-05T12:15:00.001Z' },
    { endTime: '2026-09-05T12:00:00.000Z' }, { after: 'opaque-cursor' }, { types: 'gps,engineStates' },
    { url: 'https://example.test' }, { decorations: 'engineStates' },
  ])('does not widen source query boundaries', (patch) => {
    const input = authorization(); expect(() => parseSamsaraAuthorization({ ...input, scope: { ...input.scope, ...patch } })).toThrow();
  });

  it.each([
    { sourceId: 'another-source' }, { sourceClass: 'authorized-fleet-telematics' },
    { permittedPurposes: [SAMSARA_PURPOSE, 'trading'] }, { permittedPurposes: ['source-qualification'] },
    { permittedPurposes: [SAMSARA_PURPOSE, SAMSARA_PURPOSE] },
    { allowedOperations: ['INGEST', 'DERIVE'] }, { allowedOperations: ['INGEST', 'DERIVE', 'RETRIEVE', 'EXPORT'] },
    { allowedOperations: ['INGEST', 'DERIVE', 'RETRIEVE', 'MODEL_TRAINING'] },
    { allowedOperations: ['INGEST', 'DERIVE', 'RETRIEVE', 'RETRIEVE'] },
    { allowedAudiences: ['INTERNAL', 'CUSTOMER'] }, { allowedAudiences: ['TENANT'] },
    { approvalRequiredOperations: ['EXPORT'] }, { retention: { mode: 'INDEFINITE' } },
    { retention: { mode: 'UNTIL_SOURCE_EXPIRY' } }, { retention: { mode: 'UNTIL' } },
    { distributionGranted: true },
  ])('refuses broad or mismatched source registrations', (patch) => {
    const input = authorization(); expect(() => parseSamsaraAuthorization({ ...input, sourceRegistration: { ...input.sourceRegistration, ...patch } })).toThrow();
  });

  it('requires a finite expiry and rejects nonpositive or over-31-day windows', () => {
    const input = authorization(), registration = input.sourceRegistration;
    const { effectiveUntil: _until, ...withoutExpiry } = registration;
    expect(_until).toBeDefined();
    expect(() => parseSamsaraAuthorization({ ...input, sourceRegistration: withoutExpiry })).toThrow();
    for (const until of ['2026-09-05T12:29:59.000Z', '2026-09-05T12:29:58.000Z', '2026-10-06T12:30:00.000Z']) {
      expect(() => parseSamsaraAuthorization({ ...input, sourceRegistration: { ...registration, effectiveUntil: until,
        retention: { mode: 'UNTIL', until } } })).toThrow();
    }
  });

  it('refuses retention at/before activation or beyond source expiry', () => {
    const input = authorization();
    for (const until of [input.sourceRegistration.effectiveFrom, '2026-09-05T12:00:00.000Z', '2026-09-20T00:00:00.000Z']) {
      expect(() => parseSamsaraAuthorization({ ...input, sourceRegistration: { ...input.sourceRegistration, retention: { mode: 'UNTIL', until } } })).toThrow();
    }
  });

  it('refuses an oversized record before a declaration can be used', () => {
    expect(() => parseSamsaraAuthorization({ ...authorization(), privacyBasis: 'x'.repeat(32 * 1024) })).toThrow();
    expect(() => parseSamsaraCaptureRequest({ ...request(), requestId: 'x'.repeat(4096) })).toThrow();
  });
});
