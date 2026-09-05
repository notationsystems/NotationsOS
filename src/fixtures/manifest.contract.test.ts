import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURE_CASES } from './index';
import { allRulings } from '@/domain/selectors';
import { buildResultManifest } from './manifest';
// Vendored, digest-pinned copies of the control plane's contract code (see src/vendor/control-plane/README.md).
import { parseResultManifest } from '@/vendor/control-plane/governance/result-manifest.js';
import { parseCanonicalURI } from '@/vendor/control-plane/identity/canonical-uri.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// The vendor digests identify the repository blobs, whose canonical line
// ending is LF. Git may materialize those blobs with CRLF on Windows.
const vendoredSource = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const VENDORED: Record<string, string> = {
  'src/vendor/control-plane/governance/result-manifest.js': '315041ac785b2f9877f11296a5a7df1f62a2c8728ec6f120d3dfa79da796f621',
  'src/vendor/control-plane/identity/canonical-uri.js': '2a3357d9e680fbdd5d62de4e01240be8596a59588fa69b162101a72f4877a36b',
};

describe('result manifests conform to the control-plane contract', () => {
  it('the vendored contract code matches its pinned digest', () => {
    for (const [file, digest] of Object.entries(VENDORED)) {
      expect(sha256(vendoredSource(file)), file).toBe(digest);
    }
  });

  it('every fixture ruling builds a manifest that parseResultManifest accepts', () => {
    let count = 0;
    for (const c of FIXTURE_CASES) {
      for (const r of allRulings(c)) {
        const m = buildResultManifest(c, r);
        const parsed = parseResultManifest(m) as { schema: string; manifestId: string; verification: { status: string } };
        expect(parsed.schema).toBe('notations.result-manifest.v1');
        expect(parsed.manifestId).toBe(r.release?.manifestId ?? `rm:${r.rulingId}`);
        expect(parsed.verification.status).toBe(r.assurance.manifestVerification ?? 'unverified');
        count += 1;
      }
    }
    expect(count).toBe(7);
  });

  it('every canonical identity in the fixtures is a valid notation:// URI of the right kind', () => {
    for (const c of FIXTURE_CASES) {
      if (c.subject.canonicalId) expect(parseCanonicalURI(c.subject.canonicalId).kind).toBe('entity');
      for (const cl of c.claims) if (cl.canonicalId) expect(parseCanonicalURI(cl.canonicalId).kind).toBe('claim');
      for (const e of c.evidence) if (e.canonicalId) expect(parseCanonicalURI(e.canonicalId).kind).toBe('artifact');
      for (const cl of c.claims) if (cl.normalizedValue?.transformId) expect(parseCanonicalURI(cl.normalizedValue.transformId).kind).toBe('transform');
    }
  });
});
