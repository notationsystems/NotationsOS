'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SourceRegistration } from '@/data-os/contracts';
import { Inspector } from '@/components/primitives/Inspector';
import { Digest } from '@/components/primitives/ManifestCommitment';
import type { ProductionDemo } from '@/domain/production';
import { BLOCKERS, PRODUCTION_STAGE_LABEL, STAGE_STATE_MEANING, STEP_LABEL, STEP_ORDER, buildReference, byteLength, deriveStages, emptySession, errorRecovery, errorText, nextAttemptName, outputOf, remediationText, requestIds, runRecovery, stepInputs, toBase64, type Blocker, type PathSession, type PathStageState, type ProductionCorpusDefinition, type ProductionErrorBody, type ProductionOutputRef, type ProductionResult, type ProductionRun, type ProductionSourceConfig, type RecoveryAction, type SourceReadbackSummary, type StageView, type StepKey } from '@/domain/productionPath';
import type { ProductionObjectKind } from '@/production/contracts';
import { fmtUtc } from '@/lib/format';

export interface ProductionPathProps {
  /** Whether the server process runs with the local rail enabled. The rail still answers only its own loopback origin. */
  enabled: boolean;
  demo: ProductionDemo;
  definition: ProductionCorpusDefinition;
  /** The source configuration with a placeholder corpus reference; the registered corpus reference replaces it. */
  sourceTemplate: ProductionSourceConfig;
  purpose: string;
  carrier: { path: string; text: string; base64: string; byteLength: number };
  fmcsa: { request: { requestId: string; sourceId: string; usdot: string[] }; policy: SourceRegistration; fields: readonly string[]; requestPath: string };
  fetchImpl?: typeof fetch;
  /** The default run name; the date on the operator's machine unless a test fixes it. */
  defaultName?: string;
}

type Catalog = { schema: 'payload.production-catalog.v1'; corpora: Array<{ reference: ProductionOutputRef | { id: string; digest: string }; version: string; domain: string; recordType: string }>; sources: Array<{ reference: { id: string; digest: string }; version: string; corpus: { id: string; digest: string }; provider: string; adapter: { id: string; version: string } }>; runs: Array<{ id: string; kind: string; state: string; reference: { id: string; digest: string } | null; startedAt: string; outputCount?: number; outputs?: unknown }> };
type Availability = { schema: 'payload.production-availability.v1'; enabled: false };
type CatalogState = { status: 'LOADING' } | { status: 'READY'; catalog: Catalog } | { status: 'DISABLED' } | { status: 'ERROR'; code: string; message: string };
type Inspection = { kind: ProductionObjectKind; reference: { id: string; digest: string } } & ({ status: 'LOADING' } | { status: 'DONE'; data: Record<string, unknown>; flags: Record<string, unknown> } | { status: 'FAILED'; code: string; message: string });
type Readback = { status: 'LOADING' } | { status: 'FOUND'; summary: SourceReadbackSummary; inspection: Record<string, unknown> } | { status: 'NOT_FOUND'; code: string } | { status: 'ERROR'; code: string; message: string } | { status: 'UNAVAILABLE' };

const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };
const STATE_COLOR: Record<PathStageState, string> = { READY: 'var(--info)', DONE: 'var(--check-passed)', RUNNING: 'var(--status-pending)', FAILED: 'var(--status-refused)', QUARANTINED: 'var(--status-refused)', WAITING: 'var(--text-muted)', BLOCKED: 'var(--status-conditional)', DEMONSTRATION: 'var(--status-pending)' };
const RUN_COLOR: Record<string, string> = { COMPLETED: 'var(--check-passed)', FAILED: 'var(--status-refused)', QUARANTINED: 'var(--status-refused)', NOT_RUN: 'var(--text-muted)', REFUSED: 'var(--status-refused)', INCOMPLETE_OR_RUNNING: 'var(--status-pending)' };

