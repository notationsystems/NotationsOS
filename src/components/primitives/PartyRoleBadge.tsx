import type { PartyRole } from '@/domain/types';

export const ROLE_LABEL: Record<PartyRole, string> = {
  CLAIM_SPONSOR: 'Claim sponsor',
  CLAIMANT: 'Claimant',
  EVIDENCE_PRODUCER: 'Evidence producer',
  RESPONSIBLE_PROFESSIONAL: 'Responsible professional',
  RELYING_PARTY: 'Relying party',
  REVIEWER: 'Reviewer',
};

export function PartyRoleBadge({ role }: { role: PartyRole }) {
  return (
    <span className="pill text-[10.5px] px-1.5" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }} data-role={role}>
      {ROLE_LABEL[role]}
    </span>
  );
}
