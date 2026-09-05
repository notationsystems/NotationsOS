import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/shell/AppShell';
import { NotationDraftProvider } from '@/components/notations/NotationWorkspace';

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
    'Payload OS — a fixture-only corpus product surface and optional ruling workbench over Notation Systems provenance-bearing computational corpora. It does not execute customer inference or construct production canonical state.',
  robots: { index: false, follow: false },
  authors: [{ name: 'Notation Systems' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotationDraftProvider><AppShell>{children}</AppShell></NotationDraftProvider>
      </body>
    </html>
  );
}
