import { TopNav } from './TopNav';

/**
 * The Payload OS shell: a skip link, a compact top bar carrying the primary
 * navigation and the (non-dominant) vertical context, and a main region.
 * The case and the ruling are the primary objects; the shell stays out of
 * their way.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="skip-link">Skip to main content</a>
      <TopNav />
      <main id="main" tabIndex={-1} className="flex-1 min-w-0 outline-none">
        {children}
      </main>
    </div>
  );
}
