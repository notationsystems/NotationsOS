'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ClaimCaseBundle, LineageNode, Remediation, Ruling, VisibilityClass } from '@/domain/types';
import { allRulings, highlightsForInvariant, lineagePathFor, projectForViewer, remediationsFor, STATUS_SEMANTICS, remediationById } from '@/domain/selectors';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Section } from '@/components/primitives/Section';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { TemporalBasisPanel } from '@/components/primitives/TemporalBasisPanel';
import { CaseIdentityHeader } from './CaseIdentityHeader';
import { DecisionRail } from './DecisionRail';
import { ClaimDetail, ClaimRow } from './ClaimRow';
import { EvidenceDetail, EvidenceRow } from './EvidenceReference';
import { InvariantResultDetail } from './InvariantResultView';
import { LineagePath } from './LineagePath';
import { RemediationActions, ActionIntentPanel, type ActionIntent } from './RemediationActions';
import { RevisionComparison } from './RevisionComparison';
import { fmtUtc } from '@/lib/format';

type Selection =
  | { kind: 'overview' }
  | { kind: 'claim'; id: string }
  | { kind: 'evidence'; id: string }
  | { kind: 'invariant'; id: string }
  | { kind: 'ruling'; id: string };

type ViewerRole = 'SPONSOR' | 'REVIEWER';
const ROLE_VISIBILITY: Record<ViewerRole, VisibilityClass> = { SPONSOR: 'PRIVATE_PREFLIGHT', REVIEWER: 'INTERNAL_ONLY' };

/**
 * The claim case workspace.
 *   left rail:      case structure, claims, evidence, revisions
 *   centre:         the selected object — its values, source context, lineage
 *   decision rail:  use scope, time basis, profile, assurance, ruling, failed checks, next actions
 * Selecting a failed check highlights the affected claims, the inspected
 * artifacts, the broken lineage edge and the permitted remediation.
 */
