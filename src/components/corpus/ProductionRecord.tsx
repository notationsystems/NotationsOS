import type { BuildRecord } from '@/domain/corpus';
import { STAGE_LABEL } from '@/domain/corpus';
import { fmtUtc } from '@/lib/format';

const STATUS: Record<BuildRecord['stages'][number]['status'], { label: string; cssVar: string; glyph: string }> = {
  COMPLETED: { label: 'Completed', cssVar: '--check-passed', glyph: '✓' },
  NOT_RUN: { label: 'Not run', cssVar: '--check-not-evaluated', glyph: '?' },
  NOT_APPLICABLE: { label: 'Not applicable', cssVar: '--check-na', glyph: '–' },
};

/** The shared production system, stage by stage, as it ran for one build. */
export function ProductionRecord({ build }: { build: BuildRecord }) {
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12.5px]" aria-label="Production record">
        <thead><tr><th scope="col">Stage</th><th scope="col">State</th><th scope="col">What it did for this build</th><th scope="col">At</th></tr></thead>
        <tbody>
          {build.stages.map((s) => (
            <tr key={s.stage} data-stage={s.stage}>
              <th scope="row" className="font-normal">{STAGE_LABEL[s.stage]}</th>
              <td style={{ color: `var(${STATUS[s.status].cssVar})` }}><span aria-hidden="true">{STATUS[s.status].glyph}</span> {STATUS[s.status].label}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{s.note}</td>
              <td className="ts">{s.at ? fmtUtc(s.at) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
