/**
 * Pure payload shapes shared by the feed adapter (server) and the stream
 * explorer (client). No fixture or adapter imports: safe in any bundle.
 */
import type { AsOfAnswer, CorpusRecord, CorpusRelease, Retraction, RightsSchedule } from '@/domain/corpus';
import type { SourceUseDecision } from '@/data-os/contracts';

export const FEED_VERSION = 'payload-os.feed.v0-demo';

export function releaseSummary(r: CorpusRelease) {
  return {
    releaseId: r.releaseId,
    certification: { status: r.certification.status, certifiedAt: r.certification.certifiedAt ?? null, verification: r.certification.verification, manifestCommitment: r.certification.manifestCommitment },
    corpusId: r.corpusId,
    domain: r.domain,
    status: r.status,
    knownAt: r.knownAt,
    buildId: r.build.buildId,
    builtAt: r.build.builtAt,
    methodology: r.build.methodology,
    releaseDigest: r.releaseDigest,
    supersedesReleaseId: r.supersedesReleaseId ?? null,
    supersededByReleaseId: r.supersededByReleaseId ?? null,
  };
}

/** Rights travel with the record so provenance survives downstream use, audit and resale. */
export function rightsPayload(rights: RightsSchedule | undefined, decision?: SourceUseDecision) {
  if (!rights) return null;
  const r = rights.registration;
  return {
    sourceId: rights.sourceId,
    canonicalId: rights.canonicalId,
    sourceName: rights.sourceName,
    materialClass: rights.materialClass,
    licence: rights.licence,
    registration: { registrationId: r.registrationId, sourceClass: r.sourceClass, policyVersion: r.policyVersion, effectiveFrom: r.effectiveFrom, effectiveUntil: r.effectiveUntil ?? null, permittedPurposes: r.permittedPurposes, prohibitedPurposes: r.prohibitedPurposes ?? [], allowedOperations: r.allowedOperations, approvalRequiredOperations: r.approvalRequiredOperations ?? [], allowedAudiences: r.allowedAudiences, retention: r.retention },
    permittedUses: rights.permittedUses,
    nonUse: rights.nonUse,
    redistribution: rights.redistribution,
    attributionRequired: rights.attributionRequired,
    attribution: rights.attributionRequired ? `${rights.sourceName} — ${rights.licence}` : null,
    /** The exact source-use decision under which this record was delivered. Policy evaluation only; not a claim that the source is true. */
    deliveryDecision: decision ? { decisionId: decision.decisionId, state: decision.state, reasons: decision.reasons, request: decision.request, evaluatedAt: decision.evaluatedAt } : null,
  };
}

export function recordPayload(r: CorpusRecord, rights?: RightsSchedule, decision?: SourceUseDecision) {
  return {
    recordId: r.recordId,
    canonicalId: r.canonicalId,
    subject: { subjectId: r.subjectId, canonicalId: r.subjectCanonicalId, subjectType: r.subjectType },
    predicate: r.predicate,
    title: r.title,
    value: r.value,
    unit: r.unit ?? null,
    basis: r.basis ?? null,
    uncertainty: r.uncertainty ?? null,
    validity: { validFrom: r.validFrom, validTo: r.validTo ?? null },
    knownAt: r.knownAt,
    observedAt: r.observedAt ?? null,
    evidenceClass: r.evidenceClass,
    geometry: r.geometry ?? null,
    provenance: { ...r.provenance, contentHash: r.provenance.contentHash ?? null, contentDigest: r.provenance.contentDigest ?? null, storageKey: r.provenance.storageKey ?? null, receiptId: r.provenance.receiptId ?? null, artifactId: r.provenance.artifactId ?? null, producerId: r.provenance.producerId ?? null, transformId: r.provenance.transformId ?? null },
    visibility: r.visibility,
    supersedesRecordId: r.supersedesRecordId ?? null,
    supersededByRecordId: r.supersededByRecordId ?? null,
    retractedByRetractionId: r.retractedByRetractionId ?? null,
    firstReleaseId: r.firstReleaseId,
    rights: rightsPayload(rights, decision),
  };
}

export function retractionPayload(r: Retraction) {
  return {
    retractionId: r.retractionId,
    kind: r.kind,
    issuedAt: r.issuedAt,
    releaseId: r.releaseId,
    affectedRecordIds: r.affectedRecordIds,
    replacementRecordIds: r.replacementRecordIds ?? [],
    affectedRulingIds: r.affectedRulingIds ?? [],
    reason: r.reason,
    sourceId: r.sourceId ?? null,
  };
}

export function asOfBody(a: AsOfAnswer, rightsOf: (sourceId: string) => RightsSchedule | undefined = () => undefined, decisionOf: (r: CorpusRecord) => SourceUseDecision | undefined = () => undefined) {
  return {
    query: a.query,
    resolution: a.resolution,
    answer: a.record ? { ...recordPayload(a.record, rightsOf(a.record.provenance.sourceId), decisionOf(a.record)), statusAtKnownAt: a.status } : null,
    identityLink: a.identityLink ? recordPayload(a.identityLink, rightsOf(a.identityLink.provenance.sourceId), decisionOf(a.identityLink)) : null,
    refusal: a.refusal ?? null,
    candidates: a.candidates.map((c) => c.recordId),
  };
}

export function asOfUrl(releaseId: string, q: AsOfAnswer['query']): string {
  const p = new URLSearchParams({ subject: q.subjectId, predicate: q.predicate, validAt: q.validAt, knownAt: q.knownAt });
  return `/api/v1/releases/${encodeURIComponent(releaseId)}/as-of?${p.toString()}`;
}

export function envelope<T extends object>(body: T, release?: CorpusRelease) {
  return {
    fixture_only: true as const,
    feed: FEED_VERSION,
    notice: 'Demonstration corpus. Synthetic, deterministic, committed. This is the shape of the product feed; it is not a live service.',
    ...(release ? { release: releaseSummary(release) } : {}),
    ...body,
  };
}
