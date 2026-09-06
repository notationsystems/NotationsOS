'use client';

import type { ReactNode } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { REMEDIATION, acquisitionById, acquisitionSequence, buildSequence, buildsWithMember, candidateOf, fieldMapping, mentionedObjects, nonClaims, normalizationById, normalizationSequence, refusalCode, refusalMeaning, refusalsNaming, type CommittedSource, type LocalAcquisition, type LocalCandidateBuild, type LocalNormalizationRun, type ProductionDemo, type ProductionRefusal, type SelectionKind, type SequenceStep } from '@/domain/production';
import { fmtUtc } from '@/lib/format';

export interface Selection { kind: SelectionKind; id: string }

const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };
const OUTCOME = { DONE: { glyph: '✓', color: 'var(--check-passed)', word: 'done' }, REFUSED: { glyph: '✕', color: 'var(--status-refused)', word: 'refused' }, NONE: { glyph: '○', color: 'var(--text-muted)', word: 'none' } } as const;

function Part({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = `inspector-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <section className="inspector-section" aria-labelledby={id} data-testid={testId}><h3 id={id}>{title}</h3>{children}</section>;
}

/** Provenance as a sequence: what happened, in order, each step with its identity, its exact digest, and the clock its time belongs to. */
function Sequence({ steps, follow }: { steps: SequenceStep[]; follow?: (step: SequenceStep) => ReactNode }) {
  return (
    <ol className="sequence" data-testid="sequence">
      {steps.map((step) => {
        const o = OUTCOME[step.outcome];
        return (
          <li key={step.key} data-step={step.key} data-outcome={step.outcome}>
            <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]"><span style={{ color: o.color }} aria-hidden="true">{o.glyph}</span><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{step.label}</span><span className="sr-only">{o.word}</span>{step.id && <span className="id break-all">{step.id}</span>}</div>
            <div className="text-[12px] break-words" style={muted}>{step.what}</div>
            <div className="flex flex-wrap gap-x-3 text-[11px]" style={faint}>
              {step.at && <span><span className="ts">{fmtUtc(step.at, { seconds: true })}</span> · {step.clock}</span>}
              {step.digest && <Digest value={step.digest} copy={false} />}
            </div>
            {follow?.(step)}
          </li>
        );
      })}
    </ol>
  );
}

function Follow({ kind, id, label, onSelect }: { kind: SelectionKind; id: string; label?: string; onSelect: (s: Selection) => void }) {
  return <button type="button" className="btn btn-sm" onClick={() => onSelect({ kind, id })} data-follow-kind={kind} data-follow-id={id}>{label ?? `Inspect ${kind}`} <span className="id ml-1 break-all">{id}</span></button>;
}

function NotClaimed({ records }: { records: object[] }) {
  const items = records.flatMap((r) => nonClaims(r));
  const unique = [...new Map(items.map((i) => [i.key, i])).values()];
  if (!unique.length) return null;
  return <Part title="Not claimed"><ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]" style={faint}>{unique.map((n) => <li key={n.key}><span aria-hidden="true">✕</span> {n.label}</li>)}</ul></Part>;
}

function Times({ rows }: { rows: Array<{ label: string; at: string | null; clock: string; note?: string }> }) {
  return (
    <dl className="kv m-0 text-[12px]" data-testid="times">
      {rows.map((r) => <div key={r.label} className="contents"><dt>{r.label}</dt><dd data-time-kind={r.clock}>{r.at ? <span className="ts">{fmtUtc(r.at, { seconds: true })}</span> : <span style={faint}>{r.note ?? 'none'}</span>} <span style={faint}>· {r.clock}</span></dd></div>)}
    </dl>
  );
}

/** The captured bytes themselves when the demonstration commits them, otherwise an explicit unavailable state. Never a substitute. */
function SourceBytes({ evidenceId, storageKey, contentDigest, sources }: { evidenceId: string; storageKey: string; contentDigest: string; sources: CommittedSource[] }) {
  const source = sources.find((s) => s.evidenceId === evidenceId && s.contentDigest === contentDigest);
  if (!source) {
    return (
      <div className="surface-inset p-2 text-[12px]" style={muted} data-testid="source-unavailable">
        <span className="label-sm" style={{ color: 'var(--status-conditional)' }}>Source bytes unavailable here</span>
        <p className="m-0 mt-1">The committed demonstration carries this evidence&apos;s content digest and storage key, not its bytes, and no committed file has the same digest. The bytes would be read from the local object store at <span className="mono break-all">{storageKey}</span>, which this screen does not open.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid="source-bytes">
      <div className="text-[11.5px] flex flex-wrap gap-x-3" style={faint}><span>committed at <span className="mono">{source.path}</span></span><span>{source.byteLength} bytes</span><span style={{ color: 'var(--check-passed)' }}>digest matches the evidence record</span></div>
      <pre className="source-bytes surface-inset p-2 m-0" tabIndex={0} aria-label={`Source bytes of ${evidenceId}`}>{source.text}</pre>
    </div>
  );
}

function AcquisitionView({ demo, a, sources, onSelect }: { demo: ProductionDemo; a: LocalAcquisition; sources: CommittedSource[]; onSelect: (s: Selection) => void }) {
  const m = a.request.manifest;
  const r = m.sourceRegistration;
  const runs = demo.normalizations.filter((n) => n.request.manifest.acquisitionId === m.acquisitionId);
  const canDerive = r.allowedOperations.includes('DERIVE');
  return (
    <>
      <Part title="Provenance as a sequence"><Sequence steps={acquisitionSequence(a)} /></Part>
      <Part title="Time"><Times rows={[{ label: 'captured', at: a.capture.evidence.capturedAt, clock: 'capture time, as declared' }, { label: 'decided', at: a.decision.evaluatedAt, clock: 'decision time' }, { label: 'stored', at: a.capture.receipt.storedAt, clock: 'record time' }, { label: 'policy from', at: r.effectiveFrom, clock: 'policy effective from' }]} /></Part>
      <Part title="Source bytes" testId="inspector-source"><SourceBytes evidenceId={a.capture.evidence.evidenceId} storageKey={a.capture.evidence.storageKey} contentDigest={a.capture.evidence.contentDigest} sources={sources} /></Part>
      <Part title="What followed" testId="inspector-followed">
        {runs.length ? <ul className="m-0 p-0 list-none flex flex-col gap-1">{runs.map((n) => <li key={n.request.manifest.normalizationId} className="flex flex-wrap items-center gap-2 text-[12px]"><span style={{ color: n.state === 'NORMALIZED' ? 'var(--status-pending)' : 'var(--status-refused)' }}>{n.state}</span><Follow kind="normalization" id={n.request.manifest.normalizationId} label="Inspect run" onSelect={onSelect} /></li>)}</ul>
          : canDerive ? <p className="m-0 text-[12px]" style={faint}>No normalization run in this demonstration.</p>
            : <div className="surface-inset p-2 text-[12px]" data-testid="inspector-gap" data-gap-code="INGEST_ONLY"><span className="label-sm" style={{ color: 'var(--status-conditional)' }}>Coverage stops here · INGEST_ONLY</span><p className="m-0 mt-1" style={muted}>Registration <span className="id">{r.registrationId}</span> permits {r.allowedOperations.join(', ')} only, so no run can derive a candidate from these bytes.</p><p className="m-0 mt-1" style={muted}><span className="label-sm">Remediation</span> {REMEDIATION.INGEST_ONLY}</p></div>}
        {refusalsNaming(demo, m.acquisitionId).map((ref) => <div key={ref.requestId} className="mt-1"><Follow kind="refusal" id={ref.requestId} label="Inspect refusal" onSelect={onSelect} /></div>)}
      </Part>
      <NotClaimed records={[a, a.capture.evidence]} />
    </>
  );
}

function NormalizationView({ demo, run, sources, onSelect }: { demo: ProductionDemo; run: LocalNormalizationRun; sources: CommittedSource[]; onSelect: (s: Selection) => void }) {
  const m = run.request.manifest;
  const a = acquisitionById(demo, m.acquisitionId);
  const c = candidateOf(run);
  const source = a ? sources.find((s) => s.evidenceId === a.capture.evidence.evidenceId && s.contentDigest === a.capture.evidence.contentDigest) : undefined;
  const rows = c ? fieldMapping(c, source?.text) : [];
  const builds = buildsWithMember(demo, m.normalizationId);
  return (
    <>
      <Part title="Evidence to record" testId="inspector-evidence-record">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <div className="surface-inset p-2 text-[12px] flex flex-col gap-0.5" data-testid="evidence-side">
            <span className="label-sm">Evidence · captured bytes</span>
            {a ? <><span className="id break-all">{a.capture.evidence.evidenceId}</span><span style={faint}>{a.capture.evidence.mediaType} · {a.capture.evidence.byteLength} bytes · <Digest value={a.capture.evidence.contentDigest} copy={false} /></span><span style={faint}>source <span className="mono break-all">{a.capture.evidence.sourceId}</span></span></> : <span style={faint}>Acquisition {m.acquisitionId} is not in this demonstration.</span>}
          </div>
          <div className="surface-inset p-2 text-[12px] flex flex-col gap-0.5" data-testid="record-side">
            <span className="label-sm">Record · candidate</span>
            {c ? <><span className="id break-all">{c.candidateId}</span><span style={faint}>{c.domain} {c.recordType} · <span style={{ color: 'var(--status-pending)' }}>{c.state}</span> · <Digest value={c.digest} copy={false} /></span><span style={faint}>identity <span style={{ color: 'var(--status-conditional)' }}>{c.identity.state}</span> · source record <span className="id">{c.identity.sourceRecordId}</span> · canonical <span className="mono">null</span></span></> : <span style={{ color: 'var(--status-refused)' }}>No record. {run.reasons.join(', ')}: the adapter refused the bytes under its contract; the run records that refusal.</span>}
          </div>
        </div>
        {c && (
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5" aria-label="Field mapping">
            {rows.map((row) => (
              <li key={row.field} className="surface-inset p-2 text-[12px] flex flex-col gap-1" data-field={row.field} data-field-status={row.status}>
                <div className="flex items-baseline justify-between gap-2"><span className="mono" style={{ color: 'var(--text-heading)' }}>{row.field}</span><span className="label-sm" style={{ color: row.status === 'MISSING' ? 'var(--status-conditional)' : 'var(--text-muted)' }}>{row.status === 'MISSING' ? 'missing · not inferred' : 'parsed'}</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0"><span className="label-sm">In the source</span><div className="break-words">{row.sourceValue === undefined ? <span style={faint}>{source ? 'no such key' : 'unavailable'}</span> : row.sourceValue === null ? <span className="mono" style={{ color: 'var(--status-conditional)' }}>null</span> : <span className="mono">{JSON.stringify(row.sourceValue)}</span>}</div></div>
                  <div className="min-w-0"><span className="label-sm">In the record</span><div className="break-words">{row.record === null ? <span style={{ color: 'var(--status-conditional)' }}>absent</span> : row.record}</div></div>
                </div>
                <div className="text-[11.5px]" style={faint}>{row.note}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 text-[11.5px]" style={faint}>Nothing on this rail is authored: every record value is the adapter&apos;s parse of the captured bytes under contract <span className="mono">{m.profile.adapterId}</span>. Source truth and field accuracy are not claimed.</p>
      </Part>
      <Part title="Source bytes" testId="inspector-source">{a ? <SourceBytes evidenceId={a.capture.evidence.evidenceId} storageKey={a.capture.evidence.storageKey} contentDigest={a.capture.evidence.contentDigest} sources={sources} /> : <span className="text-[12px]" style={faint}>No acquisition to read.</span>}</Part>
      <Part title="Time">
        <Times rows={[
          { label: 'captured', at: a?.capture.evidence.capturedAt ?? null, clock: 'capture time, as declared' },
          { label: 'stored', at: a?.capture.receipt.storedAt ?? null, clock: 'record time' },
          { label: 'normalized', at: run.normalizedAt, clock: 'run time' },
          { label: 'known at', at: c?.knownAt ?? null, clock: 'knowledge time', note: 'no candidate, so no knowledge time' },
          { label: 'valid time', at: c?.validTime.state === 'OBSERVED' ? c.validTime.from : null, clock: 'valid time', note: c ? 'UNOBSERVED: the source asserted no validity' : 'no candidate' },
        ]} />
      </Part>
      <Part title="Provenance as a sequence"><Sequence steps={normalizationSequence(demo, run)} follow={(step) => step.key.startsWith('build:') && step.id ? <div className="mt-1"><Follow kind="build" id={step.id} label="Inspect build" onSelect={onSelect} /></div> : step.key.startsWith('refusal:') && step.id ? <div className="mt-1"><Follow kind="refusal" id={step.id} label="Inspect refusal" onSelect={onSelect} /></div> : step.key === 'capture' && a ? <div className="mt-1"><Follow kind="acquisition" id={a.request.manifest.acquisitionId} label="Inspect acquisition" onSelect={onSelect} /></div> : null} /></Part>
      {!c && (
        <Part title="Coverage stops here" testId="inspector-gap">
          <div className="surface-inset p-2 text-[12px]" data-gap-code={run.reasons[0] ?? 'QUARANTINED'}><p className="m-0" style={muted}>The bytes were captured and receipted; they remain in the store at their digest for reinspection. No candidate exists, so no build can name this run.</p><p className="m-0 mt-1" style={muted}><span className="label-sm">Remediation</span> {REMEDIATION[run.reasons[0] ?? ''] ?? 'A new normalization run once the cause is removed.'}</p></div>
        </Part>
      )}
      {builds.length > 0 && <Part title="Member of"><div className="flex flex-col gap-1">{builds.map((b) => <Follow key={b.buildId} kind="build" id={b.buildId} label="Inspect build" onSelect={onSelect} />)}</div></Part>}
      <NotClaimed records={c ? [run, c] : [run]} />
    </>
  );
}

function BuildView({ demo, build, onSelect }: { demo: ProductionDemo; build: LocalCandidateBuild; onSelect: (s: Selection) => void }) {
  const others = demo.refusals.filter((r) => r.step === 'BUILD' && r.requestId !== build.buildId);
  return (
    <>
      <Part title="Provenance as a sequence"><Sequence steps={buildSequence(demo, build)} follow={(step) => step.key.startsWith('member:') && step.id ? <div className="mt-1"><Follow kind="normalization" id={step.id} label="Inspect member" onSelect={onSelect} /></div> : null} /></Part>
      <Part title="Time"><Times rows={[{ label: 'cutoff', at: build.knownThrough, clock: 'knowledge cutoff' }, { label: 'built', at: build.builtAt, clock: 'build time' }, ...build.members.map((mem) => ({ label: `member known`, at: mem.knownAt, clock: 'knowledge time' }))]} /></Part>
      <Part title="Digests"><dl className="kv m-0 text-[12px]"><dt>definition</dt><dd><Digest value={build.definitionDigest} copy={false} /></dd><dt>request</dt><dd><Digest value={build.requestDigest} copy={false} /></dd><dt>contract</dt><dd><Digest value={build.request.contractDigest} copy={false} /></dd><dt>records root</dt><dd><Digest value={build.recordsRoot} copy={false} /></dd><dt>build</dt><dd><Digest value={build.digest} copy={false} /></dd></dl></Part>
      {others.length > 0 && <Part title="Build requests refused" testId="inspector-refused-builds"><div className="flex flex-col gap-1">{others.map((r) => <Follow key={r.requestId} kind="refusal" id={r.requestId} label={refusalCode(r.error)} onSelect={onSelect} />)}</div></Part>}
      <NotClaimed records={[build]} />
    </>
  );
}

function RefusalView({ demo, refusal, onSelect }: { demo: ProductionDemo; refusal: ProductionRefusal; onSelect: (s: Selection) => void }) {
  const code = refusalCode(refusal.error);
  const mentioned = mentionedObjects(demo, refusal.error);
  return (
    <>
      <Part title="The rail said"><p className="m-0 mono text-[12px] break-words" style={{ color: 'var(--text-secondary)' }}>{refusal.error}</p></Part>
      <Part title="Meaning"><p className="m-0 text-[12.5px]" style={muted}>{refusalMeaning(refusal.error)}</p><p className="m-0 mt-1 text-[12px]" style={faint}>A refusal writes nothing: no run, no candidate, no build. The request id is the only trace.</p></Part>
      <Part title="Remediation" testId="inspector-remediation"><p className="m-0 text-[12.5px]" style={muted}>{REMEDIATION[code] ?? 'See the rail’s message.'}</p></Part>
      <Part title="Named in the refusal" testId="inspector-mentions">{mentioned.length ? <div className="flex flex-col gap-1">{mentioned.map((o) => <Follow key={`${o.kind}:${o.id}`} kind={o.kind} id={o.id} onSelect={onSelect} />)}</div> : <p className="m-0 text-[12px]" style={faint}>The refusal text names no stored object.</p>}</Part>
    </>
  );
}

/** What the selected object is, in context, and what followed or refused it. Nothing here performs a step. */
export function ProductionInspector({ demo, sources, selection, onSelect, onClose }: { demo: ProductionDemo; sources: CommittedSource[]; selection: Selection; onSelect: (s: Selection) => void; onClose: () => void }) {
  const common = { onClose, focusOnNarrow: true, testId: 'production-inspector' as const };
  if (selection.kind === 'acquisition') {
    const a = acquisitionById(demo, selection.id);
    if (!a) return null;
    return <Inspector id="production-inspector" kicker="Acquisition" title={selection.id} subtitle={a.request.manifest.sourceRegistration.displayName} {...common}><AcquisitionView demo={demo} a={a} sources={sources} onSelect={onSelect} /></Inspector>;
  }
  if (selection.kind === 'normalization') {
    const run = normalizationById(demo, selection.id);
    if (!run) return null;
    return <Inspector id="production-inspector" kicker={run.state === 'NORMALIZED' ? 'Normalization run · candidate' : 'Normalization run · quarantine'} title={selection.id} subtitle={<span style={{ color: run.state === 'NORMALIZED' ? 'var(--status-pending)' : 'var(--status-refused)' }}>{run.state} · {run.reasons.join(', ')}</span>} {...common}><NormalizationView demo={demo} run={run} sources={sources} onSelect={onSelect} /></Inspector>;
  }
  if (selection.kind === 'build') {
    const build = demo.builds.find((b) => b.buildId === selection.id);
    if (!build) return null;
    return <Inspector id="production-inspector" kicker="Candidate build" title={selection.id} subtitle={<span style={{ color: 'var(--status-pending)' }}>{build.state} · {build.recordCount} member{build.recordCount === 1 ? '' : 's'} · {build.request.manifest.definition.id} {build.request.manifest.definition.version}</span>} {...common}><BuildView demo={demo} build={build} onSelect={onSelect} /></Inspector>;
  }
  const refusal = demo.refusals.find((r) => r.requestId === selection.id);
  if (!refusal) return null;
  return <Inspector id="production-inspector" kicker="Refused step" title={refusalCode(refusal.error)} subtitle={<span>{refusal.step} · <span className="id">{refusal.requestId}</span></span>} {...common}><RefusalView demo={demo} refusal={refusal} onSelect={onSelect} /></Inspector>;
}
