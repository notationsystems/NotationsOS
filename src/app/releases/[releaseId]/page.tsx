import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCorpusSource } from '@/adapter/corpusSource';
import { deliverableRecords, recordStatusAt, releaseRetractions } from '@/domain/corpus';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { Section } from '@/components/primitives/Section';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { RecordStatusPill } from '@/components/corpus/RecordCard';
import { fmtNumber, fmtUtc, humanize } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ releaseId: string }> }): Promise<Metadata> {
  const { releaseId } = await params;
  return { title: `Release · ${decodeURIComponent(releaseId)}` };
}

export default async function ReleasePage({ params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const hit = await getCorpusSource().getRelease(decodeURIComponent(releaseId));
  if (!hit) notFound();
  const { corpus, release } = hit;
  const delivered = deliverableRecords(corpus, release, 'COUNTERPARTY_SHARED');
  const retractions = releaseRetractions(corpus, release);
  return (
    <>
      <FixtureBanner note={release.note} />
      <div className="p-3 sm:p-5 max-w-[1300px] mx-auto w-full flex flex-col gap-5">
        <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: 'var(--text-muted)' }}><Link href="/releases">Releases</Link> <span aria-hidden="true">/</span> <span className="id">{release.releaseId}</span></nav>
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Corpus release</span>
            <span className="id" style={{ color: 'var(--text-secondary)' }}>{release.releaseId}</span>
            <span className="pill text-[10.5px] px-1.5" style={{ color: release.status === 'CURRENT' ? 'var(--status-admitted)' : 'var(--status-superseded)', borderColor: 'currentColor' }}>{release.status === 'CURRENT' ? '● Current' : '↷ Superseded'}</span>
          </div>
          <h1 className="m-0 text-[20px] font-semibold" style={{ color: 'var(--text-heading)' }}>{release.corpusTitle}</h1>
          <dl className="grid gap-x-6 gap-y-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 m-0 surface p-4">
            <div><dt className="label-sm">Information known by</dt><dd className="m-0 ts text-[14px]" style={{ color: 'var(--text-heading)' }} data-clock="knownAt">{fmtUtc(release.knownAt)}</dd><dd className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Every record knowable by this instant is in the release.</dd></div>
            <div><dt className="label-sm">Build</dt><dd className="m-0 id">{release.build.buildId}</dd><dd className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>built <span className="ts">{fmtUtc(release.build.builtAt)}</span> · {release.build.deterministic ? 'deterministic' : 'non-deterministic'}</dd></div>
            <div><dt className="label-sm">Methodology</dt><dd className="m-0"><span className="id">{release.build.methodology.methodologyId}</span> <span className="ver">{release.build.methodology.version}</span></dd><dd className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>status {release.build.methodology.status}</dd></div>
            <div><dt className="label-sm">Release digest</dt><dd className="m-0"><Digest value={release.releaseDigest} /></dd><dd className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>sha256 over the canonical record set</dd></div>
          </dl>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{release.coverage}</p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            {release.supersedesReleaseId && <>Supersedes <Link href={`/releases/${encodeURIComponent(release.supersedesReleaseId)}`} className="id" style={{ color: 'var(--info)' }}>{release.supersedesReleaseId}</Link>. </>}
            {release.supersededByReleaseId && <>Superseded by <Link href={`/releases/${encodeURIComponent(release.supersededByReleaseId)}`} className="id" style={{ color: 'var(--info)' }}>{release.supersededByReleaseId}</Link>. </>}
            Feed: <Link href={`/api/v1/releases/${encodeURIComponent(release.releaseId)}`} className="id" style={{ color: 'var(--info)' }}>/api/v1/releases/{release.releaseId}</Link> · <Link href={`/api/v1/releases/${encodeURIComponent(release.releaseId)}/records`} className="id" style={{ color: 'var(--info)' }}>…/records</Link> · <Link href={`/stream?release=${encodeURIComponent(release.releaseId)}`} style={{ color: 'var(--info)' }}>query as-of</Link>
          </p>
        </header>

        <Section title="Build inputs" id="rl-inputs">
          <table className="ledger-table text-[12.5px]"><thead><tr><th scope="col">Input</th><th scope="col">sha256</th></tr></thead>
            <tbody>{release.build.inputDigests.map((i) => <tr key={i.label}><td>{i.label}</td><td><Digest value={i.sha256} copy={false} /></td></tr>)}</tbody></table>
        </Section>

        <Section title={`Sources and rights (${release.sources.length})`} id="rl-rights">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The intelligence-rights schedule. A use not listed is not permitted; the feed applies this before visibility.</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12.5px]" aria-label="Rights schedule">
              <thead><tr><th scope="col">Source</th><th scope="col">Licence</th><th scope="col">Permitted uses</th><th scope="col">Non-use</th><th scope="col">Redistribution</th><th scope="col">Attribution</th></tr></thead>
              <tbody>
                {release.sources.map((s) => (
                  <tr key={s.sourceId}>
                    <td><span className="id">{s.sourceId}</span><div style={{ color: 'var(--text-secondary)' }}>{s.sourceName}</div></td>
                    <td>{s.licence}</td>
                    <td>{s.permittedUses.map(humanize).join(', ')}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.nonUse.join('; ')}</td>
                    <td className="mono">{s.redistribution}</td>
                    <td>{s.attributionRequired ? 'Required' : 'Not required'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={`Records deliverable to named counterparties (${delivered.records.length})`} id="rl-records">
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} role="status">{delivered.withheldByRights} withheld under the rights schedule · {delivered.withheldByVisibility} withheld by visibility. Counts only.</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12.5px]" aria-label="Records">
              <thead><tr><th scope="col">Record</th><th scope="col">Subject</th><th scope="col">Predicate</th><th scope="col">Value</th><th scope="col">Bounds</th><th scope="col">World state valid from</th><th scope="col">Information known by</th><th scope="col">Evidence class</th><th scope="col">Status in this release</th></tr></thead>
              <tbody>
                {delivered.records.map((r) => (
                  <tr key={r.recordId} data-record-id={r.recordId}>
                    <td><Link href={`/stream?release=${encodeURIComponent(release.releaseId)}&subject=${encodeURIComponent(r.subjectId)}&predicate=${encodeURIComponent(r.predicate)}&validAt=${encodeURIComponent(r.validFrom)}&knownAt=${encodeURIComponent(release.knownAt)}`} className="id" style={{ color: 'var(--info)' }}>{r.recordId}</Link></td>
                    <td><span className="id">{r.subjectId}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.subjectType}</div></td>
                    <td className="id">{r.predicate}</td>
                    <td className="mono">{fmtNumber(r.value)} {r.unit ?? ''}<div className="text-[11px] font-sans" style={{ color: 'var(--text-muted)' }}>{r.basis}</div></td>
                    <td className="mono">{r.uncertainty && (r.uncertainty.low !== undefined || r.uncertainty.high !== undefined) ? `[${r.uncertainty.low ?? '−∞'}, ${r.uncertainty.high ?? '+∞'}]` : <span className="font-sans" style={{ color: 'var(--text-muted)' }}>{r.uncertainty?.semantics ?? 'none'}</span>}</td>
                    <td className="ts">{fmtUtc(r.validFrom)}</td>
                    <td className="ts">{fmtUtc(r.knownAt)}</td>
                    <td><EvidenceClassBadge evidenceClass={r.evidenceClass} compact /></td>
                    <td><RecordStatusPill status={recordStatusAt(corpus, r, release.knownAt)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={`Retractions knowable in this release (${retractions.length})`} id="rl-retractions">
          {retractions.length === 0 && <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>None issued by this release&apos;s cutoff.</p>}
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {retractions.map((t) => (
              <li key={t.retractionId} className="surface p-3 text-[12.5px]">
                <span className="id" style={{ color: t.kind === 'WITHDRAWAL' ? 'var(--status-revoked)' : 'var(--status-superseded)' }}>{t.retractionId}</span> <span className="label-sm">{t.kind.toLowerCase()}</span> · issued <span className="ts">{fmtUtc(t.issuedAt)}</span>
                <div style={{ color: 'var(--text-secondary)' }}>{t.reason}</div>
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Affects {t.affectedRecordIds.join(', ')}{t.replacementRecordIds?.length ? ` · replaced by ${t.replacementRecordIds.join(', ')}` : ''}{t.affectedRulingIds?.length ? ` · rulings ${t.affectedRulingIds.join(', ')}` : ''}</div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
