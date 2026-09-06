import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Runtime state and compiler scratch files must never become deployment assets.
for (const route of [...['state-kernel/route', 'state-kernel/preview/route', 'state-kernel/save/route',
  'production/route', 'production/inspect/route', 'production/compare/route', 'production/source-inventory/route',
  'gat/audits/route', 'gat/audits/[requestId]/route'].map((route) => `api/${route}`), 'earth/page']) {
  const file = join(process.cwd(), '.next/server/app', `${route}.js.nft.json`);
  const trace = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(trace.files)) throw new Error(`Missing local backend build trace: ${route}.`);
  const forbidden = trace.files.some((entry) => {
    const path = relative(process.cwd(), resolve(dirname(file), entry)).replaceAll('\\', '/');
    return /^(?:\.payload|\.stamp|\.git)(?:\/|$)/.test(path) || /^\.env(?:\.|$)/.test(path) || path === 'next.config.ts' ||
      (path.startsWith('native/state-kernel/target/') && !/^native\/state-kernel\/target\/debug\/notations-state-kernel(?:\.exe)?$/.test(path)) ||
      // Test and tooling source is not a deployment asset either.
      /\.(?:test|spec)\.tsx?$/.test(path) || /^(?:tests|clients)\//.test(path) ||
      path === 'tsconfig.tsbuildinfo' || path === 'package-lock.json';
  });
  if (forbidden) throw new Error(`${route} traced unrelated local state, test or compiler files. Do not distribute this build.`);
}

// The reverse check: a file the runtime spawns or reads must be IN its trace.
// src/gat/runtime.ts spawns scripts/gat-audit-runner.py; src/adapter/productionSource.ts
// reads the five committed demonstration inputs during the /candidates render.
for (const [route, required] of [
  ['api/gat/audits/route', ['scripts/gat-audit-runner.py']],
  ['api/gat/audits/[requestId]/route', ['scripts/gat-audit-runner.py']],
  ['candidates/page', ['examples/carrier/acquisition.json', 'examples/carrier/source.json',
    'examples/carrier/normalization.json', 'examples/evidence/request.json', 'examples/evidence/notice.txt']],
]) {
  const file = join(process.cwd(), '.next/server/app', `${route}.js.nft.json`);
  const trace = JSON.parse(readFileSync(file, 'utf8'));
  const present = new Set(trace.files.map((entry) => relative(process.cwd(), resolve(dirname(file), entry)).replaceAll('\\', '/')));
  for (const path of required) {
    if (!present.has(path)) throw new Error(`${route} does not trace ${path}, which it reads or spawns at runtime. This build would fail when deployed.`);
  }
}
console.log('Notation, production, GAT and Earth build traces exclude local history, runtime installations, test source and compiler scratch files, and carry every file the runtime reads.');
