import { deliverableRecords, type Corpus, type CorpusRecord, type CorpusRelease } from '@/domain/corpus';

/** The only record metadata the Earth page serializes into its client selector. */
export type EarthRecordChoice = Pick<CorpusRecord, 'recordId' | 'title' | 'subjectId' | 'predicate' | 'validFrom' | 'validTo'>;

/**
 * Server-side choices for the twin's fixed COUNTERPARTY_SHARED viewer. Reuse
 * the corpus delivery/visibility gate before projecting any metadata; never
 * return its withheld counts, reasons, identifiers, or the underlying records.
 * Historical corrected/retracted records remain selectable, as in the
 * projection compiler. This list grants neither geometry nor current truth:
 * the exact-version compiler still decides each selected realization.
 */
export function earthRecordChoices(corpus: Corpus, release: CorpusRelease): EarthRecordChoice[] {
  return deliverableRecords(corpus, release, 'COUNTERPARTY_SHARED').records.map((record) => ({
    recordId: record.recordId,
    title: record.title,
    subjectId: record.subjectId,
    predicate: record.predicate,
    validFrom: record.validFrom,
    ...(record.validTo === undefined ? {} : { validTo: record.validTo }),
  }));
}
