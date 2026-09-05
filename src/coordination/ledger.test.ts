import { describe, expect, it } from 'vitest';
import { applyCommand, connectionsFor, CoordinationError, scopeState } from './ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from './seed';
import type { CoordinationState, MessageDraft, Participant, ReleaseContext } from './types';

const SCOPE = 'tenant:alpha';
const OTHER_SCOPE = 'principal:research';
const AT = '2026-09-05T13:00:00.000Z';
const LATER = '2026-09-05T13:01:00.000Z';
const CONTEXT: ReleaseContext = {
  domain: 'CARAVAN', releaseId: 'release:one', buildId: 'build:one', knownAt: '2026-09-01T00:00:00.000Z',
};
const OTHER_CONTEXT: ReleaseContext = {
  domain: 'CARAVAN', releaseId: 'release:two', buildId: 'build:two', knownAt: '2026-09-02T00:00:00.000Z',
};
const ALLOWED = [CONTEXT, OTHER_CONTEXT];

function definition(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'agent.author', name: 'Author', kind: 'AGENT', version: '0.1.0',
    purpose: 'Propose a bounded result.', authority: 'derived', runtime: 'JavaScript',
    status: 'LOCAL', scope: SCOPE, domains: ['CARAVAN'], inputs: [], outputs: [],
    capabilities: ['result.propose'], reference: 'local:test-contract', ...overrides,
  };
}

function initialState(): CoordinationState {
  return {
    schema: 'payload.coordination.v1',
    participants: [
      definition(),
      definition({ id: 'agent.recipient', name: 'Recipient' }),
      definition({ id: 'agent.observer', name: 'Observer' }),
      definition({ id: 'agent.land', name: 'Land', domains: ['LANDSHARK'] }),
      definition({ id: 'agent.foreign', name: 'Foreign', scope: OTHER_SCOPE }),
    ],
    messages: [], acknowledgements: [],
  };
}

function draft(overrides: Partial<MessageDraft> = {}): MessageDraft {
  return {
    requestId: 'request:one', authorId: 'agent.author', recipientId: 'agent.recipient',
    kind: 'REQUEST', topic: 'caravan-build', title: 'Inspect the current build',
    body: 'Report the unresolved identity with its evidence reference.',
    context: CONTEXT, replyTo: null, ...overrides,
  };
}

function post(state: CoordinationState, message = draft(), scope = SCOPE, at = AT) {
  return applyCommand(state, scope, { operation: 'post', message }, ALLOWED, at);
}

