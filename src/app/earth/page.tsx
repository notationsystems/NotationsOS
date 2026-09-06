import type { Metadata } from 'next';
import { inspectEarthAssets } from '@/earth/assets.mjs';
import { EARTH_ENGINE } from '@/domain/earth';
import { earthRecordChoices } from '@/earth/records';
import { describeProjectionSource } from '@/projection/source';
import { EarthTwin } from '@/components/earth/EarthTwin';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { getCorpusSource } from '@/adapter/corpusSource';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Earth Twin' };
export const dynamic = 'force-dynamic';

export default async function EarthPage() {
  const corpus = await getCorpusSource().getCorpus('COR-CAR-2026.09.01');
  if (!corpus) return notFound();
  
  const release = [...corpus.releases].sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1))[0];
  const corpora = await getCorpusSource().listCorpora();
  const descriptor = describeProjectionSource(release.releaseId, corpora);
  const records = earthRecordChoices(corpus, release);
  const assetsReady = inspectEarthAssets().state === 'READY';
  
  return (
    <>
      <FixtureBanner note={`Corpus: live database release ${release.releaseId}. Globe: imagery bundled with ${EARTH_ENGINE.name}, served from this origin; no key, no live source.`} />
      <EarthTwin release={{ releaseId: release.releaseId, corpusId: release.corpusId, knownAt: descriptor.knownAt }} source={descriptor.source} records={records} assetsReady={assetsReady} />
    </>
  );
}
