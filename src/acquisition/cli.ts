import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { SourceConnectorError } from './errors';
import { parseSourceCaptureRequest } from './fmcsa';
import { SourceCaptureStore, type SourceCaptureInspection } from './store';
import { CensusNormalizationStore, parseCensusNormalizationRequest, type CensusNormalizationRun } from './census-normalization';
import { CensusCandidateBuildStore, parseCensusCandidateBuildRequest, type LocalCensusCandidateBuild } from '../data-os/local-census-candidate-build';

export const SOURCE_REQUEST_MAX_BYTES = 8 * 1024;
export const CENSUS_BUILD_REQUEST_MAX_BYTES = 32 * 1024;
export const SOURCE_CLI_USAGE = [
  'Operator-only source qualification; no canonical admission or customer-distribution grant.',
  'npm run source -- capture --request <request.json> [--root <directory>]',
  'npm run source -- inspect --request-id <id> [--root <directory>]',
  'npm run source -- normalize --request <request.json> [--root <directory>]',
  'npm run source -- inspect-normalization --normalization-id <id> [--root <directory>]',
  'npm run source -- build --request <request.json> [--root <directory>]',
  'npm run source -- inspect-build --build-id <id> [--root <directory>]',
  'New captures require PAYLOAD_SOURCE_COLLECTION=1. Historical inspection never collects.',
  'Normalization/build read retained captures only; no source collection, admission or release activation.',
].join('\n');

const SAFE_ERRORS = {
  INVALID_SOURCE_CLI_ARGUMENTS: 'Use source capture --request <request.json> or inspect --request-id <id>, with an optional --root <directory>.',
  INVALID_SOURCE_REQUEST_FILE: 'Use a readable regular UTF-8 JSON request file no larger than 8 KiB, without duplicate keys.',
  INVALID_CENSUS_BUILD_REQUEST_FILE: 'Use a readable regular UTF-8 JSON build request file no larger than 32 KiB, without duplicate keys.',
  INVALID_REQUEST: 'Provide an exact source capture request and 1 to 25 unique USDOT identifiers.',
  SOURCE_CAPTURE_NOT_FOUND: 'No stored source capture has this request ID.',
  SOURCE_COLLECTION_DISABLED: 'Set PAYLOAD_SOURCE_COLLECTION=1 explicitly to collect a new source response.',
  SOURCE_POLICY_DENIED: 'The internal source qualification policy is not active.',
  SOURCE_REQUEST_CONFLICT: 'This request ID already names a different source scope.',
  SOURCE_HISTORY_INVALID: 'Stored source history failed local integrity checks; no history was changed.',
  SOURCE_CAPTURE_FAILED: 'Source capture or inspection failed; no diagnostic details were disclosed.',
  CENSUS_OPERATION_FAILED: 'The source normalization or candidate build failed; no diagnostic details were disclosed or history repaired.',
  INVALID_CENSUS_NORMALIZATION_REQUEST: 'Provide the exact FMCSA normalization request, captured receipt reference and selected USDOT.',
  INVALID_CENSUS_NORMALIZATION_TIME: 'Normalization must follow the completed capture and evidence storage.',
  CENSUS_CAPTURE_NOT_FOUND: 'The referenced source capture is unavailable in this repository.',
  CENSUS_CAPTURE_NOT_ELIGIBLE: 'Only a completed CAPTURED source response can be normalized.',
  CENSUS_CAPTURE_REFERENCE_MISMATCH: 'The supplied receipt digest does not match the retained capture.',
  CENSUS_IDENTIFIER_NOT_REQUESTED: 'The selected USDOT was not part of the captured query.',
  CENSUS_ACQUISITION_MISMATCH: 'The retained acquisition does not match the capture reference.',
  CENSUS_SOURCE_UNAVAILABLE: 'The retained source bytes are unavailable; no normalization was substituted.',
  CENSUS_DERIVATION_NOT_ALLOWED: 'The source policy does not permit this new internal derivation.',
  CENSUS_NORMALIZATION_CONFLICT: 'This normalization ID already names a different request.',
  CENSUS_NORMALIZATION_SAVE_UNCONFIRMED: 'Normalization publication could not be confirmed; preserve history and inspect the exact ID before retrying.',
  INVALID_CENSUS_NORMALIZATION: 'The retained normalization failed dependency recomputation.',
  CENSUS_NORMALIZATION_NOT_FOUND: 'No retained normalization has this ID.',
  CENSUS_BUILD_NOT_FOUND: 'No retained source candidate build has this ID.',
  INVALID_CENSUS_CANDIDATE_BUILD_REQUEST: 'Provide an exact v2 FMCSA candidate-build request with pinned normalization references.',
  INVALID_CENSUS_CANDIDATE_BUILD_TIME: 'Build time must be a canonical UTC instant at or after the declared knowledge cutoff.',
  CENSUS_BUILD_MEMBER_NOT_FOUND: 'A selected normalization is unavailable in this repository.',
  CENSUS_BUILD_MEMBER_REFERENCE_MISMATCH: 'A selected normalization digest does not match its retained record.',
  CENSUS_BUILD_MEMBER_NOT_ELIGIBLE: 'Every selected normalization must contain an unadmitted FMCSA candidate; NOT_RETURNED is not a member.',
  CENSUS_BUILD_MEMBER_AFTER_CUTOFF: 'A selected candidate became known after the declared build cutoff.',
  CENSUS_BUILD_SOURCE_IDENTITY_CONFLICT: 'Select only one candidate version for each source-scoped USDOT identity.',
  CENSUS_BUILD_SOURCE_CLASS_NOT_DECLARED: 'A selected candidate source class is absent from the explicit build definition.',
  CENSUS_BUILD_ACQUISITION_MISMATCH: 'A selected candidate acquisition failed exact reference verification.',
  CENSUS_BUILD_DERIVATION_NOT_ALLOWED: 'The source policy does not permit this new internal candidate build.',
  CENSUS_CANDIDATE_BUILD_CONFLICT: 'This candidate-build ID already names a different request.',
  CENSUS_CANDIDATE_BUILD_INVALID: 'The retained candidate build failed dependency recomputation; no history was repaired.',
  CENSUS_CANDIDATE_BUILD_SAVE_UNCONFIRMED: 'Build publication could not be confirmed; preserve history and inspect the exact ID before retrying.',
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
function readRequest(path: string, maximum = SOURCE_REQUEST_MAX_BYTES): unknown {
  try {
    const descriptor = openSync(resolve(path), constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile() || stat.size > maximum) throw fault('INVALID_SOURCE_REQUEST_FILE');
      const buffer = Buffer.alloc(maximum + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(descriptor, buffer, length, buffer.length - length, null);
        if (count === 0) break;
        length += count;
      }
      if (length > maximum) throw fault('INVALID_SOURCE_REQUEST_FILE');
      bytes = buffer.subarray(0, length);
    } finally { closeSync(descriptor); }
    const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    rejectDuplicateKeys(json);
    return value;
  } catch { throw fault(maximum === CENSUS_BUILD_REQUEST_MAX_BYTES ? 'INVALID_CENSUS_BUILD_REQUEST_FILE' : 'INVALID_SOURCE_REQUEST_FILE'); }
}

