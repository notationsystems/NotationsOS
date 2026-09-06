/**
 * The adapter boundary.
 */
import type { AdmissionProfile, ClaimCaseBundle, Remediation, Ruling } from '@/domain/types';
import { FIXTURE_PROFILES, FIXTURE_REMEDIATIONS } from '@/fixtures';
import { allRulings } from '@/domain/selectors';
import { db } from '@/db';
import { cases, rulings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface CaseSource {
  readonly origin: { kind: 'FIXTURE'; label: string } | { kind: 'LIVE'; label: string };
  listCases(): Promise<ClaimCaseBundle[]>;
  getCase(caseId: string): Promise<ClaimCaseBundle | undefined>;
  getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined>;
  listProfiles(): Promise<AdmissionProfile[]>;
  getProfile(profileId: string): Promise<AdmissionProfile | undefined>;
  getRemediation(remediationId: string): Promise<Remediation | undefined>;
}

export class LiveCaseSource implements CaseSource {
  readonly origin = { kind: 'LIVE', label: 'Live Cloud SQL Workbench' } as const;

  private async fetchFullCase(caseId: string): Promise<ClaimCaseBundle | undefined> {
    const caseRes = await db.select().from(cases).where(eq(cases.caseId, caseId));
    if (caseRes.length === 0) return undefined;
    
    const [c] = caseRes;
    const allRulings = await db.select().from(rulings).where(eq(rulings.caseId, caseId));
    
    const sortedRulings = allRulings.map(r => r.data as unknown as Ruling).sort((a, b) => b.revision - a.revision);
    
    return {
      ...(c.data as Record<string, unknown>),
      currentRuling: sortedRulings.length > 0 ? sortedRulings[0] : undefined,
      previousRulings: sortedRulings.length > 1 ? sortedRulings.slice(1) : []
    } as ClaimCaseBundle;
  }

  async listCases(): Promise<ClaimCaseBundle[]> {
    const allCases = await db.select().from(cases);
    const results: ClaimCaseBundle[] = [];
    for (const c of allCases) {
       const full = await this.fetchFullCase(c.caseId);
       if (full) results.push(full);
    }
    return results;
  }

  async getCase(caseId: string): Promise<ClaimCaseBundle | undefined> {
    return this.fetchFullCase(caseId);
  }

  async getRuling(rulingId: string): Promise<{ bundle: ClaimCaseBundle; ruling: Ruling } | undefined> {
     const rulingRes = await db.select().from(rulings).where(eq(rulings.rulingId, rulingId));
     if (rulingRes.length === 0) return undefined;
     
     const bundle = await this.fetchFullCase(rulingRes[0].caseId);
     if (!bundle) return undefined;
     
     const ruling = allRulings(bundle).find((r) => r.rulingId === rulingId);
     if (!ruling) return undefined;
     
     return { bundle, ruling };
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

let source: CaseSource | undefined;

/** The source the app runs on. */
export function getCaseSource(): CaseSource {
  if (!source) source = new LiveCaseSource();
  return source;
}
