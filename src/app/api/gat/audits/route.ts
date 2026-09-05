import { GatAuditService } from '@/gat/service';
import { MAX_GAT_REQUEST_BYTES } from '@/gat/contracts';
import { productionError, productionJson, productionRoot, readProductionBody, requireProductionRequest } from '@/production/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireProductionRequest(request);
    const result = await new GatAuditService(productionRoot()).audit(await readProductionBody(request, MAX_GAT_REQUEST_BYTES));
    return productionJson(result, result.status === 'CREATED' ? 201 : 200);
  } catch (error) { return productionError(error); }
}
