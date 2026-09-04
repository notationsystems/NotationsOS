import { describe, expect, it } from 'vitest';

import type { SourceRegistration } from './contracts';
import { captureEvidence, InMemoryContentAddressedStore, verifyEvidenceCapture } from './evidence-capture';
import { evaluateSourceUse } from './source-policy';

const encoder = new TextEncoder();
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
  allowedOperations: ['INGEST'],
  allowedAudiences: ['INTERNAL'],
  retention: { mode: 'UNTIL_SOURCE_EXPIRY' },
};

function ingestDecision() {
  return evaluateSourceUse(registration, {
    requestId: 'ingest-001',
    registrationId: registration.registrationId,
    purpose: 'CARAVAN_CORPUS',
    operation: 'INGEST',
    audience: 'INTERNAL',
    requestedAt: '2026-09-15T12:00:00Z',
  });
}

describe('captureEvidence', () => {
  it('binds source bytes to an explicitly allowed ingest decision and storage receipt', () => {
    const store = new InMemoryContentAddressedStore();
    const result = captureEvidence({
      evidenceId: 'artifact:port-notice-001',
      workflowId: 'capture-001',
      sourceRegistration: registration,
      ingestDecision: ingestDecision(),
      bytes: encoder.encode('Berth 4 closed due to weather.'),
      mediaType: 'text/plain',
      capturedAt: '2026-09-15T12:00:00Z',
      storedAt: '2026-09-15T12:01:00Z',
      store,
    });

    expect(result.evidence.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.evidence.sourceTruthClaimed).toBe(false);
    expect(verifyEvidenceCapture(result, store)).toBe(true);
  });

  it('refuses bytes without an explicitly allowed ingest decision', () => {
    const decision = evaluateSourceUse(registration, {
      requestId: 'retrieve-001', registrationId: registration.registrationId,
      purpose: 'CARAVAN_CORPUS', operation: 'RETRIEVE', audience: 'INTERNAL', requestedAt: '2026-09-15T12:00:00Z',
    });
    expect(() => captureEvidence({
      evidenceId: 'artifact:port-notice-002', workflowId: 'capture-002', sourceRegistration: registration,
      ingestDecision: decision, bytes: encoder.encode('Notice'), mediaType: 'text/plain',
      capturedAt: '2026-09-15T12:00:00Z', storedAt: '2026-09-15T12:01:00Z', store: new InMemoryContentAddressedStore(),
    })).toThrow('ALLOWED INGEST decision');
  });
});
