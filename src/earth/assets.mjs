/** Server/build-only validation of the local Cesium distribution. No network or corpus authority. */
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export const EARTH_ASSET_VERSION = '1.124.0';
export const EARTH_ASSET_SCHEMA = 'payload.earth-assets.v1';
const PARTS = ['Assets', 'Workers', 'Widgets', 'ThirdParty'];
const TOP_FILES = ['index.js', 'LICENSE.md', 'ThirdParty.json', 'ThirdParty.extra.json'];
const MAX_FILES = 2048;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 512 * 1024;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function stat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(path, create = false) {
  if (!stat(path) && create) mkdirSync(path);
  const value = stat(path);
  if (!value || !value.isDirectory() || value.isSymbolicLink()) fail('EARTH_ASSET_DIRECTORY_INVALID');
}
function bytes(path, maximum = MAX_FILE_BYTES) {
  const before = stat(path);
  if (!before || !before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maximum) fail('EARTH_ASSET_FILE_INVALID');
  const fd = openSync(path, 'r');
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.size !== before.size || opened.size > maximum) fail('EARTH_ASSET_FILE_CHANGED');
    const content = Buffer.alloc(opened.size + 1);
    let size = 0;
    while (size < content.length) {
      const count = readSync(fd, content, size, content.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size !== opened.size || fstatSync(fd).size !== opened.size) fail('EARTH_ASSET_FILE_CHANGED');
    return content.subarray(0, size);
  } finally { closeSync(fd); }
}
function sha256(content) { return `sha256:${createHash('sha256').update(content).digest('hex')}`; }
function pathAllowed(path) {
  const parts = path.split('/');
  return path.length <= 240 && parts.length <= 12 && parts.every((part) => /^[A-Za-z0-9_+@.-]+$/.test(part)
    && part !== '.' && part !== '..' && !part.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
    && (TOP_FILES.includes(path) || (parts.length > 1 && PARTS.includes(parts[0])));
}
function entry(path, content) { return { path, byteLength: content.length, sha256: sha256(content) }; }
function payload(files) {
  return { schema: EARTH_ASSET_SCHEMA, engine: 'CesiumJS', version: EARTH_ASSET_VERSION, license: 'Apache-2.0',
    files, totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0) };
}
function manifestFor(files) {
  const content = payload(files);
  return { ...content, digest: sha256(Buffer.from(JSON.stringify(content))) };
}
function required(files) {
  if (files.length > MAX_FILES || files.reduce((sum, file) => sum + file.byteLength, 0) > MAX_TOTAL_BYTES
    || !TOP_FILES.every((name) => files.some((file) => file.path === name))
    || !files.some((file) => file.path === 'Widgets/widgets.css')
    || !files.some((file) => file.path === 'Assets/Textures/NaturalEarthII/tilemapresource.xml')
    || !files.some((file) => /^Assets\/Textures\/NaturalEarthII\/.+\.jpg$/.test(file.path))
    || !files.some((file) => /^Workers\/.+\.js$/.test(file.path))
    || !files.some((file) => file.path.startsWith('ThirdParty/'))) fail('EARTH_ASSET_INCOMPLETE');
}

/** Inventory exact allowed files; links, unusual entries, oversized trees and unknown roots fail closed. */
function inventory(target, packageRoot = null) {
  directory(target);
  const files = [];
  let total = 0;
  let nodes = 0;
  const add = (path, from) => {
    if (!pathAllowed(path) || files.length >= MAX_FILES) fail('EARTH_ASSET_PATH_INVALID');
    const content = bytes(from);
    total += content.length;
    if (total > MAX_TOTAL_BYTES) fail('EARTH_ASSET_SIZE_LIMIT');
    files.push(entry(path, content));
  };
  const walk = (absolute, prefix, depth = 0) => {
    if (depth > 10) fail('EARTH_ASSET_PATH_INVALID');
    directory(absolute);
    const names = readdirSync(absolute).sort();
    if (names.length > MAX_FILES) fail('EARTH_ASSET_SIZE_LIMIT');
    for (const name of names) {
      if (++nodes > MAX_FILES * 2) fail('EARTH_ASSET_SIZE_LIMIT');
      const path = `${prefix}/${name}`;
      if (!pathAllowed(path)) fail('EARTH_ASSET_PATH_INVALID');
      const location = join(absolute, name);
      const info = stat(location);
      if (!info || info.isSymbolicLink()) fail('EARTH_ASSET_LINK_DISALLOWED');
      if (info.isDirectory()) walk(location, path, depth + 1);
      else add(path, location);
    }
  };
  // The installed Build directory has other builds intentionally not served. The published tree is closed.
  if (!packageRoot && readdirSync(target).some((name) => ![...PARTS, ...TOP_FILES, 'VERSION.json'].includes(name))) fail('EARTH_ASSET_UNEXPECTED_FILE');
  for (const part of PARTS) walk(join(target, part), part);
  for (const file of TOP_FILES) add(file, join(packageRoot && file !== 'index.js' ? packageRoot : target, file));
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  required(files);
  return files;
}

