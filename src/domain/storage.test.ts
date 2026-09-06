import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FABRICS } from './doctrine';
import { STORAGE_CLASSES, STORAGE_PRESENT_STATE, STORAGE_SEQUENCE, STORE_KIND_LABEL, STORAGE_STATE_LABEL, type StorageClass } from './storage';

const ids = STORAGE_CLASSES.map((c) => c.id);

describe('polyglot persistence, as data', () => {
  it('names one class per store kind, with unique ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(STORAGE_CLASSES.map((c) => c.kind)).size).toBe(STORAGE_CLASSES.length);
  });

  it('binds every class to a fabric that exists', () => {
    const fabrics = new Set(FABRICS.map((f) => f.id));
    for (const c of STORAGE_CLASSES) expect(fabrics.has(c.fabric)).toBe(true);
  });

  it('labels every kind and every state it uses', () => {
    for (const c of STORAGE_CLASSES) {
      expect(STORE_KIND_LABEL[c.kind]).toBeTruthy();
      expect(STORAGE_STATE_LABEL[c.here.state]).toBeTruthy();
    }
  });

  it('offers candidates without choosing one', () => {
    for (const c of STORAGE_CLASSES) {
      expect(c.candidates.length).toBeGreaterThan(0);
      // A selection would be recorded as a dependency and a running service, not as prose.
      expect(c.here.state).not.toBe('SERVICE');
    }
  });

  /**
   * The honest-present-state guard. If a store dependency ever appears in
   * package.json, this fails until the class that uses it says SERVICE and the
   * summary stops claiming nothing is installed.
   */
  it('claims nothing is installed only while nothing is installed', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    const storeLike = /^(pg|postgres|@?aws-sdk|minio|@elastic|@opensearch|neo4j|arangojs|qdrant|@qdrant|milvus|@zilliz|duckdb|@duckdb|apache-arrow|trino|delta|redis|ioredis|better-sqlite3|sqlite3|prisma|drizzle-orm|typeorm|mongoose|mongodb)/i;
    const found = declared.filter((d) => storeLike.test(d));
    expect(found).toEqual([]);
    expect(STORAGE_PRESENT_STATE.dependencies).toContain('no database');
    for (const c of STORAGE_CLASSES) expect(c.here.state).not.toBe('SERVICE');
  });

  it('carries a doctrine invariant and a precondition on every class', () => {
    const long = (value: string) => value.trim().length > 40;
    for (const c of STORAGE_CLASSES) {
      expect(long(c.why)).toBe(true);
      expect(long(c.invariant)).toBe(true);
      expect(long(c.before)).toBe(true);
      expect(long(c.here.what)).toBe(true);
    }
  });

  it('keeps the separations the invariants exist to protect', () => {
    const by = (id: StorageClass['id']) => STORAGE_CLASSES.find((c) => c.id === id)!;
    // Embedding similarity is never a canonical relation.
    expect(by('embeddings').invariant).toMatch(/not a canonical relation/);
    // A graph edge still needs evidence; adjacency is not an edge.
    expect(by('entities').invariant).toMatch(/adjacency is not a semantic edge/);
    // Table time travel is not the record's two clocks.
    expect(by('records').invariant).toMatch(/valid time is not knowledge time/);
    // An index is derived and rebuildable, never where a fact lives.
    expect(by('text').invariant).toMatch(/never become the place a fact lives/);
  });

  it('sequences adoption behind the authorities that do not exist yet', () => {
    expect(STORAGE_SEQUENCE.length).toBeGreaterThan(0);
    expect(STORAGE_SEQUENCE.join(' ')).toMatch(/admission/);
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/admission authority/i);
    expect(by(STORAGE_CLASSES, 'entities').before).toMatch(/identity authority/i);
  });
});

function by(classes: readonly StorageClass[], id: StorageClass['id']) {
  const found = classes.find((c) => c.id === id);
  if (!found) throw new Error(`no storage class ${id}`);
  return found;
}
