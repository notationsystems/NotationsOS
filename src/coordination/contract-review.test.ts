import { describe, expect, it } from 'vitest';
import { CONTRACT_REVIEWER_ID, CONTRACT_REVIEW_TOPIC, contractReviewerDefinition, runContractReviewOnce, type WorkerClient } from './contract-review';
import { inboxFor } from './inbox';
import { applyCommand, connectionsFor, scopeState } from './ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from './seed';
import type { CoordinationCommand, CoordinationInbox, CoordinationSnapshot, InboxQuery, MessageDraft, Participant } from './types';

const AT = '2026-09-05T14:00:00.000Z';

/** In-memory transport; all state transitions use the same ledger and inbox as HTTP. */
class LocalClient implements WorkerClient {
  state = createSeed();
  canWrite = true;
  mode: CoordinationSnapshot['mode'] = 'LOCAL_SANDBOX';
  effects: CoordinationCommand[] = [];
  scans: InboxQuery[] = [];
  failResult = false;
  failReceipt = false;

  command(command: CoordinationCommand) {
    this.state = applyCommand(this.state, DEMO_SCOPE, command, RELEASE_CONTEXTS, AT);
  }

  async snapshot(): Promise<CoordinationSnapshot> {
    return {
      ...scopeState(this.state, DEMO_SCOPE), fixture_only: true, scope: DEMO_SCOPE,
      mode: this.mode, persistence: this.mode === 'LOCAL_SANDBOX' ? 'LOCAL_FILE' : 'NONE', canWrite: this.canWrite,
      connections: connectionsFor(this.state, DEMO_SCOPE), releaseContexts: structuredClone(RELEASE_CONTEXTS),
    };
  }

  async register(participant: Participant) {
    const command: CoordinationCommand = { operation: 'register', participant };
    this.effects.push(command);
    this.command(command);
    return this.snapshot();
  }

  async inbox(participantId: string, options: Partial<Omit<InboxQuery, 'participantId'>>): Promise<CoordinationInbox> {
    const query: InboxQuery = { participantId, afterSequence: 0, limit: 50, includeAcknowledged: false, includeBroadcasts: false, kind: null, ...options };
    this.scans.push(query);
    return {
      ...inboxFor(this.state, DEMO_SCOPE, query), schema: 'payload.coordination-inbox.v1',
      fixture_only: true, scope: DEMO_SCOPE, mode: this.mode, canWrite: this.canWrite,
    };
  }

  async post(message: MessageDraft) {
    if (this.failResult) throw new Error('Result transport failed.');
    const command: CoordinationCommand = { operation: 'post', message };
    this.effects.push(command);
    this.command(command);
    return this.snapshot();
  }

  async acknowledge(messageId: string, participantId: string) {
    if (this.failReceipt) throw new Error('Receipt transport failed.');
    const command: CoordinationCommand = { operation: 'acknowledge', messageId, participantId };
    this.effects.push(command);
    this.command(command);
    return this.snapshot();
  }

  queue(overrides: Partial<MessageDraft> = {}) {
    this.command({ operation: 'register', participant: contractReviewerDefinition(DEMO_SCOPE) });
    this.command({ operation: 'post', message: {
      requestId: `request-${this.state.messages.length + 1}`, authorId: 'apparatus.coordination', recipientId: CONTRACT_REVIEWER_ID,
      kind: 'REQUEST', topic: CONTRACT_REVIEW_TOPIC, title: 'Review the source agent',
      body: JSON.stringify({ participantId: 'agent.source' }), context: RELEASE_CONTEXTS[0], replyTo: null, ...overrides,
    } });
    return this.state.messages.at(-1)!;
  }

  define(id: string, overrides: Partial<Participant> = {}) {
    this.command({ operation: 'register', participant: {
      ...contractReviewerDefinition(DEMO_SCOPE), id, inputs: [], outputs: [], ...overrides,
    } });
  }

  results() { return this.state.messages.filter((m) => m.authorId === CONTRACT_REVIEWER_ID && m.kind === 'RESULT'); }
}

