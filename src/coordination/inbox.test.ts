import { describe, expect, it } from 'vitest';
import { inboxFor, parseInboxQuery } from './inbox';
import { CoordinationError } from './ledger';
import { createSeed, RELEASE_CONTEXTS } from './seed';
import type { Acknowledgement, BoardMessage, CoordinationState, InboxQuery } from './types';

const SCOPE = 'tenant:alpha';
const FOREIGN = 'tenant:beta';
const ACTOR = 'agent.inbox';
const AT = '2026-09-05T13:00:00.000Z';
const CONTEXT = RELEASE_CONTEXTS[0];

function state(messages: BoardMessage[] = [], acknowledgements: Acknowledgement[] = []): CoordinationState {
  const template = createSeed().participants.find((p) => p.id === 'apparatus.coordination')!;
  return {
    schema: 'payload.coordination.v1',
    participants: [
      { ...template, id: ACTOR, scope: SCOPE, domains: ['CARAVAN'] },
      { ...template, id: 'agent.author', scope: SCOPE },
      { ...template, id: 'agent.other', scope: SCOPE },
      { ...template, id: ACTOR, scope: FOREIGN, domains: ['LANDSHARK'] },
    ],
    messages, acknowledgements,
  };
}

function message(sequence: number, overrides: Partial<BoardMessage> = {}): BoardMessage {
  return {
    id: `MSG-${sequence}`, sequence, requestId: `request-${sequence}`, scope: SCOPE,
    authorId: 'agent.author', recipientId: ACTOR, kind: 'REQUEST', topic: 'review',
    title: 'Review declared contracts', body: 'Inspect the declared inputs and outputs.',
    context: CONTEXT, replyTo: null, createdAt: AT, ...overrides,
  };
}

function receipt(messageId: string, overrides: Partial<Acknowledgement> = {}): Acknowledgement {
  return { messageId, participantId: ACTOR, scope: SCOPE, createdAt: AT, ...overrides };
}

function query(overrides: Partial<InboxQuery> = {}): InboxQuery {
  return { ...parseInboxQuery(new URLSearchParams({ participant: ACTOR })), ...overrides };
}

