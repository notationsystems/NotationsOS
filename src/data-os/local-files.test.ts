import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, fsyncSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishImmutableFile, readImmutableFile } from './local-files';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, linkSync: vi.fn(actual.linkSync), fsyncSync: vi.fn(actual.fsyncSync), writeFileSync: vi.fn(actual.writeFileSync) };
});

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'payload-immutable-test-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });
const content = Buffer.from('original evidence');
const limit = 1024;

describe('local immutable file primitives', () => {
  it('does not create missing directories on reads', () => {
    const missingRoot = join(root, 'missing');
    expect(readImmutableFile(missingRoot, ['nested', 'record.json'], limit)).toBeUndefined();
    expect(existsSync(missingRoot)).toBe(false);
  });

  it('publishes complete bytes, reuses exact duplicates, and preserves conflicting content', () => {
    expect(publishImmutableFile(root, ['nested', 'record.json'], content, limit)).toBe('CREATED');
    expect(readImmutableFile(root, ['nested', 'record.json'], limit)).toEqual(content);
    expect(publishImmutableFile(root, ['nested', 'record.json'], content, limit)).toBe('EXISTING');
    expect(() => publishImmutableFile(root, ['nested', 'record.json'], Buffer.from('different'), limit)).toThrow(/conflict/i);
    expect(readFileSync(join(root, 'nested', 'record.json'))).toEqual(content);
    expect(readdirSync(join(root, 'nested'))).toEqual(['record.json']);
  });

  it('accepts an exact concurrent publication after create-only linking loses the race', () => {
    const actual = vi.mocked(linkSync).getMockImplementation()!;
    vi.mocked(linkSync).mockImplementationOnce((source, target) => {
      writeFileSync(target, content, { flag: 'wx' });
      actual(source, target);
    });
    expect(publishImmutableFile(root, ['record'], content, limit)).toBe('EXISTING');
    expect(readFileSync(join(root, 'record'))).toEqual(content);
    expect(readdirSync(root)).toEqual(['record']);
  });

  it('refuses a conflicting concurrent publication without overwriting it', () => {
    const actual = vi.mocked(linkSync).getMockImplementation()!;
    vi.mocked(linkSync).mockImplementationOnce((source, target) => {
      writeFileSync(target, 'other writer', { flag: 'wx' });
      actual(source, target);
    });
    expect(() => publishImmutableFile(root, ['record'], content, limit)).toThrow(/concurrent publication/);
    expect(readFileSync(join(root, 'record'), 'utf8')).toBe('other writer');
    expect(readdirSync(root)).toEqual(['record']);
  });

  it('never publishes a partially written temporary file and cleans only its own temporary path', () => {
    writeFileSync(join(root, '.payload-unrelated.tmp'), 'preserve');
    const actual = vi.mocked(writeFileSync).getMockImplementation()!;
    vi.mocked(writeFileSync).mockImplementationOnce((file) => {
      actual(file, 'partial');
      throw Object.assign(new Error('disk write failed'), { code: 'EIO' });
    });
    expect(() => publishImmutableFile(root, ['record'], content, limit)).toThrow('disk write failed');
    expect(existsSync(join(root, 'record'))).toBe(false);
    expect(readdirSync(root)).toEqual(['.payload-unrelated.tmp']);
  });

  it('does not publish when flushing the temporary file fails', () => {
    vi.mocked(fsyncSync).mockImplementationOnce(() => { throw new Error('flush failed'); });
    expect(() => publishImmutableFile(root, ['record'], content, limit)).toThrow('flush failed');
    expect(readdirSync(root)).toEqual([]);
  });

  it('cleans its temporary file when hard-link publication fails', () => {
    vi.mocked(linkSync).mockImplementationOnce(() => { throw Object.assign(new Error('link unsupported'), { code: 'ENOTSUP' }); });
    expect(() => publishImmutableFile(root, ['record'], content, limit)).toThrow('link unsupported');
    expect(readdirSync(root)).toEqual([]);
  });

  it.each(['', '.', '..', '../escape', 'a/b', 'a\\b', 'C:drive', '/absolute', 'NUL', 'COM1.txt', 'trailing.', 'white space'])('rejects unsafe path segment %j', (segment) => {
    expect(() => readImmutableFile(root, [segment], limit)).toThrow(/safe/);
    expect(() => publishImmutableFile(root, [segment], content, limit)).toThrow(/safe/);
    expect(readdirSync(root)).toEqual([]);
  });

  it('enforces read/write byte limits and leaves an oversized existing file intact', () => {
    expect(() => publishImmutableFile(root, ['record'], content, 1)).toThrow(/limit/);
    expect(readdirSync(root)).toEqual([]);
    writeFileSync(join(root, 'record'), content);
    expect(() => readImmutableFile(root, ['record'], 1)).toThrow(/limit/);
    expect(readFileSync(join(root, 'record'))).toEqual(content);
    expect(() => readImmutableFile(root, ['record'], 0)).toThrow(/positive/);
  });

  it('refuses regular files used as directories and directories used as files', () => {
    writeFileSync(join(root, 'file'), content);
    mkdirSync(join(root, 'directory'));
    expect(() => readImmutableFile(join(root, 'file'), ['record'], limit)).toThrow(/directories/);
    expect(() => publishImmutableFile(root, ['file', 'record'], content, limit)).toThrow(/directories/);
    expect(() => readImmutableFile(root, ['directory'], limit)).toThrow(/regular file/);
    expect(() => publishImmutableFile(root, ['directory'], content, limit)).toThrow(/regular file/);
  });

  it('rejects linked roots and descendant directories', (context) => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    const linked = join(root, 'linked');
    try { symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { context.skip(); return; }
      throw error;
    }
    expect(() => readImmutableFile(linked, ['record'], limit)).toThrow(/symbolic links/);
    expect(() => publishImmutableFile(root, ['linked', 'record'], content, limit)).toThrow(/symbolic links/);
    expect(readdirSync(outside)).toEqual([]);
  });

  it('rejects symbolic links in the final file position', (context) => {
    const target = join(root, 'target');
    writeFileSync(target, content);
    try { symlinkSync(target, join(root, 'linked'), 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { context.skip(); return; }
      throw error;
    }
    expect(() => readImmutableFile(root, ['linked'], limit)).toThrow(/symbolic link/);
    expect(() => publishImmutableFile(root, ['linked'], content, limit)).toThrow(/symbolic link/);
    expect(readFileSync(target)).toEqual(content);
  });
});
