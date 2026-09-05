import { describe, expect, it } from 'vitest';

import type { SourceRegistration, SourceUseRequest } from './contracts';
import { evaluateSourceUse, validateSourceRegistration } from './source-policy';

const registration: SourceRegistration = {
  registrationId: 'source:port-authority-notices',
  sourceId: 'notation://source/port-authority/notices',
  displayName: 'Port authority notices',
  sourceClass: 'PUBLIC_NOTICE',
  licenseId: 'port-authority-terms-2026',
  policyVersion: '1.0.0',
  effectiveFrom: '2026-09-01T00:00:00Z',
  effectiveUntil: '2026-10-01T00:00:00Z',
  permittedPurposes: ['CARAVAN_CORPUS'],
  allowedOperations: ['INGEST', 'INDEX', 'RETRIEVE'],
  approvalRequiredOperations: ['PUBLISH'],
  allowedAudiences: ['INTERNAL', 'TENANT'],
  retention: { mode: 'UNTIL_SOURCE_EXPIRY' },
};

function request(overrides: Partial<SourceUseRequest> = {}): SourceUseRequest {
  return {
    requestId: 'request-001',
    registrationId: registration.registrationId,
    purpose: 'CARAVAN_CORPUS',
    operation: 'INGEST',
    audience: 'INTERNAL',
    requestedAt: '2026-09-15T12:00:00Z',
    ...overrides,
  };
}

describe('evaluateSourceUse', () => {
  it('allows an exact granted use inside the half-open policy window', () => {
    const result = evaluateSourceUse(registration, request());
    expect(result.state).toBe('ALLOWED');
    expect(result.reasons).toEqual(['EXPLICIT_POLICY_GRANT']);
  });

  it('does not infer publishing permission from ingest permission', () => {
    const result = evaluateSourceUse(registration, request({ operation: 'PUBLISH' }));
    expect(result.state).toBe('APPROVAL_REQUIRED');
    expect(result.reasons).toEqual(['EXPLICIT_APPROVAL_REQUIRED']);
  });

  it('denies an unlisted purpose and reports the precise reason', () => {
    const result = evaluateSourceUse(registration, request({ purpose: 'PROPRIETARY_RESEARCH' }));
    expect(result.state).toBe('DENIED');
    expect(result.reasons).toEqual(['PURPOSE_NOT_PERMITTED']);
  });

  it('denies a request at the exclusive authorization end', () => {
    const result = evaluateSourceUse(registration, request({ requestedAt: '2026-10-01T00:00:00Z' }));
    expect(result.state).toBe('DENIED');
    expect(result.reasons).toContain('OUTSIDE_EFFECTIVE_WINDOW');
  });

  it('accepts real leap dates and explicit timezone offsets', () => {
    const policy = { ...registration, effectiveFrom: '2024-02-29T00:00:00.000Z', effectiveUntil: '2024-03-01T00:00:00Z' };
    expect(evaluateSourceUse(policy, request({ requestedAt: '2024-02-29T12:30:15.5+02:30' })).state).toBe('ALLOWED');
    expect(evaluateSourceUse(policy, request({ requestedAt: '2024-03-01T02:30:00+02:30' })).state).toBe('DENIED');
  });

  it.each([
    'September 15, 2026', '2026-09-15', '2026-09-15T12:00:00',
    '2026-02-29T12:00:00Z', '2026-04-31T12:00:00Z', '2026-13-01T00:00:00Z',
    '2026-09-15T24:00:00Z', '2026-09-15T12:60:00Z', '2026-09-15T12:00:60Z',
    '2026-09-15T12:00:00+24:00', '2026-09-15T12:00:00+01:60', '2026-09-15T12:00:00.1234Z',
  ])('rejects noninstant or rollover request time %s', (requestedAt) => {
    expect(() => evaluateSourceUse(registration, request({ requestedAt }))).toThrow('ISO 8601');
  });

  it('checks registration and retention instants with the same calendar rules', () => {
    expect(() => validateSourceRegistration({ ...registration, effectiveFrom: '2026-02-30T00:00:00Z' })).toThrow('calendar');
    expect(() => validateSourceRegistration({ ...registration, effectiveUntil: 'October 1, 2026' })).toThrow('ISO 8601');
    expect(() => validateSourceRegistration({ ...registration, retention: { mode: 'UNTIL', until: '2026-09-31T00:00:00Z' } })).toThrow('calendar');
  });

  it.each([
    null, [], { ...registration, sourceId: '' }, { ...registration, registrationId: 'source with spaces' },
    { ...registration, permittedPurposes: 'CARAVAN_CORPUS' }, { ...registration, permittedPurposes: [null] },
    { ...registration, allowedOperations: null }, { ...registration, allowedAudiences: [4] },
    { ...registration, retention: null }, { ...registration, approvalRequiredOperations: null },
    { ...registration, prohibitedPurposes: null }, { ...registration, effectiveUntil: null },
  ])('rejects malformed runtime registration %j', (policy) => {
    expect(() => evaluateSourceUse(policy as unknown as SourceRegistration, request())).toThrow();
  });

  it.each([null, [], { ...request(), requestId: '' }, { ...request(), requestedAt: 0 }, { ...request(), purpose: null }])('rejects malformed runtime request %j', (use) => {
    expect(() => evaluateSourceUse(registration, use as unknown as SourceUseRequest)).toThrow();
  });
});
