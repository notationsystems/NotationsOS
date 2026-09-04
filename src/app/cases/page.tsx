import type { Metadata } from 'next';
import Link from 'next/link';
import { getCaseSource } from '@/adapter/caseSource';
import { CaseQueue } from '@/components/queue/CaseQueue';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';

export const metadata: Metadata = { title: 'Cases' };

/** "Since the user last looked" — deterministic for fixtures: one day before the fixture clock. */
const LAST_SEEN_AT = '2026-08-31T12:00:00Z';

export default async function CasesPage() {
  const source = getCaseSource();
  const cases = await source.listCases();
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={`${source.origin.label}. Fixture clock: 2026-09-01 12:00 UTC.`} />}
      <div className="flex items-center justify-end px-3 sm:px-4 pt-3 max-w-[1600px] mx-auto w-full">
        <Link href="/cases/new" className="btn btn-primary">New case</Link>
      </div>
      <CaseQueue cases={cases} lastSeenAt={LAST_SEEN_AT} />
    </>
  );
}
