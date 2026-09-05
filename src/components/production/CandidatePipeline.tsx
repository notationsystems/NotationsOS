import Link from 'next/link';
import type { SourceUseDecision } from '@/data-os/contracts';
import { PRODUCTION_BOUNDARY, candidateOf, cutoffChecks, nonClaims, pipelineSummary, refusalCode, refusalMeaning, type LocalAcquisition, type LocalCandidateBuild, type LocalNormalizationRun, type ProductionDemo } from '@/domain/production';
import { Section } from '@/components/primitives/Section';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { fmtUtc } from '@/lib/format';

const DECISION = {
  ALLOWED: { glyph: '✓', cssVar: '--check-passed' },
  APPROVAL_REQUIRED: { glyph: '◐', cssVar: '--status-conditional' },
  DENIED: { glyph: '✕', cssVar: '--status-refused' },
} as const;

function Decision({ d, label }: { d: SourceUseDecision; label: string }) {
  const s = DECISION[d.state];
  return (
    <div data-decision={d.state} className="text-[12px]">
      <span style={{ color: `var(${s.cssVar})` }}><span aria-hidden="true">{s.glyph}</span> {label} {d.state}</span>
      <div style={{ color: 'var(--text-muted)' }}>{d.reasons.join(', ')} · {d.request.operation} / {d.request.audience} / {d.request.purpose}</div>
      <div className="ts" style={{ color: 'var(--text-muted)' }}>evaluated {fmtUtc(d.evaluatedAt, { seconds: true })}</div>
    </div>
  );
}

/** The record's own false-valued claims, stated as the rail states them. */
function NonClaims({ record }: { record: object }) {
  const items = nonClaims(record);
  if (items.length === 0) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px]" aria-label="Not claimed" data-testid="non-claims" style={{ color: 'var(--text-muted)' }}>
      {items.map((n) => <li key={n.key} data-non-claim={n.key}><span aria-hidden="true">✕</span> {n.label}</li>)}
    </ul>
  );
}

