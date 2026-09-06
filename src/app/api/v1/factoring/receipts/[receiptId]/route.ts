import type { NextRequest } from 'next/server';
import { json, refusal } from '../../../_lib';
import { FIXTURE_FACTORING_RECEIPTS } from '@/fixtures/caravan/factoring';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const { receiptId } = await params;
  const found = FIXTURE_FACTORING_RECEIPTS.find(
    (r) => r.receiptId === receiptId || r.shipmentId === receiptId
  );

  if (!found) {
    return refusal(404, 'receipt_not_found', `No factoring receipt matching ${receiptId}.`, 'List available receipts via GET /api/v1/factoring/receipts');
  }

  return json({
    schema: 'payload.factoring.underwriting-receipt.v1',
    fixture_only: true,
    receipt: found,
  });
}
