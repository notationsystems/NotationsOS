/**
 * Payload OS — presentation selectors.
 *
 * Pure functions over a ClaimCaseBundle. They PROJECT (filter, group, link,
 * label) and never ADJUDICATE: nothing here decides whether a claim is
 * admissible, passes a check, or earns an assurance class. Every status,
 * check result and assurance value is read from the bundle as supplied by the
 * adapter boundary.
 */

import type {
  AssuranceClass,
  CaseEvent,
  Claim,
  ClaimCaseBundle,
  EvidenceArtifact,
  ISODateTime,
  InvariantResult,
  LineageEdge,
  LineageNode,
  Remediation,
  Ruling,
  RulingStatus,
  VisibilityClass,
} from './types';
import { FIXTURE_REMEDIATIONS } from '../fixtures';

export function remediationById(id: string): Remediation | undefined {
  return FIXTURE_REMEDIATIONS[id];
}

/* ── Status semantics (labels, glyphs, colour tokens) ── */

export interface StatusSemantics {
  label: string;
  /** Short plain-language meaning, scoped. Refusal is not falsity. */
  meaning: string;
  glyph: string;
  cssVar: string;
  /** Does this status call for sponsor action right now? */
  requiresAction: boolean;
}

export const STATUS_SEMANTICS: Record<RulingStatus, StatusSemantics> = {
  DRAFT: { label: 'Draft', meaning: 'Not yet submitted. Nothing has been evaluated.', glyph: '◌', cssVar: '--status-draft', requiresAction: true },
  EVALUATING: { label: 'Evaluating', meaning: 'Submitted; evaluation has not completed.', glyph: '◔', cssVar: '--status-evaluating', requiresAction: false },
  PENDING_EVIDENCE: { label: 'Pending evidence', meaning: 'Evaluation cannot complete until named evidence is supplied.', glyph: '◒', cssVar: '--status-pending', requiresAction: true },
  ADMITTED: { label: 'Admitted', meaning: 'Admissible for the declared use, tolerance, evidence state, knowledge cutoff and profile version.', glyph: '●', cssVar: '--status-admitted', requiresAction: false },
  ADMITTED_WITH_CONDITIONS: { label: 'Admitted with conditions', meaning: 'Admissible for the declared use only while the stated conditions hold.', glyph: '◐', cssVar: '--status-conditional', requiresAction: true },
  REFUSED: { label: 'Refused', meaning: 'Not admissible for this declared use, tolerance, evidence state, knowledge cutoff and profile version. Refusal is not a finding of falsity or misconduct.', glyph: '⊘', cssVar: '--status-refused', requiresAction: true },
  SUPERSEDED: { label: 'Superseded', meaning: 'Replaced by a later ruling. This ruling remains inspectable and is no longer current.', glyph: '↷', cssVar: '--status-superseded', requiresAction: false },
  REVOKED: { label: 'Revoked', meaning: 'Withdrawn after release. Reliance must stop; the ruling remains inspectable.', glyph: '⊗', cssVar: '--status-revoked', requiresAction: true },
};

export interface AssuranceSemantics {
  label: string;
  meaning: string;
  glyph: string;
  cssVar: string;
}

export const ASSURANCE_SEMANTICS: Record<AssuranceClass, AssuranceSemantics> = {
  UNVERIFIED_EVALUATION: { label: 'Unverified evaluation', meaning: 'Deterministic checks completed by this system. No independent, cryptographic or human verification is recorded.', glyph: '○', cssVar: '--assurance-unverified' },
  HUMAN_REVIEWED: { label: 'Human reviewed', meaning: 'A named reviewer inspected the evaluation and recorded a basis. This is not cryptographic verification.', glyph: '◑', cssVar: '--assurance-reviewed' },
  VERIFIED_ATTESTATION: { label: 'Verified attestation', meaning: 'The result manifest was checked against its commitments by a verifier. This is not external witnessing.', glyph: '◉', cssVar: '--assurance-verified' },
  EXTERNALLY_WITNESSED: { label: 'Externally witnessed', meaning: 'A party outside this system anchored the commitment (timestamp authority, cosignature or public chain).', glyph: '◈', cssVar: '--assurance-witnessed' },
};

