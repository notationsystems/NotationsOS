import { CoordinationClient } from '../clients/javascript/coordination.mjs';
import { LocalCandidateBuildStore } from '../src/data-os/local-candidate-build';
import { candidateBuildReviewOptions } from '../src/coordination/candidate-build-review-cli';
import { CANDIDATE_BUILD_REVIEWER_ID, runCandidateBuildReviewOnce } from '../src/coordination/candidate-build-review';
import type { WorkerClient } from '../src/coordination/contract-review';

try {
  const options = candidateBuildReviewOptions(process.argv.slice(2), process.env.PAYLOAD_COORDINATION_URL);
  const client = new CoordinationClient(options.url) as WorkerClient;
  const inspector = new LocalCandidateBuildStore(options.root);
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  do {
    try { console.log(JSON.stringify({ worker: CANDIDATE_BUILD_REVIEWER_ID, ...await runCandidateBuildReviewOnce(client, inspector) })); }
    catch (error) { console.error(error instanceof Error ? error.message : 'Candidate inspection failed.'); if (!options.watch) process.exitCode = 1; }
    if (!options.watch || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (!stopping);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Candidate inspection worker could not start.');
  process.exitCode = 1;
}
