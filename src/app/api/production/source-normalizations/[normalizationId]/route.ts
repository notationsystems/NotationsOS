import { join } from 'node:path';
import { CensusNormalizationStore } from '@/acquisition/census-normalization';
import { SourceConnectorError } from '@/acquisition/errors';
import { ProductionError } from '@/production/errors';
import { productionError, productionJson, requireProductionRequest } from '@/production/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sourceQualificationRoot = () => process.env.PAYLOAD_SOURCE_QUALIFICATION_DIR ?? join(process.cwd(), '.payload', 'source-qualification');

/** Read-only readback of one operator FMCSA normalization run over the qualification root: the store's own inspection, no derivation, no provider, no clock. */
export async function GET(request: Request, context: { params: Promise<{ normalizationId: string }> }) {
  try {
    requireProductionRequest(request);
    const { normalizationId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(normalizationId)) throw new ProductionError('INVALID_REQUEST', 'Use a bounded normalization identifier.');
    let run;
    try { run = new CensusNormalizationStore(sourceQualificationRoot()).inspect(normalizationId); }
    catch (error) {
      if (error instanceof SourceConnectorError) throw new ProductionError(error.code, error.message, error.status === 400 ? 400 : 409);
      throw new ProductionError('SOURCE_HISTORY_INVALID', 'Stored source history failed local integrity checks; no history was changed.', 409);
    }
    if (!run) throw new ProductionError('CENSUS_NORMALIZATION_NOT_FOUND', 'No stored FMCSA normalization has this identifier.', 404);
    return productionJson({ schema: 'payload.source-normalization-readback.v1', mode: 'LOCAL_DEVELOPMENT', normalizationId, run,
      derivationPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, customerDistributionPermitted: false });
  } catch (error) { return productionError(error); }
}
