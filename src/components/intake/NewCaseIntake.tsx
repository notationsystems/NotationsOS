'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { AdmissionProfile, AssuranceClass, ClaimStrength, EvidenceKind, Interest, PartyRole, ProductionClass, ToleranceKind, VisibilityClass } from '@/domain/types';
import { ASSURANCE_CLASSES, VISIBILITY_CLASSES } from '@/domain/types';
import { ASSURANCE_SEMANTICS, VISIBILITY_SEMANTICS } from '@/domain/selectors';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { EvidenceClassBadge } from '@/components/primitives/EvidenceClassBadge';
import { ROLE_LABEL } from '@/components/primitives/PartyRoleBadge';
import { fmtUtc, humanize } from '@/lib/format';

const STEPS = ['Subject', 'Intended use', 'Claims', 'Evidence', 'Time basis', 'Admission profile', 'Review and submit'] as const;

interface DraftClaim { predicate: string; title: string; value: string; unit: string; basis: string }
interface DraftEvidence { title: string; kind: EvidenceKind; producer: string; producerRole: PartyRole; visibility: VisibilityClass; claimStrength: ClaimStrength; productionClass: ProductionClass; interest: Interest; knownAt: string }

interface Draft {
  subjectType: string;
  subjectId: string;
  displayName: string;
  sponsor: string;
  claimant: string;
  useCode: string;
  toleranceKind: ToleranceKind;
  toleranceValue: string;
  toleranceUnit: string;
  requestedAssurance: AssuranceClass;
  claims: DraftClaim[];
  evidence: DraftEvidence[];
  validAt: string;
  knownAt: string;
  profileId: string;
  profileVersion: string;
}

const EVIDENCE_KINDS: EvidenceKind[] = ['INSPECTION_CERTIFICATE', 'LABORATORY_REPORT', 'WEIGHT_RECORD', 'BILL_OF_LADING', 'CUSTODY_RECORD', 'CONTRACT', 'SPECIFICATION', 'SENSOR_COMMITMENT', 'CORRESPONDENCE', 'PHOTOGRAPH', 'REGISTRY_EXTRACT', 'OTHER'];

/**
 * Staged intake. Nothing here evaluates: "Save draft" keeps a draft in this
 * page's state and says so; "Submit" produces a submission intent and says
 * that no evaluation has run. The review step refuses to let the declared
 * use, tolerance, valid time, knowledge cutoff, evidence visibility or
 * evidence producer go unnoticed.
 */
