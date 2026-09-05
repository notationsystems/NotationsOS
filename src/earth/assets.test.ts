import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EARTH_ENGINE } from '@/domain/earth';
import projectPackage from '../../package.json';
import { EARTH_ASSET_SCHEMA, EARTH_ASSET_VERSION, inspectEarthAssets, prepareEarthAssets } from './assets.mjs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync), renameSync: vi.fn(actual.renameSync) };
});

interface AssetEntry { path: string; byteLength: number; sha256: string }
interface AssetManifest {
  schema: string; engine: string; version: string; license: string;
  files: AssetEntry[]; totalBytes: number; digest: string;
}

const ASSETS: Record<string, string> = {
  'index.js': 'export const VERSION = "1.124.0";',
  'LICENSE.md': 'Synthetic Apache-2.0 license fixture.',
  'ThirdParty.json': '{"synthetic":"license metadata"}',
  'ThirdParty.extra.json': '{"synthetic":"extra attribution"}',
  'Assets/Textures/NaturalEarthII/tilemapresource.xml': '<TileMap/>',
  'Assets/Textures/NaturalEarthII/0/0/0.jpg': 'synthetic image bytes',
  'Assets/IAU2006_XYS/XYS_0.json': '{"samples":[0]}',
  'Workers/createGeometry.js': 'export default () => null;',
  'Workers/nested/worker.js': 'export const synthetic = true;',
  'Widgets/widgets.css': '.cesium-widget { position: relative; }',
  'ThirdParty/Workers/decoder.js': 'export const decoder = true;',
};
const PACKAGE_LICENSES = new Set(['LICENSE.md', 'ThirdParty.json', 'ThirdParty.extra.json']);
const sha256 = (bytes: Buffer | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
let temporary: string;
let root: string;
let packageRoot: string;
let source: string;
let target: string;
let scratch: string;

const realWrite = vi.mocked(writeFileSync).getMockImplementation()!;
const realRename = vi.mocked(renameSync).getMockImplementation()!;

function write(path: string, bytes: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
function seed() {
  write(join(root, 'package.json'), JSON.stringify({ name: 'earth-test', dependencies: { cesium: EARTH_ASSET_VERSION } }));
  write(join(packageRoot, 'package.json'), JSON.stringify({ name: 'cesium', version: EARTH_ASSET_VERSION }));
  for (const [path, bytes] of Object.entries(ASSETS)) write(join(PACKAGE_LICENSES.has(path) ? packageRoot : source, path), bytes);
}
function manifest(): AssetManifest {
  return JSON.parse(readFileSync(join(target, 'VERSION.json'), 'utf8')) as AssetManifest;
}
function saveManifest(value: AssetManifest) { writeFileSync(join(target, 'VERSION.json'), `${JSON.stringify(value)}\n`); }
function rehash(value: AssetManifest) {
  const { digest: _digest, ...payload } = value;
  void _digest;
  value.digest = sha256(JSON.stringify(payload));
  return value;
}
function snapshot(directory: string, prefix = ''): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    const key = prefix ? `${prefix}/${name}` : name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return [[key, 'LINK']];
    if (stat.isDirectory()) return [[`${key}/`, 'DIRECTORY'], ...Object.entries(snapshot(path, key))];
    return [[key, sha256(readFileSync(path))]];
  }));
}
function unavailable() {
  expect(inspectEarthAssets(root)).toEqual({
    state: 'UNAVAILABLE', code: 'EARTH_ASSETS_UNVERIFIED', version: EARTH_ASSET_VERSION,
    manifestDigest: null, fileCount: 0, totalBytes: 0, independentVerification: false,
  });
}
function noStage() {
  expect(existsSync(join(scratch, 'earth-assets.lock'))).toBe(false);
  expect(existsSync(scratch) ? readdirSync(scratch).filter((name) => name.startsWith('earth-assets-stage-')) : []).toEqual([]);
}

