import { AUTHORITIES, DOMAINS, MESSAGE_KINDS, type CoordinationState, type Participant, type Scope, type ReleaseContext, type Connection, type MessageDraft } from './types';

export class CoordinationError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

function refuse(code: string, detail: string, status = 400): never { throw new CoordinationError(code, detail, status); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('INVALID_COMMAND', 'Expected an object.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(record, key))) {
    refuse('INVALID_FIELDS', `Expected exactly: ${keys.join(', ')}.`);
  }
  return record;
}
function text(value: unknown, name: string, max = 180): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) refuse('INVALID_FIELD', `${name} requires 1–${max} characters.`);
  return value.trim();
}
function identifier(value: unknown, name: string) {
  const id = text(value, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(id)) refuse('INVALID_FIELD', `${name} must be a stable identifier without spaces.`);
  return id;
}
function choice<T extends string>(value: unknown, choices: readonly T[], name: string): T {
  if (!choices.includes(value as T)) refuse('INVALID_FIELD', `${name} must be one of ${choices.join(', ')}.`);
  return value as T;
}
function texts(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > 32) refuse('INVALID_FIELD', `${name} requires at most 32 values.`);
  const values = value.map((item) => text(item, name));
  if (new Set(values).size !== values.length) refuse('INVALID_FIELD', `${name} must contain unique values.`);
  return values;
}
function participant(state: CoordinationState, scope: Scope, id: string) {
  const found = state.participants.find((item) => item.id === id && item.scope === scope);
  if (!found) refuse('UNKNOWN_PARTICIPANT', 'Participant is not registered in this scope.', 404);
  return found;
}
function parseContext(value: unknown, allowed: ReleaseContext[]): ReleaseContext | null {
  if (value === null) return null;
  const candidate = object(value, ['domain', 'releaseId', 'buildId', 'knownAt']);
  const found = allowed.find((item) => item.domain === candidate.domain && item.releaseId === candidate.releaseId && item.buildId === candidate.buildId && item.knownAt === candidate.knownAt);
  if (!found) refuse('INVALID_RELEASE_CONTEXT', 'Use an exact release, build, and knowledge cutoff from the available corpus releases.');
  return { ...found };
}

export function scopeState(state: CoordinationState, scope: Scope): CoordinationState {
  return structuredClone({ schema: state.schema, participants: state.participants.filter((p) => p.scope === scope), messages: state.messages.filter((m) => m.scope === scope), acknowledgements: state.acknowledgements.filter((a) => a.scope === scope) });
}

export function connectionsFor(state: CoordinationState, scope: Scope): Connection[] {
  const participants = state.participants.filter((p) => p.scope === scope);
  const connections: Connection[] = [];
  for (const source of participants) for (const target of participants) {
    if (source.id === target.id) continue;
    const domains = source.domains.filter((d) => target.domains.includes(d));
    const contracts = source.outputs.filter((output) => target.inputs.includes(output));
    if (!contracts.length || !domains.length) continue;
    const missingInputs = target.inputs.filter((input) => !source.outputs.includes(input));
    connections.push({ sourceId: source.id, targetId: target.id, contracts, missingInputs, domains, status: missingInputs.length ? 'PARTIAL' : 'MATCH' });
  }
  return connections;
}

function register(state: CoordinationState, scope: Scope, value: unknown) {
  const p = object(value, ['id', 'name', 'kind', 'version', 'purpose', 'authority', 'runtime', 'status', 'scope', 'domains', 'inputs', 'outputs', 'capabilities', 'reference']);
  if (p.scope !== scope) refuse('SCOPE_MISMATCH', 'Registration must use the server-bound coordination scope.', 403);
  const domains = texts(p.domains, 'domains').map((domain) => choice(domain, DOMAINS, 'domain'));
  if (!domains.length) refuse('INVALID_FIELD', 'Declare at least one domain.');
  const next: Participant = {
    id: identifier(p.id, 'id'), name: text(p.name, 'name'), kind: choice(p.kind, ['AGENT', 'APPARATUS'], 'kind'),
    version: text(p.version, 'version', 40), purpose: text(p.purpose, 'purpose', 1200), authority: choice(p.authority, AUTHORITIES, 'authority'),
    runtime: choice(p.runtime, ['Rust', 'C++', 'Python', 'JavaScript', 'Unassigned'], 'runtime'),
    status: choice(p.status, ['LOCAL'], 'status'), scope, domains, inputs: texts(p.inputs, 'inputs'), outputs: texts(p.outputs, 'outputs'), capabilities: texts(p.capabilities, 'capabilities'), reference: text(p.reference, 'reference', 500),
  };
  const existing = state.participants.find((item) => item.id === next.id && item.scope === scope);
  if (existing) {
    if ((Object.keys(next) as Array<keyof Participant>).every((key) => JSON.stringify(existing[key]) === JSON.stringify(next[key]))) return;
    refuse('REGISTRATION_CONFLICT', 'This participant id is already registered. Register a new version under a new id.', 409);
  }
  if (state.participants.filter((item) => item.scope === scope).length >= 200) refuse('CAPACITY', 'The local stable supports at most 200 definitions.', 409);
  state.participants.push(next);
}

