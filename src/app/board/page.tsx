import type { Metadata } from 'next';
import { CoordinationWorkspace } from '@/components/coordination/CoordinationWorkspace';
import { getCoordinationSnapshot } from '@/coordination/store';

export const metadata: Metadata = { title: 'Message board' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function BoardPage() {
  return <CoordinationWorkspace initial={await getCoordinationSnapshot()} view="board" />;
}