function Acquisitions({ acquisitions }: { acquisitions: LocalAcquisition[] }) {
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12px]" aria-label="Acquisitions">
        <thead><tr><th scope="col">Acquisition</th><th scope="col">Source registration</th><th scope="col">INGEST decision</th><th scope="col">Evidence</th><th scope="col">Receipt</th><th scope="col">Not claimed</th></tr></thead>
        <tbody>
          {acquisitions.map((a) => {
            const m = a.request.manifest;
            const r = m.sourceRegistration;
            return (
              <tr key={m.acquisitionId} data-acquisition-id={m.acquisitionId}>
                <td><span className="id">{m.acquisitionId}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{m.purpose} · {a.mode} · {a.policyAuthority}</div><div className="text-[11px]"><Digest label="digest" value={a.digest} copy={false} /></div></td>
                <td><div style={{ color: 'var(--text-secondary)' }}>{r.displayName}</div><span className="id">{r.registrationId}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.sourceClass} · {r.licenseId} · ops {r.allowedOperations.join(', ')} · audiences {r.allowedAudiences.join(', ')}</div></td>
                <td><Decision d={a.decision} label="INGEST" /></td>
                <td><span className="id">{a.capture.evidence.evidenceId}</span><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{a.capture.evidence.mediaType} · {a.capture.evidence.byteLength} bytes · captured {fmtUtc(a.capture.evidence.capturedAt)}</div><div className="text-[11px]"><Digest label="content" value={a.capture.evidence.contentDigest} copy={false} /></div><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>key <span className="mono">{a.capture.evidence.storageKey}</span></div></td>
                <td><span className="id">{a.capture.receipt.receiptId}</span><div className="ts text-[11px]" style={{ color: 'var(--text-muted)' }}>stored {fmtUtc(a.capture.receipt.storedAt)}</div></td>
                <td><NonClaims record={a} /><NonClaims record={a.capture.evidence} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NormalizationRun({ run }: { run: LocalNormalizationRun }) {
  const m = run.request.manifest;
  const c = candidateOf(run);
  const stateColor = run.state === 'NORMALIZED' ? 'var(--status-pending)' : 'var(--status-refused)';
  return (
    <article className="surface p-3 flex flex-col gap-2" data-normalization-id={m.normalizationId} data-state={run.state} aria-label={`Normalization ${m.normalizationId}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="id">{m.normalizationId}</span>
        <span className="pill text-[10.5px] px-1.5" style={{ color: stateColor, borderColor: 'currentColor' }}>{run.state === 'NORMALIZED' ? '◌ Normalized · UNADMITTED' : '⊘ Quarantined · no candidate'}</span>
        <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>reasons {run.reasons.join(', ')} · from acquisition <span className="id">{m.acquisitionId}</span> · adapter <span className="id">{m.profile.adapterId}</span> · normalized {fmtUtc(run.normalizedAt)}</span>
      </header>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-2 min-w-0">
          <Decision d={run.deriveDecision} label="DERIVE" />
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>run digest <Digest value={run.digest} copy={false} /> · request digest <Digest value={run.requestDigest} copy={false} /></div>
          <NonClaims record={run} />
        </div>
        {c ? (
          <div className="surface-inset p-2 flex flex-col gap-2 min-w-0" data-testid="candidate">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="label-sm">Candidate</span><span className="id">{c.candidateId}</span><span className="label-sm" style={{ color: 'var(--status-pending)' }}>{c.state}</span><span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{c.domain} · {c.recordType}</span></div>
            <dl className="kv m-0 text-[12px]">
              <dt>Identity</dt><dd data-identity-state={c.identity.state}><span style={{ color: 'var(--status-conditional)' }}>{c.identity.state}</span> · source <span className="id">{c.identity.sourceId}</span> · source record <span className="id">{c.identity.sourceRecordId}</span> · canonicalId <span className="mono" data-canonical-id="null">null</span></dd>
              <dt>Fields</dt><dd>{Object.entries(c.fields).map(([k, v]) => <div key={k}><span className="mono" style={{ color: 'var(--text-muted)' }}>{k}</span> {String(v)}</div>)}</dd>
              <dt>Missing</dt><dd className="mono">{c.missingFields.length ? c.missingFields.join(', ') : '—'}</dd>
              <dt>Valid time</dt><dd data-clock="validTime">{c.validTime.state === 'OBSERVED' ? `${fmtUtc(c.validTime.from)} → ${c.validTime.to ? fmtUtc(c.validTime.to) : 'open'}` : 'UNOBSERVED (no validity asserted)'}</dd>
              <dt>Known at</dt><dd className="ts" data-clock="knownAt">{fmtUtc(c.knownAt)}</dd>
              <dt>Provenance</dt><dd className="text-[11.5px] flex flex-col gap-0.5">
                <span>acquisition <span className="id">{c.provenance.acquisition.id}</span> <Digest value={c.provenance.acquisition.digest} copy={false} /></span>
                <span>evidence <span className="id">{c.provenance.evidence.id}</span> <Digest value={c.provenance.evidence.contentDigest} copy={false} /></span>
                <span>receipt <span className="id">{c.provenance.receipt.id}</span> <Digest value={c.provenance.receipt.digest} copy={false} /></span>
                <span>source policy <span className="id">{c.provenance.sourcePolicy.id}</span> <Digest value={c.provenance.sourcePolicy.digest} copy={false} /></span>
                <span>derivation <span className="id">{c.provenance.derivation.id}</span> <Digest value={c.provenance.derivation.digest} copy={false} /></span>
                <span>adapter <span className="id">{c.provenance.adapter.id}</span> {c.provenance.adapter.version} <Digest value={c.provenance.adapter.contractDigest} copy={false} /></span>
              </dd>
              <dt>Digest</dt><dd><Digest value={c.digest} copy={false} /></dd>
            </dl>
          </div>
        ) : (
          <div className="surface-inset p-2 text-[12.5px]" data-testid="quarantine" style={{ color: 'var(--text-secondary)' }}>No candidate was written. The bytes were captured and remain reinspectable; the adapter refused them ({run.reasons.join(', ')}) and the run records that refusal instead of a record.</div>
        )}
      </div>
    </article>
  );
}

function Build({ build }: { build: LocalCandidateBuild }) {
  const m = build.request.manifest;
  const checks = cutoffChecks(build);
  return (
    <article className="surface p-3 flex flex-col gap-2" data-build-id={build.buildId} data-state={build.state} aria-label={`Candidate build ${build.buildId}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="id">{build.buildId}</span>
        <span className="pill text-[10.5px] px-1.5" style={{ color: 'var(--status-pending)', borderColor: 'currentColor' }}>◌ {build.state}</span>
        <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{build.mode} · {build.policyAuthority} · {m.purpose}</span>
      </header>
      <dl className="kv m-0 text-[12px]">
        <dt>Definition</dt><dd><span className="id">{m.definition.id}</span> {m.definition.version} · {m.definition.domain} {m.definition.recordType} · source classes {m.definition.sourceClasses.join(', ')} · <Digest value={build.definitionDigest} copy={false} /></dd>
        <dt>Knowledge cutoff</dt><dd className="ts" data-clock="knownThrough">{fmtUtc(build.knownThrough)}</dd>
        <dt>Built at</dt><dd className="ts" data-clock="builtAt">{fmtUtc(build.builtAt)}</dd>
        <dt>Members</dt><dd>{build.recordCount} · records root <Digest value={build.recordsRoot} copy={false} /></dd>
        <dt>Digests</dt><dd>request <Digest value={build.requestDigest} copy={false} /> · contract <Digest value={build.request.contractDigest} copy={false} /> · build <Digest value={build.digest} copy={false} /></dd>
      </dl>
      <div className="surface-inset overflow-x-auto" tabIndex={0}>
        <table className="ledger-table text-[12px]" aria-label={`Members of ${build.buildId}`}>
          <thead><tr><th scope="col">Normalization</th><th scope="col">Candidate</th><th scope="col">Identity</th><th scope="col">Known at ≤ cutoff ≤ built</th><th scope="col">DERIVE at build time</th><th scope="col">Valid time</th></tr></thead>
          <tbody>
            {build.members.map((mem, i) => (
              <tr key={mem.normalization.id} data-member={mem.normalization.id}>
                <td><span className="id">{mem.normalization.id}</span><div className="text-[11px]"><Digest value={mem.normalization.digest} copy={false} /></div></td>
                <td><span className="id">{mem.candidate.id}</span><div className="text-[11px]"><Digest value={mem.candidate.digest} copy={false} /></div></td>
                <td><span style={{ color: 'var(--status-conditional)' }}>{mem.identity.state}</span> · <span className="id">{mem.identity.sourceRecordId}</span> · canonicalId <span className="mono">null</span></td>
                <td data-cutoff={checks[i].withinCutoff ? 'within' : 'after'}><span style={{ color: checks[i].withinCutoff ? 'var(--check-passed)' : 'var(--check-failed)' }}>{checks[i].withinCutoff ? '✓ within' : '✕ after'}</span><div className="ts text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtUtc(mem.knownAt)}</div></td>
                <td><Decision d={mem.deriveDecision} label="DERIVE" /></td>
                <td>{mem.validTime.state === 'OBSERVED' ? `${fmtUtc(mem.validTime.from)} → ${mem.validTime.to ? fmtUtc(mem.validTime.to) : 'open'}` : 'UNOBSERVED'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NonClaims record={build} />
    </article>
  );
}

function Refusals({ refusals }: { refusals: ProductionDemo['refusals'] }) {
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12px]" aria-label="Refused steps">
        <thead><tr><th scope="col">Step</th><th scope="col">Request</th><th scope="col">Code</th><th scope="col">The rail said</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          {refusals.map((r) => (
            <tr key={r.requestId} data-refusal={refusalCode(r.error)}>
              <td className="mono">{r.step}</td>
              <td><span className="id">{r.requestId}</span></td>
              <td><span className="mono" style={{ color: 'var(--status-refused)' }}>{refusalCode(r.error)}</span></td>
              <td className="mono" style={{ color: 'var(--text-secondary)' }}>{r.error}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{refusalMeaning(r.error)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Acquisition → normalization → candidate build, as the local rails recorded it. */
export function CandidatePipeline({ demo }: { demo: ProductionDemo }) {
  const s = pipelineSummary(demo);
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Boundary" className="surface-inset p-3 flex flex-col gap-1" data-testid="candidate-boundary">
        <span className="label-sm" style={{ color: 'var(--status-conditional)' }}>Boundary</span>
        <ul className="m-0 pl-4 text-[12.5px] flex flex-col gap-0.5" style={{ color: 'var(--text-secondary)' }}>{PRODUCTION_BOUNDARY.map((b) => <li key={b}>{b}</li>)}</ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>The inventory is under <Link href="/releases" style={{ color: 'var(--info)' }}>Releases</Link>; the feed is described at <Link href="/api" style={{ color: 'var(--info)' }}>API</Link>. <span className="mono">src/fixtures/production/demo.contract.test.ts</span> asserts that no identifier or digest on this page appears in any feed payload or tool result.</p>
      </section>

      <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="pipeline-summary">{s.acquisitions} acquisitions → {s.normalized} candidate, {s.quarantined} quarantine → {s.builds} build with {s.members} member · {s.refusals} refused steps. Instants: captured {fmtUtc(demo.instants.capturedAt)}, stored {fmtUtc(demo.instants.storedAt)}, normalized {fmtUtc(demo.instants.normalizedAt)}, cutoff {fmtUtc(demo.instants.knownThrough)}, built {fmtUtc(demo.instants.builtAt)}.</p>

      <Section title={`1 · Acquisition: declared policy, captured bytes, receipt (${demo.acquisitions.length})`} id="cp-acquisitions">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Each capture needs an ALLOWED INTERNAL INGEST decision from the source&apos;s registration at the capture instant. The bytes are stored by content digest with a receipt. Capture creates no record and licenses no derivation.</p>
        <Acquisitions acquisitions={demo.acquisitions} />
      </Section>

      <Section title={`2 · Normalization: a separate DERIVE decision, a fixed adapter, a candidate or a quarantine (${demo.normalizations.length})`} id="cp-normalizations">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>DERIVE is evaluated on its own. The adapter <span className="id">{demo.contracts.adapter.id}</span> {demo.contracts.adapter.version} parses the captured bytes under a fixed contract; a contract mismatch is a quarantine with no candidate, kept for reinspection. A candidate is source-scoped and UNRESOLVED; its knowledge time is assigned by the run, after storage.</p>
        {demo.normalizations.map((run) => <NormalizationRun key={run.request.manifest.normalizationId} run={run} />)}
      </Section>

      <Section title={`3 · Candidate build: explicit membership under a knowledge cutoff (${demo.builds.length})`} id="cp-builds">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>A build names its members by normalization id, reopens each one, checks source class and cutoff, evaluates DERIVE again at build time for every member, and publishes references and a membership root. Contract <span className="id">{demo.contracts.candidateBuild.id}</span> {demo.contracts.candidateBuild.version}. It stays UNADMITTED.</p>
        {demo.builds.map((b) => <Build key={b.buildId} build={b} />)}
      </Section>

      <Section title={`Refused steps: what the rails would not do (${demo.refusals.length})`} id="cp-refusals">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>A refusal writes nothing. These three were requested on purpose so the boundaries are visible.</p>
        <Refusals refusals={demo.refusals} />
      </Section>

      <Section title="Reproduce" id="cp-reproduce">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The same inputs, through the CLI, into a local root (git-ignored). Instants come from the wall clock there; the committed demonstration fixes them so digests are stable.</p>
        <pre className="m-0 surface-inset p-2 overflow-x-auto text-[11.5px]" tabIndex={0}>{[
          'npm run evidence -- capture --request examples/carrier/acquisition.json --input examples/carrier/source.json',
          'npm run evidence -- normalize --request examples/carrier/normalization.json',
          'npm run evidence -- inspect-normalization --normalization demo-caravan-carrier-normalization-001',
          'npm run evidence -- build-candidates --request <build.json>   # knownThrough ≥ candidate knownAt',
          'npm run evidence -- inspect-candidate-build --build demo-caravan-carrier-build-001',
          'npm run stamp:production   # re-stamps src/fixtures/production/demo.json from examples/ at the fixed instants',
        ].join('\n')}</pre>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Inputs">
            <thead><tr><th scope="col">Input</th><th scope="col">Bytes</th><th scope="col">Content digest</th></tr></thead>
            <tbody>{demo.inputs.map((i) => <tr key={i.path}><td className="id">{i.path}</td><td className="mono">{i.byteLength}</td><td><Digest value={i.contentDigest} copy={false} /></td></tr>)}</tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