export function CaseWorkspace({ bundle: raw, initialSelection }: { bundle: ClaimCaseBundle; initialSelection?: Selection }) {
  const [role, setRole] = useState<ViewerRole>('SPONSOR');
  const [sel, setSel] = useState<Selection>(initialSelection ?? { kind: 'overview' });
  const [intents, setIntents] = useState<ActionIntent[]>([]);

  const projection = useMemo(() => projectForViewer(raw, ROLE_VISIBILITY[role]), [raw, role]);
  const bundle = projection.bundle;
  const ruling = bundle.currentRuling;
  const rulings = useMemo(() => allRulings(bundle), [bundle]);

  const selectedInvariantId = sel.kind === 'invariant' ? sel.id : undefined;
  const hl = useMemo(() => highlightsForInvariant(bundle, selectedInvariantId), [bundle, selectedInvariantId]);

  // Secondary highlighting for claim/evidence selections.
  const claimHighlights = useMemo(() => {
    if (sel.kind === 'claim') return new Set(bundle.claims.find((c) => c.claimId === sel.id)?.evidenceIds ?? []);
    return hl.evidenceIds;
  }, [sel, bundle, hl]);
  const evidenceHighlights = useMemo(() => {
    if (sel.kind === 'evidence') return new Set(bundle.claims.filter((c) => c.evidenceIds.includes(sel.id)).map((c) => c.claimId));
    return hl.claimIds;
  }, [sel, bundle, hl]);

  const pathNodeIds = useMemo(() => {
    let start: string | undefined;
    if (sel.kind === 'claim') start = `n:claim:${sel.id}`;
    if (sel.kind === 'evidence') start = `n:art:${sel.id}`;
    if (sel.kind === 'invariant') start = `n:inv:${sel.id}`;
    if (sel.kind === 'ruling') start = `n:ruling:${sel.id}`;
    if (!start || !bundle.lineage.nodes.some((n) => n.nodeId === start)) return new Set<string>();
    const p = lineagePathFor(bundle, start);
    return new Set([start, ...p.upstream.map((n) => n.nodeId), ...p.downstream.map((n) => n.nodeId)]);
  }, [sel, bundle]);

  const allRemediations = useMemo(() => remediationsFor(ruling, remediationById), [ruling]);
  const selectedInvariant = selectedInvariantId ? ruling?.invariantResults.find((r) => r.invariantId === selectedInvariantId) : undefined;
  const invariantRemediations = useMemo(
    () => (selectedInvariant?.remediationIds ?? []).map(remediationById).filter((x): x is Remediation => Boolean(x)),
    [selectedInvariant],
  );

  const selectNode = (n: LineageNode) => {
    if (n.kind === 'CLAIM') setSel({ kind: 'claim', id: n.refId });
    else if (n.kind === 'SOURCE_ARTIFACT' || n.kind === 'EXTRACTED_RECORD' || n.kind === 'OBSERVATION') setSel({ kind: 'evidence', id: n.refId });
    else if (n.kind === 'INVARIANT_RESULT') setSel({ kind: 'invariant', id: n.refId });
    else if (n.kind === 'RULING') setSel({ kind: 'ruling', id: n.refId });
  };

  const selectedRuling: Ruling | undefined = sel.kind === 'ruling' ? rulings.find((r) => r.rulingId === sel.id) : undefined;

  return (
    <div className="flex flex-col min-h-full">
      <FixtureBanner note={bundle.fixtureNote} />
      <div className="px-3 sm:px-4 py-3 border-b flex flex-col gap-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-void)' }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <Link href="/cases">Cases</Link> <span aria-hidden="true">/</span> <span className="id">{bundle.caseId}</span>
          </nav>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Viewing as</span>
            <div role="group" aria-label="Viewer role" className="flex gap-1">
              {(['SPONSOR', 'REVIEWER'] as ViewerRole[]).map((r) => (
                <button key={r} type="button" className="btn btn-sm" aria-pressed={role === r} onClick={() => setRole(r)} style={role === r ? { borderColor: 'var(--border-accent)', color: 'var(--accent-strong)' } : undefined}>
                  {r === 'SPONSOR' ? 'Sponsor' : 'Internal reviewer'}
                </button>
              ))}
            </div>
            {ruling && <Link href={`/rulings/${encodeURIComponent(ruling.rulingId)}`} className="btn btn-sm">Relying-party view</Link>}
            <Link href={`/replay/${encodeURIComponent(bundle.caseId)}`} className="btn btn-sm">Replay</Link>
          </div>
        </div>
        <CaseIdentityHeader bundle={bundle} />
        {(projection.withheld.evidence > 0 || projection.withheld.checks > 0 || projection.withheld.events > 0) && (
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} role="status">
            Withheld at this visibility: {projection.withheld.evidence} evidence, {projection.withheld.checks} check records, {projection.withheld.events} events.
          </p>
        )}
      </div>

      <div className="workspace-grid flex-1 min-h-0">
        {/* Left rail: structure */}
        <nav aria-label="Case structure" className="workspace-left flex flex-col gap-4 p-3 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
          <Section title="Structure" id="left-structure">
            <ol className="m-0 p-0 list-none flex flex-col gap-0.5 text-[12.5px]">
              {(['CASE', 'USE', 'CLAIMS', 'EVIDENCE', 'CHECKS', 'RULING', 'REMEDIATION', 'RELEASE', 'MONITORING'] as const).map((step, i) => {
                const target: Selection = step === 'CASE' || step === 'USE' || step === 'RELEASE' || step === 'MONITORING' ? { kind: 'overview' } : step === 'RULING' && ruling ? { kind: 'ruling', id: ruling.rulingId } : { kind: 'overview' };
                const active = (step === 'CASE' && sel.kind === 'overview') || (step === 'CLAIMS' && sel.kind === 'claim') || (step === 'EVIDENCE' && sel.kind === 'evidence') || (step === 'CHECKS' && sel.kind === 'invariant') || (step === 'RULING' && sel.kind === 'ruling');
                return (
                  <li key={step}>
                    <button type="button" onClick={() => setSel(target)} aria-current={active ? 'step' : undefined} className="w-full text-left flex items-center gap-2 px-2 py-1 min-h-[28px] rounded-[var(--radius-md)]" style={{ color: active ? 'var(--text-heading)' : 'var(--text-secondary)', background: active ? 'rgba(255,255,255,0.05)' : undefined }}>
                      <span className="mono text-[10.5px] w-4" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                      <span className="label-sm" style={{ color: 'inherit' }}>{step.toLowerCase()}</span>
                      {step === 'CHECKS' && ruling && <span className="ml-auto mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{ruling.invariantResults.filter((r) => r.status === 'FAILED').length} failed</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </Section>

          <Section title={`Claims (${bundle.claims.length})`} id="left-claims">
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {bundle.claims.map((c) => (
                <li key={c.claimId}>
                  <ClaimRow claim={c} selected={sel.kind === 'claim' && sel.id === c.claimId} highlighted={evidenceHighlights.has(c.claimId)} onSelect={(id) => setSel({ kind: 'claim', id })} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title={`Evidence (${bundle.evidence.length})`} id="left-evidence">
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {bundle.evidence.map((e) => (
                <li key={e.evidenceId}>
                  <EvidenceRow evidence={e} bundle={bundle} selected={sel.kind === 'evidence' && sel.id === e.evidenceId} highlighted={claimHighlights.has(e.evidenceId)} onSelect={(id) => setSel({ kind: 'evidence', id })} />
                </li>
              ))}
              {projection.withheld.evidence > 0 && <li className="text-[11.5px] px-2" style={{ color: 'var(--text-muted)' }}>{projection.withheld.evidence} withheld at this visibility</li>}
            </ul>
          </Section>

          <Section title={`Revisions (${rulings.length})`} id="left-revisions">
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {[...rulings].reverse().map((r) => (
                <li key={r.rulingId}>
                  <button type="button" onClick={() => setSel({ kind: 'ruling', id: r.rulingId })} aria-pressed={sel.kind === 'ruling' && sel.id === r.rulingId} className="w-full text-left flex flex-col gap-0.5 px-2 py-1.5 rounded-[var(--radius-md)] border" style={{ borderColor: sel.kind === 'ruling' && sel.id === r.rulingId ? 'var(--border-accent)' : 'var(--border-subtle)' }} data-ruling-id={r.rulingId}>
                    <span className="flex items-center justify-between gap-2"><span className="id" style={{ color: 'var(--text-secondary)' }}>rev {r.revision}</span><RulingStatusPill status={r.status} size="sm" /></span>
                    <span className="text-[11px] ts" style={{ color: 'var(--text-muted)' }}>issued {fmtUtc(r.temporalBasis.ruledAt)}</span>
                  </button>
                </li>
              ))}
              {rulings.length === 0 && <li className="text-[12px] px-2" style={{ color: 'var(--text-muted)' }}>No ruling yet. Nothing has been evaluated.</li>}
            </ul>
          </Section>

          <Section title={`History (${bundle.events.length})`} id="left-history">
            <details>
              <summary className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Show event log</summary>
              <ol className="m-0 mt-1 p-0 list-none flex flex-col gap-1 text-[11.5px]">
                {[...bundle.events].sort((a, b) => (a.at < b.at ? 1 : -1)).map((e) => (
                  <li key={e.eventId} className="px-2 py-1 border-l" style={{ borderColor: 'var(--border-default)' }}>
                    <span className="ts" style={{ color: 'var(--text-muted)' }}>{fmtUtc(e.at)}</span> <span className="label-sm">{e.kind.replace(/_/g, ' ').toLowerCase()}</span>
                    <div style={{ color: 'var(--text-secondary)' }}>{e.summary}</div>
                  </li>
                ))}
              </ol>
            </details>
          </Section>
        </nav>

        {/* Centre workspace */}
        <section aria-label="Workspace" className="workspace-center flex flex-col gap-4 p-3 sm:p-4 min-w-0" aria-live="polite">
          {sel.kind === 'overview' && (
            <>
              <Section title="Scope of the current ruling" id="c-scope">
                {ruling ? (
                  <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{ruling.scopeStatement}</p>
                ) : (
                  <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{STATUS_SEMANTICS[bundle.status].meaning} {bundle.status === 'DRAFT' && 'A draft may be saved without being evaluated; no ruling exists until submission and evaluation.'}</p>
                )}
                {ruling?.limitations && ruling.limitations.length > 0 && (
                  <ul className="m-0 pl-4 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} aria-label="Limitations">
                    {ruling.limitations.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                )}
              </Section>
              <Section title="Subject" id="c-subject">
                <dl className="kv">
                  {bundle.subject.descriptors?.map((d) => (<div key={d.label} className="contents"><dt>{d.label}</dt><dd>{d.value}{d.unit && <span className="unit"> {d.unit}</span>}</dd></div>))}
                </dl>
              </Section>
              <Section title="Time basis" id="c-time"><TemporalBasisPanel temporalBasis={ruling?.temporalBasis ?? bundle.temporalBasis} /></Section>
              <Section title="Lineage" id="c-lineage">
                <LineagePath bundle={bundle} pathNodeIds={pathNodeIds} highlightNodeIds={hl.lineageNodeIds} brokenEdges={hl.brokenEdges} onSelectNode={selectNode} />
              </Section>
            </>
          )}

          {sel.kind === 'claim' && (() => {
            const c = bundle.claims.find((x) => x.claimId === sel.id);
            if (!c) return <p style={{ color: 'var(--text-muted)' }}>Claim not visible at this visibility.</p>;
            return (
              <>
                <ClaimDetail claim={c} bundle={bundle} highlighted={hl.claimIds.has(c.claimId)} />
                <Section title="Checks on this claim" id="c-claim-checks">
                  <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[12.5px]">
                    {(ruling?.invariantResults ?? []).filter((r) => r.affectedClaimIds.includes(c.claimId)).map((r) => (
                      <li key={r.invariantId}><button type="button" className="btn btn-sm w-full justify-start" onClick={() => setSel({ kind: 'invariant', id: r.invariantId })}><span className="id">{r.invariantId}</span> {r.title} · {r.status.replace('_', ' ').toLowerCase()}</button></li>
                    ))}
                  </ul>
                </Section>
                <Section title="Lineage" id="c-lineage"><LineagePath bundle={bundle} pathNodeIds={pathNodeIds} highlightNodeIds={hl.lineageNodeIds} brokenEdges={hl.brokenEdges} onSelectNode={selectNode} /></Section>
              </>
            );
          })()}

          {sel.kind === 'evidence' && (() => {
            const e = bundle.evidence.find((x) => x.evidenceId === sel.id);
            if (!e) return <p style={{ color: 'var(--text-muted)' }}>Evidence not visible at this visibility.</p>;
            return (
              <>
                <EvidenceDetail evidence={e} bundle={bundle} highlighted={hl.evidenceIds.has(e.evidenceId)} />
                <Section title="Lineage" id="c-lineage"><LineagePath bundle={bundle} pathNodeIds={pathNodeIds} highlightNodeIds={hl.lineageNodeIds} brokenEdges={hl.brokenEdges} onSelectNode={selectNode} /></Section>
              </>
            );
          })()}

          {sel.kind === 'invariant' && selectedInvariant && (
            <>
              <InvariantResultDetail result={selectedInvariant} bundle={bundle} remediations={invariantRemediations} onSelectClaim={(id) => setSel({ kind: 'claim', id })} onSelectEvidence={(id) => setSel({ kind: 'evidence', id })} />
              {(selectedInvariant.status === 'FAILED' || (selectedInvariant.status === 'NOT_EVALUATED' && selectedInvariant.missingEvidence?.length)) && (
                <Section title="Remediation" id="c-remediation">
                  <RemediationActions bundle={bundle} remediations={invariantRemediations} selectedRemediationIds={hl.remediationIds} onIntent={(i) => setIntents((s) => [...s, i])} />
                </Section>
              )}
              <ActionIntentPanel intents={intents} onClear={() => setIntents([])} />
              <Section title="Lineage" id="c-lineage"><LineagePath bundle={bundle} pathNodeIds={pathNodeIds} highlightNodeIds={hl.lineageNodeIds} brokenEdges={hl.brokenEdges} onSelectNode={selectNode} /></Section>
            </>
          )}
          {sel.kind === 'invariant' && !selectedInvariant && <p style={{ color: 'var(--text-muted)' }}>Check not visible at this visibility.</p>}

          {sel.kind === 'ruling' && selectedRuling && (
            <>
              <Section title={`Ruling ${selectedRuling.rulingId} (revision ${selectedRuling.revision})`} id="c-ruling" aside={<Link href={`/rulings/${encodeURIComponent(selectedRuling.rulingId)}`} className="btn btn-sm">Open ruling viewer</Link>}>
                <div className="flex items-center gap-2 flex-wrap"><RulingStatusPill status={selectedRuling.status} size="lg" withMeaning /></div>
                {selectedRuling.transitionReason && <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selectedRuling.transitionReason}</p>}
                <p className="m-0 text-[13.5px] leading-relaxed">{selectedRuling.scopeStatement}</p>
                <TemporalBasisPanel temporalBasis={selectedRuling.temporalBasis} />
              </Section>
              {ruling && selectedRuling.rulingId !== ruling.rulingId && (
                <Section title="Comparison with the current ruling" id="c-compare"><RevisionComparison bundle={bundle} a={selectedRuling} b={ruling} /></Section>
              )}
              {ruling && selectedRuling.rulingId === ruling.rulingId && selectedRuling.supersedesRulingId && (() => {
                const prev = rulings.find((r) => r.rulingId === selectedRuling.supersedesRulingId);
                return prev ? <Section title="Comparison with the superseded ruling" id="c-compare"><RevisionComparison bundle={bundle} a={prev} b={selectedRuling} /></Section> : null;
              })()}
              <Section title="Lineage" id="c-lineage"><LineagePath bundle={bundle} pathNodeIds={pathNodeIds} highlightNodeIds={hl.lineageNodeIds} brokenEdges={hl.brokenEdges} onSelectNode={selectNode} /></Section>
            </>
          )}
        </section>

        {/* Decision rail */}
        <div className="workspace-right p-3 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
          <DecisionRail
            bundle={bundle}
            selectedInvariantId={selectedInvariantId}
            onSelectInvariant={(id) => setSel({ kind: 'invariant', id })}
            remediations={allRemediations}
            onSelectRemediation={(r) => {
              const inv = ruling?.invariantResults.find((x) => x.remediationIds?.includes(r.remediationId));
              if (inv) setSel({ kind: 'invariant', id: inv.invariantId });
            }}
          />
        </div>
      </div>
    </div>
  );
}
