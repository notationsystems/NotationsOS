import { CoordinationClient } from '../clients/javascript/coordination.mjs';
import { CONTRACT_REVIEWER_ID, runContractReviewOnce, type WorkerClient } from '../src/coordination/contract-review';

const options = process.argv.slice(2);
if (options.some((option) => option !== '--watch' && option !== '--once') || (options.includes('--watch') && options.includes('--once'))) {
  console.error('Usage: npm run agent:contract-review -- [--once | --watch]');
  process.exitCode = 1;
} else {
  const client = new CoordinationClient(process.env.PAYLOAD_COORDINATION_URL ?? 'http://127.0.0.1:3000') as WorkerClient;
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  do {
    try { console.log(JSON.stringify({ worker: CONTRACT_REVIEWER_ID, ...await runContractReviewOnce(client) })); }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); if (!options.includes('--watch')) process.exitCode = 1; }
    if (!options.includes('--watch') || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (!stopping);
}
