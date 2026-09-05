import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileContentAddressedStore, MAX_EVIDENCE_BYTES } from './file-object-store';
import { byteDigest } from './evidence-capture';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'payload-cas-test-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('file content-addressed evidence store', () => {
  it('preserves evidence across fresh instances and deduplicates bytes by their digest', () => {
    const bytes = Buffer.from('durable evidence');
    const first = new FileContentAddressedStore(root).put(bytes);
    expect(first).toEqual({ contentDigest: byteDigest(bytes), byteLength: bytes.length, storageKey: `sha256/${byteDigest(bytes).slice(7, 9)}/${byteDigest(bytes).slice(7)}` });
    const restarted = new FileContentAddressedStore(root);
    expect(restarted.get(first.contentDigest)).toEqual(bytes);
    expect(restarted.put(bytes)).toEqual(first);
    expect(readdirSync(join(root, ...first.storageKey.split('/').slice(0, -1)))).toEqual([first.contentDigest.slice(7)]);
  });

  it('does not create storage during construction or missing-object reads', () => {
    const missing = join(root, 'missing');
    const store = new FileContentAddressedStore(missing);
    expect(store.root).toBe(missing);
    expect(store.get(byteDigest(Buffer.from('absent')))).toBeUndefined();
    expect(existsSync(missing)).toBe(false);
  });

  it('copies caller bytes and verifies stored bytes again on every read', () => {
    const store = new FileContentAddressedStore(root);
    const original = Buffer.from('immutable');
    const descriptor = store.put(original);
    original.fill(0);
    const retrieved = store.get(descriptor.contentDigest)!;
    expect(Buffer.from(retrieved).toString()).toBe('immutable');
    retrieved.fill(0);
    expect(Buffer.from(store.get(descriptor.contentDigest)!).toString()).toBe('immutable');
  });

  it('refuses corrupt existing bytes without repairing or overwriting them', () => {
    const store = new FileContentAddressedStore(root);
    const bytes = Buffer.from('original');
    const descriptor = store.put(bytes);
    const target = join(root, ...descriptor.storageKey.split('/'));
    writeFileSync(target, 'corrupt');
    expect(() => store.get(descriptor.contentDigest)).toThrow(/digest check/);
    expect(() => store.put(bytes)).toThrow(/conflict/);
    expect(readFileSync(target, 'utf8')).toBe('corrupt');
  });

  it.each(['', '../escape', 'sha256:../../escape', `sha256:${'A'.repeat(64)}`, `sha256:${'a'.repeat(63)}`])('rejects malformed digest %j', (digest) => {
    expect(() => new FileContentAddressedStore(root).get(digest)).toThrow(/SHA-256/);
    expect(readdirSync(root)).toEqual([]);
  });

  it('accepts the 8 MiB boundary and rejects larger evidence before writing', () => {
    const store = new FileContentAddressedStore(root);
    const exact = Buffer.alloc(MAX_EVIDENCE_BYTES, 7);
    const descriptor = store.put(exact);
    expect(store.get(descriptor.contentDigest)?.byteLength).toBe(MAX_EVIDENCE_BYTES);
    expect(() => store.put(Buffer.alloc(MAX_EVIDENCE_BYTES + 1))).toThrow(/8 MiB/);
  });
});
