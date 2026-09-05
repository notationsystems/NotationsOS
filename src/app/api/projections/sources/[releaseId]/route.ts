import { NextResponse } from 'next/server';
import { describeProjectionSource } from '@/projection/source';
import { ProjectionError } from '@/projection/spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Payload-Fixture-Only': 'true' };

export async function GET(_request: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  try { return NextResponse.json(describeProjectionSource((await params).releaseId), { headers }); }
  catch (error) {
    const code = error instanceof ProjectionError ? error.code : 'PROJECTION_UNAVAILABLE';
    return NextResponse.json({ fixture_only: true, error: code }, { headers, status: code === 'SOURCE_NOT_AVAILABLE' ? 404 : 503 });
  }
}
