import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { StateKernelError } from './errors';
import type { KernelCommand, NotationState } from './types';

export const MAX_KERNEL_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/** Fixed local executable, no shell, no caller-selected executable or command-line flags. */
export function evaluateKernel(commands: readonly KernelCommand[]): Promise<NotationState> {
  const input = JSON.stringify({ schema: 'notations.state-kernel-request.v1', commands });
  if (Buffer.byteLength(input) > MAX_KERNEL_INPUT_BYTES) throw new StateKernelError('CAPACITY', 'The command history exceeds 2 MiB.', 409);
  const executable = join(process.cwd(), 'native', 'state-kernel', 'target', 'debug',
    process.platform === 'win32' ? 'notations-state-kernel.exe' : 'notations-state-kernel');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let failed = false;
    const fail = () => {
      if (failed) return;
      failed = true; clearTimeout(timer); child.kill();
      reject(new StateKernelError('KERNEL_UNAVAILABLE', 'The local Rust kernel could not complete. Build it with npm run kernel:build.', 503));
    };
    const timer = setTimeout(fail, 10_000);
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('data', (data: Buffer) => {
      outputBytes += data.length;
      if (outputBytes > MAX_OUTPUT_BYTES) fail();
      else chunks.push(data);
    });
    // Never relay native stderr (which can include host paths) to the browser.
    child.stderr.on('data', (data: Buffer) => { outputBytes += data.length; if (outputBytes > MAX_OUTPUT_BYTES) fail(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed) return;
      try {
        const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        if (code === 0 && result.ok === true && result.state?.schema === 'notations.notation-state.v1' &&
            result.state.revision === commands.length && Array.isArray(result.state.notations) && Array.isArray(result.state.relations)) {
          resolve(result.state as NotationState); return;
        }
        if (code === 1 && result.ok === false && typeof result.error?.code === 'string' &&
            /^[A-Z_]{1,64}$/.test(result.error.code) && typeof result.error.message === 'string' && result.error.message.length <= 256) {
          reject(new StateKernelError(result.error.code, result.error.message, 400)); return;
        }
      } catch { /* Invalid or incomplete native response is not successful execution. */ }
      fail();
    });
    child.stdin.end(input);
  });
}
