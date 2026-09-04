/**
 * Stamp fixture digests (node only).
 *
 *   npm run stamp:digests
 *
 * Computes, over canonical JSON (src/fixtures/digestPlan.ts says exactly what):
 *   register:<profileId>@<version>  sha256 of the profile's invariant list
 *   artifact:<evidenceId>           sha256 of the artifact's declared identifiers + extracted fields
 *   evidenceRoot:<rulingId>         sha256 of the sorted, concatenated content hashes the ruling considered
 *   manifest:<rulingId>             sha256 of the ruling's notations.result-manifest.v1 sidecar
 * and writes src/fixtures/digests.json. Fixtures read digests through
 * digestLookup.ts; digest.test.ts recomputes and asserts. One pass is enough:
 * the plan substitutes computed lower-layer digests before hashing upper
 * layers, so the result does not depend on what digests.json held before.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { canonicalJson } from '@/fixtures/digest';
import { computeAllDigests } from '@/fixtures/digestPlan';
import { FIXTURE_CASES, FIXTURE_CORPORA, FIXTURE_PROFILES } from '@/fixtures/index';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const OUT = new URL('../src/fixtures/digests.json', import.meta.url);

const table = computeAllDigests(FIXTURE_PROFILES, FIXTURE_CASES, (obj) => sha256(canonicalJson(obj)), sha256, {}, FIXTURE_CORPORA);
const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(`stamped ${Object.keys(sorted).length} digests → src/fixtures/digests.json`);
