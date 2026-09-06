'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VerticalContext } from './VerticalContext';
import { locate } from './nav';

/**
 * The top bar: brand, where you are (area · page), the domain product. The
 * primary navigation itself lives in the sidebar, which is a left rail on
 * wide screens and a strip beneath this bar on small ones.
 */
export function TopNav() {
  const pathname = usePathname() ?? '/';
  const here = locate(pathname);
  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-3 sm:px-4 border-b"
      style={{ height: 'var(--topbar-h)', background: 'var(--bg-void)', borderColor: 'var(--border-default)' }}
    >
      <span className="flex items-baseline gap-2 shrink-0">
        <Link href="/releases" className="font-semibold tracking-tight" style={{ color: 'var(--text-heading)' }} aria-label="Payload OS home" title="Payload OS — shared information-production system">Payload OS</Link>
        <Link href="/product" className="label-sm hidden sm:inline" aria-label="Notation Systems product model">Notation Systems</Link>
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-2 text-[13px]" aria-label="Where you are" data-testid="where">
        {here ? (
          <>
            <span className="label-sm hidden sm:inline">{here.area.label}</span>
            <span aria-hidden="true" className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="truncate" style={{ color: 'var(--text-heading)' }}>{here.item.label}</span>
          </>
        ) : <span className="label-sm">Payload OS</span>}
      </div>
      <VerticalContext />
    </header>
  );
}
