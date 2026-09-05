import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalCandidateBuildStore, type LocalCandidateBuild } from '../data-os/local-candidate-build';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { LocalNormalizationStore } from '../data-os/local-normalization';
import { localRecordDigest } from '../data-os/local-record';
import {
  CANDIDATE_BUILD_REVIEWER_ID as WORKER_ID, CANDIDATE_BUILD_REVIEW_TOPIC as TOPIC,
  candidateBuildReviewerDefinition, runCandidateBuildReviewOnce,
} from './candidate-build-review';
import type { WorkerClient } from './contract-review';
import { inboxFor } from './inbox';
import { applyCommand, connectionsFor, scopeState } from './ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from './seed';
import type {
  BoardMessage, CoordinationCommand, CoordinationInbox, CoordinationSnapshot,
  InboxQuery, MessageDraft, Participant,
} from './types';

const AT = '2026-09-05T16:00:00.000Z';
const BUILT = '2026-09-05T15:00:00.000Z';
const CUTOFF = '2026-09-05T14:00:00.000Z';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;
const BUILD_ID = 'review-build';
const NONCLAIMS = {
  canonicalAdmission: false, releaseActivated: false, independentlyVerified: false, sourceTruthClaimed: false,
  rawBytesIncluded: false, candidateFieldsIncluded: false, sourceIdentifiersIncluded: false,
};
let temporary: string;
let root: string;

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-candidate-review-test-')); root = join(temporary, 'evidence'); });
afterEach(() => { vi.restoreAllMocks(); rmSync(temporary, { recursive: true, force: true }); });

/** Test transport uses production ledger transitions and inbox filtering, not a second board implementation. */
class LocalClient implements WorkerClient {
  state = createSeed();
  canWrite = true;
  mode: CoordinationSnapshot['mode'] = 'LOCAL_SANDBOX';
  effects: CoordinationCommand[] = [];
  scans: InboxQuery[] = [];
  events: string[] = [];
  postMode: 'NORMAL' | 'FAIL_BEFORE' | 'FAIL_AFTER' | 'NO_PERSIST' = 'NORMAL';
  ackMode: 'NORMAL' | 'FAIL_BEFORE' | 'FAIL_AFTER' | 'NO_PERSIST' = 'NORMAL';
  snapshotTransform?: (snapshot: CoordinationSnapshot) => CoordinationSnapshot;
  inboxTransform?: (inbox: CoordinationInbox) => CoordinationInbox;
  beforePost?: (message: MessageDraft) => void;

  command(command: CoordinationCommand) {
    this.state = applyCommand(this.state, DEMO_SCOPE, command, RELEASE_CONTEXTS, AT);
  }

  async snapshot(): Promise<CoordinationSnapshot> {
    this.events.push('snapshot');
    const snapshot: CoordinationSnapshot = {
      ...scopeState(this.state, DEMO_SCOPE), fixture_only: true, scope: DEMO_SCOPE,
      mode: this.mode, persistence: this.mode === 'LOCAL_SANDBOX' ? 'LOCAL_FILE' : 'NONE', canWrite: this.canWrite,
      connections: connectionsFor(this.state, DEMO_SCOPE), releaseContexts: structuredClone(RELEASE_CONTEXTS),
    };
    return this.snapshotTransform?.(snapshot) ?? snapshot;
  }

  async register(participant: Participant) {
    this.events.push('register');
    const command: CoordinationCommand = { operation: 'register', participant };
    this.effects.push(command);
    this.command(command);
    return this.snapshot();
  }

  async inbox(participantId: string, options: Partial<Omit<InboxQuery, 'participantId'>>): Promise<CoordinationInbox> {
    this.events.push('inbox');
    const query: InboxQuery = { participantId, afterSequence: 0, limit: 50, includeAcknowledged: false, includeBroadcasts: false, kind: null, ...options };
    this.scans.push(query);
    const inbox: CoordinationInbox = {
      ...inboxFor(this.state, DEMO_SCOPE, query), schema: 'payload.coordination-inbox.v1',
      fixture_only: true, scope: DEMO_SCOPE, mode: this.mode, canWrite: this.canWrite,
    };
    return this.inboxTransform?.(inbox) ?? inbox;
  }

  async post(message: MessageDraft) {
    this.events.push('post');
    const command: CoordinationCommand = { operation: 'post', message };
    this.effects.push(command);
    this.beforePost?.(message);
    if (this.postMode === 'FAIL_BEFORE') throw new Error('Result transport failed before persistence.');
    if (this.postMode !== 'NO_PERSIST') this.command(command);
    if (this.postMode === 'FAIL_AFTER') throw new Error('Result transport failed after persistence.');
    return this.snapshot();
  }

