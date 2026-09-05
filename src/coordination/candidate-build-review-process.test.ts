import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { LocalNormalizationStore } from '../data-os/local-normalization';
import { LocalCandidateBuildStore } from '../data-os/local-candidate-build';
import { localRecordDigest } from '../data-os/local-record';
import type { CandidateBuildReview } from './candidate-build-review';
import { inboxFor, parseInboxQuery } from './inbox';
import { applyCommand, connectionsFor, CoordinationError, scopeState } from './ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from './seed';
import type { CoordinationCommand, CoordinationSnapshot, MessageDraft } from './types';

const workspace = resolve(process.cwd());
const WORKER = 'agent.candidate-build-review.v1';
const TOPIC = 'candidate-build-review';
let temporary: string;
let boards: LoopbackBoard[];

beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-candidate-review-process-')); boards = []; });
afterEach(async () => {
  await Promise.all(boards.map((board) => board.close()));
  rmSync(temporary, { recursive: true, force: true });
});

interface ProcessResult { code: number | null; stdout: string; stderr: string }

/** A real HTTP transport around the production ledger/inbox, retained between worker processes. */
class LoopbackBoard {
  state = createSeed();
  events: string[] = [];
  failNextAcknowledgement = false;
  private server: Server;
  url = '';

  constructor() {
    this.server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' });
        response.end(JSON.stringify(value));
      };
      const fail = (error: unknown) => send(error instanceof CoordinationError ? error.status : 400, {
        error: error instanceof CoordinationError ? error.code : 'TEST_REQUEST_ERROR',
        detail: error instanceof Error ? error.message : 'Request failed.',
      });
      if (request.method === 'GET') {
        this.events.push(`GET ${url.pathname}`);
        try {
          if (url.pathname === '/api/coordination') send(200, this.snapshot());
          else if (url.pathname === '/api/coordination/inbox') send(200, {
            ...inboxFor(this.state, DEMO_SCOPE, parseInboxQuery(url.searchParams)),
            schema: 'payload.coordination-inbox.v1', fixture_only: true,
            scope: DEMO_SCOPE, mode: 'LOCAL_SANDBOX', canWrite: true,
          });
          else send(404, { error: 'NOT_FOUND', detail: 'Unknown test route.' });
        } catch (error) { fail(error); }
        return;
      }
      if (request.method !== 'POST' || url.pathname !== '/api/coordination') {
        this.events.push(`${request.method} ${url.pathname}`);
        send(404, { error: 'NOT_FOUND', detail: 'Unknown test route.' });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      request.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > 64 * 1024) request.destroy(new Error('Test HTTP command limit exceeded.'));
        else chunks.push(chunk);
      });
      request.once('error', () => { if (!response.writableEnded) response.destroy(); });
      request.once('end', () => {
        try {
          const command = JSON.parse(Buffer.concat(chunks).toString('utf8')) as CoordinationCommand;
          this.events.push(`POST ${command.operation}`);
          if (command.operation === 'acknowledge' && this.failNextAcknowledgement) {
            this.failNextAcknowledgement = false;
            send(409, { error: 'TEST_ACK_FAILURE', detail: 'Simulated acknowledgement failure.' });
            return;
          }
          this.command(command);
          send(200, this.snapshot());
        } catch (error) { fail(error); }
      });
    });
  }

  snapshot(): CoordinationSnapshot {
    return { ...scopeState(this.state, DEMO_SCOPE), fixture_only: true, scope: DEMO_SCOPE,
      mode: 'LOCAL_SANDBOX', persistence: 'LOCAL_FILE', canWrite: true,
      connections: connectionsFor(this.state, DEMO_SCOPE), releaseContexts: structuredClone(RELEASE_CONTEXTS) };
  }

  command(command: CoordinationCommand) { this.state = applyCommand(this.state, DEMO_SCOPE, command, RELEASE_CONTEXTS); }

  queue(buildId: string, expectedDigest: string, overrides: Partial<MessageDraft> = {}) {
    this.command({ operation: 'post', message: {
      requestId: `candidate-review-${this.state.messages.length + 1}`, authorId: 'apparatus.coordination', recipientId: WORKER,
      kind: 'REQUEST', topic: TOPIC, title: 'Inspect the local candidate build',
      body: JSON.stringify({ buildId, expectedDigest }), context: null, replyTo: null, ...overrides,
    } });
    return this.state.messages.at(-1)!;
  }

  results() { return this.state.messages.filter((message) => message.authorId === WORKER && message.kind === 'RESULT'); }

  async listen() {
    await new Promise<void>((done, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', done);
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a loopback TCP address.');
    this.url = `http://127.0.0.1:${address.port}`;
    boards.push(this);
    return this;
  }

  async close() {
    await new Promise<void>((done, reject) => {
      this.server.close((error) => error ? reject(error) : done());
      this.server.closeAllConnections();
    });
  }
}

function bundleWorker() {
  const bundle = join(temporary, 'candidate-build-review.mjs');
  buildSync({
    entryPoints: [join(workspace, 'scripts', 'candidate-build-review.entry.ts')], outfile: bundle,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
  });
  return bundle;
}

/** Bound child lifetime/output and avoid shells, visible windows or inherited board URLs. */
function runWorker(bundle: string, url: string, args: string[]): Promise<ProcessResult> {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], {
      cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PAYLOAD_COORDINATION_URL: url },
    });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Candidate review worker subprocess exceeded 8 seconds.');
      child.kill('SIGKILL');
    }, 8000);
    function append(chunk: Buffer, stream: 'stdout' | 'stderr') {
      if (failure) return;
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 256 * 1024) {
        failure = new Error('Candidate review worker exceeded the output limit.');
        child.kill('SIGKILL');
      }
    }
    child.stdout.on('data', (chunk: Buffer) => append(chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => append(chunk, 'stderr'));
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else complete({ code, stdout, stderr });
    });
  });
}

