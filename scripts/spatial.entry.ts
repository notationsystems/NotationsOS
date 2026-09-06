import { runSpatialCli } from '../src/compute/registration-access-cli';

process.exitCode = runSpatialCli(process.argv.slice(2), {
  stdout: (value) => process.stdout.write(`${value}\n`), stderr: (value) => process.stderr.write(`${value}\n`),
});
