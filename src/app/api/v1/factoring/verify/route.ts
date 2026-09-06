import type { NextRequest } from 'next/server';
import { json, refusal } from '../../_lib';
import { FIXTURE_FACTORING_RECEIPTS } from '@/fixtures/caravan/factoring';
import { verifyFactoringReceiptIntegrity } from '@/domain/factoring';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const receiptId = body.receiptId;

    if (!receiptId) {
      return refusal(400, 'missing_receipt_id', 'Provide a receiptId in JSON body', 'Provide { "receiptId": "RCP-FACT-2026-0901" }');
    }

    const found = FIXTURE_FACTORING_RECEIPTS.find(
      (r) => r.receiptId === receiptId || r.shipmentId === receiptId
    );

    if (!found) {
      return refusal(404, 'receipt_not_found', `No factoring receipt matching ${receiptId}.`, 'List available receipts via GET /api/v1/factoring/receipts');
    }

    const isValid = verifyFactoringReceiptIntegrity(found);

    return json({
      schema: 'payload.factoring.verification-result.v1',
      fixture_only: true,
      receiptId: found.receiptId,
      verified: isValid,
      status: found.verdict.status,
      recommendedAdvanceCents: found.verdict.recommendedAdvanceCents,
      invariantsAudited: found.invariants.map((inv) => ({
        id: inv.invariantId,
        title: inv.title,
        status: inv.status,
      })),
      notary: found.notary,
    });
  } catch {
    return refusal(400, 'invalid_payload', 'Request must be valid JSON', 'Send { "receiptId": string }');
  }
}
