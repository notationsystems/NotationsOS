import { productionEnabled, productionError, productionJson, readProductionBody, requireProductionRequest } from '@/production/http';
import { runProductionWork } from '@/production/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!productionEnabled()) return productionJson({ schema: 'payload.production-availability.v1', mode: 'LOCAL_DEVELOPMENT',
    enabled: false, operations: [], canonicalAdmission: false, liveConnectors: false });
  try { requireProductionRequest(request); return productionJson(await runProductionWork({ action: 'CATALOG' })); }
  catch (error) { return productionError(error); }
}

export async function POST(request: Request) {
  try {
    requireProductionRequest(request);
    const command = await readProductionBody(request);
    return productionJson(await runProductionWork({ action: 'EXECUTE', command }));
  } catch (error) { return productionError(error); }
}
