import { describe, expect, it, vi } from 'vitest';

import type { ContentAddressedStore, EvidenceCaptureRequest, EvidenceCaptureResult, SourceRegistration } from './contracts';
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

function captureRequest(overrides: Partial<EvidenceCaptureRequest> = {}): EvidenceCaptureRequest {
  return {
    evidenceId: 'artifact:port-notice-001', workflowId: 'capture-001', sourceRegistration: registration,
    ingestDecision: ingestDecision(), bytes: encoder.encode('Berth 4 closed due to weather.'), mediaType: 'text/plain',
    capturedAt: '2026-09-15T12:00:00Z', storedAt: '2026-09-15T12:01:00Z',
    store: new InMemoryContentAddressedStore(), ...overrides,
  };
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

  it.each(['DENIED', 'APPROVAL_REQUIRED'] as const)('refuses %s before any object-store write', (state) => {
    const store = new InMemoryContentAddressedStore();
    const put = vi.spyOn(store, 'put');
    expect(() => captureEvidence(captureRequest({ store, ingestDecision: { ...ingestDecision(), state } }))).toThrow();
    expect(put).not.toHaveBeenCalled();
  });

  it('recomputes a forged ALLOWED grant against the actual source policy before storage', () => {
    const store = new InMemoryContentAddressedStore();
    const put = vi.spyOn(store, 'put');
    const deniedPolicy = { ...registration, allowedOperations: ['RETRIEVE'] as const };
    expect(() => captureEvidence(captureRequest({ store, sourceRegistration: deniedPolicy }))).toThrow('does not recompute');
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects a once-valid decision reused at or after source expiry before storage', () => {
    const store = new InMemoryContentAddressedStore();
    const put = vi.spyOn(store, 'put');
    expect(() => captureEvidence(captureRequest({ store, capturedAt: '2026-10-01T00:00:00Z', storedAt: '2026-10-01T00:01:00Z' }))).toThrow('exact capture time');
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    { decisionId: 'forged' }, { requestId: 'different-request' }, { reasons: ['UNSUPPORTED_GRANT'] },
    { evaluatedAt: '2026-09-15T12:00:01Z' }, { request: { ...ingestDecision().request, purpose: 'PROPRIETARY_RESEARCH' } },
    { request: { ...ingestDecision().request, audience: 'PUBLIC' as const } },
    { request: { ...ingestDecision().request, requestedAt: '2026-09-15T12:00:00.000Z' } },
  ])('refuses changed decision bindings before storage: %j', (changes) => {
    const store = new InMemoryContentAddressedStore();
    const put = vi.spyOn(store, 'put');
    expect(() => captureEvidence(captureRequest({ store, ingestDecision: { ...ingestDecision(), ...changes } }))).toThrow();
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    { evidenceId: '' }, { workflowId: ' ' }, { bytes: new Uint8Array() }, { bytes: [1, 2] },
    { mediaType: 'not-a-mime-type' }, { mediaType: null }, { capturedAt: '2026-02-30T00:00:00Z' },
    { storedAt: 'September 15, 2026' }, { storedAt: '2026-09-15T11:00:00Z' },
    { ingestDecision: null }, { sourceRegistration: null },
  ])('validates capture inputs before writing: %j', (changes) => {
    const store = new InMemoryContentAddressedStore();
    const put = vi.spyOn(store, 'put');
    expect(() => captureEvidence({ ...captureRequest({ store }), ...changes } as EvidenceCaptureRequest)).toThrow();
    expect(put).not.toHaveBeenCalled();
  });

  it.each(['contentDigest', 'byteLength', 'storageKey'] as const)('rejects a false store write response for %s', (field) => {
    const memory = new InMemoryContentAddressedStore();
    const store: ContentAddressedStore = {
      put(bytes) {
        const actual = memory.put(bytes);
        return { ...actual, [field]: field === 'byteLength' ? actual.byteLength + 1 : 'wrong' };
      },
      get: (digest) => memory.get(digest),
    };
    expect(() => captureEvidence(captureRequest({ store }))).toThrow('write response');
  });

  it.each(['missing', 'corrupt', 'unavailable'])('refuses a receipt when storage readback is %s', (mode) => {
    const memory = new InMemoryContentAddressedStore();
    const store: ContentAddressedStore = {
      put: (bytes) => memory.put(bytes),
      get() {
        if (mode === 'unavailable') throw new Error('store unavailable');
        return mode === 'missing' ? undefined : encoder.encode('corrupt bytes');
      },
    };
    expect(() => captureEvidence(captureRequest({ store }))).toThrow();
  });

  it('accepts reordered decision object keys and detached matching storage bytes', () => {
    const use = ingestDecision();
    const reordered = Object.fromEntries(Object.entries(use).reverse()) as unknown as typeof use;
    reordered.request = Object.fromEntries(Object.entries(use.request).reverse()) as unknown as typeof use.request;
    const store = new InMemoryContentAddressedStore();
    expect(verifyEvidenceCapture(captureEvidence(captureRequest({ ingestDecision: reordered, store })), store)).toBe(true);
  });
});

describe('verifyEvidenceCapture', () => {
  it.each([
    { evidenceId: '' }, { sourceId: '' }, { mediaType: 'invalid' }, { sourceTruthClaimed: true },
    { capturedAt: '2026-09-31T00:00:00Z' }, { capturedAt: '2026-09-15T13:00:00Z' },
    { byteLength: -1 }, { byteLength: 1.5 }, { contentDigest: 'malformed' }, { storageKey: 'wrong-key' },
  ])('returns false for malformed evidence: %j', (changes) => {
    const store = new InMemoryContentAddressedStore();
    const result = captureEvidence(captureRequest({ store }));
    expect(verifyEvidenceCapture({ ...result, evidence: { ...result.evidence, ...changes } } as EvidenceCaptureResult, store)).toBe(false);
  });

  it.each([{ receiptId: '' }, { evidenceId: 'different' }, { storedAt: 'not a date' }, { storedAt: '2026-09-15T11:00:00Z' }, { storageKey: 'wrong-key' }])('returns false for malformed receipt: %j', (changes) => {
    const store = new InMemoryContentAddressedStore();
    const result = captureEvidence(captureRequest({ store }));
    expect(verifyEvidenceCapture({ ...result, receipt: { ...result.receipt, ...changes } }, store)).toBe(false);
  });

  it('returns false instead of throwing for malformed results and missing or unavailable storage', () => {
    const store = new InMemoryContentAddressedStore();
    const result = captureEvidence(captureRequest({ store }));
    for (const value of [null, undefined, {}, { evidence: null, receipt: null }]) {
      expect(verifyEvidenceCapture(value as unknown as EvidenceCaptureResult, store)).toBe(false);
    }
    expect(verifyEvidenceCapture(result, { get: () => undefined })).toBe(false);
    expect(verifyEvidenceCapture(result, { get: () => { throw new Error('disk corruption'); } })).toBe(false);
    expect(verifyEvidenceCapture(result, { get: () => encoder.encode('corrupt bytes') })).toBe(false);
  });
});
