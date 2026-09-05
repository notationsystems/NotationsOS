import type { WorkspaceCapacityView } from './capacity';

const COLOR = { ok: 'var(--check-passed)', warn: 'var(--status-conditional)', full: 'var(--status-refused)' } as const;
const TEST_ID: Record<string, string> = { commands: 'command-capacity', versions: 'version-capacity' };

/** Remaining capacity per dimension, with what happens at each limit and how to recover. The numbers for commands and versions are the API's. */
export function CapacityMeter({ capacity, pendingCount }: { capacity: WorkspaceCapacityView; pendingCount: number }) {
  return (
    <section className="surface p-3 flex flex-col gap-2" aria-labelledby="capacity-heading" data-testid="capacity" data-source={capacity.source}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="capacity-heading" className="font-semibold">Workspace capacity</h2>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Commands and saved versions as the state API reports them; notation and relation limits from the kernel contract.</span>
      </div>
      {capacity.versionsExhausted && <p className="m-0 text-[13px] font-semibold" style={{ color: COLOR.full }}>Saved-version capacity reached. Further previews and saves are disabled.</p>}
      {capacity.commandsExhausted && !capacity.versionsExhausted && <p className="m-0 text-[13px] font-semibold" style={{ color: COLOR.full }}>Lifetime command capacity reached. Further previews, including undo and redo, are disabled.</p>}
      {capacity.commandsExhausted && !capacity.versionsExhausted && pendingCount > 0 && <p className="m-0 text-[12.5px]">This pending batch can still be saved while a saved-version slot remains.</p>}
      {capacity.approaching && <p className="m-0 text-[13px] font-semibold" style={{ color: COLOR.warn }}>Approaching the local history limit. Review the remaining command and saved-version capacity before continuing.</p>}
      <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2">
        {capacity.rows.map((row) => (
          <li key={row.dimension} className="surface-inset p-2 text-[12.5px] flex flex-col gap-1" data-testid={`capacity-${row.dimension}`} data-level={row.level} data-remaining={row.remaining} data-source={row.source}>
            <div className="flex items-baseline justify-between gap-2"><span style={{ color: 'var(--text-heading)' }}>{row.label}</span><span className="mono" style={{ color: COLOR[row.level] }} data-testid={TEST_ID[row.dimension]}>{row.used} / {row.limit} used · {row.remaining} remaining</span></div>
            <div className="h-1 rounded overflow-hidden" style={{ background: 'var(--bg-inset)' }} aria-hidden="true"><div className="h-full" style={{ width: `${Math.min(100, Math.round((row.used / row.limit) * 100))}%`, background: COLOR[row.level] }} /></div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{row.meaning}</div>
            {row.level !== 'ok' && <div className="text-[11.5px]" style={{ color: COLOR[row.level] }} role={row.level === 'full' ? 'alert' : undefined}>{row.level === 'full' ? 'At the limit. ' : 'Near the limit. '}{row.atLimit}</div>}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Before capacity runs out, save pending work where possible and preserve the existing state directory. An operator can configure a separate workspace. Do not reset or prune history to reclaim capacity; checkpoint/archive support and history migration are not implemented.</p>
    </section>
  );
}
