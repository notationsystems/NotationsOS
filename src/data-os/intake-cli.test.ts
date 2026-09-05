import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeIntakeCli } from './intake-cli';

let temporary: string;
let root: string;
const request = 'examples/evidence/request.json';
const input = 'examples/evidence/notice.txt';
beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-intake-cli-')); root = join(temporary, 'evidence'); });
afterEach(() => { rmSync(temporary, { recursive: true, force: true }); });

describe('evidence CLI', () => {
  it('captures the example, reuses it, and inspects it without emitting raw source content', () => {
    const before = readFileSync(input);
    const args = ['capture', '--request', request, '--input', input, '--root', root];
    const first = executeIntakeCli(args);
    expect(first).toMatchObject({ status: 'CREATED', integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false });
    expect(executeIntakeCli(args)).toMatchObject({ status: 'EXISTING' });
    const inspected = executeIntakeCli(['inspect', '--acquisition', 'demo-caravan-local-notice-001', '--root', root]);
    expect(inspected).toMatchObject({ integrity: 'RECOMPUTED_LOCAL', acquisition: { canonicalAdmission: false } });
    expect(JSON.stringify(inspected)).not.toContain('Demo berth D-4');
    expect(readFileSync(input)).toEqual(before);
  });

  it('shows help without creating a store', () => {
    expect(executeIntakeCli([])).toHaveProperty('help');
    expect(executeIntakeCli(['--help'])).toHaveProperty('help');
    expect(existsSync(root)).toBe(false);
  });

  it.each([
    ['delete'], ['capture'], ['inspect'], ['inspect', '--acquisition'],
    ['inspect', '--acquisition', 'demo', '--acquisition', 'demo'],
    ['capture', '--request', request, '--url', 'https://example.com'],
  ].map((args) => ({ args })))('rejects unsupported/incomplete command arguments', ({ args }) => {
    expect(() => executeIntakeCli([...args, '--root', root])).toThrow();
    expect(existsSync(root)).toBe(false);
  });

  it('fails inspection of an absent acquisition without creating directories', () => {
    expect(() => executeIntakeCli(['inspect', '--acquisition', 'missing', '--root', root])).toThrow('ACQUISITION_NOT_FOUND');
    expect(existsSync(root)).toBe(false);
  });

  it('rejects malformed request files before storage', () => {
    const invalid = join(temporary, 'invalid.json');
    writeFileSync(invalid, '{');
    expect(() => executeIntakeCli(['capture', '--request', invalid, '--input', input, '--root', root])).toThrow();
    expect(existsSync(root)).toBe(false);
  });
});
