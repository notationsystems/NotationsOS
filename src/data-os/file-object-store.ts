import { resolve } from 'node:path';
import type { ContentAddressedStore, ContentAddressedWrite } from './contracts';
import { byteDigest, storageKeyFor } from './evidence-capture';
import { publishImmutableFile, readImmutableFile } from './local-files';

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

/** Local evidence bytes; canonical domain state remains owned by PostgreSQL. */
export class FileContentAddressedStore implements ContentAddressedStore {
  public readonly root: string;

  constructor(root: string) {
    if (typeof root !== 'string' || !root.trim()) throw new TypeError('An explicit object-store root is required.');
    this.root = resolve(root);
  }

  put(bytes: Uint8Array): ContentAddressedWrite {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_EVIDENCE_BYTES) {
      throw new TypeError('Evidence must be bytes no larger than 8 MiB.');
    }
    const content = Buffer.from(bytes);
    const contentDigest = byteDigest(content);
    const storageKey = storageKeyFor(contentDigest);
    publishImmutableFile(this.root, storageKey.split('/'), content, MAX_EVIDENCE_BYTES);
    return { contentDigest, storageKey, byteLength: content.byteLength };
  }

  get(contentDigest: string): Uint8Array | undefined {
    const storageKey = storageKeyFor(contentDigest);
    const bytes = readImmutableFile(this.root, storageKey.split('/'), MAX_EVIDENCE_BYTES);
    if (bytes !== undefined && byteDigest(bytes) !== contentDigest) {
      throw new Error('Stored evidence failed its content digest check; the file was not changed.');
    }
    return bytes;
  }
}
