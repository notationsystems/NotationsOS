import { describe, expect, it } from 'vitest';
import { FIXTURE_FACTORING_RECEIPTS } from '@/fixtures/caravan/factoring';
import { verifyFactoringReceiptIntegrity, computeReceiptDigest } from './factoring';

describe('Freight Factoring Underwriting Receipts', () => {
  it('validates integrity of all fixture factoring receipts', () => {
    expect(FIXTURE_FACTORING_RECEIPTS.length).toBe(3);

    for (const receipt of FIXTURE_FACTORING_RECEIPTS) {
      expect(verifyFactoringReceiptIntegrity(receipt)).toBe(true);
      expect(receipt.notary.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('detects tampering in invoice amount or carrier identity', () => {
    const original = FIXTURE_FACTORING_RECEIPTS[0];
    const tampered = structuredClone(original);

    // Tamper with invoice amount (e.g. inflating $4,250 to $8,500)
    tampered.invoiceAmountCents = 850000;

    expect(verifyFactoringReceiptIntegrity(tampered)).toBe(false);
    expect(computeReceiptDigest(tampered)).not.toBe(original.notary.receiptDigest);
  });

  it('correctly categorizes underwriting status between clean, fraud alert, and reserve hold', () => {
    const [clean, fraud, reserve] = FIXTURE_FACTORING_RECEIPTS;

    expect(clean.verdict.status).toBe('CLEARED_FOR_ADVANCE');
    expect(clean.verdict.maxAdvanceBasisPoints).toBe(9700);
    expect(clean.verdict.escrowHoldCents).toBe(12750);

    expect(fraud.verdict.status).toBe('REJECTED_SUSPECTED_FRAUD');
    expect(fraud.verdict.recommendedAdvanceCents).toBe(0);
    expect(fraud.invariants.some((i) => i.invariantId === 'FACT-INV-003' && i.status === 'FAILED')).toBe(true);

    expect(reserve.verdict.status).toBe('ADVANCE_WITH_RESERVE');
    expect(reserve.verdict.maxAdvanceBasisPoints).toBe(7000);
    expect(reserve.physicalIntegrity.temperatureCompliance.status).toBe('EXCURSION_RECORDED');
  });
});
