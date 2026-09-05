'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { KernelCommand, StateKernelFailure, StateKernelRequest, StateKernelSnapshot } from '@/state-kernel/types';
import { CapacityMeter } from './CapacityMeter';
import { ConflictPanel } from './ConflictPanel';
import { LeaveDialog } from './LeaveDialog';
import { capacityOf } from './capacity';
import { clearDrafts, draftsHaveContent, emptyText, readDrafts, writeDrafts, type BrowserDrafts, type DraftText, type Edit } from './drafts';

const fieldClass = 'surface-inset px-2 py-1.5 text-[13px] w-full';
const muted = { color: 'var(--text-secondary)' };

async function readSnapshot(path: string, body?: StateKernelRequest, signal?: AbortSignal): Promise<StateKernelSnapshot> {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const value = await response.json() as StateKernelSnapshot | StateKernelFailure;
  if (!response.ok) {
    const failure = 'error' in value ? value.error : undefined;
    throw new Error(failure ? `${failure.code}: ${failure.message}` : `Request failed (${response.status}).`);
  }
  if (!('schema' in value) || value.schema !== 'payload.local-notation-workspace.v1'
    || value.state?.schema !== 'notations.notation-state.v1') throw new Error('The state service returned an invalid workspace snapshot.');
  return value;
}

function textFieldCount(text: DraftText, snapshot: StateKernelSnapshot | null): number {
  let n = 0;
  if (text.createTitle) n++;
  if (text.createBody) n++;
  if (text.relationFrom) n++;
  if (text.relationTo) n++;
  if (text.relationLabel) n++;
  for (const [id, draft] of Object.entries(text.edits)) {
    const notation = snapshot?.state.notations.find((item) => item.id === id);
    if (!notation || notation.title !== draft.title || notation.body !== draft.body) n++;
  }
  return n;
}

/**
 * A browser draft of Rust-validated commands, never a second state authority.
 * Three things are kept distinct and shown distinctly: unapplied form text,
 * kernel-validated commands that are not saved, and the saved local version.
 * Drafts survive internal navigation, browser back and reload in this tab;
 * a failed request keeps them; a version conflict keeps them inspectable and
 * copyable until the person reloads deliberately.
 */