export const VISIBILITY_SEMANTICS: Record<VisibilityClass, { label: string; meaning: string; rank: number }> = {
  INTERNAL_ONLY: { label: 'Internal only', meaning: 'Visible to operators and reviewers of this system only.', rank: 0 },
  PRIVATE_PREFLIGHT: { label: 'Private preflight', meaning: 'Visible to the claim sponsor and reviewers. Not shared with counterparties.', rank: 1 },
  COUNTERPARTY_SHARED: { label: 'Counterparty shared', meaning: 'Visible to named relying parties on this case.', rank: 2 },
  DELAYED_AGGREGATE: { label: 'Delayed aggregate', meaning: 'Visible only in aggregate after a delay; never as an identified case.', rank: 3 },
  PUBLIC_RULING: { label: 'Public ruling', meaning: 'Visible to anyone holding the ruling identifier.', rank: 4 },
};

/**
 * Which visibility classes a VIEWER at `viewerClass` may see. A viewer at a
 * public surface sees only PUBLIC_RULING; a counterparty sees COUNTERPARTY_
 * SHARED and PUBLIC_RULING; a sponsor sees everything but INTERNAL_ONLY; an
 * internal viewer sees all. DELAYED_AGGREGATE is never shown per-case.
 */
export function visibleClassesFor(viewerClass: VisibilityClass): ReadonlySet<VisibilityClass> {
  switch (viewerClass) {
    case 'INTERNAL_ONLY':
      return new Set(['INTERNAL_ONLY', 'PRIVATE_PREFLIGHT', 'COUNTERPARTY_SHARED', 'PUBLIC_RULING']);
    case 'PRIVATE_PREFLIGHT':
      return new Set(['PRIVATE_PREFLIGHT', 'COUNTERPARTY_SHARED', 'PUBLIC_RULING']);
    case 'COUNTERPARTY_SHARED':
      return new Set(['COUNTERPARTY_SHARED', 'PUBLIC_RULING']);
    case 'DELAYED_AGGREGATE':
      return new Set([]);
    case 'PUBLIC_RULING':
    default:
      return new Set(['PUBLIC_RULING']);
  }
}

export function isVisible(objectClass: VisibilityClass, viewerClass: VisibilityClass): boolean {
  return visibleClassesFor(viewerClass).has(objectClass);
}

/**
 * Project a bundle onto a viewer's visibility. Objects the viewer may not see
 * are REMOVED, and invariant results whose detail is narrower than the viewer
 * are reduced to their bounded public summary. Counts of removed objects are
 * returned so the projection can say "N items withheld" without leaking them.
 */
export interface ProjectedBundle {
  bundle: ClaimCaseBundle;
  withheld: { claims: number; evidence: number; events: number; parties: number; checks: number; reducedChecks: number };
  viewerClass: VisibilityClass;
}

function projectInvariant(r: InvariantResult, viewerClass: VisibilityClass): InvariantResult | null {
  if (isVisible(r.disclosureClass, viewerClass)) return r;
  // Not visible at full detail. A public summary may still be disclosed if the
  // check itself is part of a public ruling; otherwise drop it entirely.
  if (r.publicSummary && viewerClass !== 'DELAYED_AGGREGATE') {
    return {
      invariantId: r.invariantId,
      title: r.title,
      authorityClass: r.authorityClass,
      status: r.status,
      refusalCode: r.refusalCode,
      summary: r.publicSummary,
      origin: r.origin,
      affectedClaimIds: r.affectedClaimIds,
      evidenceIds: [],
      remediationIds: [],
      disclosureClass: viewerClass,
      publicSummary: r.publicSummary,
      evaluatedAt: r.evaluatedAt,
      materiality: r.materiality,
    };
  }
  return null;
}

function projectRuling(ruling: Ruling, viewerClass: VisibilityClass, keep: Set<string>): { ruling: Ruling; reduced: number; dropped: number } {
  let reduced = 0;
  let dropped = 0;
  const invariantResults: InvariantResult[] = [];
  for (const r of ruling.invariantResults) {
    const p = projectInvariant(r, viewerClass);
    if (!p) { dropped += 1; continue; }
    if (p !== r) reduced += 1;
    invariantResults.push({ ...p, affectedClaimIds: p.affectedClaimIds.filter((id) => keep.has(id)), evidenceIds: p.evidenceIds.filter((id) => keep.has(id)) });
  }
  const consideredEvidenceIds = ruling.consideredEvidenceIds.filter((id) => keep.has(id));
  const ruledClaimIds = ruling.ruledClaimIds.filter((id) => keep.has(id));
  return { ruling: { ...ruling, invariantResults, consideredEvidenceIds, ruledClaimIds }, reduced, dropped };
}

