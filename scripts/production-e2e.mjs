import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const temporaryBase = resolve(tmpdir());
const directory = mkdtempSync(join(temporaryBase, 'payload-production-e2e-'));
// Dedicated local evidence history; never point acceptance tests at operator data.
// The GAT case uses the separately bootstrapped, verified execution copy when GAT_INTEGRATION=1.
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', 'playwright.production.config.ts'], {
  windowsHide: true, stdio: 'inherit', env: { ...process.env, PRODUCTION_E2E: '1',
    PAYLOAD_PRODUCTION_LOCAL: '1', PAYLOAD_PRODUCTION_DIR: directory,
    // The source readback reads an isolated, empty qualification root here: acceptance never reads operator captures.
    PAYLOAD_SOURCE_QUALIFICATION_DIR: join(directory, 'source-qualification') },
});
child.on('error', () => { console.error('Unable to launch local production HTTP tests.'); process.exitCode = 1; });
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
  if (code === 0 && resolve(directory).startsWith(`${temporaryBase}${sep}payload-production-e2e-`)) {
    rmSync(directory, { recursive: true, force: true });
  } else console.error(`Isolated test history preserved for inspection: ${directory}`);
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
