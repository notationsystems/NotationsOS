import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReplayJson } from '../observation/json';
import { parseSamsaraCaptureRequest } from './samsara-contract';
import { runSamsaraDemo } from './samsara-demo';
import { SamsaraCaptureStore } from './samsara-store';

export const SAMSARA_USAGE = [
  'Operator-only Samsara GPS history qualification: one vehicle, <=15 minutes, one page; not continuous synchronization.',
  'npm run samsara -- capture --request <request.json> [--root <private-evidence-directory>]',
  'npm run samsara -- inspect --request-id <id> [--root <private-evidence-directory>]',
  'npm run samsara -- demo [--root <synthetic-demo-directory>]',
  'Live capture requires retained authorization/terms, PAYLOAD_SAMSARA_COLLECTION=1 and a server-only PAYLOAD_SAMSARA_TOKEN.',
  'Never paste the token into requests, CLI arguments, browser code, logs or Git. Inspection requires current declared use and retention rights.',
  'capture/inspect default: .payload/samsara-private; demo default: .payload/samsara-synthetic-demo (no provider contact).',
].join('\n');
function readRequest(path: string) {
  const file = openSync(resolve(path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = fstatSync(file);
    if (!before.isFile() || before.size > 4096) throw new Error('SAMSARA_REQUEST_FILE_INVALID');
    const bytes = Buffer.alloc(4097); let length = 0;
    while (length < bytes.length) {
      const count = readSync(file, bytes, length, bytes.length - length, null);
      if (!count) break; length += count;
    }
    if (length !== before.size || fstatSync(file).size !== before.size) throw new Error('SAMSARA_REQUEST_FILE_CHANGED');
    return parseReplayJson(bytes.subarray(0, length), 4096);
  } finally { closeSync(file); }
}
type Dependencies = { storeFactory?: (root: string) => Pick<SamsaraCaptureStore, 'capture' | 'inspect'> };
export async function executeSamsaraCli(args: readonly string[], dependencies: Dependencies = {}) {
  if (!args.length || (args.length === 1 && ['-h', '--help'].includes(args[0]))) return { help: SAMSARA_USAGE };
  const [command, ...flags] = args;
  if (!['capture', 'inspect', 'demo'].includes(command) || flags.length % 2) throw new Error('SAMSARA_ARGUMENTS');
  const required = command === 'capture' ? '--request' : command === 'inspect' ? '--request-id' : null;
  const options = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const [name, value] = [flags[i], flags[i + 1]];
    if (![required, '--root'].includes(name) || options.has(name) || !value?.trim() || value.startsWith('-')) throw new Error('SAMSARA_ARGUMENTS');
    options.set(name, value);
  }
  if (required && !options.has(required)) throw new Error('SAMSARA_ARGUMENTS');
  const root = options.get('--root') ?? (command === 'demo' ? '.payload/samsara-synthetic-demo' : '.payload/samsara-private');
  if (command === 'demo') return runSamsaraDemo(root);
  const store = (dependencies.storeFactory ?? ((root) => new SamsaraCaptureStore(root)))(root);
  if (command === 'capture') return store.capture(parseSamsaraCaptureRequest(readRequest(options.get('--request')!)), process.env.PAYLOAD_SAMSARA_COLLECTION === '1');
  const result = store.inspect(options.get('--request-id')!);
  if (!result) throw new Error('SAMSARA_CAPTURE_NOT_FOUND');
  return result;
}
export async function runSamsaraCli(args: readonly string[], io: { stdout: (text: string) => void; stderr: (text: string) => void }, dependencies: Dependencies = {}): Promise<0 | 1 | 2> {
  try {
    const result = await executeSamsaraCli(args, dependencies);
    if ('help' in result) { io.stdout(result.help!); return 0; }
    io.stdout(JSON.stringify(result, null, 2));
    return result.state !== 'CAPTURED' || result.observations?.coverage === 'PARTIAL_PAGE' || result.observations?.availability === 'NOT_RETURNED' ? 2 : 0;
  } catch {
    io.stderr(JSON.stringify({ mode: 'LOCAL_SAMSARA_QUALIFICATION', error: { code: 'SAMSARA_FAILED',
      message: 'Samsara qualification failed a scope, credential, current-use, retention, transport or evidence check. Inspect the exact request ID before retrying. No automatic collection retry or repair was performed.' } }));
    return 1;
  }
}
