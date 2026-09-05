import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { applyCommand, connectionsFor, CoordinationError, scopeState } from './ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from './seed';
import type { CoordinationSnapshot, CoordinationState } from './types';

interface LocalLog { schema: 'payload.coordination-log.v1'; seedDigest: string; commands: Array<{ at: string; command: unknown }> }
const MAX_LOG_BYTES = 16 * 1024 * 1024;

function hasCode(error: unknown, code: string) { return !!error && typeof error === 'object' && 'code' in error && error.code === code; }

/** A bounded local development log. Exclusive writer lock + atomic rename; no distributed-store claim. */
export function createLocalRepository(directory: string) {
  const file = join(directory, 'events.json');
  const lockPath = join(directory, 'writer.lock');
  // Pin replay to this exact seed so later fixture edits cannot silently reassign message ids.
  const seedDigest = createHash('sha256').update(JSON.stringify(createSeed())).digest('hex');

  async function load(): Promise<{ log: LocalLog; state: CoordinationState }> {
    let content: string;
    try { content = await readFile(file, 'utf8'); }
    catch (error) { if (hasCode(error, 'ENOENT')) return { log: { schema: 'payload.coordination-log.v1', seedDigest, commands: [] }, state: createSeed() }; throw error; }
    try {
      if (Buffer.byteLength(content) > MAX_LOG_BYTES) throw new Error('Log exceeds its size limit.');
      const log = JSON.parse(content) as LocalLog;
      if (!log || log.schema !== 'payload.coordination-log.v1' || log.seedDigest !== seedDigest || !Array.isArray(log.commands) || log.commands.length > 15000 || Object.keys(log).sort().join(',') !== 'commands,schema,seedDigest') throw new Error('Invalid log shape or incompatible seed.');
      let state = createSeed();
      for (const entry of log.commands) {
        if (!entry || typeof entry.at !== 'string' || Object.keys(entry).sort().join(',') !== 'at,command') throw new Error('Invalid event.');
        state = applyCommand(state, DEMO_SCOPE, entry.command, RELEASE_CONTEXTS, entry.at);
      }
      return { log, state };
    } catch { throw new CoordinationError('INVALID_LOCAL_LOG', 'The local coordination log cannot be replayed. Preserve the file and inspect it before continuing.', 503); }
  }

  return {
    async read() { return (await load()).state; },
    async execute(command: unknown) {
      await mkdir(directory, { recursive: true });
      let lock;
      try { lock = await open(lockPath, 'wx'); }
      catch (error) { if (hasCode(error, 'EEXIST')) throw new CoordinationError('BOARD_BUSY', 'Another writer holds the local board lock. Retry with the same request id.', 503); throw error; }
      const temporary = join(directory, `events-${randomUUID()}.tmp`);
      try {
        const { log, state } = await load();
        const at = new Date().toISOString();
        const next = applyCommand(state, DEMO_SCOPE, command, RELEASE_CONTEXTS, at);
        if (JSON.stringify(next) === JSON.stringify(state)) return next;
        if (log.commands.length >= 15000) throw new CoordinationError('CAPACITY', 'The local coordination log has reached its event limit.', 409);
        log.commands.push({ at, command });
        const serialized = JSON.stringify(log);
        if (Buffer.byteLength(serialized) > MAX_LOG_BYTES) throw new CoordinationError('CAPACITY', 'The local coordination log has reached its size limit.', 409);
        const output = await open(temporary, 'wx');
        try { await output.writeFile(serialized, 'utf8'); await output.sync(); } finally { await output.close(); }
        await rename(temporary, file);
        return next;
      } finally {
        // Only our exact temporary file and lock are removed; the event history remains intact.
        try { await unlink(temporary); } catch (error) { if (!hasCode(error, 'ENOENT')) throw error; }
        finally { await lock.close(); await unlink(lockPath); }
      }
    },
  };
}

export function localCoordinationEnabled() { return process.env.PAYLOAD_COORDINATION_LOCAL === '1'; }

function repository() { return createLocalRepository(join(process.cwd(), '.payload', 'coordination')); }

function snapshot(state: CoordinationState, local: boolean): CoordinationSnapshot {
  return { ...scopeState(state, DEMO_SCOPE), fixture_only: true, scope: DEMO_SCOPE, mode: local ? 'LOCAL_SANDBOX' : 'FIXTURE', persistence: local ? 'LOCAL_FILE' : 'NONE', canWrite: local, connections: connectionsFor(state, DEMO_SCOPE), releaseContexts: structuredClone(RELEASE_CONTEXTS) };
}

export async function getCoordinationSnapshot(): Promise<CoordinationSnapshot> {
  const local = localCoordinationEnabled();
  return snapshot(local ? await repository().read() : createSeed(), local);
}

export async function executeCoordinationCommand(command: unknown): Promise<CoordinationSnapshot> {
  if (!localCoordinationEnabled()) throw new CoordinationError('READ_ONLY', 'Start npm run dev:coordination to use the local board.', 403);
  return snapshot(await repository().execute(command), true);
}
