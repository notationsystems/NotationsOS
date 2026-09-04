'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ClaimCaseBundle } from '@/domain/types';
import { STATUS_SEMANTICS, allRulings, projectAtKnowledgeTime, rulingKnownAt, partyName } from '@/domain/selectors';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { Section } from '@/components/primitives/Section';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { RevisionComparison } from '@/components/case/RevisionComparison';
import { fmtUtc, humanize } from '@/lib/format';

/** Every instant at which the case's knowledge changed, ascending, unique. */
export function knowledgeInstants(bundle: ClaimCaseBundle): string[] {
  const s = new Set<string>();
  for (const c of bundle.claims) s.add(c.knownAt);
  for (const e of bundle.evidence) s.add(e.knownAt);
  for (const e of bundle.events) s.add(e.at);
  for (const r of allRulings(bundle)) { const k = rulingKnownAt(r); if (k) s.add(k); if (r.temporalBasis.supersededAt) s.add(r.temporalBasis.supersededAt); if (r.temporalBasis.revokedAt) s.add(r.temporalBasis.revokedAt); }
  s.add(bundle.asOf);
  return [...s].sort();
}

function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}
function fromLocalInput(v: string): string {
  return v.length === 16 ? `${v}:00Z` : v;
}

/**
 * Bitemporal replay. The knowledge-time control moves the cutoff; the
 * visible evidence, claims, events and the applicable ruling change with it,
 * and a persistent banner states, in words, that the reader is looking at a
 * historical knowledge state.
 */
