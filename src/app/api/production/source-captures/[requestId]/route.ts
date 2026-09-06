import { join } from 'node:path';
import { SourceConnectorError } from '@/acquisition/errors';
import { SourceCaptureStore } from '@/acquisition/store';
import { ProductionError } from '@/production/errors';
import { productionError, productionJson, requireProductionRequest } from '@/production/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Operator configuration only; a request never selects a root. The default is the source CLI's default. */
const sourceQualificationRoot = () => process.env.PAYLOAD_SOURCE_QUALIFICATION_DIR ?? join(process.cwd(), '.payload', 'source-qualification');

/**
 * Read-only readback of one operator source capture, under the same flag and
 * loopback guard as the production rail. Nothing is collected, no provider is
 * contacted, no clock is read, and no history is changed: the store's own
 * inspection recomputes local integrity and answers, or refuses.
 */
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    requireProductionRequest(request);
    const { requestId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) throw new ProductionError('INVALID_REQUEST', 'Use a bounded source capture request identifier.');
    let inspection;
    try { inspection = new SourceCaptureStore(sourceQualificationRoot()).inspect(requestId); }
    catch (error) {
      if (error instanceof SourceConnectorError) throw new ProductionError(error.code, error.message, error.status === 400 ? 400 : 409);
      throw new ProductionError('SOURCE_HISTORY_INVALID', 'Stored source history failed local integrity checks; no history was changed.', 409);
    }
    if (!inspection) throw new ProductionError('SOURCE_CAPTURE_NOT_FOUND', 'No stored source capture has this request ID.', 404);
    return productionJson({ schema: 'payload.source-capture-readback.v1', mode: 'LOCAL_DEVELOPMENT', requestId, inspection,
      collectionPerformed: false, providerContacted: false, rawBytesIncluded: false, canonicalAdmission: false, customerDistributionPermitted: false });
  } catch (error) { return productionError(error); }
}
