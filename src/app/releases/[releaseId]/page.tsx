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
import { RightsMatrix } from '@/components/corpus/RightsMatrix';
import { ProductionRecord } from '@/components/corpus/ProductionRecord';
import { CopyButton } from '@/components/primitives/CopyButton';
import { buildReleaseManifest } from '@/fixtures/releaseManifest';
import { fmtNumber, fmtUtc } from '@/lib/format';

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
  const manifest = buildReleaseManifest(corpus, release);
  const manifestText = JSON.stringify(manifest, null, 2);
  const cert = release.certification;
  const certColor = cert.status === 'CERTIFIED' ? 'var(--status-admitted)' : cert.status === 'CANDIDATE' ? 'var(--status-pending)' : 'var(--status-revoked)';
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

        <Section title="Certification" id="rl-cert">
          <div className="surface p-3 flex flex-col gap-2" data-testid="certification">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="pill pill-lg" style={{ color: certColor, borderColor: certColor }} data-certification={cert.status}><span aria-hidden="true">{cert.status === 'CERTIFIED' ? '◉' : cert.status === 'CANDIDATE' ? '◌' : '⊗'}</span> {cert.status === 'CERTIFIED' ? 'Certified release' : cert.status === 'CANDIDATE' ? 'Candidate release' : 'Certification withdrawn'}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>verification: <span className="mono">{cert.verification.replace('_', ' ')}</span>{cert.certifiedAt && <> · certified <span className="ts">{fmtUtc(cert.certifiedAt)}</span></>}</span>
            </div>
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{cert.basis}</p>
            <dl className="kv">
              <dt>Manifest commitment</dt><dd><Digest value={cert.manifestCommitment} /></dd>
              <dt>Manifest</dt><dd><Link href={`/api/v1/releases/${encodeURIComponent(release.releaseId)}/manifest`} className="id" style={{ color: 'var(--info)' }}>GET /api/v1/releases/{release.releaseId}/manifest</Link></dd>
            </dl>
            <details>
              <summary className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Certified release manifest ({manifest.schema})</summary>
              <div className="mt-2 flex items-center justify-end"><CopyButton value={manifestText} label="Copy JSON" /></div>
              <pre tabIndex={0} className="m-0 mt-1 surface-inset p-2 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)', maxHeight: 360 }}>{manifestText}</pre>
              <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>The commitment above is the sha256 of this manifest in canonical JSON. A release manifest contract does not yet exist upstream; the schema id says so.</p>
            </details>
          </div>
        </Section>

        <Section title="Production record" id="rl-production">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The shared production system as it ran for this build. Stages that did not run say so.</p>
          <ProductionRecord build={release.build} />
        </Section>

        <Section title="Build inputs" id="rl-inputs">
          <table className="ledger-table text-[12.5px]"><thead><tr><th scope="col">Input</th><th scope="col">sha256</th></tr></thead>
            <tbody>{release.build.inputDigests.map((i) => <tr key={i.label}><td>{i.label}</td><td><Digest value={i.sha256} copy={false} /></td></tr>)}</tbody></table>
        </Section>

        <Section title={`Authorized sources and the intelligence-rights schedule (${release.sources.length})`} id="rl-rights">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>For every source, whether the material may be used for each purpose. A use not listed is prohibited. The feed enforces customer delivery before visibility; the rest is recorded as policy.</p>
          <RightsMatrix sources={release.sources} at={release.knownAt} />
          <details className="surface-inset p-2">
            <summary className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Source registrations of record (data-os SourceRegistration)</summary>
            <div className="overflow-x-auto mt-2" tabIndex={0}>
              <table className="ledger-table text-[12px]" aria-label="Source registrations">
                <thead><tr><th scope="col">Registration</th><th scope="col">Source class</th><th scope="col">Policy</th><th scope="col">Effective</th><th scope="col">Permitted purposes</th><th scope="col">Prohibited purposes</th><th scope="col">Operations</th><th scope="col">Audiences</th><th scope="col">Retention</th></tr></thead>
                <tbody>
                  {release.sources.map((s) => (
                    <tr key={s.sourceId} data-registration-id={s.registration.registrationId}>
                      <td><span className="id">{s.registration.registrationId}</span><div className="id" style={{ color: 'var(--text-muted)' }}>{s.canonicalId}</div></td>
                      <td className="id">{s.registration.sourceClass}</td>
                      <td><span className="id">{s.registration.licenseId}</span><div className="ver" style={{ color: 'var(--text-muted)' }}>v{s.registration.policyVersion}</div></td>
                      <td className="ts">{fmtUtc(s.registration.effectiveFrom)} → {s.registration.effectiveUntil ? fmtUtc(s.registration.effectiveUntil) : 'open'}</td>
                      <td className="id">{s.registration.permittedPurposes.join(', ')}</td>
                      <td className="id" style={{ color: 'var(--text-muted)' }}>{(s.registration.prohibitedPurposes ?? []).join(', ') || '—'}</td>
                      <td className="id">{s.registration.allowedOperations.join(', ')}{s.registration.approvalRequiredOperations?.length ? <div style={{ color: 'var(--status-conditional)' }}>approval: {s.registration.approvalRequiredOperations.join(', ')}</div> : null}</td>
                      <td className="id">{s.registration.allowedAudiences.join(', ')}</td>
                      <td className="id">{s.registration.retention.mode}{s.registration.retention.until ? ` ${s.registration.retention.until}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 mt-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Policy evaluation only: a decision is never a claim that the source is true. Every artifact captured from these sources is bound to its bytes by a data-os BinaryEvidence record and StorageReceipt with <span className="id">sourceTruthClaimed: false</span>.</p>
          </details>
          <details className="surface-inset p-2">
            <summary className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Explicit non-use statements, by source</summary>
            <ul className="m-0 mt-1 pl-4 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              {release.sources.map((s) => <li key={s.sourceId}><span className="id">{s.sourceId}</span>: {s.nonUse.join('; ')}</li>)}
            </ul>
          </details>
          <dl className="kv text-[12.5px] surface-inset p-3" data-testid="governance">
            <dt>Tenant isolation</dt><dd>{corpus.governance.tenantIsolation}</dd>
            <dt>Information barrier</dt><dd>{corpus.governance.informationBarrier}</dd>
            <dt>Release timing</dt><dd>{corpus.governance.releaseTiming}</dd>
            <dt>Non-use</dt><dd><ul className="m-0 pl-4">{corpus.governance.nonUse.map((n) => <li key={n}>{n}</li>)}</ul></dd>
            <dt>Enforcement</dt><dd style={{ color: 'var(--text-muted)' }}>{corpus.governance.enforcement}</dd>
          </dl>
        </Section>

        <Section title={`Records deliverable to named counterparties (${delivered.records.length})`} id="rl-records">
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} role="status">{delivered.withheldByRights} withheld by source-use decision{Object.keys(delivered.withheldReasons).length ? ` (${Object.entries(delivered.withheldReasons).map(([k, v]) => `${k} ×${v}`).join(', ')})` : ''} · {delivered.withheldByVisibility} withheld by visibility. Counts only.</p>
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
