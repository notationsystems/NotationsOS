import { runBenchmarkCli } from '../src/compute/benchmark-cli';

process.exitCode = runBenchmarkCli(process.argv.slice(2), {
  stdout: (value) => process.stdout.write(`${value}\n`), stderr: (value) => process.stderr.write(`${value}\n`),
});
