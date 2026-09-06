import type { NextRequest } from 'next/server';
import { rulingPayload, viewerFromParam } from '@/adapter/feed';
import { json, refusal } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/rulings/:rulingId[?projection=] — the application layer: a ruling as the workbench returns it. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ rulingId: string }> }) {
  const { rulingId } = await ctx.params;
  const body = await rulingPayload(decodeURIComponent(rulingId), viewerFromParam(req.nextUrl.searchParams.get('projection')));
  if (!body) return refusal(404, 'ruling_not_found', `No ruling ${rulingId} in the current source.`, 'List rulings at /rulings.');
  return json(body, 'error' in body ? 403 : 200);
}
