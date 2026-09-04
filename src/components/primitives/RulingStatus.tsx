import type { RulingStatus as RulingStatusT } from '@/domain/types';
import { STATUS_SEMANTICS } from '@/domain/selectors';

/**
 * A ruling status is always rendered as glyph + label in its own colour, with
 * the scoped meaning available in the title attribute and, when `withMeaning`
 * is set, as visible text. Colour is never the only channel.
 */
export function RulingStatusPill({ status, size = 'md', withMeaning = false }: { status: RulingStatusT; size?: 'sm' | 'md' | 'lg'; withMeaning?: boolean }) {
  const s = STATUS_SEMANTICS[status];
  const color = `var(${s.cssVar})`;
  return (
    <span className="inline-flex flex-col gap-1 min-w-0">
      <span
        className={`pill ${size === 'lg' ? 'pill-lg' : ''} ${size === 'sm' ? 'text-[10.5px] px-1.5' : ''}`}
        style={{ color, borderColor: color, background: 'color-mix(in srgb, currentColor 10%, transparent)' }}
        data-status={status}
        title={s.meaning}
      >
        <span aria-hidden="true">{s.glyph}</span>
        <span>{s.label}</span>
      </span>
      {withMeaning && <span className="text-[12.5px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{s.meaning}</span>}
    </span>
  );
}
