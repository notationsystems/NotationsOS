import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyNotationState, notationCapacity, type Notation, type NotationRelation, type StateKernelFailure, type StateKernelRequest, type StateKernelSnapshot } from '@/state-kernel/types';
import { NotationDraftProvider, NotationWorkspace } from './NotationWorkspace';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const original: Notation = { id: '00000000-0000-4000-8000-0000000000a1', title: 'Carrier observation', body: 'An authored local note.' };
const other: Notation = { id: '00000000-0000-4000-8000-0000000000a2', title: 'Port note', body: 'Local context.' };
const mentions: NotationRelation = { id: '00000000-0000-4000-8000-0000000000r1', from: original.id, to: other.id, label: 'mentions' };

function snapshot(notations: Notation[] = [], revision = 0, savedVersion = 0, extra: Partial<StateKernelSnapshot> & { relations?: NotationRelation[]; canRedo?: boolean } = {}): StateKernelSnapshot {
  const { relations = [], canRedo = false, ...rest } = extra;
  return {
    schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: true,
    savedVersion, savedDigest: savedVersion ? `sha256:${'a'.repeat(64)}` : null,
    state: { ...emptyNotationState(), notations, relations, revision, canUndo: revision > 0, canRedo },
    capacity: notationCapacity(revision, savedVersion), persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false, ...rest,
  };
}

type Response = StateKernelSnapshot | StateKernelFailure | Error | Promise<StateKernelSnapshot>;
function api(...responses: Response[]) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    let value = responses.shift();
    if (!value) throw new Error(`Unexpected state request: ${_init?.method ?? 'GET'} ${_url}`);
    if (value instanceof Promise) value = await value;
    if (value instanceof Error) throw value;
    return { ok: !('error' in value), status: 'error' in value ? 409 : 200, json: async () => value };
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const requestAt = (fetch: ReturnType<typeof api>, index: number) => JSON.parse(String(fetch.mock.calls[index][1]?.body)) as StateKernelRequest;
const renderWorkspace = () => render(<NotationDraftProvider><NotationWorkspace /></NotationDraftProvider>);

