import { exactFields } from '@/data-os/local-record';
import { ProductionError } from '@/production/errors';
import { productionError, productionJson, readProductionBody, requireProductionRequest } from '@/production/http';
import { runProductionWork } from '@/production/worker';
import { PRODUCTION_OBJECT_KINDS, parseProductionRef, type ProductionObjectKind } from '@/production/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST carries a bounded exact reference; inspection is read-only and never runs acquisition. */
export async function POST(request: Request) {
  try {
    requireProductionRequest(request);
    const input = await readProductionBody(request, 4096);
    try {
      exactFields(input, ['schema', 'kind', 'reference']);
      if (input.schema !== 'payload.production-inspection-request.v1' || !PRODUCTION_OBJECT_KINDS.includes(input.kind as ProductionObjectKind)) throw new Error();
      return productionJson(await runProductionWork({ action: 'INSPECT', kind: input.kind as ProductionObjectKind, reference: parseProductionRef(input.reference) }));
    } catch (error) {
      if (error instanceof ProductionError) throw error;
      throw new ProductionError('INVALID_REQUEST', 'Inspect one supported kind and exact reference.');
    }
  } catch (error) { return productionError(error); }
}