function expectRefusal(run: () => unknown, code = 'INVALID_INBOX_QUERY', status = 400) {
  let failure: unknown;
  try { run(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(CoordinationError);
  expect(failure).toMatchObject({ code, status });
}

describe('participant inbox', () => {
  it('defaults to pending direct messages, excluding self, outbound and broadcasts', () => {
    const board = state([
      message(1), message(2, { authorId: ACTOR }), message(3),
      message(4, { authorId: ACTOR, recipientId: 'agent.other' }),
      message(5, { recipientId: null }), message(6, { kind: 'RESULT' }),
      message(7, { recipientId: 'agent.other' }),
    ], [receipt('MSG-3')]);
    const page = inboxFor(board, SCOPE, query());
    expect(page.messages.map((m) => m.sequence)).toEqual([1, 6]);
    expect(page).toMatchObject({ participantId: ACTOR, afterSequence: 0, nextSequence: 7, highWaterSequence: 7, hasMore: false });
    expect(page.acknowledgements).toEqual([]);
  });

  it('requires broadcast opt-in and tracks broadcast receipt separately for each participant', () => {
    const board = state([
      message(1, { recipientId: null }), message(2, { recipientId: null }),
      message(3, { recipientId: null, authorId: ACTOR }),
    ], [receipt('MSG-1', { participantId: 'agent.other' }), receipt('MSG-2')]);
    expect(inboxFor(board, SCOPE, query()).messages).toEqual([]);
    expect(inboxFor(board, SCOPE, query({ includeBroadcasts: true })).messages.map((m) => m.id)).toEqual(['MSG-1']);
    const included = inboxFor(board, SCOPE, query({ includeBroadcasts: true, includeAcknowledged: true }));
    expect(included.messages.map((m) => m.id)).toEqual(['MSG-1', 'MSG-2']);
    expect(included.acknowledgements).toEqual([receipt('MSG-2')]);
  });

  it('limits release messages to the participant domain while accepting general OS messages', () => {
    const land = { ...CONTEXT, domain: 'LANDSHARK' as const };
    const board = state([
      message(1), message(2, { context: land }),
      message(3, { recipientId: null, context: land }),
      message(4, { recipientId: null, context: null }), message(5, { context: null }),
    ]);
    expect(inboxFor(board, SCOPE, query({ includeBroadcasts: true })).messages.map((m) => m.sequence)).toEqual([1, 4, 5]);
  });

  it('keeps messages, receipts and high-water marks in the selected scope despite colliding identities', () => {
    const board = state([
      message(1), message(2, { kind: 'HANDOFF' }),
      message(900, { scope: FOREIGN, id: 'MSG-1' }),
    ], [receipt('MSG-1', { scope: FOREIGN }), receipt('MSG-2'), receipt('MSG-900', { scope: FOREIGN })]);
    const page = inboxFor(board, SCOPE, query());
    expect(page.messages.map((m) => m.id)).toEqual(['MSG-1']);
    expect(page).toMatchObject({ highWaterSequence: 2, nextSequence: 2 });
    expect(page.acknowledgements).toEqual([]);
    expectRefusal(() => inboxFor(board, SCOPE, query({ afterSequence: 3 })), 'CURSOR_AHEAD', 409);
  });

  it('filters a message kind without returning other kinds or their receipts', () => {
    const board = state([message(1), message(2, { kind: 'HANDOFF' }), message(3, { kind: 'RESULT' })], [receipt('MSG-1'), receipt('MSG-2')]);
    const page = inboxFor(board, SCOPE, query({ kind: 'HANDOFF', includeAcknowledged: true }));
    expect(page.messages.map((m) => m.id)).toEqual(['MSG-2']);
    expect(page.acknowledgements).toEqual([receipt('MSG-2')]);
  });

  it('pages in sequence order across gaps and advances past trailing ineligible messages only on the final page', () => {
    const board = state([
      message(9), message(3), message(10, { recipientId: 'agent.other' }),
      message(6), message(4, { recipientId: null }),
    ]);
    const first = inboxFor(board, SCOPE, query({ limit: 2 }));
    expect(first.messages.map((m) => m.sequence)).toEqual([3, 6]);
    expect(first).toMatchObject({ nextSequence: 6, highWaterSequence: 10, hasMore: true });
    const second = inboxFor(board, SCOPE, query({ afterSequence: first.nextSequence, limit: 2 }));
    expect(second.messages.map((m) => m.sequence)).toEqual([9]);
    expect(second).toMatchObject({ nextSequence: 10, highWaterSequence: 10, hasMore: false });
    expect(inboxFor(board, SCOPE, query({ afterSequence: second.nextSequence })).messages).toEqual([]);

    board.messages.push(message(11, { recipientId: 'agent.other' }), message(12));
    const later = inboxFor(board, SCOPE, query({ afterSequence: second.nextSequence }));
    expect(later.messages.map((m) => m.sequence)).toEqual([12]);
    expect(later.nextSequence).toBe(12);
  });

  it('returns the scope high-water mark when filters yield no messages and zero for an empty scope', () => {
    const board = state([message(8, { recipientId: 'agent.other' }), message(700, { scope: FOREIGN })]);
    expect(inboxFor(board, SCOPE, query())).toMatchObject({ messages: [], nextSequence: 8, highWaterSequence: 8, hasMore: false });
    const empty = state([message(700, { scope: FOREIGN })]);
    expect(inboxFor(empty, SCOPE, query())).toMatchObject({ messages: [], nextSequence: 0, highWaterSequence: 0, hasMore: false });
    expectRefusal(() => inboxFor(empty, SCOPE, query({ afterSequence: 1 })), 'CURSOR_AHEAD', 409);
  });

  it('requires the participant to be registered in the selected scope', () => {
    const board = state();
    expectRefusal(() => inboxFor(board, SCOPE, query({ participantId: 'agent.missing' })), 'UNKNOWN_PARTICIPANT', 404);
    expectRefusal(() => inboxFor(board, FOREIGN, query({ participantId: 'agent.other' })), 'UNKNOWN_PARTICIPANT', 404);
  });

  it('returns detached message contexts and receipt records', () => {
    const board = state([message(1)], [receipt('MSG-1')]);
    const before = structuredClone(board);
    const page = inboxFor(board, SCOPE, query({ includeAcknowledged: true }));
    page.messages[0].body = 'Changed only in this response.';
    page.messages[0].context!.releaseId = 'changed';
    page.acknowledgements[0].createdAt = 'changed';
    expect(board).toEqual(before);
  });

  it.each([
    { afterSequence: -1 }, { afterSequence: 0.5 }, { afterSequence: Number.MAX_SAFE_INTEGER + 1 },
    { afterSequence: Number.NaN }, { afterSequence: Infinity },
    { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: Infinity },
    { includeAcknowledged: 'true' }, { includeBroadcasts: 1 }, { kind: 'TASK' },
  ])('rejects invalid programmatic filters: %j', (invalid) => {
    expectRefusal(() => inboxFor(state(), SCOPE, { ...query(), ...invalid } as InboxQuery));
  });
});

describe('inbox query parsing', () => {
  it('provides direct pending defaults and parses explicit filters', () => {
    expect(parseInboxQuery(new URLSearchParams({ participant: ACTOR }))).toEqual({
      participantId: ACTOR, afterSequence: 0, limit: 50, includeAcknowledged: false, includeBroadcasts: false, kind: null,
    });
    expect(parseInboxQuery(new URLSearchParams({ participant: ACTOR, after: '12', limit: '100', acknowledged: 'true', broadcasts: 'false', kind: 'HANDOFF' }))).toEqual({
      participantId: ACTOR, afterSequence: 12, limit: 100, includeAcknowledged: true, includeBroadcasts: false, kind: 'HANDOFF',
    });
  });

  it.each([
    '', 'participant=', `participant=${'a'.repeat(181)}`,
    `participant=${ACTOR}&scope=tenant:beta`, `participant=${ACTOR}&participant=${ACTOR}`,
    `participant=${ACTOR}&after=0&after=0`, `participant=${ACTOR}&broadcasts=true&broadcasts=false`,
    `participant=${ACTOR}&after=1.5`, `participant=${ACTOR}&after=-1`,
    `participant=${ACTOR}&after=1e2`, `participant=${ACTOR}&after=01`,
    `participant=${ACTOR}&after=9007199254740992`, `participant=${ACTOR}&after=`,
    `participant=${ACTOR}&limit=2.5`, `participant=${ACTOR}&limit=+2`,
    `participant=${ACTOR}&acknowledged=1`, `participant=${ACTOR}&broadcasts=True`,
    `participant=${ACTOR}&kind=request`, `participant=${ACTOR}&kind=`,
  ])('rejects malformed or ambiguous query: %s', (search) => {
    expectRefusal(() => parseInboxQuery(new URLSearchParams(search)));
  });

  it.each(['0', '101'])('refuses out-of-range page size %s at the inbox boundary', (limit) => {
    expectRefusal(() => inboxFor(state(), SCOPE, parseInboxQuery(new URLSearchParams({ participant: ACTOR, limit }))));
  });
});
