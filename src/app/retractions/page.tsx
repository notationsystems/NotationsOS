import type { Metadata } from 'next';
import Link from 'next/link';
import { getCorpusSource } from '@/adapter/corpusSource';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { AS_OF_CONTRACT, DELIVERY_LEDGER, TAINT_LABEL, TRACEABILITY_LABEL, correctionImpact } from '@/domain/correction';
import { fmtUtc } from '@/lib/format';

export const metadata: Metadata = { title: 'Retractions' };

/** The push-retraction feed: what changed, what it affects, what replaces it. */
export default async function RetractionsPage({ searchParams }: { searchParams: Promise<{ since?: string }> }) {
  const { since } = await searchParams;
  const source = getCorpusSource();
  const list = await source.retractions(since || undefined, 'COUNTERPARTY_SHARED');
  const corpora = await source.listCorpora();
  const recordTitle = (id: string) => corpora.flatMap((c) => c.records).find((r) => r.recordId === id);
  // The blast radius per retraction, computed over what the corpus records. A class it cannot decide is named, not hidden.
  const impactOf = (retractionId: string) => {
    const corpus = corpora.find((c) => c.retractions.some((t) => t.retractionId === retractionId));
    const retraction = corpus?.retractions.find((t) => t.retractionId === retractionId);
    return corpus && retraction ? correctionImpact(corpus, retraction) : null;
  };
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1100px] mx-auto w-full flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Retractions</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>When a fact changes, everyone downstream is told. A correction names the replacement record; a withdrawal names what must no longer be relied on, including the rulings the corpus knows relied on it. Nothing is edited in place.</p>
          <form className="flex items-end gap-2 flex-wrap" method="get">
            <label className="flex flex-col gap-1"><span className="label-sm">Issued after (UTC)</span><input name="since" type="text" defaultValue={since ?? ''} placeholder="2026-08-26T00:00:00Z" className="surface-inset px-2 py-1 mono text-[12.5px]" /></label>
            <button type="submit" className="btn btn-sm">Filter</button>
            <Link href={`/api/v1/retractions${since ? `?since=${encodeURIComponent(since)}` : ''}`} className="btn btn-sm" style={{ color: 'var(--info)' }}>Same query as JSON</Link>
          </form>
        </header>
        <ol className="m-0 p-0 list-none flex flex-col gap-2" aria-label="Retraction feed">
          {list.length === 0 && <li className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No retractions {since ? `issued after ${since}` : 'recorded'}.</li>}
          {list.map((t) => (
            <li key={t.retractionId} className="surface p-3 flex flex-col gap-1" data-retraction-id={t.retractionId}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="id" style={{ color: t.kind === 'WITHDRAWAL' ? 'var(--status-revoked)' : 'var(--status-superseded)' }}>{t.retractionId}</span>
                <span className="pill text-[10.5px] px-1.5" style={{ color: t.kind === 'WITHDRAWAL' ? 'var(--status-revoked)' : 'var(--status-superseded)', borderColor: 'currentColor' }}>{t.kind === 'WITHDRAWAL' ? '⊗ Withdrawal' : '↷ Correction'}</span>
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>issued <span className="ts">{fmtUtc(t.issuedAt)}</span> against <Link href={`/releases/${encodeURIComponent(t.releaseId)}`} className="id" style={{ color: 'var(--info)' }}>{t.releaseId}</Link></span>
              </div>
              <p className="m-0 text-[13px]">{t.reason}</p>
              <dl className="kv text-[12.5px]">
                <dt>Affected records</dt>
                <dd className="flex flex-col gap-0.5">{t.affectedRecordIds.map((id) => { const r = recordTitle(id); return <span key={id}><span className="id">{id}</span>{r && <span style={{ color: 'var(--text-muted)' }}> — {r.subjectId} {r.predicate} = {String(r.value)} {r.unit ?? ''}</span>}</span>; })}</dd>
                <dt>Replacement</dt>
                <dd className="flex flex-col gap-0.5">{t.replacementRecordIds?.length ? t.replacementRecordIds.map((id) => { const r = recordTitle(id); return <span key={id}><span className="id">{id}</span>{r && <span style={{ color: 'var(--text-muted)' }}> — {r.subjectId} {r.predicate} = {String(r.value)} {r.unit ?? ''}</span>}</span>; }) : <span style={{ color: 'var(--text-muted)' }}>None. Withdrawn without replacement.</span>}</dd>
                <dt>Affected rulings</dt>
                <dd className="flex flex-wrap gap-1">{t.affectedRulingIds?.length ? t.affectedRulingIds.map((id) => <Link key={id} href={`/rulings/${encodeURIComponent(id)}`} className="id" style={{ color: 'var(--info)' }}>{id}</Link>) : <span style={{ color: 'var(--text-muted)' }}>None known</span>}</dd>
                {t.sourceId && (<><dt>Source</dt><dd className="id">{t.sourceId}</dd></>)}
              </dl>
              {(() => {
                const impact = impactOf(t.retractionId);
                if (!impact) return null;
                return (
                  <details className="mt-2">
                    <summary className="text-[12.5px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>What this correction reaches, and what it cannot reach ({impact.undetermined.length} of {impact.classes.length} undecidable)</summary>
                    <div className="surface overflow-x-auto mt-2" tabIndex={0}>
                      <table className="ledger-table text-[12px]" aria-label={`Downstream impact of ${t.retractionId}`}>
                        <thead><tr><th scope="col">Derived artifact</th><th scope="col">State</th><th scope="col">Named</th><th scope="col">Because</th></tr></thead>
                        <tbody>
                          {impact.classes.map((c) => (
                            <tr key={c.id} data-impact={c.id} data-taint={c.taint}>
                              <td style={{ color: 'var(--text-heading)' }}>{c.title}</td>
                              <td style={{ color: c.taint === 'TAINTED' ? 'var(--status-refused)' : c.taint === 'UNDETERMINED' ? 'var(--status-conditional)' : 'var(--check-passed)' }}>{TAINT_LABEL[c.taint]}</td>
                              <td className="id">{c.identifiers.length ? c.identifiers.join(', ') : '—'}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{c.because} <span style={{ color: 'var(--text-secondary)' }}>{TRACEABILITY_LABEL[c.traceability]}.</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })()}
            </li>
          ))}
        </ol>
        <section className="surface p-3 flex flex-col gap-2" aria-labelledby="recall-machinery" data-testid="recall-machinery">
          <h2 id="recall-machinery" className="m-0 text-[14px] font-semibold" style={{ color: 'var(--text-heading)' }}>Correction and recall, as machinery</h2>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{AS_OF_CONTRACT.statement}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="label-sm">What the corpus does</span>
              <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>{AS_OF_CONTRACT.present.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label-sm">What it cannot do yet</span>
              <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--status-conditional)' }} data-testid="recall-absent">{AS_OF_CONTRACT.absent.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          </div>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="delivery-ledger"><span className="label-sm">Delivery ledger</span> {DELIVERY_LEDGER.purpose} It is specified and empty: {DELIVERY_LEDGER.why} {DELIVERY_LEDGER.obligation}</p>
        </section>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Automate against this feed: poll <span className="id">GET /api/v1/retractions?since=&lt;the knownAt of the release you hold&gt;</span> and act on each retraction&apos;s affected record and ruling identifiers.</p>
      </div>
    </>
  );
}
