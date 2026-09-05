/**
 * Stamp the candidate-production demonstration (node only).
 *
 *   npm run stamp:production
 *
 * Runs the committed example inputs through the real local rails with the
 * explicit instants in src/fixtures/production/pipeline.ts and writes
 * src/fixtures/production/demo.json. demo.contract.test.ts reproduces the
 * same run and asserts equality, so the committed file cannot drift from
 * what the rails do.
 */
import { writeFileSync } from 'node:fs';
import { produceDemo } from '@/fixtures/production/pipeline';

const OUT = new URL('../src/fixtures/production/demo.json', import.meta.url);
const demo = produceDemo();
writeFileSync(OUT, JSON.stringify(demo, null, 2) + '\n');
console.log(`stamped ${demo.acquisitions.length} acquisitions, ${demo.normalizations.length} normalizations, ${demo.builds.length} build, ${demo.refusals.length} refusals → src/fixtures/production/demo.json`);
