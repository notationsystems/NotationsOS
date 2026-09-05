import type { Metadata } from 'next';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { releaseRecords } from '@/domain/corpus';
import { EARTH_ENGINE } from '@/domain/earth';
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
  const records = releaseRecords(corpus, release).map((r) => ({ recordId: r.recordId, title: r.title, subjectId: r.subjectId, predicate: r.predicate, validFrom: r.validFrom, validTo: r.validTo }));
  const assetsReady = ['Workers', 'Assets/Textures/NaturalEarthII', 'Widgets/widgets.css'].every((part) => existsSync(join(process.cwd(), 'public', EARTH_ENGINE.assetsPath, part)));
  return (
    <>
      <FixtureBanner note={`Corpus: committed demonstration release ${release.releaseId}. Globe: imagery bundled with ${EARTH_ENGINE.name}, served from this origin; no key, no live source.`} />
      <EarthTwin release={{ releaseId: release.releaseId, corpusId: release.corpusId, knownAt: descriptor.knownAt }} source={descriptor.source} records={records} assetsReady={assetsReady} />
    </>
  );
}
