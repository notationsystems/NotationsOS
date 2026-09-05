'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MAX_NOTATION_COMMANDS, MAX_NOTATION_SAVED_VERSIONS, notationCapacity, type KernelCommand, type Notation, type StateKernelFailure, type StateKernelRequest, type StateKernelSnapshot } from '@/state-kernel/types';

type Edit = Pick<Notation, 'title' | 'body'>;
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
  if (!value || typeof value !== 'object' || !('schema' in value) || value.schema !== 'payload.local-notation-workspace.v1'
    || value.state?.schema !== 'notations.notation-state.v1'
    || !Number.isSafeInteger(value.savedVersion) || value.savedVersion < 0 || value.savedVersion > MAX_NOTATION_SAVED_VERSIONS
    || !Number.isSafeInteger(value.state.revision) || value.state.revision < 0 || value.state.revision > MAX_NOTATION_COMMANDS
    || !Array.isArray(value.state.notations) || !Array.isArray(value.state.relations)
    || typeof value.enabled !== 'boolean' || typeof value.state.canUndo !== 'boolean' || typeof value.state.canRedo !== 'boolean') {
    throw new Error('The state service returned an invalid workspace snapshot.');
  }
  const expectedCapacity = notationCapacity(value.state.revision, value.savedVersion);
  if (!value.capacity || Object.entries(expectedCapacity).some(([key, expected]) => value.capacity[key as keyof typeof expectedCapacity] !== expected)) {
    throw new Error('The state service returned invalid or inconsistent capacity metadata.');
  }
  return value;
}