function Part({ title, children, testId, id }: { title: string; children: ReactNode; testId?: string; id?: string }) {
  const anchor = id ?? `pp-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <section className="surface p-3 flex flex-col gap-2" aria-labelledby={anchor} data-testid={testId} id={anchor}><h2 id={`${anchor}-h`} className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</h2>{children}</section>;
}
function Pill({ text, color, title }: { text: string; color: string; title?: string }) {
  return <span className="pill text-[10px] px-1.5" style={{ color, borderColor: 'currentColor' }} title={title}>{text.replace(/_/g, ' ')}</span>;
}
function Ref({ reference, kind }: { reference: { id: string; digest: string }; kind?: string }) {
  return <span className="inline-flex flex-wrap items-baseline gap-x-2">{kind && <span className="label-sm">{kind.replace(/_/g, ' ')}</span>}<span className="id break-all">{reference.id}</span><Digest value={reference.digest} copy={false} /></span>;
}
function Flags({ record, testId }: { record: Record<string, unknown>; testId?: string }) {
  const entries = Object.entries(record).filter(([, value]) => typeof value === 'boolean' || (typeof value === 'string' && /^[A-Z_]+$/.test(value)));
  if (!entries.length) return null;
  return <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={faint} data-testid={testId}>{entries.map(([key, value]) => <li key={key}><span className="mono">{key}</span> {String(value)}</li>)}</ul>;
}
function Raw({ value, label = 'As returned' }: { value: unknown; label?: string }) {
  return <details className="text-[11.5px]"><summary style={faint}>{label} (JSON)</summary><pre className="source-bytes m-0 mt-1 whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre></details>;
}
function BlockerView({ blocker }: { blocker: Blocker }) {
  return (
    <dl className="kv m-0 text-[12px]" data-testid="blocker">
      <dt style={faint}>What</dt><dd className="m-0" style={muted}>{blocker.what}</dd>
      <dt style={faint}>Owner</dt><dd className="m-0" style={muted}>{blocker.owner}</dd>
      <dt style={faint}>What would change it</dt><dd className="m-0" style={muted}>{blocker.remedy}</dd>
    </dl>
  );
}

/** The run's own stages, rendered directly: NOT_RUN stays NOT_RUN. */
function Stages({ run, onInspect }: { run: ProductionRun; onInspect: (kind: ProductionObjectKind, reference: { id: string; digest: string }) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="ledger-table text-[11.5px]" data-testid="run-stages">
        <thead><tr><th>Stage</th><th>State</th><th>Code</th><th>Outputs</th></tr></thead>
        <tbody>
          {run.stages.map((stage) => (
            <tr key={stage.stage} data-run-stage={stage.stage} data-state={stage.state}>
              <td>{PRODUCTION_STAGE_LABEL[stage.stage]}</td>
              <td><span className="mono" style={{ color: RUN_COLOR[stage.state] }}>{stage.state}</span></td>
              <td className="mono">{stage.code}</td>
              <td className="text-left">{stage.outputs.length ? <div className="flex flex-col gap-0.5 items-start">{stage.outputs.map((output) => <button key={`${output.kind}:${output.id}`} type="button" className="btn btn-sm btn-quiet" style={{ whiteSpace: 'normal', textAlign: 'left', wordBreak: 'break-all' }} onClick={() => onInspect(output.kind, output)}><span className="label-sm">{output.kind.replace(/_/g, ' ')}</span> <span className="id">{output.id}</span></button>)}</div> : <span style={faint}>none</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecoveryButtons({ actions, onAct, testId }: { actions: RecoveryAction[]; onAct: (action: RecoveryAction) => void; testId?: string }) {
  if (!actions.length) return null;
  const actionable = new Set(['RETRY_IDENTICAL', 'NEW_IDENTITY', 'INSPECT_OUTPUTS', 'INSPECT_QUARANTINE', 'CORRECT_INPUT', 'WAIT']);
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1" data-testid={testId} aria-label="Recovery">
      {actions.map((action) => (
        <li key={action.kind} className="flex flex-wrap items-baseline gap-x-2 text-[12px]" data-recovery={action.kind}>
          {actionable.has(action.kind) ? <button type="button" className="btn btn-sm" onClick={() => onAct(action)}>{action.label}</button> : <span className="font-medium" style={{ color: 'var(--text-heading)' }}>{action.label}</span>}
          <span style={faint}>{action.why}</span>
        </li>
      ))}
    </ul>
  );
}

function Receipt({ result, onInspect, onRecover }: { result: ProductionResult; onInspect: (kind: ProductionObjectKind, reference: { id: string; digest: string }) => void; onRecover: (action: RecoveryAction) => void }) {
  const { run } = result;
  return (
    <div className="surface-inset p-2 flex flex-col gap-2" data-testid="receipt" data-run-state={run.state} data-historical={String(result.historicalRetry)}>
      <div className="flex flex-wrap items-baseline gap-x-3 text-[12px]">
        <span className="mono" style={{ color: RUN_COLOR[run.state] }}>{run.state}</span>
        <span style={muted}>{result.status}{result.historicalRetry ? ' · historical retry: the original receipt, no new execution' : ''}</span>
        <span style={faint}>run <span className="id">{run.id}</span></span>
        <Digest value={run.digest} copy={false} />
        <span style={faint}>started <span className="ts">{fmtUtc(run.startedAt, { seconds: true })}</span> · completed <span className="ts">{fmtUtc(run.completedAt, { seconds: true })}</span> · backend clock</span>
      </div>
      <Stages run={run} onInspect={onInspect} />
      {run.failure && (
        <div className="flex flex-col gap-1 text-[12px]" data-testid="failure" data-code={run.failure.code}>
          <div><span className="mono" style={{ color: 'var(--status-refused)' }}>{run.failure.code}</span> <span style={faint}>· artifact retained <span className="mono">{String(run.failure.artifactRetained)}</span> · receipt retained <span className="mono">{String(run.failure.receiptRetained)}</span> · run receipt retained <span className="mono">{String(run.failure.runReceiptRetained)}</span>{run.failure.additionalOutputRetention && <> · additional output retention <span className="mono">{run.failure.additionalOutputRetention}</span></>}</span></div>
          <ul className="m-0 pl-4 flex flex-col gap-0.5" style={muted}>{run.failure.remediation.map((code) => <li key={code}><span className="mono">{code}</span> · {remediationText(code)}</li>)}</ul>
          <RecoveryButtons actions={runRecovery(run)} onAct={onRecover} testId="run-recovery" />
        </div>
      )}
      <Flags record={{ canonicalAdmission: run.canonicalAdmission, releaseActivated: run.releaseActivated, sourceTruthClaimed: run.sourceTruthClaimed, completenessClaimed: run.completenessClaimed, coverageVerified: run.coverageVerified, freshnessVerified: run.freshnessVerified, definitionRequirementsVerified: run.definitionRequirementsVerified, policyAuthority: run.policyAuthority }} />
    </div>
  );
}

function Refusal({ status, body, onRecover }: { status: number; body: ProductionErrorBody | null; onRecover: (action: RecoveryAction) => void }) {
  const code = body?.error.code ?? `HTTP_${status}`;
  return (
    <div className="surface-inset p-2 flex flex-col gap-1 text-[12px]" data-testid="refusal" data-code={code}>
      <div><span className="mono" style={{ color: 'var(--status-refused)' }}>{code}</span> <span style={faint}>· HTTP {status} · refused before execution; nothing was written unless the message says otherwise</span></div>
      <div style={muted}>{body?.error.message ?? 'The rail did not answer with its refusal envelope.'}</div>
      <div style={faint}>{errorText(code, 'No meaning is recorded for this code; it is shown verbatim.')}</div>
      {body?.error.details !== undefined && <Raw value={body.error.details} label="Details" />}
      <RecoveryButtons actions={errorRecovery(code)} onAct={onRecover} testId="refusal-recovery" />
    </div>
  );
}

function InspectionView({ inspection, onInspect }: { inspection: Inspection; onInspect: (kind: ProductionObjectKind, reference: { id: string; digest: string }) => void }) {
  if (inspection.status === 'LOADING') return <p className="m-0 text-[12px]" style={faint}>Reopening by exact reference…</p>;
  if (inspection.status === 'FAILED') return <div className="text-[12px]" data-testid="inspection-refused"><span className="mono" style={{ color: 'var(--status-refused)' }}>{inspection.code}</span> <span style={muted}>{inspection.message}</span><div style={faint}>{errorText(inspection.code, '')}</div></div>;
  const data = inspection.data;
  const candidate = data.candidate as Record<string, unknown> | null | undefined;
  const fields = candidate?.fields as Record<string, unknown> | undefined;
  const identity = candidate?.identity as Record<string, unknown> | undefined;
  const provenance = candidate?.provenance as Record<string, { id: string; digest?: string; contentDigest?: string }> | undefined;
  const members = data.members as Array<Record<string, unknown>> | undefined;
  const run = inspection.kind === 'RUN' ? data as unknown as ProductionRun : null;
  const evidence = data.evidence as Record<string, unknown> | undefined;
  const receipt = data.receipt as Record<string, unknown> | undefined;
  const sourcePolicy = data.sourcePolicy as Record<string, unknown> | undefined;
  const decision = (data.ingestDecision ?? data.deriveDecision) as Record<string, unknown> | undefined;
  const spec = data.spec as Record<string, unknown> | undefined;
  return (
    <div className="flex flex-col gap-3 text-[12px]" data-testid="inspection" data-kind={inspection.kind}>
      <Flags record={inspection.flags} testId="inspection-flags" />
      {typeof data.state === 'string' && <div><span className="label-sm">State</span> <span className="mono" style={{ color: data.state === 'UNADMITTED' || data.state === 'QUARANTINED' ? 'var(--status-conditional)' : 'var(--text-heading)' }}>{data.state}</span></div>}
      {inspection.kind === 'ACQUISITION' && (
        <dl className="kv m-0">
          <dt style={faint}>Evidence</dt><dd className="m-0"><span className="id">{String(evidence?.id)}</span> · {String(evidence?.byteLength)} bytes · {String(evidence?.mediaType)}<div><Digest value={String(evidence?.contentDigest)} /></div></dd>
          <dt style={faint}>Captured at</dt><dd className="m-0"><span className="ts">{fmtUtc(String(data.capturedAt), { seconds: true })}</span> <span style={faint}>· manifest clock</span></dd>
          <dt style={faint}>Receipt</dt><dd className="m-0"><span className="id">{String(receipt?.id)}</span> <Digest value={String(receipt?.digest)} copy={false} /> <span style={faint}>stored <span className="ts">{fmtUtc(String(receipt?.storedAt), { seconds: true })}</span></span></dd>
          <dt style={faint}>Source policy</dt><dd className="m-0"><span className="id">{String(sourcePolicy?.id)}</span> v{String(sourcePolicy?.policyVersion)} <Digest value={String(sourcePolicy?.digest)} copy={false} /></dd>
          <dt style={faint}>INGEST decision</dt><dd className="m-0 mono">{String(decision?.state)}</dd>
        </dl>
      )}
      {inspection.kind === 'NORMALIZATION' && (
        <>
          <dl className="kv m-0">
            <dt style={faint}>DERIVE decision</dt><dd className="m-0 mono">{String(decision?.state)}</dd>
            <dt style={faint}>Normalized at</dt><dd className="m-0"><span className="ts">{fmtUtc(String(data.normalizedAt), { seconds: true })}</span> <span style={faint}>· run clock, assigned after storage</span></dd>
            {Array.isArray(data.reasons) && data.reasons.length > 0 && <><dt style={faint}>Reasons</dt><dd className="m-0"><ul className="m-0 pl-4">{(data.reasons as string[]).map((reason) => <li key={reason} className="mono">{reason}</li>)}</ul></dd></>}
          </dl>
          {candidate ? (
            <div className="flex flex-col gap-1" data-testid="candidate">
              <div><span className="label-sm">Candidate</span> <span className="id">{String(candidate.candidateId)}</span> <span className="mono" style={{ color: 'var(--status-conditional)' }}>{String(candidate.state)}</span> <span style={faint}>· identity <span className="mono">{String(identity?.state)}</span> · canonical id <span className="mono">{String(identity?.canonicalId)}</span></span></div>
              <table className="ledger-table text-[11.5px]"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>{Object.entries(fields ?? {}).map(([key, value]) => <tr key={key}><td className="mono">{key}</td><td>{value === null || value === undefined ? <span style={faint}>null</span> : String(value)}</td></tr>)}</tbody></table>
              {Array.isArray(candidate.missingFields) && (candidate.missingFields as string[]).length > 0 && <div style={faint}>Missing fields, as missing: <span className="mono">{(candidate.missingFields as string[]).join(', ')}</span></div>}
              <div style={faint}>Valid time {JSON.stringify(candidate.validTime)} · known at <span className="ts">{fmtUtc(String(candidate.knownAt), { seconds: true })}</span></div>
              {provenance && <div className="flex flex-col gap-0.5"><span className="label-sm">Provenance</span>{Object.entries(provenance).map(([key, value]) => <div key={key} className="flex flex-wrap items-baseline gap-x-2"><span style={faint}>{key}</span><span className="id break-all">{value.id}</span>{(value.digest ?? value.contentDigest) && <Digest value={String(value.digest ?? value.contentDigest)} copy={false} />}{key === 'acquisition' && value.digest && <button type="button" className="btn btn-sm btn-quiet" onClick={() => onInspect('ACQUISITION', { id: value.id, digest: value.digest! })}>Inspect</button>}</div>)}</div>}
            </div>
          ) : <div style={muted} data-testid="no-candidate">No candidate: the quarantine keeps the bytes and the reasons; nothing is inferred from refused bytes.</div>}
        </>
      )}
      {inspection.kind === 'CANDIDATE_BUILD' && (
        <dl className="kv m-0">
          <dt style={faint}>Built at</dt><dd className="m-0"><span className="ts">{fmtUtc(String(data.builtAt), { seconds: true })}</span></dd>
          <dt style={faint}>Known through</dt><dd className="m-0"><span className="ts">{fmtUtc(String(data.knownThrough), { seconds: true })}</span> <span style={faint}>· the backend build start, never a browser-selected time</span></dd>
          <dt style={faint}>Records</dt><dd className="m-0">{String(data.recordCount)} · root <Digest value={String(data.recordsRoot)} copy={false} /></dd>
          <dt style={faint}>Members</dt><dd className="m-0"><ul className="m-0 p-0 list-none flex flex-col gap-1" data-testid="build-members">{(members ?? []).map((member, index) => { const normalization = member.normalization as { id: string; digest: string } | undefined; const candidateRef = member.candidate as { id: string; digest: string } | undefined; const memberIdentity = member.identity as Record<string, unknown> | undefined; const derive = member.deriveDecision as Record<string, unknown> | undefined; return <li key={normalization?.id ?? index} className="flex flex-col gap-0.5" data-member={normalization?.id}><div className="flex flex-wrap items-baseline gap-x-2"><span style={faint}>normalization</span><span className="id break-all">{normalization?.id ?? '?'}</span>{normalization && <><Digest value={normalization.digest} copy={false} /><button type="button" className="btn btn-sm btn-quiet" onClick={() => onInspect('NORMALIZATION', normalization)}>Inspect</button></>}</div>{candidateRef && <div className="flex flex-wrap items-baseline gap-x-2" style={faint}><span>candidate</span><span className="id break-all">{candidateRef.id}</span><Digest value={candidateRef.digest} copy={false} /></div>}<div style={faint}>identity <span className="mono">{String(memberIdentity?.state ?? '?')}</span> · canonical id <span className="mono">{String(memberIdentity?.canonicalId ?? null)}</span> · source class <span className="mono">{String(member.sourceClass ?? '?')}</span> · known at <span className="ts">{fmtUtc(String(member.knownAt), { seconds: true })}</span> · DERIVE at build <span className="mono">{String(derive?.state ?? '?')}</span></div></li>; })}</ul></dd>
        </dl>
      )}
      {run && <Stages run={run} onInspect={onInspect} />}
      {(inspection.kind === 'CORPUS' || inspection.kind === 'SOURCE') && spec && <Flags record={{ id: String(spec.id), version: String(spec.version), ...(spec.domain ? { domain: String(spec.domain), recordType: String(spec.recordType) } : {}), ...(spec.provider ? { provider: String(spec.provider) } : {}) }} />}
      {inspection.kind === 'CONTENT' && <div style={muted}>{String(data.byteLength)} retained bytes under their digest. Unbound: no acquisition, no source binding, no receipt is claimed for them.</div>}
      <Raw value={data} />
    </div>
  );
}

/** One continuous path: source → acquisition → normalization → candidate build → inspection → notation → release, over the real local rail where it is enabled. */
export function ProductionPath({ enabled, demo, definition, sourceTemplate, purpose, carrier, fmcsa, fetchImpl, defaultName }: ProductionPathProps) {
  const send = useMemo(() => fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)), [fetchImpl]);
  const [name, setName] = useState(defaultName ?? `path-${new Date().toISOString().slice(0, 10)}`);
  const [nameDraft, setNameDraft] = useState(name);
  const [session, setSession] = useState<PathSession>(() => emptySession(name));
  const [bytesMode, setBytesMode] = useState<'EXAMPLE' | 'PASTED'>('EXAMPLE');
  const [pasted, setPasted] = useState('');
  const [catalog, setCatalog] = useState<CatalogState>(enabled ? { status: 'LOADING' } : { status: 'DISABLED' });
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [readback, setReadback] = useState<Readback>(enabled ? { status: 'LOADING' } : { status: 'UNAVAILABLE' });
  const [copied, setCopied] = useState('');
  const pastedField = useRef<HTMLTextAreaElement>(null);
  const mode: 'LOCAL' | 'FIXTURE' = enabled && catalog.status !== 'DISABLED' ? 'LOCAL' : 'FIXTURE';

  const refreshCatalog = useCallback(async () => {
    try {
      const response = await send('/api/production', { cache: 'no-store' });
      const body = await response.json().catch(() => null) as Catalog | Availability | ProductionErrorBody | null;
      if (!response.ok) { const error = (body as ProductionErrorBody | null)?.error; setCatalog({ status: 'ERROR', code: error?.code ?? `HTTP_${response.status}`, message: error?.message ?? 'The rail did not answer.' }); return; }
      if (body && 'enabled' in body && body.enabled === false) { setCatalog({ status: 'DISABLED' }); return; }
      if (body && body.schema === 'payload.production-catalog.v1') setCatalog({ status: 'READY', catalog: body });
    } catch { setCatalog({ status: 'ERROR', code: 'UNREACHABLE', message: 'The rail could not be reached on this origin.' }); }
  }, [send]);

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      await refreshCatalog();
      try {
        const response = await send(`/api/production/source-captures/${encodeURIComponent(fmcsa.request.requestId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => null) as { inspection?: Record<string, unknown> } & Partial<ProductionErrorBody> | null;
        if (response.ok && body?.inspection) {
          const inspectionRecord = body.inspection;
          const observations = inspectionRecord.observations as { records?: unknown[]; notReturned?: string[] } | null;
          const acquisition = inspectionRecord.acquisition as { capturedAt?: string } | null;
          setReadback({ status: 'FOUND', inspection: inspectionRecord, summary: { state: inspectionRecord.state as SourceReadbackSummary['state'], requestId: fmcsa.request.requestId, capturedAt: acquisition?.capturedAt ?? null, records: observations?.records?.length ?? 0, notReturned: observations?.notReturned?.length ?? 0 } });
        } else if (response.status === 404) setReadback({ status: 'NOT_FOUND', code: body?.error?.code ?? 'SOURCE_CAPTURE_NOT_FOUND' });
        else setReadback({ status: 'ERROR', code: body?.error?.code ?? `HTTP_${response.status}`, message: body?.error?.message ?? 'The readback was refused.' });
      } catch { setReadback({ status: 'ERROR', code: 'UNREACHABLE', message: 'The readback could not be reached on this origin.' }); }
    })();
  }, [enabled, send, fmcsa.request.requestId, refreshCatalog]);

  const inspect = useCallback(async (kind: ProductionObjectKind, reference: { id: string; digest: string }) => {
    // An exact reference is exactly an identifier and a digest: an output's kind travels separately.
    const exact = { id: reference.id, digest: reference.digest };
    setInspection({ kind, reference: exact, status: 'LOADING' });
    try {
      const response = await send('/api/production/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schema: 'payload.production-inspection-request.v1', kind, reference: exact }), cache: 'no-store' });
      const body = await response.json().catch(() => null) as ({ data: Record<string, unknown> } & Record<string, unknown>) | ProductionErrorBody | null;
      if (!response.ok || !body || !('data' in body)) { const error = (body as ProductionErrorBody | null)?.error; setInspection({ kind, reference: exact, status: 'FAILED', code: error?.code ?? `HTTP_${response.status}`, message: error?.message ?? 'The rail did not answer.' }); return; }
      const { data, ...flags } = body;
      delete (flags as Record<string, unknown>).schema; delete (flags as Record<string, unknown>).reference; delete (flags as Record<string, unknown>).kind;
      setInspection({ kind, reference: exact, status: 'DONE', data, flags });
    } catch { setInspection({ kind, reference: exact, status: 'FAILED', code: 'UNREACHABLE', message: 'The rail could not be reached on this origin.' }); }
  }, [send]);

  const inputs = stepInputs(session);
  const refs = useMemo(() => ({
    corpus: outputOf(session.corpus.result, 'CORPUS'), source: outputOf(session.source.result, 'SOURCE'),
    acquisition: outputOf(session.capture.result, 'ACQUISITION'), normalization: session.normalize.result?.run.state === 'COMPLETED' ? outputOf(session.normalize.result, 'NORMALIZATION') : null, build: outputOf(session.build.result, 'CANDIDATE_BUILD'),
  }), [session]);
  const bytes = bytesMode === 'EXAMPLE' ? { text: carrier.text, base64: carrier.base64, byteLength: carrier.byteLength, label: carrier.path } : { text: pasted, base64: toBase64(pasted), byteLength: byteLength(pasted), label: 'pasted bytes' };

  function commandFor(step: StepKey): Record<string, unknown> {
    const requestId = session[step].requestId;
    const base = { schema: 'payload.production-command.v1', requestId };
    switch (step) {
      case 'corpus': return { ...base, kind: 'REGISTER_CORPUS', definition };
      case 'source': return { ...base, kind: 'REGISTER_SOURCE', source: { ...sourceTemplate, corpus: { id: refs.corpus!.id, digest: refs.corpus!.digest } } };
      case 'capture': return { ...base, kind: 'ACQUIRE', source: { id: refs.source!.id, digest: refs.source!.digest }, purpose, contentBase64: bytes.base64 };
      case 'normalize': return { ...base, kind: 'NORMALIZE', source: { id: refs.source!.id, digest: refs.source!.digest }, acquisition: { id: refs.acquisition!.id, digest: refs.acquisition!.digest }, purpose };
      case 'build': return { ...base, kind: 'BUILD_CANDIDATES', corpus: { id: refs.corpus!.id, digest: refs.corpus!.digest }, members: [{ id: refs.normalization!.id, digest: refs.normalization!.digest }], purpose };
    }
  }

  async function sendStep(step: StepKey) {
    if (!inputs[step].ready || session[step].status === 'RUNNING') return;
    const command = commandFor(step);
    setSession((current) => ({ ...current, [step]: { ...current[step], status: 'RUNNING', result: undefined, error: undefined } }));
    try {
      const response = await send('/api/production', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), cache: 'no-store' });
      const body = await response.json().catch(() => null) as ProductionResult | ProductionErrorBody | null;
      if (response.ok && body && 'run' in body) setSession((current) => ({ ...current, [step]: { ...current[step], status: 'DONE', result: body } }));
      else setSession((current) => ({ ...current, [step]: { ...current[step], status: 'FAILED', error: { status: response.status, body: body && 'error' in body ? body : null } } }));
    } catch { setSession((current) => ({ ...current, [step]: { ...current[step], status: 'FAILED', error: { status: 0, body: null } } })); }
    void refreshCatalog();
  }

  /** A new identity for this step and every later one: their inputs change with it, and an identity never names different inputs. */
  function newIdentity(step: StepKey) {
    setSession((current) => {
      const next = { ...current };
      for (const key of STEP_ORDER.slice(STEP_ORDER.indexOf(step))) next[key] = { requestId: nextAttemptName(current[key].requestId), status: 'IDLE' };
      return next;
    });
  }

  function recover(step: StepKey, action: RecoveryAction) {
    if (action.kind === 'RETRY_IDENTICAL' || action.kind === 'WAIT') void sendStep(step);
    else if (action.kind === 'NEW_IDENTITY') newIdentity(step);
    else if (action.kind === 'INSPECT_OUTPUTS' || action.kind === 'INSPECT_QUARANTINE') {
      const run = session[step].result?.run;
      if (!run) return;
      const output = action.kind === 'INSPECT_QUARANTINE' ? run.outputs.find((item) => item.kind === 'NORMALIZATION') ?? run.outputs[0] : run.outputs[0];
      if (output) void inspect(output.kind, output); else void inspect('RUN', { id: run.id, digest: run.digest });
    } else if (action.kind === 'CORRECT_INPUT') { setBytesMode('PASTED'); pastedField.current?.focus(); }
  }

  function applyName() {
    try { requestIds(nameDraft); } catch { return; }
    setName(nameDraft); setSession(emptySession(nameDraft));
  }
  const nameValid = (() => { try { requestIds(nameDraft); return true; } catch { return false; } })();

  const stages: StageView[] = deriveStages({ mode, session, sourceReadback: mode === 'LOCAL' ? (readback.status === 'FOUND' ? { status: 'FOUND', summary: readback.summary } : readback.status === 'NOT_FOUND' ? { status: 'NOT_FOUND', code: readback.code } : readback.status === 'ERROR' ? { status: 'ERROR', code: readback.code } : { status: 'LOADING' }) : null, demo });
  const running = STEP_ORDER.some((step) => session[step].status === 'RUNNING');
  const reference = refs.build && session.build.result ? buildReference(refs.build, session.build.result.run) : null;

  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied('Copied.'); } catch { setCopied('Copy by hand: the clipboard is not available here.'); } }

  return (
    <div className={`workspace${inspection ? ' has-inspector' : ''}`} data-testid="production-path" data-mode={mode} data-inspecting={inspection ? `${inspection.kind}:${inspection.reference.id}` : 'none'}>
      <div className="workspace-top flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">Corpus</span><span className="label-sm" style={{ color: mode === 'LOCAL' ? 'var(--check-passed)' : 'var(--status-pending)' }} data-testid="path-mode">{mode === 'LOCAL' ? 'LOCAL RAIL' : 'FIXTURE'}</span><span className="label-sm">CARAVAN · Carrier</span></div>
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Production path</h1>
          <p className="m-0 text-[13px]" style={muted}>One continuous path from a source observation to a versioned information product. Each stage shows the object the rails actually produced, the run that produced or refused it, and what can be done next. Where the path cannot continue, the stage names the contract or authority that is missing. Nothing here admits, resolves identity or releases.</p>
        </header>

        <section aria-labelledby="path-rail-h" className="flex flex-col gap-2">
          <h2 id="path-rail-h" className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>The path</h2>
          <ol className="path-rail" data-testid="path-rail">
            {stages.map((stage, index) => (
              <li key={stage.id} data-stage={stage.id} data-state={stage.state} title={STAGE_STATE_MEANING[stage.state]}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1"><span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-heading)' }}>{index + 1} · {stage.label}</span><Pill text={stage.state} color={STATE_COLOR[stage.state]} title={STAGE_STATE_MEANING[stage.state]} /></div>
                <div className="text-[11.5px]" style={faint}>{stage.does}</div>
                <div className="text-[12px]" style={muted} data-testid={`stage-${stage.id}-detail`}>{stage.detail}</div>
                {stage.object && <div className="text-[11px]"><Ref reference={stage.object} /></div>}
                {stage.run && <div className="text-[11px]" style={faint}>run <span className="id">{stage.run.id}</span> · <span className="mono" style={{ color: RUN_COLOR[stage.run.state] }}>{stage.run.state}</span></div>}
                {stage.href && <Link href={stage.href} className="text-[11.5px]" style={{ color: 'var(--info)' }}>{stage.state === 'DEMONSTRATION' ? 'See the demonstration' : stage.id === 'notation' ? 'Open notations' : 'Open releases'}</Link>}
              </li>
            ))}
          </ol>
        </section>

        {mode === 'FIXTURE' ? (
          <div className="empty-state" data-testid="rail-disabled">
            <p className="m-0 text-[13px] font-medium" style={{ color: 'var(--text-heading)' }}>The local rail is not enabled on this origin.</p>
            <p className="m-0 text-[12.5px]" style={muted}>{BLOCKERS.railDisabled.what} {catalog.status === 'ERROR' && <>The rail answered <span className="mono">{catalog.code}</span>: {catalog.message}</>}</p>
            <pre className="source-bytes m-0 whitespace-pre-wrap">{'npm run dev:production\n# then open http://127.0.0.1:3000/production on that machine'}</pre>
            <p className="m-0 text-[12px]" style={faint}>The stages above show the committed demonstration, produced through the same rails from the committed examples at fixed instants. It is UNADMITTED and in no release.</p>
          </div>
        ) : (
          <section aria-labelledby="console-h" className="flex flex-col gap-3" data-testid="run-console">
            <div className="flex flex-wrap items-end gap-3">
              <h2 id="console-h" className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>Run the rail</h2>
              <div className="flex flex-col gap-1">
                <label htmlFor="pp-name" className="label-sm">Run name · five request identities</label>
                <div className="flex gap-2"><input id="pp-name" className="surface-inset px-2 py-1 text-[12.5px] mono" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} disabled={running} aria-invalid={!nameValid} /><button type="button" className="btn btn-sm" onClick={applyName} disabled={running || !nameValid || nameDraft === name}>Start over with this name</button></div>
                {!nameValid && <span className="text-[11px]" style={{ color: 'var(--status-refused)' }}>1 to 100 characters: letters, digits, and : _ . - ; it starts with a letter or a digit.</span>}
              </div>
              {catalog.status === 'ERROR' && <span className="text-[12px]" style={{ color: 'var(--status-refused)' }} data-testid="catalog-error"><span className="mono">{catalog.code}</span> · {catalog.message} · {errorText(catalog.code, '')}</span>}
            </div>
            <p className="m-0 text-[12px]" style={faint}>An identity, once used, names its inputs forever: the same command returns the historical receipt; a changed command is a conflict; a new attempt is a new identity. HTTP 200 is not completion: the run’s own state says what happened, stage by stage.</p>
            <ol className="m-0 p-0 list-none flex flex-col gap-3">
              {STEP_ORDER.map((step, index) => {
                const outcome = session[step]; const meta = STEP_LABEL[step]; const ready = inputs[step].ready;
                return (
                  <li key={step} className="surface p-3 flex flex-col gap-2" data-testid={`step-${step}`} data-status={outcome.status} data-run-state={outcome.result?.run.state ?? (outcome.error ? 'REFUSED' : 'none')} data-request-id={outcome.requestId}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>{index + 1}. {meta.label}</h3>
                      <span className="text-[11px]" style={faint}>request <span className="id">{outcome.requestId}</span> · <span className="mono">{meta.kind}</span></span>
                    </div>
                    {step === 'corpus' && <div className="text-[12px]" style={muted}>Definition <span className="id">{definition.id}</span> v{definition.version} · {definition.domain} / {definition.recordType} · fields {definition.requiredFields.join(', ')} · coverage {definition.coverage.geography}. Registration validates configuration, not connectivity, authorization or source truth.</div>}
                    {step === 'source' && <div className="text-[12px]" style={muted}>Source <span className="id">{sourceTemplate.id}</span> v{sourceTemplate.version} · {sourceTemplate.provider} · method {sourceTemplate.method} · adapter <span className="mono">{sourceTemplate.adapter.id}</span> {sourceTemplate.adapter.version} · policy <span className="id">{sourceTemplate.policy.registrationId}</span> ({sourceTemplate.policy.allowedOperations.join(', ')}; {sourceTemplate.policy.allowedAudiences.join(', ')}) · bound to {refs.corpus ? <Ref reference={refs.corpus} /> : <span style={faint}>the corpus reference, once registered</span>}</div>}
                    {step === 'capture' && (
                      <div className="flex flex-col gap-2 text-[12px]">
                        <div style={muted}>Bytes enter unchanged under INGEST, with a content digest and a receipt. Parsing is not performed here: malformed bytes are captured as bytes, and normalization decides.</div>
                        <fieldset className="m-0 p-0 border-0 flex flex-wrap gap-3"><legend className="label-sm">Bytes</legend>
                          <label className="flex items-center gap-1"><input type="radio" name="pp-bytes" checked={bytesMode === 'EXAMPLE'} onChange={() => setBytesMode('EXAMPLE')} disabled={outcome.status === 'RUNNING'} /> committed Carrier example <span className="id">{carrier.path}</span> · {carrier.byteLength} bytes</label>
                          <label className="flex items-center gap-1"><input type="radio" name="pp-bytes" checked={bytesMode === 'PASTED'} onChange={() => setBytesMode('PASTED')} disabled={outcome.status === 'RUNNING'} /> pasted bytes</label>
                        </fieldset>
                        {bytesMode === 'EXAMPLE' ? <pre className="source-bytes m-0 whitespace-pre-wrap">{carrier.text}</pre> : <><label htmlFor="pp-pasted" className="label-sm">Source bytes to capture, as text (UTF-8)</label><textarea id="pp-pasted" ref={pastedField} className="surface-inset px-2 py-1 text-[12px] mono w-full min-h-[96px]" value={pasted} onChange={(event) => setPasted(event.target.value)} disabled={outcome.status === 'RUNNING'} spellCheck={false} /><span style={faint}>{bytes.byteLength} bytes · limit 1 MiB decoded · Carrier parsing caps at 64 KiB</span></>}
                      </div>
                    )}
                    {step === 'normalize' && <div className="text-[12px]" style={muted}>A separate DERIVE decision, then the fixed adapter <span className="mono">{sourceTemplate.adapter.id}</span> over {refs.acquisition ? <Ref reference={refs.acquisition} /> : <span style={faint}>the acquisition, once captured</span>}. A contract mismatch is a quarantine with no candidate, kept for reinspection.</div>}
                    {step === 'build' && <div className="text-[12px]" style={muted}>Members: {refs.normalization ? <Ref reference={refs.normalization} /> : <span style={faint}>a NORMALIZED run, once one exists</span>} under corpus {refs.corpus ? <Ref reference={refs.corpus} /> : <span style={faint}>(pending)</span>}. Cutoff is the backend build start. The build stays UNADMITTED; no release activates.</div>}
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="btn btn-sm btn-primary" disabled={!ready || outcome.status === 'RUNNING' || (step === 'capture' && bytesMode === 'PASTED' && !pasted.length)} onClick={() => void sendStep(step)} data-testid={`send-${step}`}>{outcome.status === 'RUNNING' ? 'Sending…' : outcome.result || outcome.error ? `${meta.verb} again (same identity)` : meta.verb}</button>
                      {!ready && <span className="text-[11.5px]" style={faint}>needs {inputs[step].missing.join(' and ')}</span>}
                      {(outcome.result || outcome.error) && <button type="button" className="btn btn-sm" onClick={() => newIdentity(step)} disabled={running}>New identity from here</button>}
                    </div>
                    {outcome.result && <Receipt result={outcome.result} onInspect={inspect} onRecover={(action) => recover(step, action)} />}
                    {outcome.error && <Refusal status={outcome.error.status} body={outcome.error.body} onRecover={(action) => recover(step, action)} />}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>

      {inspection && (
        <Inspector id="pp-inspector" kicker={`${inspection.kind.replace(/_/g, ' ')} · exact reference · integrity recomputed on read`} title={inspection.reference.id} subtitle={<Digest value={inspection.reference.digest} />} onClose={() => setInspection(null)} focusOnNarrow testId="production-inspector">
          <div className="inspector-body"><InspectionView inspection={inspection} onInspect={inspect} /></div>
        </Inspector>
      )}

      <div className="workspace-bottom flex flex-col gap-4">
        <Part title="Source · a real observation: FMCSA Company Census, operator capture" testId="source-card">
          <p className="m-0 text-[12px]" style={muted}>The one real source observation the system holds today. Captured by the operator CLI under a time-bounded internal qualification policy; read back here without collecting, where the rail is enabled and the capture exists in this machine’s qualification root. <span className="mono">notReturned</span> stays not returned, never nonexistence.</p>
          <dl className="kv m-0 text-[12px]">
            <dt style={faint}>Request</dt><dd className="m-0"><span className="id">{fmcsa.request.requestId}</span> · source <span className="mono">{fmcsa.request.sourceId}</span> · USDOT {fmcsa.request.usdot.join(', ')} · <span className="mono">{fmcsa.requestPath}</span></dd>
            <dt style={faint}>Policy</dt><dd className="m-0"><span className="id">{fmcsa.policy.registrationId}</span> v{fmcsa.policy.policyVersion} · {fmcsa.policy.sourceClass} · licence <span className="mono">{fmcsa.policy.licenseId}</span><div style={faint}>effective <span className="ts">{fmtUtc(fmcsa.policy.effectiveFrom)}</span> → {fmcsa.policy.effectiveUntil ? <span className="ts">{fmtUtc(fmcsa.policy.effectiveUntil)}</span> : 'open'} · purposes {fmcsa.policy.permittedPurposes.join(', ')} · operations {fmcsa.policy.allowedOperations.join(', ')} · audiences {fmcsa.policy.allowedAudiences.join(', ')} · retention {fmcsa.policy.retention.mode}</div></dd>
            <dt style={faint}>Fields</dt><dd className="m-0 mono break-words">{fmcsa.fields.join(' · ')}</dd>
            <dt style={faint}>Readback</dt><dd className="m-0" data-testid="source-readback" data-status={readback.status}>
              {readback.status === 'UNAVAILABLE' && <span style={muted}>Needs the local rail. From the repository: <span className="mono">npm run source -- inspect --request-id {fmcsa.request.requestId}</span></span>}
              {readback.status === 'LOADING' && <span style={faint}>Reading…</span>}
              {readback.status === 'NOT_FOUND' && <span style={muted}><span className="mono">{readback.code}</span> · {errorText(readback.code, '')} Nothing was collected; the operator command captures, this page does not.</span>}
              {readback.status === 'ERROR' && <span style={{ color: 'var(--status-refused)' }}><span className="mono">{readback.code}</span> · {readback.message}</span>}
              {readback.status === 'FOUND' && (() => { const i = readback.inspection; const acq = i.acquisition as Record<string, unknown> | null; const obs = i.observations as { records: Array<Record<string, string | null>>; notReturned: string[] } | null; const receipt = i.receipt as Record<string, unknown> | null; return (
                <div className="flex flex-col gap-1">
                  <div><span className="mono" style={{ color: readback.summary.state === 'CAPTURED' ? 'var(--check-passed)' : 'var(--status-refused)' }}>{readback.summary.state}</span> {acq && <span style={faint}>· captured <span className="ts">{fmtUtc(String(acq.capturedAt), { seconds: true })}</span> · {String(acq.byteLength)} source-original bytes · acquisition <span className="id">{String(acq.id)}</span></span>}</div>
                  {acq && <div className="flex flex-wrap gap-x-3 text-[11px]"><span>bytes <Digest value={String(acq.contentDigest)} copy={false} /></span><span>acquisition <Digest value={String(acq.digest)} copy={false} /></span>{receipt && <span>receipt <Digest value={String(receipt.digest)} copy={false} /></span>}</div>}
                  {obs && <div className="overflow-x-auto"><table className="ledger-table text-[11.5px]" data-testid="census-records"><thead><tr><th>USDOT</th><th>Legal name</th><th>Status</th><th>State</th><th>Power units</th><th>Drivers</th><th>MCS-150 date</th><th>Identity</th></tr></thead><tbody>{obs.records.map((record) => <tr key={String(record.dot_number)}><td className="mono">{record.dot_number}</td><td>{record.legal_name}</td><td className="mono">{record.status_code ?? 'null'}</td><td className="mono">{record.phy_state ?? 'null'}</td><td className="mono">{record.power_units ?? 'null'}</td><td className="mono">{record.total_drivers ?? 'null'}</td><td className="mono">{record.mcs150_date ?? 'null'}</td><td className="mono">{record.identityStatus} · {String(record.canonicalId)}</td></tr>)}</tbody></table>{obs.notReturned.length > 0 && <div style={faint}>Not returned by this bounded, corporate-only query: <span className="mono">{obs.notReturned.join(', ')}</span>. Not proof of nonexistence.</div>}</div>}
                  <Flags record={{ integrity: String(i.integrity), canonicalAdmission: false, sourceTruthClaimed: false, customerDistributionPermitted: false, independentVerification: false }} />
                  <Raw value={i} />
                </div>); })()}
            </dd>
          </dl>
          <BlockerView blocker={BLOCKERS.fmcsaAdapter} />
        </Part>

        <Part title="Notation · refer to exact evidence" testId="notation-card">
          <p className="m-0 text-[12px]" style={muted}>A notation refers to an exact object by kind, identifier and digest, and keeps the author’s interpretation apart from the evidence. The reference copies nothing and promotes nothing.</p>
          {reference ? (
            <div className="flex flex-col gap-1" data-testid="build-reference" data-target={reference.targetId}>
              <div className="flex flex-wrap items-center gap-2 text-[12px]"><span className="label-sm">Reference to the build</span><Pill text="attachment DISABLED" color="var(--status-conditional)" /><button type="button" className="btn btn-sm" onClick={() => void copy(JSON.stringify(reference, null, 2))}>Copy reference</button>{copied && <span style={faint} role="status">{copied}</span>}<Link href="/notations" className="text-[11.5px]" style={{ color: 'var(--info)' }}>Open notations</Link></div>
              <pre className="source-bytes m-0 whitespace-pre-wrap break-all">{JSON.stringify(reference, null, 2)}</pre>
            </div>
          ) : <p className="m-0 text-[12px]" style={faint} data-testid="no-reference">A reference needs an exact object. Build a candidate above, and the reference the workspace would attach appears here.</p>}
          <BlockerView blocker={BLOCKERS.notation} />
        </Part>

        <Part title="Release · a versioned product" testId="release-card">
          <p className="m-0 text-[12px]" style={muted}>What exists: the committed corpus releases, with certification, production record and supersession, under <Link href="/releases" style={{ color: 'var(--info)' }}>Releases</Link>, answered as-of through the <Link href="/stream" style={{ color: 'var(--info)' }}>stream</Link>. What does not: a route from a candidate build here into one of them.</p>
          <BlockerView blocker={BLOCKERS.release} />
        </Part>

        {mode === 'LOCAL' && (
          <Part title="Catalog · what this rail holds" testId="catalog">
            {catalog.status === 'LOADING' && <p className="m-0 text-[12px]" style={faint}>Reading…</p>}
            {catalog.status === 'ERROR' && <p className="m-0 text-[12px]" style={{ color: 'var(--status-refused)' }}><span className="mono">{catalog.code}</span> · {catalog.message}</p>}
            {catalog.status === 'READY' && (
              <div className="flex flex-col gap-2 text-[12px]">
                <div style={faint}>{catalog.catalog.corpora.length} corpora · {catalog.catalog.sources.length} sources · {catalog.catalog.runs.length} runs · bounded at 64, 64 and 128 with no automatic archive. Configuration establishes no connectivity and grants no permission.</div>
                <ul className="m-0 p-0 list-none flex flex-col gap-0.5" aria-label="Registrations">{catalog.catalog.corpora.map((entry) => <li key={entry.reference.id} className="flex flex-wrap items-baseline gap-x-2"><span className="label-sm">corpus</span><Ref reference={entry.reference} /><span style={faint}>v{entry.version} · {entry.domain} / {entry.recordType}</span><button type="button" className="btn btn-sm btn-quiet" onClick={() => void inspect('CORPUS', entry.reference)}>Inspect</button></li>)}{catalog.catalog.sources.map((entry) => <li key={entry.reference.id} className="flex flex-wrap items-baseline gap-x-2"><span className="label-sm">source</span><Ref reference={entry.reference} /><span style={faint}>v{entry.version} · {entry.adapter.id} · configuration only</span><button type="button" className="btn btn-sm btn-quiet" onClick={() => void inspect('SOURCE', entry.reference)}>Inspect</button></li>)}</ul>
                <div className="overflow-x-auto"><table className="ledger-table text-[11.5px]" data-testid="catalog-runs"><thead><tr><th>Run</th><th>Kind</th><th>State</th><th>Started</th><th>Outputs</th><th></th></tr></thead><tbody>{catalog.catalog.runs.map((entry) => <tr key={entry.id} data-run={entry.id} data-state={entry.state}><td className="id">{entry.id}</td><td className="mono">{entry.kind}</td><td><span className="mono" style={{ color: RUN_COLOR[entry.state] ?? 'inherit' }}>{entry.state}</span></td><td className="ts">{fmtUtc(entry.startedAt, { seconds: true })}</td><td>{entry.reference ? String(entry.outputCount ?? 0) : <span style={faint}>retained: {JSON.stringify(entry.outputs ?? [])}</span>}</td><td>{entry.reference ? <button type="button" className="btn btn-sm btn-quiet" onClick={() => void inspect('RUN', entry.reference!)}>Inspect run</button> : <span style={faint}>incomplete: inspect retained outputs; never rerun blindly</span>}</td></tr>)}</tbody></table></div>
              </div>
            )}
          </Part>
        )}
      </div>
    </div>
  );
}
