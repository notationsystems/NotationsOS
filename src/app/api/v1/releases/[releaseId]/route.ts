import { releasePayload } from '@/adapter/feed';
import { json, refusal } from '../../_lib';

/** GET /api/v1/releases/:releaseId — build record, sources and rights, digest, links. */
export async function GET(_req: Request, ctx: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await ctx.params;
  const body = await releasePayload(decodeURIComponent(releaseId));
  if (!body) return refusal(404, 'release_not_found', `No release ${releaseId} in the current source.`, 'List releases at /api/v1/releases.');
  return json(body);
}
