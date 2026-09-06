import { NextRequest } from 'next/server';
import { json } from '../../_lib';
import { FIXTURE_BITEMPORAL_OBSERVATIONS, FIXTURE_SOURCE_ARTIFACTS } from '@/fixtures/frontier/productionCorpus';
import { queryFilingsAsOf } from '@/domain/productionPipeline';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get('asOf');

  const asOfDate = asOf || new Date().toISOString();
  const admittedFilings = queryFilingsAsOf(FIXTURE_BITEMPORAL_OBSERVATIONS, asOfDate);

  const filingsWithLineageLinks = admittedFilings.map((filing) => ({
    ...filing,
    artifact_resolve_url: `/api/v1/evidence/artifacts/${encodeURIComponent(filing.sourceArtifactDigest)}`,
    artifact_raw_download_url: `/api/v1/evidence/artifacts/${encodeURIComponent(filing.sourceArtifactDigest)}?raw=true`,
    trace_url: `/api/v1/evidence/trace/${filing.observationId}`,
  }));

  return json({
    schema: 'payload.frontier.insurability.filings.v1',
    asOfKnowledgeTime: asOfDate,
    count: admittedFilings.length,
    records: {
      admitted: 0,
      candidate: 0,
      quarantined: 0,
      synthetic: admittedFilings.length,
    },
    doctrine: {
      role: 'INSURABILITY_CHANGE_FEED_PROVIDER',
      sourceArchive: 'Public State Insurance Department SERFF Filings & Regulatory Orders (CDI, FL OIR, TDI)',
      boundary: 'Evidence substrate of insurance availability changes; does not write insurance policies or provide actuarial pricing.',
      bitemporalGuarantee: 'Knowledge-time bounded query eliminates future lookahead bias.',
    },
    filings: filingsWithLineageLinks,
    sourceArtifactDigests: FIXTURE_SOURCE_ARTIFACTS.map((a) => a.artifactDigest),
  });
}

