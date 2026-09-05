import { ProductionError } from '@/production/errors';
import { productionError, productionJson, requireProductionRequest } from '@/production/http';
import { sourceIntegrationInventory } from '@/production/source-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pinned discovery inventory, not live connection status or source-policy registration. */
export async function GET(request: Request) {
  try {
    requireProductionRequest(request);
    if (new URL(request.url).search) throw new ProductionError('INVALID_REQUEST', 'Source inventory does not accept query options.');
    return productionJson(sourceIntegrationInventory());
  } catch (error) { return productionError(error); }
}