export function NewCaseIntake({ profiles }: { profiles: AdmissionProfile[] }) {
  const p0 = profiles[0];
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [d, setD] = useState<Draft>({
    subjectType: 'Transport lot', subjectId: '', displayName: '', sponsor: 'Harbourline Brokerage', claimant: '',
    useCode: '', toleranceKind: 'RELATIVE', toleranceValue: '', toleranceUnit: '', requestedAssurance: 'UNVERIFIED_EVALUATION',
    claims: [], evidence: [], validAt: '', knownAt: '', profileId: p0?.profileId ?? '', profileVersion: p0?.version ?? '',
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const profile = useMemo(() => profiles.find((p) => p.profileId === d.profileId), [profiles, d.profileId]);
  const useDef = profile?.useCodes.find((u) => u.useCode === d.useCode);

  const missing: string[] = [];
  if (!d.displayName || !d.subjectId) missing.push('Subject identity');
  if (!d.useCode) missing.push('Intended use');
  if (d.toleranceKind !== 'PROFILE_DEFINED' && !d.toleranceValue) missing.push('Requested tolerance');
  if (d.claims.length === 0) missing.push('At least one claim');
  if (d.evidence.length === 0) missing.push('At least one evidence artifact');
  if (d.evidence.some((e) => !e.producer)) missing.push('Producer on every evidence artifact');
  if (!d.validAt) missing.push('Valid time (world state)');
  if (!d.knownAt) missing.push('Knowledge-time cutoff');
  if (!d.profileId) missing.push('Admission profile');

  const addClaim = () => set('claims', [...d.claims, { predicate: '', title: '', value: '', unit: '', basis: '' }]);
  const addEvidence = () => set('evidence', [...d.evidence, { title: '', kind: 'INSPECTION_CERTIFICATE', producer: '', producerRole: 'EVIDENCE_PRODUCER', visibility: 'COUNTERPARTY_SHARED', claimStrength: 'reported', productionClass: 'unclassified', interest: 'unknown', knownAt: '' }]);
  const upd = <T,>(arr: T[], i: number, patch: Partial<T>) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x));

  const input = 'surface-inset px-2 py-1.5 text-[13px] w-full';
  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1">
      <span className="label-sm">{label}</span>
      {el}
      {hint && <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col min-h-full" data-testid="new-case-intake">
      <FixtureBanner note="Intake writes nothing to a backend. A saved draft lives in this page; a submission produces an intent and no evaluation runs." />
      <div className="max-w-[1000px] w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: 'var(--text-muted)' }}><Link href="/cases">Cases</Link> <span aria-hidden="true">/</span> New case</nav>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>New case</h1>
          <RulingStatusPill status="DRAFT" />
        </div>

        <ol className="m-0 p-0 list-none flex flex-wrap gap-1" aria-label="Intake steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} className="btn btn-sm" style={i === step ? { borderColor: 'var(--border-accent)', color: 'var(--accent-strong)' } : undefined}>
                <span className="mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{i + 1}</span> {s}
              </button>
            </li>
          ))}
        </ol>

        <form className="surface p-4 flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} aria-labelledby="step-h">
          <h2 id="step-h" className="m-0 text-[15px] font-semibold" style={{ color: 'var(--text-heading)' }}>{step + 1}. {STEPS[step]}</h2>

          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {field('Subject type', <input className={input} value={d.subjectType} onChange={(e) => set('subjectType', e.target.value)} />)}
              {field('Subject identifier', <input className={`${input} mono`} value={d.subjectId} onChange={(e) => set('subjectId', e.target.value)} placeholder="LOT-…" />)}
              {field('Display name', <input className={input} value={d.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Specialty Cargo Lot …" />)}
              {field('Claim sponsor', <input className={input} value={d.sponsor} onChange={(e) => set('sponsor', e.target.value)} />, 'The party submitting the case and requesting reliance.')}
              {field('Claimant', <input className={input} value={d.claimant} onChange={(e) => set('claimant', e.target.value)} placeholder="Who asserts the claims" />, 'The claimant asserts; nothing becomes evidence by assertion.')}
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {field('Intended use', (
                <select className={input} value={d.useCode} onChange={(e) => { const u = profile?.useCodes.find((x) => x.useCode === e.target.value); set('useCode', e.target.value); if (u?.defaultTolerance) { set('toleranceKind', u.defaultTolerance.kind); set('toleranceValue', u.defaultTolerance.value !== undefined ? String(u.defaultTolerance.value) : ''); set('toleranceUnit', u.defaultTolerance.unit ?? ''); } }}>
                  <option value="">Select a use code</option>
                  {profile?.useCodes.map((u) => <option key={u.useCode} value={u.useCode}>{u.purpose} — {u.useCode}</option>)}
                </select>
              ), 'The ruling is scoped to this use. A different use is a different ruling.')}
              {field('Tolerance kind', <select className={input} value={d.toleranceKind} onChange={(e) => set('toleranceKind', e.target.value as ToleranceKind)}>{(['ABSOLUTE', 'RELATIVE', 'INTERVAL', 'PROFILE_DEFINED'] as ToleranceKind[]).map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</select>)}
              {d.toleranceKind !== 'PROFILE_DEFINED' && field('Tolerance value', <input className={`${input} mono`} value={d.toleranceValue} onChange={(e) => set('toleranceValue', e.target.value)} placeholder={d.toleranceKind === 'RELATIVE' ? 'percent' : 'value'} inputMode="decimal" />, useDef?.defaultTolerance ? `Profile default: ${useDef.defaultTolerance.value ?? ''}${useDef.defaultTolerance.kind === 'RELATIVE' ? '%' : ` ${useDef.defaultTolerance.unit ?? ''}`}` : undefined)}
              {d.toleranceKind === 'ABSOLUTE' && field('Unit', <input className={`${input} mono`} value={d.toleranceUnit} onChange={(e) => set('toleranceUnit', e.target.value)} />)}
              {field('Requested assurance', <select className={input} value={d.requestedAssurance} onChange={(e) => set('requestedAssurance', e.target.value as AssuranceClass)}>{ASSURANCE_CLASSES.map((a) => <option key={a} value={a}>{ASSURANCE_SEMANTICS[a].label}</option>)}</select>, 'What you request is not what you get: the ruling states the class the record supports (GOV-202).')}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              {d.claims.map((c, i) => (
                <fieldset key={i} className="surface-inset p-3 grid gap-2 sm:grid-cols-5 border-0">
                  <legend className="label-sm px-1">Claim {i + 1}</legend>
                  {field('Predicate', <input className={`${input} mono`} value={c.predicate} onChange={(e) => set('claims', upd(d.claims, i, { predicate: e.target.value }))} placeholder="quantity.gross" />)}
                  {field('Title', <input className={input} value={c.title} onChange={(e) => set('claims', upd(d.claims, i, { title: e.target.value }))} />)}
                  {field('Value', <input className={`${input} mono`} value={c.value} onChange={(e) => set('claims', upd(d.claims, i, { value: e.target.value }))} />)}
                  {field('Unit', <input className={`${input} mono`} value={c.unit} onChange={(e) => set('claims', upd(d.claims, i, { unit: e.target.value }))} />)}
                  {field('Basis', <input className={input} value={c.basis} onChange={(e) => set('claims', upd(d.claims, i, { basis: e.target.value }))} placeholder="gross weight, as received…" />)}
                </fieldset>
              ))}
              <div><button type="button" className="btn btn-sm" onClick={addClaim}>Add claim</button></div>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>A value without a basis is not a claim value. Unit and basis are required for evaluation.</p>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              {d.evidence.map((e, i) => (
                <fieldset key={i} className="surface-inset p-3 grid gap-2 sm:grid-cols-4 border-0">
                  <legend className="label-sm px-1">Evidence {i + 1}</legend>
                  {field('Title', <input className={input} value={e.title} onChange={(ev) => set('evidence', upd(d.evidence, i, { title: ev.target.value }))} />)}
                  {field('Kind', <select className={input} value={e.kind} onChange={(ev) => set('evidence', upd(d.evidence, i, { kind: ev.target.value as EvidenceKind }))}>{EVIDENCE_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</select>)}
                  {field('Producer', <input className={input} value={e.producer} onChange={(ev) => set('evidence', upd(d.evidence, i, { producer: ev.target.value }))} placeholder="Who produced this artifact" />, 'Required. The producer, not the uploader.')}
                  {field('Producer role', <select className={input} value={e.producerRole} onChange={(ev) => set('evidence', upd(d.evidence, i, { producerRole: ev.target.value as PartyRole }))}>{(Object.keys(ROLE_LABEL) as PartyRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>)}
                  {field('Visibility', <select className={input} value={e.visibility} onChange={(ev) => set('evidence', upd(d.evidence, i, { visibility: ev.target.value as VisibilityClass }))}>{VISIBILITY_CLASSES.map((v) => <option key={v} value={v}>{VISIBILITY_SEMANTICS[v].label}</option>)}</select>, VISIBILITY_SEMANTICS[e.visibility].meaning)}
                  {field('Claim strength', <select className={`${input} mono`} value={e.claimStrength} onChange={(ev) => set('evidence', upd(d.evidence, i, { claimStrength: ev.target.value as ClaimStrength }))}>{(['reported', 'estimated', 'representative', 'derived'] as ClaimStrength[]).map((v) => <option key={v} value={v}>{v}</option>)}</select>)}
                  {field('Production class', <select className={`${input} mono`} value={e.productionClass} onChange={(ev) => set('evidence', upd(d.evidence, i, { productionClass: ev.target.value as ProductionClass }))}>{(['unclassified', 'asserted', 'computed', 'derived', 'measured'] as ProductionClass[]).map((v) => <option key={v} value={v}>{v}</option>)}</select>, 'unclassified is the absence of a term and is inadmissible for canonical assertion.')}
                  {field('Interest', <select className={`${input} mono`} value={e.interest} onChange={(ev) => set('evidence', upd(d.evidence, i, { interest: ev.target.value as Interest }))}>{(['disinterested', 'unknown', 'self_reported', 'negotiating_position'] as Interest[]).map((v) => <option key={v} value={v}>{v}</option>)}</select>)}
                  {field('Known by (UTC)', <input type="datetime-local" className={`${input} mono`} value={e.knownAt} onChange={(ev) => set('evidence', upd(d.evidence, i, { knownAt: ev.target.value }))} />)}
                  <div className="sm:col-span-4"><EvidenceClassBadge evidenceClass={{ claimStrength: e.claimStrength, productionClass: e.productionClass, interest: e.interest }} /></div>
                </fieldset>
              ))}
              <div><button type="button" className="btn btn-sm" onClick={addEvidence}>Add evidence</button></div>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Attaching an artifact does not make it verified evidence. Its classes state what it is; the checks decide what it supports.</p>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {field('World state valid on (UTC)', <input type="datetime-local" className={`${input} mono`} value={d.validAt} onChange={(e) => set('validAt', e.target.value)} />, 'The instant the claims describe the world at.')}
              {field('Information known by (UTC)', <input type="datetime-local" className={`${input} mono`} value={d.knownAt} onChange={(e) => set('knownAt', e.target.value)} />, 'Knowledge cutoff. Evidence that becomes knowable later is excluded from this evaluation.')}
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {field('Admission profile', <select className={input} value={d.profileId} onChange={(e) => { const p = profiles.find((x) => x.profileId === e.target.value); set('profileId', e.target.value); set('profileVersion', p?.version ?? ''); }}>{profiles.map((p) => <option key={p.profileId} value={p.profileId}>{p.title} — {p.version}</option>)}</select>)}
              {profile && <div className="text-[12.5px] sm:col-span-2" style={{ color: 'var(--text-secondary)' }}><span className="label-sm mr-2">Standing</span>{profile.recognition} <Link href={`/profiles/${encodeURIComponent(profile.profileId)}`} style={{ color: 'var(--info)' }}>View invariants</Link></div>}
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-3">
              <dl className="kv" data-testid="intake-review">
                <dt>Subject</dt><dd>{d.displayName || <span style={{ color: 'var(--status-refused)' }}>Missing</span>} <span className="id" style={{ color: 'var(--text-muted)' }}>{d.subjectId}</span></dd>
                <dt>Intended use</dt><dd style={{ color: 'var(--text-heading)', fontWeight: 500 }}>{useDef ? `${useDef.purpose} (${useDef.useCode})` : <span style={{ color: 'var(--status-refused)' }}>Missing</span>}</dd>
                <dt>Requested tolerance</dt><dd className="mono">{d.toleranceKind === 'PROFILE_DEFINED' ? 'Profile-defined' : d.toleranceValue ? `${d.toleranceKind === 'RELATIVE' ? `± ${d.toleranceValue}%` : `± ${d.toleranceValue} ${d.toleranceUnit}`}` : <span className="font-sans" style={{ color: 'var(--status-refused)' }}>Missing</span>}</dd>
                <dt>Requested assurance</dt><dd>{ASSURANCE_SEMANTICS[d.requestedAssurance].label}</dd>
                <dt>World state valid on</dt><dd className="ts">{d.validAt ? fmtUtc(`${d.validAt}:00Z`) : <span className="font-sans" style={{ color: 'var(--status-refused)' }}>Missing</span>}</dd>
                <dt>Information known by</dt><dd className="ts">{d.knownAt ? fmtUtc(`${d.knownAt}:00Z`) : <span className="font-sans" style={{ color: 'var(--status-refused)' }}>Missing</span>}</dd>
                <dt>Profile</dt><dd><span className="id">{d.profileId}</span> <span className="ver">{d.profileVersion}</span></dd>
                <dt>Claims</dt><dd>{d.claims.length === 0 ? <span style={{ color: 'var(--status-refused)' }}>None</span> : <ul className="m-0 pl-4">{d.claims.map((c, i) => <li key={i}><span className="id">{c.predicate || '(no predicate)'}</span> {c.value} {c.unit} {c.basis && `· ${c.basis}`}</li>)}</ul>}</dd>
                <dt>Evidence</dt><dd>{d.evidence.length === 0 ? <span style={{ color: 'var(--status-refused)' }}>None</span> : <ul className="m-0 pl-4">{d.evidence.map((e, i) => <li key={i}>{e.title || '(untitled)'} · {humanize(e.kind)} · produced by {e.producer || <span style={{ color: 'var(--status-refused)' }}>unknown producer</span>} · {VISIBILITY_SEMANTICS[e.visibility].label} · <span className="mono">{e.claimStrength}/{e.productionClass}/{e.interest}</span></li>)}</ul>}</dd>
              </dl>
              {missing.length > 0 && (
                <div role="status" className="surface-inset p-2 text-[12.5px]" style={{ borderColor: 'var(--status-pending)' }}>
                  <span className="label-sm" style={{ color: 'var(--status-pending)' }}>Before submission</span>
                  <ul className="m-0 pl-4">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              {submitted && (
                <div role="status" className="surface-inset p-2 text-[12.5px]" style={{ borderColor: 'var(--border-accent)' }} data-testid="submit-intent">
                  <span className="label-sm" style={{ color: 'var(--accent-strong)' }}>Submission intent recorded (not sent)</span>
                  <p className="m-0" style={{ color: 'var(--text-secondary)' }}>No evaluation has run. This repository has no adjudication backend; a live adapter would submit the case and return an EVALUATING state, then a ruling.</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex gap-1">
              <button type="button" className="btn btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
              <button type="button" className="btn btn-sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>Next</button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {saved && <span className="text-[12px]" style={{ color: 'var(--text-muted)' }} role="status">Draft saved in this page at <span className="ts">{saved}</span>. Not evaluated.</span>}
              <button type="button" className="btn btn-sm" onClick={() => setSaved(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC')}>Save draft</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={missing.length > 0 || step !== STEPS.length - 1} onClick={() => setSubmitted(true)} title={missing.length > 0 ? 'Complete the review step first' : undefined}>Submit for evaluation</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
