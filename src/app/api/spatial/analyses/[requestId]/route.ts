import { requireProductionRequest, productionRoot, productionJson, productionError } from '@/production/http';
import { ProductionError } from '@/production/errors';
import { SpatialAnalysisService } from '@/spatial/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    requireProductionRequest(request);
    if (new URL(request.url).search) throw new ProductionError('INVALID_SPATIAL_QUERY', 'Inspection takes only an exact request id.');
    const result = new SpatialAnalysisService(productionRoot()).inspect((await context.params).requestId);
    if (!result) throw new ProductionError('SPATIAL_ANALYSIS_NOT_FOUND', 'No saved analysis has this request id.', 404);
    return productionJson(result);
  } catch (error) { return productionError(error); }
}
