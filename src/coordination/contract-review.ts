import type { BoardMessage, CoordinationInbox, CoordinationSnapshot, InboxQuery, MessageDraft, Participant } from './types';

export const CONTRACT_REVIEWER_ID = 'agent.contract-review.v1';
export const CONTRACT_REVIEW_TOPIC = 'contract-review';

export interface WorkerClient {
  snapshot(): Promise<CoordinationSnapshot>;
  register(participant: Participant): Promise<CoordinationSnapshot>;
  inbox(participantId: string, options: Partial<Omit<InboxQuery, 'participantId'>>): Promise<CoordinationInbox>;
  post(message: MessageDraft): Promise<CoordinationSnapshot>;
  acknowledge(messageId: string, participantId: string): Promise<CoordinationSnapshot>;
}

export function contractReviewerDefinition(scope: string): Participant {
  return { id: CONTRACT_REVIEWER_ID, name: 'Contract review worker', kind: 'AGENT', version: '0.1.0',
    purpose: 'Review registered input/output contracts and report suppliers and missing inputs for a named participant.',
    authority: 'derived', runtime: 'JavaScript', status: 'LOCAL', scope,
    domains: ['CARAVAN', 'TRADEWIND', 'LANDSHARK'], inputs: ['ParticipantDefinition/v1'], outputs: ['ContractReview/v1'],
    capabilities: ['coordination.contract-review'], reference: 'NotationsOS: src/coordination/contract-review.ts',
  };
}

function review(snapshot: CoordinationSnapshot, message: BoardMessage): string {
  let request: { participantId: string };
  try {
    request = JSON.parse(message.body);
    if (!request || Array.isArray(request) || Object.keys(request).join(',') !== 'participantId' || typeof request.participantId !== 'string') throw new Error('Invalid input.');
  } catch {
    return JSON.stringify({ schema: 'payload.contract-review.v1', error: 'INVALID_REVIEW_REQUEST', detail: 'Body must be a JSON object with exactly participantId. This worker inspects declarations only.' });
  }
  const subject = snapshot.participants.find((p) => p.id === request.participantId && p.scope === message.scope);
  if (!subject) return JSON.stringify({ schema: 'payload.contract-review.v1', error: 'UNKNOWN_PARTICIPANT', detail: 'The requested definition is not registered in this scope.' });
  const incoming = snapshot.connections.filter((connection) => connection.targetId === subject.id);
  const matched = new Set(incoming.flatMap((connection) => connection.contracts));
  const missing = subject.inputs.filter((input) => !matched.has(input));
  const report = { schema: 'payload.contract-review.v1', assessment: 'DECLARED_CONTRACTS_ONLY',
    subjectId: subject.id, subjectVersion: subject.version, inputCount: subject.inputs.length,
    matchedInputCount: subject.inputs.filter((input) => matched.has(input)).length, sourceCount: incoming.length,
    missingInputs: [...missing], incoming: incoming.map(({ sourceId, contracts, domains }) => ({ sourceId, contracts, domains })),
    omittedConnections: 0, omittedMissingInputs: 0,
  };
  // Board bodies are bounded; the counts remain exact when details do not all fit.
  while (JSON.stringify(report).length > 3500 && report.incoming.length) { report.incoming.pop(); report.omittedConnections++; }
  while (JSON.stringify(report).length > 3500 && report.missingInputs.length) { report.missingInputs.pop(); report.omittedMissingInputs++; }
  return JSON.stringify(report);
}

/** One bounded pass. The durable receipt is written only after a result exists. */
export async function runContractReviewOnce(client: WorkerClient, limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Worker limit must be an integer from 1 to 100.');
  const initial = await client.snapshot();
  if (!initial.canWrite || initial.mode !== 'LOCAL_SANDBOX') throw new Error('Start the local coordination sandbox before running a worker.');
  await client.register(contractReviewerDefinition(initial.scope));
  let processed = 0;
  let recovered = 0;
  let skipped = 0;
  let afterSequence = 0;
  for (let scan = 0; scan < 50; scan++) {
    const inbox = await client.inbox(CONTRACT_REVIEWER_ID, { afterSequence, limit: 100, includeAcknowledged: false, includeBroadcasts: false });
    if (inbox.scope !== initial.scope || inbox.participantId !== CONTRACT_REVIEWER_ID) throw new Error('The inbox does not match the worker registration.');
    for (const message of inbox.messages) {
      if (message.recipientId !== CONTRACT_REVIEWER_ID || message.scope !== initial.scope) throw new Error('The inbox returned a message outside the worker assignment.');
      if (!['REQUEST', 'HANDOFF'].includes(message.kind) || message.topic !== CONTRACT_REVIEW_TOPIC) { skipped++; continue; }
      const snapshot = await client.snapshot();
      if (snapshot.scope !== initial.scope) throw new Error('Coordination scope changed during the worker pass.');
      const requestId = `${CONTRACT_REVIEWER_ID}:${message.id}`;
      const previous = snapshot.messages.find((result) => result.scope === initial.scope && result.authorId === CONTRACT_REVIEWER_ID && result.requestId === requestId);
      if (previous) {
        if (previous.kind !== 'RESULT' || previous.replyTo !== message.id || previous.recipientId !== message.authorId || previous.topic !== message.topic || JSON.stringify(previous.context) !== JSON.stringify(message.context)) {
          throw new Error('A conflicting result already uses this worker request id.');
        }
      } else {
        await client.post({ requestId, authorId: CONTRACT_REVIEWER_ID, recipientId: message.authorId, kind: 'RESULT', topic: message.topic,
          title: `Contract review: ${message.title}`.slice(0, 180), body: review(snapshot, message), context: message.context, replyTo: message.id });
      }
      // An uncertain ACK response is recoverable: next pass finds the saved result or no pending input.
      await client.acknowledge(message.id, CONTRACT_REVIEWER_ID);
      if (previous) recovered++; else processed++;
      if (processed + recovered >= limit) return { processed, recovered, skipped, scanComplete: false };
    }
    if (!inbox.hasMore) return { processed, recovered, skipped, scanComplete: true };
    if (inbox.nextSequence <= afterSequence) throw new Error('The inbox cursor did not advance.');
    afterSequence = inbox.nextSequence;
  }
  return { processed, recovered, skipped, scanComplete: false };
}
