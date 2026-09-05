import type { RightsSchedule } from '@/domain/corpus';
import { MATERIAL_LABEL, PERMITTED_USES, USE_LABEL, USE_REQUESTS, evaluateUse } from '@/domain/corpus';
import { fmtUtc } from '@/lib/format';

const STATE = {
  ALLOWED: { glyph: '✓', label: 'allowed', cssVar: '--check-passed' },
  APPROVAL_REQUIRED: { glyph: '◐', label: 'approval required', cssVar: '--status-conditional' },
  DENIED: { glyph: '✕', label: 'denied', cssVar: '--text-muted' },
} as const;

/**
 * The intelligence-rights schedule as a matrix: every source against every
 * use. Each cell is one exact source-use request (purpose, operation,
 * audience) evaluated against the source's registration by the data-os
 * policy at the release's knowledge cutoff, with its reasons. Nothing is
 * inferred from another cell. Proprietary strategy and trading are
 * prohibited purposes on every registration in this corpus.
 */
export function RightsMatrix({ sources, at }: { sources: RightsSchedule[]; at: string }) {
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12px]" aria-label="Intelligence-rights schedule">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Material</th>
            {PERMITTED_USES.map((u) => <th key={u} scope="col" className="text-center" title={`${USE_REQUESTS[u].purpose} · ${USE_REQUESTS[u].operation} · ${USE_REQUESTS[u].audience}`}>{USE_LABEL[u]}</th>)}
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
                const d = evaluateUse(s, u, at);
                const st = STATE[d.state];
                return (
                  <td key={u} className="text-center" data-use={u} data-decision={d.state} data-permitted={d.state === 'ALLOWED'} title={`${d.state}: ${d.reasons.join(', ')}`}>
                    <span style={{ color: `var(${st.cssVar})` }}><span aria-hidden="true">{st.glyph}</span><span className="sr-only">{st.label}: {d.reasons.join(', ')}</span></span>
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
