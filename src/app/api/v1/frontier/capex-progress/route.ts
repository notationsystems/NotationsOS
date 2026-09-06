import { NextResponse } from 'next/server';
import { FIXTURE_CAPEX_PROGRESS } from '@/fixtures/frontier/anchors';

export async function GET() {
  return NextResponse.json({
    schema: 'payload.frontier.capex-progress-verification.v1',
    doctrine: {
      role: 'PHYSICAL_PROGRESS_STATE_VERIFIER',
      boundary: 'Objective physical progress states via N11 VOI; does not act as certifying engineer of record or draw authorizer.',
    },
    count: FIXTURE_CAPEX_PROGRESS.length,
    verifications: FIXTURE_CAPEX_PROGRESS,
  });
}
