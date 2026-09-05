import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_EVIDENCE_BYTES } from './file-object-store';
import { LocalEvidenceIntake, MAX_INTAKE_RECORD_BYTES } from './local-intake';

export const INTAKE_USAGE = [
  'Local development only: declared policy is not independently verified authorization.',
  'npm run evidence -- capture --request <manifest.json> --input <local-file> [--root <directory>]',
  'npm run evidence -- inspect --acquisition <id> [--root <directory>]',
].join('\n');

/** Bound reads even if a local input grows between stat and read. Never modifies the input. */
function readInput(path: string, maximum: number): Buffer {
  const descriptor = openSync(resolve(path), 'r');
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maximum) throw new Error(`Input must be a regular file no larger than ${maximum} bytes.`);
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length <= maximum) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > maximum) throw new Error(`Input exceeds ${maximum} bytes.`);
    return buffer.subarray(0, length);
  } finally { closeSync(descriptor); }
}

/** Kept separate from process I/O so the actual CLI workflow can be tested. */
export function executeIntakeCli(args: readonly string[]) {
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: INTAKE_USAGE };
  const [command, ...flags] = args;
  if (!['capture', 'inspect'].includes(command) || flags.length % 2 !== 0) throw new Error(INTAKE_USAGE);
  const allowed = command === 'capture' ? ['--request', '--input', '--root'] : ['--acquisition', '--root'];
  const options = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    if (!allowed.includes(flags[i]) || options.has(flags[i]) || !flags[i + 1] || flags[i + 1].startsWith('--')) throw new Error(INTAKE_USAGE);
    options.set(flags[i], flags[i + 1]);
  }
  const required = (key: string) => { const value = options.get(key); if (!value) throw new Error(INTAKE_USAGE); return value; };
  const intake = new LocalEvidenceIntake(options.get('--root') ?? '.payload/evidence');
  if (command === 'capture') {
    const manifest: unknown = JSON.parse(readInput(required('--request'), MAX_INTAKE_RECORD_BYTES).toString('utf8'));
    const bytes = readInput(required('--input'), MAX_EVIDENCE_BYTES);
    const result = intake.capture(manifest, bytes);
    return { ...result, integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false };
  }
  const acquisition = intake.inspect(required('--acquisition'));
  if (!acquisition) throw new Error('ACQUISITION_NOT_FOUND: no local acquisition has this id.');
  return { acquisition, integrity: 'RECOMPUTED_LOCAL', rawBytesIncluded: false };
}
