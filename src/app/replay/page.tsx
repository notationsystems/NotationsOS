import type { Metadata } from 'next';
import Link from 'next/link';
import { getCaseSource } from '@/adapter/caseSource';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { fmtUtc } from '@/lib/format';

export const metadata: Metadata = { title: 'Replay' };

export default async function ReplayIndex() {
  const source = getCaseSource();
  const cases = await source.listCases();
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1100px] mx-auto w-full flex flex-col gap-3">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Replay</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Choose a case to view it as it was knowable at an earlier instant. Valid time is unchanged by replay; only the knowledge cutoff moves.</p>
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {cases.map((b) => (
            <li key={b.caseId} className="surface px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2 flex-wrap"><Link href={`/replay/${encodeURIComponent(b.caseId)}`} style={{ color: 'var(--text-heading)' }}>{b.title}</Link><span className="id" style={{ color: 'var(--text-muted)' }}>{b.caseId}</span><RulingStatusPill status={b.status} size="sm" /></span>
              <span className="text-[12px] ts" style={{ color: 'var(--text-muted)' }}>{b.previousRulings.length + (b.currentRuling ? 1 : 0)} rulings · last change {fmtUtc(b.lastChangedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
