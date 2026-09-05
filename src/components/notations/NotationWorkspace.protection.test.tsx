import type React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyNotationState, notationCapacity, type Notation, type StateKernelFailure, type StateKernelRequest, type StateKernelSnapshot } from '@/state-kernel/types';
import { DRAFT_STORAGE_KEY, readDrafts } from './drafts';
import { NotationDraftProvider, NotationWorkspace, useNotationDraftStatus } from './NotationWorkspace';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const notationId = '00000000-0000-4000-8000-000000000001';
const original: Notation = { id: notationId, title: 'Carrier observation', body: 'An authored local note.' };

function snapshot(notations: Notation[] = [], revision = 0, savedVersion = 0, extra: Partial<StateKernelSnapshot> = {}): StateKernelSnapshot {
  return {
    schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: true,
    savedVersion, savedDigest: savedVersion ? `sha256:${'a'.repeat(64)}` : null,
    state: { ...emptyNotationState(), notations, revision, canUndo: notations.length > 0, canRedo: false },
    capacity: notationCapacity(revision, savedVersion), persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false, ...extra,
  };
}

function api(...responses: (StateKernelSnapshot | StateKernelFailure | Error)[]) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    const value = responses.shift();
    if (!value) throw new Error(`Unexpected state request: ${_init?.method ?? 'GET'} ${_url}`);
    if (value instanceof Error) throw value;
    return { ok: !('error' in value), status: 'error' in value ? 409 : 200, json: async () => value };
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const requestAt = (fetch: ReturnType<typeof api>, index: number) => JSON.parse(String(fetch.mock.calls[index][1]?.body)) as StateKernelRequest;
const renderWorkspace = () => render(<NotationDraftProvider><NotationWorkspace /></NotationDraftProvider>);
function Probe() {
  const status = useNotationDraftStatus();
  return <div data-testid="draft-status" data-unsaved={String(status?.unsaved)} data-pending={status?.pendingCount} data-text={status?.textCount} />;
}

