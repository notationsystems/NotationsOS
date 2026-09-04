import type { UseScope } from '@/domain/types';
import { ASSURANCE_SEMANTICS } from '@/domain/selectors';
import { fmtTolerance } from '@/lib/format';

export function UseScopeCard({ useScope }: { useScope: UseScope }) {
  return (
    <dl className="kv" data-testid="use-scope">
      <dt>Declared use</dt>
      <dd style={{ color: 'var(--text-heading)', fontWeight: 500 }}>{useScope.purpose}</dd>
      <dt>Use code</dt>
      <dd><span className="id">{useScope.useCode}</span></dd>
      <dt>Tolerance</dt>
      <dd>
        <span className="mono">{fmtTolerance(useScope.tolerance)}</span>
        {useScope.tolerance?.appliesToPredicate && <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}> on <span className="id">{useScope.tolerance.appliesToPredicate}</span></span>}
        {useScope.tolerance?.note && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{useScope.tolerance.note}</div>}
      </dd>
      {useScope.relianceClass && (
        <>
          <dt>Reliance</dt>
          <dd className="text-[13px]">{useScope.relianceClass}</dd>
        </>
      )}
      {useScope.requestedAssurance && (
        <>
          <dt>Requested assurance</dt>
          <dd className="text-[13px]">{ASSURANCE_SEMANTICS[useScope.requestedAssurance].label}</dd>
        </>
      )}
      {useScope.jurisdiction && (
        <>
          <dt>Jurisdiction</dt>
          <dd className="text-[13px]">{useScope.jurisdiction}</dd>
        </>
      )}
    </dl>
  );
}
