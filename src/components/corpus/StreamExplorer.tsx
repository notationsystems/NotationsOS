'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Corpus, CorpusRecord } from '@/domain/corpus';
import { currentRelease, queryAsOf, recordById, recordStatusAt, releaseById, releaseIndex } from '@/domain/corpus';
import { asOfBody, asOfUrl } from '@/adapter/feedShapes';
import { CopyButton } from '@/components/primitives/CopyButton';
import { Section } from '@/components/primitives/Section';
import { RecordCard, RecordStatusPill } from './RecordCard';
import { fmtUtc } from '@/lib/format';

const toLocal = (iso: string) => iso.slice(0, 16);
const fromLocal = (v: string) => (v.length === 16 ? `${v}:00Z` : v);

export interface StreamInitial {
  release?: string;
  subject?: string;
  predicate?: string;
  validAt?: string;
  knownAt?: string;
  record?: string;
}

/**
 * The as-of query surface. Choose a release, a subject, a predicate, a
 * world time and a knowledge time; get the record that answers, with its
 * bounds, clocks, provenance, class and rights, or a typed refusal with a
 * remedy. The same query is reproducible from the feed endpoint shown
 * beside the answer. Reconstruction here is presentation over the release;
 * it computes no fact.
 */
export function StreamExplorer({ corpus, initial }: { corpus: Corpus; initial: StreamInitial }) {
  const seed: CorpusRecord | undefined = initial.record ? recordById(corpus, initial.record) : undefined;
  const first = seed ? releaseById(corpus, initial.release ?? '') ?? currentRelease(corpus) : releaseById(corpus, initial.release ?? '') ?? currentRelease(corpus);
  const [releaseId, setReleaseId] = useState(first.releaseId);
  const release = releaseById(corpus, releaseId) ?? currentRelease(corpus);
  const index = useMemo(() => releaseIndex(corpus, release), [corpus, release]);
  const [subjectId, setSubjectId] = useState(seed?.subjectId ?? initial.subject ?? 'LOT-7C-104');
  const [predicate, setPredicate] = useState(seed?.predicate ?? initial.predicate ?? 'condition.moisture');
  const [validAt, setValidAt] = useState(seed?.validFrom ?? initial.validAt ?? '2026-08-28T14:00:00Z');
  const [knownAt, setKnownAt] = useState(initial.knownAt ?? release.knownAt);

  const answer = useMemo(() => queryAsOf(corpus, release, { subjectId, predicate, validAt, knownAt }, { enforceRights: true }), [corpus, release, subjectId, predicate, validAt, knownAt]);
  const url = asOfUrl(release.releaseId, answer.query);
  const body = JSON.stringify({ fixture_only: true, release: { releaseId: release.releaseId, buildId: release.build.buildId, knownAt: release.knownAt }, ...asOfBody(answer) }, null, 2);
  const rights = (sourceId: string) => release.sources.find((s) => s.sourceId === sourceId);
  const subjects = index.subjects.some((s) => s.subjectId === subjectId) ? index.subjects : [...index.subjects, { subjectId, subjectType: '—' }];
  const predicates = index.predicates.includes(predicate) ? index.predicates : [...index.predicates, predicate];

  return (
    <div className="flex flex-col gap-4" data-testid="stream-explorer">
      <form className="surface p-3 grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-5" aria-label="As-of query" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1"><span className="label-sm">Release</span>
          <select value={releaseId} onChange={(e) => { setReleaseId(e.target.value); const r = releaseById(corpus, e.target.value); if (r && knownAt > r.knownAt) setKnownAt(r.knownAt); }} className="surface-inset px-2 py-1.5 text-[12.5px] mono">
            {corpus.releases.map((r) => <option key={r.releaseId} value={r.releaseId}>{r.releaseId} {r.status === 'CURRENT' ? '(current)' : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="label-sm">Subject</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="surface-inset px-2 py-1.5 text-[12.5px] mono">
            {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectId} · {s.subjectType}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="label-sm">Predicate</span>
          <select value={predicate} onChange={(e) => setPredicate(e.target.value)} className="surface-inset px-2 py-1.5 text-[12.5px] mono">
            {predicates.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="label-sm">World state valid at (UTC)</span>
          <input type="datetime-local" value={toLocal(validAt)} onChange={(e) => e.target.value && setValidAt(fromLocal(e.target.value))} className="surface-inset px-2 py-1 mono text-[12.5px]" step={60} aria-label="Valid at" />
        </label>
        <label className="flex flex-col gap-1"><span className="label-sm">Information known by (UTC)</span>
          <input type="datetime-local" value={toLocal(knownAt)} onChange={(e) => e.target.value && setKnownAt(fromLocal(e.target.value))} className="surface-inset px-2 py-1 mono text-[12.5px]" step={60} aria-label="Known by" />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Clamped to the release cutoff {fmtUtc(release.knownAt)}.</span>
        </label>
      </form>

      <div role="status" aria-live="polite" className="px-3 py-2 rounded-[var(--radius-md)] border text-[13px]" style={{ borderColor: answer.record ? 'var(--border-default)' : 'var(--status-refused)' }} data-testid="asof-banner">
        {answer.record ? (
          <>Answer for <span className="id">{subjectId}</span> <span className="id">{predicate}</span>: world state valid at <span className="ts">{fmtUtc(validAt)}</span>, using what was knowable by <span className="ts">{fmtUtc(answer.query.knownAt)}</span> in <span className="id">{release.releaseId}</span>{answer.resolution === 'VIA_IDENTITY_LINK' && <> — reached through identity link <span className="id">{answer.identityLink?.recordId}</span></>}.</>
        ) : (
          <><span className="font-semibold" style={{ color: 'var(--status-refused)' }}>No answer: {answer.refusal?.code}.</span> {answer.refusal?.reason}</>
        )}
      </div>

      {answer.record && <RecordCard record={answer.record} status={answer.status} rights={rights(answer.record.provenance.sourceId)} />}

      {answer.identityLink && (
        <Section title="Identity link used" id="st-link">
          <RecordCard record={answer.identityLink} status={recordStatusAt(corpus, answer.identityLink, answer.query.knownAt)} rights={rights(answer.identityLink.provenance.sourceId)} compact />
        </Section>
      )}

      {answer.refusal && (
        <Section title="Why there is no answer, and what would supply one" id="st-refusal">
          <div className="surface p-3 flex flex-col gap-2 text-[13px]">
            <dl className="kv">
              <dt>Code</dt><dd className="id">{answer.refusal.code}</dd>
              <dt>Reason</dt><dd>{answer.refusal.reason}</dd>
              <dt>Remedy</dt><dd style={{ color: 'var(--text-heading)' }}>{answer.refusal.remedy}</dd>
            </dl>
            {answer.refusal.considered.length > 0 && (
              <div>
                <span className="label-sm">Considered and set aside</span>
                <ul className="m-0 mt-1 pl-4 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  {answer.refusal.considered.map((c) => <li key={c.recordId}><span className="id">{c.recordId}</span> — {c.because}</li>)}
                </ul>
              </div>
            )}
            {answer.retraction && <p className="m-0 text-[12.5px]" style={{ color: 'var(--status-revoked)' }}>Retraction <Link href="/retractions" className="id" style={{ color: 'inherit' }}>{answer.retraction.retractionId}</Link> issued {fmtUtc(answer.retraction.issuedAt)}.</p>}
          </div>
        </Section>
      )}

      {answer.candidates.length > 1 && (
        <Section title={`All candidates knowable by the cutoff (${answer.candidates.length})`} id="st-candidates">
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {answer.candidates.map((c) => (
              <li key={c.recordId} className="surface-inset p-2 text-[12.5px] flex items-center justify-between gap-2 flex-wrap">
                <span><span className="id">{c.recordId}</span> = <span className="mono">{String(c.value)} {c.unit ?? ''}</span> <span style={{ color: 'var(--text-muted)' }}>· {c.basis}</span></span>
                <span className="flex items-center gap-2"><span className="ts" style={{ color: 'var(--text-muted)' }}>known {fmtUtc(c.knownAt)}</span><RecordStatusPill status={recordStatusAt(corpus, c, answer.query.knownAt)} /></span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Reproduce with the feed" id="st-api" aside={<CopyButton value={body} label="Copy JSON" />}>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The same reconstruction from the API. A customer&apos;s own model or agent reads this; nothing here depends on the workbench.</p>
        <p className="m-0"><Link href={url} className="id" style={{ color: 'var(--info)' }} data-testid="asof-url">GET {url}</Link></p>
        <pre tabIndex={0} className="m-0 surface-inset p-3 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)', maxHeight: 360 }}>{body}</pre>
      </Section>
    </div>
  );
}
