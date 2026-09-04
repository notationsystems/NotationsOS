'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VerticalContext } from './VerticalContext';

export const PRIMARY_NAV: ReadonlyArray<{ href: string; label: string; match: RegExp }> = [
  { href: '/cases', label: 'Cases', match: /^\/cases/ },
  { href: '/rulings', label: 'Rulings', match: /^\/rulings/ },
  { href: '/evidence', label: 'Evidence', match: /^\/evidence/ },
  { href: '/replay', label: 'Replay', match: /^\/replay/ },
  { href: '/profiles', label: 'Profiles', match: /^\/profiles/ },
  { href: '/api', label: 'API', match: /^\/api/ },
];

export function TopNav() {
  const pathname = usePathname() ?? '/';
  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-3 sm:px-4 border-b"
      style={{ height: 'var(--topbar-h)', background: 'var(--bg-void)', borderColor: 'var(--border-default)' }}
    >
      <Link href="/cases" className="flex items-baseline gap-2 shrink-0" aria-label="Payload OS home">
        <span className="font-semibold tracking-tight" style={{ color: 'var(--text-heading)' }}>Payload OS</span>
        <span className="label-sm hidden sm:inline" aria-hidden="true">Notation Systems</span>
      </Link>
      <nav aria-label="Primary" className="flex-1 min-w-0 overflow-x-auto">
        <ul className="flex items-center gap-1 list-none m-0 p-0">
          {PRIMARY_NAV.map((item) => {
            const active = item.match.test(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="inline-flex items-center px-2.5 py-1.5 rounded-[var(--radius-md)] text-[13px] font-medium whitespace-nowrap"
                  style={{
                    color: active ? 'var(--text-heading)' : 'var(--text-secondary)',
                    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                    boxShadow: active ? 'inset 0 -2px 0 var(--accent)' : 'none',
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <VerticalContext />
    </header>
  );
}
