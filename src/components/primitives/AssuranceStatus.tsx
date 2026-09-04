import type { AssuranceStatus as AssuranceStatusT } from '@/domain/types';
import { ASSURANCE_SEMANTICS } from '@/domain/selectors';
import { fmtUtc } from '@/lib/format';

/**
 * Assurance is scoped. The badge names the class; the expanded form states
 * what the class rests on for THIS ruling and lists, verbatim, what is NOT
 * available (external verification, cryptographic attestation, review). A
 * locally evaluated result must not look like a verified one.
 */
export function AssuranceBadge({ assurance, size = 'md' }: { assurance: AssuranceStatusT; size?: 'sm' | 'md' | 'lg' }) {
  const s = ASSURANCE_SEMANTICS[assurance.class];
  const color = `var(${s.cssVar})`;
  return (
    <span
      className={`pill ${size === 'lg' ? 'pill-lg' : ''} ${size === 'sm' ? 'text-[10.5px] px-1.5' : ''}`}
      style={{ color, borderColor: color, borderStyle: assurance.class === 'UNVERIFIED_EVALUATION' ? 'dashed' : 'solid' }}
      data-assurance={assurance.class}
      title={s.meaning}
    >
      <span aria-hidden="true">{s.glyph}</span>
      <span>{s.label}</span>
    </span>
  );
}

const VERIFICATION_LABEL: Record<NonNullable<AssuranceStatusT['manifestVerification']>, string> = {
  verified: 'verified',
  partially_verified: 'partially verified',
  unverified: 'unverified',
  challenged: 'challenged',
};

const ANCHOR_LABEL: Record<NonNullable<AssuranceStatusT['anchor']>, string> = {
  internal: 'Internal log (not externally witnessed)',
  counterparty_cosigned: 'Counterparty cosigned',
  timestamp_authority: 'Timestamp authority',
  public_chain: 'Public chain',
};

export function AssuranceDetail({ assurance, partyName }: { assurance: AssuranceStatusT; partyName?: (id: string | undefined) => string }) {
  const s = ASSURANCE_SEMANTICS[assurance.class];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <AssuranceBadge assurance={assurance} size="lg" />
      </div>
      <p className="text-[12.5px] m-0" style={{ color: 'var(--text-secondary)' }}>{s.meaning}</p>
      <dl className="kv">
        <dt>Basis</dt>
        <dd className="text-[12.5px]">{assurance.basis}</dd>
        {assurance.manifestVerification && (
          <>
            <dt>Manifest</dt>
            <dd className="text-[12.5px]">
              Verification status <span className="mono">{VERIFICATION_LABEL[assurance.manifestVerification]}</span>
              {assurance.manifestCheckedAt && <> · checked <span className="ts">{fmtUtc(assurance.manifestCheckedAt)}</span></>}
            </dd>
          </>
        )}
        {assurance.anchor && (
          <>
            <dt>Anchor</dt>
            <dd className="text-[12.5px]">{ANCHOR_LABEL[assurance.anchor]}</dd>
          </>
        )}
        {assurance.proofSystem && (
          <>
            <dt>Proof</dt>
            <dd className="text-[12.5px]">{assurance.proofSystem === 'none' ? 'No proof system' : assurance.proofSystem}</dd>
          </>
        )}
        {assurance.reviewedBy && (
          <>
            <dt>Reviewed by</dt>
            <dd className="text-[12.5px]">
              {partyName ? partyName(assurance.reviewedBy) : assurance.reviewedBy}
              {assurance.reviewedAt && <> · <span className="ts">{fmtUtc(assurance.reviewedAt)}</span></>}
            </dd>
          </>
        )}
      </dl>
      {assurance.notAvailable && assurance.notAvailable.length > 0 && (
        <ul className="m-0 pl-0 list-none flex flex-col gap-1" aria-label="Not available">
          {assurance.notAvailable.map((n) => (
            <li key={n} className="text-[12px] flex gap-2" style={{ color: 'var(--text-muted)' }}>
              <span aria-hidden="true">—</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
