import type { ClaimCaseBundle, Ruling } from '@/domain/types';
import { STATUS_SEMANTICS, ASSURANCE_SEMANTICS } from '@/domain/selectors';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { CHECK_SEMANTICS } from './InvariantResultView';
import { fmtTolerance, fmtUtc } from '@/lib/format';

/**
 * Two rulings side by side. A superseded ruling is not erased: it is
 * compared. Rows that differ are marked in text ("changed"), not only colour.
 */
export function RevisionComparison({ bundle, a, b }: { bundle: ClaimCaseBundle; a: Ruling; b: Ruling }) {
  const rows: Array<{ label: string; av: string; bv: string }> = [
    { label: 'Status', av: STATUS_SEMANTICS[a.status].label, bv: STATUS_SEMANTICS[b.status].label },
    { label: 'Declared use', av: a.useScope.purpose, bv: b.useScope.purpose },
    { label: 'Tolerance', av: fmtTolerance(a.useScope.tolerance), bv: fmtTolerance(b.useScope.tolerance) },
    { label: 'World state valid on', av: fmtUtc(a.temporalBasis.validAt), bv: fmtUtc(b.temporalBasis.validAt) },
    { label: 'Information known by', av: fmtUtc(a.temporalBasis.knownAt), bv: fmtUtc(b.temporalBasis.knownAt) },
    { label: 'Ruling issued on', av: fmtUtc(a.temporalBasis.ruledAt), bv: fmtUtc(b.temporalBasis.ruledAt) },
    { label: 'Reliance ends', av: fmtUtc(a.temporalBasis.expiresAt), bv: fmtUtc(b.temporalBasis.expiresAt) },
    { label: 'Profile version', av: a.profileVersion, bv: b.profileVersion },
    { label: 'Assurance', av: ASSURANCE_SEMANTICS[a.assurance.class].label, bv: ASSURANCE_SEMANTICS[b.assurance.class].label },
    { label: 'Evidence considered', av: `${a.consideredEvidenceIds.length} artifacts`, bv: `${b.consideredEvidenceIds.length} artifacts` },
    { label: 'Conditions', av: String(a.conditions?.length ?? 0), bv: String(b.conditions?.length ?? 0) },
    { label: 'Manifest commitment', av: a.release?.manifestCommitment?.slice(0, 16) ?? '—', bv: b.release?.manifestCommitment?.slice(0, 16) ?? '—' },
  ];
  const ids = [...new Set([...a.invariantResults, ...b.invariantResults].filter((r) => r.origin === 'AUTOMATIC').map((r) => r.invariantId))].sort();
  const evA = new Set(a.consideredEvidenceIds);
  const evB = new Set(b.consideredEvidenceIds);
  const added = b.consideredEvidenceIds.filter((id) => !evA.has(id));
  const removed = a.consideredEvidenceIds.filter((id) => !evB.has(id));
  return (
    <div className="flex flex-col gap-3" data-testid="revision-comparison">
      <div className="grid grid-cols-[minmax(120px,160px)_1fr_1fr] gap-x-3 text-[12px] items-end">
        <span />
        <span className="flex flex-col gap-1"><span className="id">{a.rulingId}</span><RulingStatusPill status={a.status} size="sm" /></span>
        <span className="flex flex-col gap-1"><span className="id">{b.rulingId}</span><RulingStatusPill status={b.status} size="sm" /></span>
      </div>
      <table className="ledger-table text-[12.5px]">
        <thead><tr><th scope="col">Field</th><th scope="col">Revision {a.revision}</th><th scope="col">Revision {b.revision}</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const changed = r.av !== r.bv;
            return (
              <tr key={r.label} data-changed={changed || undefined}>
                <th scope="row" className="font-normal" style={{ color: 'var(--text-muted)' }}>{r.label}{changed && <span className="label-sm ml-1" style={{ color: 'var(--accent-strong)' }}>changed</span>}</th>
                <td className={r.label.includes('on') || r.label.includes('by') || r.label.includes('ends') ? 'ts' : ''}>{r.av}</td>
                <td className={r.label.includes('on') || r.label.includes('by') || r.label.includes('ends') ? 'ts' : ''} style={{ color: changed ? 'var(--text-heading)' : undefined, fontWeight: changed ? 500 : undefined }}>{r.bv}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(added.length > 0 || removed.length > 0) && (
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          {added.length > 0 && <>Evidence added: {added.map((id) => <span key={id} className="id mr-1">{id}</span>)}. </>}
          {removed.length > 0 && <>Evidence no longer considered: {removed.map((id) => <span key={id} className="id mr-1">{id}</span>)}.</>}
        </p>
      )}
      <table className="ledger-table text-[12.5px]" aria-label="Check results by revision">
        <thead><tr><th scope="col">Check</th><th scope="col">Revision {a.revision}</th><th scope="col">Revision {b.revision}</th></tr></thead>
        <tbody>
          {ids.map((id) => {
            const ra = a.invariantResults.find((r) => r.invariantId === id);
            const rb = b.invariantResults.find((r) => r.invariantId === id);
            const changed = ra?.status !== rb?.status;
            const cell = (r?: typeof ra) => r ? <span style={{ color: `var(${CHECK_SEMANTICS[r.status].cssVar})` }}><span aria-hidden="true">{CHECK_SEMANTICS[r.status].glyph}</span> {CHECK_SEMANTICS[r.status].label}</span> : <span style={{ color: 'var(--text-muted)' }}>not present</span>;
            return (
              <tr key={id} data-changed={changed || undefined}>
                <th scope="row" className="font-normal"><span className="id">{id}</span> <span style={{ color: 'var(--text-muted)' }}>{(rb ?? ra)?.title}</span>{changed && <span className="label-sm ml-1" style={{ color: 'var(--accent-strong)' }}>changed</span>}</th>
                <td>{cell(ra)}</td>
                <td>{cell(rb)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Case {bundle.caseId}. Both rulings remain inspectable; the current ruling is revision {bundle.currentRuling?.revision ?? '—'}.</p>
    </div>
  );
}
