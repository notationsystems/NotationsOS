import { CoordinationError } from './ledger';
import { MESSAGE_KINDS, type CoordinationState, type InboxPage, type InboxQuery, type Scope } from './types';

/** Cursors describe a scan; acknowledgements are the durable processing checkpoint. */
export function inboxFor(state: CoordinationState, scope: Scope, query: InboxQuery): InboxPage {
  if (!Number.isSafeInteger(query.afterSequence) || query.afterSequence < 0 || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100 ||
      typeof query.includeAcknowledged !== 'boolean' || typeof query.includeBroadcasts !== 'boolean' || (query.kind !== null && !MESSAGE_KINDS.includes(query.kind))) {
    throw new CoordinationError('INVALID_INBOX_QUERY', 'Use a nonnegative after cursor, limit 1–100, boolean filters and a supported message kind.');
  }
  const actor = state.participants.find((p) => p.scope === scope && p.id === query.participantId);
  if (!actor) throw new CoordinationError('UNKNOWN_PARTICIPANT', 'Participant is not registered in this scope.', 404);
  const scoped = state.messages.filter((message) => message.scope === scope);
  const highWaterSequence = scoped.reduce((max, message) => Math.max(max, message.sequence), 0);
  if (query.afterSequence > highWaterSequence) throw new CoordinationError('CURSOR_AHEAD', 'The cursor is beyond this board history. Read again from zero.', 409);
  const receipts = state.acknowledgements.filter((a) => a.scope === scope && a.participantId === actor.id);
  const acknowledged = new Set(receipts.map((a) => a.messageId));
  const eligible = scoped.filter((message) =>
    message.sequence > query.afterSequence && message.authorId !== actor.id &&
    (message.recipientId === actor.id || (message.recipientId === null && query.includeBroadcasts)) &&
    (!message.context || actor.domains.includes(message.context.domain)) &&
    (query.includeAcknowledged || !acknowledged.has(message.id)) && (!query.kind || message.kind === query.kind)
  ).sort((a, b) => a.sequence - b.sequence);
  const messages = eligible.slice(0, query.limit);
  const hasMore = eligible.length > messages.length;
  const ids = new Set(messages.map((message) => message.id));
  return structuredClone({ participantId: actor.id, afterSequence: query.afterSequence,
    nextSequence: hasMore ? messages[messages.length - 1].sequence : highWaterSequence,
    highWaterSequence, hasMore, messages, acknowledgements: receipts.filter((receipt) => ids.has(receipt.messageId)),
  });
}

export function parseInboxQuery(params: URLSearchParams): InboxQuery {
  const allowed = ['participant', 'after', 'limit', 'acknowledged', 'broadcasts', 'kind'];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) {
    throw new CoordinationError('INVALID_INBOX_QUERY', 'Inbox query fields must be recognized and provided at most once.');
  }
  const participantId = params.get('participant');
  if (!participantId || participantId.length > 180) throw new CoordinationError('INVALID_INBOX_QUERY', 'A registered participant id is required.');
  const integer = (key: string, fallback: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new CoordinationError('INVALID_INBOX_QUERY', `${key} must be a nonnegative integer.`);
    return Number(value);
  };
  const flag = (key: string) => {
    const value = params.get(key);
    if (value !== null && value !== 'true' && value !== 'false') throw new CoordinationError('INVALID_INBOX_QUERY', `${key} must be true or false.`);
    return value === 'true';
  };
  const kind = params.get('kind');
  if (kind !== null && !MESSAGE_KINDS.includes(kind as InboxQuery['kind'] & string)) throw new CoordinationError('INVALID_INBOX_QUERY', 'Unknown message kind.');
  return { participantId, afterSequence: integer('after', 0), limit: integer('limit', 50), includeAcknowledged: flag('acknowledged'), includeBroadcasts: flag('broadcasts'), kind: kind as InboxQuery['kind'] };
}
