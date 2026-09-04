import type { Claim, ClaimCaseBundle } from '@/domain/types';
import { evidenceById, partyName } from '@/domain/selectors';
import { ClaimValueView } from '@/components/primitives/ClaimValue';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { fmtUtc, humanize } from '@/lib/format';

export function ClaimRow({ claim, selected, highlighted, onSelect }: { claim: Claim; selected: boolean; highlighted: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(claim.claimId)}
      aria-pressed={selected}
      data-highlighted={highlighted || undefined}
      data-claim-id={claim.claimId}
      className={`w-full text-left flex flex-col gap-0.5 px-2 py-1.5 rounded-[var(--radius-md)] border ${highlighted ? 'is-highlighted' : ''}`}
      style={{ borderColor: selected ? 'var(--border-accent)' : 'var(--border-subtle)' }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="id" style={{ color: 'var(--text-secondary)' }}>{claim.claimId}</span>
        {highlighted && <span className="label-sm shrink-0" style={{ color: 'var(--accent-strong)' }}>affected</span>}
      </span>
      <span className="text-[12.5px] leading-snug" style={{ color: 'var(--text-primary)' }}>{claim.title}</span>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}><span className="id">{claim.predicate}</span> · {humanize(claim.status)}</span>
    </button>
  );
}

export function ClaimDetail({ claim, bundle, highlighted }: { claim: Claim; bundle: ClaimCaseBundle; highlighted: boolean }) {
  const src = (id?: string) => (id ? evidenceById(bundle, id)?.title : undefined);
  return (
    <article className="flex flex-col gap-3" aria-label={`Claim ${claim.claimId}`} data-testid="claim-detail">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Claim</span>
            <span className="id" style={{ color: 'var(--text-secondary)' }}>{claim.claimId}</span>
            <VisibilityBadge visibility={claim.visibility} />
            {highlighted && <span className="label-sm" style={{ color: 'var(--accent-strong)' }}>affected by selected check</span>}
          </div>
          <h3 className="m-0 mt-1 text-[16px] font-semibold" style={{ color: 'var(--text-heading)' }}>{claim.title}</h3>
          <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="id">{claim.predicate}</span> · asserted by {partyName(bundle, claim.claimantId)} · {humanize(claim.status)}
          </div>
        </div>
        {claim.evidenceClass && <EvidenceClassBadge evidenceClass={claim.evidenceClass} />}
      </header>
      {claim.note && <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{claim.note}</p>}
      <section className="surface-inset p-3 flex flex-col gap-1" aria-label="Values">
        <ClaimValueView label="Asserted" value={claim.assertedValue} evidenceClass={claim.evidenceClass} sourceTitle={src(claim.assertedValue?.sourceEvidenceId)} defaultOpen />
        <ClaimValueView label="Normalized" value={claim.normalizedValue} evidenceClass={claim.evidenceClass} sourceTitle={src(claim.normalizedValue?.sourceEvidenceId)} defaultOpen={Boolean(claim.normalizedValue)} />
      </section>
      <dl className="kv">
        <dt>Subject</dt>
        <dd className="id">{claim.subjectId}</dd>
        <dt>Canonical id</dt>
        <dd className="id">{claim.canonicalId ?? 'Not assigned'}</dd>
        <dt>Information known by</dt>
        <dd className="ts">{fmtUtc(claim.knownAt)}</dd>
        <dt>Supporting evidence</dt>
        <dd className="flex flex-col gap-0.5">
          {claim.evidenceIds.length === 0 && <span style={{ color: 'var(--text-muted)' }}>None attached</span>}
          {claim.evidenceIds.map((id) => {
            const e = evidenceById(bundle, id);
            return <span key={id} className="text-[12.5px]"><span className="id">{id}</span>{e && <span style={{ color: 'var(--text-secondary)' }}> — {e.title}</span>}</span>;
          })}
        </dd>
      </dl>
    </article>
  );
}
