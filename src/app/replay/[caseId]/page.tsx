import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCaseSource } from '@/adapter/caseSource';
import { ReplayView } from '@/components/replay/ReplayView';

export async function generateMetadata({ params }: { params: Promise<{ caseId: string }> }): Promise<Metadata> {
  const { caseId } = await params;
  return { title: `Replay · ${decodeURIComponent(caseId)}` };
}

export default async function ReplayPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const bundle = await getCaseSource().getCase(decodeURIComponent(caseId));
  if (!bundle) notFound();
  return <ReplayView bundle={bundle} />;
}