beforeEach(() => {
  let sequence = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('NotationWorkspace inspector and keyboard', () => {
  it('follows the selection: the inspector shows the selected notation, its relations, its origin and its pending commands, and Escape closes it outside a text field', async () => {
    const user = userEvent.setup();
    const created: Notation = { id: '00000000-0000-4000-8000-000000000001', title: 'Third', body: '' };
    api(snapshot([original, other], 2, 1, { relations: [mentions] }), snapshot([original, other, created], 3, 1, { relations: [mentions] }));
    renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    const inspector = screen.getByTestId('notation-inspector');
    expect(screen.getByTestId('notation-workspace')).toHaveAttribute('data-inspecting', 'notation');
    expect(within(inspector).getByRole('heading', { level: 2, name: original.title })).toBeInTheDocument();
    expect(within(inspector).getByTestId('selected-notation-id')).toHaveTextContent(original.id);
    expect(within(inspector).getByTestId('selected-origin')).toHaveAttribute('data-origin', 'SAVED');
    expect(within(inspector).getByTestId('selected-origin')).toHaveTextContent('In saved local version 1');
    expect(within(inspector).getByTestId('inspector-relations')).toHaveTextContent('Relations of this notation · 1');
    expect(within(inspector).getByTestId('inspector-relations')).toHaveTextContent('out mentions → Port note');
    expect(within(inspector).getByTestId('inspector-pending')).toHaveTextContent('None. Nothing about this notation is waiting to be saved.');
    expect(within(inspector).getByTestId('inspector-evidence')).toHaveTextContent('DISABLED');
    expect(screen.getByRole('button', { name: `Select notation ${original.title}` })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: `Select notation ${other.title}` })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: `Select notation ${other.title}` }));
    expect(within(screen.getByTestId('notation-inspector')).getByRole('heading', { level: 2, name: other.title })).toBeInTheDocument();
    expect(screen.getByTestId('inspector-relations')).toHaveTextContent('in mentions ← Carrier observation');

    await user.click(screen.getByLabelText('Notation body'));
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('notation-inspector')).toBeInTheDocument();
    await user.click(document.body);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('notation-inspector')).not.toBeInTheDocument();
    expect(screen.getByTestId('notation-workspace')).toHaveAttribute('data-inspecting', 'none');
    expect(screen.getByText('Select a notation to inspect and edit it.')).toBeInTheDocument();
    expect(screen.getByLabelText('New notation title')).toBeEnabled();

    await user.type(screen.getByLabelText('New notation title'), created.title);
    await user.click(screen.getByRole('button', { name: 'Preview new notation' }));
    const fresh = await screen.findByTestId('notation-inspector');
    expect(within(fresh).getByTestId('selected-notation-id')).toHaveTextContent(created.id);
    expect(within(fresh).getByTestId('selected-origin')).toHaveAttribute('data-origin', 'CREATED');
    expect(within(fresh).getByTestId('selected-origin')).toHaveTextContent('not saved');
    expect(within(fresh).getByTestId('inspector-pending')).toHaveTextContent(`Create notation "${created.title}"`);
    expect(screen.getByRole('button', { name: `Select notation ${created.title}` })).toHaveTextContent('new in draft');
  });

  it('creates relations from the inspector and inspects them: Relate pre-fills the source and moves focus to the target; a selected relation shows both ends and leads back to them', async () => {
    const user = userEvent.setup();
    api(snapshot([original, other], 2, 1, { relations: [mentions] }));
    renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    await user.click(screen.getByRole('button', { name: 'Relate this notation…' }));
    expect(screen.getByLabelText('From notation')).toHaveValue(original.id);
    expect(screen.getByLabelText('To notation')).toHaveFocus();
    expect(screen.getByTestId('state-text')).toHaveAttribute('data-count', '1');

    await user.click(within(screen.getByLabelText('Relations')).getByRole('button', { name: 'Inspect relation mentions' }));
    const relation = screen.getByTestId('relation-inspector');
    expect(screen.queryByTestId('notation-inspector')).not.toBeInTheDocument();
    expect(screen.getByTestId('notation-workspace')).toHaveAttribute('data-inspecting', 'relation');
    expect(within(relation).getByRole('heading', { level: 2, name: 'mentions' })).toBeInTheDocument();
    expect(within(relation).getByTestId('selected-relation-id')).toHaveTextContent(mentions.id);
    expect(within(relation).getByTestId('relation-origin')).toHaveAttribute('data-origin', 'SAVED');
    expect(relation).toHaveTextContent('Carrier observation');
    expect(relation).toHaveTextContent('Port note');
    expect(relation).toHaveTextContent('does not establish a factual, causal, or canonical relationship');
    expect(within(screen.getByLabelText('Relations')).getByRole('button', { name: 'Inspect relation mentions' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(relation).getByRole('button', { name: 'Inspect to notation' }));
    expect(screen.queryByTestId('relation-inspector')).not.toBeInTheDocument();
    expect(screen.getByTestId('selected-notation-id')).toHaveTextContent(other.id);
    expect(screen.getByRole('button', { name: `Select notation ${other.title}` })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves the selection with the arrow keys, opens the editor on Enter, and explains an empty register', async () => {
    const user = userEvent.setup();
    api(snapshot([original, other], 2, 1));
    const first = renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    screen.getByRole('button', { name: `Select notation ${original.title}` }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('selected-notation-id')).toHaveTextContent(other.id);
    expect(screen.getByRole('button', { name: `Select notation ${other.title}` })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('selected-notation-id')).toHaveTextContent(other.id);
    await user.keyboard('{Home}');
    expect(screen.getByTestId('selected-notation-id')).toHaveTextContent(original.id);
    expect(screen.getByRole('button', { name: `Select notation ${original.title}` })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Notation title')).toHaveFocus();
    first.unmount();

    api(snapshot());
    const second = renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    expect(screen.getByTestId('register-empty')).toHaveTextContent('No notations in this state');
    expect(screen.getByTestId('register-empty')).toHaveTextContent('Create the first notation below.');
    expect(screen.queryByTestId('notation-inspector')).not.toBeInTheDocument();
    second.unmount();

    api({ ...snapshot(), enabled: false, persistence: 'DISABLED' });
    renderWorkspace();
    await screen.findByText('Local notation state is disabled.');
    expect(screen.getByTestId('register-empty')).toHaveTextContent('Local notation state is disabled, so nothing can be authored here.');
  });

  it('keyboard shortcuts: Ctrl+Z and Ctrl+Shift+Z send Undo and Redo through the kernel outside text fields only; Ctrl+S saves, and says why when it cannot', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot([original], 1, 0), snapshot([], 2, 0, { canRedo: true }), snapshot([original], 3, 0), snapshot([original], 3, 1));
    renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    expect(screen.getByRole('button', { name: /^Undo/ })).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
    expect(screen.getByTestId('shortcuts')).toHaveTextContent('Ctrl S');

    await user.click(document.body);
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('1'));
    expect(requestAt(fetch, 1).commands.map((command) => command.kind)).toEqual(['UNDO']);
    expect(screen.getByTestId('register-empty')).toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('2'));
    expect(requestAt(fetch, 2).commands.map((command) => command.kind)).toEqual(['UNDO', 'REDO']);

    await user.click(screen.getByLabelText('Notation body'));
    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}y{/Control}');
    expect(fetch).toHaveBeenCalledTimes(3);

    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByText('Saved local version 1.')).toBeInTheDocument();
    expect(fetch.mock.calls[3][0]).toBe('/api/state-kernel/save');
    expect(requestAt(fetch, 3).commands.map((command) => command.kind)).toEqual(['UNDO', 'REDO']);

    await user.keyboard('{Control>}s{/Control}');
    expect(screen.getByRole('status')).toHaveTextContent('Not saved. Nothing is pending.');
    await user.type(screen.getByLabelText('Notation body'), ' More.');
    await user.keyboard('{Control>}s{/Control}');
    expect(screen.getByRole('status')).toHaveTextContent('Not saved. Unapplied form text is retained. Preview or clear it before Save.');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('shows saving in progress on the control and in the status, then the saved version', async () => {
    const user = userEvent.setup();
    let release: (value: StateKernelSnapshot) => void = () => {};
    const saving = new Promise<StateKernelSnapshot>((resolve) => { release = resolve; });
    const fresh: Notation = { id: '00000000-0000-4000-8000-000000000001', title: original.title, body: '' };
    api(snapshot(), snapshot([fresh], 1), saving);
    renderWorkspace();
    await screen.findByText('Saved local state loaded.');
    await user.type(screen.getByLabelText('New notation title'), fresh.title);
    await user.click(screen.getByRole('button', { name: 'Preview new notation' }));
    await screen.findByTestId('selected-notation-id');
    await user.click(screen.getByRole('button', { name: 'Save local version' }));
    expect(screen.getByTestId('save-button')).toHaveTextContent('Saving…');
    expect(screen.getByTestId('save-button')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Saving 1 command against saved version 0…');
    expect(screen.getByLabelText('Notation title')).toBeDisabled();
    release(snapshot([fresh], 1, 1));
    expect(await screen.findByText('Saved local version 1.')).toBeInTheDocument();
    expect(screen.getByTestId('save-button')).toHaveTextContent('Save local version');
    expect(screen.getByTestId('selected-origin')).toHaveAttribute('data-origin', 'SAVED');
  });
});