export function projectForViewer(bundle: ClaimCaseBundle, viewerClass: VisibilityClass): ProjectedBundle {
  const claims = bundle.claims.filter((c) => isVisible(c.visibility, viewerClass));
  const evidence = bundle.evidence.filter((e) => isVisible(e.visibility, viewerClass));
  const events = bundle.events.filter((e) => isVisible(e.visibility, viewerClass));
  const keep = new Set<string>([...claims.map((c) => c.claimId), ...evidence.map((e) => e.evidenceId)]);
  const parties = bundle.parties.map((p) => (isVisible('INTERNAL_ONLY', viewerClass) ? p : { ...p, privateNote: undefined }));
  const lineageNodes = bundle.lineage.nodes.filter((n) => isVisible(n.visibility, viewerClass));
  const nodeIds = new Set(lineageNodes.map((n) => n.nodeId));
  const lineageEdges = bundle.lineage.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  let checksDropped = 0;
  let checksReduced = 0;
  const projectOne = (r: Ruling) => {
    const p = projectRuling(r, viewerClass, keep);
    checksDropped += p.dropped;
    checksReduced += p.reduced;
    return p.ruling;
  };
  const currentRuling = bundle.currentRuling && isVisible(bundle.currentRuling.visibility, viewerClass) ? projectOne(bundle.currentRuling) : undefined;
  const previousRulings = bundle.previousRulings.filter((r) => isVisible(r.visibility, viewerClass)).map(projectOne);

  return {
    viewerClass,
    bundle: {
      ...bundle,
      claims: claims.map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((id) => keep.has(id)) })),
      evidence,
      events,
      parties,
      currentRuling,
      previousRulings,
      lineage: { nodes: lineageNodes, edges: lineageEdges },
    },
    withheld: {
      claims: bundle.claims.length - claims.length,
      evidence: bundle.evidence.length - evidence.length,
      events: bundle.events.length - events.length,
      parties: 0,
      checks: checksDropped,
      reducedChecks: checksReduced,
    },
  };
}

/* ── Knowledge-time projection (bitemporal replay) ── */

export interface KnowledgeProjection {
  cutoff: ISODateTime;
  claims: Claim[];
  evidence: EvidenceArtifact[];
  events: CaseEvent[];
  /** The ruling that was current at the cutoff, if any. */
  applicableRuling?: Ruling;
  /** All rulings issued at or before the cutoff, newest first. */
  rulingsKnown: Ruling[];
  /** Objects hidden because they became knowable after the cutoff. */
  hidden: { claims: number; evidence: number; events: number; rulings: number };
  /** The case status as it stood at the cutoff. */
  statusAtCutoff: RulingStatus;
}

const le = (a: ISODateTime | undefined, b: ISODateTime) => a !== undefined && a <= b;

export function allRulings(bundle: ClaimCaseBundle): Ruling[] {
  const rs = [...bundle.previousRulings];
  if (bundle.currentRuling) rs.push(bundle.currentRuling);
  return rs.sort((a, b) => a.revision - b.revision);
}

/** When a ruling became knowable: ruledAt, else evaluatedAt, else submittedAt. */
export function rulingKnownAt(r: Ruling): ISODateTime | undefined {
  return r.temporalBasis.ruledAt ?? r.temporalBasis.evaluatedAt ?? r.temporalBasis.submittedAt;
}

export function projectAtKnowledgeTime(bundle: ClaimCaseBundle, cutoff: ISODateTime): KnowledgeProjection {
  const claims = bundle.claims.filter((c) => le(c.knownAt, cutoff));
  const evidence = bundle.evidence.filter((e) => le(e.knownAt, cutoff));
  const events = bundle.events.filter((e) => le(e.at, cutoff));
  const rulings = allRulings(bundle);
  const known = rulings.filter((r) => le(rulingKnownAt(r), cutoff));
  // The applicable ruling at the cutoff is the latest known ruling, with its
  // status as it stood THEN: a ruling later superseded was still current.
  const latest = known[known.length - 1];
  let applicableRuling: Ruling | undefined;
  if (latest) {
    const supersededYet = latest.temporalBasis.supersededAt !== undefined && latest.temporalBasis.supersededAt <= cutoff;
    const revokedYet = latest.temporalBasis.revokedAt !== undefined && latest.temporalBasis.revokedAt <= cutoff;
    let status = latest.status;
    if (!supersededYet && latest.status === 'SUPERSEDED') status = statusBeforeTransition(latest, bundle);
    if (!revokedYet && latest.status === 'REVOKED') status = statusBeforeTransition(latest, bundle);
    applicableRuling = { ...latest, status };
  }
  const createdAt = bundle.events.find((e) => e.kind === 'CASE_CREATED')?.at;
  const statusAtCutoff: RulingStatus = applicableRuling
    ? applicableRuling.status
    : createdAt && createdAt <= cutoff
      ? (events.some((e) => e.kind === 'SUBMITTED') ? 'EVALUATING' : 'DRAFT')
      : 'DRAFT';
  return {
    cutoff,
    claims,
    evidence,
    events,
    applicableRuling,
    rulingsKnown: [...known].reverse(),
    hidden: {
      claims: bundle.claims.length - claims.length,
      evidence: bundle.evidence.length - evidence.length,
      events: bundle.events.length - events.length,
      rulings: rulings.length - known.length,
    },
    statusAtCutoff,
  };
}

