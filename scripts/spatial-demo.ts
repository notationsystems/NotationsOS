import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FLOOR_PLAN, runFixture } from '../src/spatial/fixture';
// This is a local fixture utility, not an HTTP-selectable storage path.
const root = resolve(process.argv[2] ?? '.payload/spatial-demo');
const output = resolve(process.argv[3] ?? '.payload/spatial-demo-artifacts');
const result = runFixture(root);
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'floor-plan.svg'), FLOOR_PLAN);
for (const [name, value] of Object.entries(result)) writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2) + (name === 'layout' ? '' : '\n'));
console.log(JSON.stringify({ evidenceRoot: root, artifacts: output, changedSpaces: result.comparison.changes.map(s => s.id) }, null, 2));
