import { describe, expect, it } from 'vitest';
import { candidateBuildReviewOptions } from './candidate-build-review-cli';

describe('candidate build review launch options', () => {
  it('defaults to one bounded pass and the local evidence store', () => {
    expect(candidateBuildReviewOptions([])).toEqual({ watch: false, root: '.payload/evidence', url: 'http://127.0.0.1:3000/' });
  });

  it.each([
    { args: ['--once'], url: 'http://127.0.0.1', expected: { watch: false, root: '.payload/evidence', url: 'http://127.0.0.1/' } },
    { args: ['--watch', '--root', 'local evidence'], url: 'http://127.0.0.1:3210/', expected: { watch: true, root: 'local evidence', url: 'http://127.0.0.1:3210/' } },
    { args: ['--root', 'local evidence', '--once'], url: 'http://[::1]:3210', expected: { watch: false, root: 'local evidence', url: 'http://[::1]:3210/' } },
  ])('accepts an explicit local mode/root without changing the input array: $args', ({ args, url, expected }) => {
    const original = [...args];
    expect(candidateBuildReviewOptions(Object.freeze(args), url)).toEqual(expected);
    expect(args).toEqual(original);
  });

  it.each([
    ['--watch', '--once'], ['--once', '--once'], ['--watch', '--watch'], ['--root'], ['--root', ''], ['--root', '   '],
    ['--root', '--once'], ['--root', 'one', '--root', 'two'], ['--unknown'], ['--once', 'unexpected'],
  ])('rejects ambiguous or malformed options: %j', (...args: string[]) => {
    expect(() => candidateBuildReviewOptions(args)).toThrow();
  });

  it.each([
    'https://127.0.0.1:3000', 'http://localhost:3000', 'http://example.com', 'http://0.0.0.0', 'http://127.0.0.2',
    'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://0177.0.0.1', 'http://[::ffff:127.0.0.1]',
    'http://user@127.0.0.1', 'http://user:secret@127.0.0.1', 'http://127.0.0.1/api/coordination',
    'http://127.0.0.1//', 'http://127.0.0.1/../', 'http://127.0.0.1?token=secret', 'http://127.0.0.1/#fragment',
    'http://127.0.0.1:70000', 'file:///evidence', '',
  ])('rejects non-literal loopback or URL authority/path controls: %s', (url) => {
    expect(() => candidateBuildReviewOptions([], url)).toThrow();
  });
});
