import { createHash } from 'node:crypto';
import type { Corpus, CorpusRecord, CorpusRelease, RecordStatus } from '../domain/corpus';
import { releaseRecords } from '../domain/corpus';
import { recordPayload } from '../adapter/feedShapes';
import { FIXTURE_CORPORA } from '../fixtures';
import { canonicalJson } from '../fixtures/digest';
import { releaseCanonical } from '../fixtures/digestPlan';
import { buildReleaseManifest } from '../fixtures/releaseManifest';
import { parseISOInstant } from '../data-os/validation';
import { ProjectionError, type ProjectionSpec } from './spec';

type CorrectionPointer = 'supersedesRecordId' | 'supersededByRecordId' | 'retractedByRetractionId';
export type ProjectionRecord = Omit<ReturnType<typeof recordPayload>, CorrectionPointer> & { statusAtKnownAt: RecordStatus };
export const projectionHash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const projectionDigest = (value: unknown) => `sha256:${projectionHash(value)}`;
export const sourceTime = (value: string) => parseISOInstant(value, 'source time');
const SNAPSHOT_CODEC = 'payload.fixture-projection-source.v1';

function statusAt(corpus: Corpus, release: CorpusRelease, record: CorpusRecord, knownAt: number): RecordStatus {
  const retraction = corpus.retractions.find((item) => item.retractionId === record.retractedByRetractionId);
  if (retraction && sourceTime(retraction.issuedAt) <= knownAt) return 'RETRACTED';
  const replacement = releaseRecords(corpus, release).find((item) => item.recordId === record.supersededByRecordId);
  if (replacement && sourceTime(replacement.knownAt) <= knownAt) return 'SUPERSEDED';
  return 'CURRENT';
}

export function projectionRecord(corpus: Corpus, release: CorpusRelease, record: CorpusRecord, knownAt: number): ProjectionRecord {
  const payload = recordPayload(record, release.sources.find((source) => source.sourceId === record.provenance.sourceId));
  // Omit correction pointers: they may disclose later or withheld identities.
  const safe = Object.fromEntries(Object.entries(payload).filter(([key]) =>
    !['supersedesRecordId', 'supersededByRecordId', 'retractedByRetractionId'].includes(key))) as Omit<ProjectionRecord, 'statusAtKnownAt'>;
  return { ...safe, statusAtKnownAt: statusAt(corpus, release, record, knownAt) };
}

export function resolveProjectionRelease(corpusId: string, releaseId: string, corpora: readonly Corpus[]) {
  const matches = corpora.filter((item) => item.corpusId === corpusId);
  const corpus = matches[0];
  const releases = corpus?.releases.filter((item) => item.releaseId === releaseId) ?? [];
  const release = releases[0];
  if (matches.length !== 1 || releases.length !== 1 || !corpus?.fixture_only || !release?.fixture_only ||
      release.corpusId !== corpus.corpusId || release.domain !== corpus.domain) {
    throw new ProjectionError('SOURCE_NOT_AVAILABLE', 'The explicitly named demonstration corpus release is not available.');
  }
  return { corpus, release };
}

/** Legacy commitments stay untouched. A separate full snapshot pins fields their schema omits. */
export function projectionSource(corpus: Corpus, release: CorpusRelease): ProjectionSpec['source'] {
  try {
    const records = releaseCanonical(corpus, release.releaseId);
    const contentDigest = projectionHash({ releaseId: release.releaseId, corpusId: corpus.corpusId, knownAt: release.knownAt, records });
    if (!records || contentDigest !== release.releaseDigest || projectionHash(buildReleaseManifest(corpus, release)) !== release.certification.manifestCommitment) throw new Error('Legacy commitment drift.');
    const cutoff = sourceTime(release.knownAt);
    const members = releaseRecords(corpus, release);
    const memberIds = new Set(members.map((record) => record.recordId));
    if (memberIds.size !== members.length) throw new Error('Duplicate committed record identities.');
    for (const record of members) {
      sourceTime(record.knownAt); sourceTime(record.validFrom);
      if (record.validTo !== undefined && sourceTime(record.validTo) <= sourceTime(record.validFrom)) throw new Error('Invalid source interval.');
    }
    // Complete source records include correction routing, while projection rows
    // omit those pointers. Include relevant known correction bodies and the
    // derived historical status, not future records or a filesystem location.
    const snapshot = { schema: SNAPSHOT_CODEC, corpusId: corpus.corpusId, domain: corpus.domain, release,
      governance: corpus.governance,
      records: [...members].sort((a, b) => a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0)
        .map((record) => ({ record, statusAtRelease: statusAt(corpus, release, record, cutoff) })),
      retractions: corpus.retractions.filter((item) => sourceTime(item.issuedAt) <= cutoff &&
        (item.affectedRecordIds.some((id) => memberIds.has(id)) || members.some((record) => record.retractedByRetractionId === item.retractionId)))
        .sort((a, b) => a.retractionId < b.retractionId ? -1 : a.retractionId > b.retractionId ? 1 : 0),
    };
    return { kind: 'CORPUS_RELEASE', corpusId: corpus.corpusId, releaseId: release.releaseId,
      releaseDigest: release.releaseDigest, manifestCommitment: release.certification.manifestCommitment,
      snapshotDigest: projectionDigest(snapshot) };
  } catch { throw new ProjectionError('SOURCE_INTEGRITY_FAILED', 'The demonstration release snapshot could not be recomputed.'); }
}

/** Public fixture descriptor only: no record rows, private fields or storage references. */
export function describeProjectionSource(releaseId: string, corpora: readonly Corpus[] = FIXTURE_CORPORA) {
  const candidates = corpora.flatMap((corpus) => corpus.releases.filter((release) => release.releaseId === releaseId).map(() => corpus.corpusId));
  if (candidates.length !== 1) throw new ProjectionError('SOURCE_NOT_AVAILABLE', 'The explicitly named demonstration corpus release is not available.');
  const { corpus, release } = resolveProjectionRelease(candidates[0], releaseId, corpora);
  return { schema: 'payload.projection-source.v1' as const, fixture_only: true as const,
    source: projectionSource(corpus, release), domain: release.domain, buildId: release.build.buildId,
    knownAt: release.knownAt, snapshotCodec: SNAPSHOT_CODEC };
}