export function NotationWorkspace() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<StateKernelSnapshot | null>(null);
  const [pending, setPending] = useState<KernelCommand[]>([]);
  const [busy, setBusy] = useState(true);
  const inFlight = useRef(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Loading saved local state…');
  const [selectedId, setSelectedId] = useState('');
  const [text, setText] = useState<DraftText>(emptyText);
  const [confirmReload, setConfirmReload] = useState(false);
  const [conflict, setConflict] = useState<{ reason: 'VERSION_CONFLICT' | 'STALE_DRAFTS'; drafts: BrowserDrafts } | null>(null);
  const [leave, setLeave] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const selected = snapshot?.state.notations.find((notation) => notation.id === selectedId);
  const edit = selected ? text.edits[selected.id] ?? selected : null;
  const editChanged = Boolean(selected && edit && (selected.title !== edit.title || selected.body !== edit.body));
  const textCount = textFieldCount(text, snapshot);
  const typedDrafts = textCount > 0;
  const unsaved = pending.length > 0 || typedDrafts;
  const capacity = useMemo(() => (snapshot ? capacityOf(snapshot) : null), [snapshot]);
  const locked = busy || !snapshot?.enabled || confirmReload || Boolean(leave);
  const commandsExhausted = Boolean(capacity?.commandsExhausted);
  const versionsExhausted = Boolean(capacity?.versionsExhausted);

  const setEdits = (update: (current: Record<string, Edit>) => Record<string, Edit>) => setText((current) => ({ ...current, edits: update(current.edits) }));
  const field = <K extends keyof DraftText>(key: K, value: DraftText[K]) => setText((current) => ({ ...current, [key]: value }));

  // Load, then restore this tab's drafts against the loaded saved version.
  useEffect(() => {
    const controller = new AbortController();
    const stored = readDrafts();
    readSnapshot('/api/state-kernel', undefined, controller.signal).then(async (next) => {
      if (controller.signal.aborted) return;
      setSnapshot(next);
      setSelectedId(next.state.notations[0]?.id ?? '');
      setNotice(next.enabled ? 'Saved local state loaded.' : 'Local notation state is disabled.');
      if (!stored || !draftsHaveContent(stored) || !next.enabled) return;
      if (stored.baseVersion !== next.savedVersion || stored.savedDigest !== next.savedDigest) { setConflict({ reason: 'STALE_DRAFTS', drafts: stored }); return; }
      setText({ ...emptyText(), ...stored.text });
      if (stored.selectedId && next.state.notations.some((n) => n.id === stored.selectedId)) setSelectedId(stored.selectedId);
      if (!stored.pending.length) { setNotice('Saved local state loaded. Unapplied text restored from this tab.'); return; }
      try {
        const previewed = await readSnapshot('/api/state-kernel/preview', { schema: 'payload.notation-command-batch.v1', baseVersion: next.savedVersion, commands: stored.pending }, controller.signal);
        if (controller.signal.aborted) return;
        if (previewed.savedVersion !== next.savedVersion) throw new Error('The saved version changed during restoration.');
        setSnapshot(previewed); setPending(stored.pending);
        if (stored.selectedId && previewed.state.notations.some((n) => n.id === stored.selectedId)) setSelectedId(stored.selectedId);
        setNotice(`Browser drafts restored: ${stored.pending.length} pending ${stored.pending.length === 1 ? 'command' : 'commands'} re-validated by the state kernel. Not saved.`);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setConflict({ reason: 'STALE_DRAFTS', drafts: stored });
        setError(failure instanceof Error ? failure.message : 'The stored drafts could not be re-validated.');
      }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Unable to load local state.');
        setNotice('');
      }
    }).finally(() => {
      if (!controller.signal.aborted) { inFlight.current = false; setBusy(false); setHydrated(true); }
    });
    return () => controller.abort();
  }, []);

  // Persist drafts to this tab whenever they change; clear when nothing is unsaved.
  useEffect(() => {
    if (!hydrated || !snapshot?.enabled || conflict) return;
    if (!unsaved) { clearDrafts(); return; }
    writeDrafts({ schema: 'payload.notation-browser-drafts.v1', baseVersion: snapshot.savedVersion, savedDigest: snapshot.savedDigest, pending, text, selectedId, storedAt: new Date().toISOString() });
  }, [hydrated, snapshot, conflict, unsaved, pending, text, selectedId]);

  // Browser navigation and reload: the browser asks; the drafts are in this tab either way.
  useEffect(() => {
    if (!unsaved) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);

  // Internal navigation: intercept same-origin links to other pages while work is unsaved.
  useEffect(() => {
    if (!unsaved || leave) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      const path = href.split(/[?#]/)[0];
      if (path === window.location.pathname) return;
      event.preventDefault(); event.stopPropagation();
      setLeave(href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [unsaved, leave]);

  const stay = useCallback(() => setLeave(null), []);

  function begin() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    return true;
  }
  function finish() { inFlight.current = false; setBusy(false); }
  function fail(failure: unknown) {
    const message = failure instanceof Error ? failure.message : 'The state request failed.';
    setError(message);
    if (message.startsWith('VERSION_CONFLICT') && snapshot) {
      setConflict({ reason: 'VERSION_CONFLICT', drafts: { schema: 'payload.notation-browser-drafts.v1', baseVersion: snapshot.savedVersion, savedDigest: snapshot.savedDigest, pending, text, selectedId, storedAt: new Date().toISOString() } });
    }
  }
  function batch(commands: KernelCommand[]): StateKernelRequest {
    return { schema: 'payload.notation-command-batch.v1', baseVersion: snapshot!.savedVersion, commands };
  }

  async function preview(command: KernelCommand, onAccepted?: () => void) {
    if (!snapshot?.enabled || commandsExhausted || !begin()) return;
    const commands = [...pending, command];
    try {
      const next = await readSnapshot('/api/state-kernel/preview', batch(commands));
      if (next.savedVersion !== snapshot.savedVersion) throw new Error('The preview changed the saved version unexpectedly. Reload is required.');
      setSnapshot(next); setPending(commands);
      onAccepted?.();
      setNotice(`Preview accepted by the state kernel against saved version ${next.savedVersion}. Not saved: another save may still win before yours.`);
    } catch (failure) { fail(failure); }
    finally { finish(); }
  }

  async function save() {
    if (!snapshot?.enabled || !pending.length || typedDrafts || versionsExhausted || !begin()) return;
    try {
      const next = await readSnapshot('/api/state-kernel/save', batch(pending));
      setSnapshot(next); setPending([]);
      setNotice(`Saved local version ${next.savedVersion}.`);
    } catch (failure) { fail(failure); }
    finally { finish(); }
  }

  async function reload() {
    if (!begin()) return;
    try {
      const next = await readSnapshot('/api/state-kernel');
      setSnapshot(next); setPending([]); setText(emptyText()); setConflict(null); clearDrafts();
      setSelectedId(next.state.notations.some((notation) => notation.id === selectedId) ? selectedId : next.state.notations[0]?.id ?? '');
      setConfirmReload(false);
      setNotice(next.enabled ? 'Saved local state reloaded. Browser drafts cleared.' : 'Local notation state is disabled.');
    } catch (failure) { fail(failure); }
    finally { finish(); }
  }

  function discardAndLeave(href: string) {
    clearDrafts(); setPending([]); setText(emptyText()); setConflict(null); setLeave(null);
    router.push(href);
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (locked || !text.createTitle.trim()) return;
    const id = crypto.randomUUID();
    void preview({ commandId: crypto.randomUUID(), kind: 'CREATE_NOTATION', notation: { id, title: text.createTitle, body: text.createBody } }, () => {
      setSelectedId(id); setText((current) => ({ ...current, createTitle: '', createBody: '' }));
    });
  }
  function update(event: FormEvent) {
    event.preventDefault();
    if (locked || !selected || !edit || !editChanged || !edit.title.trim()) return;
    const id = selected.id;
    void preview({ commandId: crypto.randomUUID(), kind: 'UPDATE_NOTATION', notationId: id, title: edit.title, body: edit.body }, () => {
      setEdits((current) => { const next = { ...current }; delete next[id]; return next; });
    });
  }
  function createRelation(event: FormEvent) {
    event.preventDefault();
    if (locked || !text.relationFrom || !text.relationTo || !text.relationLabel.trim()) return;
    void preview({ commandId: crypto.randomUUID(), kind: 'CREATE_RELATION', relation: {
      id: crypto.randomUUID(), from: text.relationFrom, to: text.relationTo, label: text.relationLabel,
    } }, () => { setText((current) => ({ ...current, relationFrom: '', relationTo: '', relationLabel: '' })); });
  }

  const stateLabel = busy && !snapshot ? 'LOADING' : snapshot?.enabled ? 'LOCAL DEVELOPMENT' : 'DISABLED';

  return (
    <div className="p-3 sm:p-4 max-w-[1180px] mx-auto w-full flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label-sm mb-1">Workbench · Local development</div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-heading)' }}>Notations</h1>
          <p className="text-[13px] mt-1 max-w-[760px]" style={muted}>Author notation state and explicit relations. The Rust state kernel validates previews, undo and redo; Save records a local version.</p>
        </div>
        <span className="pill">{stateLabel}</span>
      </header>
      <aside className="surface-inset p-3 text-[13px]" aria-label="Local development boundary">
        <p>Local authored state only. Not evidence, identity resolution, inference, or canonical corpus state.</p>
        <p className="mt-1" style={muted}>Previews and form text are browser drafts until saved. This screen does not admit data, release a corpus, or launch agents.</p>
        {snapshot && !snapshot.enabled && <p className="mt-2">Enable the loopback development service with <code className="mono">npm run dev:state-kernel</code>, then reload saved state.</p>}
      </aside>

      {leave && <LeaveDialog href={leave} pendingCount={pending.length} textCount={textCount} onStay={stay} onLeave={() => { setLeave(null); router.push(leave); }} onDiscard={() => discardAndLeave(leave)} />}

      <section className="surface p-3 flex flex-col gap-3" aria-label="State controls">
        <ol className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3" aria-label="Where your work is">
          <li className="surface-inset p-2 text-[12.5px]" data-testid="state-text" data-count={textCount}>
            <div className="label-sm">1 · Unapplied text</div>
            <div className="mono" style={{ color: textCount ? 'var(--status-conditional)' : 'var(--text-muted)' }}>{textCount} {textCount === 1 ? 'field' : 'fields'}</div>
            <div className="text-[11.5px]" style={muted}>Typed in a form, not yet previewed. The kernel has not seen it.</div>
          </li>
          <li className="surface-inset p-2 text-[12.5px]" data-testid="state-pending" data-count={pending.length}>
            <div className="label-sm">2 · Validated, not saved</div>
            <div className="mono" style={{ color: pending.length ? 'var(--status-pending)' : 'var(--text-muted)' }}><span data-testid="pending-count">{pending.length}</span> {pending.length === 1 ? 'command' : 'commands'} · draft revision <span data-testid="draft-revision">{snapshot?.state.revision ?? '—'}</span></div>
            <div className="text-[11.5px]" style={muted}>Accepted by the kernel against saved version {snapshot?.savedVersion ?? '—'}. Kept in this tab. Save may still conflict.</div>
          </li>
          <li className="surface-inset p-2 text-[12.5px]" data-testid="state-saved">
            <div className="label-sm">3 · Saved local version</div>
            <div className="mono" style={{ color: 'var(--check-passed)' }}><span data-testid="saved-version">{snapshot?.savedVersion ?? '—'}</span>{snapshot?.savedDigest ? <span className="text-[11px]" style={muted}> · {snapshot.savedDigest.slice(0, 15)}…</span> : null}</div>
            <div className="text-[11.5px]" style={muted}>{snapshot?.persistence === 'LOCAL_VERSIONED_FILES' ? 'Local versioned files. Authored local state, not evidence or canonical state.' : 'Disabled.'}</div>
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={locked || typedDrafts || commandsExhausted || !snapshot?.state.canUndo} onClick={() => void preview({ commandId: crypto.randomUUID(), kind: 'UNDO' })}>Undo</button>
          <button type="button" className="btn btn-sm" disabled={locked || typedDrafts || commandsExhausted || !snapshot?.state.canRedo} onClick={() => void preview({ commandId: crypto.randomUUID(), kind: 'REDO' })}>Redo</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={locked || typedDrafts || versionsExhausted || !pending.length} onClick={() => void save()}>Save local version</button>
          <button type="button" className="btn btn-sm" disabled={busy || confirmReload} onClick={() => unsaved ? setConfirmReload(true) : void reload()}>Reload saved state</button>
        </div>
        <p className="text-[12px]" style={muted}>Save validates the whole pending batch again against the saved version. A preview is not a reservation: a conflict keeps your drafts and asks you to reload deliberately.</p>
        {typedDrafts && <p className="text-[12px]" style={muted}>Unapplied form text is retained. Preview or clear it before Save, Undo, or Redo.</p>}
        {commandsExhausted && <p className="text-[12px]" role="alert" style={{ color: 'var(--status-refused)' }} data-testid="commands-exhausted">This workspace has used all of its lifetime commands. No further command, undo or redo is accepted; save what is pending and copy your drafts.</p>}
        {versionsExhausted && <p className="text-[12px]" role="alert" style={{ color: 'var(--status-refused)' }} data-testid="versions-exhausted">This workspace has reached its saved-version limit. Previews still run; nothing further can be saved here.</p>}
        {snapshot?.savedDigest && <details className="text-[12px]"><summary className="cursor-pointer">Saved state digest</summary><p className="mono break-all mt-1">{snapshot.savedDigest}</p></details>}
      </section>

      {error && <div role="alert" className="surface-inset p-3 text-[13px]" style={{ color: 'var(--status-refused)' }}><p>{error}</p><p className="mt-1">Your browser drafts have been retained. A version conflict requires reloading saved state before starting a new draft.</p></div>}
      <div role="status" aria-live="polite" className="text-[13px]" style={muted}>{busy ? 'State request in progress…' : notice}</div>

      {conflict && snapshot && <ConflictPanel drafts={conflict.drafts} savedVersion={snapshot.savedVersion} reason={conflict.reason} onKeep={() => { if (conflict.reason === 'STALE_DRAFTS') { setText({ ...emptyText(), ...conflict.drafts.text }); } setConflict(null); }} onReloadDiscard={() => setConfirmReload(true)} />}

      {confirmReload && <ReloadDialog busy={busy} onKeep={() => setConfirmReload(false)} onReload={() => void reload()} />}

      {capacity && snapshot?.enabled && <CapacityMeter capacity={capacity} />}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section className="surface p-3 min-w-0" aria-labelledby="notation-list-heading">
          <h2 id="notation-list-heading" className="font-semibold">Notation register</h2>
          {!snapshot?.state.notations.length ? <p className="text-[13px] mt-3" style={muted}>{snapshot ? 'No notations in this state.' : 'Load local state to view notations.'}</p>
            : <ul className="flex flex-col gap-2 mt-3">{snapshot.state.notations.map((notation) => <li key={notation.id}>
              <button type="button" className="surface-inset p-2 w-full text-left break-words" disabled={locked} aria-pressed={notation.id === selectedId} aria-label={`Select notation ${notation.title}`} onClick={() => setSelectedId(notation.id)} style={notation.id === selectedId ? { borderColor: 'var(--accent)' } : undefined}>
                <span className="block text-[13px] font-medium">{notation.title}{text.edits[notation.id] && (text.edits[notation.id].title !== notation.title || text.edits[notation.id].body !== notation.body) ? <span className="ml-2 label-sm" style={{ color: 'var(--status-conditional)' }}>unapplied edit</span> : null}</span><span className="block mono text-[10px] break-all mt-1" style={muted}>{notation.id}</span>
              </button>
            </li>)}</ul>}
        </section>
        <section className="surface p-3 min-w-0" aria-labelledby="notation-editor-heading">
          <h2 id="notation-editor-heading" className="font-semibold">Selected notation</h2>
          {selected && edit ? <form aria-label="Edit notation" onSubmit={update} className="mt-3">
            <p className="label-sm">Stable notation ID</p><p data-testid="selected-notation-id" className="mono text-[12px] break-all mb-3">{selected.id}</p>
            <fieldset disabled={locked} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                {editChanged && <span className="label-sm" style={{ color: 'var(--status-conditional)' }} data-testid="edit-unapplied">Unapplied edit: not previewed, not saved</span>}
                <label htmlFor="notation-edit-title" className="text-[13px]">Notation title<input id="notation-edit-title" className={fieldClass} required value={edit.title} onChange={(event) => setEdits((current) => ({ ...current, [selected.id]: { ...edit, title: event.target.value } }))} /></label>
              </div>
              <div><label htmlFor="notation-edit-body" className="text-[13px]">Notation body</label><textarea id="notation-edit-body" className={fieldClass} rows={7} value={edit.body} onChange={(event) => setEdits((current) => ({ ...current, [selected.id]: { ...edit, body: event.target.value } }))} /></div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={!editChanged || !edit.title.trim() || commandsExhausted}>Preview changes</button>
                <button type="button" className="btn btn-sm" disabled={!editChanged} onClick={() => setEdits((current) => { const next = { ...current }; delete next[selected.id]; return next; })}>Clear form edits</button>
              </div>
            </fieldset>
          </form> : <p className="text-[13px] mt-3" style={muted}>Select a notation or create one below. Undo can remove a notation from this draft; Redo restores the same ID.</p>}
        </section>
      </div>
      <section className="surface p-3" aria-labelledby="create-notation-heading">
        <h2 id="create-notation-heading" className="font-semibold">Create notation</h2>
        <form aria-label="Create notation" onSubmit={create} className="mt-3"><fieldset disabled={locked} className="flex flex-col gap-3">
          <label htmlFor="notation-create-title" className="text-[13px]">New notation title<input id="notation-create-title" className={fieldClass} required value={text.createTitle} onChange={(event) => field('createTitle', event.target.value)} /></label>
          <div><label htmlFor="notation-create-body" className="text-[13px]">New notation body</label><textarea id="notation-create-body" className={fieldClass} rows={3} value={text.createBody} onChange={(event) => field('createBody', event.target.value)} /></div>
          <div className="flex flex-wrap gap-2"><button type="submit" className="btn btn-primary btn-sm" disabled={!text.createTitle.trim() || commandsExhausted}>Preview new notation</button><button type="button" className="btn btn-sm" disabled={!text.createTitle && !text.createBody} onClick={() => setText((current) => ({ ...current, createTitle: '', createBody: '' }))}>Clear new notation</button></div>
        </fieldset></form>
      </section>
      <section className="surface p-3" aria-labelledby="notation-relations-heading">
        <h2 id="notation-relations-heading" className="font-semibold">Authored relations</h2>
        <p className="text-[13px] mt-1" style={muted}>Explicit links between notation IDs. A label does not establish a factual, causal, or canonical relationship.</p>
        {snapshot?.state.relations.length ? <ul className="flex flex-col gap-2 mt-3">{snapshot.state.relations.map((relation) => <li key={relation.id} className="surface-inset p-2 text-[13px] break-words">
          <span>{snapshot.state.notations.find((notation) => notation.id === relation.from)?.title ?? relation.from}</span> → <span>{relation.label}</span> → <span>{snapshot.state.notations.find((notation) => notation.id === relation.to)?.title ?? relation.to}</span>
          <p className="mono text-[10px] break-all mt-1" style={muted}>{relation.id}</p>
        </li>)}</ul> : <p className="text-[13px] mt-2" style={muted}>No authored relations in this state.</p>}
        <form aria-label="Create relation" onSubmit={createRelation} className="mt-3"><fieldset disabled={locked || !snapshot?.state.notations.length} className="grid gap-3 sm:grid-cols-3">
          <label htmlFor="notation-relation-from" className="text-[13px]">From notation<select id="notation-relation-from" className={fieldClass} required value={text.relationFrom} onChange={(event) => field('relationFrom', event.target.value)}><option value="">Select source</option>{snapshot?.state.notations.map((notation) => <option key={notation.id} value={notation.id}>{notation.title}</option>)}</select></label>
          <label htmlFor="notation-relation-to" className="text-[13px]">To notation<select id="notation-relation-to" className={fieldClass} required value={text.relationTo} onChange={(event) => field('relationTo', event.target.value)}><option value="">Select target</option>{snapshot?.state.notations.map((notation) => <option key={notation.id} value={notation.id}>{notation.title}</option>)}</select></label>
          <label htmlFor="notation-relation-label" className="text-[13px]">Relation label<input id="notation-relation-label" className={fieldClass} required value={text.relationLabel} onChange={(event) => field('relationLabel', event.target.value)} /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-3"><button type="submit" className="btn btn-primary btn-sm" disabled={!text.relationFrom || !text.relationTo || !text.relationLabel.trim() || commandsExhausted}>Preview relation</button><button type="button" className="btn btn-sm" disabled={!text.relationFrom && !text.relationTo && !text.relationLabel} onClick={() => setText((current) => ({ ...current, relationFrom: '', relationTo: '', relationLabel: '' }))}>Clear relation form</button></div>
        </fieldset></form>
      </section>
    </div>
  );
}

function ReloadDialog({ busy, onKeep, onReload }: { busy: boolean; onKeep: () => void; onReload: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onKeep(); } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus?.(); };
  }, [onKeep]);
  return (
    <section role="alertdialog" aria-modal="true" aria-labelledby="reload-title" aria-describedby="reload-description" className="surface p-3">
      <h2 id="reload-title" className="font-semibold">Discard browser drafts?</h2>
      <p id="reload-description" className="text-[13px] mt-1" style={muted}>Reload replaces pending commands and unapplied form text with the saved local version. Drafts are cleared only after the reload succeeds.</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button ref={first} type="button" className="btn btn-sm" disabled={busy} onClick={onKeep}>Keep editing</button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onReload}>Discard drafts and reload</button>
      </div>
    </section>
  );
}
