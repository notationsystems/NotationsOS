import type { ClaimValue as ClaimValueT, EvidenceClass } from '@/domain/types';
import { fmtNumber, fmtUtc } from '@/lib/format';
import { EvidenceClassBadge } from './EvidenceClassBadge';

/**
 * A claim value is a number-with-basis, never a bare number. The summary
 * shows value + unit; the expanded details expose basis, uncertainty, valid
 * time, knowledge time, source artifact, evidence class and transform.
 */
export function ClaimValueView({
  label,
  value,
  evidenceClass,
  sourceTitle,
  defaultOpen = false,
}: {
  label: string;
  value: ClaimValueT | undefined;
  evidenceClass?: EvidenceClass;
  sourceTitle?: string;
  defaultOpen?: boolean;
}) {
  if (!value) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="label-sm">{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>Not recorded</span>
      </div>
    );
  }
  return (
    <details open={defaultOpen} className="group" data-testid="claim-value">
      <summary className="flex items-baseline gap-2 py-1">
        <span className="label-sm w-24 shrink-0">{label}</span>
        <span className="mono text-[14px]" style={{ color: 'var(--text-heading)' }}>{fmtNumber(value.value)}</span>
        {value.unit && <span className="unit text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{value.unit}</span>}
        {value.uncertainty?.value !== undefined && (
          <span className="mono text-[12px]" style={{ color: 'var(--text-muted)' }} title={value.uncertainty.semantics}>± {value.uncertainty.value} {value.uncertainty.unit ?? value.unit ?? ''}</span>
        )}
        {value.basis && <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>· {value.basis}</span>}
      </summary>
      <dl className="kv ml-4 mt-1 mb-2 text-[12.5px]">
        <dt>Basis</dt>
        <dd>{value.basis ?? 'Not stated'}</dd>
        <dt>Uncertainty</dt>
        <dd>{value.uncertainty ? `± ${value.uncertainty.value ?? '?'} ${value.uncertainty.unit ?? value.unit ?? ''} — ${value.uncertainty.semantics ?? 'semantics not stated'}` : 'Not supplied'}</dd>
        <dt>World state valid on</dt>
        <dd className="ts">{fmtUtc(value.validAt)}</dd>
        <dt>Information known by</dt>
        <dd className="ts">{fmtUtc(value.knownAt)}</dd>
        <dt>Source</dt>
        <dd>{value.sourceEvidenceId ? <span className="id">{sourceTitle ?? value.sourceEvidenceId}</span> : 'Claimant assertion'}</dd>
        {evidenceClass && (
          <>
            <dt>Evidence class</dt>
            <dd><EvidenceClassBadge evidenceClass={evidenceClass} /></dd>
          </>
        )}
        {value.transformId && (
          <>
            <dt>Transform</dt>
            <dd><span className="id">{value.transformId}</span></dd>
          </>
        )}
      </dl>
    </details>
  );
}
