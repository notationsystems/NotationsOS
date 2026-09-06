import { runSamsaraCli } from '../src/acquisition/samsara-cli';

process.exitCode = await runSamsaraCli(process.argv.slice(2), {
  stdout: (value) => process.stdout.write(`${value}\n`), stderr: (value) => process.stderr.write(`${value}\n`),
});
