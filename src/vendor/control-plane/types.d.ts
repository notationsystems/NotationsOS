declare module '@/vendor/control-plane/governance/result-manifest.js' {
  export const RESULT_MANIFEST_SCHEMA: Readonly<Record<string, unknown>>;
  export function parseResultManifest(input: unknown): Readonly<Record<string, unknown>>;
}
declare module '@/vendor/control-plane/identity/canonical-uri.js' {
  export const CANONICAL_KINDS: readonly string[];
  export function canonicalURI(kind: string, authority: string, localId: string): string;
  export function parseCanonicalURI(value: unknown): Readonly<{ uri: string; kind: string; authority: string; localId: string }>;
}
