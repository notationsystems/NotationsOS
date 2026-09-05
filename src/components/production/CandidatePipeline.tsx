'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import type { SourceUseDecision } from '@/data-os/contracts';
import { PRODUCTION_BOUNDARY, candidateOf, coverageGaps, cutoffChecks, nonClaims, pipelineSummary, processStages, refusalCode, refusalMeaning, type CommittedSource, type LocalAcquisition, type LocalCandidateBuild, type LocalNormalizationRun, type ProductionDemo, type SelectionKind } from '@/domain/production';
import { Section } from '@/components/primitives/Section';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { fmtUtc } from '@/lib/format';
import { ProductionInspector, type Selection } from './ProductionInspector';

const DECISION = {
  ALLOWED: { glyph: '✓', cssVar: '--check-passed' },
  APPROVAL_REQUIRED: { glyph: '◐', cssVar: '--status-conditional' },
  DENIED: { glyph: '✕', cssVar: '--status-refused' },
} as const;
const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };

type Select = (next: Selection, trigger?: HTMLElement | null) => void;

function Decision({ d, label }: { d: SourceUseDecision; label: string }) {
  const s = DECISION[d.state];
  return (
    <div data-decision={d.state} className="text-[12px]">
      <span style={{ color: `var(${s.cssVar})` }}><span aria-hidden="true">{s.glyph}</span> {label} {d.state}</span>
      <div style={faint}>{d.reasons.join(', ')} · {d.request.operation} / {d.request.audience} / {d.request.purpose}</div>
      <div className="ts" style={faint}>evaluated {fmtUtc(d.evaluatedAt, { seconds: true })}</div>
    </div>
  );
}

/** The record's own false-valued claims, stated as the rail states them. */
function NonClaims({ record }: { record: object }) {
  const items = nonClaims(record);
  if (items.length === 0) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px]" aria-label="Not claimed" data-testid="non-claims" style={faint}>
      {items.map((n) => <li key={n.key} data-non-claim={n.key}><span aria-hidden="true">✕</span> {n.label}</li>)}
    </ul>
  );
}

/** The one way to select: a button that names what it opens, pressed while it is open. */
function Inspect({ kind, id, selection, onSelect, label }: { kind: SelectionKind; id: string; selection: Selection | null; onSelect: Select; label?: string }) {
  const active = selection?.kind === kind && selection.id === id;
  return <button type="button" className="btn btn-sm btn-quiet" aria-pressed={active} aria-label={`Inspect ${kind} ${id}`} data-inspect-kind={kind} data-inspect-id={id} onClick={(event) => onSelect({ kind, id }, event.currentTarget)}>{label ?? (active ? 'Inspecting' : 'Inspect')}</button>;
}

/** The process as stages, each metric with the field it is read from, each instant with its clock. */
function Process({ demo }: { demo: ProductionDemo }) {
  const stages = processStages(demo);
  return (
    <ol className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Process stages" data-testid="process-stages">
      {stages.map((stage, i) => (
        <li key={stage.id} className="surface p-3 flex flex-col gap-2 min-w-0" data-stage={stage.id}>
          <div className="flex items-baseline justify-between gap-2"><a href={`#${stage.anchor}`} className="font-semibold text-[13px]" style={{ color: 'var(--text-heading)' }}>{i + 1} · {stage.label}</a><span className="label-sm">{stage.recordedAs}</span></div>
          <p className="m-0 text-[12px]" style={muted}>{stage.does}</p>
          <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1">
            {stage.metrics.map((metric) => <div key={metric.label} className="contents"><dt className="text-[11px]" style={faint} title={`read from ${metric.source}`}>{metric.label}</dt><dd className="m-0 mono text-[12.5px] text-right" data-metric={metric.label} data-source={metric.source} title={`read from ${metric.source}`}>{metric.value}</dd></div>)}
          </dl>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={faint}>{stage.instants.map((t) => <span key={t.label} title={t.clock}><span className="label-sm">{t.label}</span> <span className="ts">{fmtUtc(t.at)}</span></span>)}</div>
        </li>
      ))}
    </ol>
  );
}

