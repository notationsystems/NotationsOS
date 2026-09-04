import type { Ruling } from '@/domain/types';
import { CopyButton } from '@/components/primitives/CopyButton';

/**
 * How a machine would ask for this ruling. Illustrative of the adapter
 * contract only: this repository serves no endpoint, and says so.
 */
export function ApiExampleDrawer({ ruling }: { ruling: Ruling }) {
  const request = `GET /v1/rulings/${ruling.rulingId}\nAccept: application/json\nX-Payload-Visibility: ${ruling.visibility}`;
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
      links: { manifest: `/v1/rulings/${ruling.rulingId}/manifest`, case: `/v1/cases/${ruling.caseId}` },
    },
    null,
    2,
  );
  return (
    <details className="surface-inset p-3" data-testid="api-example">
      <summary className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>API request and response example</summary>
      <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Illustrative. No endpoint is served by this repository; the shape mirrors what the adapter boundary would return for this ruling at this visibility.
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