type SourceCliStore = Pick<SourceCaptureStore, 'capture' | 'inspect'>;
export interface SourceCliDependencies {
  /** Tests can replace transport/storage without adding any operator-facing execution knobs. */
  storeFactory?: (root: string) => SourceCliStore;
  normalizationFactory?: (root: string) => Pick<CensusNormalizationStore, 'normalize' | 'inspect'>;
  buildFactory?: (root: string) => Pick<CensusCandidateBuildStore, 'build' | 'inspect'>;
}
type SourceCliResult = { help: string } | (SourceCaptureInspection & { rawBytesIncluded: false })
  | { status: 'CREATED' | 'EXISTING' | 'INSPECTED'; run: CensusNormalizationRun; rawBytesIncluded: false }
  | { status: 'CREATED' | 'EXISTING' | 'INSPECTED'; build: LocalCensusCandidateBuild; rawBytesIncluded: false };

/** Strict operator CLI, separate from process I/O. No URL, clock, credential or remote-trigger inputs. */
export async function executeSourceCli(args: readonly string[], dependencies: SourceCliDependencies = {}): Promise<SourceCliResult> {
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: SOURCE_CLI_USAGE };
  const [command, ...flags] = args;
  const commands: Record<string, string> = { capture: '--request', inspect: '--request-id', normalize: '--request',
    'inspect-normalization': '--normalization-id', build: '--request', 'inspect-build': '--build-id' };
  if (!Object.hasOwn(commands, command) || flags.length % 2 !== 0) throw fault('INVALID_SOURCE_CLI_ARGUMENTS');
  const required = commands[command];
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
  if (command === 'normalize' || command === 'inspect-normalization') {
    const request = command === 'normalize' ? parseCensusNormalizationRequest(readRequest(input)) : undefined;
    if (!request && !/^[A-Za-z0-9_-]{1,80}$/.test(input)) throw fault('INVALID_SOURCE_CLI_ARGUMENTS');
    const normalizations = (dependencies.normalizationFactory ?? ((directory) => new CensusNormalizationStore(directory)))(root);
    if (request) return { ...normalizations.normalize(request), rawBytesIncluded: false };
    const run = normalizations.inspect(input);
    if (!run) throw fault('CENSUS_NORMALIZATION_NOT_FOUND');
    return { status: 'INSPECTED', run, rawBytesIncluded: false };
  }
  if (command === 'build' || command === 'inspect-build') {
    const request = command === 'build' ? parseCensusCandidateBuildRequest(readRequest(input, CENSUS_BUILD_REQUEST_MAX_BYTES)) : undefined;
    if (!request && !/^[A-Za-z0-9_-]{1,80}$/.test(input)) throw fault('INVALID_SOURCE_CLI_ARGUMENTS');
    const builds = (dependencies.buildFactory ?? ((directory) => new CensusCandidateBuildStore(directory)))(root);
    if (request) return { ...builds.build(request), rawBytesIncluded: false };
    const build = builds.inspect(input);
    if (!build) throw fault('CENSUS_BUILD_NOT_FOUND');
    return { status: 'INSPECTED', build, rawBytesIncluded: false };
  }
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
    if ('run' in result && result.run.state === 'NOT_RETURNED') return 2;
    return 'state' in result && ['FAILED', 'QUARANTINED', 'INCOMPLETE'].includes(result.state) ? 2 : 0;
  } catch (failure) {
    const code = failure instanceof SourceConnectorError && Object.hasOwn(SAFE_ERRORS, failure.code)
      ? failure.code as keyof typeof SAFE_ERRORS
      : ['normalize', 'inspect-normalization', 'build', 'inspect-build'].includes(args[0]) ? 'CENSUS_OPERATION_FAILED' : 'SOURCE_CAPTURE_FAILED';
    io.stderr(JSON.stringify({ mode: 'LOCAL_SOURCE_QUALIFICATION', error: { code, message: SAFE_ERRORS[code] } }));
    return 1;
  }
}
