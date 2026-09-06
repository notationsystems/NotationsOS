import { runReplayCli } from '../src/observation/cli';

process.exitCode = runReplayCli(process.argv.slice(2), {
  stdout: (value) => process.stdout.write(`${value}\n`), stderr: (value) => process.stderr.write(`${value}\n`),
});
