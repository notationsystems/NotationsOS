export function candidateBuildReviewOptions(args: readonly string[], baseUrl = 'http://127.0.0.1:3000') {
  let mode: '--watch' | '--once' | undefined;
  let root: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === '--once' || option === '--watch') {
      if (mode) throw new Error('Select --once or --watch exactly once.');
      mode = option;
    } else if (option === '--root') {
      const value = args[++index];
      if (root !== undefined || !value?.trim() || value.startsWith('--')) throw new Error('--root requires one local evidence directory.');
      root = value;
    } else throw new Error('Usage: npm run agent:candidate-build-review -- [--once | --watch] [--root <directory>]');
  }
  // Check raw authority too: URL normalizes aliases such as 127.1 and hexadecimal IPv4.
  if (!/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(baseUrl)) {
    throw new Error('Candidate inspection requires an HTTP literal-loopback board URL without credentials, path, query or fragment.');
  }
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Candidate inspection requires an HTTP literal-loopback board URL without credentials, path, query or fragment.');
  }
  return { watch: mode === '--watch', root: root ?? '.payload/evidence', url: url.toString() };
}
