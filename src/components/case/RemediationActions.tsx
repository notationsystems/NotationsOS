
import { useState } from 'react';
import type { ClaimCaseBundle, Remediation, RemediationKind } from '@/domain/types';
import { ROLE_LABEL } from '@/components/primitives/PartyRoleBadge';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';

export const REMEDIATION_LABEL: Record<RemediationKind, string> = {
  REQUEST_EVIDENCE: 'Request evidence',
  REPLACE_EVIDENCE: 'Replace evidence',
  CORRECT_CLAIM: 'Correct claim',
  CHANGE_USE: 'Change use',
  CHANGE_TOLERANCE: 'Change tolerance',
  APPEAL: 'Appeal',
  RESUBMIT: 'Resubmit',
};

const ALL_KINDS: RemediationKind[] = ['REQUEST_EVIDENCE', 'REPLACE_EVIDENCE', 'CORRECT_CLAIM', 'CHANGE_USE', 'CHANGE_TOLERANCE', 'APPEAL', 'RESUBMIT'];

export interface ActionIntent {
  kind: RemediationKind | 'REVIEWER_INTERVENTION';
  remediationId?: string;
  authorityId?: string;
  reason?: string;
  basis?: string;
  at: string;
}

/**
 * Remediation is a first-class object with a clear action. Every action here
 * produces an ACTION INTENT that would be sent through the adapter; nothing
 * in this repository evaluates or re-rules. There is no bare "Override":
 * reviewer intervention requires a separately identified authority, a
 * reason and a basis, and is recorded as such.
 */
export function RemediationActions({
  bundle,
  remediations,
  selectedRemediationIds,
  onIntent,
}: {
  bundle: ClaimCaseBundle;
  remediations: Remediation[];
  selectedRemediationIds: Set<string>;
  onIntent: (i: ActionIntent) => void;
}) {
  const [intervene, setIntervene] = useState(false);
  const [authorityId, setAuthorityId] = useState('');
  const [reason, setReason] = useState('');
  const [basis, setBasis] = useState('');
  const reviewers = bundle.parties.filter((p) => p.role === 'REVIEWER');
  const canIntervene = authorityId.trim() !== '' && reason.trim().length >= 12 && basis.trim().length >= 12;
  const resubmitAllowed = remediations.some((r) => r.resubmissionAllowed);

  return (
    <div className="flex flex-col gap-3" data-testid="remediation-actions">
      {remediations.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {remediations.map((r) => (
            <li key={r.remediationId} className={`surface-inset p-2 flex flex-col gap-1 ${selectedRemediationIds.has(r.remediationId) ? 'is-highlighted' : ''}`} data-remediation-id={r.remediationId}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-heading)' }}>{r.title}</span>
                <span className="label-sm">{REMEDIATION_LABEL[r.kind]}</span>
              </div>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{r.instruction}</p>
              <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span>Actor: {r.actorRole ? ROLE_LABEL[r.actorRole] : 'Not specified'} · {r.resubmissionAllowed ? 'resubmission allowed' : 'no resubmission'}</span>
                <VisibilityBadge visibility={r.disclosure} />
              </div>
              <div>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onIntent({ kind: r.kind, remediationId: r.remediationId, at: bundle.asOf })}>
                  {REMEDIATION_LABEL[r.kind]}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1" role="group" aria-label="Other actions">
        {ALL_KINDS.filter((k) => !remediations.some((r) => r.kind === k)).map((k) => (
          <button
            key={k}
            type="button"
            className="btn btn-sm"
            disabled={k === 'RESUBMIT' && !resubmitAllowed && bundle.status !== 'PENDING_EVIDENCE'}
            onClick={() => onIntent({ kind: k, at: bundle.asOf })}
          >
            {REMEDIATION_LABEL[k]}
          </button>
        ))}
      </div>

      <details open={intervene} onToggle={(e) => setIntervene((e.target as HTMLDetailsElement).open)} className="surface-inset p-2">
        <summary className="text-[12.5px] font-medium" style={{ color: 'var(--text-secondary)' }}>Reviewer intervention (authority, reason and basis required)</summary>
        <form className="mt-2 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (canIntervene) onIntent({ kind: 'REVIEWER_INTERVENTION', authorityId, reason, basis, at: bundle.asOf }); }}>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>There is no unattributed override. An intervention does not alter automatic results; it is recorded beside them with the identity and basis of the person intervening (GOV-203).</p>
          <label className="flex flex-col gap-1">
            <span className="label-sm">Authority</span>
            <select value={authorityId} onChange={(e) => setAuthorityId(e.target.value)} className="surface-inset px-2 py-1 text-[12.5px]" required>
              <option value="">Select the intervening reviewer</option>
              {reviewers.map((r) => <option key={r.partyId} value={r.partyId}>{r.displayName}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-sm">Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="surface-inset px-2 py-1 text-[12.5px]" minLength={12} required placeholder="Why intervene (min. 12 characters)" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-sm">Basis</span>
            <textarea value={basis} onChange={(e) => setBasis(e.target.value)} className="surface-inset px-2 py-1 text-[12.5px]" rows={2} minLength={12} required placeholder="What was inspected and what it showed (min. 12 characters)" />
          </label>
          <div>
            <button type="submit" className="btn btn-sm" disabled={!canIntervene} aria-disabled={!canIntervene}>Record intervention</button>
          </div>
        </form>
      </details>
    </div>
  );
}

/** The intent record: what would be sent through the adapter. Honest about the absence of a backend. */
export function ActionIntentPanel({ intents, onClear }: { intents: ActionIntent[]; onClear: () => void }) {
  if (intents.length === 0) return null;
  return (
    <section aria-label="Action intents" className="surface-inset p-2 flex flex-col gap-2" data-testid="action-intents">
      <div className="flex items-center justify-between gap-2">
        <span className="label-sm" style={{ color: 'var(--accent-strong)' }}>Action intents (not sent)</span>
        <button type="button" className="btn btn-sm btn-quiet" onClick={onClear}>Clear</button>
      </div>
      <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        This repository has no adjudication backend. Each intent below is the request the sponsor or reviewer would send through the adapter boundary. Nothing has been evaluated or re-ruled.
      </p>
      <ol className="m-0 pl-4 text-[12.5px] flex flex-col gap-1">
        {intents.map((i, idx) => (
          <li key={idx}>
            <span className="id">{i.kind}</span>
            {i.remediationId && <> · <span className="id">{i.remediationId}</span></>}
            {i.authorityId && <> · authority <span className="id">{i.authorityId}</span></>}
            {i.reason && <> · reason: {i.reason}</>}
            {i.basis && <> · basis: {i.basis}</>}
          </li>
        ))}
      </ol>
    </section>
  );
}
