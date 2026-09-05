/**
 * The first information product, specified: its customer question, subjects,
 * fields with evidence requirements, freshness, permitted uses and correction
 * behaviour. This is the litepaper's first step made concrete, and it is
 * held to the demonstration corpus by informationProduct.test.ts: every
 * field exists, every released record of that field meets the stated
 * evidence requirement, and the customer question is answerable through the
 * feed as a delivered record.
 */
import type { ClaimStrength, Interest, ProductionClass } from './types';

export interface ProductField {
  predicate: string;
  meaning: string;
  unit?: string;
  subjectTypes: readonly string[];
  /** The evidence classes a released record of this field may carry. Anything outside is a spec violation, not a footnote. */
  acceptable: { productionClass: readonly ProductionClass[]; claimStrength: readonly ClaimStrength[]; interest: readonly Interest[] };
  note?: string;
}

export interface InformationProduct {
  schema: 'payload-os.information-product.v0';
  productId: string;
  domain: 'CARAVAN';
  title: string;
  customerQuestion: string;
  customerCategories: readonly ('brokers' | 'asset_managers' | 'insurance_financing')[];
  subjects: readonly { subjectType: string; identity: string; meaning: string; linkedBy?: string }[];
  fields: readonly ProductField[];
  freshness: { cutoff: string; cadence: string; staleness: string };
  permittedUses: { delivery: string; prohibitedPurposes: readonly string[]; redistribution: string };
  correction: { mechanism: string; kinds: readonly ('CORRECTION' | 'WITHDRAWAL')[]; history: string; asOf: string };
  /** The litepaper's immediate acceptance target, as steps; each names whether this repository reaches it. */
  acceptance: readonly { step: string; reachedHere: boolean; how: string }[];
}

const ANY_INTEREST: readonly Interest[] = ['disinterested', 'unknown', 'self_reported', 'negotiating_position'];

export const CARAVAN_LOT_STATE: InformationProduct = {
  schema: 'payload-os.information-product.v0',
  productId: 'caravan.lot-state.v0',
  domain: 'CARAVAN',
  title: 'Caravan lot state',
  customerQuestion: 'For a cargo lot under a brokerage claim: what quantity and condition were recorded for it, by whom and with what interest, as knowable at a stated time, and under which rights may the answer be used?',
  customerCategories: ['brokers', 'insurance_financing'],
  subjects: [
    { subjectType: 'Lot', identity: 'notation://lot/<authority>/<lot-id>', meaning: 'A cargo lot as the parties name it. Its canonical identity is stable across records, releases and projections.' },
    { subjectType: 'Sample', identity: 'notation://sample/<authority>/<sample-id>', meaning: 'A sample drawn for measurement. It belongs to a lot only through an identity-link record; without one, a sample answers nothing about a lot.', linkedBy: 'identity.sample_of_lot' },
  ],
  fields: [
    { predicate: 'quantity.gross', meaning: 'Gross weight of the lot: a disinterested weighbridge measurement, or, until one exists, a draft-survey estimate computed by the carrier and marked as such.', unit: 't', subjectTypes: ['Lot'], acceptable: { productionClass: ['measured', 'computed'], claimStrength: ['reported', 'estimated'], interest: ['disinterested', 'unknown'] }, note: 'An estimate is superseded, never overwritten, when a measurement arrives; the earlier answer stays reproducible.' },
    { predicate: 'quantity.gross.declared', meaning: 'Gross weight as declared by a party to the transaction. Never substituted for a measurement.', unit: 't', subjectTypes: ['Lot'], acceptable: { productionClass: ['asserted'], claimStrength: ['reported', 'estimated'], interest: ANY_INTEREST }, note: 'Declared and measured quantities are distinct predicates so a customer can never confuse them.' },
    { predicate: 'condition.moisture', meaning: 'Moisture content of a sample as measured by a disinterested laboratory and certified.', unit: '%', subjectTypes: ['Sample'], acceptable: { productionClass: ['measured'], claimStrength: ['reported'], interest: ['disinterested'] }, note: 'Laboratory measurement only. A party-asserted moisture would be a different predicate.' },
    { predicate: 'contract.moisture_max', meaning: 'The contractual moisture ceiling a party negotiated.', unit: '%', subjectTypes: ['Lot'], acceptable: { productionClass: ['asserted'], claimStrength: ['reported'], interest: ['negotiating_position', 'self_reported', 'unknown', 'disinterested'] } },
    { predicate: 'custody.loading_completed', meaning: 'A custody event: loading of the lot completed, from an operator system or a party log.', subjectTypes: ['Lot'], acceptable: { productionClass: ['measured', 'asserted'], claimStrength: ['reported'], interest: ANY_INTEREST }, note: 'The interest axis tells a customer whether the operator or the claimant recorded it.' },
    { predicate: 'identity.sample_of_lot', meaning: 'An identity link: this sample was drawn from that lot. The only way a sample speaks for a lot.', subjectTypes: ['Sample'], acceptable: { productionClass: ['asserted', 'measured'], claimStrength: ['reported'], interest: ['disinterested'] }, note: 'Only a disinterested source may link a sample to a lot; without such a link the feed refuses, it does not guess.' },
  ],
  freshness: {
    cutoff: 'Every release names its knowledge cutoff; every record in it became knowable at or before that instant.',
    cadence: 'A release when the inventory changes. The demonstration has three, with knowledge cutoffs 2026-08-12, 2026-08-26 and 2026-09-01.',
    staleness: 'Every answer names the release and both clocks; the customer judges staleness against their own clock, never against a hidden one.',
  },
  permittedUses: {
    delivery: 'Decided per record at the feed by the exact source-use decision from the source registration (EXPORT to CUSTOMER, or PUBLISH to PUBLIC for the public projection). Withheld records are counted, never disclosed.',
    prohibitedPurposes: ['PROPRIETARY_STRATEGY', 'TRADING'],
    redistribution: 'As the registration says: licensed, internal only, or approval required. Nothing defaults to allowed.',
  },
  correction: {
    mechanism: 'A push retraction feed. A CORRECTION names the affected records and their replacements; a WITHDRAWAL names the affected records and no replacement.',
    kinds: ['CORRECTION', 'WITHDRAWAL'],
    history: 'The earlier record stays, marked superseded or retracted, with the retraction id. Nothing is erased.',
    asOf: 'A query at an earlier knowledge time returns the earlier answer; the same query at a later time returns the correction. Both are reproducible from the same release.',
  },
  acceptance: [
    { step: 'A permitted source becomes an inspectable candidate', reachedHere: true, how: 'The local rail: declared policy, exact INGEST and DERIVE decisions, a Carrier candidate with its provenance, shown on /candidates.' },
    { step: 'The candidate crosses a recorded admission boundary', reachedHere: false, how: 'Admission is absent. Candidates stay UNADMITTED; the state kernel is specified outside this repository.' },
    { step: 'The admitted information reaches a versioned customer interface', reachedHere: false, how: 'The feed serves committed demonstration releases, not admitted candidates. The interface and its delivered-record contract exist; the bridge from candidate to release does not.' },
    { step: 'A later correction remains traceable without erasing history', reachedHere: true, how: 'The demonstration corpus carries one correction and one withdrawal; as-of queries reproduce the earlier and the later answer; affected records keep their history.' },
  ],
};

export const INFORMATION_PRODUCTS: readonly InformationProduct[] = [CARAVAN_LOT_STATE];
