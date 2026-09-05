import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const temporaryBase = resolve(tmpdir());
const directory = mkdtempSync(join(temporaryBase, 'notations-state-e2e-'));
// Run serial browsers against their own empty saved history, never the operator's .payload.
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', 'playwright.state-kernel.config.ts'], {
  windowsHide: true, stdio: 'inherit', env: { ...process.env, STATE_KERNEL_E2E: '1',
    PAYLOAD_STATE_KERNEL_LOCAL: '1', PAYLOAD_NOTATION_STATE_DIR: directory },
});
child.on('error', () => { console.error('Unable to launch the notation state browser tests.'); process.exitCode = 1; });
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
  if (code === 0 && resolve(directory).startsWith(`${temporaryBase}${sep}notations-state-e2e-`)) {
    rmSync(directory, { recursive: true, force: true });
  } else console.error(`Isolated test history preserved for inspection: ${directory}`);
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
