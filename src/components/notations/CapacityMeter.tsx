import type { WorkspaceCapacityView } from './capacity';

const COLOR = { ok: 'var(--check-passed)', warn: 'var(--status-conditional)', full: 'var(--status-refused)' } as const;

/** Remaining capacity per dimension, with what happens at each limit and how to recover. */
export function CapacityMeter({ capacity }: { capacity: WorkspaceCapacityView }) {
  return (
    <section className="surface p-3 flex flex-col gap-2" aria-labelledby="capacity-heading" data-testid="capacity" data-source={capacity.source}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="capacity-heading" className="font-semibold">Workspace capacity</h2>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{capacity.source === 'API' ? 'Limits and usage reported by the state API.' : 'Limits from the kernel contract; usage read from the snapshot. The API does not report capacity yet.'}</span>
      </div>
      <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2">
        {capacity.rows.map((row) => (
          <li key={row.dimension} className="surface-inset p-2 text-[12.5px] flex flex-col gap-1" data-testid={`capacity-${row.dimension}`} data-level={row.level} data-remaining={row.remaining}>
            <div className="flex items-baseline justify-between gap-2"><span style={{ color: 'var(--text-heading)' }}>{row.label}</span><span className="mono" style={{ color: COLOR[row.level] }}>{row.used} / {row.limit} · {row.remaining} left</span></div>
            <div className="h-1 rounded overflow-hidden" style={{ background: 'var(--bg-inset)' }} aria-hidden="true"><div className="h-full" style={{ width: `${Math.min(100, Math.round((row.used / row.limit) * 100))}%`, background: COLOR[row.level] }} /></div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{row.meaning}</div>
            {row.level !== 'ok' && <div className="text-[11.5px]" style={{ color: COLOR[row.level] }} role={row.level === 'full' ? 'alert' : undefined}>{row.level === 'full' ? 'At the limit. ' : 'Near the limit. '}{row.atLimit}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
