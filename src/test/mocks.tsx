import { vi } from 'vitest';

/** next/navigation is mocked for component tests; links render as anchors via next/link's default behaviour. */
export function mockNextNavigation(pathname = '/cases') {
  vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
    notFound: () => { throw new Error('notFound'); },
    redirect: () => { throw new Error('redirect'); },
  }));
}
