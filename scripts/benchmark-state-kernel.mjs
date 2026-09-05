import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryBase = realpathSync(tmpdir());
const prefix = 'notations-state-benchmark-';
const nativePath = join(repositoryRoot, 'native', 'state-kernel', 'target', 'debug',
  process.platform === 'win32' ? 'notations-state-kernel.exe' : 'notations-state-kernel');
const savedVersions = 63;
const commandsPerVersion = 4;
const body = 'x'.repeat(1024);
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const filename = (version) => `${String(version).padStart(6, '0')}.json`;
const request = (baseVersion, commands) => ({ schema: 'payload.notation-command-batch.v1', baseVersion, commands });

function command(index) {
  return index === 1
    ? { kind: 'CREATE_NOTATION', commandId: `command-${index}`, notation: { id: 'benchmark-notation', title: `Revision ${index}`, body } }
    : { kind: 'UPDATE_NOTATION', commandId: `command-${index}`, notationId: 'benchmark-notation', title: `Revision ${index}`, body };
}
function versionBytes(root) {
  return Object.fromEntries(readdirSync(root).sort().map((name) => [name, hash(readFileSync(join(root, name)))]));
}
function commandVersion(executable, args) {
  try { return childProcess.execFileSync(executable, args, { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim(); }
  catch { return 'unavailable'; }
}
function aggregate(samples, field) {
  const times = samples.map((sample) => sample[field].elapsedMs).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  return { minMs: times[0], medianMs: times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2,
    maxMs: times[times.length - 1] };
}
function cleanOwnedTemporary(directory) {
  const target = resolve(directory);
  assert.equal(dirname(target), temporaryBase, 'Cleanup must stay immediately within the OS temporary directory.');
  assert.ok(basename(target).startsWith(prefix), 'Cleanup requires the benchmark-owned name.');
  assert.equal(realpathSync(target), target, 'Cleanup must not follow a replaced temporary directory.');
  const stat = lstatSync(target);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Cleanup requires the original regular directory.');
  rmSync(target, { recursive: true, force: false });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/benchmark-state-kernel.mjs [--samples 1..10]\nBuild first: npm run kernel:build\nUses only a unique OS temporary workspace; failed artifacts are preserved.');
    return;
  }
  const samplesCount = args.length === 0 ? 3 : args.length === 2 && args[0] === '--samples' && /^(?:[1-9]|10)$/.test(args[1]) ? Number(args[1]) : null;
  assert.notEqual(samplesCount, null, 'Use --samples with an integer from 1 to 10.');
  assert.equal(resolve(process.cwd()), repositoryRoot, 'Run the benchmark from the repository root.');
  assert.ok(existsSync(nativePath), 'Build the real Rust executable with npm run kernel:build before benchmarking.');
  const nativeDigest = hash(readFileSync(nativePath));
  const sourcePaths = ['src/state-kernel/store.ts', 'src/state-kernel/runtime.ts', 'src/state-kernel/types.ts',
    'src/data-os/local-record.ts', 'src/data-os/local-files.ts', 'native/state-kernel/src/lib.rs', 'native/state-kernel/src/main.rs', 'native/state-kernel/Cargo.lock'];
  const sourceDigests = Object.fromEntries(sourcePaths.map((path) => [path, hash(readFileSync(join(repositoryRoot, path)))]));
  const directory = mkdtempSync(join(temporaryBase, prefix));
  console.error(`Isolated benchmark artifacts: ${directory} (removed only after all checks pass).`);
  const originalSpawn = childProcess.spawn;
  let invocations = 0;
  // Instrument only this harness process. The compiled store/runtime still call
  // the real fixed native executable; no evaluator, validation, or I/O is mocked.
  childProcess.spawn = function countedSpawn(executable, ...args) {
    if (typeof executable === 'string' && resolve(executable) === nativePath) invocations += 1;
    return originalSpawn.call(this, executable, ...args);
  };
  syncBuiltinESMExports();
  try {
    const bundled = await build({ stdin: {
      contents: 'export { createNotationRepository } from "./src/state-kernel/store.ts"; export { evaluateKernel } from "./src/state-kernel/runtime.ts"; export { encodeLocalRecord, localRecordDigest } from "./src/data-os/local-record.ts"; export { publishImmutableFile } from "./src/data-os/local-files.ts";',
      resolveDir: repositoryRoot, sourcefile: 'state-kernel-benchmark-entry.ts', loader: 'ts',
    }, bundle: true, platform: 'node', format: 'esm', target: 'node20', write: false, logLevel: 'silent' });
    const bundlePath = join(directory, 'repository.mjs');
    writeFileSync(bundlePath, bundled.outputFiles[0].contents, { flag: 'wx' });
    const { createNotationRepository, evaluateKernel, encodeLocalRecord, localRecordDigest, publishImmutableFile } = await import(pathToFileURL(bundlePath).href);
    const baseline = join(directory, 'baseline-63');
    const allCommands = [];
    let previousDigest = null;
    const setupStart = performance.now();
    const setupInvocations = invocations;
    // Setup is deliberately not 63 calls to save(): construct genuine immutable
    // version records with real evaluation of every prefix and normal digests.
    for (let version = 1; version <= savedVersions; version += 1) {
      const commands = Array.from({ length: commandsPerVersion }, (_, offset) => command(allCommands.length + offset + 1));
      allCommands.push(...commands);
      const state = await evaluateKernel(allCommands);
      const payload = { schema: 'payload.notation-saved-version.v1', version, previousDigest,
        request: request(version - 1, commands), state };
      const digest = localRecordDigest(payload, 8 * 1024 * 1024);
      publishImmutableFile(baseline, [filename(version)], encodeLocalRecord({ ...payload, digest }, 8 * 1024 * 1024), 8 * 1024 * 1024);
      previousDigest = digest;
    }
    const setup = { mode: 'REAL_NATIVE_PREFIX_EVALUATION_AND_IMMUTABLE_FIXTURE_PUBLICATION',
      elapsedMs: performance.now() - setupStart, nativeInvocations: invocations - setupInvocations };
    assert.equal(setup.nativeInvocations, 63);
    const originals = versionBytes(baseline);
    assert.equal(Object.keys(originals).length, 63);
    const nextCommands = [253, 254, 255].map(command);
    const finalRequest = request(63, nextCommands);
    const samples = [];
    for (let index = 1; index <= samplesCount; index += 1) {
      const root = join(directory, `sample-${index}`);
      cpSync(baseline, root, { recursive: true, errorOnExist: true, force: false });
      const repository = createNotationRepository(root);
      const readInvocations = invocations;
      const readStart = performance.now();
      const loaded = await repository.read();
      const load = { elapsedMs: performance.now() - readStart, nativeInvocations: invocations - readInvocations };
      assert.equal(loaded.savedVersion, 63);
      assert.equal(loaded.savedDigest, previousDigest);
      assert.equal(loaded.state.revision, 252);
      assert.equal(load.nativeInvocations, 63);
      const saveInvocations = invocations;
      const saveStart = performance.now();
      const saved = await repository.save(finalRequest);
      const save = { elapsedMs: performance.now() - saveStart, nativeInvocations: invocations - saveInvocations };
      assert.equal(saved.savedVersion, 64);
      assert.equal(saved.state.revision, 255);
      assert.equal(saved.state.notations[0].title, 'Revision 255');
      assert.equal(saved.canonicalAdmission, false);
      assert.equal(save.nativeInvocations, 192);
      const after = versionBytes(root);
      assert.equal(Object.keys(after).length, 64, 'Only the new immutable version may remain; no lock or temporary file.');
      for (const [name, digest] of Object.entries(originals)) assert.equal(after[name], digest, `Prior version changed: ${name}`);
      assert.deepEqual(versionBytes(baseline), originals, 'The setup baseline must not change.');
      const sample = { index, load, save, priorVersionsUnchanged: true, savedVersion: saved.savedVersion,
        savedRevision: saved.state.revision, savedDigest: saved.savedDigest };
      samples.push(sample);
      console.error(`Sample ${index}/${samplesCount}: load ${load.elapsedMs.toFixed(1)} ms / ${load.nativeInvocations} native calls; save ${save.elapsedMs.toFixed(1)} ms / ${save.nativeInvocations} native calls.`);
    }
    assert.deepEqual(Object.fromEntries(sourcePaths.map((path) => [path, hash(readFileSync(join(repositoryRoot, path)))])), sourceDigests,
      'Measured source files changed during the run; retry against stable sources.');
    assert.equal(hash(readFileSync(nativePath)), nativeDigest, 'The measured native executable changed during the run.');
    const report = { schema: 'notations.state-kernel-benchmark.v1', measuredAt: new Date().toISOString(),
      environment: { platform: platform(), release: release(), arch: arch(), node: process.version,
        rustc: commandVersion('rustc', ['--version']), cargo: commandVersion('cargo', ['--version']),
        cpu: cpus()[0]?.model ?? 'unavailable', logicalCpus: cpus().length, totalMemoryBytes: totalmem(),
        gitHead: commandVersion('git', ['rev-parse', 'HEAD']), nativeProfile: 'debug', nativeDigest },
      sourceDigests, setup, fixture: { savedVersions: 63, commandsPerVersion: 4, commandsBefore: 252,
        commandsAfter: 255, liveNotations: 1, liveRelations: 0, notationBodyAsciiBytes: body.length,
        finalNativeInputBytes: Buffer.byteLength(JSON.stringify({ schema: 'notations.state-kernel-request.v1', commands: [...allCommands, ...nextCommands] })),
        savedVersionFilesBytes: Object.keys(originals).reduce((sum, name) => sum + readFileSync(join(baseline, name)).byteLength, 0) },
      samples, summary: { load: aggregate(samples, 'load'), save: aggregate(samples, 'save') },
      guarantees: { realNativeEvaluation: true, everySavedPrefixReplayed: true, digestChainChecked: true,
        saveLockAndReadbackUnchanged: true, priorVersionBytesPreserved: true, productionLimitsChanged: false,
        operatorHistoryAccessed: false, isolatedArtifactsRemoved: false } };
    writeFileSync(join(directory, 'benchmark-result.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    cleanOwnedTemporary(directory);
    report.guarantees.isolatedArtifactsRemoved = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`Benchmark failed; preserve and inspect isolated artifacts at: ${directory}`);
    throw error;
  } finally {
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Benchmark failed.'); process.exitCode = 1; });
