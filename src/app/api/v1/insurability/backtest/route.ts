import { NextResponse } from 'next/server';
import { runHistoricalCorpusBacktest } from '@/domain/insurabilityDynamics';

export async function GET() {
  const reports = runHistoricalCorpusBacktest();

  return NextResponse.json({
    schema: 'payload.frontier.insurability.backtest.v1',
    evaluatedAt: new Date().toISOString(),
    doctrine: {
      rule: 'Backtest Track 3 against known events with bitemporal discipline; retain unresolved and excluded cases.',
      invariant: 'Only knowledge knowable at T is queried to measure genuine lead time ahead of debt repricing.',
    },
    reports,
  });
}
