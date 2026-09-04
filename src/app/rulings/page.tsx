import type { Metadata } from 'next';
import Link from 'next/link';
import { getCaseSource } from '@/adapter/caseSource';
import { allRulings, ASSURANCE_SEMANTICS } from '@/domain/selectors';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { fmtUtc, shortHash } from '@/lib/format';

export const metadata: Metadata = { title: 'Rulings' };

export default async function RulingsPage() {
  const source = getCaseSource();
  const cases = await source.listCases();
  const rows = cases.flatMap((b) => allRulings(b).map((r) => ({ b, r }))).sort((x, y) => ((y.r.temporalBasis.ruledAt ?? '') > (x.r.temporalBasis.ruledAt ?? '') ? 1 : -1));
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Rulings</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Every ruling ever issued, including superseded and revoked ones. Nothing is replaced in place.</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Rulings">
            <thead><tr><th scope="col">Ruling</th><th scope="col">Status</th><th scope="col">Case</th><th scope="col">Use</th><th scope="col">Ruling issued on</th><th scope="col">Information known by</th><th scope="col">Assurance</th><th scope="col">Visibility</th><th scope="col">Manifest</th></tr></thead>
            <tbody>
              {rows.map(({ b, r }) => (
                <tr key={r.rulingId}>
                  <td><Link href={`/rulings/${encodeURIComponent(r.rulingId)}`} className="id" style={{ color: 'var(--info)' }}>{r.rulingId}</Link><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>revision {r.revision}{r.supersedesRulingId && <> · supersedes {r.supersedesRulingId}</>}</div></td>
                  <td><RulingStatusPill status={r.status} size="sm" /></td>
                  <td><Link href={`/cases/${encodeURIComponent(b.caseId)}`} style={{ color: 'var(--text-primary)' }}>{b.title}</Link><div className="id" style={{ color: 'var(--text-muted)' }}>{b.caseId}</div></td>
                  <td className="text-[12.5px]">{r.useScope.purpose}</td>
                  <td className="ts">{fmtUtc(r.temporalBasis.ruledAt)}</td>
                  <td className="ts">{fmtUtc(r.temporalBasis.knownAt)}</td>
                  <td className="text-[12px]">{ASSURANCE_SEMANTICS[r.assurance.class].label}</td>
                  <td><VisibilityBadge visibility={r.visibility} /></td>
                  <td className="hash" title={r.release?.manifestCommitment}>{shortHash(r.release?.manifestCommitment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
