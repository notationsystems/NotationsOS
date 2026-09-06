import type { Metadata } from 'next';
import carrier from '../../../examples/carrier/source.json';
import fmcsaRequest from '../../../examples/sources/fmcsa-company-census.json';
import { CENSUS_FIELDS } from '@/acquisition/fmcsa';
import { censusQualificationPolicy } from '@/acquisition/store';
import { getProductionSource } from '@/adapter/productionSource';
import { ProductionPath } from '@/components/production/ProductionPath';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { CARAVAN_DEMO_DEFINITION, CARAVAN_DEMO_PURPOSE, caravanDemoContent, caravanDemoSource } from '@/production/demo';
import { productionEnabled } from '@/production/http';

export const metadata: Metadata = { title: 'Production path' };
export const dynamic = 'force-dynamic';

/** The production path over the real local rail where it is enabled, and over the committed demonstration where it is not. The server passes inputs only; every receipt comes from the rail. */
export default async function ProductionPathPage() {
  const enabled = productionEnabled();
  const demo = await getProductionSource().demo();
  const text = JSON.stringify(carrier);
  const request = fmcsaRequest as { requestId: string; sourceId: string; usdot: string[] };
  return (
    <>
      <FixtureBanner note={enabled ? 'Local production rail enabled on this server; it answers only its own loopback origin. Receipts are real local artifacts, UNADMITTED and in no release.' : 'Committed demonstration; the local rail is not enabled on this origin. Nothing here is admitted or released.'} />
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full">
        <ProductionPath
          enabled={enabled} demo={demo} definition={CARAVAN_DEMO_DEFINITION}
          sourceTemplate={caravanDemoSource({ id: 'PENDING', digest: `sha256:${'0'.repeat(64)}` })} purpose={CARAVAN_DEMO_PURPOSE}
          carrier={{ path: 'examples/carrier/source.json', text: JSON.stringify(carrier, null, 2), base64: caravanDemoContent(), byteLength: Buffer.byteLength(text, 'utf8') }}
          fmcsa={{ request: { requestId: request.requestId, sourceId: request.sourceId, usdot: request.usdot }, policy: censusQualificationPolicy(), fields: CENSUS_FIELDS, requestPath: 'examples/sources/fmcsa-company-census.json' }}
        />
      </div>
    </>
  );
}
