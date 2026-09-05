import { describe, expect, it } from 'vitest';

import type { SourceRegistration, SourceUseRequest } from './contracts';
import { evaluateSourceUse } from './source-policy';

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
});