/** The status a superseded/revoked ruling carried BEFORE that transition, read
 *  from the recorded RULED event rather than guessed. */
export function statusBeforeTransition(ruling: Ruling, bundle: ClaimCaseBundle): RulingStatus {
  const ev = bundle.events.find((e) => e.kind === 'RULED' && e.refs?.includes(ruling.rulingId));
  const m = ev?.summary.match(/\b(ADMITTED_WITH_CONDITIONS|ADMITTED|REFUSED|PENDING_EVIDENCE)\b/);
  return (m?.[1] as RulingStatus | undefined) ?? ruling.status;
}

/* ── Highlight linking: failed check → claims → evidence → lineage edges ── */

export interface HighlightSet {
  invariantId?: string;
  claimIds: Set<string>;
  evidenceIds: Set<string>;
  remediationIds: Set<string>;
  missingEvidence: string[];
  lineageNodeIds: Set<string>;
  brokenEdges: LineageEdge[];
}

export function highlightsForInvariant(bundle: ClaimCaseBundle, invariantId: string | undefined): HighlightSet {
  const empty: HighlightSet = { invariantId, claimIds: new Set(), evidenceIds: new Set(), remediationIds: new Set(), missingEvidence: [], lineageNodeIds: new Set(), brokenEdges: [] };
  if (!invariantId) return empty;
  const ruling = bundle.currentRuling;
  const r = ruling?.invariantResults.find((x) => x.invariantId === invariantId);
  if (!r) return empty;
  const claimIds = new Set(r.affectedClaimIds);
  const evidenceIds = new Set([...r.evidenceIds, ...(r.contradictoryEvidenceIds ?? [])]);
  const lineageNodeIds = new Set<string>();
  for (const n of bundle.lineage.nodes) {
    if (n.kind === 'INVARIANT_RESULT' && n.refId === invariantId) lineageNodeIds.add(n.nodeId);
    if (n.kind === 'CLAIM' && claimIds.has(n.refId)) lineageNodeIds.add(n.nodeId);
    if (n.kind === 'SOURCE_ARTIFACT' && evidenceIds.has(n.refId)) lineageNodeIds.add(n.nodeId);
  }
  const brokenEdges = bundle.lineage.edges.filter((e) => e.broken && (lineageNodeIds.has(e.from) || lineageNodeIds.has(e.to)));
  return {
    invariantId,
    claimIds,
    evidenceIds,
    remediationIds: new Set(r.remediationIds ?? []),
    missingEvidence: r.missingEvidence ?? [],
    lineageNodeIds,
    brokenEdges,
  };
}

/* ── Lineage path: trace a node upstream to sources and downstream to rulings ── */

export function lineagePathFor(bundle: ClaimCaseBundle, nodeId: string): { upstream: LineageNode[]; downstream: LineageNode[]; edges: LineageEdge[] } {
  const byId = new Map(bundle.lineage.nodes.map((n) => [n.nodeId, n]));
  const edges = bundle.lineage.edges;
  const walk = (start: string, dir: 'up' | 'down'): { nodes: LineageNode[]; edges: LineageEdge[] } => {
    const seen = new Set<string>([start]);
    const out: LineageNode[] = [];
    const usedEdges: LineageEdge[] = [];
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of edges) {
        const next = dir === 'up' ? (e.to === cur ? e.from : null) : e.from === cur ? e.to : null;
        if (!next || seen.has(next)) continue;
        seen.add(next);
        usedEdges.push(e);
        const n = byId.get(next);
        if (n) { out.push(n); queue.push(next); }
      }
    }
    return { nodes: out, edges: usedEdges };
  };
  const up = walk(nodeId, 'up');
  const down = walk(nodeId, 'down');
  return { upstream: up.nodes, downstream: down.nodes, edges: [...up.edges, ...down.edges] };
}