describe('local contract review worker', () => {
  it('registers through the shared client without changing the seed or manufacturing work', async () => {
    const client = new LocalClient();
    const before = structuredClone(client.state);
    expect(await runContractReviewOnce(client)).toEqual({ processed: 0, recovered: 0, skipped: 0, scanComplete: true });
    expect(client.effects).toEqual([{ operation: 'register', participant: contractReviewerDefinition(DEMO_SCOPE) }]);
    expect(client.state.participants).toHaveLength(before.participants.length + 1);
    expect(client.state.messages).toEqual(before.messages);
    expect(createSeed()).toEqual(before);
  });

  it.each(['REQUEST', 'HANDOFF'] as const)('handles a directed %s and records RESULT before ACK with the original context', async (kind) => {
    const client = new LocalClient();
    const request = client.queue({ kind });
    expect(await runContractReviewOnce(client)).toEqual({ processed: 1, recovered: 0, skipped: 0, scanComplete: true });
    expect(client.effects.map((command) => command.operation)).toEqual(['register', 'post', 'acknowledge']);
    expect(client.results()).toHaveLength(1);
    expect(client.results()[0]).toMatchObject({
      requestId: `${CONTRACT_REVIEWER_ID}:${request.id}`, authorId: CONTRACT_REVIEWER_ID,
      recipientId: request.authorId, kind: 'RESULT', topic: request.topic, context: request.context, replyTo: request.id,
    });
    expect(client.state.acknowledgements).toEqual([{ messageId: request.id, participantId: CONTRACT_REVIEWER_ID, scope: DEMO_SCOPE, createdAt: AT }]);
  });

  it('reports the union of declared suppliers and the inputs still missing across that union', async () => {
    const client = new LocalClient();
    client.define('apparatus.target', { inputs: ['InputA/v1', 'InputB/v1', 'InputC/v1'] });
    client.define('apparatus.supplier-a', { outputs: ['InputA/v1'] });
    client.define('apparatus.supplier-b', { outputs: ['InputB/v1'] });
    client.queue({ body: JSON.stringify({ participantId: 'apparatus.target' }) });
    await runContractReviewOnce(client);
    expect(JSON.parse(client.results()[0].body)).toMatchObject({
      schema: 'payload.contract-review.v1', assessment: 'DECLARED_CONTRACTS_ONLY', subjectId: 'apparatus.target',
      subjectVersion: '0.1.0', inputCount: 3, matchedInputCount: 2, sourceCount: 2, missingInputs: ['InputC/v1'],
      incoming: [
        { sourceId: 'apparatus.supplier-a', contracts: ['InputA/v1'], domains: ['CARAVAN', 'TRADEWIND', 'LANDSHARK'] },
        { sourceId: 'apparatus.supplier-b', contracts: ['InputB/v1'], domains: ['CARAVAN', 'TRADEWIND', 'LANDSHARK'] },
      ], omittedConnections: 0, omittedMissingInputs: 0,
    });
  });

  it('does not append duplicate results or receipts on repeated runs', async () => {
    const client = new LocalClient();
    client.queue();
    await runContractReviewOnce(client);
    const completed = structuredClone(client.state);
    client.effects = [];
    expect(await runContractReviewOnce(client)).toEqual({ processed: 0, recovered: 0, skipped: 0, scanComplete: true });
    expect(client.state).toEqual(completed);
    expect(client.effects.map((command) => command.operation)).toEqual(['register']);
  });

  it('leaves input pending when posting its result fails and can retry it', async () => {
    const client = new LocalClient();
    const request = client.queue();
    client.failResult = true;
    await expect(runContractReviewOnce(client)).rejects.toThrow('Result transport failed.');
    expect(client.results()).toEqual([]);
    expect(client.state.acknowledgements).toEqual([]);
    expect((await client.inbox(CONTRACT_REVIEWER_ID, {})).messages.map((m) => m.id)).toContain(request.id);
    client.failResult = false;
    expect(await runContractReviewOnce(client)).toMatchObject({ processed: 1, recovered: 0 });
    expect(client.results()).toHaveLength(1);
  });

  it('recovers a persisted result after failed ACK without recomputing against registry additions', async () => {
    const client = new LocalClient();
    const request = client.queue();
    client.failReceipt = true;
    await expect(runContractReviewOnce(client)).rejects.toThrow('Receipt transport failed.');
    const originalResult = structuredClone(client.results()[0]);
    expect(JSON.parse(originalResult.body).missingInputs).toEqual(['AuthorizedSource/v1']);
    expect(client.state.acknowledgements).toEqual([]);

    client.define('apparatus.authorized-source', { outputs: ['AuthorizedSource/v1'] });
    expect((await client.snapshot()).connections).toContainEqual(expect.objectContaining({ sourceId: 'apparatus.authorized-source', targetId: 'agent.source' }));
    client.failReceipt = false;
    client.effects = [];
    expect(await runContractReviewOnce(client)).toEqual({ processed: 0, recovered: 1, skipped: 0, scanComplete: true });
    expect(client.results()).toEqual([originalResult]);
    expect(client.effects.map((command) => command.operation)).toEqual(['register', 'acknowledge']);
    expect(client.state.acknowledgements).toEqual([expect.objectContaining({ messageId: request.id, participantId: CONTRACT_REVIEWER_ID })]);
  });

  it.each(['not JSON', 'null', '[]', '{"participantId":"agent.source","extra":true}'])('records a typed invalid-request result and then acknowledges malformed body %s', async (body) => {
    const client = new LocalClient();
    const request = client.queue({ body });
    expect(await runContractReviewOnce(client)).toMatchObject({ processed: 1 });
    expect(JSON.parse(client.results()[0].body)).toMatchObject({ schema: 'payload.contract-review.v1', error: 'INVALID_REVIEW_REQUEST' });
    expect(client.state.acknowledgements).toEqual([expect.objectContaining({ messageId: request.id })]);
    expect(client.effects.map((command) => command.operation)).toEqual(['register', 'post', 'acknowledge']);
  });

  it('reports an unknown review subject as a typed result', async () => {
    const client = new LocalClient();
    client.queue({ body: JSON.stringify({ participantId: 'agent.missing' }) });
    await runContractReviewOnce(client);
    expect(JSON.parse(client.results()[0].body)).toMatchObject({ schema: 'payload.contract-review.v1', error: 'UNKNOWN_PARTICIPANT' });
  });

  it('leaves unrelated topics and kinds unacknowledged, and never consumes broadcasts or another recipient', async () => {
    const client = new LocalClient();
    client.queue({ topic: 'other-review' });
    for (const kind of ['NOTE', 'BLOCKER', 'RESULT'] as const) client.queue({ kind });
    client.queue({ recipientId: null });
    client.queue({ recipientId: 'agent.identity' });
    const work = client.queue();
    expect(await runContractReviewOnce(client)).toEqual({ processed: 1, recovered: 0, skipped: 4, scanComplete: true });
    expect(client.state.acknowledgements.map((receipt) => receipt.messageId)).toEqual([work.id]);
    expect(client.results()[0].replyTo).toBe(work.id);
  });

  it('respects the processing limit and keeps later requests pending for the next pass', async () => {
    const client = new LocalClient();
    const requests = [client.queue(), client.queue(), client.queue()];
    expect(await runContractReviewOnce(client, 2)).toEqual({ processed: 2, recovered: 0, skipped: 0, scanComplete: false });
    expect(client.results().map((result) => result.replyTo)).toEqual(requests.slice(0, 2).map((request) => request.id));
    expect((await client.inbox(CONTRACT_REVIEWER_ID, {})).messages.map((message) => message.id)).toEqual([requests[2].id]);
    expect(await runContractReviewOnce(client, 2)).toEqual({ processed: 1, recovered: 0, skipped: 0, scanComplete: true });
  });

  it('continues past a full page of ignored messages to reach later requests', async () => {
    const client = new LocalClient();
    for (let i = 0; i < 105; i++) client.queue({ topic: 'unrelated-topic' });
    const request = client.queue();
    expect(await runContractReviewOnce(client)).toEqual({ processed: 1, recovered: 0, skipped: 105, scanComplete: true });
    expect(client.scans.map((scan) => scan.afterSequence)).toEqual([0, 103]);
    expect(client.results()[0].replyTo).toBe(request.id);
    expect(client.state.acknowledgements.map((receipt) => receipt.messageId)).toEqual([request.id]);
  });

  it('bounds report detail while preserving exact missing-input counts', async () => {
    const client = new LocalClient();
    const inputs = Array.from({ length: 32 }, (_, index) => `Input-${index}-${'x'.repeat(140)}/v1`);
    client.define('apparatus.large-target', { inputs });
    client.queue({ body: JSON.stringify({ participantId: 'apparatus.large-target' }) });
    await runContractReviewOnce(client);
    const result = client.results()[0];
    const report = JSON.parse(result.body);
    expect(result.body.length).toBeLessThanOrEqual(3500);
    expect(report).toMatchObject({ inputCount: 32, matchedInputCount: 0, sourceCount: 0 });
    expect(report.omittedMissingInputs).toBeGreaterThan(0);
    expect(report.missingInputs.length + report.omittedMissingInputs).toBe(32);
  });

  it.each([
    { mode: 'FIXTURE' as const, canWrite: false },
    { mode: 'FIXTURE' as const, canWrite: true },
    { mode: 'LOCAL_SANDBOX' as const, canWrite: false },
  ])('refuses to register or execute outside a writable local sandbox: %j', async (flags) => {
    const client = Object.assign(new LocalClient(), flags);
    await expect(runContractReviewOnce(client)).rejects.toThrow('Start the local coordination sandbox');
    expect(client.effects).toEqual([]);
  });

  it.each([0, 101, 1.5, Number.NaN])('rejects invalid processing limit %s before contacting the board', async (limit) => {
    const client = new LocalClient();
    await expect(runContractReviewOnce(client, limit)).rejects.toThrow('Worker limit');
    expect(client.effects).toEqual([]);
    expect(client.scans).toEqual([]);
  });
});
