import { NextResponse } from 'next/server';
import { FIXTURE_INSURABILITY_EVENTS } from '@/fixtures/frontier/anchors';

export async function GET() {
  return NextResponse.json({
    schema: 'payload.frontier.insurability-change-feed.v1',
    doctrine: {
      role: 'INSURABILITY_CHANGE_FEED_PROVIDER',
      boundary: 'State DOI withdrawal and coverage gap change feed; does not underwrite or model carrier risk pricing.',
    },
    count: FIXTURE_INSURABILITY_EVENTS.length,
    events: FIXTURE_INSURABILITY_EVENTS,
  });
}
