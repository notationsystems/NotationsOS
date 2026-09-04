import { releaseManifestPayload } from '@/adapter/feed';
import { json, refusal } from '../../../_lib';

/** GET /api/v1/releases/:releaseId/manifest — the certified release manifest and its commitment. */
export async function GET(_req: Request, ctx: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await ctx.params;
  const body = await releaseManifestPayload(decodeURIComponent(releaseId));
  if (!body) return refusal(404, 'release_not_found', `No release ${releaseId} in the current source.`, 'List releases at /api/v1/releases.');
  return json(body);
}
