import { fileURLToPath } from 'node:url';
import { prepareEarthAssets } from '../src/earth/assets.mjs';

// Anchor to this repository, never an arbitrary caller working directory.
try {
  console.log(JSON.stringify(prepareEarthAssets(fileURLToPath(new URL('../', import.meta.url)))));
} catch {
  console.error('Earth assets failed verification. Install the pinned dependencies; preserve an invalid existing public/cesium bundle before rebuilding. See docs/EARTH_TWIN.md.');
  process.exitCode = 1;
}
