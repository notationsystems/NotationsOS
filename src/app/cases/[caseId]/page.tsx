import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCaseSource } from '@/adapter/caseSource';
import { CaseWorkspace } from '@/components/case/CaseWorkspace';

export async function generateMetadata({ params }: { params: Promise<{ caseId: string }> }): Promise<Metadata> {
  const { caseId } = await params;
  const bundle = await getCaseSource().getCase(decodeURIComponent(caseId));
  return { title: bundle ? `${bundle.title} · ${bundle.status}` : 'Case not found' };
}

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const bundle = await getCaseSource().getCase(decodeURIComponent(caseId));
  if (!bundle) notFound();
  return <CaseWorkspace bundle={bundle} />;
}
