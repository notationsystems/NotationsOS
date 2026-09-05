import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localRecordDigest } from '../data-os/local-record';
import { StateKernelError } from './errors';
import { createNotationRepository, disabledKernelSnapshot, parseStateKernelRequest, stateKernelEnabled } from './store';
import { evaluateKernel } from './runtime';
import { emptyNotationState, notationCapacity, type KernelCommand, type StateKernelRequest } from './types';

let temporary: string;
beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'notations-state-repository-')); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(temporary, { recursive: true, force: true }); });

const create = (id = 'notation-a', commandId = 'create-a'): KernelCommand => ({ commandId,
  kind: 'CREATE_NOTATION', notation: { id, title: 'Original title', body: 'Original body' } });
const update = (commandId = 'update-a'): KernelCommand => ({ commandId,
  kind: 'UPDATE_NOTATION', notationId: 'notation-a', title: 'Updated title', body: 'Updated body' });
const undo = (commandId = 'undo-a'): KernelCommand => ({ commandId, kind: 'UNDO' });
const redo = (commandId = 'redo-a'): KernelCommand => ({ commandId, kind: 'REDO' });
const request = (baseVersion: number, commands: KernelCommand[]): StateKernelRequest => ({
  schema: 'payload.notation-command-batch.v1', baseVersion, commands,
});

function files(root: string): Record<string, Buffer> {
  if (!existsSync(root)) return {};
  return Object.fromEntries(readdirSync(root).sort().map((name) => [name, readFileSync(join(root, name))]));
}

function rehash(value: Record<string, unknown>) {
  value.digest = localRecordDigest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'digest')), 8 * 1024 * 1024);
}

