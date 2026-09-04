/**
 * The adapter boundary.
 *
 * Screens read through `CaseSource`. The only implementation in this
 * repository is the fixture source. A real source would map the substrate's
 * objects (result manifests, notary verdicts, attestation classes, corpus
 * contract axes) onto ClaimCaseBundle in a narrow adapter and would NOT
 * re-implement any gate: the ruling arrives ruled.
 *
 * Nothing in this module fetches over the network and nothing here decides
 * admissibility.
 */
import type { AdmissionProfile, ClaimCaseBundle, Remediation, Ruling } from '@/domain/types';
import { FIXTURE_CASES, FIXTURE_PROFILES, FIXTURE_REMEDIATIONS } from '@/fixtures';
import { allRulings } from '@/domain/selectors';

export interface CaseSource {
  /** Where the data comes from; rendered as a banner so fixtures are never mistaken for production. */
  readonly origin: { kind: 'FIXTURE'; label: string } | { kind: 'LIVE'; label: string };
  listCases(): Promise<ClaimCaseBundle[]>;
  getCase(caseId: string): Promise<ClaimCaseBundle | undefined>;
  /** A ruling by id, with the bundle it belongs to. */
  getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined>;
  listProfiles(): Promise<AdmissionProfile[]>;
  getProfile(profileId: string): Promise<AdmissionProfile | undefined>;
  getRemediation(remediationId: string): Promise<Remediation | undefined>;
}

export class FixtureCaseSource implements CaseSource {
  readonly origin = { kind: 'FIXTURE', label: 'Demonstration fixtures (fixture_only: true)' } as const;

  async listCases(): Promise<ClaimCaseBundle[]> {
    return [...FIXTURE_CASES];
  }

  async getCase(caseId: string): Promise<ClaimCaseBundle | undefined> {
    return FIXTURE_CASES.find((c) => c.caseId === caseId);
  }

  async getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined> {
    for (const bundle of FIXTURE_CASES) {
      const ruling = allRulings(bundle).find((r) => r.rulingId === rulingId);
      if (ruling) return { bundle, ruling };
    }
    return undefined;
  }

  async listProfiles(): Promise<AdmissionProfile[]> {
    return [...FIXTURE_PROFILES];
  }

  async getProfile(profileId: string): Promise<AdmissionProfile | undefined> {
    return FIXTURE_PROFILES.find((p) => p.profileId === profileId);
  }

  async getRemediation(remediationId: string): Promise<Remediation | undefined> {
    return FIXTURE_REMEDIATIONS[remediationId];
  }
}

/** Synchronous lookups for client components that already hold a bundle. */
export function remediationById(id: string): Remediation | undefined {
  return FIXTURE_REMEDIATIONS[id];
}

let source: CaseSource | undefined;

/** The source the app runs on. Only the fixture source exists. */
export function getCaseSource(): CaseSource {
  if (!source) source = new FixtureCaseSource();
  return source;
}
