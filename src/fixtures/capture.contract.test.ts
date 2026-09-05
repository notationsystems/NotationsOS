/**
 * Every fixture artifact's capture binding is reproducible with the data-os
 * contracts: an ALLOWED INGEST decision from the source's registration,
 * captureEvidence over the artifact's canonical bytes, and
 * verifyEvidenceCapture against the store. Node only (data-os capture hashes
 * with node:crypto); the browser only renders the stamped binding.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURE_CASES } from './index';
import { artifactBytes } from './digestPlan';
import { CAPTURE_SOURCE } from './capture';
import { CARAVAN_REGISTRATIONS, CARAVAN_CORPUS } from './caravan/release';
import { evaluateSourceUse } from '@/data-os/source-policy';
import { captureEvidence, InMemoryContentAddressedStore, storageKeyFor, verifyEvidenceCapture } from '@/data-os/evidence-capture';
import { deliveryDecision, currentRelease, derivePermittedUses, USE_REQUESTS } from '@/domain/corpus';

describe('fixture captures reproduce under the data-os evidence-capture contract', () => {
  const artifacts = new Map<string, (typeof FIXTURE_CASES)[number]['evidence'][number]>();
  for (const c of FIXTURE_CASES) for (const e of c.evidence) artifacts.set(e.evidenceId, e);

  it('captures every artifact only under an explicitly ALLOWED INGEST decision and reproduces the stamped binding', () => {
    expect(artifacts.size).toBe(14);
    for (const [evidenceId, e] of artifacts) {
      const sourceId = CAPTURE_SOURCE[evidenceId];
      const registration = CARAVAN_REGISTRATIONS[sourceId];
      expect(registration, `${evidenceId} has a registered source`).toBeDefined();
      const decision = evaluateSourceUse(registration, { requestId: `capture:${evidenceId}:ingest`, registrationId: registration.registrationId, purpose: 'CARAVAN_CORPUS', operation: 'INGEST', audience: 'INTERNAL', requestedAt: e.knownAt });
      expect(decision.state).toBe('ALLOWED');
      const store = new InMemoryContentAddressedStore();
      const result = captureEvidence({
        evidenceId,
        workflowId: `capture:${evidenceId}`,
        sourceRegistration: registration,
        ingestDecision: decision,
        bytes: artifactBytes(e),
        mediaType: e.capture!.evidence.mediaType,
        capturedAt: e.capture!.evidence.capturedAt,
        storedAt: e.capture!.receipt.storedAt,
        store,
      });
      expect(result.evidence).toEqual(e.capture!.evidence);
      expect(result.receipt).toEqual(e.capture!.receipt);
      expect(result.evidence.contentDigest).toBe(`sha256:${e.contentHash}`);
      expect(storageKeyFor(result.evidence.contentDigest)).toBe(e.capture!.evidence.storageKey);
      expect(verifyEvidenceCapture(result, store)).toBe(true);
      expect(result.evidence.sourceTruthClaimed).toBe(false);
    }
  });

  it('corpus records carry the capture digest, key and receipt of the artifact they were extracted from', () => {
    for (const r of CARAVAN_CORPUS.records) {
      const e = artifacts.get(r.provenance.artifactId!);
      expect(e, r.recordId).toBeDefined();
      expect(r.provenance.contentDigest).toBe(e!.capture!.evidence.contentDigest);
      expect(r.provenance.storageKey).toBe(e!.capture!.evidence.storageKey);
      expect(r.provenance.receiptId).toBe(e!.capture!.receipt.receiptId);
    }
  });
});

describe('the rights matrix is the data-os policy evaluated exactly', () => {
  const release = currentRelease(CARAVAN_CORPUS);

  it('permitted uses are derived from each registration, and no registration permits proprietary strategy or trading', () => {
    for (const s of release.sources) {
      expect(s.permittedUses).toEqual(derivePermittedUses(s.registration, release.knownAt, s.sourceId));
      expect(s.registration.prohibitedPurposes).toEqual(expect.arrayContaining(['PROPRIETARY_STRATEGY', 'TRADING']));
      expect(s.permittedUses).not.toContain('proprietary_strategy');
      expect(s.permittedUses).not.toContain('trading');
    }
  });

  it('delivery is an exact EXPORT/CUSTOMER decision; the sponsor\'s private material is DENIED with reasons', () => {
    const contract = CARAVAN_CORPUS.records.find((r) => r.provenance.sourceId === 'harbourline-deals')!;
    const d = deliveryDecision(release, contract, 'COUNTERPARTY_SHARED')!;
    expect(d.state).toBe('DENIED');
    expect(d.reasons).toEqual(['AUDIENCE_NOT_PERMITTED', 'OPERATION_NOT_PERMITTED']);
    const weight = CARAVAN_CORPUS.records.find((r) => r.recordId === 'REC-0204')!;
    expect(deliveryDecision(release, weight, 'COUNTERPARTY_SHARED')!.state).toBe('ALLOWED');
    // publishing to the public needs explicit approval for a certificate source
    const moisture = CARAVAN_CORPUS.records.find((r) => r.recordId === 'REC-0201')!;
    expect(deliveryDecision(release, moisture, 'PUBLIC_RULING')!.state).toBe('APPROVAL_REQUIRED');
    expect(USE_REQUESTS.customer_delivery).toEqual({ purpose: 'CARAVAN_CORPUS', operation: 'EXPORT', audience: 'CUSTOMER' });
  });
});
