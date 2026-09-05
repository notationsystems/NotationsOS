'use client';

import { useEffect, useRef } from 'react';

/**
 * Asked when internal navigation would leave unsaved work behind. Focus
 * moves into the dialog and returns to where it was; Escape stays.
 * Leaving keeps the drafts in this tab; discarding is explicit.
 */
export function LeaveDialog({ href, pendingCount, textCount, onStay, onLeave, onDiscard }: { href: string; pendingCount: number; textCount: number; onStay: () => void; onLeave: () => void; onDiscard: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onStay(); } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus?.(); };
  }, [onStay]);
  return (
    <section role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-description" className="surface p-3" data-testid="leave-dialog">
      <h2 id="leave-title" className="font-semibold">Leave with unsaved work?</h2>
      <p id="leave-description" className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
        You are about to open <span className="mono">{href}</span> with {pendingCount} validated, unsaved {pendingCount === 1 ? 'command' : 'commands'} and {textCount} {textCount === 1 ? 'field' : 'fields'} of unapplied text. Leaving keeps them in this browser tab and restores them when you return; nothing is saved by leaving.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button ref={first} type="button" className="btn btn-sm btn-primary" onClick={onStay}>Stay</button>
        <button type="button" className="btn btn-sm" onClick={onLeave}>Leave and keep drafts</button>
        <button type="button" className="btn btn-sm" onClick={onDiscard}>Discard drafts and leave</button>
      </div>
    </section>
  );
}
