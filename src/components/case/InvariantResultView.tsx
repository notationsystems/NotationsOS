'use client';

import type { ClaimCaseBundle, InvariantResult, Remediation } from '@/domain/types';
import { VISIBILITY_SEMANTICS, claimById, evidenceById, partyName } from '@/domain/selectors';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { fmtUtc } from '@/lib/format';

export const CHECK_SEMANTICS: Record<InvariantResult['status'], { label: string; glyph: string; cssVar: string }> = {
  PASSED: { label: 'Passed', glyph: '✓', cssVar: '--check-passed' },
  FAILED: { label: 'Failed', glyph: '✕', cssVar: '--check-failed' },
  NOT_APPLICABLE: { label: 'Not applicable', glyph: '–', cssVar: '--check-na' },
  NOT_EVALUATED: { label: 'Not evaluated', glyph: '?', cssVar: '--check-not-evaluated' },
};

export const AUTHORITY_LABEL: Record<InvariantResult['authorityClass'], string> = {
  CORE_DISTRIBUTION: 'Core distribution',
  DOMAIN_PROFILE: 'Domain profile',
  GOVERNANCE_POLICY: 'Governance policy',
};


/** A compact row for the decision rail and check lists. */
export function InvariantRow({ result, selected, onSelect }: { result: InvariantResult; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result.invariantId)}
      aria-pressed={selected}
      className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-[var(--radius-md)] border ${selected ? 'is-highlighted' : ''}`}
      style={{ borderColor: selected ? 'var(--highlight-border)' : 'var(--border-subtle)' }}
      data-invariant-id={result.invariantId}
    >
      <span className="mono text-[12px] shrink-0 w-20" style={{ color: `var(${CHECK_SEMANTICS[result.status].cssVar})` }}>
        <span aria-hidden="true">{CHECK_SEMANTICS[result.status].glyph}</span> {result.invariantId}
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-[12.5px] leading-snug" style={{ color: 'var(--text-primary)' }}>{result.title}</span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {AUTHORITY_LABEL[result.authorityClass]}
          {result.origin === 'REVIEWER' && <> · reviewer-entered</>}
          {result.materiality && result.status === 'FAILED' && <> · {result.materiality.toLowerCase()}</>}
        </span>
      </span>
    </button>
  );
}

/**
 * The full, durable, inspectable record of one check: everything the brief
 * lists (identifier, title, affected claim, reason, evidence inspected,
 * evidence missing or contradictory, materiality, automatic vs reviewer,
 * permitted remediation, resubmission, what may be disclosed).
 */
export function InvariantResultDetail({
  result,
  bundle,
  remediations,
  onSelectClaim,
  onSelectEvidence,
}: {
  result: InvariantResult;
  bundle: ClaimCaseBundle;
  remediations: Remediation[];
  onSelectClaim?: (id: string) => void;
  onSelectEvidence?: (id: string) => void;
}) {
  const s = CHECK_SEMANTICS[result.status];
  return (
    <article className="flex flex-col gap-3" aria-label={`Check ${result.invariantId}`} data-testid="invariant-detail">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="id" style={{ color: 'var(--text-secondary)' }}>{result.invariantId}</span>
            <span className="label-sm">{AUTHORITY_LABEL[result.authorityClass]}</span>
            <span className="label-sm" style={{ color: result.origin === 'REVIEWER' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>{result.origin === 'REVIEWER' ? 'Reviewer-entered' : 'Automatic'}</span>
          </div>
          <h3 className="m-0 mt-1 text-[16px] font-semibold" style={{ color: 'var(--text-heading)' }}>{result.title}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="pill" style={{ color: `var(${s.cssVar})`, borderColor: `var(${s.cssVar})` }}>
            <span aria-hidden="true">{s.glyph}</span> {s.label}
          </span>
          {result.refusalCode && <span className="id" style={{ color: 'var(--text-muted)' }}>{result.refusalCode}</span>}
        </div>
      </header>

      <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-primary)' }}>{result.summary}</p>
      {result.detail && <p className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{result.detail}</p>}

      <dl className="kv">
        {result.materiality && (
          <>
            <dt>Materiality</dt>
            <dd className="text-[12.5px]">{result.materiality === 'BLOCKING' ? 'Blocking — the ruling cannot admit while this fails' : result.materiality === 'MATERIAL' ? 'Material' : 'Advisory'}</dd>
          </>
        )}
        <dt>Affected claims</dt>
        <dd className="flex flex-wrap gap-1">
          {result.affectedClaimIds.length === 0 && <span style={{ color: 'var(--text-muted)' }}>None</span>}
          {result.affectedClaimIds.map((id) => {
            const c = claimById(bundle, id);
            return (
              <button key={id} type="button" className="btn btn-sm" onClick={() => onSelectClaim?.(id)} disabled={!onSelectClaim} title={c?.title}>
                <span className="id">{id}</span>{c && <span className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{c.predicate}</span>}
              </button>
            );
          })}
        </dd>
        <dt>Evidence inspected</dt>
        <dd className="flex flex-wrap gap-1">
          {result.evidenceIds.length === 0 && <span style={{ color: 'var(--text-muted)' }}>None</span>}
          {result.evidenceIds.map((id) => {
            const e = evidenceById(bundle, id);
            return (
              <button key={id} type="button" className="btn btn-sm" onClick={() => onSelectEvidence?.(id)} disabled={!onSelectEvidence} title={e?.title}>
                <span className="id">{id}</span>
              </button>
            );
          })}
        </dd>
        {result.missingEvidence && result.missingEvidence.length > 0 && (
          <>
            <dt>Evidence missing</dt>
            <dd>
              <ul className="m-0 pl-4 text-[12.5px]" style={{ color: 'var(--status-pending)' }}>
                {result.missingEvidence.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </dd>
          </>
        )}
        {result.contradictoryEvidenceIds && result.contradictoryEvidenceIds.length > 0 && (
          <>
            <dt>Contradictory evidence</dt>
            <dd className="flex flex-wrap gap-1">{result.contradictoryEvidenceIds.map((id) => <span key={id} className="id">{id}</span>)}</dd>
          </>
        )}
        {result.origin === 'REVIEWER' && (
          <>
            <dt>Reviewer</dt>
            <dd className="text-[12.5px]">{partyName(bundle, result.reviewerId)}</dd>
            <dt>Basis</dt>
            <dd className="text-[12.5px]">{result.reviewerBasis ?? 'Not recorded'}</dd>
          </>
        )}
        <dt>Evaluated</dt>
        <dd className="ts">{fmtUtc(result.evaluatedAt)}</dd>
        <dt>Disclosure</dt>
        <dd className="flex flex-col gap-1">
          <span className="flex items-center gap-2"><VisibilityBadge visibility={result.disclosureClass} /> <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{VISIBILITY_SEMANTICS[result.disclosureClass].meaning}</span></span>
          {result.publicSummary && <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Public statement: “{result.publicSummary}”</span>}
        </dd>
        <dt>Remediation</dt>
        <dd>
          {remediations.length === 0 && <span style={{ color: 'var(--text-muted)' }}>{result.status === 'FAILED' ? 'None permitted' : 'Not required'}</span>}
          <ul className="m-0 pl-0 list-none flex flex-col gap-1">
            {remediations.map((r) => (
              <li key={r.remediationId} className="text-[12.5px]">
                <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{r.title}</span>
                <span style={{ color: 'var(--text-muted)' }}> · {r.resubmissionAllowed ? 'resubmission allowed' : 'resubmission not allowed'}</span>
              </li>
            ))}
          </ul>
        </dd>
      </dl>
    </article>
  );
}
