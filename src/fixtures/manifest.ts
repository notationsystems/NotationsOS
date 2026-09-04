/**
 * Build the result-manifest sidecar for a ruling, shaped to the control
 * plane's `notations.result-manifest.v1` contract
 * (notations-ecosystem/control-plane/src/governance/result-manifest.js):
 *   schema, manifestId, queryId, corpusBuild{buildId,knownAt},
 *   methodology{methodologyId,version}, knownAt, result, entitiesUsed,
 *   assertionsUsed, evidenceUsed, computations, uncertainties,
 *   contradictions, verification{status,checkedAt}.
 *
 * The manifest commitment shown in the UI is sha256(canonicalJson(manifest)).
 * The browser only renders it; the digest is stamped and tested in node.
 * Conformance to the contract is asserted by manifest.contract.test.ts
 * against a vendored, digest-pinned copy of the control plane's parser.
 */
import type { ClaimCaseBundle, Ruling } from '@/domain/types';

export interface ResultManifestV1 {
  schema: 'notations.result-manifest.v1';
  manifestId: string;
  queryId: string;
  corpusBuild: { buildId: string; knownAt: string };
  methodology: { methodologyId: string; version: string };
  knownAt: string;
  result: Record<string, unknown>;
  entitiesUsed: string[];
  assertionsUsed: string[];
  evidenceUsed: string[];
  computations: Array<{ transformId: string; outputIds: string[]; deterministic: boolean; parametersSha256: string | null }>;
  uncertainties: Array<{ kind: string; summary: string }>;
  contradictions: string[];
  verification: { status: 'verified' | 'partially_verified' | 'unverified' | 'challenged'; checkedAt: string };
}

export function buildResultManifest(bundle: ClaimCaseBundle, ruling: Ruling): ResultManifestV1 {
  const claims = bundle.claims.filter((c) => ruling.ruledClaimIds.includes(c.claimId));
  const evidence = bundle.evidence.filter((e) => ruling.consideredEvidenceIds.includes(e.evidenceId));
  const computations = claims
    .filter((c) => c.normalizedValue?.transformId)
    .map((c) => ({ transformId: c.normalizedValue!.transformId!, outputIds: [c.canonicalId ?? `notation://claim/payload-os-demo/${c.claimId}`], deterministic: true, parametersSha256: null }));
  const uncertainties = claims
    .flatMap((c) => {
      const u = c.normalizedValue?.uncertainty ?? c.assertedValue?.uncertainty;
      if (!u) return [];
      return [{ kind: 'confidence_interval', summary: `${c.claimId}: ±${u.value ?? '?'} ${u.unit ?? ''} (${u.semantics ?? 'unstated'})`.trim() }];
    });
  // The contract restricts `contradictions` to claim | observation | state
  // identities. Contested claims are the contradiction the ruling saw;
  // contradictory ARTIFACTS stay on the invariant result, not here.
  const contradictions = claims
    .filter((c) => c.status === 'CONTESTED')
    .map((c) => c.canonicalId ?? `notation://claim/payload-os-demo/${c.claimId}`)
    .filter((v, i, a) => a.indexOf(v) === i);
  return {
    schema: 'notations.result-manifest.v1',
    manifestId: `rm:${ruling.rulingId}`,
    queryId: `case:${bundle.caseId}:r${ruling.revision}`,
    corpusBuild: { buildId: ruling.corpus.buildId, knownAt: ruling.corpus.knownAt },
    methodology: { methodologyId: 'payload-methodology', version: '0.1.0' },
    knownAt: ruling.temporalBasis.knownAt ?? bundle.asOf,
    result: {
      rulingId: ruling.rulingId,
      revision: ruling.revision,
      status: ruling.status,
      useCode: ruling.useScope.useCode,
      tolerance: ruling.useScope.tolerance ?? null,
      profileId: ruling.profileId,
      profileVersion: ruling.profileVersion,
      registerDigest: ruling.registerDigest,
      validAt: ruling.temporalBasis.validAt ?? null,
      knownAt: ruling.temporalBasis.knownAt ?? null,
      ruledAt: ruling.temporalBasis.ruledAt ?? null,
      assuranceClass: ruling.assurance.class,
      checks: ruling.invariantResults
        .filter((r) => r.origin === 'AUTOMATIC')
        .map((r) => ({ invariantId: r.invariantId, status: r.status, refusalCode: r.refusalCode ?? null })),
      conditions: (ruling.conditions ?? []).map((c) => c.conditionId),
    },
    entitiesUsed: [bundle.subject.canonicalId ?? `notation://entity/payload-os-demo/${bundle.subject.subjectId}`],
    assertionsUsed: claims.map((c) => c.canonicalId ?? `notation://claim/payload-os-demo/${c.claimId}`),
    evidenceUsed: evidence.map((e) => e.canonicalId ?? `notation://artifact/payload-os-demo/${e.evidenceId}`),
    computations,
    uncertainties,
    contradictions,
    verification: {
      status: ruling.assurance.manifestVerification ?? 'unverified',
      checkedAt: ruling.assurance.manifestCheckedAt ?? ruling.temporalBasis.evaluatedAt ?? bundle.asOf,
    },
  };
}
