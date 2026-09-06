import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  FIXTURE_BITEMPORAL_OBSERVATIONS,
  FIXTURE_SOURCE_ARTIFACTS,
  FIXTURE_EXTRACTION_RUNS,
  FIXTURE_ACQUISITION_EVENTS,
  FIXTURE_CARRIER_IDENTITIES,
} from '@/fixtures/frontier/productionCorpus';
import {
  queryFilingsAsOf,
  traceObservationLineage,
  verifyArtifactIntegrity,
  calculateBytesDigest,
} from '@/domain/productionPipeline';
import { GET as statusRoute } from '@/app/api/v1/status/route';
import { GET as filingsRoute } from '@/app/api/v1/insurability/filings/route';
import { GET as artifactRoute } from '@/app/api/v1/evidence/artifacts/[hash]/route';
import { GET as traceRoute } from '@/app/api/v1/evidence/trace/[observationId]/route';
import { NextRequest } from 'next/server';

describe('The Verification Ladder: Rung 3 - End-to-End Lineage Trace', () => {
  it('traces a single record end-to-end: filings query -> artifact hash -> retained original bytes -> extraction run connecting them', () => {
    // 1. Query admitted filings as of a knowledge time
    const asOf = '2026-09-01T00:00:00Z';
    const admitted = queryFilingsAsOf(FIXTURE_BITEMPORAL_OBSERVATIONS, asOf);
    expect(admitted.length).toBeGreaterThan(0);

    // 2. Select St. Johns liquidation observation
    const stJohns = admitted.find((o) => o.observationId === 'OBS-FL-2022-STJOHNS');
    expect(stJohns).toBeDefined();
    const artifactHash = stJohns!.sourceArtifactDigest;
    expect(artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // 3. Resolve the artifact hash to retained original bytes
    const artifact = FIXTURE_SOURCE_ARTIFACTS.find((a) => a.artifactDigest === artifactHash);
    expect(artifact).toBeDefined();
    expect(artifact!.textPayload).toContain('CONSENT ORDER OF LIQUIDATION NO. 291124-22');

    // 4. Compute cryptographic SHA-256 digest from retained bytes independently
    const rawBuffer = Buffer.from(artifact!.textPayload, 'utf-8');
    const computedDigest = 'sha256:' + createHash('sha256').update(rawBuffer).digest('hex');

    // SUBSTANCE ASSERTION: The retained bytes MUST compute down to the bit to the declared artifactDigest
    expect(computedDigest).toBe(artifactHash);
    expect(rawBuffer.byteLength).toBe(artifact!.contentSizePayloadBytes);

    // 5. Confirm the extraction-run record connects the acquisition event, the input artifact, and the output observation
    const trace = traceObservationLineage(
      stJohns!.observationId,
      FIXTURE_BITEMPORAL_OBSERVATIONS,
      FIXTURE_EXTRACTION_RUNS,
      FIXTURE_SOURCE_ARTIFACTS,
      FIXTURE_ACQUISITION_EVENTS,
      FIXTURE_CARRIER_IDENTITIES
    );

    expect(trace).toBeDefined();
    expect(trace!.dataClass).toBe('synthetic');
    expect(trace!.verificationRung.level).toBe(3);
    expect(trace!.acquisitionEvent.acquisitionId).toBe('ACQ-FL-2022-STJOHNS');
    expect(trace!.acquisitionEvent.artifactDigest).toBe(artifactHash);
    expect(trace!.extractionRun.inputArtifactDigest).toBe(artifactHash);
    expect(trace!.extractionRun.outputObservationId).toBe(stJohns!.observationId);
    expect(trace!.extractionRun.fieldsExtracted.carrierNaic).toBe('10749');
    expect(trace!.extractionRun.fieldsExtracted.filingType).toBe('RECEIVERSHIP_LIQUIDATION');
    expect(trace!.carrierIdentity?.legalEntityName).toBe('ST. JOHNS INSURANCE COMPANY, INC.');

    // 6. Verify cryptographic integrity flags
    expect(trace!.integrity.retainedPayloadMatchesArtifactDigest).toBe(true);
    expect(trace!.integrity.extractionReceiptValid).toBe(true);
    expect(trace!.integrity.byteLength).toBe(artifact!.contentSizePayloadBytes);
  });

  it('rejects verification if retained artifact bytes are modified or tampered with', () => {
    const artifact = FIXTURE_SOURCE_ARTIFACTS[0];
    const tamperedArtifact = {
      ...artifact,
      textPayload: artifact.textPayload + ' [TAMPERED CONTENT]',
    };

    const integrityCheck = verifyArtifactIntegrity(tamperedArtifact);
    expect(integrityCheck.matches).toBe(false);
    expect(integrityCheck.calculatedDigest).not.toBe(tamperedArtifact.artifactDigest);
  });

  it('proves every single fixture artifact in the corpus has an exact byte-for-byte SHA-256 match', () => {
    for (const artifact of FIXTURE_SOURCE_ARTIFACTS) {
      const integrity = verifyArtifactIntegrity(artifact);
      expect(integrity.matches).toBe(true);
      expect(integrity.calculatedDigest).toBe(artifact.artifactDigest);
      expect(integrity.byteLength).toBe(artifact.contentSizePayloadBytes);
    }
  });

  it('self-attests system verification rung and data class at GET /api/v1/status', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/status');
    const res = await statusRoute(req);
    expect(res.status).toBe(200);

    // Headers must self-attest
    expect(res.headers.get('X-Payload-Data-Class')).toBe('synthetic');
    expect(res.headers.get('X-Payload-Corpus-Release')).toBe('osiris-insurability@2026.09.30.1-synthetic');
    expect(res.headers.get('X-Payload-Verification-Rung')).toBe('3-substance-trace');

    const data = await res.json();
    expect(data.data_class).toBe('synthetic');
    expect(data.corpus_release).toBe('osiris-insurability@2026.09.30.1-synthetic');
    expect(data.parameter_set_version).toBe('PARAM-2026-Q3-V1');
    expect(data.records).toEqual({
      admitted: 0,
      candidate: 0,
      quarantined: 0,
      synthetic: 4,
      artifacts_retained: 4,
      extractions_registered: 4,
    });
    expect(data.verification_ladder.current_rung).toBe(3);
    expect(data.verification_ladder.rungs.find((r: { rung: number }) => r.rung === 3).status).toBe('VERIFIED');
    expect(data.lineage_anchor.artifact_resolve_url).toContain('df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e');
  });

  it('resolves raw retained original bytes via GET /api/v1/evidence/artifacts/[hash]', async () => {
    const hash = 'sha256:df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e';
    const req = new NextRequest(`http://localhost:3000/api/v1/evidence/artifacts/${hash}?raw=true`);
    const res = await artifactRoute(req, { params: Promise.resolve({ hash }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Payload-Integrity-Verified')).toBe('true');
    expect(res.headers.get('X-Payload-Content-Digest')).toBe(hash);

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const computedDigest = calculateBytesDigest(bytes);
    expect(computedDigest).toBe(hash);
  });

  it('reconstructs end-to-end lineage graph via GET /api/v1/evidence/trace/[observationId]', async () => {
    const observationId = 'OBS-FL-2022-STJOHNS';
    const req = new NextRequest(`http://localhost:3000/api/v1/evidence/trace/${observationId}`);
    const res = await traceRoute(req, { params: Promise.resolve({ observationId }) });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data_class).toBe('synthetic');
    expect(body.observationId).toBe(observationId);
    expect(body.lineageChain.step1_acquisition.acquisitionId).toBe('ACQ-FL-2022-STJOHNS');
    expect(body.lineageChain.step2_retainedArtifact.artifactDigest).toBe('sha256:df2aaf97f23b66f305b9fbb20ae0fbd0d01cfa51d8fed8f544d9bf2d10a7ce7e');
    expect(body.lineageChain.step3_extractionRun.extractionId).toBe('EXT-FL-2022-001');
    expect(body.lineageChain.step4_observation.carrierGroup).toBe('St. Johns Insurance Co');
    expect(body.lineageChain.step5_carrierIdentity.carrierNaic).toBe('10749');
    expect(body.integrity.retainedPayloadMatchesArtifactDigest).toBe(true);
    expect(body.integrity.extractionReceiptValid).toBe(true);
  });

  it('ensures GET /api/v1/insurability/filings self-attests data_class and includes lineage URLs on every filing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/insurability/filings');
    const res = await filingsRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.data_class).toBe('synthetic');
    expect(data.records).toEqual({
      admitted: 0,
      candidate: 0,
      quarantined: 0,
      synthetic: 4,
    });

    for (const filing of data.filings) {
      expect(filing.artifact_resolve_url).toBeDefined();
      expect(filing.trace_url).toBeDefined();
      expect(filing.sourceArtifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
});
