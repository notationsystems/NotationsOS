import Link from 'next/link';
import { RESOLUTION_MEANING, type ResolvedReference } from '@/domain/evidenceReference';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { fmtUtc } from '@/lib/format';

const STATE_COLOR = { RESOLVED: 'var(--check-passed)', CHANGED: 'var(--status-conditional)', UNAVAILABLE: 'var(--status-refused)', UNRESOLVED: 'var(--text-muted)' } as const;

function Temporal({ t }: { t: ResolvedReference['reference']['temporal'] }) {
  const rows = Object.entries(t).filter(([, v]) => v !== undefined) as Array<[string, string | null]>;
  if (!rows.length) return <span style={{ color: 'var(--text-muted)' }}>No temporal information on the reference.</span>;
  return <>{rows.map(([k, v]) => <span key={k} className="inline-block mr-3"><span className="label-sm">{k}</span> <span className="ts">{v === null ? 'open' : fmtUtc(v)}</span></span>)}</>;
}

/**
 * Inspect what a notation refers to: kind and stable identifier, the exact
 * version, its context, its time, whether it still resolves, and, apart from
 * all of that, what the author made of it. Server-rendered; nothing here is
 * editable until the backend can persist a reference.
 */
export function EvidenceReferencePanel({ references, fixture }: { references: ResolvedReference[]; fixture: { notationId: string; resolvedAt: string } }) {
  return (
    <section className="surface p-3 flex flex-col gap-3" aria-labelledby="evidence-references-heading" data-testid="evidence-references">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="evidence-references-heading" className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Evidence references</h2>
        <span className="pill" style={{ color: 'var(--status-conditional)', borderColor: 'currentColor' }} data-testid="evidence-fixture-marker">FIXTURE · attachment DISABLED</span>
      </div>
      <div role="note" aria-label="Evidence reference boundary" className="surface-inset p-3 text-[12.5px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
        <p className="m-0">These references are fixtures for notation <span className="mono">{fixture.notationId}</span>. The notation backend has no attach or detach command, so no reference is stored, edited or saved here; the contract and the backend request are in <span className="mono">docs/NOTATION_WORKSPACE.md</span>.</p>
        <p className="m-0">A reference names an exact version of something on the rail or in a release. It copies nothing and promotes nothing. It does not establish that the evidence is true or that any identity is canonical. The author&apos;s interpretation is kept apart from the evidence it reads. Resolution is computed against the committed fixtures at {fmtUtc(fixture.resolvedAt)}.</p>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-2" aria-label="References">
        {references.map(({ reference: r, resolution, attachment }) => (
          <li key={r.referenceId} className="surface p-3 flex flex-col gap-2 text-[12.5px]" data-reference-id={r.referenceId} data-kind={r.kind} data-resolution={resolution.state}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="label-sm">{r.kind.replace('_', ' ')}</span>
              <span className="id">{r.targetId}</span>
              <span className="pill text-[10.5px] px-1.5" style={{ color: STATE_COLOR[resolution.state], borderColor: 'currentColor' }} data-testid="resolution-state">{resolution.state}</span>
              <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>attachment {attachment}</span>
            </div>
            <dl className="kv m-0">
              <dt>Exact version</dt><dd>{r.digest ? <Digest value={r.digest} copy={false} /> : <span style={{ color: 'var(--text-muted)' }}>none pinned</span>}{resolution.currentDigest && resolution.currentDigest !== r.digest && <span className="ml-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>current <Digest value={resolution.currentDigest} copy={false} /></span>}</dd>
              <dt>Context</dt><dd>{Object.entries(r.context).map(([k, v]) => <span key={k} className="inline-block mr-3"><span className="label-sm">{k}</span> <span className="id">{v}</span></span>)}</dd>
              <dt>Time</dt><dd><Temporal t={r.temporal} /></dd>
              <dt>Resolution</dt><dd><span style={{ color: STATE_COLOR[resolution.state] }}>{resolution.state}</span> · {resolution.detail} <span style={{ color: 'var(--text-muted)' }}>{RESOLUTION_MEANING[resolution.state]} Against {resolution.against}.</span></dd>
            </dl>
            <div className="surface-inset p-2 flex flex-col gap-1" data-testid="interpretation">
              <span className="label-sm" style={{ color: 'var(--status-conditional)' }}>Authored interpretation · not a property of the evidence</span>
              <p className="m-0" style={{ color: 'var(--text-primary)' }}>{r.interpretation.text}</p>
              <span className="ts text-[11px]" style={{ color: 'var(--text-muted)' }}>authored {fmtUtc(r.interpretation.authoredAt)}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Where the targets live: <Link href="/candidates" style={{ color: 'var(--info)' }}>Candidates</Link> for the rail, <Link href="/releases" style={{ color: 'var(--info)' }}>Releases</Link> for records and releases.</p>
    </section>
  );
}