beforeEach(() => {
  let sequence = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
  push.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('NotationWorkspace protects the authoring workflow', () => {
  it('keeps unapplied text and validated commands in this tab across unmount and remount, re-validating the commands through the kernel', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot(), snapshot([original], 1));
    const first = renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    await user.type(screen.getByLabelText('New notation title'), original.title);
    await user.click(screen.getByRole('button', { name: 'Preview new notation' }));
    await screen.findByTestId('selected-notation-id');
    await user.type(screen.getByLabelText('Notation body'), ' Unapplied thought.');
    await user.type(screen.getByLabelText('Relation label'), 'draft label');
    await waitFor(() => expect(readDrafts()).toMatchObject({ baseVersion: 0, pending: [expect.objectContaining({ kind: 'CREATE_NOTATION' })] }));
    expect(screen.getByTestId('state-text')).toHaveAttribute('data-count', '2');
    expect(screen.getByTestId('state-pending')).toHaveAttribute('data-count', '1');
    first.unmount();

    const again = api(snapshot(), snapshot([original], 1));
    renderWorkspace();
    expect(await screen.findByText(/Browser drafts restored: 1 pending command re-validated by the state kernel\. Not saved\./)).toBeInTheDocument();
    expect(requestAt(again, 1)).toMatchObject({ baseVersion: 0, commands: [expect.objectContaining({ kind: 'CREATE_NOTATION', notation: expect.objectContaining({ id: notationId, title: original.title }) })] });
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(screen.getByLabelText('Notation body')).toHaveValue(`${original.body} Unapplied thought.`);
    expect(screen.getByLabelText('Relation label')).toHaveValue('draft label');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sets drafts from another saved version aside as stale, inspectable and copyable, instead of applying them', async () => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schema: 'payload.notation-browser-drafts.v1', baseVersion: 0, savedDigest: null, selectedId: '', storedAt: 'x',
      pending: [{ commandId: 'c1', kind: 'CREATE_NOTATION', notation: original }], text: { createTitle: 'Later idea', createBody: '', relationFrom: '', relationTo: '', relationLabel: '', edits: {} } }));
    const fetch = api(snapshot([], 0, 2));
    renderWorkspace();
    const panel = await screen.findByTestId('conflict-panel');
    expect(panel).toHaveAttribute('data-reason', 'STALE_DRAFTS');
    expect(panel).toHaveTextContent('Drafts from an earlier saved version');
    expect(within(panel).getByTestId('conflict-commands')).toHaveTextContent(`Create notation "${original.title}"`);
    expect((within(panel).getByLabelText('Draft JSON') as HTMLTextAreaElement).value).toContain('"Later idea"');
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps drafts in the browser document across internal navigation without interrupting it, and tells the shell there is unsaved work', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot([original], 1, 1));
    window.history.pushState({}, '', '/notations');
    const stop = (event: React.MouseEvent) => event.preventDefault();
    const view = render(<NotationDraftProvider><a href="/elsewhere" onClick={stop}>Elsewhere</a><Probe /><NotationWorkspace /></NotationDraftProvider>);
    await screen.findByText('Saved local state loaded.');
    expect(screen.getByTestId('draft-status')).toHaveAttribute('data-unsaved', 'false');
    await user.type(screen.getByLabelText('New notation title'), 'Unsaved');
    await user.type(screen.getByLabelText('Notation body'), ' More.');
    expect(screen.getByTestId('draft-status')).toHaveAttribute('data-unsaved', 'true');
    expect(screen.getByTestId('draft-status')).toHaveAttribute('data-text', '2');
    await user.click(screen.getByText('Elsewhere'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New notation title')).toHaveValue('Unsaved');

    view.rerender(<NotationDraftProvider><a href="/elsewhere" onClick={stop}>Elsewhere</a><Probe /><h1>Releases route</h1></NotationDraftProvider>);
    expect(screen.getByTestId('draft-status')).toHaveAttribute('data-unsaved', 'true');
    expect(readDrafts()?.text.createTitle).toBe('Unsaved');
    view.rerender(<NotationDraftProvider><a href="/elsewhere" onClick={stop}>Elsewhere</a><Probe /><NotationWorkspace /></NotationDraftProvider>);
    expect(screen.getByLabelText('New notation title')).toHaveValue('Unsaved');
    expect(screen.getByLabelText('Notation body')).toHaveValue(`${original.body} More.`);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('explains a version conflict, keeps the work inspectable and copyable, and reloads only deliberately', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot(), snapshot([original], 1), { error: { code: 'VERSION_CONFLICT', message: 'Another save changed this workspace.' } }, snapshot([{ ...original, title: 'Theirs' }], 1, 1));
    renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    await user.type(screen.getByLabelText('New notation title'), original.title);
    await user.click(screen.getByRole('button', { name: 'Preview new notation' }));
    await screen.findByTestId('selected-notation-id');
    await user.click(screen.getByRole('button', { name: 'Save local version' }));
    const panel = await screen.findByTestId('conflict-panel');
    expect(panel).toHaveAttribute('data-reason', 'VERSION_CONFLICT');
    expect(panel).toHaveTextContent('Another save changed this workspace');
    expect(within(panel).getByTestId('conflict-commands')).toHaveTextContent(`Create notation "${original.title}"`);
    expect((within(panel).getByLabelText('Draft JSON') as HTMLTextAreaElement).value).toContain(original.title);
    await user.click(within(panel).getByRole('button', { name: 'Copy drafts as JSON' }));
    expect(within(panel).getByRole('status')).toHaveTextContent(/Copied to the clipboard|Clipboard unavailable/);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(fetch).toHaveBeenCalledTimes(3);
    await user.click(within(panel).getByRole('button', { name: 'Keep working with these drafts' }));
    expect(screen.queryByTestId('conflict-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Reload saved state' }));
    await user.click(screen.getByRole('button', { name: 'Discard drafts and reload' }));
    await waitFor(() => expect(screen.getByTestId('saved-version')).toHaveTextContent('1'));
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
    expect(readDrafts()).toBeNull();
  });

  it('shows the capacity the API reports, verified against the contract, and stops edits or saves at the limits with an explanation', async () => {
    api(snapshot([original], 256, 64));
    renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    const capacity = screen.getByTestId('capacity');
    expect(capacity).toHaveAttribute('data-source', 'API');
    expect(screen.getByTestId('capacity-commands')).toHaveAttribute('data-level', 'full');
    expect(screen.getByTestId('capacity-versions')).toHaveAttribute('data-remaining', '0');
    expect(screen.getByTestId('command-capacity')).toHaveTextContent('256 / 256 used · 0 remaining');
    expect(screen.getByTestId('commands-exhausted')).toHaveTextContent('No further command, undo or redo is accepted');
    expect(screen.getByTestId('versions-exhausted')).toHaveTextContent('nothing further can be saved here');
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Save local version/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview new notation' })).toBeDisabled();
    expect(screen.getByLabelText('Notation title')).toBeDisabled();
    expect(capacity).toHaveTextContent('new workspace directory');
  });

  it('warns while approaching the limits and refuses a snapshot whose capacity disagrees with the contract', async () => {
    api(snapshot([original], 240, 1));
    const first = renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    expect(screen.getByTestId('capacity-commands')).toHaveAttribute('data-level', 'warn');
    expect(screen.getByTestId('capacity-commands')).toHaveTextContent('Near the limit');
    expect(screen.getByText(/Approaching the local history limit/)).toBeInTheDocument();
    first.unmount();
    api({ ...snapshot([original], 5, 1), capacity: { ...notationCapacity(5, 1), remainingCommands: 3 } });
    renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or inconsistent capacity metadata');
    expect(screen.getByTestId('saved-version')).toHaveTextContent('—');
  });

  it('never implies that a preview guarantees a save', async () => {
    const user = userEvent.setup();
    api(snapshot(), snapshot([original], 1));
    renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    await user.type(screen.getByLabelText('New notation title'), original.title);
    await user.click(screen.getByRole('button', { name: 'Preview new notation' }));
    expect(await screen.findByText(/Not saved: another save may still win before yours\./)).toBeInTheDocument();
    expect(screen.getByText(/A preview is not a reservation/)).toBeInTheDocument();
    expect(screen.getByTestId('state-pending')).toHaveTextContent('Save may still conflict');
  });
});
