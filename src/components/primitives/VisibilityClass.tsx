import type { VisibilityClass as VisibilityClassT } from '@/domain/types';
import { VISIBILITY_SEMANTICS } from '@/domain/selectors';

const GLYPH: Record<VisibilityClassT, string> = {
  INTERNAL_ONLY: '⌂',
  PRIVATE_PREFLIGHT: '◇',
  COUNTERPARTY_SHARED: '◈',
  DELAYED_AGGREGATE: '∑',
  PUBLIC_RULING: '◎',
};

export function VisibilityBadge({ visibility, size = 'sm' }: { visibility: VisibilityClassT; size?: 'sm' | 'md' }) {
  const s = VISIBILITY_SEMANTICS[visibility];
  return (
    <span
      className={`pill ${size === 'sm' ? 'text-[10.5px] px-1.5' : ''}`}
      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
      title={s.meaning}
      data-visibility={visibility}
    >
      <span aria-hidden="true">{GLYPH[visibility]}</span>
      <span>{s.label}</span>
    </span>
  );
}
