import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

/**
 * The Payload OS shell: a skip link, a compact top bar that says where you
 * are, the one primary navigation as a left rail (a strip on small screens),
 * and the main surface. Pages compose their own working surface and, when
 * an object is selected, an inspector; the shell stays out of the way.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to main content</a>
      <TopNav />
      <div className="app-body">
        <Sidebar />
        <main id="main" tabIndex={-1} className="app-main outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
