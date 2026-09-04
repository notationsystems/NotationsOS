'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ClaimCaseBundle, Ruling, VisibilityClass } from '@/domain/types';
import { ASSURANCE_SEMANTICS, STATUS_SEMANTICS, VISIBILITY_SEMANTICS, allRulings, partyName, projectForViewer } from '@/domain/selectors';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { AssuranceDetail } from '@/components/primitives/AssuranceStatus';
import { TemporalBasisPanel } from '@/components/primitives/TemporalBasisPanel';
import { ManifestCommitment, Digest } from '@/components/primitives/ManifestCommitment';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { Section } from '@/components/primitives/Section';
import { CHECK_SEMANTICS } from '@/components/case/InvariantResultView';
import { SupersessionBanner } from './SupersessionBanner';
import { MachineReadableExport } from './MachineReadableExport';
import { ApiExampleDrawer } from './ApiExampleDrawer';
import { fmtTolerance, fmtUtc, humanize } from '@/lib/format';

/**
 * The relying-party surface: a read-only projection of the same case
 * bundle at a chosen visibility. It answers, in order: what was ruled on,
 * the outcome, for what use, at what tolerance, as of which world time,
 * known when, under which profile version, with what assurance, on what
 * visible evidence, with what conditions, and whether it is still current.
 */
