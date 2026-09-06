import { NextRequest, NextResponse } from 'next/server';
import { json, refusal, STANDARD_ATTESTATION_HEADERS } from '../../../_lib';
import { FIXTURE_SOURCE_ARTIFACTS } from '@/fixtures/frontier/productionCorpus';
import { calculateBytesDigest } from '@/domain/productionPipeline';

interface Params {
  params: Promise<{ hash: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const resolved = await params;
  let rawHash = decodeURIComponent(resolved.hash || '').trim();
  if (!rawHash.startsWith('sha256:')) {
    rawHash = `sha256:${rawHash}`;
  }

  const artifact = FIXTURE_SOURCE_ARTIFACTS.find((a) => a.artifactDigest === rawHash);
  if (!artifact) {
    return refusal(404, 'ARTIFACT_NOT_FOUND', `No retained artifact found matching digest ${rawHash}`, 'Verify the artifactDigest matches a known observation source digest.');
  }

  const payloadBuffer = Buffer.from(artifact.textPayload, 'utf-8');
  const calculatedDigest = calculateBytesDigest(payloadBuffer);
  const integrityMatches = calculatedDigest === artifact.artifactDigest;

  const url = new URL(req.url);
  const wantsRaw = url.searchParams.get('raw') === 'true' || req.headers.get('accept') === 'application/octet-stream';

  if (wantsRaw) {
    return new NextResponse(payloadBuffer, {
      status: 200,
      headers: {
        ...STANDARD_ATTESTATION_HEADERS,
        'Content-Type': artifact.mimeType || 'text/plain; charset=utf-8',
        'Content-Length': payloadBuffer.byteLength.toString(),
        'ETag': `"${artifact.artifactDigest}"`,
        'X-Payload-Content-Digest': artifact.artifactDigest,
        'X-Payload-Integrity-Verified': integrityMatches ? 'true' : 'false',
      },
    });
  }

  return json({
    schema: 'payload.frontier.artifact-inspection.v1',
    artifactDigest: artifact.artifactDigest,
    storageUri: artifact.storageUri,
    mimeType: artifact.mimeType,
    byteLength: payloadBuffer.byteLength,
    textPayload: artifact.textPayload,
    retainedPayloadChecksum: artifact.retainedPayloadChecksum,
    integrity: {
      verified: integrityMatches,
      calculatedDigest,
      expectedDigest: artifact.artifactDigest,
      exactMatch: integrityMatches,
    },
    rawDownloadUrl: `/api/v1/evidence/artifacts/${encodeURIComponent(artifact.artifactDigest)}?raw=true`,
  });
}
