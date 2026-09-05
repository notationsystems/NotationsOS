/**
 * The corpus adapter: the product's read interface.
 *
 * A live implementation would sit on the corpus release store and the
 * retraction log. The only implementation here reads the committed fixture
 * corpus. Nothing in this module computes a fact; it selects and projects.
 */
import type { VisibilityClass } from '@/domain/types';
import type { AsOfAnswer, AsOfQuery, Corpus, CorpusRecord, CorpusRelease, Retraction } from '@/domain/corpus';
import { currentRelease, deliverableRecords, queryAsOf, releaseById, retractionsSince } from '@/domain/corpus';
import { FIXTURE_CORPORA } from '@/fixtures';

export interface CorpusSource {
  readonly origin: { kind: 'FIXTURE'; label: string } | { kind: 'LIVE'; label: string };
  listCorpora(): Promise<Corpus[]>;
  getCorpus(corpusId: string): Promise<Corpus | undefined>;
  listReleases(corpusId?: string): Promise<CorpusRelease[]>;
  getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined>;
  /** Records a viewer may receive from a release, after the rights guard and the visibility projection. */
  records(releaseId: string, viewer: VisibilityClass): Promise<{ records: CorpusRecord[]; withheldByRights: number; withheldByVisibility: number; withheldReasons: Record<string, number> } | undefined>;
  asOf(releaseId: string, q: AsOfQuery): Promise<AsOfAnswer | undefined>;
  retractions(since: string | undefined, viewer: VisibilityClass): Promise<Retraction[]>;
}

export class FixtureCorpusSource implements CorpusSource {
  readonly origin = { kind: 'FIXTURE', label: 'Demonstration corpus (fixture_only: true)' } as const;

  async listCorpora(): Promise<Corpus[]> {
    return [...FIXTURE_CORPORA];
  }

  async getCorpus(corpusId: string): Promise<Corpus | undefined> {
    return FIXTURE_CORPORA.find((c) => c.corpusId === corpusId);
  }

  async listReleases(corpusId?: string): Promise<CorpusRelease[]> {
    return FIXTURE_CORPORA.filter((c) => !corpusId || c.corpusId === corpusId).flatMap((c) => c.releases).sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1));
  }

  async getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined> {
    for (const corpus of FIXTURE_CORPORA) {
      const release = releaseById(corpus, releaseId);
      if (release) return { corpus, release };
    }
    return undefined;
  }

  async records(releaseId: string, viewer: VisibilityClass) {
    const hit = await this.getRelease(releaseId);
    if (!hit) return undefined;
    return deliverableRecords(hit.corpus, hit.release, viewer);
  }

  async asOf(releaseId: string, q: AsOfQuery): Promise<AsOfAnswer | undefined> {
    const hit = await this.getRelease(releaseId);
    if (!hit) return undefined;
    return queryAsOf(hit.corpus, hit.release, q, { enforceRights: true, viewer: 'COUNTERPARTY_SHARED' });
  }

  async retractions(since: string | undefined, viewer: VisibilityClass): Promise<Retraction[]> {
    return FIXTURE_CORPORA.flatMap((c) => retractionsSince(c, since, viewer));
  }
}

let source: CorpusSource | undefined;

export function getCorpusSource(): CorpusSource {
  if (!source) source = new FixtureCorpusSource();
  return source;
}

/** Synchronous helpers for client components that already hold the corpus. */
export function currentReleaseOf(corpus: Corpus): CorpusRelease {
  return currentRelease(corpus);
}