/** Owned by the root client provider: route changes must not discard or rebase an active draft. */
function useNotationController() {
  const [snapshot, setSnapshot] = useState<StateKernelSnapshot | null>(null);
  const [pending, setPending] = useState<KernelCommand[]>([]);
  const [previewInFlight, setPreviewInFlight] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const initiallyLoaded = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Loading saved local state…');
  const [selectedId, setSelectedId] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [createTitle, setCreateTitle] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [relationFrom, setRelationFrom] = useState('');
  const [relationTo, setRelationTo] = useState('');
  const [relationLabel, setRelationLabel] = useState('');
  const [confirmReload, setConfirmReload] = useState(false);
  const selected = snapshot?.state.notations.find((notation) => notation.id === selectedId);
  const edit = selected ? edits[selected.id] ?? selected : null;
  const editChanged = Boolean(selected && edit && (selected.title !== edit.title || selected.body !== edit.body));
  const typedDrafts = Boolean(createTitle || createBody || relationFrom || relationTo || relationLabel
    || Object.entries(edits).some(([id, draft]) => {
      const notation = snapshot?.state.notations.find((item) => item.id === id);
      return !notation || notation.title !== draft.title || notation.body !== draft.body;
    }));
  const unsaved = pending.length > 0 || typedDrafts;
  const locked = busy || !snapshot?.enabled || confirmReload;
  const commandCapacityReached = Boolean(snapshot && snapshot.capacity.remainingCommands <= 0);
  const versionCapacityReached = Boolean(snapshot && snapshot.capacity.remainingSavedVersions <= 0);
  const previewLocked = locked || commandCapacityReached || versionCapacityReached;

  // Only the first visit activates a load. An unmounted route must not abort an in-flight
  // request or replace retained state with a newer saved version when it is visited again.
  const loadInitial = useCallback(async () => {
    if (initiallyLoaded.current || inFlight.current) return;
    initiallyLoaded.current = true;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await readSnapshot('/api/state-kernel');
      setSnapshot(next);
      setSelectedId(next.state.notations[0]?.id ?? '');
      setNotice(next.enabled ? 'Saved local state loaded.' : 'Local notation state is disabled.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load local state.');
      setNotice('');
    } finally { inFlight.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    if (!unsaved && !previewInFlight) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved, previewInFlight]);

  function begin() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    return true;
  }
  function finish() { inFlight.current = false; setBusy(false); }
  function fail(failure: unknown) { setError(failure instanceof Error ? failure.message : 'The state request failed.'); }
  function batch(commands: KernelCommand[]): StateKernelRequest {
    return { schema: 'payload.notation-command-batch.v1', baseVersion: snapshot!.savedVersion, commands };
  }

  async function preview(command: KernelCommand, onAccepted?: () => void) {
    if (!snapshot || previewLocked || !begin()) return;
    setPreviewInFlight(true);
    const commands = [...pending, command];
    try {
      const next = await readSnapshot('/api/state-kernel/preview', batch(commands));
      if (next.savedVersion !== snapshot.savedVersion) throw new Error('The preview changed the saved version unexpectedly. Reload is required.');
      setSnapshot(next); setPending(commands);
      onAccepted?.();
      setNotice('Draft preview accepted by the state kernel. Not saved yet.');
    } catch (failure) { fail(failure); }
    finally { setPreviewInFlight(false); finish(); }
  }

  async function save() {
    if (locked || versionCapacityReached || !pending.length || typedDrafts || !begin()) return;
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
      setSnapshot(next); setPending([]); setEdits({});
      setCreateTitle(''); setCreateBody(''); setRelationFrom(''); setRelationTo(''); setRelationLabel('');
      setSelectedId(next.state.notations.some((notation) => notation.id === selectedId) ? selectedId : next.state.notations[0]?.id ?? '');
      setConfirmReload(false);
      setNotice(next.enabled ? 'Saved local state reloaded. Browser drafts cleared.' : 'Local notation state is disabled.');
    } catch (failure) { fail(failure); }
    finally { finish(); }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (previewLocked || !createTitle.trim()) return;
    const id = crypto.randomUUID();
    void preview({ commandId: crypto.randomUUID(), kind: 'CREATE_NOTATION', notation: { id, title: createTitle, body: createBody } }, () => {
      setSelectedId(id); setCreateTitle(''); setCreateBody('');
    });
  }
  function update(event: FormEvent) {
    event.preventDefault();
    if (previewLocked || !selected || !edit || !editChanged || !edit.title.trim()) return;
    const id = selected.id;
    void preview({ commandId: crypto.randomUUID(), kind: 'UPDATE_NOTATION', notationId: id, title: edit.title, body: edit.body }, () => {
      setEdits((current) => { const next = { ...current }; delete next[id]; return next; });
    });
  }
  function createRelation(event: FormEvent) {
    event.preventDefault();
    if (previewLocked || !relationFrom || !relationTo || !relationLabel.trim()) return;
    void preview({ commandId: crypto.randomUUID(), kind: 'CREATE_RELATION', relation: {
      id: crypto.randomUUID(), from: relationFrom, to: relationTo, label: relationLabel,
    } }, () => { setRelationFrom(''); setRelationTo(''); setRelationLabel(''); });
  }

  return {
    snapshot, pending, busy, error, notice, selectedId, setSelectedId, edits, setEdits,
    createTitle, setCreateTitle, createBody, setCreateBody, relationFrom, setRelationFrom,
    relationTo, setRelationTo, relationLabel, setRelationLabel, confirmReload, setConfirmReload,
    selected, edit, editChanged, typedDrafts, unsaved, locked, previewLocked,
    commandCapacityReached, versionCapacityReached, loadInitial, preview, save, reload, create, update, createRelation,
  };
}

const NotationDraftContext = createContext<ReturnType<typeof useNotationController> | null>(null);

/** Memory belongs to this browser document, not a server module or browser persistence store. */
export function NotationDraftProvider({ children }: { children: ReactNode }) {
  const controller = useNotationController();
  return <NotationDraftContext.Provider value={controller}>{children}</NotationDraftContext.Provider>;
}

export function NotationWorkspace() {
  const controller = useContext(NotationDraftContext);
  if (!controller) throw new Error('NotationWorkspace requires the root NotationDraftProvider.');
  return <NotationWorkspaceView controller={controller} />;
}

