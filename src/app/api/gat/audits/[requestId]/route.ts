import { GatAuditService } from '@/gat/service';
import { ProductionError } from '@/production/errors';
import { productionError, productionJson, productionRoot, requireProductionRequest } from '@/production/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    requireProductionRequest(request);
    if (new URL(request.url).search) throw new ProductionError('INVALID_GAT_REQUEST', 'Inspection accepts only the exact request identity, without query options.');
    const inspection = new GatAuditService(productionRoot()).inspectRequest((await context.params).requestId);
    if (!inspection) throw new ProductionError('GAT_AUDIT_NOT_FOUND', 'No confirmed GAT receipt is retained for this request identity.', 404);
    return productionJson(inspection);
  } catch (error) { return productionError(error); }
}
