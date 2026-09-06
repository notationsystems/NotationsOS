import { NextRequest } from 'next/server';
import { json, refusal } from '../../../_lib';
import {
  FIXTURE_BITEMPORAL_OBSERVATIONS,
  FIXTURE_EXTRACTION_RUNS,
  FIXTURE_SOURCE_ARTIFACTS,
  FIXTURE_ACQUISITION_EVENTS,
  FIXTURE_CARRIER_IDENTITIES,
} from '@/fixtures/frontier/productionCorpus';
import { traceObservationLineage } from '@/domain/productionPipeline';

interface Params {
  params: Promise<{ observationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const resolved = await params;
  const observationId = decodeURIComponent(resolved.observationId || '').trim();

  const trace = traceObservationLineage(
    observationId,
    FIXTURE_BITEMPORAL_OBSERVATIONS,
    FIXTURE_EXTRACTION_RUNS,
    FIXTURE_SOURCE_ARTIFACTS,
    FIXTURE_ACQUISITION_EVENTS,
    FIXTURE_CARRIER_IDENTITIES
  );

  if (!trace) {
    return refusal(
      404,
      'OBSERVATION_LINEAGE_NOT_FOUND',
      `No lineage chain could be reconstructed for observation ${observationId}`,
      'Verify the observationId exists in /api/v1/insurability/filings'
    );
  }

  return json({
    schema: 'payload.frontier.lineage-trace.v1',
    observationId: trace.observationId,
    verificationRung: trace.verificationRung,
    
    // Connected Lineage Graph
    lineageChain: {
      step1_acquisition: {
        acquisitionId: trace.acquisitionEvent.acquisitionId,
        sourceUrl: trace.acquisitionEvent.sourceUrl,
        jurisdiction: trace.acquisitionEvent.jurisdiction,
        capturedAt: trace.acquisitionEvent.capturedAt,
        httpStatusCode: trace.acquisitionEvent.httpStatusCode,
        workerVersion: trace.acquisitionEvent.workerVersion,
        producedArtifactDigest: trace.acquisitionEvent.artifactDigest,
      },
      step2_retainedArtifact: {
        artifactDigest: trace.sourceArtifact.artifactDigest,
        storageUri: trace.sourceArtifact.storageUri,
        byteLength: trace.sourceArtifact.contentSizePayloadBytes,
        mimeType: trace.sourceArtifact.mimeType,
        textPayload: trace.sourceArtifact.textPayload,
        resolveUrl: `/api/v1/evidence/artifacts/${encodeURIComponent(trace.sourceArtifact.artifactDigest)}`,
        rawDownloadUrl: `/api/v1/evidence/artifacts/${encodeURIComponent(trace.sourceArtifact.artifactDigest)}?raw=true`,
      },
      step3_extractionRun: {
        extractionId: trace.extractionRun.extractionId,
        extractorVersion: trace.extractionRun.extractorVersion,
        extractedAt: trace.extractionRun.extractedAt,
        inputArtifactDigest: trace.extractionRun.inputArtifactDigest,
        outputObservationId: trace.extractionRun.outputObservationId,
        extractionReceiptDigest: trace.extractionRun.extractionReceiptDigest,
        fieldsExtracted: trace.extractionRun.fieldsExtracted,
        provenanceCheckPassed: trace.extractionRun.provenanceCheckPassed,
      },
      step4_observation: {
        observationId: trace.observation.observationId,
        carrierNaic: trace.observation.carrierNaic,
        carrierGroup: trace.observation.carrierGroup,
        stateCode: trace.observation.stateCode,
        jurisdiction: trace.observation.jurisdiction,
        filingType: trace.observation.filingType,
        validTime: trace.observation.validTime,
        knowledgeTime: trace.observation.knowledgeTime,
        admissionStatus: trace.observation.admissionStatus,
        targetGeographies: trace.observation.targetGeographies,
        terms: trace.observation.terms,
      },
      step5_carrierIdentity: trace.carrierIdentity ? {
        carrierNaic: trace.carrierIdentity.carrierNaic,
        legalEntityName: trace.carrierIdentity.legalEntityName,
        stateOfDomicile: trace.carrierIdentity.stateOfDomicile,
        activeStatus: trace.carrierIdentity.activeStatus,
        provenanceCitation: trace.carrierIdentity.provenanceCitation,
      } : null,
    },

    // Cryptographic & Integrity Proof
    integrity: trace.integrity,
  });
}
