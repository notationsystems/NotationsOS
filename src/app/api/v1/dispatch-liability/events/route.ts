import { json } from '../../_lib';
import { FIXTURE_DISPATCH_STREAM } from '@/fixtures/caravan/dispatchLiability';
import { verifyDispatchStreamIntegrity } from '@/domain/dispatchLiability';

export async function GET() {
  const chainVerification = verifyDispatchStreamIntegrity(FIXTURE_DISPATCH_STREAM);

  return json({
    schema: 'payload.dispatch-liability.stream-index.v1',
    fixture_only: true,
    streamChainIntact: chainVerification.intact,
    eventCount: FIXTURE_DISPATCH_STREAM.length,
    events: FIXTURE_DISPATCH_STREAM.map((e) => ({
      decisionId: e.decisionId,
      sequenceIndex: e.sequenceIndex,
      previousEventDigest: e.previousEventDigest,
      eventDigest: e.eventDigest,
      decisionTimestamp: e.decisionTimestamp,
      knowledgeCutoff: e.knowledgeCutoff,
      carrierName: e.carrierSafetySnapshot.legalName,
      carrierUsdot: e.carrierSafetySnapshot.usdot,
      loadId: e.load.loadId,
      selectionAllowed: e.qualificationVerdict.selectionAllowed,
      doctrineCompliance: e.qualificationVerdict.doctrineCompliance,
      riskScorePercentile: e.qualificationVerdict.riskScorePercentile,
      windowBlockId: e.rollingAttestation.windowBlockId,
    })),
  });
}
