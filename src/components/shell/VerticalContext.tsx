
import type { Domain } from '@/domain/types';

import { DOMAINS } from '@/domain/domains';

export function VerticalContext({ active = 'CARAVAN' as Domain }: { active?: Domain }) {
  return (
    <div className="shrink-0 flex items-center gap-1" role="group" aria-label="Domain product">
      <span className="label-sm hidden md:inline mr-1">Domain product</span>
      {DOMAINS.map((d) => (
        <button
          key={d.id}
          type="button"
          disabled={!d.enabled}
          aria-pressed={d.id === active}
          title={d.scope}
          className={`px-2 py-1 rounded-[var(--radius-md)] text-[12px] font-medium border ${d.enabled ? "" : "hidden sm:inline-flex"}`}
          style={{
            borderColor: d.id === active ? 'var(--border-accent)' : 'var(--border-subtle)',
            color: d.id === active ? 'var(--accent-strong)' : 'var(--text-muted)',
            background: d.id === active ? 'rgba(var(--accent-rgb), 0.08)' : 'transparent',
          }}
        >
          {d.label}
          {!d.enabled && <span className="sr-only"> (module slot, not available)</span>}
        </button>
      ))}
    </div>
  );
}
