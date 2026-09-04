import type { Metadata } from 'next';
import Link from 'next/link';
import { getCorpusSource } from '@/adapter/corpusSource';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { StreamExplorer } from '@/components/corpus/StreamExplorer';

export const metadata: Metadata = { title: 'Stream' };

export default async function StreamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const source = getCorpusSource();
  const [corpus] = await source.listCorpora();
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1100px] mx-auto w-full flex flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Stream · as-of answers</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>What did the corpus assert about a subject at a world time, given what was knowable at a knowledge time? Every answer carries its bounds, both clocks, provenance, evidence class and rights. An absent answer is a typed refusal with a remedy. Records: <Link href={`/releases/${encodeURIComponent(corpus.releases.find((r) => r.status === 'CURRENT')?.releaseId ?? '')}`} style={{ color: 'var(--info)' }}>current release</Link>.</p>
        </header>
        <StreamExplorer corpus={corpus} initial={{ release: sp.release, subject: sp.subject, predicate: sp.predicate, validAt: sp.validAt, knownAt: sp.knownAt, record: sp.record }} />
      </div>
    </>
  );
}
