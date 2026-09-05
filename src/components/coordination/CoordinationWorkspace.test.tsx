import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from '@/coordination/seed';
import { applyCommand, connectionsFor } from '@/coordination/ledger';
import type { CoordinationCommand, CoordinationSnapshot, CoordinationState } from '@/coordination/types';
import { CoordinationWorkspace } from './CoordinationWorkspace';

function snapshot(state = createSeed(), canWrite = false): CoordinationSnapshot {
  return { ...state, fixture_only: true, scope: DEMO_SCOPE, mode: canWrite ? 'LOCAL_SANDBOX' : 'FIXTURE',
    persistence: canWrite ? 'LOCAL_FILE' : 'NONE', canWrite, connections: connectionsFor(state, DEMO_SCOPE), releaseContexts: RELEASE_CONTEXTS };
}

function localApi(initial: CoordinationState) {
  let state = initial;
  const commands: CoordinationCommand[] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.body) {
      const command = JSON.parse(String(init.body)) as CoordinationCommand;
      commands.push(command);
      state = applyCommand(state, DEMO_SCOPE, command, RELEASE_CONTEXTS, '2026-09-05T13:00:00.000Z');
    }
    return { ok: true, json: async () => snapshot(state, true) };
  });
  vi.stubGlobal('fetch', fetch);
  return { commands, fetch };
}

afterEach(() => vi.unstubAllGlobals());

describe('CoordinationWorkspace', () => {
  it('exposes declared connections and filters stable definitions without implying running workers', async () => {
    const user = userEvent.setup();
    render(<CoordinationWorkspace initial={snapshot()} view="stable" />);
    expect(screen.getByText('No agents are launched by this board.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Register participant' })).not.toBeInTheDocument();
    const normalization = screen.getByRole('article', { name: 'Participant Normalization agent' });
    expect(within(normalization).getByText('PLANNED')).toBeInTheDocument();
    await user.click(within(normalization).getByText(/Synastry/));
    expect(within(normalization).getByText(/Missing inputs:/)).toHaveTextContent('IdentityMapping/v1');
    await user.selectOptions(screen.getByLabelText('Participant kind'), 'AGENT');
    await user.type(screen.getByLabelText('Search the stable'), 'identity.propose');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Participant Identity agent' })).toBeInTheDocument();
  });

  it('filters board messages and keeps fixture mode read only', async () => {
    const user = userEvent.setup();
    render(<CoordinationWorkspace initial={snapshot()} view="board" />);
    expect(screen.queryByRole('form', { name: 'Compose message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
    expect(screen.getByText('npm run dev:coordination')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Message kind filter'), 'BLOCKER');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'REL-CAR-2026.09.01' })).toHaveAttribute('href', '/releases/REL-CAR-2026.09.01');
    await user.selectOptions(screen.getByLabelText('Topic filter'), 'release-assembly');
    expect(screen.getByText('No messages match these filters.')).toBeInTheDocument();
  });

  it('retains a failed draft and retries with the same idempotency key before showing the saved message', async () => {
    const user = userEvent.setup();
    const state = createSeed();
    const api = localApi(state);
    api.fetch.mockRejectedValueOnce(new Error('Connection interrupted'));
    render(<CoordinationWorkspace initial={snapshot(state, true)} view="board" />);
    await user.type(screen.getByLabelText('Topic'), 'corpus-inputs');
    await user.type(screen.getByLabelText('Title'), 'Inspect the input contract');
    await user.type(screen.getByLabelText('Body'), 'Keep the release context attached to the next handoff.');
    await user.click(screen.getByRole('button', { name: 'Post message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    expect(screen.getByLabelText('Body')).toHaveValue('Keep the release context attached to the next handoff.');
    await user.click(screen.getByRole('button', { name: 'Post message' }));
    expect(await screen.findByRole('article', { name: 'Message Inspect the input contract' })).toBeInTheDocument();
    const first = JSON.parse(String(api.fetch.mock.calls[0][1]?.body));
    const second = JSON.parse(String(api.fetch.mock.calls[1][1]?.body));
    expect(first.message.requestId).toBeTruthy();
    expect(second.message.requestId).toBe(first.message.requestId);
    expect(screen.getByLabelText('Body')).toHaveValue('');
  });

  it('limits directed acknowledgements to the recipient and locks parent context when replying', async () => {
    const user = userEvent.setup();
    const state = createSeed();
    const api = localApi(state);
    render(<CoordinationWorkspace initial={snapshot(state, true)} view="board" />);
    const title = state.messages[1].title;
    const message = screen.getByRole('article', { name: `Message ${title}` });
    const actor = within(message).getByRole('combobox', { name: `Acknowledge ${title} as` });
    expect(within(actor).getAllByRole('option')).toHaveLength(1);
    expect(actor).toHaveValue('agent.identity');
    await user.click(within(message).getByRole('button', { name: 'Acknowledge' }));
    expect(await within(message).findByText('Acknowledgement receipts:')).toBeInTheDocument();
    expect(api.commands[0]).toEqual({ operation: 'acknowledge', messageId: 'MSG-00002', participantId: 'agent.identity' });
    await user.click(within(message).getByRole('button', { name: 'Reply' }));
    expect(screen.getByLabelText('Release context')).toBeDisabled();
    expect(screen.getByLabelText('Release context')).toHaveValue('REL-CAR-2026.09.01');
    expect(screen.getByLabelText('Topic')).toBeDisabled();
    await user.type(screen.getByLabelText('Body'), 'The identity is still unresolved.');
    await user.click(screen.getByRole('button', { name: 'Post message' }));
    expect(await screen.findByRole('article', { name: `Message Re: ${title}` })).toBeInTheDocument();
    expect(api.commands[1]).toMatchObject({ operation: 'post', message: { replyTo: 'MSG-00002', topic: state.messages[1].topic, context: state.messages[1].context } });
  });

  it('registers a local definition with contracts and its bound scope', async () => {
    const user = userEvent.setup();
    const state = createSeed();
    const api = localApi(state);
    render(<CoordinationWorkspace initial={snapshot(state, true)} view="stable" />);
    const form = screen.getByRole('form', { name: 'Register participant' });
    await user.type(within(form).getByLabelText('Participant ID'), 'agent.condition-review');
    await user.type(within(form).getByLabelText('Name'), 'Condition review agent');
    await user.type(within(form).getByLabelText('Purpose'), 'Review physical condition changes.');
    await user.type(within(form).getByLabelText('Input contracts · comma separated'), 'CorpusRelease/v1, Retraction/v1');
    await user.click(within(form).getByRole('button', { name: 'Register definition' }));
    expect(await screen.findByRole('article', { name: 'Participant Condition review agent' })).toHaveTextContent('LOCAL');
    expect(api.commands[0]).toMatchObject({ operation: 'register', participant: { scope: DEMO_SCOPE, version: '0.1.0', status: 'LOCAL', inputs: ['CorpusRelease/v1', 'Retraction/v1'], domains: ['CARAVAN'] } });
  });
});