export function ReplayView({ bundle }: { bundle: ClaimCaseBundle }) {
  const instants = useMemo(() => knowledgeInstants(bundle), [bundle]);
  const [cutoff, setCutoff] = useState<string>(bundle.asOf);
  const k = useMemo(() => projectAtKnowledgeTime(bundle, cutoff), [bundle, cutoff]);
  const idx = instants.findIndex((t) => t >= cutoff);
  const current = bundle.currentRuling;
  const isPresent = cutoff >= bundle.asOf;
  const step = (d: number) => {
    const i = Math.max(0, Math.min(instants.length - 1, (idx === -1 ? instants.length - 1 : idx) + d));
    setCutoff(instants[i]);
  };
  const sliderIndex = idx === -1 ? instants.length - 1 : idx;

  return (
    <div className="flex flex-col min-h-full" data-testid="replay-view">
      <FixtureBanner note={bundle.fixtureNote} />
      <div className="max-w-[1100px] w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Link href="/cases">Cases</Link> <span aria-hidden="true">/</span> <Link href={`/cases/${encodeURIComponent(bundle.caseId)}`} className="id">{bundle.caseId}</Link> <span aria-hidden="true">/</span> Replay
        </nav>
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Replay · {bundle.title}</h1>

        {/* Persistent banner — textual, not only a timeline */}
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-[var(--radius-md)] border text-[13px]" style={{ borderColor: isPresent ? 'var(--border-default)' : 'var(--border-accent)', background: isPresent ? 'var(--bg-secondary)' : 'rgba(var(--accent-rgb), 0.08)' }} data-testid="replay-banner">
          {isPresent ? (
            <>Viewing the present knowledge state as of <span className="ts">{fmtUtc(bundle.asOf)}</span>. Nothing is hidden.</>
          ) : (
            <>
              <span className="font-semibold" style={{ color: 'var(--accent-strong)' }}>Viewing this case as it was knowable on <span className="ts">{fmtUtc(cutoff)}</span>.</span>{' '}
              Later evidence and corrections are hidden: {k.hidden.evidence} evidence, {k.hidden.claims} claims, {k.hidden.rulings} rulings, {k.hidden.events} events.
            </>
          )}
        </div>

        {/* Knowledge-time control */}
        <section aria-label="Knowledge-time control" className="surface p-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="label-sm">Information known by (UTC)</span>
              <input type="datetime-local" value={toLocalInput(cutoff)} onChange={(e) => e.target.value && setCutoff(fromLocalInput(e.target.value))} className="surface-inset px-2 py-1 mono text-[12.5px]" aria-label="Knowledge-time cutoff" step={60} />
            </label>
            <div className="flex gap-1">
              <button type="button" className="btn btn-sm" onClick={() => step(-1)} disabled={sliderIndex <= 0}>Earlier</button>
              <button type="button" className="btn btn-sm" onClick={() => step(1)} disabled={sliderIndex >= instants.length - 1}>Later</button>
              <button type="button" className="btn btn-sm" onClick={() => setCutoff(bundle.asOf)} disabled={isPresent}>Present</button>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label-sm">Knowledge instants ({instants.length})</span>
            <input type="range" min={0} max={instants.length - 1} value={sliderIndex} onChange={(e) => setCutoff(instants[Number(e.target.value)])} aria-valuetext={fmtUtc(instants[sliderIndex])} className="w-full" />
          </label>
          <ol className="m-0 p-0 list-none flex flex-wrap gap-1 text-[11px]" aria-label="Knowledge instants">
            {instants.map((t, i) => (
              <li key={t}>
                <button type="button" className="btn btn-sm btn-quiet ts" aria-pressed={i === sliderIndex} onClick={() => setCutoff(t)} style={i === sliderIndex ? { color: 'var(--accent-strong)', borderColor: 'var(--border-accent)' } : undefined}>{t.slice(5, 16).replace('T', ' ')}</button>
              </li>
            ))}
          </ol>
        </section>

        {/* Three clocks, separately */}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 m-0" data-testid="three-clocks">
          <div className="surface p-3"><dt className="label-sm">World state valid on</dt><dd className="m-0 ts text-[14px]" style={{ color: 'var(--text-heading)' }} data-clock="validAt">{fmtUtc(k.applicableRuling?.temporalBasis.validAt ?? bundle.temporalBasis.validAt)}</dd><dd className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Unchanged by replay: the claims describe the same world instant.</dd></div>
          <div className="surface p-3" style={{ borderColor: 'var(--border-accent)' }}><dt className="label-sm">Information known on</dt><dd className="m-0 ts text-[14px]" style={{ color: 'var(--accent-strong)' }} data-clock="knownAt">{fmtUtc(cutoff)}</dd><dd className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>The replay cutoff. Only what was knowable by now is shown.</dd></div>
          <div className="surface p-3"><dt className="label-sm">Ruling issued on</dt><dd className="m-0 ts text-[14px]" style={{ color: 'var(--text-heading)' }} data-clock="ruledAt">{k.applicableRuling ? fmtUtc(k.applicableRuling.temporalBasis.ruledAt) : 'No ruling yet at this cutoff'}</dd><dd className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{k.applicableRuling ? `Applicable ruling ${k.applicableRuling.rulingId}` : 'The case had not been ruled on.'}</dd></div>
        </dl>

        <Section title="Applicable ruling at this cutoff" id="rp-ruling">
          <div className="surface p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <RulingStatusPill status={k.statusAtCutoff} size="lg" />
              {k.applicableRuling && <Link href={`/rulings/${encodeURIComponent(k.applicableRuling.rulingId)}`} className="id" style={{ color: 'var(--info)' }}>{k.applicableRuling.rulingId}</Link>}
              {k.applicableRuling && k.applicableRuling.rulingId !== current?.rulingId && <span className="label-sm" style={{ color: 'var(--status-superseded)' }}>later superseded</span>}
            </div>
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{k.applicableRuling ? k.applicableRuling.scopeStatement : STATUS_SEMANTICS[k.statusAtCutoff].meaning}</p>
          </div>
        </Section>

        {k.applicableRuling && current && k.applicableRuling.rulingId !== current.rulingId && (
          <Section title="Then versus now" id="rp-compare"><div className="surface p-3"><RevisionComparison bundle={bundle} a={k.applicableRuling} b={current} /></div></Section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Section title={`Evidence knowable (${k.evidence.length})`} id="rp-evidence">
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {k.evidence.map((e) => (
                <li key={e.evidenceId} className="surface-inset p-2 text-[12.5px] flex flex-col gap-0.5">
                  <span><span className="id">{e.evidenceId}</span> — {e.title}</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{humanize(e.kind)} · {partyName(bundle, e.producerId)} · known <span className="ts">{fmtUtc(e.knownAt)}</span></span>
                  <EvidenceClassBadge evidenceClass={e.evidenceClass} compact />
                </li>
              ))}
              {k.evidence.length === 0 && <li className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No evidence was knowable at this cutoff.</li>}
              {k.hidden.evidence > 0 && <li className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{k.hidden.evidence} artifact{k.hidden.evidence === 1 ? '' : 's'} became knowable later and are hidden.</li>}
            </ul>
          </Section>
          <Section title={`Claims knowable (${k.claims.length})`} id="rp-claims">
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {k.claims.map((c) => (
                <li key={c.claimId} className="surface-inset p-2 text-[12.5px]"><span className="id">{c.claimId}</span> — {c.title}<div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>known <span className="ts">{fmtUtc(c.knownAt)}</span></div></li>
              ))}
              {k.claims.length === 0 && <li className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No claims were knowable at this cutoff.</li>}
            </ul>
          </Section>
        </div>

        <Section title={`Events known (${k.events.length})`} id="rp-events">
          <ol className="m-0 p-0 list-none flex flex-col gap-1 text-[12px]">
            {[...k.events].sort((a, b) => (a.at < b.at ? 1 : -1)).map((e) => (
              <li key={e.eventId} className="px-2 py-1 border-l" style={{ borderColor: 'var(--border-default)' }}><span className="ts" style={{ color: 'var(--text-muted)' }}>{fmtUtc(e.at)}</span> <span className="label-sm">{e.kind.replace(/_/g, ' ').toLowerCase()}</span><div style={{ color: 'var(--text-secondary)' }}>{e.summary}</div></li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
