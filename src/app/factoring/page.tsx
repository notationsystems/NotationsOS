import type { Metadata } from 'next';
import { FIXTURE_FACTORING_RECEIPTS } from '@/fixtures/caravan/factoring';
import { FactoringDesk } from '@/components/factoring/FactoringDesk';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';

export const metadata: Metadata = {
  title: 'Freight Factoring Underwriting Desk',
  description: 'Evidence-grade shipment receipts and invariant audits for invoice factoring desks and commercial asset-backed lenders.',
};

export default function FactoringPage() {
  return (
    <>
      <FixtureBanner note="Freight Factoring Wedge · Underwriting Receipts · Notary Architecture" />
      <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-4">
        <div>
          <h1 className="m-0 text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text-heading)' }}>
            Freight Factoring Underwriting Desk
          </h1>
          <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            Neutral evidence receipts (fact + condition + provenance + validation status) for factoring advances.
            Payload OS acts as notary of the physical economy, attesting shipment completion and invariant satisfaction without funds transmission or settlement exposure.
          </p>
        </div>

        <FactoringDesk receipts={FIXTURE_FACTORING_RECEIPTS} />
      </div>
    </>
  );
}
