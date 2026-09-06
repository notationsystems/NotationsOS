
import Link from 'next/link';
import type { ClaimCaseBundle, InvariantResult, Remediation } from '@/domain/types';
import { STATUS_SEMANTICS, partyName, tenSecondSummary } from '@/domain/selectors';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { AssuranceBadge, AssuranceDetail } from '@/components/primitives/AssuranceStatus';
import { UseScopeCard } from '@/components/primitives/UseScopeCard';
import { TemporalBasisPanel } from '@/components/primitives/TemporalBasisPanel';
import { ProfileReference } from '@/components/primitives/ProfileReference';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { Section } from '@/components/primitives/Section';
import { InvariantRow } from './InvariantResultView';
import { REMEDIATION_LABEL } from './RemediationActions';
import { fmtUtc } from '@/lib/format';

/**
 * The decision rail: use scope, time basis, profile, assurance, ruling,
 * failed checks, next actions. A distinct semantic region (<aside>) that
 * survives responsive collapse.
 */
export function DecisionRail({
  bundle,
  selectedInvariantId,
  onSelectInvariant,
  remediations,
  onSelectRemediation,
}: {
  bundle: ClaimCaseBundle;
  selectedInvariantId?: string;
  onSelectInvariant: (id: string) => void;
  remediations: Remediation[];
  onSelectRemediation: (r: Remediation) => void;
}) {
  const ruling = bundle.currentRuling;
  const t = tenSecondSummary(bundle);
  const results = ruling?.invariantResults ?? [];
  const failed = results.filter((r) => r.status === 'FAILED');
  const notEvaluated = results.filter((r) => r.status === 'NOT_EVALUATED' && r.missingEvidence?.length);
  const others = results.filter((r) => !failed.includes(r) && !notEvaluated.includes(r));
  const byAuthority = (list: InvariantResult[]) => ({
    CORE_DISTRIBUTION: list.filter((r) => r.authorityClass === 'CORE_DISTRIBUTION'),
    DOMAIN_PROFILE: list.filter((r) => r.authorityClass === 'DOMAIN_PROFILE'),
    GOVERNANCE_POLICY: list.filter((r) => r.authorityClass === 'GOVERNANCE_POLICY'),
  });
  const grouped = byAuthority(others);

  return (
    <aside aria-label="Decision" className="flex flex-col gap-4" data-testid="decision-rail">
      <Section title="Ruling" id="rail-ruling">
        <div className="flex flex-col gap-2">
          <RulingStatusPill status={bundle.status} size="lg" withMeaning />
          {ruling && (
            <div className="text-[12px] flex flex-col gap-0.5" style={{ color: 'var(--text-muted)' }}>
              <span><Link href={`/rulings/${encodeURIComponent(ruling.rulingId)}`} className="id" style={{ color: 'var(--info)' }}>{ruling.rulingId}</Link> · revision {ruling.revision}</span>
              {ruling.supersedesRulingId && <span>supersedes <span className="id">{ruling.supersedesRulingId}</span></span>}
              {ruling.transitionReason && <span style={{ color: 'var(--text-secondary)' }}>{ruling.transitionReason}</span>}
            </div>
          )}
          {t.requiredAction && (
            <div className="surface-inset p-2 text-[12.5px]" role="status">
              <span className="label-sm" style={{ color: 'var(--accent-strong)' }}>Required action</span>
              <div style={{ color: 'var(--text-primary)' }}>{t.requiredAction}</div>
            </div>
          )}
          {!ruling && <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{STATUS_SEMANTICS[bundle.status].meaning}</p>}
        </div>
      </Section>

      {(failed.length > 0 || notEvaluated.length > 0) && (
        <Section title={failed.length > 0 ? `Failed checks (${failed.length})` : `Blocked checks (${notEvaluated.length})`} id="rail-failed">
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {[...failed, ...notEvaluated].map((r) => (
              <li key={r.invariantId}><InvariantRow result={r} selected={selectedInvariantId === r.invariantId} onSelect={onSelectInvariant} /></li>
            ))}
          </ul>
        </Section>
      )}

      {ruling?.conditions && ruling.conditions.length > 0 && (
        <Section title={`Conditions (${ruling.conditions.length})`} id="rail-conditions">
          <ul className="m-0 pl-0 list-none flex flex-col gap-1">
            {ruling.conditions.map((c) => (
              <li key={c.conditionId} className="surface-inset p-2 text-[12.5px]">
                <span className="id" style={{ color: 'var(--status-conditional)' }}>{c.conditionId}</span>
                {c.attachesTo && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}> · attaches to <span className="id">{c.attachesTo}</span></span>}
                <div style={{ color: 'var(--text-primary)' }}>{c.statement}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Next actions" id="rail-actions">
        {remediations.length === 0 && t.requiredAction === undefined && <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No action required.</p>}
        {remediations.length === 0 && t.requiredAction !== undefined && <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{t.requiredAction}</p>}
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {remediations.map((r) => (
            <li key={r.remediationId}>
              <button type="button" className="btn w-full justify-between" onClick={() => onSelectRemediation(r)} data-remediation-id={r.remediationId}>
                <span className="text-[12.5px]">{r.title}</span>
                <span className="label-sm">{REMEDIATION_LABEL[r.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Use scope" id="rail-use"><UseScopeCard useScope={bundle.useScope} /></Section>
      <Section title="Time basis" id="rail-time"><TemporalBasisPanel temporalBasis={ruling?.temporalBasis ?? bundle.temporalBasis} /></Section>
      <Section title="Profile" id="rail-profile"><ProfileReference profileId={bundle.profileId} version={bundle.profileVersion} registerDigest={ruling?.registerDigest} /></Section>

      <Section title="Corpus" id="rail-corpus">
        <dl className="kv" data-testid="corpus-ref">
          <dt>Corpus</dt>
          <dd><span className="id">{bundle.corpusId}</span></dd>
          <dt>Evaluated against</dt>
          <dd>{ruling ? <><Link href={`/releases/${encodeURIComponent(ruling.corpus.releaseId)}`} className="id" style={{ color: 'var(--info)' }}>{ruling.corpus.releaseId}</Link><div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>build <span className="id">{ruling.corpus.buildId}</span> · known by <span className="ts">{fmtUtc(ruling.corpus.knownAt)}</span></div></> : <span style={{ color: 'var(--text-muted)' }}>Not evaluated</span>}</dd>
          <dt>Current release</dt>
          <dd><Link href={`/releases/${encodeURIComponent(bundle.corpusReleaseId)}`} className="id" style={{ color: 'var(--info)' }}>{bundle.corpusReleaseId}</Link>{ruling && ruling.corpus.releaseId !== bundle.corpusReleaseId && <div className="text-[11.5px]" style={{ color: 'var(--status-superseded)' }}>A newer release exists; the ruling stands on the release it names.</div>}</dd>
        </dl>
      </Section>

      <Section title="Assurance" id="rail-assurance">
        {ruling ? (
          <details className="surface-inset p-2">
            <summary className="flex items-center gap-2"><AssuranceBadge assurance={ruling.assurance} /></summary>
            <div className="mt-2"><AssuranceDetail assurance={ruling.assurance} partyName={(id) => partyName(bundle, id)} /></div>
          </details>
        ) : <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Evaluation has not run. No assurance class applies.</p>}
      </Section>

      {ruling?.release && (
        <Section title="Manifest" id="rail-manifest">
          <dl className="kv">
            <dt>Commitment</dt>
            <dd><Digest value={ruling.release.manifestCommitment} /></dd>
            <dt>Evidence root</dt>
            <dd><Digest value={ruling.release.evidenceRoot} /></dd>
          </dl>
        </Section>
      )}

      {results.length > 0 && (
        <Section title={`All checks (${results.length})`} id="rail-all-checks">
          <details>
            <summary className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Show every check by authority class</summary>
            <div className="mt-2 flex flex-col gap-3">
              {(['CORE_DISTRIBUTION', 'DOMAIN_PROFILE', 'GOVERNANCE_POLICY'] as const).map((a) => {
                const list = [...(byAuthority([...failed, ...notEvaluated])[a]), ...grouped[a]];
                if (list.length === 0) return null;
                return (
                  <div key={a} className="flex flex-col gap-1">
                    <span className="label-sm">{a === 'CORE_DISTRIBUTION' ? 'Core distribution' : a === 'DOMAIN_PROFILE' ? 'Domain profile' : 'Governance policy'}</span>
                    <ul className="m-0 p-0 list-none flex flex-col gap-1">
                      {list.map((r) => <li key={r.invariantId}><InvariantRow result={r} selected={selectedInvariantId === r.invariantId} onSelect={onSelectInvariant} /></li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </details>
        </Section>
      )}
    </aside>
  );
}
