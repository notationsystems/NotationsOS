'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { KernelCommand, NotationRelation, StateKernelFailure, StateKernelRequest, StateKernelSnapshot } from '@/state-kernel/types';
import { Inspector } from '@/components/primitives/Inspector';
import { CapacityMeter } from './CapacityMeter';
import { ConflictPanel } from './ConflictPanel';
import { LeaveDialog } from './LeaveDialog';
import { capacityOf } from './capacity';
import { clearDrafts, describeCommand, draftsHaveContent, emptyText, readDrafts, writeDrafts, type BrowserDrafts, type DraftText, type Edit } from './drafts';

const fieldClass = 'surface-inset px-2 py-1.5 text-[13px] w-full';
const muted = { color: 'var(--text-secondary)' };
const faint = { color: 'var(--text-muted)' };

type InFlight = 'load' | 'preview' | 'save' | 'reload' | null;

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

/** Whether a pending command names this notation: its creation, an update, or a relation from or to it. */
function touches(command: KernelCommand, id: string): boolean {
  switch (command.kind) {
    case 'CREATE_NOTATION': return command.notation.id === id;
    case 'UPDATE_NOTATION': return command.notationId === id;
    case 'CREATE_RELATION': return command.relation.from === id || command.relation.to === id;
    default: return false;
  }
}

