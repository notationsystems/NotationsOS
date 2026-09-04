/**
 * Fixture registry — fixture_only: true throughout.
 *
 * Deterministic, committed demonstration data. Nothing here is a production
 * endpoint and nothing here adjudicates: rulings are stored as the substrate
 * would return them. Replace a case here with a real brokerage case by
 * providing another CaseSource (src/adapter/caseSource.ts); the screens do
 * not change.
 */
import type { AdmissionProfile, ClaimCaseBundle, Remediation } from '@/domain/types';
import { CASE_5B221, REMEDIATIONS_5B221 } from './caravan/admitted-5b221';
import { CASE_7C104, REMEDIATIONS_7C104 } from './caravan/refused-7c104';
import { CARAVAN_PROFILE } from './caravan/profile';
import { CASE_2E118, CASE_3F440, CASE_6C305, CASE_8D902, CASE_9A017 } from './caravan/thin';

export const FIXTURE_ONLY = true as const;

export const FIXTURE_CASES: readonly ClaimCaseBundle[] = [
  CASE_7C104,
  CASE_5B221,
  CASE_9A017,
  CASE_3F440,
  CASE_8D902,
  CASE_2E118,
  CASE_6C305,
];

export const FIXTURE_PROFILES: readonly AdmissionProfile[] = [CARAVAN_PROFILE];

export const FIXTURE_REMEDIATIONS: Record<string, Remediation> = {
  ...REMEDIATIONS_7C104,
  ...REMEDIATIONS_5B221,
};
