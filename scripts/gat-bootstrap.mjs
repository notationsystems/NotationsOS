/** Operator-only bootstrap: no GAT install/build hooks; exact source and wheel. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireRegularPath, verifyGatSource } from './gat-source.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(workspace, 'src/gat/engine-pin.json'), 'utf8'));
const root = join(workspace, '.payload/gat-runtime');
const engine = join(root, 'engine');
const venv = join(root, 'venv');
const python = join(venv, 'Scripts/python.exe');
const wheel = join(root, 'wheels', pin.wheel.filename);
const sourcePython = process.argv[2];
if (!sourcePython || process.argv.length !== 3) throw new Error('Usage: node scripts/gat-bootstrap.mjs ABSOLUTE_PYTHON_3_12_14_PATH');
if (!isAbsolute(sourcePython)) throw new Error('The bootstrap interpreter must be an absolute operator-selected file path.');
requireRegularPath(sourcePython);
if (!lstatSync(sourcePython).isFile()) throw new Error('The bootstrap interpreter must be a regular file.');
if (process.platform !== pin.platform || process.arch !== pin.architecture) throw new Error('This reviewed dependency pin supports Windows x64 only.');
requireRegularPath(workspace);
mkdirSync(root, { recursive: true }); requireRegularPath(root);
for (const name of ['tmp', 'cache', 'wheels', 'scratch']) { mkdirSync(join(root, name), { recursive: true }); requireRegularPath(join(root, name)); }
const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PIP_|PYTHON)/i.test(key)));
const env = { ...inherited, TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
  PIP_CONFIG_FILE: 'NUL', PIP_CACHE_DIR: join(root, 'cache'), PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONDONTWRITEBYTECODE: '1' };
const run = (file, args, timeout = 120_000) => execFileSync(file, args, { cwd: workspace, env, windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 });
if (run(sourcePython, ['-I', '-c', 'import platform; print(platform.python_version())']).toString().trim() !== pin.pythonVersion) throw new Error('Python version differs from pin.');
if (!existsSync(engine)) {
  run('git', ['-c', 'core.hooksPath=NUL', '-c', 'core.autocrlf=false', 'clone', '--no-checkout', '--filter=blob:none', `${pin.engineRepository}.git`, engine]);
  run('git', ['-C', engine, '-c', 'core.hooksPath=NUL', '-c', 'core.autocrlf=false', 'checkout', '--detach', pin.engineCommit]);
}
requireRegularPath(engine);
if (run('git', ['-C', engine, 'rev-parse', 'HEAD']).toString().trim() !== pin.engineCommit) throw new Error('Execution copy has another revision; preserve it and inspect.');
verifyGatSource(engine, pin);
if (!existsSync(wheel)) {
  const response = await fetch(pin.wheel.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || Number(response.headers.get('content-length')) !== pin.wheel.size) throw new Error('Unexpected wheel response.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > pin.wheel.size) throw new Error('Oversized wheel.'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== pin.wheel.size || createHash('sha256').update(bytes).digest('hex') !== pin.wheel.sha256) throw new Error('Wheel integrity failed.');
  writeFileSync(wheel, bytes, { flag: 'wx' });
}
requireRegularPath(wheel);
if (createHash('sha256').update(readFileSync(wheel)).digest('hex') !== pin.wheel.sha256) throw new Error('Preserved wheel differs from pin.');
if (!existsSync(venv)) run(sourcePython, ['-I', '-m', 'venv', venv]);
requireRegularPath(python);
run(python, ['-I', '-m', 'pip', 'install', '--no-index', '--no-deps', '--no-cache-dir', '--no-compile', wheel]);
console.log(JSON.stringify({ ready: true, engineCommit: pin.engineCommit, sourceTreeDigest: pin.sourceTreeDigest,
  pythonVersion: pin.pythonVersion, numpyVersion: pin.numpyVersion, wheelSha256: pin.wheel.sha256 }));
