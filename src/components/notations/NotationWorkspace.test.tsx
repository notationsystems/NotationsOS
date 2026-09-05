import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyNotationState, type Notation, type StateKernelFailure, type StateKernelRequest, type StateKernelSnapshot } from '@/state-kernel/types';
import { NotationWorkspace } from './NotationWorkspace';

const notationId = '00000000-0000-4000-8000-000000000001';
const original: Notation = { id: notationId, title: 'Carrier observation', body: 'An authored local note.' };
const changed: Notation = { ...original, title: 'Carrier context', body: 'Revised local note.' };

function snapshot(notations: Notation[] = [], revision = 0, savedVersion = 0, canRedo = false): StateKernelSnapshot {
  return {
    schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: true,
    savedVersion, savedDigest: savedVersion ? `sha256:${'a'.repeat(64)}` : null,
    state: { ...emptyNotationState(), notations, revision, canUndo: notations.length > 0, canRedo },
    persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false,
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
function requestAt(fetch: ReturnType<typeof api>, index: number): StateKernelRequest {
  return JSON.parse(String(fetch.mock.calls[index][1]?.body)) as StateKernelRequest;
}
async function createOriginal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('New notation title'), original.title);
  await user.type(screen.getByLabelText('New notation body'), original.body);
  await user.click(screen.getByRole('button', { name: 'Preview new notation' }));
  await screen.findByTestId('selected-notation-id');
}