export function RulingViewer({ bundle: raw, rulingId }: { bundle: ClaimCaseBundle; rulingId: string }) {
  const choices: VisibilityClass[] = ['COUNTERPARTY_SHARED', 'PUBLIC_RULING'];
  const [viewer, setViewer] = useState<VisibilityClass>(raw.visibility === 'PUBLIC_RULING' ? 'PUBLIC_RULING' : 'COUNTERPARTY_SHARED');
  const projection = useMemo(() => projectForViewer(raw, viewer), [raw, viewer]);
  const bundle = projection.bundle;
  const chain = useMemo(() => allRulings(bundle), [bundle]);
  const ruling: Ruling | undefined = chain.find((r) => r.rulingId === rulingId);
  const current = bundle.currentRuling;

  if (!ruling) {
    return (
      <div className="p-4 max-w-[900px] mx-auto">
        <FixtureBanner note={raw.fixtureNote} />
        <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>This ruling is not visible at the {VISIBILITY_SEMANTICS[viewer].label} visibility.</p>
      </div>
    );
  }

  const failed = ruling.invariantResults.filter((r) => r.status === 'FAILED' && r.origin === 'AUTOMATIC');
  const evidence = bundle.evidence.filter((e) => ruling.consideredEvidenceIds.includes(e.evidenceId));
  const claims = bundle.claims.filter((c) => ruling.ruledClaimIds.includes(c.claimId));
  const withheldEvidence = raw.currentRuling && raw.currentRuling.rulingId === ruling.rulingId ? raw.currentRuling.consideredEvidenceIds.length - evidence.length : (raw.previousRulings.find((r) => r.rulingId === ruling.rulingId)?.consideredEvidenceIds.length ?? evidence.length) - evidence.length;

  return (
    <div className="flex flex-col min-h-full" data-testid="ruling-viewer">
      <FixtureBanner note={bundle.fixtureNote} />
      <div className="max-w-[960px] w-full mx-auto p-3 sm:p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2 flex-wrap no-print">
          <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <Link href="/rulings">Rulings</Link> <span aria-hidden="true">/</span> <span className="id">{ruling.rulingId}</span>
          </nav>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Projection</span>
            <div role="group" aria-label="Viewer visibility" className="flex gap-1">
              {choices.map((v) => (
                <button key={v} type="button" className="btn btn-sm" aria-pressed={viewer === v} onClick={() => setViewer(v)} style={viewer === v ? { borderColor: 'var(--border-accent)', color: 'var(--accent-strong)' } : undefined}>
                  {v === 'COUNTERPARTY_SHARED' ? 'Named counterparty' : 'Public'}
                </button>
              ))}
            </div>
            <Link href={`/cases/${encodeURIComponent(bundle.caseId)}`} className="btn btn-sm">Sponsor workspace</Link>
          </div>
        </div>

        <SupersessionBanner ruling={ruling} current={current} />

        {/* The one-minute answer */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Ruling</span>
            <span className="id" style={{ color: 'var(--text-secondary)' }}>{ruling.rulingId}</span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>revision {ruling.revision}</span>
            <VisibilityBadge visibility={viewer} />
          </div>
          <RulingStatusPill status={ruling.status} size="lg" withMeaning />
          <h1 className="m-0 text-[20px] font-semibold leading-tight" style={{ color: 'var(--text-heading)' }}>{bundle.title}</h1>
          <p className="m-0 text-[14px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{ruling.scopeStatement}</p>
        </header>

        <dl className="grid gap-x-6 gap-y-3 grid-cols-1 sm:grid-cols-2 m-0 surface p-4">
          <div><dt className="label-sm">Ruled for use</dt><dd className="m-0 text-[14px]" style={{ color: 'var(--text-heading)' }}>{ruling.useScope.purpose}</dd><dd className="m-0 id" style={{ color: 'var(--text-muted)' }}>{ruling.useScope.useCode}</dd></div>
          <div><dt className="label-sm">Tolerance</dt><dd className="m-0 mono text-[14px]" style={{ color: 'var(--text-heading)' }}>{fmtTolerance(ruling.useScope.tolerance)}</dd>{ruling.useScope.tolerance?.appliesToPredicate && <dd className="m-0 id" style={{ color: 'var(--text-muted)' }}>on {ruling.useScope.tolerance.appliesToPredicate}</dd>}</div>
          <div><dt className="label-sm">World state valid on</dt><dd className="m-0 ts text-[14px]" style={{ color: 'var(--text-heading)' }} data-clock="validAt">{fmtUtc(ruling.temporalBasis.validAt)}</dd></div>
          <div><dt className="label-sm">Information known by</dt><dd className="m-0 ts text-[14px]" style={{ color: 'var(--text-heading)' }} data-clock="knownAt">{fmtUtc(ruling.temporalBasis.knownAt)}</dd></div>
          <div><dt className="label-sm">Profile version</dt><dd className="m-0"><Link href={`/profiles/${encodeURIComponent(ruling.profileId)}`} className="id" style={{ color: 'var(--info)' }}>{ruling.profileId}</Link> <span className="ver" style={{ color: 'var(--text-muted)' }}>{ruling.profileVersion}</span></dd></div>
          <div><dt className="label-sm">Assurance</dt><dd className="m-0 text-[14px]" style={{ color: 'var(--text-heading)' }}>{ASSURANCE_SEMANTICS[ruling.assurance.class].label}</dd><dd className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{ASSURANCE_SEMANTICS[ruling.assurance.class].meaning}</dd></div>
          <div><dt className="label-sm">Ruling issued on</dt><dd className="m-0 ts text-[14px]" data-clock="ruledAt">{fmtUtc(ruling.temporalBasis.ruledAt)}</dd></div>
          <div><dt className="label-sm">Reliance ends</dt><dd className="m-0 ts text-[14px]" data-clock="expiresAt">{ruling.temporalBasis.expiresAt ? fmtUtc(ruling.temporalBasis.expiresAt) : 'Not declared for this use'}</dd></div>
        </dl>

        {failed.length > 0 && (
          <Section title="Why it was refused" id="rv-why">
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {failed.map((r) => (
                <li key={r.invariantId} className="surface p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="id" style={{ color: 'var(--status-refused)' }}>{r.invariantId}</span>
                    <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{r.title}</span>
                    {r.refusalCode && <span className="id" style={{ color: 'var(--text-muted)' }}>{r.refusalCode}</span>}
                  </div>
                  <p className="m-0 text-[13px]">{r.summary}</p>
                  {r.detail && <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{r.detail}</p>}
                  {r.missingEvidence && r.missingEvidence.length > 0 && <p className="m-0 text-[12.5px]" style={{ color: 'var(--status-pending)' }}>Missing: {r.missingEvidence.join('; ')}</p>}
                  <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Refusal is scoped to this use, tolerance, evidence state, knowledge cutoff and profile version. It is not a finding that any submitted figure is false.</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {ruling.conditions && ruling.conditions.length > 0 && (
          <Section title="Conditions" id="rv-conditions">
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {ruling.conditions.map((c) => <li key={c.conditionId} className="surface p-3 text-[13px]"><span className="id" style={{ color: 'var(--status-conditional)' }}>{c.conditionId}</span> {c.statement}</li>)}
            </ul>
          </Section>
        )}

        {ruling.limitations && ruling.limitations.length > 0 && (
          <Section title="Limitations" id="rv-limitations">
            <ul className="m-0 pl-4 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{ruling.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </Section>
        )}

        <Section title="Claims ruled on" id="rv-claims">
          <table className="ledger-table text-[12.5px]">
            <thead><tr><th scope="col">Claim</th><th scope="col">Predicate</th><th scope="col">Asserted</th><th scope="col">Normalized</th><th scope="col">Evidence class</th></tr></thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.claimId}>
                  <td><span className="id">{c.claimId}</span><div style={{ color: 'var(--text-secondary)' }}>{c.title}</div></td>
                  <td className="id">{c.predicate}</td>
                  <td className="mono">{c.assertedValue ? `${c.assertedValue.value ?? '—'} ${c.assertedValue.unit ?? ''}` : '—'}{c.assertedValue?.basis && <div style={{ color: 'var(--text-muted)' }} className="font-sans">{c.assertedValue.basis}</div>}</td>
                  <td className="mono">{c.normalizedValue ? `${c.normalizedValue.value ?? '—'} ${c.normalizedValue.unit ?? ''}` : '—'}{c.normalizedValue?.uncertainty && <div style={{ color: 'var(--text-muted)' }}>± {c.normalizedValue.uncertainty.value} {c.normalizedValue.uncertainty.unit}</div>}</td>
                  <td>{c.evidenceClass ? <EvidenceClassBadge evidenceClass={c.evidenceClass} compact /> : '—'}</td>
                </tr>
              ))}
              {claims.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No claims visible at this projection.</td></tr>}
            </tbody>
          </table>
        </Section>

        <Section title={`Evidence visible at this projection (${evidence.length})`} id="rv-evidence">
          {withheldEvidence > 0 && <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} role="status">{withheldEvidence} artifact{withheldEvidence === 1 ? '' : 's'} withheld at {VISIBILITY_SEMANTICS[viewer].label} visibility.</p>}
          <table className="ledger-table text-[12.5px]">
            <thead><tr><th scope="col">Artifact</th><th scope="col">Kind</th><th scope="col">Producer</th><th scope="col">Content hash</th><th scope="col">Known by</th></tr></thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.evidenceId}>
                  <td><span className="id">{e.evidenceId}</span><div style={{ color: 'var(--text-secondary)' }}>{e.title}</div></td>
                  <td>{humanize(e.kind)}</td>
                  <td>{partyName(bundle, e.producerId)}</td>
                  <td><Digest value={e.contentHash} copy={false} /></td>
                  <td className="ts">{fmtUtc(e.knownAt)}</td>
                </tr>
              ))}
              {evidence.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No evidence visible at this projection.</td></tr>}
            </tbody>
          </table>
        </Section>

        <Section title="Checks" id="rv-checks">
          <table className="ledger-table text-[12.5px]">
            <thead><tr><th scope="col">Check</th><th scope="col">Authority</th><th scope="col">Result</th><th scope="col">Statement</th></tr></thead>
            <tbody>
              {ruling.invariantResults.filter((r) => r.origin === 'AUTOMATIC').map((r) => (
                <tr key={r.invariantId}>
                  <td><span className="id">{r.invariantId}</span><div style={{ color: 'var(--text-secondary)' }}>{r.title}</div></td>
                  <td style={{ color: 'var(--text-muted)' }}>{humanize(r.authorityClass)}</td>
                  <td style={{ color: `var(${CHECK_SEMANTICS[r.status].cssVar})` }}><span aria-hidden="true">{CHECK_SEMANTICS[r.status].glyph}</span> {CHECK_SEMANTICS[r.status].label}</td>
                  <td>{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {projection.withheld.reducedChecks > 0 && <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{projection.withheld.reducedChecks} check{projection.withheld.reducedChecks === 1 ? '' : 's'} shown as a bounded public statement only.</p>}
        </Section>

        <Section title="Assurance and reliance limitations" id="rv-assurance">
          <div className="surface p-3"><AssuranceDetail assurance={ruling.assurance} partyName={(id) => partyName(bundle, id)} /></div>
        </Section>

        <Section title="Time basis" id="rv-time"><div className="surface p-3"><TemporalBasisPanel temporalBasis={ruling.temporalBasis} /></div></Section>

        <Section title="Identity and commitment" id="rv-identity">
          <div className="surface p-3">
            <ManifestCommitment rulingId={ruling.rulingId} manifestId={ruling.release?.manifestId} commitment={ruling.release?.manifestCommitment} evidenceRoot={ruling.release?.evidenceRoot} registerDigest={ruling.registerDigest} />
            {ruling.release && (
              <dl className="kv mt-2">
                <dt>Released</dt><dd className="ts">{fmtUtc(ruling.release.releasedAt)}</dd>
                <dt>Anchor</dt><dd className="text-[12.5px]">{ruling.release.anchor === 'internal' ? 'Internal log — not externally witnessed' : humanize(ruling.release.anchor ?? 'none')}{ruling.release.anchorRef && <> · <span className="id">{ruling.release.anchorRef}</span></>}</dd>
              </dl>
            )}
          </div>
        </Section>

        <Section title="Supersession chain" id="rv-chain">
          <ol className="m-0 p-0 list-none flex flex-col gap-1" data-testid="supersession-chain">
            {chain.map((r) => (
              <li key={r.rulingId} className={`surface px-3 py-2 flex items-center justify-between gap-2 flex-wrap ${r.rulingId === ruling.rulingId ? 'is-highlighted' : ''}`} aria-current={r.rulingId === ruling.rulingId ? 'true' : undefined}>
                <span className="flex items-center gap-2 flex-wrap"><span className="id">rev {r.revision}</span><Link href={`/rulings/${encodeURIComponent(r.rulingId)}`} className="id" style={{ color: 'var(--info)' }}>{r.rulingId}</Link><RulingStatusPill status={r.status} size="sm" /></span>
                <span className="ts text-[12px]" style={{ color: 'var(--text-muted)' }}>issued {fmtUtc(r.temporalBasis.ruledAt)}{r.rulingId === current?.rulingId && <span className="label-sm ml-2" style={{ color: 'var(--accent-strong)' }}>current</span>}</span>
              </li>
            ))}
          </ol>
          {chain.length > 1 && ruling.rulingId !== current?.rulingId && <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>Compare revisions in the sponsor workspace or in <Link href={`/replay/${encodeURIComponent(bundle.caseId)}`} style={{ color: 'var(--info)' }}>replay</Link>.</p>}
        </Section>

        <Section title="Monitoring" id="rv-monitor">
          <div className="surface p-3 text-[12.5px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
            <p className="m-0">Subscribe to revision, supersession and revocation events for <span className="id">{ruling.rulingId}</span>.</p>
            <p className="m-0" style={{ color: 'var(--text-muted)' }}>Not available in this repository: there is no event feed. The status above is the fixture state as of <span className="ts">{fmtUtc(bundle.asOf)}</span>.</p>
          </div>
        </Section>

        <Section title="Machine-readable export" id="rv-export" className="no-print"><MachineReadableExport bundle={bundle} ruling={ruling} projected={{ viewerLabel: VISIBILITY_SEMANTICS[viewer].label, withheldEvidence: withheldEvidence }} /></Section>
        <div className="no-print"><ApiExampleDrawer ruling={ruling} /></div>

        <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{STATUS_SEMANTICS[ruling.status].meaning}</p>
      </div>
    </div>
  );
}
