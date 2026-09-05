import { mkdtemp, readFile, writeFile, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalRepository } from './store';
import type { CoordinationCommand } from './types';

const command = (requestId: string): CoordinationCommand => ({ operation: 'post', message: { requestId, authorId: 'apparatus.coordination', recipientId: 'agent.identity', kind: 'REQUEST', topic: 'assembly', title: 'Inspect mappings', body: 'Report the missing identity evidence.', context: null, replyTo: null } });
const directories: string[] = [];
async function repository() { const directory = await mkdtemp(join(tmpdir(), 'payload-coordination-test-')); directories.push(directory); return { directory, store: createLocalRepository(directory) }; }
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

describe('local coordination log', () => {
  it('persists append-only messages and acknowledgements across repository instances', async () => {
    const { directory, store } = await repository();
    const written = await store.execute(command('write-1'));
    const message = written.messages.at(-1)!;
    const restarted = createLocalRepository(directory);
    expect(await restarted.read()).toEqual(written);
    await restarted.execute({ operation: 'acknowledge', messageId: message.id, participantId: 'agent.identity' });
    const read = await store.read();
    expect(read.messages).toEqual(written.messages);
    expect(read.acknowledgements).toEqual([expect.objectContaining({ participantId: 'agent.identity', messageId: message.id })]);
  });

  it('does not append a duplicate retry and keeps the earlier timestamp', async () => {
    const { directory, store } = await repository();
    const first = await store.execute(command('retry-1'));
    expect(await createLocalRepository(directory).execute(command('retry-1'))).toEqual(first);
    expect(JSON.parse(await readFile(join(directory, 'events.json'), 'utf8')).commands).toHaveLength(1);
  });

  it('refuses a competing writer and allows the same command after the lock is released', async () => {
    const { directory, store } = await repository();
    const lock = await open(join(directory, 'writer.lock'), 'wx');
    try { await expect(store.execute(command('locked'))).rejects.toMatchObject({ code: 'BOARD_BUSY', status: 503 }); }
    finally { await lock.close(); await rm(join(directory, 'writer.lock')); }
    expect((await store.execute(command('locked'))).messages.at(-1)?.requestId).toBe('locked');
  });

  it('preserves corrupt history and fails closed on read or write', async () => {
    const { directory, store } = await repository();
    await writeFile(join(directory, 'events.json'), '{broken');
    await expect(store.read()).rejects.toMatchObject({ code: 'INVALID_LOCAL_LOG' });
    await expect(store.execute(command('bad-log'))).rejects.toMatchObject({ code: 'INVALID_LOCAL_LOG' });
    expect(await readFile(join(directory, 'events.json'), 'utf8')).toBe('{broken');
  });

  it('an invalid command does not change the saved history or retain the writer lock', async () => {
    const { directory, store } = await repository();
    await store.execute(command('good'));
    const before = await readFile(join(directory, 'events.json'), 'utf8');
    await expect(store.execute({ operation: 'launch' })).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(await readFile(join(directory, 'events.json'), 'utf8')).toBe(before);
    await expect(store.execute(command('good-2'))).resolves.toBeDefined();
  });

  it('refuses to replay against a different seed rather than reassigning message ids', async () => {
    const { directory, store } = await repository();
    await store.execute(command('seed-bound'));
    const log = JSON.parse(await readFile(join(directory, 'events.json'), 'utf8'));
    log.seedDigest = 'incompatible-seed';
    await writeFile(join(directory, 'events.json'), JSON.stringify(log));
    await expect(createLocalRepository(directory).read()).rejects.toMatchObject({ code: 'INVALID_LOCAL_LOG' });
  });
});
