/**
 * The certified release manifest: the machine-readable warrant-free
 * statement of what a release is. Its commitment is
 * sha256(canonicalJson(manifest)), stamped by scripts/stamp-digests and
 * asserted by digest.test.ts; the release carries the commitment in its
 * certification. The manifest never embeds its own commitment.
 *
 * Shape: this repository's demonstration contract. The control plane
 * defines a result manifest (per query) and the corpus graph defines a
 * build record; a release manifest contract does not yet exist upstream,
 * and this one says so in its schema id.
 */
import type { Corpus, CorpusRelease } from '@/domain/corpus';
import { releaseRecords, releaseRetractions } from '@/domain/corpus';

export interface ReleaseManifestV0 {
  schema: 'payload-os.release-manifest.v0-demo';
  manifestId: string;
  releaseId: string;
  corpusId: string;
  domain: string;
  knownAt: string;
  build: CorpusRelease['build'];
  releaseDigest: string;
  recordCount: number;
  retractionsApplied: string[];
  supersedesReleaseId: string | null;
  coverage: string;
  sources: Array<{ sourceId: string; canonicalId: string; materialClass: string; licence: string; registration: CorpusRelease['sources'][number]['registration']; permittedUses: string[]; nonUse: string[]; redistribution: string; attributionRequired: boolean }>;
  certification: { status: CorpusRelease['certification']['status']; certifiedAt: string | null; basis: string; verification: CorpusRelease['certification']['verification'] };
  governance: Corpus['governance'];
}

export function buildReleaseManifest(corpus: Corpus, release: CorpusRelease): ReleaseManifestV0 {
  return {
    schema: 'payload-os.release-manifest.v0-demo',
    manifestId: `rlm:${release.releaseId}`,
    releaseId: release.releaseId,
    corpusId: corpus.corpusId,
    domain: corpus.domain,
    knownAt: release.knownAt,
    build: release.build,
    releaseDigest: release.releaseDigest,
    recordCount: releaseRecords(corpus, release).length,
    retractionsApplied: releaseRetractions(corpus, release).map((r) => r.retractionId),
    supersedesReleaseId: release.supersedesReleaseId ?? null,
    coverage: release.coverage,
    sources: release.sources.map((s) => ({ sourceId: s.sourceId, canonicalId: s.canonicalId, materialClass: s.materialClass, licence: s.licence, registration: s.registration, permittedUses: s.permittedUses, nonUse: s.nonUse, redistribution: s.redistribution, attributionRequired: s.attributionRequired })),
    certification: { status: release.certification.status, certifiedAt: release.certification.certifiedAt ?? null, basis: release.certification.basis, verification: release.certification.verification },
    governance: corpus.governance,
  };
}
