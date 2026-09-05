'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOMAINS } from '@/domain/domains';
import { useNotationDraftStatus } from '@/components/notations/NotationWorkspace';
import { NAV_AREAS } from './nav';

/** The one primary navigation: five activity areas over the existing routes, with the context that never changes here. */
export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const domain = DOMAINS.find((d) => d.enabled)!;
  const draft = useNotationDraftStatus();
  return (
    <aside className="app-sidebar" aria-label="Navigation and context">
      <nav aria-label="Primary">
        <ul className="nav-areas list-none m-0 p-0">
          {NAV_AREAS.map((area) => (
            <li key={area.id} className="nav-area" data-area={area.id}>
              <div className="nav-area-head">
                <span className="label-sm">{area.label}</span>
                <span className="nav-area-activity">{area.activity}</span>
              </div>
              <ul className="nav-links" aria-label={area.label}>
                {area.items.map((item) => {
                  const active = item.match.test(pathname) && !item.href.includes('#');
                  return (
                    <li key={item.href} className="flex items-center gap-1">
                      <Link href={item.href} className="nav-link" aria-current={active ? 'page' : undefined}>{item.label}</Link>
                      {item.href === '/notations' && draft?.unsaved && <span className="nav-mark" data-testid="nav-draft-marker" title={`Unsaved notation work kept in this tab: ${draft.pendingCount} validated ${draft.pendingCount === 1 ? 'command' : 'commands'}, ${draft.textCount} ${draft.textCount === 1 ? 'field' : 'fields'} of text`}>draft<span className="sr-only">: unsaved notation work kept in this tab</span></span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
      <div className="app-context" data-testid="shell-context">
        <span><span className="label-sm">Domain product</span> {domain.label} · {domain.scope}</span>
        <span><span className="label-sm">Data</span> Committed demonstration fixtures; local rails where enabled. Every screen says which.</span>
      </div>
    </aside>
  );
}
