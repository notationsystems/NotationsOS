import { executeIntakeCli } from '../src/data-os/intake-cli';

try {
  const result = executeIntakeCli(process.argv.slice(2));
  console.log('help' in result ? result.help : JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ mode: 'LOCAL_DEVELOPMENT', error: error instanceof Error ? error.message : 'Local intake failed.' }));
  process.exitCode = 1;
}
