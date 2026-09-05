/**
 * The promise a delivered record makes. Ten questions a customer can put to
 * any record the feed delivers, each mapped to the payload fields that carry
 * the answer. Required fields must be present and not null; declared fields
 * must be present, and null there is an explicit statement of absence, never
 * a silent omission. A corpus-derived value must name its transform; a
 * source-computed value must state its basis and its producer. deliveredRecord.test.ts holds every record on both
 * projections to this contract.
 */
import type { recordPayload } from '@/adapter/feedShapes';

export type DeliveredRecord = ReturnType<typeof recordPayload>;

export interface DeliveredRecordQuestion {
  n: number;
  question: string;
  carriedBy: string;
  /** Dotted paths that must be present and not null. */
  required: readonly string[];
  /** Dotted paths that must be present; null declares absence. */
  declared: readonly string[];
  /** Requirements that hold only when a field has a given value. */
  when?: readonly { path: string; equals: unknown; require: readonly string[] }[];
}

export const DELIVERED_RECORD_CONTRACT = {
  schema: 'payload-os.delivered-record.v0',
  questions: [
    { n: 1, question: 'What does this describe?', carriedBy: 'Stable subject and record identities', required: ['recordId', 'canonicalId', 'subject.subjectId', 'subject.canonicalId', 'subject.subjectType'], declared: [] },
    { n: 2, question: 'What is being represented?', carriedBy: 'Typed value, unit, basis and domain meaning', required: ['predicate', 'title', 'value'], declared: ['unit', 'basis'] },
    { n: 3, question: 'Where did it come from?', carriedBy: 'Source references and provenance', required: ['provenance.sourceId', 'provenance.artifactId', 'provenance.contentDigest', 'provenance.storageKey', 'provenance.receiptId', 'rights.sourceId'], declared: [] },
    { n: 4, question: 'How was it produced?', carriedBy: 'Transformation and method lineage', required: ['evidenceClass.productionClass'], declared: ['basis', 'provenance.producerId', 'provenance.transformId'], when: [{ path: 'evidenceClass.productionClass', equals: 'derived', require: ['provenance.transformId'] }, { path: 'evidenceClass.productionClass', equals: 'computed', require: ['basis', 'provenance.producerId'] }] },
    { n: 5, question: 'When does it apply?', carriedBy: 'Valid-time bounds', required: ['validity.validFrom'], declared: ['validity.validTo'] },
    { n: 6, question: 'When was it known?', carriedBy: 'Knowledge-time context', required: ['knownAt'], declared: ['observedAt'] },
    { n: 7, question: 'How limited is it?', carriedBy: 'Uncertainty, missingness and evidence class', required: ['evidenceClass.claimStrength', 'evidenceClass.interest'], declared: ['uncertainty'] },
    { n: 8, question: 'What may I do with it?', carriedBy: 'Applicable rights and visibility', required: ['visibility', 'rights.permittedUses', 'rights.redistribution', 'rights.attributionRequired', 'rights.deliveryDecision.state', 'rights.registration.registrationId'], declared: ['rights.attribution'] },
    { n: 9, question: 'Which version am I using?', carriedBy: 'Corpus, build and release references', required: ['firstReleaseId'], declared: [] },
    { n: 10, question: 'What changed afterward?', carriedBy: 'Supersession, correction or retraction history', required: [], declared: ['supersedesRecordId', 'supersededByRecordId', 'retractedByRetractionId'] },
  ] as readonly DeliveredRecordQuestion[],
} as const;

/** The envelope around delivered records names the release, its build and its knowledge cutoff; question 9 is answered by record and envelope together. */
export const ENVELOPE_FIELDS = ['release.releaseId', 'release.buildId', 'release.knownAt'] as const;

export function valueAt(obj: unknown, path: string): { present: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(key in (cur as object))) return { present: false, value: undefined };
    cur = (cur as Record<string, unknown>)[key];
  }
  return { present: true, value: cur };
}

export interface QuestionAnswer { n: number; question: string; answered: boolean; missing: string[]; undeclared: string[] }

/** For one delivered record, which questions it answers and exactly what is missing where it does not. */
export function answers(record: DeliveredRecord): QuestionAnswer[] {
  return DELIVERED_RECORD_CONTRACT.questions.map((q) => {
    const missing: string[] = [];
    const undeclared: string[] = [];
    for (const path of q.required) { const v = valueAt(record, path); if (!v.present || v.value === null || v.value === undefined) missing.push(path); }
    for (const path of q.declared) { const v = valueAt(record, path); if (!v.present || v.value === undefined) undeclared.push(path); }
    for (const rule of q.when ?? []) if (valueAt(record, rule.path).value === rule.equals) for (const path of rule.require) { const v = valueAt(record, path); if (!v.present || v.value === null || v.value === undefined) missing.push(path); }
    return { n: q.n, question: q.question, answered: missing.length === 0 && undeclared.length === 0, missing, undeclared };
  });
}

export function answersAll(record: DeliveredRecord): boolean {
  return answers(record).every((a) => a.answered);
}
