import type { RightsSchedule } from '@/domain/corpus';
import { MATERIAL_LABEL, PERMITTED_USES, USE_LABEL, isUsePermitted } from '@/domain/corpus';

/**
 * The intelligence-rights schedule as a matrix: every source against every
 * use. A use not listed for a source is prohibited, and the cell says so in
 * text, not only by symbol. Proprietary strategy and trading are never
 * permitted in this corpus; the matrix shows that rather than assuming it.
 */
export function RightsMatrix({ sources }: { sources: RightsSchedule[] }) {
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12px]" aria-label="Intelligence-rights schedule">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Material</th>
            {PERMITTED_USES.map((u) => <th key={u} scope="col" className="text-center">{USE_LABEL[u]}</th>)}
            <th scope="col">Redistribution</th>
            <th scope="col">Attribution</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.sourceId} data-source-id={s.sourceId}>
              <th scope="row" className="font-normal"><span className="id">{s.sourceId}</span><div style={{ color: 'var(--text-secondary)' }}>{s.sourceName}</div><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.licence}</div></th>
              <td data-material={s.materialClass}>{MATERIAL_LABEL[s.materialClass]}</td>
              {PERMITTED_USES.map((u) => {
                const ok = isUsePermitted(s, u);
                return (
                  <td key={u} className="text-center" data-use={u} data-permitted={ok}>
                    <span style={{ color: ok ? 'var(--check-passed)' : 'var(--text-muted)' }}><span aria-hidden="true">{ok ? '✓' : '✕'}</span><span className="sr-only">{ok ? 'permitted' : 'prohibited'}</span></span>
                  </td>
                );
              })}
              <td className="mono">{s.redistribution}</td>
              <td>{s.attributionRequired ? 'Required' : 'Not required'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 px-3 py-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>✓ permitted · ✕ prohibited. A use absent from a source&apos;s schedule is prohibited; nothing defaults to permitted. Explicit non-use statements are on the release page.</p>
    </div>
  );
}
