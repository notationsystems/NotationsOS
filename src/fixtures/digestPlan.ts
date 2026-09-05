/**
 * What gets hashed, and how the layers depend on each other. Shared by the
 * stamping script and the drift test so they cannot disagree.
 *
 * Layer 0  register digest      over profile.invariants
 * Layer 1  artifact hashes      over {evidenceId, kind, declaredIdentifiers, extracted, producerId, capturedAt, validAt}
 * Layer 2  evidence roots       over sorted layer-1 hashes of the evidence a ruling considered
 * Layer 3  manifest commitments over the result manifest, which embeds layers 0 and 2 through the ruling
 * Layer R  release digests      over the canonical record set a corpus release carries (values, clocks, provenance hashes)
 * Layer M  release manifests    over the certified release manifest, which embeds layer R
 * Bytes    bytes:<evidenceId>     byte length of the canonical artifact bytes (data-os BinaryEvidence.byteLength)
 */
import type { AdmissionProfile, ClaimCaseBundle, Ruling } from '@/domain/types';
import type { Corpus } from '@/domain/corpus';
import { releaseRecords } from '@/domain/corpus';
import { allRulings } from '@/domain/selectors';
import { buildResultManifest } from './manifest';
import { buildReleaseManifest } from './releaseManifest';
import { canonicalJson } from './digest';

export type HashObject = (obj: unknown) => string;
export type HashString = (s: string) => string;

export function registerKey(p: AdmissionProfile) {
  return `register:${p.profileId}@${p.version}`;
}

/** The exact bytes captured for an artifact: its canonical JSON, UTF-8. data-os BinaryEvidence.byteLength is their length. */
export function artifactBytes(e: ClaimCaseBundle['evidence'][number]): Uint8Array {
  return new TextEncoder().encode(canonicalJson(artifactCanonical(e)));
}

export function artifactCanonical(e: ClaimCaseBundle['evidence'][number]) {
  return {
    evidenceId: e.evidenceId,
    kind: e.kind,
    producerId: e.producerId ?? null,
    capturedAt: e.capturedAt ?? null,
    validAt: e.validAt ?? null,
    declaredIdentifiers: e.declaredIdentifiers ?? {},
    extracted: e.extracted ?? [],
  };
}

/**
 * Compute every digest. `table` (previous stamped values) lets layer 3 hash
 * over rulings whose release fields already carry layers 0 and 2; on the
 * first pass those fields read `unstamped:*` and the manifest digests are
 * provisional — the caller runs a second pass.
 */
export function releaseCanonical(corpus: Corpus, releaseId: string) {
  const release = corpus.releases.find((r) => r.releaseId === releaseId);
  if (!release) return null;
  return releaseRecords(corpus, release)
    .map((r) => ({ recordId: r.recordId, canonicalId: r.canonicalId, subjectId: r.subjectId, predicate: r.predicate, value: r.value, unit: r.unit ?? null, basis: r.basis ?? null, uncertainty: r.uncertainty ?? null, validFrom: r.validFrom, validTo: r.validTo ?? null, knownAt: r.knownAt, sourceId: r.provenance.sourceId, artifactId: r.provenance.artifactId ?? null, geometry: r.geometry ?? null }))
    .sort((a, b) => a.recordId.localeCompare(b.recordId));
}

export function computeAllDigests(
  profiles: readonly AdmissionProfile[],
  cases: readonly ClaimCaseBundle[],
  hashObject: HashObject,
  hashString: HashString,
  table: Record<string, string> = {},
  corpora: readonly Corpus[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const corpus of corpora) {
    for (const rel of corpus.releases) {
      const canon = releaseCanonical(corpus, rel.releaseId);
      if (canon) out[`release:${rel.releaseId}`] = hashObject({ releaseId: rel.releaseId, corpusId: corpus.corpusId, knownAt: rel.knownAt, records: canon });
    }
    for (const rel of corpus.releases) {
      // The manifest embeds the release digest computed above, never a placeholder.
      const manifest = buildReleaseManifest(corpus, { ...rel, releaseDigest: out[`release:${rel.releaseId}`] ?? rel.releaseDigest });
      out[`releaseManifest:${rel.releaseId}`] = hashObject(manifest);
    }
  }
  for (const p of profiles) out[registerKey(p)] = hashObject(p.invariants);
  const artifact = new Map<string, string>();
  for (const c of cases) {
    for (const e of c.evidence) {
      const h = hashObject(artifactCanonical(e));
      out[`artifact:${e.evidenceId}`] = h;
      out[`bytes:${e.evidenceId}`] = String(artifactBytes(e).byteLength);
      artifact.set(e.evidenceId, h);
    }
  }
  for (const c of cases) {
    for (const r of allRulings(c)) {
      const roots = r.consideredEvidenceIds.map((id) => artifact.get(id)).filter((x): x is string => Boolean(x)).sort();
      if (roots.length) out[`evidenceRoot:${r.rulingId}`] = hashString(roots.join(''));
    }
  }
  const registerOf = (r: Ruling) => {
    const p = profiles.find((x) => x.profileId === r.profileId && x.version === r.profileVersion);
    return p ? out[registerKey(p)] : r.registerDigest;
  };
  for (const c of cases) {
    for (const r of allRulings(c)) {
      // Substitute stamped/derived values so the manifest hashes over real digests, not placeholders.
      const ruling: Ruling = { ...r, registerDigest: registerOf(r) };
      const manifest = buildResultManifest({ ...c, evidence: c.evidence.map((e) => ({ ...e, contentHash: artifact.get(e.evidenceId) })) }, ruling);
      out[`manifest:${r.rulingId}`] = hashObject(manifest);
    }
  }
  // Carry forward any keys the table had that we did not recompute (none expected).
  for (const k of Object.keys(table)) if (!(k in out)) out[k] = table[k];
  return out;
}
