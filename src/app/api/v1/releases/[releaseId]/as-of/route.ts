import type { NextRequest } from 'next/server';
import { asOfPayload } from '@/adapter/feed';
import { json, refusal } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;

/** GET /api/v1/releases/:releaseId/as-of?subject=&predicate=&validAt=&knownAt= — one reconstructed answer or a typed refusal. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await ctx.params;
  const p = req.nextUrl.searchParams;
  const subjectId = p.get('subject');
  const predicate = p.get('predicate');
  const validAt = p.get('validAt');
  const knownAt = p.get('knownAt');
  if (!subjectId || !predicate || !validAt || !knownAt) {
    return refusal(400, 'query_incomplete', 'subject, predicate, validAt and knownAt are all required.', 'Name the subject and predicate, the world time the answer must describe, and the knowledge cutoff.');
  }
  if (!ISO.test(validAt) || !ISO.test(knownAt)) {
    return refusal(400, 'time_not_iso_utc', 'validAt and knownAt must be ISO 8601 UTC instants, e.g. 2026-08-28T14:00:00Z.', 'State both clocks in UTC.');
  }
  const body = await asOfPayload(decodeURIComponent(releaseId), { subjectId, predicate, validAt, knownAt });
  if (!body) return refusal(404, 'release_not_found', `No release ${releaseId} in the current source.`, 'List releases at /api/v1/releases.');
  return json(body);
}
