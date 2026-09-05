import type { Metadata } from 'next';
import { inspectEarthAssets } from '@/earth/assets.mjs';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { EARTH_ENGINE } from '@/domain/earth';
import { earthRecordChoices } from '@/earth/records';
import { describeProjectionSource } from '@/projection/source';
import { EarthTwin } from '@/components/earth/EarthTwin';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';

export const metadata: Metadata = { title: 'Earth Twin' };
export const dynamic = 'force-dynamic';

/** The Earth Twin over the latest committed release: the descriptor and the record list are read on the server; the engine and the projection requests run in the browser, on this origin only. */
export default function EarthPage() {
  const corpus = CARAVAN_CORPUS;
  const release = [...corpus.releases].sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1))[0];
  const descriptor = describeProjectionSource(release.releaseId);
  const records = earthRecordChoices(corpus, release);
  const assetsReady = inspectEarthAssets().state === 'READY';
  return (
    <>
      <FixtureBanner note={`Corpus: committed demonstration release ${release.releaseId}. Globe: imagery bundled with ${EARTH_ENGINE.name}, served from this origin; no key, no live source.`} />
      <EarthTwin release={{ releaseId: release.releaseId, corpusId: release.corpusId, knownAt: descriptor.knownAt }} source={descriptor.source} records={records} assetsReady={assetsReady} />
    </>
  );
}