  async acknowledge(messageId: string, participantId: string) {
    this.events.push('acknowledge');
    const command: CoordinationCommand = { operation: 'acknowledge', messageId, participantId };
    this.effects.push(command);
    if (this.ackMode === 'FAIL_BEFORE') throw new Error('Receipt transport failed before persistence.');
    if (this.ackMode !== 'NO_PERSIST') this.command(command);
    if (this.ackMode === 'FAIL_AFTER') throw new Error('Receipt transport failed after persistence.');
    return this.snapshot();
  }

  queue(overrides: Partial<MessageDraft> = {}) {
    this.command({ operation: 'register', participant: candidateBuildReviewerDefinition(DEMO_SCOPE) });
    this.command({ operation: 'post', message: {
      requestId: `request-${this.state.messages.length + 1}`, authorId: 'apparatus.coordination', recipientId: WORKER_ID,
      kind: 'REQUEST', topic: TOPIC, title: 'Untrusted source title must not be echoed',
      body: JSON.stringify({ buildId: BUILD_ID, expectedDigest: DIGEST }), context: null, replyTo: null, ...overrides,
    } });
    return this.state.messages.at(-1)!;
  }

  define(id: string, overrides: Partial<Participant> = {}) {
    this.command({ operation: 'register', participant: { ...candidateBuildReviewerDefinition(DEMO_SCOPE), id, ...overrides } });
  }

  results() { return this.state.messages.filter((message) => message.authorId === WORKER_ID && message.kind === 'RESULT'); }
  report() { return JSON.parse(this.results()[0].body); }
  acknowledgements() { return this.state.acknowledgements.filter((receipt) => receipt.participantId === WORKER_ID); }
}

function realBuild() {
  const manifest: LocalIntakeManifest = {
    schema: 'payload.local-intake-request.v1', acquisitionId: 'private-acquisition', evidenceId: 'private-evidence',
    purpose: 'REVIEW_TEST', mediaType: 'application/json', capturedAt: '2026-09-05T10:00:00.000Z',
    sourceRegistration: {
      registrationId: 'private-policy', sourceId: 'notation://source/local/private-source-id', displayName: 'Private synthetic source',
      sourceClass: 'SYNTHETIC_DEMONSTRATION', licenseId: 'operator-declaration', policyVersion: '1.0.0',
      effectiveFrom: '2026-09-01T00:00:00.000Z', effectiveUntil: '2026-09-07T00:00:00.000Z',
      permittedPurposes: ['REVIEW_TEST'], allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'],
      retention: { mode: 'UNTIL_SOURCE_EXPIRY' },
    },
  };
  const bytes = Buffer.from(JSON.stringify({
    schema: 'caravan.carrier-source.v1', sourceRecordId: 'private-source-record', legalName: 'Private raw carrier name',
    registrationNumber: 'PRIVATE-REGISTRATION', operatingSite: null, validTime: { state: 'UNOBSERVED', from: null, to: null },
  }));
  const acquisition = new LocalEvidenceIntake(root).capture(manifest, bytes, '2026-09-05T12:00:00.000Z').acquisition;
  new LocalNormalizationStore(root).normalize({
    schema: 'payload.local-normalization-request.v1', normalizationId: 'private-normalization', acquisitionId: manifest.acquisitionId,
    purpose: 'REVIEW_TEST', profile: { id: 'private-profile', version: '1.0.0', sourceRegistrationId: manifest.sourceRegistration.registrationId,
      sourceId: manifest.sourceRegistration.sourceId, adapterId: 'caravan.carrier-json/v1' },
  }, '2026-09-05T13:00:00.000Z');
  const store = new LocalCandidateBuildStore(root);
  const build = store.build({
    schema: 'payload.local-candidate-build-request.v1', buildId: BUILD_ID, purpose: 'REVIEW_TEST', knownThrough: CUTOFF,
    definition: { id: 'private-definition', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: ['SYNTHETIC_DEMONSTRATION'] },
    normalizationIds: ['private-normalization'],
  }, BUILT).build;
  return { store, build, bytes, acquisition };
}

function successfulReport(message: BoardMessage) {
  return {
    schema: 'payload.candidate-build-review.v1', requestDigest: localRecordDigest(message),
    requestedBuild: { id: BUILD_ID, digest: DIGEST }, assessment: 'RECOMPUTED_LOCAL', error: null,
    summary: { buildId: BUILD_ID, digest: DIGEST, recordsRoot: OTHER_DIGEST, recordCount: 1, knownThrough: CUTOFF, builtAt: BUILT, state: 'UNADMITTED' },
    ...NONCLAIMS,
  };
}

