'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import type { ClaimCaseBundle, RulingStatus, VisibilityClass } from '@/domain/types';
import { RULING_STATUSES, VISIBILITY_CLASSES } from '@/domain/types';
import { STATUS_SEMANTICS, ASSURANCE_SEMANTICS, VISIBILITY_SEMANTICS, isNearingExpiry, summarizeQueue, tenSecondSummary, partyName } from '@/domain/selectors';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { fmtUtc, fmtDelta } from '@/lib/format';

type Filters = {
  status: RulingStatus | 'ALL' | 'ACTION';
  party: string;
  profile: string;
  validFrom: string;
  validTo: string;
  knownFrom: string;
  knownTo: string;
  visibility: VisibilityClass | 'ALL';
  reviewer: string;
  q: string;
};

const EMPTY: Filters = { status: 'ACTION', party: '', profile: '', validFrom: '', validTo: '', knownFrom: '', knownTo: '', visibility: 'ALL', reviewer: '', q: '' };

function matches(b: ClaimCaseBundle, f: Filters): boolean {
  if (f.status === 'ACTION' && !STATUS_SEMANTICS[b.status].requiresAction) return false;
  if (f.status !== 'ALL' && f.status !== 'ACTION' && b.status !== f.status) return false;
  if (f.party && !b.parties.some((p) => p.partyId === f.party)) return false;
  if (f.profile && b.profileId !== f.profile) return false;
  if (f.visibility !== 'ALL' && b.visibility !== f.visibility) return false;
  if (f.reviewer && b.assignedReviewerId !== f.reviewer) return false;
  const v = b.temporalBasis.validAt ?? '';
  if (f.validFrom && v && v < f.validFrom) return false;
  if (f.validTo && v && v.slice(0, 10) > f.validTo) return false;
  const k = b.temporalBasis.knownAt ?? '';
  if (f.knownFrom && k && k < f.knownFrom) return false;
  if (f.knownTo && k && k.slice(0, 10) > f.knownTo) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [
      b.caseId, b.title, b.subject.subjectId, b.subject.displayName,
      b.currentRuling?.rulingId, b.currentRuling?.release?.manifestId, b.currentRuling?.release?.manifestCommitment,
      ...b.claims.map((c) => c.claimId), ...b.claims.map((c) => c.predicate),
      ...b.evidence.flatMap((e) => Object.values(e.declaredIdentifiers ?? {})),
      ...b.evidence.map((e) => e.evidenceId),
    ].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function CaseQueue({ cases, lastSeenAt }: { cases: ClaimCaseBundle[]; lastSeenAt: string }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const q = useDeferredValue(f.q);
  const summary = useMemo(() => summarizeQueue(cases, lastSeenAt), [cases, lastSeenAt]);
  const rows = useMemo(
    () => cases.filter((b) => matches(b, { ...f, q })).sort((a, b) => (b.lastChangedAt > a.lastChangedAt ? 1 : -1)),
    [cases, f, q],
  );
  const parties = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of cases) for (const p of b.parties) if (p.role === 'CLAIM_SPONSOR' || p.role === 'RELYING_PARTY' || p.role === 'CLAIMANT') m.set(p.partyId, p.displayName);
    return [...m.entries()];
  }, [cases]);
  const reviewers = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of cases) for (const p of b.parties) if (p.role === 'REVIEWER') m.set(p.partyId, p.displayName);
    return [...m.entries()];
  }, [cases]);
  const profiles = useMemo(() => [...new Set(cases.map((b) => b.profileId))], [cases]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 max-w-[1600px] mx-auto w-full">
      {/* Operational summary: small, textual, not decorative cards */}
      <section aria-label="Operational summary" className="flex flex-col gap-1">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>
          {summary.requiresAction} {summary.requiresAction === 1 ? 'case requires' : 'cases require'} action
        </h1>
        <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          {(['PENDING_EVIDENCE', 'REFUSED', 'ADMITTED_WITH_CONDITIONS', 'REVOKED', 'DRAFT', 'EVALUATING', 'ADMITTED'] as RulingStatus[])
            .filter((s) => summary.byStatus[s] > 0)
            .map((s) => (
              <li key={s}>
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => set('status', s)} aria-pressed={f.status === s}>
                  <span className="mono" style={{ color: `var(${STATUS_SEMANTICS[s].cssVar})` }}>{summary.byStatus[s]}</span> {STATUS_SEMANTICS[s].label.toLowerCase()}
                </button>
              </li>
            ))}
          {summary.byStatus.SUPERSEDED > 0 && <li><span className="mono">{summary.byStatus.SUPERSEDED}</span> superseded</li>}
          {summary.nearingExpiry > 0 && <li><span className="mono" style={{ color: 'var(--status-conditional)' }}>{summary.nearingExpiry}</span> nearing expiry (7 days)</li>}
          {summary.changedSince > 0 && <li><span className="mono">{summary.changedSince}</span> changed since <span className="ts">{fmtUtc(lastSeenAt)}</span></li>}
        </ul>
      </section>

      {/* Filters */}
      <form className="surface p-3 grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-8" aria-label="Queue filters" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="label-sm">Search case, manifest, lot, shipment, claim</span>
          <input type="search" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="7C-104, BAL-77812, RUL-…" className="surface-inset px-2 py-1.5 text-[13px] mono" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-sm">Status</span>
          <select value={f.status} onChange={(e) => set('status', e.target.value as Filters['status'])} className="surface-inset px-2 py-1.5 text-[13px]">
            <option value="ACTION">Requires action</option>
            <option value="ALL">All</option>
            {RULING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_SEMANTICS[s].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-sm">Sponsor / counterparty</span>
          <select value={f.party} onChange={(e) => set('party', e.target.value)} className="surface-inset px-2 py-1.5 text-[13px]">
            <option value="">Any</option>
            {parties.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-sm">Profile</span>
          <select value={f.profile} onChange={(e) => set('profile', e.target.value)} className="surface-inset px-2 py-1.5 text-[13px] mono">
            <option value="">Any</option>
            {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-sm">Visibility</span>
          <select value={f.visibility} onChange={(e) => set('visibility', e.target.value as Filters['visibility'])} className="surface-inset px-2 py-1.5 text-[13px]">
            <option value="ALL">Any</option>
            {VISIBILITY_CLASSES.map((v) => <option key={v} value={v}>{VISIBILITY_SEMANTICS[v].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-sm">Assigned reviewer</span>
          <select value={f.reviewer} onChange={(e) => set('reviewer', e.target.value)} className="surface-inset px-2 py-1.5 text-[13px]">
            <option value="">Any</option>
            {reviewers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="label-sm">World state valid (from / to)</span>
          <div className="flex gap-1">
            <input aria-label="Valid from" type="date" value={f.validFrom} onChange={(e) => set('validFrom', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full" />
            <input aria-label="Valid to" type="date" value={f.validTo} onChange={(e) => set('validTo', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="label-sm">Information known (from / to)</span>
          <div className="flex gap-1">
            <input aria-label="Known from" type="date" value={f.knownFrom} onChange={(e) => set('knownFrom', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full" />
            <input aria-label="Known to" type="date" value={f.knownTo} onChange={(e) => set('knownTo', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full" />
          </div>
        </div>
        <div className="col-span-2 md:col-span-4 xl:col-span-8 flex items-center justify-between">
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }} aria-live="polite">{rows.length} of {cases.length} cases</span>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setF(EMPTY)}>Reset filters</button>
        </div>
      </form>

      {/* The queue */}
      <div className="surface overflow-x-auto" tabIndex={0}>
        <table className="ledger-table" aria-label="Case queue">
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">Status</th>
              <th scope="col">Required action</th>
              <th scope="col">Declared use</th>
              <th scope="col">World state valid on</th>
              <th scope="col">Information known by</th>
              <th scope="col">Assurance</th>
              <th scope="col">Sponsor</th>
              <th scope="col">Last change</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>No cases match these filters.</td>
              </tr>
            )}
            {rows.map((b) => {
              const t = tenSecondSummary(b);
              const expiring = isNearingExpiry(b);
              const changed = b.lastChangedAt > lastSeenAt;
              return (
                <tr key={b.caseId} data-case-id={b.caseId}>
                  <td className="min-w-[220px]">
                    <Link href={`/cases/${encodeURIComponent(b.caseId)}`} className="flex flex-col gap-0.5" style={{ color: 'var(--text-heading)' }}>
                      <span className="font-medium">{b.title}</span>
                      <span className="id" style={{ color: 'var(--text-muted)' }}>{b.caseId}</span>
                    </Link>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1 items-start">
                      <RulingStatusPill status={b.status} size="sm" />
                      {expiring && <span className="text-[11px]" style={{ color: 'var(--status-conditional)' }}>Reliance ends {fmtDelta(b.asOf, b.currentRuling!.temporalBasis.expiresAt!)}</span>}
                      {b.previousRulings.length > 0 && <span className="text-[11px]" style={{ color: 'var(--status-superseded)' }}>{b.previousRulings.length} superseded</span>}
                    </div>
                  </td>
                  <td className="text-[12.5px] max-w-[260px]">
                    {t.requiredAction ?? <span style={{ color: 'var(--text-muted)' }}>None</span>}
                    {t.blockingInvariant && <div className="id mt-0.5" style={{ color: 'var(--status-refused)' }}>{t.blockingInvariant.invariantId} · {t.blockingInvariant.refusalCode}</div>}
                  </td>
                  <td className="text-[12.5px]">
                    <div>{b.useScope.purpose}</div>
                    <div className="id" style={{ color: 'var(--text-muted)' }}>{b.useScope.useCode}</div>
                  </td>
                  <td className="ts whitespace-nowrap">{fmtUtc(b.temporalBasis.validAt)}</td>
                  <td className="ts whitespace-nowrap">{fmtUtc(b.temporalBasis.knownAt)}</td>
                  <td className="text-[12px]">{b.currentRuling ? ASSURANCE_SEMANTICS[b.currentRuling.assurance.class].label : <span style={{ color: 'var(--text-muted)' }}>Not evaluated</span>}</td>
                  <td className="text-[12.5px]">{partyName(b, b.parties.find((p) => p.role === 'CLAIM_SPONSOR')?.partyId)}</td>
                  <td className="ts whitespace-nowrap">
                    {fmtUtc(b.lastChangedAt)}
                    {changed && <span className="ml-1 label-sm" style={{ color: 'var(--accent-strong)' }}>new</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
