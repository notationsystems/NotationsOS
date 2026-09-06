/**
 * Feed payloads: the JSON a customer's own inference reads.
 *
 * Every payload is deterministic, carries `fixture_only: true`, names the
 * release it was served from, and states what was withheld and why. The
 * route handlers under src/app/api/v1 are thin wrappers over these
 * functions so tests can call them directly.
 */
import type { VisibilityClass } from '@/domain/types';
import type { AsOfQuery } from '@/domain/corpus';
import { deliveryDecision } from '@/domain/corpus';
import { getCorpusSource } from './corpusSource';
import { getCaseSource } from './caseSource';
import { buildResultManifest } from '@/fixtures/manifest';
import { buildReleaseManifest } from '@/fixtures/releaseManifest';
import { projectForViewer } from '@/domain/selectors';

import { FEED_VERSION, asOfBody, envelope, recordPayload, releaseSummary, retractionPayload, rightsPayload } from './feedShapes';
export { FEED_VERSION, asOfBody, asOfUrl, recordPayload, releaseSummary, retractionPayload } from './feedShapes';

/** The projection a feed request may ask for. Internal classes are never served. */
export function viewerFromParam(v: string | null | undefined): VisibilityClass {
  if (v === 'PUBLIC_RULING') return 'PUBLIC_RULING';
  return 'COUNTERPARTY_SHARED';
}


export async function releasesPayload(corpusId?: string) {
  const src = getCorpusSource();
  const releases = await src.listReleases(corpusId);
  return envelope({ releases: releases.map(releaseSummary), count: releases.length });
}

export async function releasePayload(releaseId: string) {
  const hit = await getCorpusSource().getRelease(releaseId);
  if (!hit) return undefined;
  const { corpus, release } = hit;
  return envelope(
    {
      corpus: { corpusId: corpus.corpusId, title: corpus.title, description: corpus.description },
      build: release.build,
      coverage: release.coverage,
      note: release.note,
      sources: release.sources.map((s) => rightsPayload(s)),
      certification: release.certification,
      governance: corpus.governance,
      links: { manifest: `/api/v1/releases/${release.releaseId}/manifest`, records: `/api/v1/releases/${release.releaseId}/records`, retractions: `/api/v1/retractions?since=${encodeURIComponent(release.supersedesReleaseId ? (corpus.releases.find((r) => r.releaseId === release.supersedesReleaseId)?.knownAt ?? '') : '')}` },
    },
    release,
  );
}

export async function recordsPayload(releaseId: string, viewer: VisibilityClass, filter: { subjectId?: string; predicate?: string } = {}) {
  const hit = await getCorpusSource().getRelease(releaseId);
  if (!hit) return undefined;
  const all = await getCorpusSource().records(releaseId, viewer);
  if (!all) return undefined;
  const records = all.records.filter((r) => (!filter.subjectId || r.subjectId === filter.subjectId) && (!filter.predicate || r.predicate === filter.predicate));
  return envelope(
    {
      projection: viewer,
      filter: { subjectId: filter.subjectId ?? null, predicate: filter.predicate ?? null },
      count: records.length,
      withheld: { byRights: all.withheldByRights, byVisibility: all.withheldByVisibility, reasons: all.withheldReasons, note: 'Counts only. Withheld identities are not disclosed.' },
      records: records.map((r) => recordPayload(r, hit.release.sources.find((s) => s.sourceId === r.provenance.sourceId), deliveryDecision(hit.release, r, viewer === 'PUBLIC_RULING' ? 'PUBLIC_RULING' : 'COUNTERPARTY_SHARED'))),
    },
    hit.release,
  );
}

/** The certified release manifest and its commitment. */
export async function releaseManifestPayload(releaseId: string) {
  const hit = await getCorpusSource().getRelease(releaseId);
  if (!hit) return undefined;
  return envelope({ manifestCommitment: hit.release.certification.manifestCommitment, manifest: buildReleaseManifest(hit.corpus, hit.release) }, hit.release);
}

export async function asOfPayload(releaseId: string, q: AsOfQuery) {
  const hit = await getCorpusSource().getRelease(releaseId);
  if (!hit) return undefined;
  const a = await getCorpusSource().asOf(releaseId, q);
  if (!a) return undefined;
  return envelope(asOfBody(a, (sourceId) => hit.release.sources.find((s) => s.sourceId === sourceId), (r) => deliveryDecision(hit.release, r, 'COUNTERPARTY_SHARED')), hit.release);
}

export async function retractionsPayload(since: string | undefined, viewer: VisibilityClass) {
  const list = await getCorpusSource().retractions(since, viewer);
  return envelope({ projection: viewer, since: since ?? null, count: list.length, retractions: list.map(retractionPayload) });
}

/** The application layer, served beside the corpus: a ruling as the workbench would return it. */
export async function rulingPayload(rulingId: string, viewer: VisibilityClass) {
  const hit = await getCaseSource().getRuling(rulingId);
  if (!hit) return undefined;
  const projected = projectForViewer(hit.bundle, viewer);
  const ruling = [...projected.bundle.previousRulings, ...(projected.bundle.currentRuling ? [projected.bundle.currentRuling] : [])].find((r) => r.rulingId === rulingId);
  if (!ruling) return { fixture_only: true as const, feed: FEED_VERSION, error: 'not_visible', detail: `Ruling ${rulingId} is not visible at ${viewer}.`, remedy: 'Request the counterparty projection with the case sponsor\'s authorization.' };
  return envelope({ projection: viewer, layer: 'application', ruling, links: { manifest: `/api/v1/rulings/${rulingId}/manifest`, case: `/cases/${hit.bundle.caseId}`, release: `/api/v1/releases/${ruling.corpus.releaseId}` } });
}

export async function rulingManifestPayload(rulingId: string, viewer: VisibilityClass) {
  const hit = await getCaseSource().getRuling(rulingId);
  if (!hit) return undefined;
  const projected = projectForViewer(hit.bundle, viewer);
  const ruling = [...projected.bundle.previousRulings, ...(projected.bundle.currentRuling ? [projected.bundle.currentRuling] : [])].find((r) => r.rulingId === rulingId);
  if (!ruling) return { fixture_only: true as const, feed: FEED_VERSION, error: 'not_visible', detail: `Ruling ${rulingId} is not visible at ${viewer}.`, remedy: 'Request the counterparty projection with the case sponsor\'s authorization.' };
  const withheld = hit.ruling.consideredEvidenceIds.length - ruling.consideredEvidenceIds.length;
  return envelope({
    projection: viewer,
    layer: 'application',
    manifestCommitment: ruling.release?.manifestCommitment ?? null,
    manifest: buildResultManifest(projected.bundle, ruling),
    withheld: { evidenceIdentities: withheld, note: withheld > 0 ? 'The committed manifest was computed over the full evidence set; this projection omits withheld identities and its hash will not match the commitment.' : 'Complete at this projection.' },
  });
}
