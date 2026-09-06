import { NextResponse } from 'next/server';

export const SYSTEM_DATA_CLASS = 'synthetic' as const;
export const SYSTEM_CORPUS_RELEASE = 'osiris-insurability@2026.09.30.1-synthetic' as const;
export const SYSTEM_PARAMETER_SET_VERSION = 'PARAM-2026-Q3-V1' as const;
export const SYSTEM_VERIFICATION_RUNG = 3 as const;
export const SYSTEM_VERIFICATION_RUNG_NAME = 'Substance begins (Hash -> Artifact -> Retained Bytes Traced)' as const;

export const STANDARD_ATTESTATION_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Payload-Data-Class': SYSTEM_DATA_CLASS,
  'X-Payload-Corpus-Release': SYSTEM_CORPUS_RELEASE,
  'X-Payload-Parameter-Set': SYSTEM_PARAMETER_SET_VERSION,
  'X-Payload-Verification-Rung': '3-substance-trace',
  'X-Payload-Fixture-Only': 'true',
  'X-Payload-Feed': 'payload-os.feed.v0-demo',
};

/**
 * Fixture feed responses. Deterministic, uncached, JSON.
 * Self-attests data_class, corpus_release, and verification rung in both headers
 * and payload envelope so clients cannot mistake synthetic fixtures for live/admitted data.
 */
export function json(body: unknown, status = 200, customHeaders: Record<string, string> = {}) {
  let payload = body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    payload = {
      data_class: SYSTEM_DATA_CLASS,
      corpus_release: SYSTEM_CORPUS_RELEASE,
      parameter_set_version: SYSTEM_PARAMETER_SET_VERSION,
      verification_rung: SYSTEM_VERIFICATION_RUNG,
      ...body,
    };
  }

  return NextResponse.json(payload, {
    status,
    headers: {
      ...STANDARD_ATTESTATION_HEADERS,
      ...customHeaders,
    },
  });
}

export function refusal(status: number, error: string, detail: string, remedy: string) {
  return json({ fixture_only: true, error, detail, remedy }, status);
}

