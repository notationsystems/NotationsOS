import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReplayJson } from '../observation/json';
import { registrationAccessRequestSchema } from './registration-access-contract';
import { runRegistrationAccessDemo } from './registration-access-demo';
import { RegistrationAccessStore } from './registration-access-store';

export const SPATIAL_USAGE = [
  'Fixed local weighted 3D registration and explicit access geometry. No IFC parser, geodesic engine or admission.',
  'npm run spatial -- run --request <request.json> [--root <retained-evidence-directory>]',
  'npm run spatial -- inspect --id <run-id> [--root <retained-evidence-directory>]',
  'npm run spatial -- demo [--root <synthetic-demo-directory>]',
  'run/inspect default: .payload/spatial-experiments; demo default: .payload/building-access-demo',
  'Demo geometry, measurements, noise and access are synthetic declarations, not field evidence.',
].join('\n');
function readRequest(path: string): unknown {
  const maximum = 4096;
  const file = openSync(resolve(path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || stat.size > maximum) throw new Error('SPATIAL_REQUEST_FILE');
    const bytes = Buffer.alloc(maximum + 1); let length = 0;
    while (length < bytes.length) {
      const count = readSync(file, bytes, length, bytes.length - length, null);
      if (!count) break; length += count;
    }
    if (length !== stat.size || fstatSync(file).size !== stat.size) throw new Error('SPATIAL_REQUEST_CHANGED');
    return parseReplayJson(bytes.subarray(0, length), maximum);
  } finally { closeSync(file); }
}
export function executeSpatialCli(args: readonly string[]) {
  if (!args.length || (args.length === 1 && ['-h', '--help'].includes(args[0]))) return { help: SPATIAL_USAGE };
  const [command, ...flags] = args;
  if (!['run', 'inspect', 'demo'].includes(command) || flags.length % 2) throw new Error('SPATIAL_ARGUMENTS');
  const required = command === 'run' ? '--request' : command === 'inspect' ? '--id' : null;
  const options = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i], value = flags[i + 1];
    if (![required, '--root'].includes(key) || options.has(key) || !value?.trim() || value.startsWith('-')) throw new Error('SPATIAL_ARGUMENTS');
    options.set(key, value);
  }
  if (required && !options.has(required)) throw new Error('SPATIAL_ARGUMENTS');
  const root = options.get('--root') ?? (command === 'demo' ? '.payload/building-access-demo' : '.payload/spatial-experiments');
  if (command === 'demo') return runRegistrationAccessDemo(root);
  if (command === 'run') return new RegistrationAccessStore(root).run(registrationAccessRequestSchema.parse(readRequest(options.get('--request')!)));
  const result = new RegistrationAccessStore(root).inspect(options.get('--id')!);
  if (!result) throw new Error('SPATIAL_NOT_FOUND');
  return { status: 'INSPECTED' as const, ...result };
}
export function runSpatialCli(args: readonly string[], io: { stdout: (text: string) => void; stderr: (text: string) => void }): 0 | 1 | 2 {
  try {
    const result = executeSpatialCli(args);
    if ('help' in result) { io.stdout(result.help!); return 0; }
    io.stdout(JSON.stringify(result, null, 2));
    return result.run.result.registration.state === 'COMPUTED' ? 0 : 2;
  } catch {
    io.stderr(JSON.stringify({ mode: 'LOCAL_REGISTRATION_ACCESS', error: { code: 'SPATIAL_FAILED',
      message: 'Experiment failed validation, evidence, policy or storage checks. Preserve history and inspect the exact ID before retrying. No collection or repair was performed.' } }));
    return 1;
  }
}
