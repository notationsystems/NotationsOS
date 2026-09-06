import type { NextRequest } from 'next/server';
import { releasesPayload } from '@/adapter/feed';
import { json } from '../_lib';

export const dynamic = 'force-static';

/** GET /api/v1/releases[?corpus=] — the release history of every corpus. */
export async function GET(req: NextRequest) {
  const corpusId = req.nextUrl.searchParams.get('corpus') ?? undefined;
  return json(await releasesPayload(corpusId));
}