function saved(client: LocalClient, message: BoardMessage, body: unknown = successfulReport(message), overrides: Partial<MessageDraft> = {}) {
  client.command({ operation: 'post', message: {
    requestId: `${WORKER_ID}:${message.id}`, authorId: WORKER_ID, recipientId: message.authorId, kind: 'RESULT',
    topic: message.topic, title: 'Candidate build inspection', body: typeof body === 'string' ? body : JSON.stringify(body),
    context: null, replyTo: message.id, ...overrides,
  } });
  return client.state.messages.at(-1)!;
}

function noBuild() { return { inspect: vi.fn<(id: string) => LocalCandidateBuild | undefined>(() => undefined) }; }

describe('local candidate-build review worker', () => {
  it('registers the explicit Caravan inspection contract without inventing work', async () => {
    const client = new LocalClient();
    const before = structuredClone(client.state);
    const inspector = noBuild();
    expect(candidateBuildReviewerDefinition(DEMO_SCOPE)).toMatchObject({
      id: 'agent.candidate-build-review.v1', scope: DEMO_SCOPE, domains: ['CARAVAN'], runtime: 'JavaScript', status: 'LOCAL',
      inputs: ['payload.local-candidate-build.v1'], outputs: ['payload.candidate-build-review.v1'],
    });
    expect(await runCandidateBuildReviewOnce(client, inspector)).toEqual({ processed: 0, recovered: 0, skipped: 0, scanComplete: true });
    expect(client.effects).toEqual([{ operation: 'register', participant: candidateBuildReviewerDefinition(DEMO_SCOPE) }]);
    expect(client.state.messages).toEqual(before.messages);
    expect(createSeed()).toEqual(before);
    expect(inspector.inspect).not.toHaveBeenCalled();
  });

  it.each(['REQUEST', 'HANDOFF'] as const)('reopens and recomputes a real evidence chain for %s, saves a bounded summary, then ACKs', async (kind) => {
    const { build, bytes, acquisition } = realBuild();
    const inspector = { inspect: vi.fn((id: string) => new LocalCandidateBuildStore(root).inspect(id)) };
    const client = new LocalClient();
    const request = client.queue({ kind, body: JSON.stringify({ expectedDigest: build.digest, buildId: build.buildId }) });
    expect(await runCandidateBuildReviewOnce(client, inspector)).toEqual({ processed: 1, recovered: 0, skipped: 0, scanComplete: true });
    expect(inspector.inspect).toHaveBeenCalledTimes(1);
    expect(inspector.inspect).toHaveBeenCalledWith(build.buildId);
    expect(client.results()).toHaveLength(1);
    expect(client.results()[0]).toMatchObject({
      requestId: `${WORKER_ID}:${request.id}`, authorId: WORKER_ID, recipientId: request.authorId, kind: 'RESULT',
      topic: TOPIC, title: 'Candidate build inspection', context: null, replyTo: request.id,
    });
    expect(client.report()).toEqual({
      schema: 'payload.candidate-build-review.v1', requestDigest: localRecordDigest(request), requestedBuild: { id: build.buildId, digest: build.digest },
      assessment: 'RECOMPUTED_LOCAL', error: null,
      summary: { buildId: build.buildId, digest: build.digest, recordsRoot: build.recordsRoot, recordCount: 1, knownThrough: CUTOFF, builtAt: BUILT, state: 'UNADMITTED' },
      ...NONCLAIMS,
    });
    expect(client.results()[0].body.length).toBeLessThanOrEqual(3500);
    for (const forbidden of ['private-source-id', 'private-source-record', 'Private raw carrier name', 'PRIVATE-REGISTRATION', 'private-acquisition', 'private-normalization', 'private-policy', root]) {
      expect(client.results()[0].body).not.toContain(forbidden);
    }
    expect(client.events.slice(client.events.indexOf('post') + 1, client.events.indexOf('acknowledge'))).toContain('snapshot');
    expect(client.effects.map((effect) => effect.operation)).toEqual(['register', 'post', 'acknowledge']);
    expect(client.acknowledgements()).toEqual([{ messageId: request.id, participantId: WORKER_ID, scope: DEMO_SCOPE, createdAt: AT }]);
    expect(new LocalCandidateBuildStore(root).inspect(build.buildId)).toEqual(build);
    expect(readFileSync(join(root, 'objects', ...acquisition.capture.evidence.storageKey.split('/')))).toEqual(bytes);
  });

  it.each([
    'not JSON', 'null', '[]', '{}',
    JSON.stringify({ buildId: BUILD_ID, expectedDigest: DIGEST, root: 'C:/private' }),
    JSON.stringify({ buildId: BUILD_ID, expectedDigest: DIGEST, command: 'execute' }),
    JSON.stringify({ buildId: BUILD_ID, expectedDigest: DIGEST, options: {} }),
    JSON.stringify({ buildId: '', expectedDigest: DIGEST }),
    JSON.stringify({ buildId: 'bad id', expectedDigest: DIGEST }),
    JSON.stringify({ buildId: 'bad\nid', expectedDigest: DIGEST }),
    JSON.stringify({ buildId: 'x'.repeat(181), expectedDigest: DIGEST }),
    JSON.stringify({ buildId: BUILD_ID, expectedDigest: DIGEST.toUpperCase() }),
    JSON.stringify({ buildId: BUILD_ID, expectedDigest: `sha256:${'a'.repeat(63)}` }),
    JSON.stringify({ buildId: BUILD_ID, expectedDigest: null }),
  ])('rejects malformed or overbroad request without calling storage: %s', async (body) => {
    const client = new LocalClient();
    const request = client.queue({ body });
    const inspector = noBuild();
    await runCandidateBuildReviewOnce(client, inspector);
    expect(client.report()).toEqual({
      schema: 'payload.candidate-build-review.v1', requestDigest: localRecordDigest(request), requestedBuild: null,
      assessment: 'REJECTED', error: 'INVALID_BUILD_REVIEW_REQUEST', summary: null, ...NONCLAIMS,
    });
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.acknowledgements()).toHaveLength(1);
  });

  it('accepts the maximum opaque identifier as an identifier, not a filesystem or command option', async () => {
    const client = new LocalClient();
    const id = 'x'.repeat(180);
    client.queue({ body: JSON.stringify({ buildId: id, expectedDigest: DIGEST }) });
    const inspector = noBuild();
    await runCandidateBuildReviewOnce(client, inspector);
    expect(inspector.inspect).toHaveBeenCalledTimes(1);
    expect(inspector.inspect).toHaveBeenCalledWith(id);
    expect(client.report()).toMatchObject({ requestedBuild: { id, digest: DIGEST }, error: 'BUILD_NOT_FOUND' });
  });

  it.each(['NO_CARAVAN', 'MISSING', 'OTHER_SCOPE'] as const)('rejects author domain mismatch %s before local inspection', async (variant) => {
    const client = new LocalClient();
    client.define('agent.requester', { domains: ['TRADEWIND'] });
    client.queue({ authorId: 'agent.requester' });
    if (variant !== 'NO_CARAVAN') client.snapshotTransform = (snapshot) => ({ ...snapshot,
      participants: variant === 'MISSING' ? snapshot.participants.filter((p) => p.id !== 'agent.requester') :
        snapshot.participants.map((p) => p.id === 'agent.requester' ? { ...p, scope: 'other:scope', domains: ['CARAVAN'] } : p),
    });
    const inspector = noBuild();
    await runCandidateBuildReviewOnce(client, inspector);
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.report()).toMatchObject({ assessment: 'REJECTED', error: 'AUTHOR_DOMAIN_MISMATCH', summary: null, ...NONCLAIMS });
  });

  it('reports unavailable builds without exposing an inferred or partial snapshot', async () => {
    const client = new LocalClient();
    client.queue();
    const inspector = noBuild();
    await runCandidateBuildReviewOnce(client, inspector);
    expect(inspector.inspect).toHaveBeenCalledTimes(1);
    expect(inspector.inspect).toHaveBeenCalledWith(BUILD_ID);
    expect(client.report()).toMatchObject({ requestedBuild: { id: BUILD_ID, digest: DIGEST }, assessment: 'UNAVAILABLE', error: 'BUILD_NOT_FOUND', summary: null });
  });

  it.each(['OTHER_DIGEST', 'RECORDS_ROOT'] as const)('requires the full build digest, not %s', async (digestKind) => {
    const { store, build } = realBuild();
    const client = new LocalClient();
    const expectedDigest = digestKind === 'OTHER_DIGEST' ? OTHER_DIGEST : build.recordsRoot;
    expect(expectedDigest).not.toBe(build.digest);
    client.queue({ body: JSON.stringify({ buildId: build.buildId, expectedDigest }) });
    await runCandidateBuildReviewOnce(client, store);
    expect(client.report()).toMatchObject({ assessment: 'REJECTED', error: 'BUILD_DIGEST_MISMATCH', summary: null });
    expect(client.acknowledgements()).toHaveLength(1);
  });

  it('rehashes real evidence and reports corruption without repairing it or disclosing paths', async () => {
    const { store, build, acquisition } = realBuild();
    const path = join(root, 'objects', ...acquisition.capture.evidence.storageKey.split('/'));
    const corrupt = Buffer.from('Corrupt private source contents');
    writeFileSync(path, corrupt);
    const client = new LocalClient();
    client.queue({ body: JSON.stringify({ buildId: build.buildId, expectedDigest: build.digest }) });
    await runCandidateBuildReviewOnce(client, store);
    expect(client.report()).toMatchObject({ assessment: 'UNAVAILABLE', error: 'BUILD_INSPECTION_FAILED', summary: null, ...NONCLAIMS });
    expect(client.results()[0].body).not.toContain(root);
    expect(client.results()[0].body).not.toContain('Corrupt private');
    expect(readFileSync(path)).toEqual(corrupt);
  });

  it('sanitizes inspector exceptions and never echoes untrusted titles', async () => {
    const client = new LocalClient();
    client.queue({ title: 'private source record belongs in no result title' });
    const inspector = { inspect: vi.fn(() => { throw new Error(`${root}: private-source-record is corrupt`); }) };
    await runCandidateBuildReviewOnce(client, inspector);
    expect(client.report()).toMatchObject({ assessment: 'UNAVAILABLE', error: 'BUILD_INSPECTION_FAILED', summary: null });
    expect(client.results()[0].title).toBe('Candidate build inspection');
    expect(JSON.stringify(client.results()[0])).not.toContain('private source');
    expect(client.results()[0].body).not.toContain(root);
    expect(client.results()[0].body).not.toContain('private-source-record');
  });

  it('leaves fixture-context requests, unrelated topics/kinds, broadcasts and other recipients untouched', async () => {
    const client = new LocalClient();
    client.queue({ context: RELEASE_CONTEXTS[0] });
    client.queue({ topic: 'other-topic' });
    for (const kind of ['NOTE', 'BLOCKER', 'RESULT'] as const) client.queue({ kind });
    client.queue({ recipientId: null });
    client.queue({ recipientId: 'agent.identity' });
    const before = structuredClone(client.state.messages);
    const inspector = noBuild();
    expect(await runCandidateBuildReviewOnce(client, inspector)).toEqual({ processed: 0, recovered: 0, skipped: 5, scanComplete: true });
    expect(client.state.messages).toEqual(before);
    expect(client.acknowledgements()).toEqual([]);
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.scans.every((query) => !query.includeAcknowledged && !query.includeBroadcasts)).toBe(true);
  });

  it('retries an unpersisted result without losing the request', async () => {
    const client = new LocalClient();
    const request = client.queue();
    const inspector = noBuild();
    client.postMode = 'FAIL_BEFORE';
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('Result transport failed');
    expect(client.results()).toEqual([]);
    expect(client.acknowledgements()).toEqual([]);
    client.postMode = 'NORMAL';
    expect(await runCandidateBuildReviewOnce(client, inspector)).toMatchObject({ processed: 1, recovered: 0 });
    expect(client.results()).toHaveLength(1);
    expect(client.acknowledgements()).toEqual([expect.objectContaining({ messageId: request.id })]);
    const posts = client.effects.filter((effect) => effect.operation === 'post');
    expect(posts[0]).toEqual(posts[1]);
  });

  it('recovers an uncertain post from durable readback before acknowledging', async () => {
    const client = new LocalClient();
    client.queue();
    client.postMode = 'FAIL_AFTER';
    expect(await runCandidateBuildReviewOnce(client, noBuild())).toEqual({ processed: 0, recovered: 1, skipped: 0, scanComplete: true });
    expect(client.results()).toHaveLength(1);
    expect(client.acknowledgements()).toHaveLength(1);
    expect(client.events.slice(client.events.indexOf('post') + 1, client.events.indexOf('acknowledge'))).toEqual(['snapshot']);
  });

  it('does not treat a successful transport response as proof that the result persisted', async () => {
    const client = new LocalClient();
    client.queue();
    client.postMode = 'NO_PERSIST';
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('not persisted');
    expect(client.results()).toEqual([]);
    expect(client.acknowledgements()).toEqual([]);
    expect(client.events).not.toContain('acknowledge');
  });

  it('recovers a saved result after failed ACK without inspecting changed or unavailable local files', async () => {
    const { store, build, acquisition } = realBuild();
    const client = new LocalClient();
    const request = client.queue({ body: JSON.stringify({ buildId: build.buildId, expectedDigest: build.digest }) });
    client.ackMode = 'FAIL_BEFORE';
    await expect(runCandidateBuildReviewOnce(client, store)).rejects.toThrow('Receipt transport failed');
    const result = structuredClone(client.results()[0]);
    writeFileSync(join(root, 'objects', ...acquisition.capture.evidence.storageKey.split('/')), 'changed after historical inspection');
    const inspector = { inspect: vi.fn(() => { throw new Error('Must not recompute a saved historical result'); }) };
    client.ackMode = 'NORMAL';
    client.effects = [];
    expect(await runCandidateBuildReviewOnce(client, inspector)).toEqual({ processed: 0, recovered: 1, skipped: 0, scanComplete: true });
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.results()).toEqual([result]);
    expect(client.effects.map((effect) => effect.operation)).toEqual(['register', 'acknowledge']);
    expect(client.acknowledgements()).toEqual([expect.objectContaining({ messageId: request.id })]);
  });

  it('does not duplicate a result or ACK when the first ACK persisted but its response was lost', async () => {
    const client = new LocalClient();
    client.queue();
    const inspector = noBuild();
    client.ackMode = 'FAIL_AFTER';
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('Receipt transport failed');
    const completed = structuredClone(client.state);
    client.ackMode = 'NORMAL';
    expect(await runCandidateBuildReviewOnce(client, inspector)).toEqual({ processed: 0, recovered: 0, skipped: 0, scanComplete: true });
    expect(client.state).toEqual(completed);
    expect(inspector.inspect).toHaveBeenCalledTimes(1);
  });

  it('leaves an unpersisted ACK pending and recovers the saved result without reinspection', async () => {
    const client = new LocalClient();
    client.queue();
    const inspector = noBuild();
    client.ackMode = 'NO_PERSIST';
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow();
    expect(client.results()).toHaveLength(1);
    expect(client.acknowledgements()).toEqual([]);
    const result = structuredClone(client.results()[0]);
    client.ackMode = 'NORMAL';
    expect(await runCandidateBuildReviewOnce(client, inspector)).toEqual({ processed: 0, recovered: 1, skipped: 0, scanComplete: true });
    expect(client.results()).toEqual([result]);
    expect(inspector.inspect).toHaveBeenCalledTimes(1);
    expect(client.acknowledgements()).toHaveLength(1);
  });

  it('recovers a structurally valid saved observation without claiming authenticated authorship', async () => {
    const client = new LocalClient();
    const request = client.queue();
    const existing = saved(client, request);
    const inspector = noBuild();
    expect(await runCandidateBuildReviewOnce(client, inspector)).toEqual({ processed: 0, recovered: 1, skipped: 0, scanComplete: true });
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.results()).toEqual([existing]);
    expect(client.acknowledgements()).toHaveLength(1);
  });

  it.each([
    ['not JSON', () => 'not JSON'],
    ['schema', (body: ReturnType<typeof successfulReport>) => ({ ...body, schema: 'forged.v1' })],
    ['request binding', (body: ReturnType<typeof successfulReport>) => ({ ...body, requestDigest: OTHER_DIGEST })],
    ['build binding', (body: ReturnType<typeof successfulReport>) => ({ ...body, requestedBuild: { id: BUILD_ID, digest: OTHER_DIGEST } })],
    ['extra raw field', (body: ReturnType<typeof successfulReport>) => ({ ...body, raw: 'private source contents' })],
    ['promoted admission', (body: ReturnType<typeof successfulReport>) => ({ ...body, canonicalAdmission: true })],
    ['missing nonclaim', (body: ReturnType<typeof successfulReport>) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'rawBytesIncluded'))],
    ['assessment', (body: ReturnType<typeof successfulReport>) => ({ ...body, assessment: 'INDEPENDENTLY_VERIFIED' })],
    ['unknown error', (body: ReturnType<typeof successfulReport>) => ({ ...body, error: 'PRIVATE_PATH_ERROR' })],
    ['error with success summary', (body: ReturnType<typeof successfulReport>) => ({ ...body, error: 'BUILD_NOT_FOUND', assessment: 'UNAVAILABLE' })],
    ['null success summary', (body: ReturnType<typeof successfulReport>) => ({ ...body, summary: null })],
    ['summary build digest', (body: ReturnType<typeof successfulReport>) => ({ ...body, summary: { ...body.summary, digest: OTHER_DIGEST } })],
    ['summary root', (body: ReturnType<typeof successfulReport>) => ({ ...body, summary: { ...body.summary, recordsRoot: 'not a digest' } })],
    ['summary membership count', (body: ReturnType<typeof successfulReport>) => ({ ...body, summary: { ...body.summary, recordCount: 65 } })],
    ['summary extra identity', (body: ReturnType<typeof successfulReport>) => ({ ...body, summary: { ...body.summary, sourceId: 'private-source' } })],
    ['summary future cutoff', (body: ReturnType<typeof successfulReport>) => ({ ...body, summary: { ...body.summary, knownThrough: AT } })],
  ] as const)('refuses a conflicting saved result (%s) before inspection or ACK', async (_name, mutate) => {
    const client = new LocalClient();
    const request = client.queue();
    saved(client, request, mutate(successfulReport(request)));
    const inspector = noBuild();
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('conflicting');
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.acknowledgements()).toEqual([]);
    expect(client.effects.map((effect) => effect.operation)).toEqual(['register']);
  });

  it.each([
    { kind: 'NOTE' as const }, { replyTo: null }, { recipientId: 'agent.identity' },
    { title: 'Private source details in a spoofed title' },
    { topic: 'wrong-topic', replyTo: null }, { context: RELEASE_CONTEXTS[0], replyTo: null },
  ])('refuses a saved result with mismatched envelope %j before ACK', async (overrides) => {
    const client = new LocalClient();
    const request = client.queue();
    saved(client, request, successfulReport(request), overrides);
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('conflicting');
    expect(client.acknowledgements()).toEqual([]);
  });

  it('binds recovery to the entire board request, including its original title and timestamp', async () => {
    const client = new LocalClient();
    const request = client.queue();
    saved(client, request);
    client.state.messages = client.state.messages.map((message) => message.id === request.id ? { ...message, title: 'changed after result', createdAt: BUILT } : message);
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('conflicting');
    expect(client.acknowledgements()).toEqual([]);
  });

  it('rejects duplicate worker-result identities even when both report bodies match', async () => {
    const client = new LocalClient();
    const request = client.queue();
    const existing = saved(client, request);
    client.state.messages.push({ ...existing, id: 'MSG-duplicate', sequence: existing.sequence + 1 });
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('conflicting');
    expect(client.acknowledgements()).toEqual([]);
  });

  it('converges when another worker persists the identical result before this post', async () => {
    const client = new LocalClient();
    client.queue();
    client.beforePost = (message) => client.command({ operation: 'post', message: structuredClone(message) });
    expect(await runCandidateBuildReviewOnce(client, noBuild())).toMatchObject({ processed: 1 });
    expect(client.results()).toHaveLength(1);
    expect(client.acknowledgements()).toHaveLength(1);
  });

  it('does not ACK a malformed concurrent winner even when posting returned an idempotency conflict', async () => {
    const client = new LocalClient();
    client.queue();
    client.beforePost = (message) => client.command({ operation: 'post', message: { ...message, body: '{}' } });
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('conflicting');
    expect(client.results()).toHaveLength(1);
    expect(client.acknowledgements()).toEqual([]);
  });

  it.each([
    { mode: 'FIXTURE' as const, canWrite: false }, { mode: 'FIXTURE' as const, canWrite: true },
    { mode: 'LOCAL_SANDBOX' as const, canWrite: false },
  ])('does not register or inspect outside a writable sandbox: %j', async (flags) => {
    const client = Object.assign(new LocalClient(), flags);
    const inspector = noBuild();
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('local coordination sandbox');
    expect(client.effects).toEqual([]);
    expect(inspector.inspect).not.toHaveBeenCalled();
  });

  it.each([0, 26, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid limit %s without contacting the board', async (limit) => {
    const client = new LocalClient();
    await expect(runCandidateBuildReviewOnce(client, noBuild(), limit)).rejects.toThrow('Worker limit');
    expect(client.events).toEqual([]);
  });

  it('stops if registration fails without inspecting or posting', async () => {
    const client = new LocalClient();
    client.queue();
    vi.spyOn(client, 'register').mockRejectedValue(new Error('Registration unavailable'));
    const inspector = noBuild();
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('Registration unavailable');
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.results()).toEqual([]);
    expect(client.acknowledgements()).toEqual([]);
  });

  it.each(['SCOPE', 'MODE', 'WRITABILITY'] as const)('rechecks %s after registration and before local file inspection', async (change) => {
    const client = new LocalClient();
    client.queue();
    client.snapshotTransform = (snapshot) => client.events.includes('register') ? {
      ...snapshot, ...(change === 'SCOPE' ? { scope: 'other:scope' } : change === 'MODE' ? { mode: 'FIXTURE' as const } : { canWrite: false }),
    } : snapshot;
    const inspector = noBuild();
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('local coordination sandbox');
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.results()).toEqual([]);
    expect(client.acknowledgements()).toEqual([]);
  });

  it('rechecks the fresh result readback scope before attempting ACK', async () => {
    const client = new LocalClient();
    client.queue();
    client.snapshotTransform = (snapshot) => client.events.includes('post') ? { ...snapshot, scope: 'other:scope' } : snapshot;
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('local coordination sandbox');
    expect(client.results()).toHaveLength(1);
    expect(client.events).not.toContain('acknowledge');
  });

  it.each([
    { scope: 'other:scope' }, { participantId: 'agent.identity' }, { mode: 'FIXTURE' as const }, { canWrite: false },
  ])('refuses a mismatched inbox assignment %j', async (overrides) => {
    const client = new LocalClient();
    client.queue();
    client.inboxTransform = (inbox) => ({ ...inbox, ...overrides });
    const inspector = noBuild();
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('assignment');
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.acknowledgements()).toEqual([]);
  });

  it.each([{ scope: 'other:scope' }, { recipientId: 'agent.identity' }])('refuses an out-of-assignment message %j', async (overrides) => {
    const client = new LocalClient();
    client.queue();
    client.inboxTransform = (inbox) => ({ ...inbox, messages: inbox.messages.map((message) => ({ ...message, ...overrides })) });
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('assignment');
    expect(client.acknowledgements()).toEqual([]);
  });

  it('does not inspect an inbox input that differs from the durable board request', async () => {
    const client = new LocalClient();
    client.queue();
    client.inboxTransform = (inbox) => ({ ...inbox, messages: inbox.messages.map((message) => ({ ...message, title: 'inbox-only forged title' })) });
    const inspector = noBuild();
    await expect(runCandidateBuildReviewOnce(client, inspector)).rejects.toThrow('saved board request');
    expect(inspector.inspect).not.toHaveBeenCalled();
    expect(client.acknowledgements()).toEqual([]);
  });

  it('bounds work per pass and starts the next scan at zero to recover pending messages', async () => {
    const client = new LocalClient();
    const requests = [client.queue(), client.queue(), client.queue()];
    expect(await runCandidateBuildReviewOnce(client, noBuild(), 2)).toEqual({ processed: 2, recovered: 0, skipped: 0, scanComplete: false });
    expect(client.results().map((message) => message.replyTo)).toEqual(requests.slice(0, 2).map((message) => message.id));
    expect(await runCandidateBuildReviewOnce(client, noBuild(), 2)).toEqual({ processed: 1, recovered: 0, skipped: 0, scanComplete: true });
    expect(client.scans.map((query) => query.afterSequence)).toEqual([0, 0]);
    expect(client.acknowledgements()).toHaveLength(3);
  });

  it('pages through ignored work to reach a later directed request', async () => {
    const client = new LocalClient();
    for (let index = 0; index < 105; index++) client.queue({ topic: 'other-topic' });
    const request = client.queue();
    expect(await runCandidateBuildReviewOnce(client, noBuild())).toEqual({ processed: 1, recovered: 0, skipped: 105, scanComplete: true });
    expect(client.scans.map((query) => query.afterSequence)).toEqual([0, 103]);
    expect(client.acknowledgements()).toEqual([expect.objectContaining({ messageId: request.id })]);
  });

  it('caps a perpetually advancing scan at fifty pages', async () => {
    const client = new LocalClient();
    for (let index = 0; index < 50; index++) client.queue({ topic: 'other-topic' });
    client.inboxTransform = (inbox) => ({ ...inbox, messages: [], hasMore: true, nextSequence: inbox.afterSequence + 1 });
    expect(await runCandidateBuildReviewOnce(client, noBuild())).toEqual({ processed: 0, recovered: 0, skipped: 0, scanComplete: false });
    expect(client.scans).toHaveLength(50);
    expect(client.scans[0].afterSequence).toBe(0);
    expect(client.scans[49].afterSequence).toBe(49);
  });

  it('fails closed when a paginated inbox cursor does not advance', async () => {
    const client = new LocalClient();
    client.inboxTransform = (inbox) => ({ ...inbox, messages: [], hasMore: true, nextSequence: 0 });
    await expect(runCandidateBuildReviewOnce(client, noBuild())).rejects.toThrow('cursor did not advance');
    expect(client.scans).toHaveLength(1);
    expect(client.acknowledgements()).toEqual([]);
  });
});