describe('local notation repository using the real Rust kernel', () => {
  it('reads an empty workspace and previews create/update/undo without creating persistence', async () => {
    const root = join(temporary, 'workspace');
    const store = createNotationRepository(root);
    const empty = await store.read();
    expect(empty).toEqual({ schema: 'payload.local-notation-workspace.v1', mode: 'LOCAL_DEVELOPMENT', enabled: true,
      savedVersion: 0, savedDigest: null, state: emptyNotationState(), capacity: notationCapacity(0, 0), persistence: 'LOCAL_VERSIONED_FILES', canonicalAdmission: false });
    const input = request(0, [create(), update(), undo()]);
    const inputBefore = structuredClone(input);
    const preview = await store.preview(input);
    expect(preview).toMatchObject({ savedVersion: 0, savedDigest: null,
      capacity: { usedCommands: 3, remainingCommands: 253, usedSavedVersions: 0, remainingSavedVersions: 64 },
      state: { revision: 3, notations: [{ id: 'notation-a', title: 'Original title', body: 'Original body' }],
        relations: [], canUndo: true, canRedo: true } });
    expect(input).toEqual(inputBefore);
    expect(await store.read()).toEqual(empty);
    expect(existsSync(root)).toBe(false);
  });

  it('saves the undone state, reloads it with redo history, and preserves exact retry results across repository instances', async () => {
    const root = join(temporary, 'workspace');
    const input = request(0, [create(), update(), undo()]);
    const saved = await createNotationRepository(root).save(input);
    expect(saved).toMatchObject({ savedVersion: 1, savedDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      state: { revision: 3, notations: [{ id: 'notation-a', title: 'Original title', body: 'Original body' }], canRedo: true } });
    expect(readdirSync(root)).toEqual(['000001.json']);
    const original = files(root);
    expect(await createNotationRepository(root).read()).toEqual(saved);
    expect(await createNotationRepository(root).save(input)).toEqual(saved);
    expect(files(root)).toEqual(original);

    const redone = await createNotationRepository(root).save(request(1, [redo()]));
    expect(redone).toMatchObject({ savedVersion: 2, state: { revision: 4,
      notations: [{ id: 'notation-a', title: 'Updated title', body: 'Updated body' }], canUndo: true, canRedo: false } });
    expect(await createNotationRepository(root).read()).toEqual(redone);
    expect(readFileSync(join(root, '000001.json'))).toEqual(original['000001.json']);
    const second = JSON.parse(readFileSync(join(root, '000002.json'), 'utf8'));
    expect(second.previousDigest).toBe(saved.savedDigest);
    const undoneAgain = await createNotationRepository(root).preview(request(2, [undo('undo-again')]));
    expect(undoneAgain.state.notations[0]).toEqual({ id: 'notation-a', title: 'Original title', body: 'Original body' });
    expect((await createNotationRepository(root).read()).state).toEqual(redone.state);
    expect(readdirSync(root)).toEqual(['000001.json', '000002.json']);
  });

  it('persists explicit relations through undo/redo while retaining independent notation IDs', async () => {
    const root = join(temporary, 'workspace');
    const relation: KernelCommand = { commandId: 'relation-a-b', kind: 'CREATE_RELATION',
      relation: { id: 'relation-1', from: 'notation-a', to: 'notation-b', label: 'depends on' } };
    const saved = await createNotationRepository(root).save(request(0, [create(), create('notation-b', 'create-b'), relation, undo(), redo()]));
    expect(saved.state.notations.map((notation) => notation.id)).toEqual(['notation-a', 'notation-b']);
    expect(saved.state.relations).toEqual([{ id: 'relation-1', from: 'notation-a', to: 'notation-b', label: 'depends on' }]);
    expect(await createNotationRepository(root).read()).toEqual(saved);
  });

  it('preserves reserved identities across a saved undo and discarded redo branch', async () => {
    const root = join(temporary, 'workspace');
    await createNotationRepository(root).save(request(0, [create(), undo()]));
    const branch = await createNotationRepository(root).save(request(1, [create('notation-b', 'create-b')]));
    expect(branch.state).toMatchObject({ revision: 3, canUndo: true, canRedo: false,
      notations: [{ id: 'notation-b', title: 'Original title', body: 'Original body' }] });
    const original = files(root);
    await expect(createNotationRepository(root).save(request(2, [redo()]))).rejects.toMatchObject({ code: 'NOTHING_TO_REDO' });
    await expect(createNotationRepository(root).save(request(2, [create('notation-a', 'reuse-a')]))).rejects.toMatchObject({ code: 'ID_ALREADY_USED' });
    await expect(createNotationRepository(root).save(request(2, [undo('create-a')]))).rejects.toMatchObject({ code: 'DUPLICATE_COMMAND_ID' });
    expect(files(root)).toEqual(original);
    expect(await createNotationRepository(root).read()).toEqual(branch);
  });

  it('counts the 256-command limit across saved batches including undo and redo without overwriting history', async () => {
    const root = join(temporary, 'workspace');
    const commands = [create(), ...Array.from({ length: 254 }, (_, index) => (
      index % 2 === 0 ? undo(`undo-${index}`) : redo(`redo-${index}`)
    ))];
    const first = await createNotationRepository(root).save(request(0, commands));
    expect(first.state.revision).toBe(255);
    expect(first.capacity).toEqual(notationCapacity(255, 1));
    const finalBatch = request(1, [undo('last-undo')]);
    const lastPreview = await createNotationRepository(root).preview(finalBatch);
    expect(lastPreview.capacity).toEqual(notationCapacity(256, 1));
    // A preview that uses the final command must still be saveable.
    const full = await createNotationRepository(root).save(finalBatch);
    expect(full.state).toMatchObject({ revision: 256, notations: [], canUndo: false, canRedo: true });
    expect(full.capacity).toEqual(notationCapacity(256, 2));
    const original = files(root);
    await expect(createNotationRepository(root).preview(request(2, [redo('too-many')]))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(createNotationRepository(root).save(request(2, [redo('too-many')]))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(files(root)).toEqual(original);
    expect(await createNotationRepository(root).read()).toEqual(full);
    expect(await createNotationRepository(root).save(finalBatch)).toEqual(full);
  });

  it('makes the last version saveable, then refuses previews and saves while preserving reads and exact retries', async () => {
    // Build a valid near-capacity fixture with real Rust states. Setup is not a save benchmark.
    const root = temporary;
    const commands: KernelCommand[] = [];
    let previousDigest: string | null = null;
    for (let version = 1; version <= 63; version += 1) {
      const command: KernelCommand = version === 1 ? create() : {
        commandId: `update-${version}`, kind: 'UPDATE_NOTATION', notationId: 'notation-a', title: `Version ${version}`, body: 'Retained history',
      };
      commands.push(command);
      const payload = { schema: 'payload.notation-saved-version.v1', version, previousDigest,
        request: request(version - 1, [command]), state: await evaluateKernel(commands) };
      const digest = localRecordDigest(payload, 8 * 1024 * 1024);
      writeFileSync(join(root, `${String(version).padStart(6, '0')}.json`), JSON.stringify({ ...payload, digest }), { flag: 'wx' });
      previousDigest = digest;
    }
    const store = createNotationRepository(root);
    const finalBatch = request(63, [update('final-update')]);
    expect((await store.preview(finalBatch)).capacity).toEqual(notationCapacity(64, 63));
    const full = await store.save(finalBatch);
    expect(full.capacity).toEqual(notationCapacity(64, 64));
    const original = files(root);
    await expect(store.preview(request(64, [undo()]))).rejects.toMatchObject({ code: 'CAPACITY', status: 409 });
    await expect(store.save(request(64, [undo()]))).rejects.toMatchObject({ code: 'CAPACITY', status: 409 });
    expect(await store.save(finalBatch)).toEqual(full);
    expect(await store.read()).toEqual(full);
    expect(files(root)).toEqual(original);
    expect(existsSync(join(root, 'writer.lock'))).toBe(false);
  }, 60_000);

  it('rejects stale versions without changing saved history or retaining a writer lock', async () => {
    const root = join(temporary, 'workspace');
    const store = createNotationRepository(root);
    await store.save(request(0, [create()]));
    const original = files(root);
    await expect(store.preview(request(0, [update()]))).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
    await expect(store.save(request(0, [update()]))).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
    expect(files(root)).toEqual(original);
    expect(existsSync(join(root, 'writer.lock'))).toBe(false);
  });

  it('handles concurrent identical batches safely and makes retries idempotent', async () => {
    const root = join(temporary, 'workspace');
    const input = request(0, [create()]);
    const results = await Promise.allSettled([createNotationRepository(root).save(input), createNotationRepository(root).save(input)]);
    const winners = results.filter((result) => result.status === 'fulfilled');
    expect(winners.length).toBeGreaterThanOrEqual(1);
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'STATE_BUSY' });
      else expect(result.value).toEqual((winners[0] as PromiseFulfilledResult<typeof result.value>).value);
    }
    const saved = await createNotationRepository(root).read();
    expect(saved.savedVersion).toBe(1);
    expect(await createNotationRepository(root).save(input)).toEqual(saved);
    expect(readdirSync(root)).toEqual(['000001.json']);
  });

  it('does not merge or overwrite competing batches based on the same saved version', async () => {
    const root = join(temporary, 'workspace');
    const batches = [request(0, [create()]), request(0, [create('notation-b', 'create-b')])];
    const results = await Promise.allSettled(batches.map((batch) => createNotationRepository(root).save(batch)));
    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(['STATE_BUSY', 'VERSION_CONFLICT']).toContain(rejected.reason.code);
    const original = files(root);
    const losingBatch = batches[winnerIndex === 0 ? 1 : 0];
    await expect(createNotationRepository(root).save(losingBatch)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(files(root)).toEqual(original);
    expect(readdirSync(root)).toEqual(['000001.json']);
    expect((await createNotationRepository(root).read()).state.notations).toHaveLength(1);
  });

  it('refuses an explicit competing writer lock without removing it', async () => {
    const root = join(temporary, 'workspace');
    const store = createNotationRepository(root);
    await store.save(request(0, [create()]));
    const lock = openSync(join(root, 'writer.lock'), 'wx');
    try {
      const prior = readFileSync(join(root, '000001.json'));
      await expect(store.save(request(1, [update()]))).rejects.toMatchObject({ code: 'STATE_BUSY', status: 503 });
      expect(existsSync(join(root, 'writer.lock'))).toBe(true);
      expect(readFileSync(join(root, '000001.json'))).toEqual(prior);
    } finally { closeSync(lock); rmSync(join(root, 'writer.lock')); }
    expect((await store.save(request(1, [update()]))).savedVersion).toBe(2);
  });

  it.each(['INVALID_JSON', 'STATE_TAMPER', 'COMMAND_TAMPER', 'CHAIN_TAMPER'] as const)('refuses %s even when altered content is rehashed, preserving all saved bytes', async (variant) => {
    const root = join(temporary, 'workspace');
    const store = createNotationRepository(root);
    await store.save(request(0, [create()]));
    const path = join(root, '000001.json');
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (variant === 'STATE_TAMPER') record.state.notations[0].title = 'Tampered snapshot title';
    if (variant === 'COMMAND_TAMPER') record.request.commands[0].notation.title = 'Tampered command title';
    if (variant === 'CHAIN_TAMPER') record.previousDigest = `sha256:${'a'.repeat(64)}`;
    rehash(record);
    writeFileSync(path, variant === 'INVALID_JSON' ? '{broken' : JSON.stringify(record));
    const damaged = files(root);
    await expect(createNotationRepository(root).read()).rejects.toMatchObject({ code: 'INVALID_SAVED_STATE', status: 503 });
    await expect(store.preview(request(1, [update()]))).rejects.toMatchObject({ code: 'INVALID_SAVED_STATE' });
    await expect(store.save(request(1, [update()]))).rejects.toMatchObject({ code: 'INVALID_SAVED_STATE' });
    expect(files(root)).toEqual(damaged);
    expect(existsSync(join(root, 'writer.lock'))).toBe(false);
  });

  it('refuses a missing earlier version instead of loading a later snapshot alone', async () => {
    const root = join(temporary, 'workspace');
    const store = createNotationRepository(root);
    await store.save(request(0, [create()]));
    await store.save(request(1, [update()]));
    rmSync(join(root, '000001.json'));
    const remaining = files(root);
    await expect(store.read()).rejects.toMatchObject({ code: 'INVALID_SAVED_STATE' });
    await expect(store.save(request(0, [create('another', 'create-another')]))).rejects.toMatchObject({ code: 'INVALID_SAVED_STATE' });
    expect(files(root)).toEqual(remaining);
  });

  it.each(['1.json', '000000.json', '000001.json.bak', 'unexpected.json'])('rejects the unexpected saved-state entry %s without deleting it', async (name) => {
    const root = join(temporary, 'workspace');
    await createNotationRepository(root).save(request(0, [create()]));
    writeFileSync(join(root, name), 'preserve this unexpected local file');
    const original = files(root);
    await expect(createNotationRepository(root).read()).rejects.toMatchObject({ code: 'INVALID_SAVED_STATE' });
    await expect(createNotationRepository(root).save(request(1, [update()]))).rejects.toMatchObject({ code: 'INVALID_SAVED_STATE' });
    expect(files(root)).toEqual(original);
  });

  it('ignores an abandoned owned publication temporary file without modifying or treating it as a version', async () => {
    const root = join(temporary, 'workspace');
    const saved = await createNotationRepository(root).save(request(0, [create()]));
    const temporaryName = '.payload-00000000-0000-0000-0000-000000000000.tmp';
    writeFileSync(join(root, temporaryName), 'incomplete publication');
    const original = files(root);
    expect(await createNotationRepository(root).read()).toEqual(saved);
    expect(await createNotationRepository(root).save(request(0, [create()]))).toEqual(saved);
    expect(files(root)).toEqual(original);
  });

  it('fails safely when the fixed native executable is unavailable, without creating a new store or rewriting saved history', async () => {
    const root = join(temporary, 'saved');
    await createNotationRepository(root).save(request(0, [create()]));
    const original = files(root);
    vi.spyOn(process, 'cwd').mockReturnValue(temporary);
    await expect(createNotationRepository(root).read()).rejects.toMatchObject({ code: 'KERNEL_UNAVAILABLE', status: 503 });
    const missing = join(temporary, 'not-created');
    await expect(createNotationRepository(missing).preview(request(0, [create()]))).rejects.toMatchObject({ code: 'KERNEL_UNAVAILABLE' });
    await expect(createNotationRepository(missing).save(request(0, [create()]))).rejects.toMatchObject({ code: 'KERNEL_UNAVAILABLE' });
    expect(existsSync(missing)).toBe(false);
    expect(files(root)).toEqual(original);
  });

  it('refuses invalid batches and native-invalid commands before creating a directory', async () => {
    const root = join(temporary, 'not-created');
    const store = createNotationRepository(root);
    const invalidInputs: unknown[] = [null, { ...request(0, [create()]), state: emptyNotationState() }, request(-1, [create()]),
      request(65, [create()]), request(0.5, [create()]), request(0, []), request(0, Array.from({ length: 257 }, (_, index) => create(`n-${index}`, `c-${index}`))),
      request(0, [{ commandId: 'unsupported', kind: 'PROMOTE_CANONICAL' } as unknown as KernelCommand]),
      request(0, [update()]), request(0, [create(), create()])];
    for (const input of invalidInputs) {
      await expect(store.preview(input)).rejects.toBeInstanceOf(StateKernelError);
      await expect(store.save(input)).rejects.toBeInstanceOf(StateKernelError);
      expect(existsSync(root)).toBe(false);
    }
  });
});

