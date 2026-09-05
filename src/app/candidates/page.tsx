import type { Metadata } from 'next';
import Link from 'next/link';
import { getProductionSource } from '@/adapter/productionSource';
import { CandidatePipeline } from '@/components/production/CandidatePipeline';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';

export const metadata: Metadata = { title: 'Candidates' };

/** Candidate production on the local rails: unadmitted, separate from every release and from the feed. */
export default async function CandidatesPage() {
  const source = getProductionSource();
  const demo = await source.demo();
  return (
    <>
      <FixtureBanner note={`${source.origin.label}. Fixture clock: 2026-09-05.`} />
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">Production</span><span className="label-sm" style={{ color: 'var(--status-pending)' }}>{demo.mode}</span><span className="label-sm">CARAVAN · Carrier</span></div>
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Candidate production</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>The shared production system, before admission: authorized material is captured with a receipt, normalized under a fixed contract into source-scoped candidates, and assembled into a time-bounded candidate build. Everything on this page is <span className="mono">UNADMITTED</span>. It is not inventory, it is in no release, and the <Link href="/api" style={{ color: 'var(--info)' }}>feed</Link> cannot return it.</p>
        </header>
        <CandidatePipeline demo={demo} />
      </div>
    </>
  );
}
