import Link from 'next/link';
import type { Ruling } from '@/domain/types';
import { fmtUtc } from '@/lib/format';

/** A superseded or revoked ruling says so before anything else, in text. */
export function SupersessionBanner({ ruling, current }: { ruling: Ruling; current?: Ruling }) {
  if (ruling.status === 'SUPERSEDED') {
    return (
      <div role="alert" className="px-3 py-2 text-[13px] border rounded-[var(--radius-md)]" style={{ borderColor: 'var(--status-superseded)', background: 'color-mix(in srgb, var(--status-superseded) 10%, transparent)' }} data-testid="supersession-banner">
        <span className="font-semibold" style={{ color: 'var(--status-superseded)' }}>Superseded.</span>{' '}
        This ruling was replaced on <span className="ts">{fmtUtc(ruling.temporalBasis.supersededAt)}</span>
        {ruling.supersededByRulingId && (<> by <Link href={`/rulings/${encodeURIComponent(ruling.supersededByRulingId)}`} className="id" style={{ color: 'var(--info)' }}>{ruling.supersededByRulingId}</Link></>)}.
        It remains inspectable and is not current.{ruling.transitionReason && <> {ruling.transitionReason}</>}
        {current && current.rulingId !== ruling.rulingId && <> The current ruling is <Link href={`/rulings/${encodeURIComponent(current.rulingId)}`} className="id" style={{ color: 'var(--info)' }}>{current.rulingId}</Link>.</>}
      </div>
    );
  }
  if (ruling.status === 'REVOKED') {
    return (
      <div role="alert" className="px-3 py-2 text-[13px] border rounded-[var(--radius-md)]" style={{ borderColor: 'var(--status-revoked)', background: 'color-mix(in srgb, var(--status-revoked) 10%, transparent)' }} data-testid="supersession-banner">
        <span className="font-semibold" style={{ color: 'var(--status-revoked)' }}>Revoked.</span>{' '}
        Reliance on this ruling was withdrawn on <span className="ts">{fmtUtc(ruling.temporalBasis.revokedAt)}</span>. {ruling.transitionReason}
      </div>
    );
  }
  return null;
}
