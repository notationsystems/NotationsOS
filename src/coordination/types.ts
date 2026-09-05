/** Shared Payload OS coordination contracts. These are operational records, not Kernel entities. */
export const MESSAGE_KINDS = ['NOTE', 'REQUEST', 'HANDOFF', 'BLOCKER', 'RESULT'] as const;
export const DOMAINS = ['CARAVAN', 'TRADEWIND', 'LANDSHARK'] as const;
export const AUTHORITIES = ['canonical', 'evidence', 'coordination', 'derived', 'projection', 'verification'] as const;
export type CoordinationDomain = typeof DOMAINS[number];
export type Authority = typeof AUTHORITIES[number];
export type MessageKind = typeof MESSAGE_KINDS[number];
export type Scope = string;

export interface Participant {
  id: string;
  name: string;
  kind: 'AGENT' | 'APPARATUS';
  version: string;
  purpose: string;
  authority: Authority;
  runtime: 'Rust' | 'C++' | 'Python' | 'JavaScript' | 'Unassigned';
  status: 'REFERENCE' | 'PLANNED' | 'LOCAL';
  scope: Scope;
  domains: CoordinationDomain[];
  inputs: string[];
  outputs: string[];
  capabilities: string[];
  reference: string;
}

export interface ReleaseContext {
  domain: CoordinationDomain;
  releaseId: string;
  buildId: string;
  knownAt: string;
}

export interface MessageDraft {
  requestId: string;
  authorId: string;
  recipientId: string | null;
  kind: MessageKind;
  topic: string;
  title: string;
  body: string;
  context: ReleaseContext | null;
  replyTo: string | null;
}

export interface BoardMessage extends MessageDraft {
  id: string;
  sequence: number;
  scope: Scope;
  createdAt: string;
}

export interface Acknowledgement {
  messageId: string;
  participantId: string;
  scope: Scope;
  createdAt: string;
}

export interface CoordinationState {
  schema: 'payload.coordination.v1';
  participants: Participant[];
  messages: BoardMessage[];
  acknowledgements: Acknowledgement[];
}

/** Declared contract compatibility; it does not attest deployment or authorize execution. */
export interface Connection {
  sourceId: string;
  targetId: string;
  contracts: string[];
  missingInputs: string[];
  domains: CoordinationDomain[];
  status: 'MATCH' | 'PARTIAL';
}

export interface CoordinationSnapshot extends CoordinationState {
  fixture_only: true;
  scope: Scope;
  mode: 'FIXTURE' | 'LOCAL_SANDBOX';
  persistence: 'NONE' | 'LOCAL_FILE';
  canWrite: boolean;
  connections: Connection[];
  releaseContexts: ReleaseContext[];
}

export type CoordinationCommand =
  | { operation: 'register'; participant: Participant }
  | { operation: 'post'; message: MessageDraft }
  | { operation: 'acknowledge'; messageId: string; participantId: string };

export interface InboxQuery {
  participantId: string;
  afterSequence: number;
  limit: number;
  includeAcknowledged: boolean;
  includeBroadcasts: boolean;
  kind: MessageKind | null;
}

export interface InboxPage {
  participantId: string;
  afterSequence: number;
  nextSequence: number;
  highWaterSequence: number;
  hasMore: boolean;
  messages: BoardMessage[];
  acknowledgements: Acknowledgement[];
}

export interface CoordinationInbox extends InboxPage {
  schema: 'payload.coordination-inbox.v1';
  fixture_only: true;
  scope: Scope;
  mode: CoordinationSnapshot['mode'];
  canWrite: boolean;
}
