// Copy the CesiumJS static build (the engine's prebuilt ES module, workers, bundled
// imagery, widgets CSS, third-party workers) from the installed package into public/cesium so the Earth Twin serves
// its engine from this origin and fetches nothing from a CDN. Runs before dev and
// build; idempotent; the target is git-ignored. Apache-2.0 (CesiumJS); Natural Earth
// II imagery in Assets is public domain.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'node_modules/cesium/Build/Cesium');
const target = resolve(root, 'public/cesium');
const parts = ['Assets', 'Workers', 'Widgets', 'ThirdParty'];
const files = ['index.js'];
if (!existsSync(source)) { console.error('CesiumJS is not installed; run npm install first.'); process.exit(1); }
const version = JSON.parse(readFileSync(resolve(root, 'node_modules/cesium/package.json'), 'utf8')).version;
const stamp = join(target, 'VERSION.json');
if (existsSync(stamp)) {
  try { if (JSON.parse(readFileSync(stamp, 'utf8')).version === version && [...parts, ...files].every((p) => existsSync(join(target, p)))) { console.log(`Earth Twin engine assets present: CesiumJS ${version}.`); process.exit(0); } } catch { /* re-copy */ }
}
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const part of parts) cpSync(join(source, part), join(target, part), { recursive: true });
for (const file of files) cpSync(join(source, file), join(target, file));
writeFileSync(stamp, JSON.stringify({ engine: 'CesiumJS', version, license: 'Apache-2.0', parts, files, note: 'Copied from node_modules/cesium/Build/Cesium by scripts/earth-assets.mjs; served from this origin only.' }, null, 2) + '\n');
console.log(`Earth Twin engine assets copied: CesiumJS ${version} → public/cesium.`);
