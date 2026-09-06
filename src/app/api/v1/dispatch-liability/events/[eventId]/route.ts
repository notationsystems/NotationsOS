import type { NextRequest } from 'next/server';
import { json, refusal } from '../../../_lib';
import { FIXTURE_DISPATCH_STREAM } from '@/fixtures/caravan/dispatchLiability';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const found = FIXTURE_DISPATCH_STREAM.find(
    (e) => e.decisionId === eventId || e.load.loadId === eventId
  );

  if (!found) {
    return refusal(404, 'event_not_found', `No dispatch liability event matching ${eventId}.`, 'List events via GET /api/v1/dispatch-liability/events');
  }

  return json({
    schema: 'payload.dispatch-liability.decision-event.v1',
    fixture_only: true,
    event: found,
  });
}