function savedFiles(root: string, prefix = ''): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, savedFiles(root, relative));
    else result[relative] = readFileSync(join(root, relative));
  }
  return result;
}

function candidateFixture(root: string) {
  const manifest: LocalIntakeManifest = {
    schema: 'payload.local-intake-request.v1', acquisitionId: 'process-carrier-acquisition', evidenceId: 'process-carrier-evidence',
    purpose: 'LOCAL_REVIEW_TEST', mediaType: 'application/json', capturedAt: '2000-01-01T08:00:00Z',
    sourceRegistration: {
      registrationId: 'process-carrier-policy', sourceId: 'notation://source/local/private-carrier-process',
      displayName: 'Synthetic local source', sourceClass: 'OPERATOR_DECLARATION', licenseId: 'synthetic-local-declaration',
      policyVersion: '1.0.0', effectiveFrom: '2000-01-01T00:00:00Z', permittedPurposes: ['LOCAL_REVIEW_TEST'],
      allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' },
    },
  };
  const bytes = Buffer.from(JSON.stringify({
    schema: 'caravan.carrier-source.v1', sourceRecordId: 'private-carrier-record', legalName: 'Private Example Carrier',
    registrationNumber: 'PRIVATE-REGISTRATION-007', operatingSite: null,
    validTime: { state: 'UNOBSERVED', from: null, to: null },
  }));
  const acquisition = new LocalEvidenceIntake(root).capture(manifest, bytes, '2000-01-01T09:00:00Z').acquisition;
  const normalization = new LocalNormalizationStore(root).normalize({
    schema: 'payload.local-normalization-request.v1', normalizationId: 'process-carrier-normalization',
    acquisitionId: manifest.acquisitionId, purpose: manifest.purpose,
    profile: { id: 'process-carrier-profile', version: '1.0.0', sourceRegistrationId: manifest.sourceRegistration.registrationId,
      sourceId: manifest.sourceRegistration.sourceId, adapterId: 'caravan.carrier-json/v1' },
  }, '2000-01-01T10:00:00Z').run;
  const build = new LocalCandidateBuildStore(root).build({
    schema: 'payload.local-candidate-build-request.v1', buildId: 'process-carrier-build', purpose: manifest.purpose,
    knownThrough: '2000-01-01T10:00:00Z',
    definition: { id: 'process-carrier-definition', version: '1.0.0', domain: 'CARAVAN', recordType: 'Carrier', sourceClasses: ['OPERATOR_DECLARATION'] },
    normalizationIds: [normalization.request.manifest.normalizationId],
  }, '2000-01-01T11:00:00Z').build;
  return { acquisition, build, bytes };
}

function successfulProcess(result: ProcessResult) {
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}

function privateDataAbsent(value: string, root: string) {
  expect(value).not.toContain('Private Example Carrier');
  expect(value).not.toContain('PRIVATE-REGISTRATION-007');
  expect(value).not.toContain(root);
  expect(value).not.toContain(JSON.stringify(root).slice(1, -1));
}

