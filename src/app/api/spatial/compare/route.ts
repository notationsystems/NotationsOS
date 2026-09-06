import { requireProductionRequest, readProductionBody, productionRoot, productionJson, productionError } from '@/production/http';
import { ProductionError } from '@/production/errors';
import { exactFields } from '@/data-os/local-record';
import { id } from '@/spatial/contracts';
import { SpatialAnalysisService } from '@/spatial/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireProductionRequest(request);
    const body = await readProductionBody(request, 4096);
    try { exactFields(body, ['baselineRequestId', 'scenarioRequestId']); id(body.baselineRequestId); id(body.scenarioRequestId); }
    catch { throw new ProductionError('INVALID_SPATIAL_COMPARISON', 'Supply exactly two saved request ids.'); }
    return productionJson(new SpatialAnalysisService(productionRoot()).compare(body.baselineRequestId, body.scenarioRequestId));
  } catch (error) { return productionError(error); }
}
