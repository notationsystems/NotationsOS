import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReplayJson } from './json';
import { replayRequestSchema } from './contract';
import { runReplayDemo } from './demo';
import { ObservationReplayStore } from './store';

export const REPLAY_CLI_USAGE = [
  'Local recorded-observation replay. No network, fusion, canonical admission or customer delivery.',
  'npm run replay -- run --request <request.json> [--root <retained-evidence-directory>]',
  'npm run replay -- inspect --id <replay-id> [--root <retained-evidence-directory>]',
  'npm run replay -- demo [--root <synthetic-demo-directory>]',
  'run/inspect default: .payload/observation-replay; demo default: .payload/observation-replay-demo',
  'demo writes explicitly SYNTHETIC_TEST inputs, never recorded sensor evidence.',
].join('\n');

function readRequest(path: string): unknown {
  const maximum = 4096;
  const descriptor = openSync(resolve(path), constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maximum) throw new Error('REPLAY_REQUEST_FILE');
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length !== stat.size || fstatSync(descriptor).size !== stat.size) throw new Error('REPLAY_REQUEST_CHANGED');
    return parseReplayJson(buffer.subarray(0, length), maximum);
  } finally { closeSync(descriptor); }
}

export function executeReplayCli(args: readonly string[]) {
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: REPLAY_CLI_USAGE };
  const [command, ...flags] = args;
  if (!['run', 'inspect', 'demo'].includes(command) || flags.length % 2) throw new Error('REPLAY_ARGUMENTS');
  const required = command === 'run' ? '--request' : command === 'inspect' ? '--id' : null;
  const values = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i], value = flags[i + 1];
    if (![required, '--root'].includes(flag) || values.has(flag) || !value?.trim() || value.startsWith('-')) throw new Error('REPLAY_ARGUMENTS');
    values.set(flag, value);
  }
  if (required && !values.has(required)) throw new Error('REPLAY_ARGUMENTS');
  const root = values.get('--root') ?? (command === 'demo' ? '.payload/observation-replay-demo' : '.payload/observation-replay');
  if (command === 'demo') return runReplayDemo(root);
  if (command === 'run') {
    const request = replayRequestSchema.parse(readRequest(values.get('--request')!));
    return new ObservationReplayStore(root).replay(request);
  }
  const result = new ObservationReplayStore(root).inspect(values.get('--id')!);
  if (!result) throw new Error('REPLAY_NOT_FOUND');
  return { status: 'INSPECTED' as const, ...result };
}

export function runReplayCli(args: readonly string[], io: { stdout: (text: string) => void; stderr: (text: string) => void }): 0 | 1 {
  try {
    const result = executeReplayCli(args);
    io.stdout('help' in result ? result.help! : JSON.stringify(result, null, 2));
    return 0;
  } catch {
    // No paths, source bytes, user strings, credentials or stack traces in diagnostics.
    io.stderr(JSON.stringify({ mode: 'LOCAL_OBSERVATION_REPLAY', error: {
      code: 'REPLAY_FAILED', message: 'Replay failed validation, evidence, policy, or storage checks. Preserve history; inspect the exact ID before retrying. No repair or source collection was performed.',
    } }));
    return 1;
  }
}
