import { NextResponse } from 'next/server';
import { compileProjection } from '@/projection/compile';
import { ProjectionError } from '@/projection/spec';
import { getCorpusSource } from '@/adapter/corpusSource';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Payload-Fixture-Only': 'true' };

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const corpora = await getCorpusSource().listCorpora();
    return NextResponse.json(compileProjection(input, corpora), { headers });
  } catch (error) {
    const code = error instanceof ProjectionError ? error.code : 'PROJECTION_UNAVAILABLE';
    return NextResponse.json({ fixture_only: true, error: code }, { headers, status: code === 'SOURCE_NOT_AVAILABLE' ? 404 : 400 });
  }
}
