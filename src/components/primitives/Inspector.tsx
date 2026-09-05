'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The contextual inspector: what the selected object is, in context, with
 * the actions allowed on it. A right column on wide screens, an inline
 * detail view on small ones; the same content either way. Escape closes it
 * and focus returns to where it was.
 */
export function Inspector({ id, title, subtitle, kicker, onClose, children, actions, testId = 'inspector' }: { id: string; title: string; subtitle?: ReactNode; kicker?: string; onClose?: () => void; children: ReactNode; actions?: ReactNode; testId?: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!onClose) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <section className="inspector" aria-labelledby={`${id}-title`} data-testid={testId}>
      <div className="inspector-head">
        <div className="min-w-0">
          {kicker && <div className="label-sm">{kicker}</div>}
          <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="m-0 text-[15px] font-semibold leading-snug break-words outline-none" style={{ color: 'var(--text-heading)' }}>{title}</h2>
          {subtitle && <div className="text-[12px] mt-0.5 break-words" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {actions}
          {onClose && <button type="button" className="btn btn-sm btn-quiet" onClick={onClose} aria-label={`Close ${title}`} title="Close (Esc)">✕</button>}
        </div>
      </div>
      <div className="inspector-body">{children}</div>
    </section>
  );
}