beforeEach(() => {
  vi.mocked(writeFileSync).mockReset().mockImplementation(realWrite);
  vi.mocked(renameSync).mockReset().mockImplementation(realRename);
  temporary = mkdtempSync(join(tmpdir(), 'payload-earth-assets-test-'));
  root = join(temporary, 'project');
  packageRoot = join(root, 'node_modules', 'cesium');
  source = join(packageRoot, 'Build', 'Cesium');
  target = join(root, 'public', 'cesium');
  scratch = join(root, '.stamp');
  seed();
});
afterEach(() => {
  vi.mocked(writeFileSync).mockReset().mockImplementation(realWrite);
  vi.mocked(renameSync).mockReset().mockImplementation(realRename);
  const selected = resolve(temporary);
  if (dirname(selected) !== resolve(tmpdir()) || !relative(tmpdir(), selected).startsWith('payload-earth-assets-test-')
    || relative(tmpdir(), selected).includes(sep)) throw new Error('Refusing cleanup outside the owned test directory.');
  rmSync(selected, { recursive: true, force: true });
});

describe('Earth static asset publication and read-only integrity', () => {
  it('pins the build, runtime inspector and installed project dependency to the same exact engine', () => {
    expect(EARTH_ASSET_VERSION).toBe('1.124.0');
    expect(EARTH_ENGINE.version).toBe(EARTH_ASSET_VERSION);
    expect(projectPackage.dependencies.cesium).toBe(EARTH_ASSET_VERSION);
    expect(EARTH_ASSET_SCHEMA).toBe('payload.earth-assets.v1');
  });

  it('copies every selected descendant and all license metadata, with a complete deterministic byte manifest', () => {
    const before = snapshot(packageRoot);
    const result = prepareEarthAssets(root);
    expect(result).toMatchObject({ status: 'CREATED', state: 'READY', fileCount: Object.keys(ASSETS).length, independentVerification: false });
    const saved = manifest();
    const entries = Object.entries(ASSETS).map(([path, bytes]) => ({ path, byteLength: Buffer.byteLength(bytes), sha256: sha256(bytes) }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    expect(saved.files).toEqual(entries);
    expect(saved).toEqual(rehash({ schema: EARTH_ASSET_SCHEMA, engine: 'CesiumJS', version: EARTH_ASSET_VERSION,
      license: 'Apache-2.0', files: entries, totalBytes: entries.reduce((sum, file) => sum + file.byteLength, 0), digest: '' }));
    expect(result.manifestDigest).toBe(saved.digest);
    for (const [path, bytes] of Object.entries(ASSETS)) expect(readFileSync(join(target, path), 'utf8')).toBe(bytes);
    expect(snapshot(packageRoot)).toEqual(before);
    noStage();
  });

  it('reuses an identical publication without rewriting content, manifest, or timestamps', () => {
    prepareEarthAssets(root);
    const before = snapshot(target);
    const beforeStat = lstatSync(join(target, 'VERSION.json'));
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(renameSync).mockClear();
    expect(prepareEarthAssets(root)).toMatchObject({ status: 'EXISTING', state: 'READY' });
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(renameSync).not.toHaveBeenCalled();
    expect(snapshot(target)).toEqual(before);
    expect(lstatSync(join(target, 'VERSION.json')).mtimeMs).toBe(beforeStat.mtimeMs);
    noStage();
  });

  it('does not create any filesystem state when readiness is inspected before publication', () => {
    const before = snapshot(root);
    unavailable();
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(join(root, 'public'))).toBe(false);
    expect(existsSync(scratch)).toBe(false);
    expect(inspectEarthAssets(join(temporary, 'does-not-exist')).state).toBe('UNAVAILABLE');
    expect(existsSync(join(temporary, 'does-not-exist'))).toBe(false);
  });

  it.each(['PACKAGE_NAME', 'PACKAGE_VERSION', 'PROJECT_VERSION', 'PROJECT_RANGE', 'PROJECT_MISSING'] as const)(
    'refuses an unpinned or mismatched installed dependency: %s', (variant) => {
      const installed = { name: 'cesium', version: EARTH_ASSET_VERSION };
      const project: { dependencies: { cesium?: string } } = { dependencies: { cesium: EARTH_ASSET_VERSION } };
      if (variant === 'PACKAGE_NAME') installed.name = 'not-cesium';
      if (variant === 'PACKAGE_VERSION') installed.version = '1.125.0';
      if (variant === 'PROJECT_VERSION') project.dependencies.cesium = '1.125.0';
      if (variant === 'PROJECT_RANGE') project.dependencies.cesium = '^1.124.0';
      if (variant === 'PROJECT_MISSING') delete project.dependencies.cesium;
      writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(installed));
      writeFileSync(join(root, 'package.json'), JSON.stringify(project));
      const before = snapshot(root);
      expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_VERSION_MISMATCH');
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(['index.js', 'Widgets/widgets.css', 'Workers/nested/worker.js', 'Assets/Textures/NaturalEarthII/0/0/0.jpg', 'LICENSE.md'])(
    'rejects changed bytes in %s even when the replacement has the same length', (path) => {
      prepareEarthAssets(root);
      const original = readFileSync(join(target, path));
      writeFileSync(join(target, path), Buffer.alloc(original.length, 120));
      const damaged = snapshot(target);
      unavailable();
      expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_EXISTING_UNVERIFIED');
      expect(snapshot(target)).toEqual(damaged);
      noStage();
    },
  );

  it.each(['index.js', 'Widgets/widgets.css', 'Workers/nested/worker.js', 'Assets/Textures/NaturalEarthII/0/0/0.jpg', 'ThirdParty.extra.json', 'VERSION.json'])(
    'does not silently repair a missing published file: %s', (path) => {
      prepareEarthAssets(root);
      unlinkSync(join(target, path));
      const damaged = snapshot(target);
      unavailable();
      expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_EXISTING_UNVERIFIED');
      expect(snapshot(target)).toEqual(damaged);
      noStage();
    },
  );

  it.each(['SCHEMA', 'VERSION', 'ENGINE', 'LICENSE', 'DIGEST', 'TOTAL', 'ORDER', 'DUPLICATE', 'HASH', 'LENGTH', 'EXTRA_FIELD', 'EXTRA_ENTRY_FIELD', 'TRAVERSAL', 'ABSOLUTE', 'BACKSLASH'] as const)(
    'rejects a malformed or internally inconsistent manifest: %s', (variant) => {
      prepareEarthAssets(root);
      const value = manifest();
      if (variant === 'SCHEMA') value.schema = 'payload.earth-assets.v0';
      if (variant === 'VERSION') value.version = '1.125.0';
      if (variant === 'ENGINE') value.engine = 'another-engine';
      if (variant === 'LICENSE') value.license = 'MIT';
      if (variant === 'DIGEST') value.digest = `sha256:${'0'.repeat(64)}`;
      if (variant === 'TOTAL') value.totalBytes += 1;
      if (variant === 'ORDER') value.files.reverse();
      if (variant === 'DUPLICATE') value.files.splice(1, 0, { ...value.files[0] });
      if (variant === 'HASH') value.files[0].sha256 = `sha256:${'A'.repeat(64)}`;
      if (variant === 'LENGTH') value.files[0].byteLength = 0;
      if (variant === 'EXTRA_FIELD') Object.assign(value, { provider: 'unexpected' });
      if (variant === 'EXTRA_ENTRY_FIELD') Object.assign(value.files[0], { url: 'https://example.invalid' });
      if (variant === 'TRAVERSAL') value.files[0].path = 'Assets/../../outside';
      if (variant === 'ABSOLUTE') value.files[0].path = '/outside';
      if (variant === 'BACKSLASH') value.files[0].path = 'Assets\\outside';
      if (variant !== 'DIGEST') rehash(value);
      saveManifest(value);
      const damaged = snapshot(target);
      unavailable();
      expect(snapshot(target)).toEqual(damaged);
    },
  );

  it.each(['EMPTY', 'BAD_JSON', 'BAD_UTF8', 'OVERSIZED'] as const)('refuses an unreadable manifest: %s', (variant) => {
    prepareEarthAssets(root);
    const bytes = variant === 'EMPTY' ? Buffer.alloc(0) : variant === 'BAD_JSON' ? Buffer.from('{')
      : variant === 'BAD_UTF8' ? Buffer.from([0xff]) : Buffer.alloc(512 * 1024 + 1, 32);
    writeFileSync(join(target, 'VERSION.json'), bytes);
    unavailable();
    expect(readFileSync(join(target, 'VERSION.json'))).toEqual(bytes);
  });

  it.each(['extra.js', 'Workers/unknown.js'])( 'rejects unreceipted extra files at any depth: %s', (path) => {
    prepareEarthAssets(root);
    write(join(target, path), 'not in the manifest');
    unavailable();
    expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_EXISTING_UNVERIFIED');
    expect(readFileSync(join(target, path), 'utf8')).toBe('not in the manifest');
  });

  it('refuses a changed source package rather than replacing a valid published bundle', () => {
    prepareEarthAssets(root);
    const before = snapshot(target);
    writeFileSync(join(source, 'index.js'), 'new package bytes under the same version');
    expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_EXISTING_MISMATCH');
    expect(snapshot(target)).toEqual(before);
    expect(inspectEarthAssets(root).state).toBe('READY');
    noStage();
  });

  it.each(['FILE_SIZE', 'TOTAL_SIZE', 'FILE_COUNT', 'DIRECTORY_DEPTH', 'PATH_LENGTH', 'UNSAFE_NAME'] as const)(
    'bounds the package tree before publication: %s', (variant) => {
      if (variant === 'FILE_SIZE') write(join(source, 'Workers/too-large.js'), Buffer.alloc(16 * 1024 * 1024 + 1));
      if (variant === 'TOTAL_SIZE') for (let index = 0; index < 4; index += 1) write(join(source, `Workers/large-${index}.js`), Buffer.alloc(16 * 1024 * 1024));
      if (variant === 'FILE_COUNT') for (let index = 0; index < 2049; index += 1) write(join(source, `Workers/many-${index}.js`), 'x');
      if (variant === 'DIRECTORY_DEPTH') write(join(source, 'Workers', ...Array<string>(13).fill('nested'), 'x.js'), 'x');
      if (variant === 'PATH_LENGTH') write(join(source, 'Workers', 'a'.repeat(100), 'b'.repeat(100), 'c'.repeat(50), 'x.js'), 'x');
      if (variant === 'UNSAFE_NAME') write(join(source, 'Workers', 'unsafe name.js'), 'x');
      expect(() => prepareEarthAssets(root)).toThrow(/EARTH_ASSET_(FILE_INVALID|SIZE_LIMIT|PATH_INVALID)/);
      expect(existsSync(target)).toBe(false);
      noStage();
    },
  );

  it('rejects an incomplete installed package without creating a public target', () => {
    unlinkSync(join(packageRoot, 'LICENSE.md'));
    expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_FILE_INVALID');
    expect(existsSync(target)).toBe(false);
  });

  it.each(['SOURCE', 'TARGET'] as const)('bounds total directory traversal in the %s tree, including empty directories', (variant) => {
    if (variant === 'TARGET') prepareEarthAssets(root);
    const selected = variant === 'SOURCE' ? source : target;
    // Every directory is shallow and contains far fewer than 2,048 children;
    // only the cumulative 4,096-node bound can reject this otherwise tiny tree.
    for (let branch = 0; branch < 64; branch += 1) {
      for (let empty = 0; empty < 64; empty += 1) {
        mkdirSync(join(selected, 'Workers', `branch-${branch}`, `empty-${empty}`), { recursive: true });
      }
    }
    expect(readdirSync(join(selected, 'Workers', 'branch-0'))).toHaveLength(64);
    if (variant === 'SOURCE') {
      expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_SIZE_LIMIT');
      expect(existsSync(target)).toBe(false);
    } else {
      const originalManifest = readFileSync(join(target, 'VERSION.json'));
      unavailable();
      expect(readFileSync(join(target, 'VERSION.json'))).toEqual(originalManifest);
      expect(readdirSync(join(target, 'Workers', 'branch-0'))).toHaveLength(64);
    }
    noStage();
  });

  for (const variant of ['SOURCE_SUBTREE', 'SOURCE_ROOT', 'PUBLISHED_ROOT', 'PUBLISHED_SUBTREE', 'PUBLIC_PARENT', 'PACKAGE_PARENT'] as const) {
    it(`rejects a linked directory or Windows junction: ${variant}`, (context) => {
      if (variant.startsWith('PUBLISHED')) prepareEarthAssets(root);
      const selected = variant === 'SOURCE_SUBTREE' ? join(source, 'Workers') : variant === 'SOURCE_ROOT' ? source
        : variant === 'PUBLISHED_ROOT' ? target : variant === 'PUBLISHED_SUBTREE' ? join(target, 'Workers')
          : variant === 'PUBLIC_PARENT' ? join(root, 'public') : join(root, 'node_modules');
      if (!existsSync(selected)) mkdirSync(selected, { recursive: true });
      const original = join(temporary, `linked-original-${variant}`);
      realRename(selected, original);
      try { symlinkSync(original, selected, process.platform === 'win32' ? 'junction' : 'dir'); }
      catch (error) {
        if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { context.skip(); return; }
        throw error;
      }
      const before = snapshot(original);
      if (variant.startsWith('PUBLISHED') || variant === 'PUBLIC_PARENT') unavailable();
      expect(() => prepareEarthAssets(root)).toThrow(/EARTH_ASSET_(LINK_DISALLOWED|DIRECTORY_INVALID|EXISTING_UNVERIFIED)/);
      expect(snapshot(original)).toEqual(before);
    });
  }

  for (const variant of ['SOURCE', 'TARGET'] as const) {
    it(`rejects a symbolic link in the ${variant} entrypoint position`, (context) => {
    if (variant === 'TARGET') prepareEarthAssets(root);
    const selected = join(variant === 'SOURCE' ? source : target, 'index.js');
    const original = join(temporary, 'linked-index.js');
    realRename(selected, original);
    try { symlinkSync(original, selected, 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { context.skip(); return; }
      throw error;
    }
    const before = readFileSync(original);
    if (variant === 'TARGET') unavailable();
    expect(() => prepareEarthAssets(root)).toThrow(/EARTH_ASSET_(FILE_INVALID|EXISTING_UNVERIFIED)/);
    expect(readFileSync(original)).toEqual(before);
    });
  }

  it('detects source changes between inventory and copy without publishing a partial target', () => {
    let changed = false;
    vi.mocked(writeFileSync).mockImplementation((path, content, options) => {
      realWrite(path, content, options);
      if (!changed && String(path).includes('earth-assets-stage-')) {
        changed = true;
        realWrite(join(source, 'index.js'), 'source changed after inventory');
      }
    });
    expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_SOURCE_CHANGED');
    expect(changed).toBe(true);
    expect(existsSync(target)).toBe(false);
    noStage();
  });

  it('cleans only its own stage after a partial copy failure, preserving unrelated scratch data', () => {
    const preserved = join(scratch, 'earth-assets-stage-unrelated', 'history');
    write(preserved, 'preserve unrelated staging history');
    let copied = 0;
    vi.mocked(writeFileSync).mockImplementation((path, content, options) => {
      if (String(path).includes('earth-assets-stage-') && ++copied === 2) {
        realWrite(path, 'partial copy');
        throw Object.assign(new Error('injected disk failure'), { code: 'EIO' });
      }
      realWrite(path, content, options);
    });
    expect(() => prepareEarthAssets(root)).toThrow('injected disk failure');
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(preserved, 'utf8')).toBe('preserve unrelated staging history');
    expect(readdirSync(scratch)).toEqual(['earth-assets-stage-unrelated']);
  });

  it('cleans its own stage when final rename fails, leaving no half-published target', () => {
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('injected publication failure'); });
    expect(() => prepareEarthAssets(root)).toThrow('injected publication failure');
    expect(existsSync(target)).toBe(false);
    noStage();
  });

  it('preserves a target that appears while the new bundle is staged', () => {
    vi.mocked(writeFileSync).mockImplementation((path, content, options) => {
      realWrite(path, content, options);
      if (String(path).includes('earth-assets-stage-') && String(path).endsWith('VERSION.json')) {
        mkdirSync(target);
        realWrite(join(target, 'other-writer'), 'preserve this target');
      }
    });
    expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_PREPARATION_CONFLICT');
    expect(readdirSync(target)).toEqual(['other-writer']);
    expect(readFileSync(join(target, 'other-writer'), 'utf8')).toBe('preserve this target');
    noStage();
  });

  it('never removes another owner’s lock or attempts to repair an existing invalid target', () => {
    write(join(scratch, 'earth-assets.lock', 'owner'), 'another preparation owns this');
    write(join(target, 'existing-history'), 'preserve existing contents');
    const before = snapshot(root);
    expect(() => prepareEarthAssets(root)).toThrow('EARTH_ASSET_PREPARATION_BUSY');
    expect(snapshot(root)).toEqual(before);
  });
});
