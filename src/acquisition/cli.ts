import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { SourceConnectorError } from './errors';
import { parseSourceCaptureRequest } from './fmcsa';
import { SourceCaptureStore, type SourceCaptureInspection } from './store';

export const SOURCE_REQUEST_MAX_BYTES = 8 * 1024;
export const SOURCE_CLI_USAGE = [
  'Operator-only source qualification; no canonical admission or customer-distribution grant.',
  'npm run source -- capture --request <request.json> [--root <directory>]',
  'npm run source -- inspect --request-id <id> [--root <directory>]',
  'New captures require PAYLOAD_SOURCE_COLLECTION=1. Historical inspection never collects.',
].join('\n');

const SAFE_ERRORS = {
  INVALID_SOURCE_CLI_ARGUMENTS: 'Use source capture --request <request.json> or inspect --request-id <id>, with an optional --root <directory>.',
  INVALID_SOURCE_REQUEST_FILE: 'Use a readable regular UTF-8 JSON request file no larger than 8 KiB, without duplicate keys.',
  INVALID_REQUEST: 'Provide an exact source capture request and 1 to 25 unique USDOT identifiers.',
  SOURCE_CAPTURE_NOT_FOUND: 'No stored source capture has this request ID.',
  SOURCE_COLLECTION_DISABLED: 'Set PAYLOAD_SOURCE_COLLECTION=1 explicitly to collect a new source response.',
  SOURCE_POLICY_DENIED: 'The internal source qualification policy is not active.',
  SOURCE_REQUEST_CONFLICT: 'This request ID already names a different source scope.',
  SOURCE_HISTORY_INVALID: 'Stored source history failed local integrity checks; no history was changed.',
  SOURCE_CAPTURE_FAILED: 'Source capture or inspection failed; no diagnostic details were disclosed.',
} as const;

function fault(code: keyof typeof SAFE_ERRORS): SourceConnectorError {
  return new SourceConnectorError(code, SAFE_ERRORS[code]);
}

/** JSON.parse establishes syntax first; this scan also rejects escaped duplicate object keys. */
function rejectDuplicateKeys(json: string): void {
  const stack: Array<{ kind: 'array' } | { kind: 'object'; keys: Set<string>; expectingKey: boolean }> = [];
  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (character === '{') stack.push({ kind: 'object', keys: new Set(), expectingKey: true });
    else if (character === '[') stack.push({ kind: 'array' });
    else if (character === '}' || character === ']') stack.pop();
    else if (character === ',') {
      const current = stack.at(-1);
      if (current?.kind === 'object') current.expectingKey = true;
    } else if (character === '"') {
      const start = index;
      for (index++; index < json.length; index++) {
        if (json[index] === '\\') index++;
        else if (json[index] === '"') break;
      }
      const current = stack.at(-1);
      if (current?.kind === 'object' && current.expectingKey) {
        const key = JSON.parse(json.slice(start, index + 1)) as string;
        if (current.keys.has(key)) throw fault('INVALID_SOURCE_REQUEST_FILE');
        current.keys.add(key);
        current.expectingKey = false;
      }
    }
  }
}

/** The read remains bounded if the file grows after fstat; no raw input enters diagnostic output. */
function readRequest(path: string): unknown {
  try {
    const descriptor = openSync(resolve(path), constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile() || stat.size > SOURCE_REQUEST_MAX_BYTES) throw fault('INVALID_SOURCE_REQUEST_FILE');
      const buffer = Buffer.alloc(SOURCE_REQUEST_MAX_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(descriptor, buffer, length, buffer.length - length, null);
        if (count === 0) break;
        length += count;
      }
      if (length > SOURCE_REQUEST_MAX_BYTES) throw fault('INVALID_SOURCE_REQUEST_FILE');
      bytes = buffer.subarray(0, length);
    } finally { closeSync(descriptor); }
    const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    rejectDuplicateKeys(json);
    return value;
  } catch { throw fault('INVALID_SOURCE_REQUEST_FILE'); }
}

type SourceCliStore = Pick<SourceCaptureStore, 'capture' | 'inspect'>;
export interface SourceCliDependencies {
  /** Tests can replace transport/storage without adding any operator-facing execution knobs. */
  storeFactory?: (root: string) => SourceCliStore;
}
type SourceCliResult = { help: string } | (SourceCaptureInspection & { rawBytesIncluded: false });

/** Strict operator CLI, separate from process I/O. No URL, clock, credential or remote-trigger inputs. */
export async function executeSourceCli(args: readonly string[], dependencies: SourceCliDependencies = {}): Promise<SourceCliResult> {
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: SOURCE_CLI_USAGE };
  const [command, ...flags] = args;
  if (!['capture', 'inspect'].includes(command) || flags.length % 2 !== 0) throw fault('INVALID_SOURCE_CLI_ARGUMENTS');
  const required = command === 'capture' ? '--request' : '--request-id';
  const allowed = [required, '--root'];
  const options = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index];
    const value = flags[index + 1];
    if (!allowed.includes(key) || options.has(key) || !value?.trim() || value.startsWith('-')) throw fault('INVALID_SOURCE_CLI_ARGUMENTS');
    options.set(key, value);
  }
  const input = options.get(required);
  if (!input) throw fault('INVALID_SOURCE_CLI_ARGUMENTS');
  const root = options.get('--root') ?? '.payload/source-qualification';
  const request = command === 'capture' ? parseSourceCaptureRequest(readRequest(input)) : undefined;
  if (command === 'inspect' && !/^[A-Za-z0-9_-]{1,80}$/.test(input)) throw fault('INVALID_SOURCE_CLI_ARGUMENTS');
  const store = (dependencies.storeFactory ?? ((directory) => new SourceCaptureStore(directory)))(root);
  const inspection = command === 'capture'
    ? await store.capture(request, process.env.PAYLOAD_SOURCE_COLLECTION === '1')
    : store.inspect(input);
  if (!inspection) throw fault('SOURCE_CAPTURE_NOT_FOUND');
  return { ...inspection, rawBytesIncluded: false };
}

/** Fixed error messages, never Error.message, filesystem paths, provider bodies or stack traces. */
export async function runSourceCli(args: readonly string[], io: {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}, dependencies: SourceCliDependencies = {}): Promise<0 | 1 | 2> {
  try {
    const result = await executeSourceCli(args, dependencies);
    io.stdout('help' in result ? result.help : JSON.stringify(result, null, 2));
    return 'state' in result && ['FAILED', 'QUARANTINED', 'INCOMPLETE'].includes(result.state) ? 2 : 0;
  } catch (failure) {
    const code = failure instanceof SourceConnectorError && Object.hasOwn(SAFE_ERRORS, failure.code)
      ? failure.code as keyof typeof SAFE_ERRORS : 'SOURCE_CAPTURE_FAILED';
    io.stderr(JSON.stringify({ mode: 'LOCAL_SOURCE_QUALIFICATION', error: { code, message: SAFE_ERRORS[code] } }));
    return 1;
  }
}
