import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Runtime state and compiler scratch files must never become deployment assets.
for (const route of ['state-kernel/route', 'state-kernel/preview/route', 'state-kernel/save/route',
  'production/route', 'production/inspect/route', 'gat/audits/route', 'gat/audits/[requestId]/route']) {
  const file = join(process.cwd(), '.next/server/app/api', `${route}.js.nft.json`);
  const trace = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(trace.files)) throw new Error(`Missing local backend build trace: ${route}.`);
  const forbidden = trace.files.some((entry) => {
    const path = relative(process.cwd(), resolve(dirname(file), entry)).replaceAll('\\', '/');
    return /^(?:\.payload|\.stamp|\.git)(?:\/|$)/.test(path) || /^\.env(?:\.|$)/.test(path) || path === 'next.config.ts' ||
      (path.startsWith('native/state-kernel/target/') && !/^native\/state-kernel\/target\/debug\/notations-state-kernel(?:\.exe)?$/.test(path));
  });
  if (forbidden) throw new Error(`${route} traced unrelated local state or compiler files. Do not distribute this build.`);
}
console.log('Notation, production and GAT build traces exclude local history, runtime installations and compiler scratch files.');
