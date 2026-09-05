import type { Metadata } from 'next';
import { CoordinationWorkspace } from '@/components/coordination/CoordinationWorkspace';
import { getCoordinationSnapshot } from '@/coordination/store';

export const metadata: Metadata = { title: 'Agent & apparatus stable' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AgentsPage() {
  return <CoordinationWorkspace initial={await getCoordinationSnapshot()} view="stable" />;
}