/** Where coverage stops: read from recorded facts, each with a remediation someone could take and a way to the object. */
function Gaps({ demo, selection, onSelect }: { demo: ProductionDemo; selection: Selection | null; onSelect: Select }) {
  const gaps = coverageGaps(demo);
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12px]" aria-label="Coverage gaps">
        <thead><tr><th scope="col">Stage</th><th scope="col">Code</th><th scope="col">What stopped</th><th scope="col">Remediation</th><th scope="col">Read from</th><th scope="col"><span className="sr-only">Inspect</span></th></tr></thead>
        <tbody>
          {gaps.map((gap) => (
            <tr key={gap.key} data-gap-code={gap.code} data-gap-stage={gap.stage} className="row-selectable" data-selected={selection?.kind === gap.subject.kind && selection.id === gap.subject.id ? 'true' : undefined}>
              <td className="mono">{gap.stage}</td>
              <td><span className="mono" style={{ color: 'var(--status-conditional)' }}>{gap.code}</span></td>
              <td style={muted}>{gap.what}</td>
              <td style={muted}>{gap.remediation}</td>
              <td className="mono text-[11px]" style={faint}>{gap.source}</td>
              <td><Inspect kind={gap.subject.kind} id={gap.subject.id} selection={selection} onSelect={onSelect} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 px-3 py-2 text-[11.5px]" style={faint}>A remediation is an action a person or an operator could take; the rail takes none of them on its own, and this screen performs none.</p>
    </div>
  );
}

function Acquisitions({ acquisitions, selection, onSelect }: { acquisitions: LocalAcquisition[]; selection: Selection | null; onSelect: Select }) {
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12px]" aria-label="Acquisitions">
        <thead><tr><th scope="col">Acquisition</th><th scope="col">Source registration</th><th scope="col">INGEST decision</th><th scope="col">Evidence</th><th scope="col">Receipt</th><th scope="col">Not claimed</th></tr></thead>
        <tbody>
          {acquisitions.map((a) => {
            const m = a.request.manifest;
            const r = m.sourceRegistration;
            const active = selection?.kind === 'acquisition' && selection.id === m.acquisitionId;
            return (
              <tr key={m.acquisitionId} data-acquisition-id={m.acquisitionId} className="row-selectable" data-selected={active ? 'true' : undefined}>
                <td><div className="flex flex-wrap items-center gap-1"><span className="id">{m.acquisitionId}</span><Inspect kind="acquisition" id={m.acquisitionId} selection={selection} onSelect={onSelect} /></div><div className="text-[11px]" style={faint}>{m.purpose} · {a.mode} · {a.policyAuthority}</div><div className="text-[11px]"><Digest label="digest" value={a.digest} copy={false} /></div></td>
                <td><div style={muted}>{r.displayName}</div><span className="id">{r.registrationId}</span><div className="text-[11px]" style={faint}>{r.sourceClass} · {r.licenseId} · ops {r.allowedOperations.join(', ')} · audiences {r.allowedAudiences.join(', ')}</div></td>
                <td><Decision d={a.decision} label="INGEST" /></td>
                <td><span className="id">{a.capture.evidence.evidenceId}</span><div className="text-[11px]" style={faint}>{a.capture.evidence.mediaType} · {a.capture.evidence.byteLength} bytes · captured {fmtUtc(a.capture.evidence.capturedAt)}</div><div className="text-[11px]"><Digest label="content" value={a.capture.evidence.contentDigest} copy={false} /></div><div className="text-[11px]" style={faint}>key <span className="mono">{a.capture.evidence.storageKey}</span></div></td>
                <td><span className="id">{a.capture.receipt.receiptId}</span><div className="ts text-[11px]" style={faint}>stored {fmtUtc(a.capture.receipt.storedAt)}</div></td>
                <td><NonClaims record={a} /><NonClaims record={a.capture.evidence} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NormalizationRun({ run, selection, onSelect }: { run: LocalNormalizationRun; selection: Selection | null; onSelect: Select }) {
  const m = run.request.manifest;
  const c = candidateOf(run);
  const stateColor = run.state === 'NORMALIZED' ? 'var(--status-pending)' : 'var(--status-refused)';
  const active = selection?.kind === 'normalization' && selection.id === m.normalizationId;
  return (
    <article className="surface p-3 flex flex-col gap-2 row-selectable" data-normalization-id={m.normalizationId} data-state={run.state} data-selected={active ? 'true' : undefined} aria-label={`Normalization ${m.normalizationId}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="id">{m.normalizationId}</span>
        <span className="pill text-[10.5px] px-1.5" style={{ color: stateColor, borderColor: 'currentColor' }}>{run.state === 'NORMALIZED' ? '◌ Normalized · UNADMITTED' : '⊘ Quarantined · no candidate'}</span>
        <Inspect kind="normalization" id={m.normalizationId} selection={selection} onSelect={onSelect} label={active ? 'Inspecting' : c ? 'Inspect evidence → record' : 'Inspect quarantine'} />
        <span className="text-[11.5px]" style={faint}>reasons {run.reasons.join(', ')} · from acquisition <span className="id">{m.acquisitionId}</span> · adapter <span className="id">{m.profile.adapterId}</span> · normalized {fmtUtc(run.normalizedAt)}</span>
      </header>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-2 min-w-0">
          <Decision d={run.deriveDecision} label="DERIVE" />
          <div className="text-[11px]" style={faint}>run digest <Digest value={run.digest} copy={false} /> · request digest <Digest value={run.requestDigest} copy={false} /></div>
          <NonClaims record={run} />
        </div>
        {c ? (
          <div className="surface-inset p-2 flex flex-col gap-2 min-w-0" data-testid="candidate">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="label-sm">Candidate</span><span className="id">{c.candidateId}</span><span className="label-sm" style={{ color: 'var(--status-pending)' }}>{c.state}</span><span className="text-[11.5px]" style={faint}>{c.domain} · {c.recordType}</span></div>
            <dl className="kv m-0 text-[12px]">
              <dt>Identity</dt><dd data-identity-state={c.identity.state}><span style={{ color: 'var(--status-conditional)' }}>{c.identity.state}</span> · source <span className="id">{c.identity.sourceId}</span> · source record <span className="id">{c.identity.sourceRecordId}</span> · canonicalId <span className="mono" data-canonical-id="null">null</span></dd>
              <dt>Fields</dt><dd>{Object.entries(c.fields).map(([k, v]) => <div key={k}><span className="mono" style={faint}>{k}</span> {String(v)}</div>)}</dd>
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
          <div className="surface-inset p-2 text-[12.5px]" data-testid="quarantine" style={muted}>No candidate was written. The bytes were captured and remain reinspectable; the adapter refused them ({run.reasons.join(', ')}) and the run records that refusal instead of a record.</div>
        )}
      </div>
    </article>
  );
}

function Build({ build, selection, onSelect }: { build: LocalCandidateBuild; selection: Selection | null; onSelect: Select }) {
  const m = build.request.manifest;
  const checks = cutoffChecks(build);
  const active = selection?.kind === 'build' && selection.id === build.buildId;
  return (
    <article className="surface p-3 flex flex-col gap-2 row-selectable" data-build-id={build.buildId} data-state={build.state} data-selected={active ? 'true' : undefined} aria-label={`Candidate build ${build.buildId}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="id">{build.buildId}</span>
        <span className="pill text-[10.5px] px-1.5" style={{ color: 'var(--status-pending)', borderColor: 'currentColor' }}>◌ {build.state}</span>
        <Inspect kind="build" id={build.buildId} selection={selection} onSelect={onSelect} />
        <span className="text-[11.5px]" style={faint}>{build.mode} · {build.policyAuthority} · {m.purpose}</span>
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
                <td><div className="flex flex-wrap items-center gap-1"><span className="id">{mem.normalization.id}</span><Inspect kind="normalization" id={mem.normalization.id} selection={selection} onSelect={onSelect} /></div><div className="text-[11px]"><Digest value={mem.normalization.digest} copy={false} /></div></td>
                <td><span className="id">{mem.candidate.id}</span><div className="text-[11px]"><Digest value={mem.candidate.digest} copy={false} /></div></td>
                <td><span style={{ color: 'var(--status-conditional)' }}>{mem.identity.state}</span> · <span className="id">{mem.identity.sourceRecordId}</span> · canonicalId <span className="mono">null</span></td>
                <td data-cutoff={checks[i].withinCutoff ? 'within' : 'after'}><span style={{ color: checks[i].withinCutoff ? 'var(--check-passed)' : 'var(--check-failed)' }}>{checks[i].withinCutoff ? '✓ within' : '✕ after'}</span><div className="ts text-[11px]" style={faint}>{fmtUtc(mem.knownAt)}</div></td>
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

function Refusals({ refusals, selection, onSelect }: { refusals: ProductionDemo['refusals']; selection: Selection | null; onSelect: Select }) {
  return (
    <div className="surface overflow-x-auto" tabIndex={0}>
      <table className="ledger-table text-[12px]" aria-label="Refused steps">
        <thead><tr><th scope="col">Step</th><th scope="col">Request</th><th scope="col">Code</th><th scope="col">The rail said</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          {refusals.map((r) => {
            const active = selection?.kind === 'refusal' && selection.id === r.requestId;
            return (
              <tr key={r.requestId} data-refusal={refusalCode(r.error)} className="row-selectable" data-selected={active ? 'true' : undefined}>
                <td className="mono">{r.step}</td>
                <td><div className="flex flex-wrap items-center gap-1"><span className="id">{r.requestId}</span><Inspect kind="refusal" id={r.requestId} selection={selection} onSelect={onSelect} /></div></td>
                <td><span className="mono" style={{ color: 'var(--status-refused)' }}>{refusalCode(r.error)}</span></td>
                <td className="mono" style={muted}>{r.error}</td>
                <td style={muted}>{refusalMeaning(r.error)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Acquisition → normalization → candidate build, as the local rails recorded
 * it, laid out as an observable process: stages with sourced metrics and
 * labelled clocks, the gaps with their remediation, then the records
 * themselves. Selecting any record opens the inspector beside the surface
 * (beneath it on narrow screens), where provenance is a sequence and a
 * candidate is shown against the bytes it was parsed from.
 */
export function CandidatePipeline({ demo, sources }: { demo: ProductionDemo; sources: CommittedSource[] }) {
  const s = pipelineSummary(demo);
  const [selection, setSelection] = useState<Selection | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const select = useCallback<Select>((next, element) => { if (element) trigger.current = element; setSelection(next); }, []);
  const follow = useCallback((next: Selection) => setSelection(next), []);
  const close = useCallback(() => { setSelection(null); trigger.current?.focus(); }, []);
  return (
    <div className={`workspace${selection ? ' has-inspector' : ''}`} data-testid="production-workspace" data-inspecting={selection?.kind ?? 'none'}>
      <div className="workspace-top flex flex-col gap-5">
        <section aria-label="Boundary" className="surface-inset p-3 flex flex-col gap-1" data-testid="candidate-boundary">
          <span className="label-sm" style={{ color: 'var(--status-conditional)' }}>Boundary</span>
          <ul className="m-0 pl-4 text-[12.5px] flex flex-col gap-0.5" style={muted}>{PRODUCTION_BOUNDARY.map((b) => <li key={b}>{b}</li>)}</ul>
          <p className="m-0 text-[12px]" style={faint}>The inventory is under <Link href="/releases" style={{ color: 'var(--info)' }}>Releases</Link>; the feed is described at <Link href="/api" style={{ color: 'var(--info)' }}>API</Link>. <span className="mono">src/fixtures/production/demo.contract.test.ts</span> asserts that no identifier or digest on this page appears in any feed payload or tool result.</p>
        </section>

        <Section title="The process, as recorded" id="cp-process">
          <p className="m-0 text-[12.5px]" style={muted} data-testid="pipeline-summary">{s.acquisitions} acquisitions → {s.normalized} candidate, {s.quarantined} quarantine → {s.builds} build with {s.members} member · {s.refusals} refused steps. Instants: captured {fmtUtc(demo.instants.capturedAt)}, stored {fmtUtc(demo.instants.storedAt)}, normalized {fmtUtc(demo.instants.normalizedAt)}, cutoff {fmtUtc(demo.instants.knownThrough)}, built {fmtUtc(demo.instants.builtAt)}. Every number below names the field it is read from; hover it.</p>
          <Process demo={demo} />
        </Section>

        <Section title={`Where coverage stops, and what would change it (${coverageGaps(demo).length})`} id="cp-gaps">
          <Gaps demo={demo} selection={selection} onSelect={select} />
        </Section>

        <Section title={`1 · Acquisition: declared policy, captured bytes, receipt (${demo.acquisitions.length})`} id="cp-acquisitions">
          <p className="m-0 text-[12.5px]" style={muted}>Each capture needs an ALLOWED INTERNAL INGEST decision from the source&apos;s registration at the capture instant. The bytes are stored by content digest with a receipt. Capture creates no record and licenses no derivation.</p>
          <Acquisitions acquisitions={demo.acquisitions} selection={selection} onSelect={select} />
        </Section>
      </div>

      {selection && <ProductionInspector key={`${selection.kind}:${selection.id}`} demo={demo} sources={sources} selection={selection} onSelect={follow} onClose={close} />}

      <div className="workspace-bottom flex flex-col gap-5">
        <Section title={`2 · Normalization: a separate DERIVE decision, a fixed adapter, a candidate or a quarantine (${demo.normalizations.length})`} id="cp-normalizations">
          <p className="m-0 text-[12.5px]" style={muted}>DERIVE is evaluated on its own. The adapter <span className="id">{demo.contracts.adapter.id}</span> {demo.contracts.adapter.version} parses the captured bytes under a fixed contract; a contract mismatch is a quarantine with no candidate, kept for reinspection. A candidate is source-scoped and UNRESOLVED; its knowledge time is assigned by the run, after storage.</p>
          {demo.normalizations.map((run) => <NormalizationRun key={run.request.manifest.normalizationId} run={run} selection={selection} onSelect={select} />)}
        </Section>

        <Section title={`3 · Candidate build: explicit membership under a knowledge cutoff (${demo.builds.length})`} id="cp-builds">
          <p className="m-0 text-[12.5px]" style={muted}>A build names its members by normalization id, reopens each one, checks source class and cutoff, evaluates DERIVE again at build time for every member, and publishes references and a membership root. Contract <span className="id">{demo.contracts.candidateBuild.id}</span> {demo.contracts.candidateBuild.version}. It stays UNADMITTED.</p>
          {demo.builds.map((b) => <Build key={b.buildId} build={b} selection={selection} onSelect={select} />)}
        </Section>

        <Section title={`Refused steps: what the rails would not do (${demo.refusals.length})`} id="cp-refusals">
          <p className="m-0 text-[12.5px]" style={muted}>A refusal writes nothing. These three were requested on purpose so the boundaries are visible.</p>
          <Refusals refusals={demo.refusals} selection={selection} onSelect={select} />
        </Section>

        <Section title="Reproduce" id="cp-reproduce">
          <p className="m-0 text-[12.5px]" style={muted}>The same inputs, through the CLI, into a local root (git-ignored). Instants come from the wall clock there; the committed demonstration fixes them so digests are stable.</p>
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
              <thead><tr><th scope="col">Input</th><th scope="col">Bytes</th><th scope="col">Content digest</th><th scope="col">Matches evidence</th></tr></thead>
              <tbody>{demo.inputs.map((i) => { const matched = sources.filter((src) => src.path === i.path); return <tr key={i.path}><td className="id">{i.path}</td><td className="mono">{i.byteLength}</td><td><Digest value={i.contentDigest} copy={false} /></td><td className="text-[11.5px]" style={faint}>{matched.length ? matched.map((src) => <span key={src.evidenceId} className="id block">{src.evidenceId}</span>) : 'no evidence record has this digest'}</td></tr>; })}</tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
