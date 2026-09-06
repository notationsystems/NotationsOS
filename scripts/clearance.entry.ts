import { runClearanceCli } from '../src/compute/clearance-cli';

process.exitCode = runClearanceCli(process.argv.slice(2), {
  stdout: (value) => process.stdout.write(`${value}\n`), stderr: (value) => process.stderr.write(`${value}\n`),
});
