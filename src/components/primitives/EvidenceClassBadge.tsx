import type { EvidenceClass } from '@/domain/types';

/**
 * The corpus contract's two axes plus interest, shown as three labelled
 * segments. They are different questions and are never merged into one
 * "quality" score.
 */
const STRENGTH_TITLE = 'claim_strength — how hard the evidence is (reported > estimated > representative > derived). Weakest input wins when values combine.';
const PRODUCTION_TITLE = 'production_class — how the value came to exist (asserted, computed, derived, measured). Not ranked. "unclassified" is the absence of a term.';
const INTEREST_TITLE = 'interest — what stake the source had in stating it (disinterested > unknown > self_reported > negotiating_position).';

export function EvidenceClassBadge({ evidenceClass, compact = false }: { evidenceClass: EvidenceClass; compact?: boolean }) {
  const seg = (label: string, value: string, title: string, warn: boolean) => (
    <span
      className="inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] border text-[10.5px]"
      style={{ borderColor: warn ? 'var(--border-accent)' : 'var(--border-default)', color: warn ? 'var(--accent-strong)' : 'var(--text-secondary)' }}
      title={title}
    >
      {!compact && <span className="label-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>}
      <span className="mono">{value}</span>
    </span>
  );
  return (
    <span className="inline-flex flex-wrap gap-1" data-evidence-class={`${evidenceClass.claimStrength}/${evidenceClass.productionClass}/${evidenceClass.interest}`}>
      {seg('strength', evidenceClass.claimStrength, STRENGTH_TITLE, evidenceClass.claimStrength === 'representative')}
      {seg('production', evidenceClass.productionClass, PRODUCTION_TITLE, evidenceClass.productionClass === 'unclassified')}
      {seg('interest', evidenceClass.interest, INTEREST_TITLE, evidenceClass.interest === 'self_reported' || evidenceClass.interest === 'negotiating_position')}
    </span>
  );
}