/** Deterministic layered order for the list/tree lineage view. */
export const LINEAGE_LAYERS: ReadonlyArray<LineageNode['kind']> = [
  'SOURCE_ARTIFACT', 'EXTRACTED_RECORD', 'OBSERVATION', 'CLAIM', 'TRANSFORMATION', 'INVARIANT_RESULT', 'RULING',
];

/* ── Queue summary ── */

export interface QueueSummary {
  total: number;
  requiresAction: number;
  byStatus: Record<RulingStatus, number>;
  nearingExpiry: number;
  changedSince: number;
}

export function isNearingExpiry(bundle: ClaimCaseBundle, withinDays = 7): boolean {
  const exp = bundle.currentRuling?.temporalBasis.expiresAt;
  if (!exp) return false;
  const ms = Date.parse(exp) - Date.parse(bundle.asOf);
  return ms > 0 && ms <= withinDays * 86_400_000;
}

export function summarizeQueue(bundles: ClaimCaseBundle[], changedSince?: ISODateTime): QueueSummary {
  const byStatus = Object.fromEntries((Object.keys(STATUS_SEMANTICS) as RulingStatus[]).map((s) => [s, 0])) as Record<RulingStatus, number>;
  let requiresAction = 0;
  let nearingExpiry = 0;
  let changed = 0;
  for (const b of bundles) {
    byStatus[b.status] += 1;
    if (STATUS_SEMANTICS[b.status].requiresAction) requiresAction += 1;
    if (isNearingExpiry(b)) nearingExpiry += 1;
    if (changedSince && b.lastChangedAt > changedSince) changed += 1;
  }
  return { total: bundles.length, requiresAction, byStatus, nearingExpiry, changedSince: changed };
}

/* ── Per-case "10 second" summary ── */

export interface TenSecondSummary {
  status: RulingStatus;
  requiredAction?: string;
  blockingInvariant?: InvariantResult;
  failedCount: number;
  conditionCount: number;
}

export function tenSecondSummary(bundle: ClaimCaseBundle): TenSecondSummary {
  const ruling = bundle.currentRuling;
  const failed = ruling?.invariantResults.filter((r) => r.status === 'FAILED') ?? [];
  const blocking = failed.find((r) => r.materiality === 'BLOCKING') ?? failed[0];
  let requiredAction: string | undefined;
  switch (bundle.status) {
    case 'DRAFT': requiredAction = 'Complete intake and submit for evaluation.'; break;
    case 'PENDING_EVIDENCE': requiredAction = 'Supply the named evidence, then resubmit.'; break;
    case 'REFUSED': requiredAction = blocking ? `Remediate ${blocking.invariantId} and resubmit.` : 'Review refusal and remediate.'; break;
    case 'ADMITTED_WITH_CONDITIONS': requiredAction = 'Satisfy the stated conditions before full reliance.'; break;
    case 'REVOKED': requiredAction = 'Stop reliance. Notify relying parties.'; break;
    default: requiredAction = undefined;
  }
  return { status: bundle.status, requiredAction, blockingInvariant: blocking, failedCount: failed.length, conditionCount: ruling?.conditions?.length ?? 0 };
}

/* ── Party helpers ── */

export function partyName(bundle: ClaimCaseBundle, partyId: string | undefined): string {
  if (!partyId) return 'Not recorded';
  return bundle.parties.find((p) => p.partyId === partyId)?.displayName ?? partyId;
}

export function evidenceById(bundle: ClaimCaseBundle, id: string): EvidenceArtifact | undefined {
  return bundle.evidence.find((e) => e.evidenceId === id);
}

export function claimById(bundle: ClaimCaseBundle, id: string): Claim | undefined {
  return bundle.claims.find((c) => c.claimId === id);
}

/** Every remediation referenced by the current ruling's results, in order. */
export function remediationsFor(ruling: Ruling | undefined, lookup: (id: string) => import('./types').Remediation | undefined) {
  if (!ruling) return [];
  const ids = new Set<string>();
  for (const r of ruling.invariantResults) for (const id of r.remediationIds ?? []) ids.add(id);
  return [...ids].map(lookup).filter((x): x is import('./types').Remediation => Boolean(x));
}
