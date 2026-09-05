import type { Metadata } from 'next';
import Link from 'next/link';
import { getCorpusSource } from '@/adapter/corpusSource';
import { releaseRecords, releaseRetractions } from '@/domain/corpus';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { fmtUtc } from '@/lib/format';

export const metadata: Metadata = { title: 'Releases' };

/** The product: corpora and their release history. */
export default async function ReleasesPage() {
  const source = getCorpusSource();
  const corpora = await source.listCorpora();
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={`${source.origin.label}. Fixture clock: 2026-09-01 12:00 UTC.`} />}
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
        {corpora.map((corpus) => {
          const releases = [...corpus.releases].sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1));
          return (
            <section key={corpus.corpusId} aria-labelledby={`corpus-${corpus.corpusId}`} className="flex flex-col gap-3">
              <header className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">Corpus</span><span className="id" style={{ color: 'var(--text-secondary)' }}>{corpus.corpusId}</span><span className="label-sm">{corpus.domain}</span></div>
                <h1 id={`corpus-${corpus.corpusId}`} className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>{corpus.title}</h1>
                <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{corpus.description}</p>
                <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {corpus.records.length} records · {corpus.retractions.length} retractions · {corpus.releases.length} releases · feed <Link href={`/api/v1/releases?corpus=${encodeURIComponent(corpus.corpusId)}`} className="id" style={{ color: 'var(--info)' }}>/api/v1/releases</Link> · <Link href="/stream" style={{ color: 'var(--info)' }}>query as-of</Link> · <Link href="/retractions" style={{ color: 'var(--info)' }}>retraction feed</Link>
                </p>
              </header>
              <div className="surface overflow-x-auto" tabIndex={0}>
                <table className="ledger-table" aria-label={`Releases of ${corpus.corpusId}`}>
                  <thead><tr><th scope="col">Release</th><th scope="col">Status</th><th scope="col">Information known by</th><th scope="col">Build</th><th scope="col">Records</th><th scope="col">Retractions</th><th scope="col">Certification</th><th scope="col">Release digest</th><th scope="col">Supersedes</th></tr></thead>
                  <tbody>
                    {releases.map((r) => (
                      <tr key={r.releaseId} data-release-id={r.releaseId}>
                        <td><Link href={`/releases/${encodeURIComponent(r.releaseId)}`} className="id" style={{ color: 'var(--info)' }}>{r.releaseId}</Link><div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{r.coverage}</div></td>
                        <td><span className="pill text-[10.5px] px-1.5" style={{ color: r.status === 'CURRENT' ? 'var(--status-admitted)' : 'var(--status-superseded)', borderColor: 'currentColor' }}>{r.status === 'CURRENT' ? '● Current' : '↷ Superseded'}</span></td>
                        <td className="ts" data-clock="knownAt">{fmtUtc(r.knownAt)}</td>
                        <td><span className="id">{r.build.buildId}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.build.methodology.methodologyId} {r.build.methodology.version} · {r.build.methodology.status}</div></td>
                        <td className="mono">{releaseRecords(corpus, r).length}</td>
                        <td className="mono">{releaseRetractions(corpus, r).length}</td>
                        <td><span style={{ color: r.certification.status === 'CERTIFIED' ? 'var(--status-admitted)' : r.certification.status === 'CANDIDATE' ? 'var(--status-pending)' : 'var(--status-revoked)' }}>{r.certification.status === 'CERTIFIED' ? '◉ Certified' : r.certification.status === 'CANDIDATE' ? '◌ Candidate' : '⊗ Withdrawn'}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.certification.verification.replace('_', ' ')}</div></td>
                        <td><Digest value={r.releaseDigest} copy={false} /></td>
                        <td className="id">{r.supersedesReleaseId ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        <section aria-label="What a release is" className="surface-inset p-3 text-[12.5px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
          <p className="m-0">A release is governed, time-bounded information inventory: every record knowable by its cutoff, with value, unit, basis, uncertainty bounds, validity bounds, both clocks, provenance, evidence class, rights and a stable identity. A later release never edits an earlier one; corrections and withdrawals arrive as retractions, and the earlier release still shows what it said.</p>
          <p className="m-0" style={{ color: 'var(--text-muted)' }}>A customer applies their own inference to the feed. The ruling workbench under Inquiry is one optional application over the same releases. The operating model is stated at <Link href="/product" style={{ color: 'var(--info)' }}>Notation Systems · product model</Link>.</p>
        </section>
      </div>
    </>
  );
}
