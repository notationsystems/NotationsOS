import type { Metadata } from 'next';
import Link from 'next/link';
import { getCaseSource } from '@/adapter/caseSource';
import { partyName } from '@/domain/selectors';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { fmtUtc, humanize, shortHash } from '@/lib/format';

export const metadata: Metadata = { title: 'Evidence' };

export default async function EvidencePage() {
  const source = getCaseSource();
  const cases = await source.listCases();
  const rows = cases.flatMap((b) => b.evidence.map((e) => ({ b, e }))).sort((x, y) => (y.e.knownAt > x.e.knownAt ? 1 : -1));
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Evidence</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Every artifact attached to any case, with its producer, its evidence class on both axes, its content hash and the instant it became knowable. Uploading an artifact does not make it verified evidence; the classes say what it is.</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Evidence">
            <thead><tr><th scope="col">Artifact</th><th scope="col">Kind</th><th scope="col">Producer</th><th scope="col">Evidence class</th><th scope="col">Content hash</th><th scope="col">Known by</th><th scope="col">Visibility</th><th scope="col">Case</th></tr></thead>
            <tbody>
              {rows.map(({ b, e }) => (
                <tr key={`${b.caseId}:${e.evidenceId}`}>
                  <td><span className="id">{e.evidenceId}</span><div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{e.title}</div></td>
                  <td className="text-[12.5px]">{humanize(e.kind)}</td>
                  <td className="text-[12.5px]">{partyName(b, e.producerId)}</td>
                  <td><EvidenceClassBadge evidenceClass={e.evidenceClass} compact /></td>
                  <td className="hash" title={e.contentHash}>{shortHash(e.contentHash)}</td>
                  <td className="ts">{fmtUtc(e.knownAt)}</td>
                  <td><VisibilityBadge visibility={e.visibility} /></td>
                  <td><Link href={`/cases/${encodeURIComponent(b.caseId)}`} className="id" style={{ color: 'var(--info)' }}>{b.caseId}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
