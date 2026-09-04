import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCaseSource } from '@/adapter/caseSource';
import { RulingViewer } from '@/components/ruling/RulingViewer';

export async function generateMetadata({ params }: { params: Promise<{ rulingId: string }> }): Promise<Metadata> {
  const { rulingId } = await params;
  const hit = await getCaseSource().getRuling(decodeURIComponent(rulingId));
  return { title: hit ? `${hit.ruling.rulingId} · ${hit.ruling.status}` : 'Ruling not found' };
}

export default async function RulingPage({ params }: { params: Promise<{ rulingId: string }> }) {
  const { rulingId } = await params;
  const id = decodeURIComponent(rulingId);
  const hit = await getCaseSource().getRuling(id);
  if (!hit) notFound();
  return <RulingViewer bundle={hit.bundle} rulingId={id} />;
}