it('bounds and clones requests without accepting a replacement state or implicit authority', () => {
  const input = request(0, [create()]);
  const parsed = parseStateKernelRequest(input);
  parsed.commands.push(update());
  expect(input.commands).toHaveLength(1);
  expect(() => parseStateKernelRequest({ ...input, canonicalAdmission: true })).toThrow(StateKernelError);
  expect(() => parseStateKernelRequest(request(0, [{ ...create(), extra: 'x'.repeat(2 * 1024 * 1024) } as unknown as KernelCommand]))).toThrow(StateKernelError);
});

it('is disabled by default and only enables the explicit local mode', () => {
  vi.stubEnv('PAYLOAD_STATE_KERNEL_LOCAL', '');
  expect(stateKernelEnabled()).toBe(false);
  vi.stubEnv('PAYLOAD_STATE_KERNEL_LOCAL', 'true');
  expect(stateKernelEnabled()).toBe(false);
  vi.stubEnv('PAYLOAD_STATE_KERNEL_LOCAL', '1');
  expect(stateKernelEnabled()).toBe(true);
  expect(disabledKernelSnapshot()).toMatchObject({ enabled: false, persistence: 'DISABLED', savedVersion: 0,
    savedDigest: null, state: emptyNotationState(), canonicalAdmission: false });
});