function NotationWorkspaceView({ controller }: { controller: ReturnType<typeof useNotationController> }) {
  const {
    snapshot, pending, busy, error, notice, selectedId, setSelectedId, setEdits,
    createTitle, setCreateTitle, createBody, setCreateBody, relationFrom, setRelationFrom,
    relationTo, setRelationTo, relationLabel, setRelationLabel, confirmReload, setConfirmReload,
    selected, edit, editChanged, typedDrafts, unsaved, locked, previewLocked,
    commandCapacityReached, versionCapacityReached, loadInitial, preview, save, reload, create, update, createRelation,
  } = controller;
  useEffect(() => { void loadInitial(); }, [loadInitial]);

  return (
    <div className="p-3 sm:p-4 max-w-[1180px] mx-auto w-full flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label-sm mb-1">Workbench · Local development</div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-heading)' }}>Notations</h1>
          <p className="text-[13px] mt-1 max-w-[760px]" style={muted}>Author notation state and explicit relations. The Rust state kernel validates previews, undo and redo; Save records a local version.</p>
        </div>
        <span className="pill">{busy && !snapshot ? 'LOADING' : snapshot?.enabled ? 'LOCAL DEVELOPMENT' : 'DISABLED'}</span>
      </header>
      <aside className="surface-inset p-3 text-[13px]" aria-label="Local development boundary">
        <p>Local authored state only. Not evidence, identity resolution, inference, or canonical corpus state.</p>
        <p className="mt-1" style={muted}>Previews and form text are browser drafts until saved. They remain in this tab during in-app navigation, but are not durable across a browser reload or tab closure. This screen does not admit data, release a corpus, or launch agents.</p>
        {snapshot && !snapshot.enabled && <p className="mt-2">Enable the loopback development service with <code className="mono">npm run dev:state-kernel</code>, then reload saved state.</p>}
      </aside>
      <section className="surface p-3 flex flex-col gap-3" aria-label="State controls">
        <dl className="flex flex-wrap gap-x-7 gap-y-2 text-[13px]">
          <div><dt className="label-sm">Saved version</dt><dd data-testid="saved-version" className="mono">{snapshot?.savedVersion ?? '—'}</dd></div>
          <div><dt className="label-sm">Draft revision</dt><dd data-testid="draft-revision" className="mono">{snapshot?.state.revision ?? '—'}</dd></div>
          <div><dt className="label-sm">Pending commands</dt><dd data-testid="pending-count" className="mono">{pending.length}</dd></div>
          <div><dt className="label-sm">Storage</dt><dd>{snapshot?.persistence === 'LOCAL_VERSIONED_FILES' ? 'Local versioned files' : 'Disabled'}</dd></div>
          <div><dt className="label-sm">Lifetime command capacity</dt><dd data-testid="command-capacity">{snapshot ? `${snapshot.capacity.usedCommands} / ${snapshot.capacity.maxCommands} used · ${snapshot.capacity.remainingCommands} remaining` : '—'}</dd></div>
          <div><dt className="label-sm">Saved version capacity</dt><dd data-testid="version-capacity">{snapshot ? `${snapshot.capacity.usedSavedVersions} / ${snapshot.capacity.maxSavedVersions} used · ${snapshot.capacity.remainingSavedVersions} remaining` : '—'}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={previewLocked || typedDrafts || !snapshot?.state.canUndo} onClick={() => void preview({ commandId: crypto.randomUUID(), kind: 'UNDO' })}>Undo</button>
          <button type="button" className="btn btn-sm" disabled={previewLocked || typedDrafts || !snapshot?.state.canRedo} onClick={() => void preview({ commandId: crypto.randomUUID(), kind: 'REDO' })}>Redo</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={locked || versionCapacityReached || typedDrafts || !pending.length} onClick={() => void save()}>Save local version</button>
          <button type="button" className="btn btn-sm" disabled={busy || confirmReload} onClick={() => unsaved ? setConfirmReload(true) : void reload()}>Reload saved state</button>
        </div>
        {typedDrafts && <p className="text-[12px]" style={muted}>Unapplied form text is retained. Preview or clear it before Save, Undo, or Redo.</p>}
        {snapshot?.savedDigest && <details className="text-[12px]"><summary className="cursor-pointer">Saved state digest</summary><p className="mono break-all mt-1">{snapshot.savedDigest}</p></details>}
      </section>
      {snapshot?.enabled && <aside className="surface-inset p-3 text-[13px]" aria-label="Bounded history capacity">
        {(commandCapacityReached || versionCapacityReached) && <p className="font-semibold">{versionCapacityReached ? 'Saved-version capacity reached. Further previews and saves are disabled.' : 'Lifetime command capacity reached. Further previews, including undo and redo, are disabled.'}</p>}
        {commandCapacityReached && !versionCapacityReached && pending.length > 0 && <p className="mt-1">This pending batch can still be saved while a saved-version slot remains.</p>}
        {!commandCapacityReached && !versionCapacityReached && <p>This demonstration has bounded history. Every accepted command, including undo and redo, uses lifetime capacity; a save uses one version slot.</p>}
        {!commandCapacityReached && !versionCapacityReached && (snapshot.capacity.remainingCommands <= 16 || snapshot.capacity.remainingSavedVersions <= 4) && <p className="font-semibold mt-1">Approaching the local history limit. Review the remaining command and saved-version capacity before continuing.</p>}
        <p className="mt-1" style={muted}>Before capacity runs out, save pending work where possible and preserve the existing state directory. An operator can configure a separate workspace. Do not reset or prune history to reclaim capacity; checkpoint/archive support and history migration are not implemented.</p>
      </aside>}
      {error && <div role="alert" className="surface-inset p-3 text-[13px]" style={{ color: 'var(--status-refused)' }}><p>{error}</p><p className="mt-1">Your browser drafts have been retained. A version conflict requires reloading saved state before starting a new draft.</p></div>}
      <div role="status" aria-live="polite" className="text-[13px]" style={muted}>{busy ? 'State request in progress…' : notice}</div>
      {confirmReload && <section role="alertdialog" aria-labelledby="reload-title" aria-describedby="reload-description" className="surface p-3">
        <h2 id="reload-title" className="font-semibold">Discard browser drafts?</h2>
        <p id="reload-description" className="text-[13px] mt-1" style={muted}>Reload replaces pending commands and unapplied form text with the saved local version. Drafts are cleared only after the reload succeeds.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirmReload(false)}>Keep editing</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void reload()}>Discard drafts and reload</button>
        </div>
      </section>}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section className="surface p-3 min-w-0" aria-labelledby="notation-list-heading">
          <h2 id="notation-list-heading" className="font-semibold">Notation register</h2>
          {!snapshot?.state.notations.length ? <p className="text-[13px] mt-3" style={muted}>{snapshot ? 'No notations in this state.' : 'Load local state to view notations.'}</p>
            : <ul className="flex flex-col gap-2 mt-3">{snapshot.state.notations.map((notation) => <li key={notation.id}>
              <button type="button" className="surface-inset p-2 w-full text-left break-words" disabled={locked} aria-pressed={notation.id === selectedId} aria-label={`Select notation ${notation.title}`} onClick={() => setSelectedId(notation.id)} style={notation.id === selectedId ? { borderColor: 'var(--accent)' } : undefined}>
                <span className="block text-[13px] font-medium">{notation.title}</span><span className="block mono text-[10px] break-all mt-1" style={muted}>{notation.id}</span>
              </button>
            </li>)}</ul>}
        </section>
        <section className="surface p-3 min-w-0" aria-labelledby="notation-editor-heading">
          <h2 id="notation-editor-heading" className="font-semibold">Selected notation</h2>
          {selected && edit ? <form aria-label="Edit notation" onSubmit={update} className="mt-3">
            <p className="label-sm">Stable notation ID</p><p data-testid="selected-notation-id" className="mono text-[12px] break-all mb-3">{selected.id}</p>
            <fieldset disabled={locked} className="flex flex-col gap-3">
              <label htmlFor="notation-edit-title" className="text-[13px]">Notation title<input id="notation-edit-title" className={fieldClass} required disabled={previewLocked} value={edit.title} onChange={(event) => setEdits((current) => ({ ...current, [selected.id]: { ...edit, title: event.target.value } }))} /></label>
              <div><label htmlFor="notation-edit-body" className="text-[13px]">Notation body</label><textarea id="notation-edit-body" className={fieldClass} rows={7} disabled={previewLocked} value={edit.body} onChange={(event) => setEdits((current) => ({ ...current, [selected.id]: { ...edit, body: event.target.value } }))} /></div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={previewLocked || !editChanged || !edit.title.trim()}>Preview changes</button>
                <button type="button" className="btn btn-sm" disabled={!editChanged} onClick={() => setEdits((current) => { const next = { ...current }; delete next[selected.id]; return next; })}>Clear form edits</button>
              </div>
            </fieldset>
          </form> : <p className="text-[13px] mt-3" style={muted}>Select a notation or create one below. Undo can remove a notation from this draft; Redo restores the same ID.</p>}
        </section>
      </div>
      <section className="surface p-3" aria-labelledby="create-notation-heading">
        <h2 id="create-notation-heading" className="font-semibold">Create notation</h2>
        <form aria-label="Create notation" onSubmit={create} className="mt-3"><fieldset disabled={locked} className="flex flex-col gap-3">
          <label htmlFor="notation-create-title" className="text-[13px]">New notation title<input id="notation-create-title" className={fieldClass} required disabled={previewLocked} value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} /></label>
          <div><label htmlFor="notation-create-body" className="text-[13px]">New notation body</label><textarea id="notation-create-body" className={fieldClass} rows={3} disabled={previewLocked} value={createBody} onChange={(event) => setCreateBody(event.target.value)} /></div>
          <div className="flex flex-wrap gap-2"><button type="submit" className="btn btn-primary btn-sm" disabled={previewLocked || !createTitle.trim()}>Preview new notation</button><button type="button" className="btn btn-sm" disabled={!createTitle && !createBody} onClick={() => { setCreateTitle(''); setCreateBody(''); }}>Clear new notation</button></div>
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
          <div><label htmlFor="notation-relation-from" className="text-[13px]">From notation</label><select id="notation-relation-from" className={fieldClass} required disabled={previewLocked} value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}><option value="">Select source</option>{snapshot?.state.notations.map((notation) => <option key={notation.id} value={notation.id}>{notation.title}</option>)}</select></div>
          <div><label htmlFor="notation-relation-to" className="text-[13px]">To notation</label><select id="notation-relation-to" className={fieldClass} required disabled={previewLocked} value={relationTo} onChange={(event) => setRelationTo(event.target.value)}><option value="">Select target</option>{snapshot?.state.notations.map((notation) => <option key={notation.id} value={notation.id}>{notation.title}</option>)}</select></div>
          <label htmlFor="notation-relation-label" className="text-[13px]">Relation label<input id="notation-relation-label" className={fieldClass} required disabled={previewLocked} value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-3"><button type="submit" className="btn btn-primary btn-sm" disabled={previewLocked || !relationFrom || !relationTo || !relationLabel.trim()}>Preview relation</button><button type="button" className="btn btn-sm" disabled={!relationFrom && !relationTo && !relationLabel} onClick={() => { setRelationFrom(''); setRelationTo(''); setRelationLabel(''); }}>Clear relation form</button></div>
        </fieldset></form>
      </section>
    </div>
  );
}
