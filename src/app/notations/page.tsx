import type { Metadata } from 'next';
import { NotationWorkspace } from '@/components/notations/NotationWorkspace';

export const metadata: Metadata = { title: 'Notations · Local state workspace' };

// Local data is fetched by the browser through the guarded HTTP boundary, never during server rendering.
export default function NotationsPage() {
  return <NotationWorkspace />;
}
