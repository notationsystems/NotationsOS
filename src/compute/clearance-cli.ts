import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReplayJson } from '../observation/json';
import { clearanceRequestSchema } from './clearance-contract';
import { runClearanceDemo } from './clearance-demo';
import { ClearanceStore } from './clearance-store';

export const CLEARANCE_USAGE = [
  'Local exact Bayesian clearance/measurement design. Recommendations are hypothetical, not authorization or execution.',
  'npm run clearance -- run --request <request.json> [--root <retained-evidence-directory>]',
  'npm run clearance -- inspect --id <run-id> [--root <retained-evidence-directory>]',
  'npm run clearance -- demo [--root <synthetic-demo-directory>]',
  'run/inspect default: .payload/clearance-experiments; demo default: .payload/clearance-demo',
  'Demo uses synthetic probabilities, geometry, costs and losses; no independent physical validation.',
].join('\n');
function readRequest(path: string): unknown {
  const file = openSync(resolve(path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = fstatSync(file);
    if (!before.isFile() || before.size > 4096) throw new Error('CLEARANCE_REQUEST_FILE');
    const bytes = Buffer.alloc(4097); let length = 0;
    while (length < bytes.length) { const count = readSync(file, bytes, length, bytes.length - length, null); if (!count) break; length += count; }
    if (length !== before.size || fstatSync(file).size !== before.size) throw new Error('CLEARANCE_REQUEST_CHANGED');
    return parseReplayJson(bytes.subarray(0, length), 4096);
  } finally { closeSync(file); }
}
export function executeClearanceCli(args: readonly string[]) {
  if (!args.length || (args.length === 1 && ['-h', '--help'].includes(args[0]))) return { help: CLEARANCE_USAGE };
  const [command, ...flags] = args;
  if (!['run', 'inspect', 'demo'].includes(command) || flags.length % 2) throw new Error('CLEARANCE_ARGUMENTS');
  const required = command === 'run' ? '--request' : command === 'inspect' ? '--id' : null;
  const options = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const [key, value] = [flags[i], flags[i + 1]];
    if (![required, '--root'].includes(key) || options.has(key) || !value?.trim() || value.startsWith('-')) throw new Error('CLEARANCE_ARGUMENTS');
    options.set(key, value);
  }
  if (required && !options.has(required)) throw new Error('CLEARANCE_ARGUMENTS');
  const root = options.get('--root') ?? (command === 'demo' ? '.payload/clearance-demo' : '.payload/clearance-experiments');
  if (command === 'demo') return runClearanceDemo(root);
  const store = new ClearanceStore(root);
  if (command === 'run') return store.run(clearanceRequestSchema.parse(readRequest(options.get('--request')!)));
  const result = store.inspect(options.get('--id')!);
  if (!result) throw new Error('CLEARANCE_NOT_FOUND');
  return { status: 'INSPECTED' as const, ...result };
}
export function runClearanceCli(args: readonly string[], io: { stdout: (text: string) => void; stderr: (text: string) => void }): 0 | 1 | 2 {
  try {
    const result = executeClearanceCli(args);
    if ('help' in result) { io.stdout(result.help!); return 0; }
    io.stdout(JSON.stringify(result, null, 2));
    return result.run.result.recommendation.state === 'UNRESOLVED_REQUIREMENTS' ? 2 : 0;
  } catch {
    io.stderr(JSON.stringify({ mode: 'LOCAL_CLEARANCE_VOI', error: { code: 'CLEARANCE_FAILED', message: 'Experiment failed validation, current-use, evidence or storage checks. No measurement, source query or repair was performed.' } }));
    return 1;
  }
}
