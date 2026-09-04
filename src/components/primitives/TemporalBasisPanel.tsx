import type { TemporalBasis } from '@/domain/types';
import { fmtUtc } from '@/lib/format';

/** Every clock named. The two that matter most — valid time and knowledge cutoff — come first and are never collapsed into a generic "date". */
export const CLOCK_LABELS: Record<keyof TemporalBasis, { label: string; meaning: string }> = {
  validAt: { label: 'World state valid on', meaning: 'The instant the claims describe the world at.' },
  knownAt: { label: 'Information known by', meaning: 'Knowledge cutoff: only evidence knowable at or before this instant was considered.' },
  submittedAt: { label: 'Submitted', meaning: 'When the sponsor submitted the case for evaluation.' },
  evaluatedAt: { label: 'Evaluated', meaning: 'When deterministic evaluation completed.' },
  ruledAt: { label: 'Ruling issued on', meaning: 'When the ruling was issued.' },
  releasedAt: { label: 'Released', meaning: 'When the ruling was released at its visibility class.' },
  supersededAt: { label: 'Superseded', meaning: 'When a later ruling replaced this one.' },
  revokedAt: { label: 'Revoked', meaning: 'When reliance was withdrawn.' },
  expiresAt: { label: 'Reliance ends', meaning: 'After this instant the ruling must not be relied upon.' },
};

const ORDER: Array<keyof TemporalBasis> = ['validAt', 'knownAt', 'submittedAt', 'evaluatedAt', 'ruledAt', 'releasedAt', 'expiresAt', 'supersededAt', 'revokedAt'];

export function TemporalBasisPanel({ temporalBasis, emphasize = true, only }: { temporalBasis: TemporalBasis; emphasize?: boolean; only?: Array<keyof TemporalBasis> }) {
  const keys = (only ?? ORDER).filter((k) => temporalBasis[k] !== undefined || k === 'validAt' || k === 'knownAt');
  return (
    <dl className="kv" data-testid="temporal-basis">
      {keys.map((k) => {
        const strong = emphasize && (k === 'validAt' || k === 'knownAt');
        return (
          <div key={k} className="contents">
            <dt title={CLOCK_LABELS[k].meaning} style={strong ? { color: 'var(--text-secondary)' } : undefined}>{CLOCK_LABELS[k].label}</dt>
            <dd className="ts" data-clock={k} style={strong ? { color: 'var(--text-heading)', fontWeight: 500 } : undefined}>
              {fmtUtc(temporalBasis[k])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