function readManifest(target) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(join(target, 'VERSION.json'), MAX_MANIFEST_BYTES)));
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'digest,engine,files,license,schema,totalBytes,version'
    || !Array.isArray(value.files) || value.files.length > MAX_FILES) fail('EARTH_ASSET_MANIFEST_INVALID');
  let previous = '';
  const files = value.files.map((file) => {
    if (!file || typeof file !== 'object' || Object.keys(file).sort().join(',') !== 'byteLength,path,sha256'
      || typeof file.path !== 'string' || !pathAllowed(file.path) || file.path <= previous
      || !Number.isSafeInteger(file.byteLength) || file.byteLength < 1 || file.byteLength > MAX_FILE_BYTES
      || typeof file.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(file.sha256)) fail('EARTH_ASSET_MANIFEST_INVALID');
    previous = file.path;
    return { path: file.path, byteLength: file.byteLength, sha256: file.sha256 };
  });
  required(files);
  const expected = manifestFor(files);
  for (const field of ['schema', 'engine', 'version', 'license', 'totalBytes', 'digest']) if (value[field] !== expected[field]) fail('EARTH_ASSET_MANIFEST_INVALID');
  return expected;
}
function verifyTarget(target) {
  directory(target);
  const manifest = readManifest(target);
  if (JSON.stringify(manifest.files) !== JSON.stringify(inventory(target))) fail('EARTH_ASSET_CONTENT_MISMATCH');
  return manifest;
}

/** Read-only readiness. Hashes are local integrity checks, not independent vendor attestation. */
export function inspectEarthAssets(root = process.cwd()) {
  try {
    const base = resolve(root);
    directory(base); directory(join(base, 'public'));
    const manifest = verifyTarget(join(base, 'public', 'cesium'));
    return { state: 'READY', code: null, version: EARTH_ASSET_VERSION, manifestDigest: manifest.digest,
      fileCount: manifest.files.length, totalBytes: manifest.totalBytes, independentVerification: false };
  } catch {
    return { state: 'UNAVAILABLE', code: 'EARTH_ASSETS_UNVERIFIED', version: EARTH_ASSET_VERSION,
      manifestDigest: null, fileCount: 0, totalBytes: 0, independentVerification: false };
  }
}

/** Create a complete package atomically; never erase or repair an existing generated bundle implicitly. */
export function prepareEarthAssets(root = process.cwd()) {
  const base = resolve(root);
  directory(base);
  const packageRoot = join(base, 'node_modules', 'cesium');
  for (const path of [join(base, 'node_modules'), packageRoot, join(packageRoot, 'Build')]) directory(path);
  const installed = JSON.parse(bytes(join(packageRoot, 'package.json'), MAX_MANIFEST_BYTES).toString('utf8'));
  const project = JSON.parse(bytes(join(base, 'package.json'), MAX_MANIFEST_BYTES).toString('utf8'));
  if (installed.name !== 'cesium' || installed.version !== EARTH_ASSET_VERSION || project.dependencies?.cesium !== EARTH_ASSET_VERSION) fail('EARTH_ASSET_VERSION_MISMATCH');
  const source = join(packageRoot, 'Build', 'Cesium');
  const manifest = manifestFor(inventory(source, packageRoot));
  const publicRoot = join(base, 'public');
  directory(publicRoot, true);
  const scratch = join(base, '.stamp');
  directory(scratch, true);
  const lock = join(scratch, 'earth-assets.lock');
  try { mkdirSync(lock); } catch { fail('EARTH_ASSET_PREPARATION_BUSY'); }
  let stage;
  try {
    const target = join(publicRoot, 'cesium');
    if (stat(target)) {
      let existing;
      try { existing = verifyTarget(target); } catch { fail('EARTH_ASSET_EXISTING_UNVERIFIED'); }
      if (existing.digest !== manifest.digest) fail('EARTH_ASSET_EXISTING_MISMATCH');
      const readiness = inspectEarthAssets(base);
      if (readiness.state !== 'READY') fail('EARTH_ASSET_PUBLICATION_UNVERIFIED');
      return { status: 'EXISTING', ...readiness };
    }
    stage = mkdtempSync(join(scratch, 'earth-assets-stage-'));
    for (const file of manifest.files) {
      const path = file.path.split('/');
      let destination = stage;
      for (const part of path.slice(0, -1)) { destination = join(destination, part); directory(destination, true); }
      const original = path.length === 1 && file.path !== 'index.js' ? join(packageRoot, file.path) : join(source, ...path);
      const content = bytes(original);
      if (JSON.stringify(entry(file.path, content)) !== JSON.stringify(file)) fail('EARTH_ASSET_SOURCE_CHANGED');
      writeFileSync(join(stage, ...path), content, { flag: 'wx' });
    }
    const encoded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    if (encoded.length > MAX_MANIFEST_BYTES) fail('EARTH_ASSET_SIZE_LIMIT');
    writeFileSync(join(stage, 'VERSION.json'), encoded, { flag: 'wx' });
    verifyTarget(stage);
    if (stat(target)) fail('EARTH_ASSET_PREPARATION_CONFLICT');
    renameSync(stage, target);
    stage = undefined;
    const readiness = inspectEarthAssets(base);
    if (readiness.state !== 'READY') fail('EARTH_ASSET_PUBLICATION_UNVERIFIED');
    return { status: 'CREATED', ...readiness };
  } finally {
    try {
      // Only our concrete, newly-created temporary tree is eligible for recursive cleanup.
      if (stage) {
        const selected = resolve(stage);
        if (dirname(selected) !== scratch || !basename(selected).startsWith('earth-assets-stage-')
          || relative(scratch, selected).includes(sep) || stat(selected)?.isSymbolicLink()) fail('EARTH_ASSET_CLEANUP_REFUSED');
        rmSync(selected, { recursive: true });
      }
    } finally { rmdirSync(lock); }
  }
}
