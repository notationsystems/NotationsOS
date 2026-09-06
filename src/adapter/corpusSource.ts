/**
 * The corpus adapter: the product's read interface.
 */
import type { VisibilityClass } from '@/domain/types';
import type { AsOfAnswer, AsOfQuery, Corpus, CorpusRecord, CorpusRelease, Retraction } from '@/domain/corpus';
import { currentRelease, deliverableRecords, queryAsOf, retractionsSince } from '@/domain/corpus';
import { db } from '@/db';
import { corpora, releases, records, retractions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface CorpusSource {
  readonly origin: { kind: 'FIXTURE'; label: string } | { kind: 'LIVE'; label: string };
  listCorpora(): Promise<Corpus[]>;
  getCorpus(corpusId: string): Promise<Corpus | undefined>;
  listReleases(corpusId?: string): Promise<CorpusRelease[]>;
  getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined>;
  records(releaseId: string, viewer: VisibilityClass): Promise<{ records: CorpusRecord[]; withheldByRights: number; withheldByVisibility: number; withheldReasons: Record<string, number> } | undefined>;
  asOf(releaseId: string, q: AsOfQuery): Promise<AsOfAnswer | undefined>;
  retractions(since: string | undefined, viewer: VisibilityClass): Promise<Retraction[]>;
}

export class LiveCorpusSource implements CorpusSource {
  readonly origin = { kind: 'LIVE', label: 'Live Cloud SQL Corpus' } as const;

  private async fetchFullCorpus(corpusId: string): Promise<Corpus | undefined> {
    const corpusRes = await db.select().from(corpora).where(eq(corpora.corpusId, corpusId));
    if (corpusRes.length === 0) return undefined;
    
    const [c] = corpusRes;
    const rels = await db.select().from(releases).where(eq(releases.corpusId, corpusId));
    const recs = await db.select().from(records).where(eq(records.corpusId, corpusId));
    const rets = await db.select().from(retractions).where(eq(retractions.corpusId, corpusId));
    
    return {
      ...(c.data as Record<string, unknown>),
      releases: (rels.map((r) => r.data) as unknown as CorpusRelease[]).sort((a, b) => (a.knownAt < b.knownAt ? -1 : 1)),
      records: recs.map((r) => r.data),
      retractions: rets.map((r) => r.data)
    } as Corpus;
  }

  async listCorpora(): Promise<Corpus[]> {
    const allCorpora = await db.select().from(corpora);
    const results: Corpus[] = [];
    for (const c of allCorpora) {
      const full = await this.fetchFullCorpus(c.corpusId);
      if (full) results.push(full);
    }
    return results;
  }

  async getCorpus(corpusId: string): Promise<Corpus | undefined> {
    return this.fetchFullCorpus(corpusId);
  }

  async listReleases(corpusId?: string): Promise<CorpusRelease[]> {
    const rels = corpusId
      ? await db.select().from(releases).where(eq(releases.corpusId, corpusId))
      : await db.select().from(releases);
    return rels.map((r) => r.data as unknown as CorpusRelease).sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1));
  }

  async getRelease(releaseId: string): Promise<{ corpus: Corpus; release: CorpusRelease } | undefined> {
    const rels = await db.select().from(releases).where(eq(releases.releaseId, releaseId));
    if (rels.length === 0) return undefined;
    
    const release = rels[0];
    const corpus = await this.fetchFullCorpus(release.corpusId);
    if (!corpus) return undefined;
    
    const releaseData = corpus.releases.find((r) => r.releaseId === releaseId);
    if (!releaseData) return undefined;
    
    return { corpus, release: releaseData };
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
    const allCorpora = await this.listCorpora();
    return allCorpora.flatMap((c) => retractionsSince(c, since, viewer));
  }
}

let source: CorpusSource | undefined;

export function getCorpusSource(): CorpusSource {
  if (!source) source = new LiveCorpusSource();
  return source;
}

/** Synchronous helpers for client components that already hold the corpus. */
export function currentReleaseOf(corpus: Corpus): CorpusRelease {
  return currentRelease(corpus);
}
