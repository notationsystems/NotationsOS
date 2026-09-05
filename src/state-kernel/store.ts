import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { StateKernelError } from './errors';
import { evaluateKernel, MAX_KERNEL_INPUT_BYTES } from './runtime';
import { emptyNotationState, type KernelCommand, type NotationState, type StateKernelRequest, type StateKernelSnapshot } from './types';

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_VERSIONS = 64;
interface SavedVersion {
  schema: 'payload.notation-saved-version.v1';
  version: number;
  previousDigest: string | null;
  request: StateKernelRequest;
  state: NotationState;
  digest: string;
}
interface Loaded { version: number; digest: string | null; state: NotationState; commands: KernelCommand[]; lastRequest: StateKernelRequest | null }
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException)?.code;
const filename = (version: number) => `${String(version).padStart(6, '0')}.json`;
const hash = (value: unknown) => localRecordDigest(value, MAX_SNAPSHOT_BYTES);

export function parseStateKernelRequest(input: unknown): StateKernelRequest {
  try {
    const value = JSON.parse(encodeLocalRecord(input, MAX_KERNEL_INPUT_BYTES).toString('utf8'));
    exactFields(value, ['schema', 'baseVersion', 'commands']);
    if (value.schema !== 'payload.notation-command-batch.v1' || typeof value.baseVersion !== 'number' || !Number.isSafeInteger(value.baseVersion) || value.baseVersion < 0 ||
        value.baseVersion > MAX_VERSIONS || !Array.isArray(value.commands) || value.commands.length < 1 || value.commands.length > 256) throw new Error();
    return value as unknown as StateKernelRequest;
  } catch { throw new StateKernelError('INVALID_REQUEST', 'Send a bounded command batch with a saved base version, not a state replacement.'); }
}

function snapshot(loaded: Loaded, state = loaded.state): StateKernelSnapshot {
  return { schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: true,
    savedVersion: loaded.version, savedDigest: loaded.digest, state: structuredClone(state),
    persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false };
}

/** Authored local notation workspace. No corpus/evidence imports or cross-workspace storage paths. */
export function createNotationRepository(root: string) {
  async function load(): Promise<Loaded> {
    let entries: string[];
    try {
      const stat = lstatSync(root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
      const names = readdirSync(root);
      if (names.some((name) => name !== 'writer.lock' && !/^\d{6}\.json$/.test(name) && !/^\.payload-[a-f0-9-]+\.tmp$/.test(name))) throw new Error();
      // Unpublished temporary files can survive a killed process; they are never a saved version.
      entries = names.filter((name) => /^\d{6}\.json$/.test(name)).sort();
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { version: 0, digest: null, state: emptyNotationState(), commands: [], lastRequest: null };
      throw new StateKernelError('INVALID_SAVED_STATE', 'Preserve the local notation directory; it cannot be read safely.', 503);
    }
    try {
      if (entries.length > MAX_VERSIONS) throw new Error();
      let loaded: Loaded = { version: 0, digest: null, state: emptyNotationState(), commands: [], lastRequest: null };
      for (const name of entries) {
        const version = loaded.version + 1;
        if (name !== filename(version)) throw new Error();
        const bytes = readImmutableFile(root, [name], MAX_SNAPSHOT_BYTES);
        if (!bytes) throw new Error();
        const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        exactFields(record, ['schema', 'version', 'previousDigest', 'request', 'state', 'digest']);
        const { digest, ...payload } = record;
        if (record.schema !== 'payload.notation-saved-version.v1' || record.version !== version ||
            record.previousDigest !== loaded.digest || digest !== hash(payload)) throw new Error();
        const request = parseStateKernelRequest(record.request);
        if (request.baseVersion !== loaded.version) throw new Error();
        const commands = [...loaded.commands, ...request.commands];
        const state = await evaluateKernel(commands);
        if (localJson(state) !== localJson(record.state)) throw new Error();
        loaded = { version, digest, state, commands, lastRequest: request };
      }
      return loaded;
    } catch (error) {
      if (error instanceof StateKernelError && error.code === 'KERNEL_UNAVAILABLE') throw error;
      throw new StateKernelError('INVALID_SAVED_STATE', 'The saved notation history or snapshot did not validate. Files were preserved.', 503);
    }
  }
  function checkBase(loaded: Loaded, request: StateKernelRequest) {
    if (request.baseVersion !== loaded.version) throw new StateKernelError('VERSION_CONFLICT', 'Another save changed this workspace. Keep your draft, then reload deliberately before retrying.', 409);
  }
  return {
    async read() { return snapshot(await load()); },
    async preview(input: unknown) {
      const request = parseStateKernelRequest(input);
      const loaded = await load(); checkBase(loaded, request);
      return snapshot(loaded, await evaluateKernel([...loaded.commands, ...request.commands]));
    },
    async save(input: unknown) {
      const request = parseStateKernelRequest(input);
      // Invalid commands and incompatible base versions must not create the directory/lock.
      const first = await load();
      if (first.lastRequest && localJson(first.lastRequest) === localJson(request)) return snapshot(first);
      checkBase(first, request);
      await evaluateKernel([...first.commands, ...request.commands]);
      if (first.version >= MAX_VERSIONS) throw new StateKernelError('CAPACITY', 'This local workspace has reached 64 saved versions.', 409);
      mkdirSync(root, { recursive: true });
      const lockPath = join(root, 'writer.lock');
      let lock: number;
      try { lock = openSync(lockPath, 'wx', 0o600); }
      catch (error) {
        if (errorCode(error) === 'EEXIST') throw new StateKernelError('STATE_BUSY', 'Another writer holds the local state lock. Retry the identical batch; do not remove a live lock.', 503);
        throw error;
      }
      try {
        const loaded = await load();
        if (loaded.lastRequest && localJson(loaded.lastRequest) === localJson(request)) return snapshot(loaded);
        checkBase(loaded, request);
        const state = await evaluateKernel([...loaded.commands, ...request.commands]);
        const payload = { schema: 'payload.notation-saved-version.v1' as const, version: loaded.version + 1,
          previousDigest: loaded.digest, request, state };
        const record: SavedVersion = { ...payload, digest: hash(payload) };
        publishImmutableFile(root, [filename(record.version)], encodeLocalRecord(record, MAX_SNAPSHOT_BYTES), MAX_SNAPSHOT_BYTES);
        const verified = await load();
        if (verified.version !== record.version || verified.digest !== record.digest) throw new StateKernelError('SAVE_UNCONFIRMED', 'Save readback failed. Preserve history and retry the identical batch.', 503);
        return snapshot(verified);
      } finally { closeSync(lock); unlinkSync(lockPath); }
    },
  };
}

export const stateKernelEnabled = () => process.env.PAYLOAD_STATE_KERNEL_LOCAL === '1';
// The operator may isolate a test workspace; an HTTP command cannot choose storage paths.
export const notationRepository = () => createNotationRepository(process.env.PAYLOAD_NOTATION_STATE_DIR ?? join(process.cwd(), '.payload', 'notation-state'));
export function disabledKernelSnapshot(): StateKernelSnapshot {
  return { schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: false,
    savedVersion: 0, savedDigest: null, state: emptyNotationState(), persistence: 'DISABLED', canonicalAdmission: false };
}
