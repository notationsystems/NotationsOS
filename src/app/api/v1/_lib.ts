import { NextResponse } from 'next/server';

/**
 * Fixture feed responses. Deterministic, uncached, JSON. Every body carries
 * fixture_only: true (see src/adapter/feed.ts); this header repeats it so a
 * client that never reads the body cannot mistake the feed for a live one.
 */
export function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Payload-Fixture-Only': 'true', 'X-Payload-Feed': 'payload-os.feed.v0-demo' },
  });
}

export function refusal(status: number, error: string, detail: string, remedy: string) {
  return json({ fixture_only: true, error, detail, remedy }, status);
}
