import type { NextRequest } from 'next/server';
import { retractionsPayload, viewerFromParam } from '@/adapter/feed';
import { json } from '../_lib';

/** GET /api/v1/retractions[?since=&projection=] — push retractions: corrections and withdrawals, oldest first. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return json(await retractionsPayload(p.get('since') ?? undefined, viewerFromParam(p.get('projection'))));
}
