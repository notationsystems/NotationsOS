import digests from './digests.json';

/**
 * Content hashes, manifest commitments, evidence roots and the register
 * digest are COMPUTED by scripts/stamp-digests.entry.ts (sha256 over
 * canonical JSON, node only) and committed in digests.json. Fixtures read
 * them here; src/fixtures/digest.test.ts recomputes every one and fails if
 * a fixture's content drifted from its committed digest.
 */
const TABLE: Record<string, string> = digests as Record<string, string>;

export function digestOf(key: string): string {
  return TABLE[key] ?? `unstamped:${key}`;
}