function post(state: CoordinationState, scope: Scope, value: unknown, allowed: ReleaseContext[], at: string) {
  const m = object(value, ['requestId', 'authorId', 'recipientId', 'kind', 'topic', 'title', 'body', 'context', 'replyTo']);
  const next: MessageDraft = {
    requestId: identifier(m.requestId, 'requestId'), authorId: identifier(m.authorId, 'authorId'), recipientId: m.recipientId === null ? null : identifier(m.recipientId, 'recipientId'),
    kind: choice(m.kind, MESSAGE_KINDS, 'kind'), topic: text(m.topic, 'topic', 80), title: text(m.title, 'title', 180), body: text(m.body, 'body', 4000),
    context: parseContext(m.context, allowed), replyTo: m.replyTo === null ? null : identifier(m.replyTo, 'replyTo'),
  };
  const author = participant(state, scope, next.authorId);
  const recipient = next.recipientId ? participant(state, scope, next.recipientId) : null;
  if (next.kind === 'HANDOFF' && (!recipient || recipient.id === author.id)) refuse('INVALID_HANDOFF', 'A handoff needs a different registered recipient.');
  if (next.context && (!author.domains.includes(next.context.domain) || (recipient && !recipient.domains.includes(next.context.domain)))) {
    refuse('DOMAIN_MISMATCH', 'The sender and recipient must declare the release domain.', 403);
  }
  if (next.replyTo) {
    const parent = state.messages.find((item) => item.scope === scope && item.id === next.replyTo);
    if (!parent) refuse('UNKNOWN_MESSAGE', 'The parent message is not in this scope.', 404);
    if (JSON.stringify(parent.context) !== JSON.stringify(next.context)) refuse('THREAD_CONTEXT_MISMATCH', 'Replies must keep their parent release context. Start a new thread for a different release.');
    if (parent.topic !== next.topic) refuse('THREAD_TOPIC_MISMATCH', 'Replies must keep their parent topic.');
  }
  const messages = state.messages.filter((item) => item.scope === scope);
  const prior = messages.find((item) => item.authorId === next.authorId && item.requestId === next.requestId);
  if (prior) {
    const draft = Object.fromEntries(Object.keys(next).map((key) => [key, prior[key as keyof MessageDraft]]));
    if (JSON.stringify(draft) === JSON.stringify(next)) return;
    refuse('IDEMPOTENCY_CONFLICT', 'This author already used the request id for a different message.', 409);
  }
  if (messages.length >= 5000) refuse('CAPACITY', 'The local board supports at most 5000 messages.', 409);
  const sequence = messages.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
  state.messages.push({ ...next, id: `MSG-${String(sequence).padStart(5, '0')}`, sequence, scope, createdAt: at });
}

function acknowledge(state: CoordinationState, scope: Scope, messageId: unknown, participantId: unknown, at: string) {
  const id = identifier(messageId, 'messageId');
  const actor = participant(state, scope, identifier(participantId, 'participantId'));
  const message = state.messages.find((item) => item.scope === scope && item.id === id);
  if (!message) refuse('UNKNOWN_MESSAGE', 'The message is not in this scope.', 404);
  if (message.authorId === actor.id || (message.recipientId && message.recipientId !== actor.id)) refuse('INVALID_ACKNOWLEDGEMENT', 'Only the recipient may acknowledge a directed message; a broadcast requires another participant.', 403);
  if (message.context && !actor.domains.includes(message.context.domain)) refuse('DOMAIN_MISMATCH', 'The participant must declare the release domain.', 403);
  if (!state.acknowledgements.some((a) => a.scope === scope && a.messageId === id && a.participantId === actor.id)) {
    state.acknowledgements.push({ messageId: id, participantId: actor.id, scope, createdAt: at });
  }
}

/** Append-only commands. No scheduler, credentials, executable prompts, or corpus writes. */
export function applyCommand(state: CoordinationState, scope: Scope, command: unknown, allowed: ReleaseContext[], at = new Date().toISOString()): CoordinationState {
  if (!Number.isFinite(Date.parse(at))) refuse('INVALID_TIME', 'A valid server timestamp is required.');
  if (!command || typeof command !== 'object' || Array.isArray(command)) refuse('INVALID_COMMAND', 'Expected a coordination command.');
  const operation = (command as Record<string, unknown>).operation;
  const next = structuredClone(state);
  if (operation === 'register') {
    const c = object(command, ['operation', 'participant']); register(next, scope, c.participant);
  } else if (operation === 'post') {
    const c = object(command, ['operation', 'message']); post(next, scope, c.message, allowed, at);
  } else if (operation === 'acknowledge') {
    const c = object(command, ['operation', 'messageId', 'participantId']); acknowledge(next, scope, c.messageId, c.participantId, at);
  } else refuse('INVALID_OPERATION', 'Supported commands are register, post, and acknowledge.');
  return next;
}
