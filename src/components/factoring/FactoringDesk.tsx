'use client';

import { useState, useMemo } from 'react';
import type { FreightFactoringReceipt } from '@/domain/factoring';
import { fmtUtc, shortHash } from '@/lib/format';

interface FactoringDeskProps {
  receipts: readonly FreightFactoringReceipt[];
}

export function FactoringDesk({ receipts }: FactoringDeskProps) {
  const [selectedId, setSelectedId] = useState<string>(receipts[0]?.receiptId ?? '');
  const [verifiedState, setVerifiedState] = useState<Record<string, boolean | null>>({});

  const selected = useMemo(() => {
    return receipts.find((r) => r.receiptId === selectedId) ?? receipts[0];
  }, [receipts, selectedId]);

  const handleVerify = async (receipt: FreightFactoringReceipt) => {
    try {
      const res = await fetch('/api/v1/factoring/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: receipt.receiptId }),
      });
      const data = await res.json();
      setVerifiedState((prev) => ({ ...prev, [receipt.receiptId]: data.verified === true }));
    } catch {
      setVerifiedState((prev) => ({ ...prev, [receipt.receiptId]: false }));
    }
  };

  if (!selected) return null;

  const isVerified = verifiedState[selected.receiptId];

  const statusColor = (status: FreightFactoringReceipt['verdict']['status']) => {
    switch (status) {
      case 'CLEARED_FOR_ADVANCE':
        return 'var(--status-admitted)';
      case 'ADVANCE_WITH_RESERVE':
        return 'var(--status-conditional)';
      case 'REJECTED_SUSPECTED_FRAUD':
        return 'var(--status-refused)';
      default:
        return 'var(--status-draft)';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Selector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {receipts.map((r) => {
          const active = r.receiptId === selected.receiptId;
          const color = statusColor(r.verdict.status);
          return (
            <button
              key={r.receiptId}
              type="button"
              onClick={() => setSelectedId(r.receiptId)}
              className="text-left p-3 rounded surface transition-colors cursor-pointer border"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border-default)',
                background: active ? 'var(--bg-raised)' : 'var(--bg-secondary)',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[12px] font-semibold" style={{ color: 'var(--info)' }}>
                  {r.receiptId}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase"
                  style={{
                    color,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${color}`,
                  }}
                >
                  {r.verdict.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-[13px] font-medium text-white truncate">{r.carrier.legalName}</div>
              <div className="flex items-center justify-between mt-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <span>Invoice: ${(r.invoiceAmountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span className="font-mono">{r.origin.state} → {r.destination.state}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Receipt Workspace */}
      <div className="surface p-4 sm:p-5 rounded flex flex-col gap-5 border" style={{ borderColor: 'var(--border-default)' }}>
        {/* Header Ribbon */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>
                {selected.shipmentId}
              </h2>
              <span className="text-[12px] font-mono px-2 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                Invoice #{selected.invoiceId}
              </span>
            </div>
            <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              Underwriting receipt attested by Payload OS Notary under Caravan Specialty Cargo specifications.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleVerify(selected)}
              className="px-3 py-1.5 rounded text-[12px] font-medium transition cursor-pointer border flex items-center gap-1.5"
              style={{
                borderColor: isVerified === true ? 'var(--status-admitted)' : 'var(--accent)',
                color: isVerified === true ? 'var(--status-admitted)' : 'var(--accent-strong)',
                background: 'rgba(var(--accent-rgb), 0.08)',
              }}
            >
              {isVerified === true ? '✓ Notary Seal Verified' : 'Verify Attestation Integrity'}
            </button>
          </div>
        </div>

        {/* Fact Valuation & Underwriting Recommendation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded" style={{ background: 'var(--bg-secondary)' }}>
          <div>
            <span className="block text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Invoice Total</span>
            <span className="text-[18px] font-mono font-bold" style={{ color: 'var(--text-heading)' }}>
              ${(selected.invoiceAmountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Max Advance Cap</span>
            <span className="text-[18px] font-mono font-bold" style={{ color: 'var(--info)' }}>
              {(selected.verdict.maxAdvanceBasisPoints / 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Recommended Advance</span>
            <span className="text-[18px] font-mono font-bold" style={{ color: statusColor(selected.verdict.status) }}>
              ${(selected.verdict.recommendedAdvanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Escrow Reserve Hold</span>
            <span className="text-[18px] font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
              ${(selected.verdict.escrowHoldCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Risk Rationale Callout */}
        <div
          className="p-3 rounded text-[12.5px] border"
          style={{
            borderColor: statusColor(selected.verdict.status),
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <span className="font-semibold" style={{ color: statusColor(selected.verdict.status) }}>
            Underwriting Determination:
          </span>{' '}
          <span style={{ color: 'var(--text-primary)' }}>{selected.verdict.riskRationale}</span>
        </div>

        {/* Two-Column Facts & Evidence Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Column: Physical & Delivery Facts */}
          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              1. Physical Shipment Facts & Custody
            </h3>

            <div className="surface p-3 rounded flex flex-col gap-2.5 text-[12px] border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Authorized Carrier:</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selected.carrier.legalName} (USDOT #{selected.carrier.usdot})
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Equipment Assigned:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  VIN {selected.carrier.assignedEquipmentVin} · Trailer {selected.carrier.assignedTrailerNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Origin Facility:</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {selected.origin.name} ({selected.origin.city}, {selected.origin.state})
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Destination Facility:</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {selected.destination.name} ({selected.destination.city}, {selected.destination.state})
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Delivery Time (validAt):</span>
                <span className="font-mono" style={{ color: 'var(--info)' }}>
                  {fmtUtc(selected.delivery.deliveryTimestamp)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>POD Execution Type:</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selected.delivery.podType} · Signatory: {selected.delivery.signatoryName}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Geofence Telematics Witness:</span>
                <span style={{ color: selected.delivery.telematicsGeofenceWitnessed ? 'var(--status-admitted)' : 'var(--status-refused)' }}>
                  {selected.delivery.telematicsGeofenceWitnessed ? '✓ Geofence Confirmed' : '✗ Unwitnessed / Location Mismatch'}
                </span>
              </div>
            </div>

            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              2. Sensor Logs & Physical Integrity
            </h3>

            <div className="surface p-3 rounded flex flex-col gap-2.5 text-[12px] border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Scale Weight:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  Net: {selected.physicalIntegrity.netDeliveredLbs.toLocaleString()} lbs (Declared: {selected.physicalIntegrity.declaredWeightLbs.toLocaleString()} lbs · Δ {selected.physicalIntegrity.weightVariancePercent}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Cold Chain Status:</span>
                <span
                  style={{
                    color:
                      selected.physicalIntegrity.temperatureCompliance.status === 'COMPLIANT'
                        ? 'var(--status-admitted)'
                        : selected.physicalIntegrity.temperatureCompliance.status === 'EXCURSION_RECORDED'
                        ? 'var(--status-conditional)'
                        : 'var(--text-muted)',
                  }}
                >
                  {selected.physicalIntegrity.temperatureCompliance.status}
                  {selected.physicalIntegrity.temperatureCompliance.status === 'EXCURSION_RECORDED' &&
                    ` (${selected.physicalIntegrity.temperatureCompliance.maxExcursionMinutes} min excursion up to ${selected.physicalIntegrity.temperatureCompliance.loggedMaxC}°C)`}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Seal Integrity:</span>
                <span style={{ color: selected.physicalIntegrity.sealVerification.match ? 'var(--status-admitted)' : 'var(--status-refused)' }}>
                  {selected.physicalIntegrity.sealVerification.match
                    ? `Intact (${selected.physicalIntegrity.sealVerification.arriveSeal})`
                    : 'Discrepancy / Unsealed'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Invariant Audit & Cryptographic Attestation */}
          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              3. Underwriting Invariant Audit
            </h3>

            <div className="flex flex-col gap-2">
              {selected.invariants.map((inv) => {
                const invColor =
                  inv.status === 'PASSED'
                    ? 'var(--status-admitted)'
                    : inv.status === 'WARNING'
                    ? 'var(--status-conditional)'
                    : 'var(--status-refused)';
                return (
                  <div
                    key={inv.invariantId}
                    className="p-3 rounded border surface"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] font-semibold" style={{ color: 'var(--info)' }}>
                        {inv.invariantId}: {inv.title}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{ color: invColor, background: 'rgba(255,255,255,0.03)' }}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      {inv.summary}
                    </p>
                  </div>
                );
              })}
            </div>

            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              4. Notary Seal & Proof of Pre-Existence
            </h3>

            <div className="surface p-3 rounded flex flex-col gap-2 font-mono text-[11px] border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Corpus Release: </span>
                <span style={{ color: 'var(--text-primary)' }}>{selected.notary.corpusReleaseId}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Knowledge Cutoff (Tk): </span>
                <span style={{ color: 'var(--info)' }}>{selected.notary.knownAt}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Receipt Digest: </span>
                <span style={{ color: 'var(--accent-strong)' }} title={selected.notary.receiptDigest}>
                  {shortHash(selected.notary.receiptDigest)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Manifest Commitment: </span>
                <span style={{ color: 'var(--text-muted)' }} title={selected.notary.manifestCommitment}>
                  {shortHash(selected.notary.manifestCommitment)}
                </span>
              </div>
              <div className="mt-1 pt-2 border-t text-[11px] font-sans" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                {selected.notary.attestationStatement}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
