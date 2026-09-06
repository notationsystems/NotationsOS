import { requireProductionRequest, readProductionBody, productionRoot, productionJson, productionError } from '@/production/http';
import { SpatialAnalysisService } from '@/spatial/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireProductionRequest(request);
    const result = new SpatialAnalysisService(productionRoot()).submit(await readProductionBody(request, 16 * 1024));
    return productionJson(result, result.status === 'CREATED' ? 201 : 200);
  } catch (error) { return productionError(error); }
}