describe('candidate-build review worker over loopback HTTP', () => {
  it('registers, inspects exact local evidence and records RESULT, fresh readback, then ACK across process restarts', async () => {
    const bundle = bundleWorker();
    const root = join(temporary, 'evidence');
    const { build, bytes } = candidateFixture(root);
    const originalFiles = savedFiles(root);
    const board = await new LoopbackBoard().listen();
    const args = ['--once', '--root', root];
    expect(successfulProcess(await runWorker(bundle, board.url, args))).toMatchObject({ processed: 0, recovered: 0 });
    expect(board.state.participants.find((participant) => participant.id === WORKER)).toMatchObject({ status: 'LOCAL', scope: DEMO_SCOPE });
    const request = board.queue(build.buildId, build.digest);
    board.events = [];
    expect(successfulProcess(await runWorker(bundle, board.url, args))).toMatchObject({ processed: 1, recovered: 0 });
    expect(board.results()).toHaveLength(1);
    const result = board.results()[0];
    expect(result).toMatchObject({ authorId: WORKER, recipientId: request.authorId, topic: TOPIC,
      kind: 'RESULT', replyTo: request.id, context: null, scope: DEMO_SCOPE });
    const report = JSON.parse(result.body) as CandidateBuildReview;
    expect(report).toMatchObject({
      schema: 'payload.candidate-build-review.v1', requestDigest: localRecordDigest(request),
      requestedBuild: { id: build.buildId, digest: build.digest }, assessment: 'RECOMPUTED_LOCAL', error: null,
      summary: { buildId: build.buildId, digest: build.digest, recordsRoot: build.recordsRoot, recordCount: 1,
        knownThrough: build.knownThrough, builtAt: build.builtAt, state: 'UNADMITTED' },
      canonicalAdmission: false, releaseActivated: false, independentlyVerified: false, sourceTruthClaimed: false,
      rawBytesIncluded: false, candidateFieldsIncluded: false, sourceIdentifiersIncluded: false,
    });
    expect(report.summary).not.toHaveProperty('members');
    const post = board.events.indexOf('POST post');
    const ack = board.events.indexOf('POST acknowledge');
    expect(post).toBeGreaterThanOrEqual(0);
    expect(ack).toBeGreaterThan(post);
    expect(board.events.slice(post + 1, ack)).toContain('GET /api/coordination');
    expect(board.state.acknowledgements).toContainEqual(expect.objectContaining({ messageId: request.id, participantId: WORKER }));
    privateDataAbsent(result.body, root);
    expect(result.body).not.toContain(bytes.toString('base64'));
    expect(savedFiles(root)).toEqual(originalFiles);
    const completed = structuredClone(board.state);
    expect(successfulProcess(await runWorker(bundle, board.url, args))).toMatchObject({ processed: 0, recovered: 0 });
    expect(board.state).toEqual(completed);
    expect(savedFiles(root)).toEqual(originalFiles);
  });

  it('recovers a saved result after ACK failure without replacing it after corruption, and redacts a fresh failed inspection', async () => {
    const bundle = bundleWorker();
    const root = join(temporary, 'evidence');
    const { acquisition, build } = candidateFixture(root);
    const board = await new LoopbackBoard().listen();
    const args = ['--root', root];
    successfulProcess(await runWorker(bundle, board.url, args));
    const request = board.queue(build.buildId, build.digest);
    board.failNextAcknowledgement = true;
    const failedAck = await runWorker(bundle, board.url, args);
    expect(failedAck.code).toBe(1);
    expect(board.results()).toHaveLength(1);
    expect(board.state.acknowledgements.some((ack) => ack.messageId === request.id)).toBe(false);
    const originalResult = structuredClone(board.results()[0]);
    const objectPath = join(root, 'objects', ...acquisition.capture.evidence.storageKey.split('/'));
    writeFileSync(objectPath, 'Intentionally corrupt private source bytes.');
    const corruptedFiles = savedFiles(root);
    expect(successfulProcess(await runWorker(bundle, board.url, args))).toMatchObject({ processed: 0, recovered: 1 });
    expect(board.results()).toEqual([originalResult]);
    expect(board.state.acknowledgements).toContainEqual(expect.objectContaining({ messageId: request.id, participantId: WORKER }));
    expect(savedFiles(root)).toEqual(corruptedFiles);

    const freshRequest = board.queue(build.buildId, build.digest);
    expect(successfulProcess(await runWorker(bundle, board.url, args))).toMatchObject({ processed: 1, recovered: 0 });
    expect(board.results()).toHaveLength(2);
    const refusal = board.results()[1];
    expect(refusal.replyTo).toBe(freshRequest.id);
    expect(refusal.body).not.toBe(originalResult.body);
    expect(JSON.parse(refusal.body)).toMatchObject({
      schema: 'payload.candidate-build-review.v1', requestDigest: localRecordDigest(freshRequest),
      requestedBuild: { id: build.buildId, digest: build.digest }, assessment: 'UNAVAILABLE', error: 'BUILD_INSPECTION_FAILED', summary: null,
      canonicalAdmission: false, releaseActivated: false, independentlyVerified: false, sourceTruthClaimed: false,
      rawBytesIncluded: false, candidateFieldsIncluded: false, sourceIdentifiersIncluded: false,
    });
    privateDataAbsent(refusal.body, root);
    expect(refusal.body).not.toContain('Intentionally corrupt private source bytes.');
    expect(board.state.acknowledgements).toContainEqual(expect.objectContaining({ messageId: freshRequest.id, participantId: WORKER }));
    expect(savedFiles(root)).toEqual(corruptedFiles);
  });

  it('rejects URL paths and queries before contacting the board or creating a local evidence store', async () => {
    const bundle = bundleWorker();
    const root = join(temporary, 'unused-root');
    const board = await new LoopbackBoard().listen();
    const stateBefore = structuredClone(board.state);
    for (const url of [`${board.url}/api/coordination`, `${board.url}/?token=not-permitted`]) {
      const result = await runWorker(bundle, url, ['--once', '--root', root]);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr.length).toBeGreaterThan(0);
    }
    expect(board.events).toEqual([]);
    expect(board.state).toEqual(stateBefore);
    expect(readdirSync(temporary)).toEqual(['candidate-build-review.mjs']);
  });
});
