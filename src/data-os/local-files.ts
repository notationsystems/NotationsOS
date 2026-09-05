import { randomUUID } from 'node:crypto';
import {
  closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code;
}

function validate(root: string, segments: readonly string[], maxBytes: number): string {
  if (typeof root !== 'string' || !root.trim()) throw new TypeError('An explicit storage root is required.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer.');
  if (!Array.isArray(segments) || !segments.length || segments.some((segment) => (
    typeof segment !== 'string' || segment.length < 1 || segment.length > 255 ||
    !/^[A-Za-z0-9._-]+$/.test(segment) || segment === '.' || segment === '..' || segment.endsWith('.') ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
  ))) throw new TypeError('Storage paths require safe, individual file-name segments.');
  return resolve(root);
}

function directory(path: string, create: boolean): boolean {
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    if (!create) return false;
    // The configured root may have missing ancestors. Descendants are checked
    // one at a time below before any deeper path is used.
    mkdirSync(path, { recursive: true });
    stat = lstatSync(path);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Storage directories must be regular directories, never symbolic links.');
  return true;
}

function parentDirectory(root: string, segments: readonly string[], create: boolean): string | undefined {
  if (!directory(root, create)) return undefined;
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment);
    if (!directory(parent, create)) return undefined;
  }
  return parent;
}

/** Read without creating directories. This assumes a trusted local filesystem. */
export function readImmutableFile(root: string, segments: readonly string[], maxBytes: number): Buffer | undefined {
  const selectedRoot = validate(root, segments, maxBytes);
  const parent = parentDirectory(selectedRoot, segments, false);
  if (!parent) return undefined;
  const target = join(parent, segments[segments.length - 1]);
  let stat;
  try { stat = lstatSync(target); }
  catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Stored content must be a regular file, never a symbolic link.');
  const file = openSync(target, 'r');
  try {
    const opened = fstatSync(file);
    if (!opened.isFile() || opened.size > maxBytes) throw new Error('Stored content exceeds the byte limit or is not a regular file.');
    // One extra byte detects a growing file without allowing an unbounded read.
    const bytes = Buffer.alloc(opened.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(file, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    if (offset !== opened.size || fstatSync(file).size !== opened.size) throw new Error('Stored content changed during the read.');
    return bytes.subarray(0, offset);
  } finally { closeSync(file); }
}

/**
 * Publish one complete file using an atomic, create-only hard link. A temporary
 * file is flushed before it becomes visible at the final name. This provides
 * local process-crash recovery, not physical WORM or a power-loss guarantee.
 */
export function publishImmutableFile(
  root: string, segments: readonly string[], bytes: Uint8Array, maxBytes: number,
): 'CREATED' | 'EXISTING' {
  const selectedRoot = validate(root, segments, maxBytes);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) throw new TypeError('Content must be bytes within the configured limit.');
  const content = Buffer.from(bytes);
  const existing = readImmutableFile(selectedRoot, segments, maxBytes);
  if (existing !== undefined) {
    if (!existing.equals(content)) throw new Error('Immutable content conflicts with the existing file; it was not changed.');
    return 'EXISTING';
  }
  const parent = parentDirectory(selectedRoot, segments, true)!;
  const target = join(parent, segments[segments.length - 1]);
  const temporary = join(parent, `.payload-${randomUUID()}.tmp`);
  let file: number | undefined;
  let ownsTemporary = false;
  try {
    file = openSync(temporary, 'wx', 0o600);
    ownsTemporary = true;
    writeFileSync(file, content);
    fsyncSync(file);
    closeSync(file);
    file = undefined;
    try { linkSync(temporary, target); }
    catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      const concurrent = readImmutableFile(selectedRoot, segments, maxBytes);
      if (concurrent === undefined || !concurrent.equals(content)) {
        throw new Error('Immutable content conflicts with a concurrent publication; it was not changed.');
      }
      return 'EXISTING';
    }
    return 'CREATED';
  } finally {
    try { if (file !== undefined) closeSync(file); }
    finally {
      if (ownsTemporary) {
        try { unlinkSync(temporary); }
        catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
      }
    }
  }
}
