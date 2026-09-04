import Link from 'next/link';
import type { ClaimCaseBundle } from '@/domain/types';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { AssuranceBadge } from '@/components/primitives/AssuranceStatus';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { PartyRoleBadge } from '@/components/primitives/PartyRoleBadge';
import { fmtUtc, fmtTolerance } from '@/lib/format';

/**
 * The first thing a reader sees: subject, declared use, current status, the
 * two clocks, profile version, assurance class, responsible parties. Ten
 * seconds of reading should answer "what is this and what does it need".
 */
export function CaseIdentityHeader({ bundle, compact = false }: { bundle: ClaimCaseBundle; compact?: boolean }) {
  const ruling = bundle.currentRuling;
  const sponsor = bundle.parties.filter((p) => p.role === 'CLAIM_SPONSOR');
  const claimant = bundle.parties.filter((p) => p.role === 'CLAIMANT');
  const reviewer = bundle.parties.filter((p) => p.role === 'REVIEWER');
  return (
    <header className="flex flex-col gap-3" data-testid="case-identity-header">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Case</span>
            <span className="id" style={{ color: 'var(--text-secondary)' }}>{bundle.caseId}</span>
            <VisibilityBadge visibility={bundle.visibility} />
          </div>
          <h1 className="m-0 mt-1 text-[20px] font-semibold leading-tight" style={{ color: 'var(--text-heading)' }}>{bundle.title}</h1>
          <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {bundle.subject.subjectType} · <span className="id">{bundle.subject.subjectId}</span>
            {bundle.subject.canonicalId && <> · <span className="id" style={{ color: 'var(--text-muted)' }}>{bundle.subject.canonicalId}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RulingStatusPill status={bundle.status} size="lg" />
          {ruling ? <AssuranceBadge assurance={ruling.assurance} /> : <span className="pill" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-default)' }}>Not evaluated</span>}
        </div>
      </div>
      {!compact && (
        <dl className="grid gap-x-6 gap-y-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 m-0">
          <div>
            <dt className="label-sm">Declared use</dt>
            <dd className="m-0 text-[13px]" style={{ color: 'var(--text-heading)' }}>{bundle.useScope.purpose}</dd>
            <dd className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Tolerance <span className="mono">{fmtTolerance(bundle.useScope.tolerance)}</span></dd>
          </div>
          <div>
            <dt className="label-sm">World state valid on</dt>
            <dd className="m-0 ts" style={{ color: 'var(--text-heading)' }}>{fmtUtc(bundle.temporalBasis.validAt)}</dd>
            <dt className="label-sm mt-1">Information known by</dt>
            <dd className="m-0 ts" style={{ color: 'var(--text-heading)' }}>{fmtUtc(bundle.temporalBasis.knownAt)}</dd>
          </div>
          <div>
            <dt className="label-sm">Profile</dt>
            <dd className="m-0">
              <Link href={`/profiles/${encodeURIComponent(bundle.profileId)}`} className="id" style={{ color: 'var(--info)' }}>{bundle.profileId}</Link>
              <span className="ver ml-1" style={{ color: 'var(--text-muted)' }}>{bundle.profileVersion}</span>
            </dd>
            {ruling && (
              <>
                <dt className="label-sm mt-1">Ruling</dt>
                <dd className="m-0"><Link href={`/rulings/${encodeURIComponent(ruling.rulingId)}`} className="id" style={{ color: 'var(--info)' }}>{ruling.rulingId}</Link> <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>rev {ruling.revision}</span></dd>
              </>
            )}
          </div>
          <div>
            <dt className="label-sm">Responsible parties</dt>
            <dd className="m-0 flex flex-col gap-0.5 text-[12.5px]">
              {[...sponsor, ...claimant, ...reviewer].map((p) => (
                <span key={p.partyId} className="flex items-center gap-1.5"><PartyRoleBadge role={p.role} />{p.displayName}</span>
              ))}
            </dd>
          </div>
        </dl>
      )}
    </header>
  );
}
