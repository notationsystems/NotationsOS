import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Explicit opt-in, loopback only. Build the fixed Rust executable before starting.
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', process.env.PORT ?? '3000'], {
  windowsHide: true, stdio: 'inherit', env: { ...process.env, PAYLOAD_STATE_KERNEL_LOCAL: '1' },
});
child.on('error', () => { console.error('Unable to start the local notation workspace.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