function expectRefusal(run: () => unknown, code: string, status = 400) {
  let failure: unknown;
  try { run(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(CoordinationError);
  expect(failure).toMatchObject({ code, status });
}

describe('stable registration', () => {
  it('appends commands without mutating the seed or any previous state', () => {
    const seed = createSeed();
    const before = structuredClone(seed);
    const registered = applyCommand(seed, DEMO_SCOPE, {
      operation: 'register', participant: definition({ id: 'agent.local', scope: DEMO_SCOPE }),
    }, RELEASE_CONTEXTS, AT);
    expect(seed).toEqual(before);
    expect(registered.participants).toHaveLength(seed.participants.length + 1);

    const registeredBefore = structuredClone(registered);
    const posted = applyCommand(registered, DEMO_SCOPE, {
      operation: 'post', message: draft({ authorId: 'agent.local', recipientId: 'apparatus.coordination', context: RELEASE_CONTEXTS[0] }),
    }, RELEASE_CONTEXTS, AT);
    expect(registered).toEqual(registeredBefore);
    const message = posted.messages.at(-1)!;
    const postedBefore = structuredClone(posted);
    const acknowledged = applyCommand(posted, DEMO_SCOPE, {
      operation: 'acknowledge', messageId: message.id, participantId: 'apparatus.coordination',
    }, RELEASE_CONTEXTS, LATER);
    expect(posted).toEqual(postedBefore);
    expect(acknowledged.acknowledgements).toHaveLength(1);

    acknowledged.participants[0].domains.push('CARAVAN');
    acknowledged.messages[0].body = 'Changed only in the returned copy.';
    expect(seed).toEqual(before);
    expect(posted).toEqual(postedBefore);
  });

  it('accepts an identical registration retry and rejects a changed manifest for the same id', () => {
    const state = initialState();
    const participant = definition({ id: 'agent.new' });
    const registered = applyCommand(state, SCOPE, { operation: 'register', participant }, ALLOWED, AT);
    expect(applyCommand(registered, SCOPE, { operation: 'register', participant }, ALLOWED, LATER)).toEqual(registered);
    expectRefusal(() => applyCommand(registered, SCOPE, {
      operation: 'register', participant: { ...participant, outputs: ['ChangedResult/v1'] },
    }, ALLOWED, LATER), 'REGISTRATION_CONFLICT', 409);
  });

  it('reuses the exact local seed definition independently of JSON object property order', () => {
    const seed = createSeed();
    const local = seed.participants.find((p) => p.id === 'apparatus.coordination')!;
    expect(local.status).toBe('LOCAL');
    const reversed = Object.fromEntries(Object.entries(local).reverse()) as unknown as Participant;
    expect(Object.keys(reversed)).not.toEqual(Object.keys(local));
    for (const participant of [local, reversed]) {
      expect(applyCommand(seed, DEMO_SCOPE, { operation: 'register', participant }, RELEASE_CONTEXTS, LATER)).toEqual(seed);
    }
  });

  it('refuses a registration that selects another information perimeter', () => {
    const state = initialState();
    const before = structuredClone(state);
    expectRefusal(() => applyCommand(state, SCOPE, {
      operation: 'register', participant: definition({ id: 'agent.new', scope: OTHER_SCOPE }),
    }, ALLOWED, AT), 'SCOPE_MISMATCH', 403);
    expect(state).toEqual(before);
  });
});

describe('message identity and information boundaries', () => {
  it('makes a retry idempotent but refuses a changed payload under the same author and request id', () => {
    const posted = post(initialState());
    expect(post(posted, draft(), SCOPE, LATER)).toEqual(posted);
    expectRefusal(() => post(posted, draft({ body: 'Different evidence request.' })), 'IDEMPOTENCY_CONFLICT', 409);
    expect(posted.messages).toHaveLength(1);
    expect(posted.messages[0].createdAt).toBe(AT);
  });

  it('allows different authors to use the same request id without merging their messages', () => {
    const posted = post(initialState());
    const next = post(posted, draft({ authorId: 'agent.observer' }));
    expect(next.messages.map((message) => message.id)).toEqual(['MSG-00001', 'MSG-00002']);
  });

  it.each([
    { authorId: 'agent.missing' }, { recipientId: 'agent.missing' },
    { authorId: 'agent.foreign' }, { recipientId: 'agent.foreign' },
  ])('refuses an unknown or out-of-scope participant: %j', (overrides) => {
    expectRefusal(() => post(initialState(), draft(overrides)), 'UNKNOWN_PARTICIPANT', 404);
  });

  it.each([
    { releaseId: 'release:missing' },
    { buildId: OTHER_CONTEXT.buildId },
    { knownAt: OTHER_CONTEXT.knownAt },
    { domain: 'LANDSHARK' as const },
  ])('requires one exact release, build, domain and knowledge-cutoff binding: %j', (overrides) => {
    expectRefusal(() => post(initialState(), draft({ context: { ...CONTEXT, ...overrides } })), 'INVALID_RELEASE_CONTEXT');
  });

  it.each([{ authorId: 'agent.land' }, { recipientId: 'agent.land' }])('requires the release domain in both participant definitions: %j', (overrides) => {
    expectRefusal(() => post(initialState(), draft(overrides)), 'DOMAIN_MISMATCH', 403);
  });

  it('accepts a general coordination message without a release context', () => {
    const posted = post(initialState(), draft({ context: null, recipientId: 'agent.land', topic: 'os-assembly' }));
    expect(posted.messages[0].context).toBeNull();
  });
});

describe('threads and handoffs', () => {
  it('keeps replies on the exact parent topic and release context', () => {
    const posted = post(initialState());
    const reply = draft({ requestId: 'request:reply', authorId: 'agent.recipient', recipientId: 'agent.author', kind: 'RESULT', replyTo: posted.messages[0].id });
    const replied = post(posted, reply);
    expect(replied.messages[1].replyTo).toBe(posted.messages[0].id);
    expectRefusal(() => post(posted, { ...reply, context: OTHER_CONTEXT }), 'THREAD_CONTEXT_MISMATCH');
    expectRefusal(() => post(posted, { ...reply, context: null }), 'THREAD_CONTEXT_MISMATCH');
    expectRefusal(() => post(posted, { ...reply, topic: 'different-topic' }), 'THREAD_TOPIC_MISMATCH');
  });

  it('refuses unknown parents and parents that only exist in another perimeter', () => {
    const state = post(initialState(), draft({ authorId: 'agent.foreign', recipientId: null }), OTHER_SCOPE);
    expectRefusal(() => post(state, draft({ replyTo: 'MSG-00001' })), 'UNKNOWN_MESSAGE', 404);
    expectRefusal(() => post(state, draft({ replyTo: 'MSG-missing' })), 'UNKNOWN_MESSAGE', 404);
  });

  it.each([null, 'agent.author'])('requires a different registered handoff recipient: %s', (recipientId) => {
    expectRefusal(() => post(initialState(), draft({ kind: 'HANDOFF', recipientId })), 'INVALID_HANDOFF');
  });

  it('records a directed handoff separately from acknowledgement', () => {
    const posted = post(initialState(), draft({ kind: 'HANDOFF' }));
    expect(posted.messages[0]).toMatchObject({ kind: 'HANDOFF', recipientId: 'agent.recipient', context: CONTEXT });
    expect(posted.acknowledgements).toEqual([]);
  });
});

describe('acknowledgements', () => {
  it('allows only the directed recipient and preserves the original acknowledgement on retry', () => {
    const posted = post(initialState(), draft({ kind: 'HANDOFF' }));
    const messageId = posted.messages[0].id;
    for (const participantId of ['agent.author', 'agent.observer']) {
      expectRefusal(() => applyCommand(posted, SCOPE, { operation: 'acknowledge', messageId, participantId }, ALLOWED, AT), 'INVALID_ACKNOWLEDGEMENT', 403);
    }
    const command = { operation: 'acknowledge', messageId, participantId: 'agent.recipient' };
    const acknowledged = applyCommand(posted, SCOPE, command, ALLOWED, AT);
    expect(acknowledged.acknowledgements).toEqual([{ messageId, participantId: 'agent.recipient', scope: SCOPE, createdAt: AT }]);
    expect(applyCommand(acknowledged, SCOPE, command, ALLOWED, LATER)).toEqual(acknowledged);
  });

  it('allows another participant to acknowledge a broadcast only within its release domain', () => {
    const posted = post(initialState(), draft({ recipientId: null }));
    const messageId = posted.messages[0].id;
    const command = { operation: 'acknowledge', messageId, participantId: 'agent.observer' };
    expect(applyCommand(posted, SCOPE, command, ALLOWED, AT).acknowledgements).toHaveLength(1);
    expectRefusal(() => applyCommand(posted, SCOPE, { ...command, participantId: 'agent.author' }, ALLOWED, AT), 'INVALID_ACKNOWLEDGEMENT', 403);
    expectRefusal(() => applyCommand(posted, SCOPE, { ...command, participantId: 'agent.land' }, ALLOWED, AT), 'DOMAIN_MISMATCH', 403);
  });

  it('refuses actors and messages outside the server-bound perimeter', () => {
    const posted = post(initialState());
    const command = { operation: 'acknowledge', messageId: posted.messages[0].id, participantId: 'agent.foreign' };
    expectRefusal(() => applyCommand(posted, SCOPE, command, ALLOWED, AT), 'UNKNOWN_PARTICIPANT', 404);
    expectRefusal(() => applyCommand(posted, OTHER_SCOPE, command, ALLOWED, AT), 'UNKNOWN_MESSAGE', 404);
    expectRefusal(() => applyCommand(posted, SCOPE, { ...command, messageId: 'MSG-missing', participantId: 'agent.recipient' }, ALLOWED, AT), 'UNKNOWN_MESSAGE', 404);
  });
});

describe('scoped views and declared synastry', () => {
  it('returns detached reads containing only the chosen perimeter, including acknowledgements', () => {
    let state = post(initialState());
    state = applyCommand(state, SCOPE, { operation: 'acknowledge', messageId: 'MSG-00001', participantId: 'agent.recipient' }, ALLOWED, AT);
    state = post(state, draft({ authorId: 'agent.foreign', recipientId: null }), OTHER_SCOPE);
    const before = structuredClone(state);
    const scoped = scopeState(state, SCOPE);
    expect(scoped.participants.map((p) => p.id)).not.toContain('agent.foreign');
    expect(scoped.messages).toHaveLength(1);
    expect(scoped.messages[0].authorId).toBe('agent.author');
    expect(scoped.acknowledgements).toHaveLength(1);
    expect(scopeState(state, OTHER_SCOPE).acknowledgements).toEqual([]);
    expect(scopeState(state, 'tenant:unknown')).toEqual({ schema: 'payload.coordination.v1', participants: [], messages: [], acknowledgements: [] });
    scoped.messages[0].body = 'Only this detached read changes.';
    scoped.participants[0].domains.length = 0;
    expect(state).toEqual(before);
  });

  it('distinguishes complete and partial input compatibility using exact versions and common domains', () => {
    const state: CoordinationState = {
      schema: 'payload.coordination.v1', messages: [], acknowledgements: [],
      participants: [
        definition({ id: 'source', outputs: ['Evidence/v1', 'Mapping/v1'], domains: ['CARAVAN', 'TRADEWIND'] }),
        definition({ id: 'complete', inputs: ['Evidence/v1'], domains: ['CARAVAN', 'LANDSHARK'] }),
        definition({ id: 'partial', inputs: ['Evidence/v1', 'Policy/v1'] }),
        definition({ id: 'version-mismatch', inputs: ['Evidence/v2'] }),
        definition({ id: 'domain-mismatch', inputs: ['Evidence/v1'], domains: ['LANDSHARK'] }),
        definition({ id: 'foreign-target', inputs: ['Evidence/v1'], scope: OTHER_SCOPE }),
        definition({ id: 'foreign-source', outputs: ['Evidence/v1'], scope: OTHER_SCOPE }),
      ],
    };
    expect(connectionsFor(state, SCOPE)).toEqual([
      { sourceId: 'source', targetId: 'complete', contracts: ['Evidence/v1'], missingInputs: [], domains: ['CARAVAN'], status: 'MATCH' },
      { sourceId: 'source', targetId: 'partial', contracts: ['Evidence/v1'], missingInputs: ['Policy/v1'], domains: ['CARAVAN'], status: 'PARTIAL' },
    ]);
    expect(connectionsFor(state, OTHER_SCOPE)).toEqual([
      { sourceId: 'foreign-source', targetId: 'foreign-target', contracts: ['Evidence/v1'], missingInputs: [], domains: ['CARAVAN'], status: 'MATCH' },
    ]);
    expect(connectionsFor(state, 'tenant:unknown')).toEqual([]);
  });
});
