import Link from 'next/link';
import type { Ruling } from '@/domain/types';
import { CopyButton } from '@/components/primitives/CopyButton';

/**
 * How a machine would ask for this ruling. The request below is served by
 * the fixture feed under /api/v1; the response shown is its shape.
 */
export function ApiExampleDrawer({ ruling }: { ruling: Ruling }) {
  const request = `GET /api/v1/rulings/${ruling.rulingId}?projection=${ruling.visibility === 'PUBLIC_RULING' ? 'PUBLIC_RULING' : 'COUNTERPARTY_SHARED'}\nAccept: application/json`;
  const response = JSON.stringify(
    {
      rulingId: ruling.rulingId,
      caseId: ruling.caseId,
      revision: ruling.revision,
      status: ruling.status,
      assuranceClass: ruling.assurance.class,
      useCode: ruling.useScope.useCode,
      tolerance: ruling.useScope.tolerance ?? null,
      profileId: ruling.profileId,
      profileVersion: ruling.profileVersion,
      registerDigest: ruling.registerDigest,
      temporalBasis: ruling.temporalBasis,
      manifestCommitment: ruling.release?.manifestCommitment ?? null,
      evidenceRoot: ruling.release?.evidenceRoot ?? null,
      supersedesRulingId: ruling.supersedesRulingId ?? null,
      supersededByRulingId: ruling.supersededByRulingId ?? null,
      corpus: ruling.corpus,
      links: { manifest: `/api/v1/rulings/${ruling.rulingId}/manifest`, release: `/api/v1/releases/${ruling.corpus.releaseId}` },
    },
    null,
    2,
  );
  return (
    <details className="surface-inset p-3" data-testid="api-example">
      <summary className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>API request and response example</summary>
      <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Served by the demonstration feed (fixture_only: true): <Link href={`/api/v1/rulings/${encodeURIComponent(ruling.rulingId)}`} className="id" style={{ color: 'var(--info)' }}>GET /api/v1/rulings/{ruling.rulingId}</Link> and <Link href={`/api/v1/rulings/${encodeURIComponent(ruling.rulingId)}/manifest`} className="id" style={{ color: 'var(--info)' }}>…/manifest</Link>. The application layer sits beside the corpus feed at <Link href="/api" style={{ color: 'var(--info)' }}>/api</Link>.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between"><span className="label-sm">Request</span><CopyButton value={request} /></div>
        <pre tabIndex={0} className="m-0 surface-inset p-2 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)' }}>{request}</pre>
        <div className="flex items-center justify-between"><span className="label-sm">Response 200</span><CopyButton value={response} /></div>
        <pre tabIndex={0} className="m-0 surface-inset p-2 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)' }}>{response}</pre>
      </div>
    </details>
  );
}
