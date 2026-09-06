import type { Metadata } from 'next';
import { SpatialInquiry } from '@/components/spatial/SpatialInquiry';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { productionEnabled } from '@/production/http';

export const metadata: Metadata = { title: 'Spatial Inquiry' };
export const dynamic = 'force-dynamic';

/** Spatial Inquiry over the local analysis service: whether the service is enabled is read on the server; every analysis is inspected in the browser, on this origin only. */
export default function SpatialPage() {
  return (
    <>
      <FixtureBanner note="Spatial Inquiry: a manually annotated synthetic floor, analysed by the local service over retained evidence. Not measured geometry, not Space Syntax, not behaviour." />
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full">
        <SpatialInquiry enabled={productionEnabled()} />
      </div>
    </>
  );
}
