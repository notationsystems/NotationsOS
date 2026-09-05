'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VerticalContext } from './VerticalContext';

/**
 * Two groups. The corpus and its feed are the product and come first; the
 * ruling workbench is an application over the corpus and comes second.
 */
export const NAV_GROUPS: ReadonlyArray<{ group: string; items: ReadonlyArray<{ href: string; label: string; match: RegExp }> }> = [
  {
    group: 'Corpus',
    items: [
      { href: '/releases', label: 'Releases', match: /^\/releases/ },
      { href: '/stream', label: 'Stream', match: /^\/stream/ },
      { href: '/retractions', label: 'Retractions', match: /^\/retractions/ },
      { href: '/api', label: 'API', match: /^\/api/ },
    ],
  },
  {
    group: 'Workbench',
    items: [
      { href: '/cases', label: 'Cases', match: /^\/cases/ },
      { href: '/rulings', label: 'Rulings', match: /^\/rulings/ },
      { href: '/evidence', label: 'Evidence', match: /^\/evidence/ },
      { href: '/replay', label: 'Replay', match: /^\/replay/ },
      { href: '/profiles', label: 'Profiles', match: /^\/profiles/ },
    ],
  },
];

export const PRIMARY_NAV = NAV_GROUPS.flatMap((g) => g.items);

export function TopNav() {
  const pathname = usePathname() ?? '/';
  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-3 sm:px-4 border-b"
      style={{ height: 'var(--topbar-h)', background: 'var(--bg-void)', borderColor: 'var(--border-default)' }}
    >
      <span className="flex items-baseline gap-2 shrink-0">
        <Link href="/releases" className="font-semibold tracking-tight" style={{ color: 'var(--text-heading)' }} aria-label="Payload OS home" title="Payload OS — shared information-production system">Payload OS</Link>
        <Link href="/product" className="label-sm hidden sm:inline" aria-label="Notation Systems product model">Notation Systems</Link>
      </span>
      <nav aria-label="Primary" className="flex-1 min-w-0 overflow-x-auto">
        <ul className="flex items-center gap-1 list-none m-0 p-0">
          {NAV_GROUPS.map((g, gi) => (
            <li key={g.group} className="flex items-center gap-1">
              {gi > 0 && <span aria-hidden="true" className="mx-1 h-4 border-l" style={{ borderColor: 'var(--border-default)' }} />}
              <span className="label-sm hidden lg:inline mr-0.5" aria-hidden="true">{g.group}</span>
              <ul className="flex items-center gap-1 list-none m-0 p-0" aria-label={g.group}>
                {g.items.map((item) => {
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
            </li>
          ))}
        </ul>
      </nav>
      <VerticalContext />
    </header>
  );
}
