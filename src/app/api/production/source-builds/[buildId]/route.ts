import { join } from 'node:path';
import { SourceConnectorError } from '@/acquisition/errors';
import { CensusCandidateBuildStore } from '@/data-os/local-census-candidate-build';
import { ProductionError } from '@/production/errors';
import { productionError, productionJson, requireProductionRequest } from '@/production/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sourceQualificationRoot = () => process.env.PAYLOAD_SOURCE_QUALIFICATION_DIR ?? join(process.cwd(), '.payload', 'source-qualification');

/** Read-only readback of one operator FMCSA candidate build (v2) over the qualification root: the store's own inspection, no assembly, no provider, no clock. */
export async function GET(request: Request, context: { params: Promise<{ buildId: string }> }) {
  try {
    requireProductionRequest(request);
    const { buildId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(buildId)) throw new ProductionError('INVALID_REQUEST', 'Use a bounded build identifier.');
    let build;
    try { build = new CensusCandidateBuildStore(sourceQualificationRoot()).inspect(buildId); }
    catch (error) {
      if (error instanceof SourceConnectorError) throw new ProductionError(error.code, error.message, error.status === 400 ? 400 : 409);
      throw new ProductionError('SOURCE_HISTORY_INVALID', 'Stored source history failed local integrity checks; no history was changed.', 409);
    }
    if (!build) throw new ProductionError('CENSUS_BUILD_NOT_FOUND', 'No stored FMCSA candidate build has this identifier.', 404);
    return productionJson({ schema: 'payload.source-build-readback.v1', mode: 'LOCAL_DEVELOPMENT', buildId, build,
      assemblyPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, releaseActivated: false, customerDistributionPermitted: false });
  } catch (error) { return productionError(error); }
}
