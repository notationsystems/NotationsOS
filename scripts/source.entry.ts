import { runSourceCli } from '../src/acquisition/cli';

process.exitCode = await runSourceCli(process.argv.slice(2), {
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
});
