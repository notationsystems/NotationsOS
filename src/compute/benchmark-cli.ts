import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReplayJson as parseEvidenceJson } from '../observation/json';
import { benchmarkRequestSchema } from './benchmark-contract';
import { runScalarBenchmarkDemo } from './benchmark-demo';
import { ScientificBenchmarkStore } from './benchmark-store';

export const BENCHMARK_USAGE = [
  'Fixed local scalar Gaussian benchmark. No learned model, GTSAM, 3D fusion or admission.',
  'npm run benchmark -- run --request <request.json> [--root <retained-evidence-directory>]',
  'npm run benchmark -- inspect --id <run-id> [--root <retained-evidence-directory>]',
  'npm run benchmark -- demo [--root <synthetic-demo-directory>]',
  'run/inspect default: .payload/scientific-benchmarks; demo default: .payload/scalar-benchmark-demo',
  'Demo observations, variances and references are explicitly synthetic, not field evidence.',
].join('\n');
function readRequest(path: string): unknown {
  const maximum = 4096;
  const file = openSync(resolve(path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || stat.size > maximum) throw new Error('BENCHMARK_REQUEST_FILE');
    const bytes = Buffer.alloc(maximum + 1); let length = 0;
    while (length < bytes.length) {
      const count = readSync(file, bytes, length, bytes.length - length, null);
      if (!count) break; length += count;
    }
    if (length !== stat.size || fstatSync(file).size !== stat.size) throw new Error('BENCHMARK_REQUEST_CHANGED');
    return parseEvidenceJson(bytes.subarray(0, length), maximum);
  } finally { closeSync(file); }
}
export function executeBenchmarkCli(args: readonly string[]) {
  if (!args.length || (args.length === 1 && ['-h', '--help'].includes(args[0]))) return { help: BENCHMARK_USAGE };
  const [command, ...flags] = args;
  if (!['run', 'inspect', 'demo'].includes(command) || flags.length % 2) throw new Error('BENCHMARK_ARGUMENTS');
  const required = command === 'run' ? '--request' : command === 'inspect' ? '--id' : null;
  const options = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i], value = flags[i + 1];
    if (![required, '--root'].includes(key) || options.has(key) || !value?.trim() || value.startsWith('-')) throw new Error('BENCHMARK_ARGUMENTS');
    options.set(key, value);
  }
  if (required && !options.has(required)) throw new Error('BENCHMARK_ARGUMENTS');
  const root = options.get('--root') ?? (command === 'demo' ? '.payload/scalar-benchmark-demo' : '.payload/scientific-benchmarks');
  if (command === 'demo') return runScalarBenchmarkDemo(root);
  if (command === 'run') return new ScientificBenchmarkStore(root).run(benchmarkRequestSchema.parse(readRequest(options.get('--request')!)));
  const result = new ScientificBenchmarkStore(root).inspect(options.get('--id')!);
  if (!result) throw new Error('BENCHMARK_NOT_FOUND');
  return { status: 'INSPECTED' as const, ...result };
}
export function runBenchmarkCli(args: readonly string[], io: { stdout: (text: string) => void; stderr: (text: string) => void }): 0 | 1 | 2 {
  try {
    const result = executeBenchmarkCli(args);
    if ('help' in result) { io.stdout(result.help!); return 0; }
    io.stdout(JSON.stringify(result, null, 2));
    return result.run.modelExecution.cases.some((c) => c.state !== 'COMPUTED') ? 2 : 0;
  } catch {
    io.stderr(JSON.stringify({ mode: 'LOCAL_SCIENTIFIC_BENCHMARK', error: { code: 'BENCHMARK_FAILED',
      message: 'Benchmark failed validation, evidence, policy or storage checks. Preserve history and inspect the exact ID before retrying. No source collection or repair was performed.' } }));
    return 1;
  }
}
