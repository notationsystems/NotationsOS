import type { NextRequest } from 'next/server';
import { rulingManifestPayload, viewerFromParam } from '@/adapter/feed';
import { json, refusal } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/rulings/:rulingId/manifest[?projection=] — the notations.result-manifest.v1 sidecar. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ rulingId: string }> }) {
  const { rulingId } = await ctx.params;
  const body = await rulingManifestPayload(decodeURIComponent(rulingId), viewerFromParam(req.nextUrl.searchParams.get('projection')));
  if (!body) return refusal(404, 'ruling_not_found', `No ruling ${rulingId} in the current source.`, 'List rulings at /rulings.');
  return json(body, 'error' in body ? 403 : 200);
}
