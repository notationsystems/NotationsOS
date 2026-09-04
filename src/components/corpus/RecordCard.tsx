import Link from 'next/link';
import type { CorpusRecord, RecordStatus, RightsSchedule } from '@/domain/corpus';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { fmtNumber, fmtUtc, humanize } from '@/lib/format';

export const RECORD_STATUS: Record<RecordStatus, { label: string; cssVar: string; glyph: string; meaning: string }> = {
  CURRENT: { label: 'Current', cssVar: '--status-admitted', glyph: '●', meaning: 'The newest knowable record for this subject and predicate at the knowledge time.' },
  SUPERSEDED: { label: 'Superseded', cssVar: '--status-superseded', glyph: '↷', meaning: 'A later record corrected this one. It remains inspectable.' },
  RETRACTED: { label: 'Retracted', cssVar: '--status-revoked', glyph: '⊗', meaning: 'Withdrawn by a retraction. It remains inspectable; it must not be relied on.' },
};

export function RecordStatusPill({ status }: { status: RecordStatus }) {
  const s = RECORD_STATUS[status];
  return (
    <span className="pill" style={{ color: `var(${s.cssVar})`, borderColor: `var(${s.cssVar})` }} title={s.meaning} data-record-status={status}>
      <span aria-hidden="true">{s.glyph}</span> {s.label}
    </span>
  );
}

/** One record, in full: the value with its bounds, both clocks, provenance, class, rights and identity. */
export function RecordCard({ record, status, rights, compact = false }: { record: CorpusRecord; status?: RecordStatus; rights?: RightsSchedule; compact?: boolean }) {
  const u = record.uncertainty;
  return (
    <article className="surface p-3 flex flex-col gap-2" aria-label={`Record ${record.recordId}`} data-record-id={record.recordId}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="id" style={{ color: 'var(--text-secondary)' }}>{record.recordId}</span>
            <span className="id" style={{ color: 'var(--text-muted)' }}>{record.predicate}</span>
            {status && <RecordStatusPill status={status} />}
            <VisibilityBadge visibility={record.visibility} />
          </div>
          <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{record.title} · {record.subjectType} <span className="id">{record.subjectId}</span></div>
        </div>
        <div className="text-right">
          <div className="mono text-[20px] leading-tight" style={{ color: 'var(--text-heading)' }}>{fmtNumber(record.value)}{record.unit && <span className="unit text-[13px] ml-1" style={{ color: 'var(--text-secondary)' }}>{record.unit}</span>}</div>
          {u && (u.low !== undefined || u.high !== undefined) && <div className="mono text-[12px]" style={{ color: 'var(--text-secondary)' }}>[{u.low ?? '−∞'}, {u.high ?? '+∞'}] {record.unit ?? ''}</div>}
          {record.basis && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{record.basis}</div>}
        </div>
      </header>
      {!compact && (
        <dl className="kv text-[12.5px]">
          <dt>Uncertainty</dt>
          <dd>{u ? <>{u.low !== undefined || u.high !== undefined ? <span className="mono">[{u.low ?? '−∞'}, {u.high ?? '+∞'}]</span> : <span style={{ color: 'var(--text-muted)' }}>No bound stated</span>} — {u.semantics}{u.method && <> · {u.method}</>}</> : <span style={{ color: 'var(--text-muted)' }}>Not supplied</span>}</dd>
          <dt>World state valid</dt>
          <dd className="ts" data-clock="validAt">{fmtUtc(record.validFrom)} → {record.validTo ? fmtUtc(record.validTo) : 'open'}</dd>
          <dt>Information known by</dt>
          <dd className="ts" data-clock="knownAt">{fmtUtc(record.knownAt)}</dd>
          {record.observedAt && (<><dt>Observed at source</dt><dd className="ts">{fmtUtc(record.observedAt)}</dd></>)}
          <dt>Evidence class</dt>
          <dd><EvidenceClassBadge evidenceClass={record.evidenceClass} /></dd>
          <dt>Provenance</dt>
          <dd className="flex flex-col gap-0.5">
            <span>Source <span className="id">{record.provenance.sourceId}</span>{rights && <> — {rights.sourceName}</>}</span>
            {record.provenance.artifactId && <span>Artifact <span className="id">{record.provenance.artifactId}</span> · <Digest value={record.provenance.contentHash} copy={false} /></span>}
            {record.provenance.transformId && <span>Transform <span className="id">{record.provenance.transformId}</span></span>}
          </dd>
          <dt>Rights</dt>
          <dd>{rights ? <span>{rights.licence} · permitted: {rights.permittedUses.map(humanize).join(', ')} · redistribution {rights.redistribution.replace('_', ' ')}{rights.attributionRequired && ' · attribution required'}{rights.nonUse.length > 0 && <span style={{ color: 'var(--text-muted)' }}> · {rights.nonUse.join('; ')}</span>}</span> : <span style={{ color: 'var(--text-muted)' }}>Not in release schedule</span>}</dd>
          <dt>Identity</dt>
          <dd className="flex flex-col gap-0.5"><span className="id">{record.canonicalId}</span><span className="id" style={{ color: 'var(--text-muted)' }}>{record.subjectCanonicalId}</span></dd>
          <dt>History</dt>
          <dd className="flex flex-col gap-0.5">
            <span>First in release <Link href={`/releases/${encodeURIComponent(record.firstReleaseId)}`} className="id" style={{ color: 'var(--info)' }}>{record.firstReleaseId}</Link></span>
            {record.supersedesRecordId && <span>Supersedes <span className="id">{record.supersedesRecordId}</span></span>}
            {record.supersededByRecordId && <span style={{ color: 'var(--status-superseded)' }}>Superseded by <span className="id">{record.supersededByRecordId}</span></span>}
            {record.retractedByRetractionId && <span style={{ color: 'var(--status-revoked)' }}>Retracted by <Link href="/retractions" className="id" style={{ color: 'var(--status-revoked)' }}>{record.retractedByRetractionId}</Link></span>}
          </dd>
        </dl>
      )}
    </article>
  );
}
