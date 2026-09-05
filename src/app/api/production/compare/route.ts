import { MAX_PRODUCTION_COMPARISON_BODY_BYTES, parseProductionComparisonRequest } from '@/production/comparison';
import { ProductionError } from '@/production/errors';
import { productionError, productionJson, readProductionBody, requireProductionRequest } from '@/production/http';
import { runProductionWork } from '@/production/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Exact historical build comparison, not a command or a release-bound change feed. */
export async function POST(request: Request) {
  try {
    requireProductionRequest(request);
    if (new URL(request.url).search) throw new ProductionError('INVALID_REQUEST', 'Comparison does not accept query options.');
    const input = parseProductionComparisonRequest(await readProductionBody(request, MAX_PRODUCTION_COMPARISON_BODY_BYTES));
    return productionJson(await runProductionWork({ action: 'COMPARE_CANDIDATE_BUILDS', request: input }));
  } catch (error) { return productionError(error); }
}
