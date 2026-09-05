import Link from 'next/link';
import type { ClaimCaseBundle, EvidenceArtifact } from '@/domain/types';
import { partyName } from '@/domain/selectors';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { fmtUtc, humanize } from '@/lib/format';

export function EvidenceRow({ evidence, bundle, selected, highlighted, onSelect }: { evidence: EvidenceArtifact; bundle: ClaimCaseBundle; selected: boolean; highlighted: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(evidence.evidenceId)}
      aria-pressed={selected}
      data-highlighted={highlighted || undefined}
      data-evidence-id={evidence.evidenceId}
      className={`w-full text-left flex flex-col gap-0.5 px-2 py-1.5 rounded-[var(--radius-md)] border ${highlighted ? 'is-highlighted' : ''}`}
      style={{ borderColor: selected ? 'var(--border-accent)' : 'var(--border-subtle)' }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{evidence.title}</span>
        {highlighted && <span className="label-sm shrink-0" style={{ color: 'var(--accent-strong)' }}>inspected</span>}
      </span>
      <span className="text-[11px] flex flex-wrap gap-x-2" style={{ color: 'var(--text-muted)' }}>
        <span>{humanize(evidence.kind)}</span>
        <span>· {partyName(bundle, evidence.producerId)}</span>
        <span>· known <span className="ts">{fmtUtc(evidence.knownAt)}</span></span>
      </span>
    </button>
  );
}

/** Central workspace view of one artifact: what it declares, what was extracted, its class, its identity, its clocks. */
export function EvidenceDetail({ evidence, bundle, highlighted }: { evidence: EvidenceArtifact; bundle: ClaimCaseBundle; highlighted: boolean }) {
  const supersedes = evidence.supersedesEvidenceId ? bundle.evidence.find((e) => e.evidenceId === evidence.supersedesEvidenceId) : undefined;
  const supersededBy = bundle.evidence.find((e) => e.supersedesEvidenceId === evidence.evidenceId);
  const usedByClaims = bundle.claims.filter((c) => c.evidenceIds.includes(evidence.evidenceId));
  return (
    <article className="flex flex-col gap-3" aria-label={`Evidence ${evidence.evidenceId}`} data-testid="evidence-detail">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Source artifact</span>
            <span className="id" style={{ color: 'var(--text-secondary)' }}>{evidence.evidenceId}</span>
            <VisibilityBadge visibility={evidence.visibility} />
            {highlighted && <span className="label-sm" style={{ color: 'var(--accent-strong)' }}>inspected by selected check</span>}
          </div>
          <h3 className="m-0 mt-1 text-[16px] font-semibold" style={{ color: 'var(--text-heading)' }}>{evidence.title}</h3>
          <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{humanize(evidence.kind)} · produced by {partyName(bundle, evidence.producerId)}</div>
        </div>
        <EvidenceClassBadge evidenceClass={evidence.evidenceClass} />
      </header>

      {evidence.note && <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{evidence.note}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Declared identifiers" className="surface-inset p-3">
          <h4 className="label m-0 mb-2">Declared identifiers</h4>
          {evidence.declaredIdentifiers && Object.keys(evidence.declaredIdentifiers).length > 0 ? (
            <dl className="kv">
              {Object.entries(evidence.declaredIdentifiers).map(([k, v]) => (
                <div key={k} className="contents"><dt>{humanize(k)}</dt><dd className="id">{v}</dd></div>
              ))}
            </dl>
          ) : <span style={{ color: 'var(--text-muted)' }}>None declared</span>}
        </section>
        <section aria-label="Extracted fields" className="surface-inset p-3">
          <h4 className="label m-0 mb-2">Source context (extracted)</h4>
          {evidence.extracted && evidence.extracted.length > 0 ? (
            <table className="ledger-table text-[12.5px]">
              <thead><tr><th scope="col">Field</th><th scope="col">Value</th><th scope="col">Basis</th></tr></thead>
              <tbody>
                {evidence.extracted.map((x) => (
                  <tr key={x.field}>
                    <td>{x.field}</td>
                    <td className="mono">{x.value}{x.unit && <span className="unit" style={{ color: 'var(--text-secondary)' }}> {x.unit}</span>}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{x.basis ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <span style={{ color: 'var(--text-muted)' }}>No fields extracted</span>}
        </section>
      </div>

      <dl className="kv">
        <dt>Content hash</dt>
        <dd><Digest value={evidence.contentHash} /></dd>
        {evidence.capture && (
          <>
            <dt>Capture</dt>
            <dd className="flex flex-col gap-0.5 text-[12px]" data-testid="evidence-capture">
              <span><span className="id">{evidence.capture.evidence.schema}</span> · <span className="id">{evidence.capture.evidence.contentDigest.slice(0, 15)}…</span> · {evidence.capture.evidence.byteLength} bytes · <span className="id">{evidence.capture.evidence.mediaType}</span></span>
              <span>Storage key <span className="id">{evidence.capture.evidence.storageKey}</span></span>
              <span>Receipt <span className="id">{evidence.capture.receipt.receiptId}</span> · stored <span className="ts">{fmtUtc(evidence.capture.receipt.storedAt)}</span></span>
              <span>Source <span className="id">{evidence.capture.evidence.sourceId}</span> · source truth claimed: <span className="mono">false</span></span>
            </dd>
          </>
        )}
        <dt>Canonical id</dt>
        <dd><span className="id">{evidence.canonicalId ?? 'Not assigned'}</span></dd>
        <dt>Captured by producer</dt>
        <dd className="ts">{fmtUtc(evidence.capturedAt)}</dd>
        <dt>World state valid on</dt>
        <dd className="ts">{fmtUtc(evidence.validAt)}</dd>
        <dt>Information known by</dt>
        <dd className="ts">{fmtUtc(evidence.knownAt)}</dd>
        <dt>Media type</dt>
        <dd className="mono text-[12px]">{evidence.mimeType ?? 'Not recorded'}</dd>
        {supersedes && (<><dt>Supersedes</dt><dd><span className="id">{supersedes.evidenceId}</span> — {supersedes.title}</dd></>)}
        {supersededBy && (<><dt>Superseded by</dt><dd><span className="id">{supersededBy.evidenceId}</span> — {supersededBy.title}</dd></>)}
        <dt>Corpus records</dt>
        <dd className="flex flex-wrap gap-1">{evidence.recordIds?.length ? evidence.recordIds.map((id) => <Link key={id} href={`/stream?record=${encodeURIComponent(id)}&release=${encodeURIComponent(bundle.corpusReleaseId)}`} className="id" style={{ color: 'var(--info)' }}>{id}</Link>) : <span style={{ color: 'var(--text-muted)' }}>None extracted into the corpus</span>}</dd>
        <dt>Supports claims</dt>
        <dd className="flex flex-wrap gap-1">{usedByClaims.length ? usedByClaims.map((c) => <span key={c.claimId} className="id">{c.claimId}</span>) : <span style={{ color: 'var(--text-muted)' }}>None</span>}</dd>
      </dl>
    </article>
  );
}
