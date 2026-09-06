import { NextResponse } from 'next/server';
import { FIXTURE_DISCLOSURE_PACKS } from '@/fixtures/frontier/anchors';

export async function GET() {
  return NextResponse.json({
    schema: 'payload.frontier.disclosure-assurance.v1',
    doctrine: {
      role: 'ASSURANCE_SUBSTRATE_PROVIDER',
      boundary: 'Evidence packs for accredited verifiers; does not issue third-party audit opinions.',
    },
    count: FIXTURE_DISCLOSURE_PACKS.length,
    packs: FIXTURE_DISCLOSURE_PACKS,
  });
}
