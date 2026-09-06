import { json } from '../../_lib';
import { FIXTURE_FACTORING_RECEIPTS } from '@/fixtures/caravan/factoring';

export async function GET() {
  return json({
    schema: 'payload.factoring.receipt-index.v1',
    fixture_only: true,
    count: FIXTURE_FACTORING_RECEIPTS.length,
    receipts: FIXTURE_FACTORING_RECEIPTS.map((r) => ({
      receiptId: r.receiptId,
      shipmentId: r.shipmentId,
      invoiceId: r.invoiceId,
      invoiceAmountCents: r.invoiceAmountCents,
      carrierName: r.carrier.legalName,
      usdot: r.carrier.usdot,
      brokerName: r.broker.legalName,
      status: r.verdict.status,
      maxAdvanceBasisPoints: r.verdict.maxAdvanceBasisPoints,
      recommendedAdvanceCents: r.verdict.recommendedAdvanceCents,
      deliveryTimestamp: r.delivery.deliveryTimestamp,
      knownAt: r.notary.knownAt,
      receiptDigest: r.notary.receiptDigest,
    })),
  });
}
