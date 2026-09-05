import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Runtime state and compiler scratch files must never become deployment assets.
for (const route of ['route', 'preview/route', 'save/route']) {
  const file = join(process.cwd(), '.next/server/app/api/state-kernel', `${route}.js.nft.json`);
  const trace = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(trace.files)) throw new Error('Missing state-kernel build trace.');
  const forbidden = trace.files.some((entry) => {
    const path = relative(process.cwd(), resolve(dirname(file), entry)).replaceAll('\\', '/');
    return /^(?:\.payload|\.stamp|\.git)(?:\/|$)/.test(path) || /^\.env(?:\.|$)/.test(path) || path === 'next.config.ts' ||
      (path.startsWith('native/state-kernel/target/') && !/^native\/state-kernel\/target\/debug\/notations-state-kernel(?:\.exe)?$/.test(path));
  });
  if (forbidden) throw new Error(`State-kernel ${route} traced unrelated local state or compiler files. Do not distribute this build.`);
}
console.log('State-kernel build traces exclude local history and compiler scratch files.');
