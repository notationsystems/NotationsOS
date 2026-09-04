import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/shell/AppShell';

export const viewport: Viewport = {
  themeColor: '#06060c',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: {
    default: 'Payload OS',
    template: '%s · Payload OS',
  },
  description:
    'Payload OS ruling workbench — an optional application layer over Notation Systems provenance-bearing computational corpora. A case, its declared use, its evidence, its checks, its ruling, its remediation, its release, its history.',
  robots: { index: false, follow: false },
  authors: [{ name: 'Notation Systems' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