beforeEach(() => {
  let sequence = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('NotationWorkspace', () => {
  it('loads through the client API and keeps disabled local state visibly noncanonical and uneditable', async () => {
    const fetch = api({ ...snapshot(), enabled: false, persistence: 'DISABLED' });
    render(<NotationWorkspace />);
    expect(await screen.findByText('npm run dev:state-kernel')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/state-kernel', expect.objectContaining({ method: 'GET', cache: 'no-store' }));
    expect(screen.getByText('Local authored state only. Not evidence, identity resolution, inference, or canonical corpus state.')).toBeInTheDocument();
    expect(screen.getByLabelText('New notation title')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save local version' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload saved state' })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('previews complete command batches, retains a stable ID through update/undo/redo, then saves and reloads', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot(), snapshot([original], 1), snapshot([changed], 2), snapshot([original], 3, 0, true), snapshot([changed], 4), snapshot([changed], 4, 1), snapshot([changed], 4, 1));
    render(<NotationWorkspace />);
    await screen.findByText('Saved local state loaded.');
    await createOriginal(user);
    expect(screen.getByTestId('selected-notation-id')).toHaveTextContent(notationId);
    expect((screen.getByLabelText('Notation body') as HTMLTextAreaElement).labels?.[0]).toHaveTextContent(/^Notation body$/);
    expect((screen.getByLabelText('New notation body') as HTMLTextAreaElement).labels?.[0]).toHaveTextContent(/^New notation body$/);
    expect(screen.getByTestId('saved-version')).toHaveTextContent('0');
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(screen.getByLabelText('New notation title')).toHaveValue('');
    const create = requestAt(fetch, 1);
    expect(create).toMatchObject({ schema: 'payload.notation-command-batch.v1', baseVersion: 0, commands: [{ kind: 'CREATE_NOTATION', notation: original }] });

    await user.clear(screen.getByLabelText('Notation title'));
    await user.type(screen.getByLabelText('Notation title'), changed.title);
    await user.clear(screen.getByLabelText('Notation body'));
    await user.type(screen.getByLabelText('Notation body'), changed.body);
    expect(screen.getByRole('button', { name: 'Save local version' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('2'));
    expect(requestAt(fetch, 2).commands).toEqual([...create.commands, expect.objectContaining({ kind: 'UPDATE_NOTATION', notationId, title: changed.title, body: changed.body })]);
    expect(screen.getByTestId('selected-notation-id')).toHaveTextContent(notationId);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByLabelText('Notation title')).toHaveValue(original.title));
    expect(requestAt(fetch, 3).commands.map((command) => command.kind)).toEqual(['CREATE_NOTATION', 'UPDATE_NOTATION', 'UNDO']);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(screen.getByLabelText('Notation title')).toHaveValue(changed.title));
    const preview = requestAt(fetch, 4);
    expect(preview.commands.map((command) => command.kind)).toEqual(['CREATE_NOTATION', 'UPDATE_NOTATION', 'UNDO', 'REDO']);
    expect(new Set(preview.commands.map((command) => command.commandId)).size).toBe(4);
    expect(screen.getByTestId('draft-revision')).toHaveTextContent('4');

    await user.click(screen.getByRole('button', { name: 'Save local version' }));
    expect(await screen.findByText('Saved local version 1.')).toBeInTheDocument();
    expect(fetch.mock.calls[5][0]).toBe('/api/state-kernel/save');
    expect(requestAt(fetch, 5)).toEqual(preview);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
    expect(screen.getByTestId('saved-version')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Reload saved state' }));
    expect(await screen.findByText('Saved local state reloaded. Browser drafts cleared.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('selected-notation-id')).toHaveTextContent(notationId);
    expect(screen.getByLabelText('Notation body')).toHaveValue(changed.body);
    expect(fetch.mock.calls[6][1]?.method).toBe('GET');
  });

  it('preserves failed saves and stale-version conflicts, and retries the identical accepted batch', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot(), snapshot([original], 1), new Error('Connection interrupted'), {
      error: { code: 'VERSION_CONFLICT', message: 'Another save changed this workspace.' },
    }, snapshot([changed], 2, 1));
    render(<NotationWorkspace />);
    await screen.findByText('Saved local state loaded.');
    await createOriginal(user);
    await user.click(screen.getByRole('button', { name: 'Save local version' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(screen.getByTestId('saved-version')).toHaveTextContent('0');
    await user.click(screen.getByRole('button', { name: 'Save local version' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('VERSION_CONFLICT'));
    expect(requestAt(fetch, 3)).toEqual(requestAt(fetch, 2));
    expect(screen.getByLabelText('Notation title')).toHaveValue(original.title);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Reload saved state' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(fetch).toHaveBeenCalledTimes(4);
    await user.click(within(confirmation).getByRole('button', { name: 'Discard drafts and reload' }));
    await waitFor(() => expect(screen.getByTestId('saved-version')).toHaveTextContent('1'));
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
    expect(screen.getByLabelText('Notation title')).toHaveValue(changed.title);
  });

  it('requires explicit discard for typed forms and retains them when confirmed reload fails', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot([original], 1, 1), new Error('Reload unavailable'), snapshot([original], 1, 1));
    render(<NotationWorkspace />);
    await screen.findByText('Saved local state loaded.');
    await user.type(screen.getByLabelText('New notation title'), 'Unsaved form');
    await user.type(screen.getByLabelText('Notation body'), ' Further thought.');
    await user.click(screen.getByRole('button', { name: 'Reload saved state' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Drafts are cleared only after the reload succeeds.');
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New notation title')).toHaveValue('Unsaved form');
    await user.click(screen.getByRole('button', { name: 'Reload saved state' }));
    await user.click(screen.getByRole('button', { name: 'Discard drafts and reload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload unavailable');
    expect(screen.getByLabelText('New notation title')).toHaveValue('Unsaved form');
    expect(screen.getByLabelText('Notation body')).toHaveValue(`${original.body} Further thought.`);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard drafts and reload' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('New notation title')).toHaveValue('');
    expect(screen.getByLabelText('Notation body')).toHaveValue(original.body);
  });

  it('retains rejected preview text without appending a command or claiming a save', async () => {
    const user = userEvent.setup();
    const fetch = api(snapshot(), { error: { code: 'INVALID_COMMAND', message: 'The notation exceeds the local bound.' } });
    render(<NotationWorkspace />);
    await screen.findByText('Saved local state loaded.');
    await user.type(screen.getByLabelText('New notation title'), original.title);
    await user.type(screen.getByLabelText('New notation body'), original.body);
    await user.click(screen.getByRole('button', { name: 'Preview new notation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('INVALID_COMMAND');
    expect(screen.getByLabelText('New notation title')).toHaveValue(original.title);
    expect(screen.getByLabelText('New notation body')).toHaveValue(original.body);
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
    expect(screen.queryByTestId('selected-notation-id')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save local version' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps unapplied edits across selection and previews an explicit relation through the same backend', async () => {
    const user = userEvent.setup();
    const other = { id: 'other-id', title: 'Port note', body: 'Local context.' };
    const initial = snapshot([original, other], 2, 1);
    const withRelation = snapshot([original, other], 3, 1);
    withRelation.state.relations = [{ id: '00000000-0000-4000-8000-000000000002', from: original.id, to: other.id, label: 'mentions' }];
    const fetch = api(initial, withRelation);
    render(<NotationWorkspace />);
    await screen.findByText('Saved local state loaded.');
    await user.type(screen.getByLabelText('Notation body'), ' Unapplied.');
    await user.click(screen.getByRole('button', { name: 'Select notation Port note' }));
    await user.click(screen.getByRole('button', { name: 'Select notation Carrier observation' }));
    expect(screen.getByLabelText('Notation body')).toHaveValue(`${original.body} Unapplied.`);
    await user.click(screen.getByRole('button', { name: 'Clear form edits' }));
    await user.selectOptions(screen.getByLabelText('From notation'), original.id);
    await user.selectOptions(screen.getByLabelText('To notation'), other.id);
    await user.type(screen.getByLabelText('Relation label'), 'mentions');
    await user.click(screen.getByRole('button', { name: 'Preview relation' }));
    expect(await screen.findByText('mentions', { selector: 'span' })).toBeInTheDocument();
    expect(requestAt(fetch, 1)).toMatchObject({ baseVersion: 1, commands: [{ kind: 'CREATE_RELATION', relation: withRelation.state.relations[0] }] });
    expect(screen.getByLabelText('Relation label')).toHaveValue('');
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
  });
});