/** Where an object stands: created or changed in this draft (not saved), or part of the saved local version. */
function originOf(kind: 'notation' | 'relation', id: string, pending: KernelCommand[], savedVersion: number): { state: 'CREATED' | 'UPDATED' | 'SAVED'; label: string; color: string } {
  const created = pending.some((c) => (kind === 'notation' ? c.kind === 'CREATE_NOTATION' && c.notation.id === id : c.kind === 'CREATE_RELATION' && c.relation.id === id));
  if (created) return { state: 'CREATED', label: 'Created in this draft · not saved', color: 'var(--status-pending)' };
  if (kind === 'notation' && pending.some((c) => c.kind === 'UPDATE_NOTATION' && c.notationId === id)) return { state: 'UPDATED', label: 'Changed in this draft · not saved', color: 'var(--status-pending)' };
  return { state: 'SAVED', label: `In saved local version ${savedVersion}`, color: 'var(--check-passed)' };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A browser draft of Rust-validated commands, never a second state authority.
 * Three things are kept distinct and shown distinctly: unapplied form text,
 * kernel-validated commands that are not saved, and the saved local version.
 * Drafts survive internal navigation, browser back and reload in this tab;
 * a failed request keeps them; a version conflict keeps them inspectable and
 * copyable until the person reloads deliberately. Selection connects the
 * register to a contextual inspector: the selected notation's editor, its
 * relations, the pending commands that name it, and its evidence line.
 * Server-rendered panels that belong beneath the workspace (the evidence
 * reference fixture) come in as children so the inspector's column spans
 * them too.
 */
export function NotationWorkspace({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<StateKernelSnapshot | null>(null);
  const [pending, setPending] = useState<KernelCommand[]>([]);
  const [inFlight, setInFlight] = useState<InFlight>('load');
  const inFlightRef = useRef(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedRelationId, setSelectedRelationId] = useState('');
  const [text, setText] = useState<DraftText>(emptyText);
  const [confirmReload, setConfirmReload] = useState(false);
  const [conflict, setConflict] = useState<{ reason: 'VERSION_CONFLICT' | 'STALE_DRAFTS'; drafts: BrowserDrafts } | null>(null);
  const [leave, setLeave] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const busy = inFlight !== null;
  const notations = useMemo(() => snapshot?.state.notations ?? [], [snapshot]);
  const relations = useMemo(() => snapshot?.state.relations ?? [], [snapshot]);
  const selected = notations.find((notation) => notation.id === selectedId);
  const selectedRelation = relations.find((relation) => relation.id === selectedRelationId);
  const edit = selected ? text.edits[selected.id] ?? selected : null;
  const editChanged = Boolean(selected && edit && (selected.title !== edit.title || selected.body !== edit.body));
  const textCount = textFieldCount(text, snapshot);
  const typedDrafts = textCount > 0;
  const unsaved = pending.length > 0 || typedDrafts;
  const capacity = useMemo(() => (snapshot ? capacityOf(snapshot) : null), [snapshot]);
  const dialogOpen = confirmReload || Boolean(leave) || Boolean(conflict);
  const locked = busy || !snapshot?.enabled || confirmReload || Boolean(leave);
  const commandsExhausted = Boolean(capacity?.commandsExhausted);
  const versionsExhausted = Boolean(capacity?.versionsExhausted);
  const canUndoNow = !locked && !typedDrafts && !commandsExhausted && Boolean(snapshot?.state.canUndo);
  const canRedoNow = !locked && !typedDrafts && !commandsExhausted && Boolean(snapshot?.state.canRedo);
  const canSaveNow = !locked && !typedDrafts && !versionsExhausted && pending.length > 0;
  const whyNotSave = !snapshot?.enabled ? 'Local notation state is disabled; there is nothing to save.'
    : busy ? 'A state request is in progress.'
      : dialogOpen ? 'Answer the open dialog first.'
        : typedDrafts ? 'Unapplied form text is retained. Preview or clear it before Save.'
          : versionsExhausted ? 'This workspace has reached its saved-version limit; nothing further can be saved here.'
            : !pending.length ? 'Nothing is pending. Save records previewed commands; there are none.' : '';
  const titleFor = useCallback((id: string) => notations.find((notation) => notation.id === id)?.title ?? id, [notations]);

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
      if (!controller.signal.aborted) { inFlightRef.current = false; setInFlight(null); setHydrated(true); }
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

  function begin(kind: Exclude<InFlight, null>) {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setInFlight(kind); setError(''); setNotice('');
    return true;
  }
  function finish() { inFlightRef.current = false; setInFlight(null); }
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
    if (!snapshot?.enabled || commandsExhausted || !begin('preview')) return;
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
    if (!snapshot?.enabled || !pending.length || typedDrafts || versionsExhausted || !begin('save')) return;
    try {
      const next = await readSnapshot('/api/state-kernel/save', batch(pending));
      setSnapshot(next); setPending([]);
      setNotice(`Saved local version ${next.savedVersion}.`);
    } catch (failure) { fail(failure); }
    finally { finish(); }
  }

  async function reload() {
    if (!begin('reload')) return;
    try {
      const next = await readSnapshot('/api/state-kernel');
      setSnapshot(next); setPending([]); setText(emptyText()); setConflict(null); clearDrafts();
      setSelectedId(next.state.notations.some((notation) => notation.id === selectedId) ? selectedId : next.state.notations[0]?.id ?? '');
      setSelectedRelationId('');
      setConfirmReload(false);
      setNotice(next.enabled ? 'Saved local state reloaded. Browser drafts cleared.' : 'Local notation state is disabled.');
    } catch (failure) { fail(failure); }
    finally { finish(); }
  }

  function discardAndLeave(href: string) {
    clearDrafts(); setPending([]); setText(emptyText()); setConflict(null); setLeave(null);
    router.push(href);
  }

  const undo = () => void preview({ commandId: crypto.randomUUID(), kind: 'UNDO' });
  const redo = () => void preview({ commandId: crypto.randomUUID(), kind: 'REDO' });

  // Keyboard shortcuts: Undo and Redo outside text fields (inside them the field's own history applies); Save anywhere.
  const shortcuts = useRef({ undo, redo, save: () => void save(), canUndo: canUndoNow, canRedo: canRedoNow, canSave: canSaveNow, whyNotSave });
  useEffect(() => { shortcuts.current = { undo, redo, save: () => void save(), canUndo: canUndoNow, canRedo: canRedoNow, canSave: canSaveNow, whyNotSave }; });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const current = shortcuts.current;
      const k = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const inField = Boolean(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (k === 's') { event.preventDefault(); if (current.canSave) current.save(); else setNotice(`Not saved. ${current.whyNotSave}`); return; }
      if (inField) return;
      if (k === 'z' && !event.shiftKey) { if (current.canUndo) { event.preventDefault(); current.undo(); } return; }
      if ((k === 'z' && event.shiftKey) || k === 'y') { if (current.canRedo) { event.preventDefault(); current.redo(); } }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  function select(id: string) {
    setSelectedRelationId('');
    if (id === selectedId) { document.getElementById('notation-edit-title')?.focus(); return; }
    setSelectedId(id);
  }
  function registerKeys(event: ReactKeyboardEvent<HTMLUListElement>) {
    const ids = notations.map((notation) => notation.id);
    if (!ids.length) return;
    const index = ids.indexOf(selectedId);
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    setSelectedRelationId(''); setSelectedId(ids[next]);
    (event.currentTarget.querySelector(`[data-notation-id="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }
  function relateFrom(id: string) {
    setText((current) => ({ ...current, relationFrom: id }));
    const target = document.getElementById('notation-relation-to');
    target?.scrollIntoView?.({ block: 'center' });
    target?.focus();
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (locked || !text.createTitle.trim()) return;
    const id = crypto.randomUUID();
    void preview({ commandId: crypto.randomUUID(), kind: 'CREATE_NOTATION', notation: { id, title: text.createTitle, body: text.createBody } }, () => {
      setSelectedId(id); setSelectedRelationId(''); setText((current) => ({ ...current, createTitle: '', createBody: '' }));
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
  const progress = inFlight === 'load' ? 'Loading saved local state…'
    : inFlight === 'preview' ? `Validating ${plural(pending.length + 1, 'command')} with the state kernel…`
      : inFlight === 'save' ? `Saving ${plural(pending.length, 'command')} against saved version ${snapshot?.savedVersion ?? '—'}…`
        : inFlight === 'reload' ? 'Reloading saved local state…' : notice;
  const inspecting = selectedRelation ? 'relation' : selected && edit ? 'notation' : null;
  const selectedRelations = selected ? relations.filter((relation) => relation.from === selected.id || relation.to === selected.id) : [];
  const selectedPending = selected ? pending.filter((command) => touches(command, selected.id)) : [];
  const globalPending = pending.filter((command) => command.kind === 'UNDO' || command.kind === 'REDO').length;

  return (
    <div className="p-3 sm:p-4 max-w-[1280px] mx-auto w-full flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label-sm mb-1">Notations · Local development</div>
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
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Draft commands">
          <button type="button" className="btn btn-sm" disabled={!canUndoNow} aria-keyshortcuts="Control+Z Meta+Z" title="Undo the last command in the draft (Ctrl+Z outside a text field)" onClick={undo}>Undo <kbd className="kbd" aria-hidden="true">Ctrl Z</kbd></button>
          <button type="button" className="btn btn-sm" disabled={!canRedoNow} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" title="Redo the last undone command (Ctrl+Shift+Z outside a text field)" onClick={redo}>Redo <kbd className="kbd" aria-hidden="true">Ctrl ⇧ Z</kbd></button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!canSaveNow} aria-keyshortcuts="Control+S Meta+S" aria-busy={inFlight === 'save'} title={canSaveNow ? 'Save the pending commands as the next local version (Ctrl+S)' : whyNotSave} onClick={() => void save()} data-testid="save-button">{inFlight === 'save' ? 'Saving…' : <>Save local version <kbd className="kbd" aria-hidden="true">Ctrl S</kbd></>}</button>
          <button type="button" className="btn btn-sm" disabled={busy || confirmReload} onClick={() => unsaved ? setConfirmReload(true) : void reload()}>Reload saved state</button>
          <details className="text-[12px] ml-auto" data-testid="shortcuts">
            <summary className="cursor-pointer" style={faint}>Keyboard</summary>
            <dl className="kv mt-1 m-0 text-[12px]">
              <dt><kbd className="kbd">Ctrl Z</kbd></dt><dd>Undo the last command in the draft. Inside a text field the field&apos;s own undo applies instead.</dd>
              <dt><kbd className="kbd">Ctrl ⇧ Z</kbd> / <kbd className="kbd">Ctrl Y</kbd></dt><dd>Redo, outside a text field.</dd>
              <dt><kbd className="kbd">Ctrl S</kbd></dt><dd>Save the pending commands as the next local version; says why when it cannot.</dd>
              <dt><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd></dt><dd>Move the selection in the register; Enter on the selected row opens its editor.</dd>
              <dt><kbd className="kbd">Esc</kbd></dt><dd>Close the inspector, outside a text field. On a Mac, ⌘ stands for Ctrl.</dd>
            </dl>
          </details>
        </div>
        <p className="text-[12px]" style={muted}>Save validates the whole pending batch again against the saved version. A preview is not a reservation: a conflict keeps your drafts and asks you to reload deliberately.</p>
        {typedDrafts && <p className="text-[12px]" style={muted}>Unapplied form text is retained. Preview or clear it before Save, Undo, or Redo.</p>}
        {commandsExhausted && <p className="text-[12px]" role="alert" style={{ color: 'var(--status-refused)' }} data-testid="commands-exhausted">This workspace has used all of its lifetime commands. No further command, undo or redo is accepted; save what is pending and copy your drafts.</p>}
        {versionsExhausted && <p className="text-[12px]" role="alert" style={{ color: 'var(--status-refused)' }} data-testid="versions-exhausted">This workspace has reached its saved-version limit. Previews still run; nothing further can be saved here.</p>}
        {snapshot?.savedDigest && <details className="text-[12px]"><summary className="cursor-pointer">Saved state digest</summary><p className="mono break-all mt-1">{snapshot.savedDigest}</p></details>}
      </section>

      {error && <div role="alert" className="surface-inset p-3 text-[13px]" style={{ color: 'var(--status-refused)' }}><p>{error}</p><p className="mt-1">Your browser drafts have been retained. A version conflict requires reloading saved state before starting a new draft.</p></div>}
      <div role="status" aria-live="polite" className="text-[13px] flex items-center gap-2" style={muted} data-busy={busy || undefined}>{busy && <span className="inline-block w-2 h-2 rounded-full" aria-hidden="true" style={{ background: 'var(--status-pending)' }} />}{progress}</div>

      {conflict && snapshot && <ConflictPanel drafts={conflict.drafts} savedVersion={snapshot.savedVersion} reason={conflict.reason} onKeep={() => { if (conflict.reason === 'STALE_DRAFTS') { setText({ ...emptyText(), ...conflict.drafts.text }); } setConflict(null); }} onReloadDiscard={() => setConfirmReload(true)} />}

      {confirmReload && <ReloadDialog busy={busy} onKeep={() => setConfirmReload(false)} onReload={() => void reload()} />}

      <div className={`workspace${inspecting ? ' has-inspector' : ''}`} data-testid="notation-workspace" data-inspecting={inspecting ?? 'none'}>
        <div className="workspace-top flex flex-col gap-4">
          <section className="surface p-3 min-w-0" aria-labelledby="notation-list-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="notation-list-heading" className="font-semibold">Notation register <span className="mono text-[12px] font-normal" style={faint}>{notations.length}</span></h2>
              {!inspecting && notations.length > 0 && <span className="text-[12px]" style={faint}>Select a notation to inspect and edit it.</span>}
            </div>
            {!notations.length ? (
              <div className="empty-state mt-3" data-testid="register-empty">
                <h3>{snapshot ? 'No notations in this state' : 'Loading saved local state'}</h3>
                {!snapshot ? <p className="m-0">The saved local version is being read.</p>
                  : !snapshot.enabled ? <p className="m-0">Local notation state is disabled, so nothing can be authored here. Enable the loopback development service, then reload saved state.</p>
                    : <><p className="m-0">Create the first notation below. The kernel validates it as a preview; it becomes part of a saved local version only when you save.</p><p className="m-0" style={faint}>Undo can remove a notation from the draft; Redo restores the same identity.</p></>}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5 mt-3 list-none m-0 p-0" aria-label="Notations" onKeyDown={registerKeys}>{notations.map((notation) => {
                const draft = text.edits[notation.id];
                const changed = Boolean(draft && (draft.title !== notation.title || draft.body !== notation.body));
                const origin = originOf('notation', notation.id, pending, snapshot?.savedVersion ?? 0);
                const relationCount = relations.filter((relation) => relation.from === notation.id || relation.to === notation.id).length;
                const active = notation.id === selectedId && !selectedRelation;
                return (
                  <li key={notation.id}>
                    <button type="button" className="row-selectable surface-inset p-2 w-full text-left break-words" disabled={locked} aria-pressed={active} aria-label={`Select notation ${notation.title}`} data-notation-id={notation.id} onClick={() => select(notation.id)}>
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[13px] font-medium" style={{ color: 'var(--text-heading)' }}>{notation.title}</span>
                        {changed && <span className="label-sm" style={{ color: 'var(--status-conditional)' }}>unapplied edit</span>}
                        {origin.state !== 'SAVED' && <span className="label-sm" style={{ color: origin.color }}>{origin.state === 'CREATED' ? 'new in draft' : 'changed in draft'}</span>}
                      </span>
                      <span className="flex flex-wrap gap-x-3 mt-0.5 text-[11px]" style={faint}><span className="mono break-all">{notation.id}</span><span>{plural(relationCount, 'relation')}</span></span>
                    </button>
                  </li>
                );
              })}</ul>
            )}
          </section>
        </div>

        {inspecting === 'notation' && selected && edit && (
          <Inspector id="notation-inspector" testId="notation-inspector" kicker="Selected notation" title={edit.title || selected.title} subtitle={<span className="mono" data-testid="selected-notation-id">{selected.id}</span>} onClose={dialogOpen ? undefined : () => setSelectedId('')}>
            {(() => { const origin = originOf('notation', selected.id, pending, snapshot?.savedVersion ?? 0); return <div className="text-[12px]" style={{ color: origin.color }} data-testid="selected-origin" data-origin={origin.state}>{origin.label}</div>; })()}
            <form aria-label="Edit notation" onSubmit={update}>
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
            </form>
            <section className="inspector-section" aria-labelledby="inspector-relations-heading" data-testid="inspector-relations">
              <h3 id="inspector-relations-heading">Relations of this notation · {selectedRelations.length}</h3>
              {selectedRelations.length ? <ul className="m-0 p-0 list-none flex flex-col gap-1">{selectedRelations.map((relation) => {
                const outgoing = relation.from === selected.id;
                const other = outgoing ? relation.to : relation.from;
                return <li key={relation.id}><button type="button" className="row-selectable surface-inset px-2 py-1.5 w-full text-left text-[12.5px] break-words" disabled={locked} aria-label={`Inspect relation ${relation.label}`} onClick={() => setSelectedRelationId(relation.id)}><span className="label-sm" style={faint}>{outgoing ? 'out' : 'in'}</span> <strong className="font-medium">{relation.label}</strong> <span style={faint}>{outgoing ? '→' : '←'}</span> {titleFor(other)}</button></li>;
              })}</ul> : <p className="m-0 text-[12.5px]" style={faint}>No relation names this notation.</p>}
              <div><button type="button" className="btn btn-sm" disabled={locked || notations.length < 1} onClick={() => relateFrom(selected.id)}>Relate this notation…</button></div>
            </section>
            <section className="inspector-section" aria-labelledby="inspector-pending-heading" data-testid="inspector-pending">
              <h3 id="inspector-pending-heading">Pending commands naming it · {selectedPending.length}</h3>
              {selectedPending.length ? <ol className="m-0 pl-5 text-[12.5px] flex flex-col gap-1">{selectedPending.map((command) => <li key={command.commandId} className="break-words">{describeCommand(command)}</li>)}</ol> : <p className="m-0 text-[12.5px]" style={faint}>None. Nothing about this notation is waiting to be saved.</p>}
              {globalPending > 0 && <p className="m-0 text-[12px]" style={faint}>{plural(globalPending, 'undo or redo command')} in the draft {globalPending === 1 ? 'applies' : 'apply'} to the whole state.</p>}
            </section>
            <section className="inspector-section" aria-labelledby="inspector-evidence-heading" data-testid="inspector-evidence">
              <h3 id="inspector-evidence-heading">Evidence references</h3>
              <p className="m-0 text-[12.5px]" style={muted}>Attachment is <span className="mono">DISABLED</span> by the backend contract: the state kernel has no attach or detach command, so this notation carries no reference. The reference contract and its fixture are in the <a href="#evidence-references-heading" style={{ color: 'var(--info)' }}>evidence references panel</a> below.</p>
            </section>
          </Inspector>
        )}

        {inspecting === 'relation' && selectedRelation && (
          <Inspector id="relation-inspector" testId="relation-inspector" kicker="Selected relation" title={selectedRelation.label} subtitle={<span className="mono" data-testid="selected-relation-id">{selectedRelation.id}</span>} onClose={dialogOpen ? undefined : () => setSelectedRelationId('')}>
            {(() => { const origin = originOf('relation', selectedRelation.id, pending, snapshot?.savedVersion ?? 0); return <div className="text-[12px]" style={{ color: origin.color }} data-testid="relation-origin" data-origin={origin.state}>{origin.label}</div>; })()}
            <dl className="kv m-0 text-[12.5px]">
              <dt>From</dt><dd><button type="button" className="btn btn-sm" onClick={() => { setSelectedRelationId(''); setSelectedId(selectedRelation.from); }}>Inspect from notation</button> <span className="ml-1">{titleFor(selectedRelation.from)}</span><div className="mono text-[10.5px] break-all" style={faint}>{selectedRelation.from}</div></dd>
              <dt>Label</dt><dd>{selectedRelation.label}</dd>
              <dt>To</dt><dd><button type="button" className="btn btn-sm" onClick={() => { setSelectedRelationId(''); setSelectedId(selectedRelation.to); }}>Inspect to notation</button> <span className="ml-1">{titleFor(selectedRelation.to)}</span><div className="mono text-[10.5px] break-all" style={faint}>{selectedRelation.to}</div></dd>
            </dl>
            <p className="m-0 text-[12.5px]" style={muted}>An authored link between two notation identities. Its label does not establish a factual, causal, or canonical relationship. The kernel has no command to edit or delete a relation; Undo steps the whole draft back one command at a time.</p>
          </Inspector>
        )}

        <div className="workspace-bottom flex flex-col gap-4">
          <section className="surface p-3" aria-labelledby="create-notation-heading">
            <h2 id="create-notation-heading" className="font-semibold">Create notation</h2>
            <form aria-label="Create notation" onSubmit={create} className="mt-3"><fieldset disabled={locked} className="flex flex-col gap-3">
              <label htmlFor="notation-create-title" className="text-[13px]">New notation title<input id="notation-create-title" className={fieldClass} required value={text.createTitle} onChange={(event) => field('createTitle', event.target.value)} /></label>
              <div><label htmlFor="notation-create-body" className="text-[13px]">New notation body</label><textarea id="notation-create-body" className={fieldClass} rows={3} value={text.createBody} onChange={(event) => field('createBody', event.target.value)} /></div>
              <div className="flex flex-wrap gap-2"><button type="submit" className="btn btn-primary btn-sm" disabled={!text.createTitle.trim() || commandsExhausted}>Preview new notation</button><button type="button" className="btn btn-sm" disabled={!text.createTitle && !text.createBody} onClick={() => setText((current) => ({ ...current, createTitle: '', createBody: '' }))}>Clear new notation</button></div>
            </fieldset></form>
          </section>
          <section className="surface p-3" aria-labelledby="notation-relations-heading">
            <h2 id="notation-relations-heading" className="font-semibold">Authored relations <span className="mono text-[12px] font-normal" style={faint}>{relations.length}</span></h2>
            <p className="text-[13px] mt-1" style={muted}>Explicit links between notation IDs. A label does not establish a factual, causal, or canonical relationship.</p>
            {relations.length ? <ul className="flex flex-col gap-1.5 mt-3 list-none m-0 p-0" aria-label="Relations">{relations.map((relation: NotationRelation) => (
              <li key={relation.id}>
                <button type="button" className="row-selectable surface-inset p-2 w-full text-left text-[13px] break-words" disabled={locked} aria-pressed={relation.id === selectedRelationId} aria-label={`Inspect relation ${relation.label}`} data-relation-id={relation.id} onClick={() => setSelectedRelationId(relation.id)}>
                  <span>{titleFor(relation.from)}</span> <span style={faint}>→</span> <span>{relation.label}</span> <span style={faint}>→</span> <span>{titleFor(relation.to)}</span>
                  <span className="block mono text-[10px] break-all mt-1" style={faint}>{relation.id}</span>
                </button>
              </li>
            ))}</ul> : <p className="text-[13px] mt-2" style={faint}>{notations.length ? 'No authored relations in this state. Select a notation and use "Relate this notation…", or fill in the form below.' : 'No authored relations in this state.'}</p>}
            <form aria-label="Create relation" onSubmit={createRelation} className="mt-3"><fieldset disabled={locked || !notations.length} className="grid gap-3 sm:grid-cols-3">
              <div><label htmlFor="notation-relation-from" className="text-[13px]">From notation</label><select id="notation-relation-from" className={fieldClass} required value={text.relationFrom} onChange={(event) => field('relationFrom', event.target.value)}><option value="">Select source</option>{notations.map((notation) => <option key={notation.id} value={notation.id}>{notation.title}</option>)}</select></div>
              <div><label htmlFor="notation-relation-to" className="text-[13px]">To notation</label><select id="notation-relation-to" className={fieldClass} required value={text.relationTo} onChange={(event) => field('relationTo', event.target.value)}><option value="">Select target</option>{notations.map((notation) => <option key={notation.id} value={notation.id}>{notation.title}</option>)}</select></div>
              <label htmlFor="notation-relation-label" className="text-[13px]">Relation label<input id="notation-relation-label" className={fieldClass} required value={text.relationLabel} onChange={(event) => field('relationLabel', event.target.value)} /></label>
              <div className="flex flex-wrap gap-2 sm:col-span-3"><button type="submit" className="btn btn-primary btn-sm" disabled={!text.relationFrom || !text.relationTo || !text.relationLabel.trim() || commandsExhausted}>Preview relation</button><button type="button" className="btn btn-sm" disabled={!text.relationFrom && !text.relationTo && !text.relationLabel} onClick={() => setText((current) => ({ ...current, relationFrom: '', relationTo: '', relationLabel: '' }))}>Clear relation form</button></div>
            </fieldset></form>
          </section>
          {capacity && snapshot?.enabled && <CapacityMeter capacity={capacity} />}
          {children}
        </div>
      </div>
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
