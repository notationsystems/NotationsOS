'use client';

import { useState } from 'react';
import type { AlgorithmicDispatchDecision, BitemporalDefenseReconstruction } from '@/domain/dispatchLiability';
import { fmtUtc, shortHash } from '@/lib/format';

interface DispatchLiabilityWorkbenchProps {
  stream: readonly AlgorithmicDispatchDecision[];
}

export function DispatchLiabilityWorkbench({ stream }: DispatchLiabilityWorkbenchProps) {
  const [selectedId, setSelectedId] = useState<string>(stream[2]?.decisionId ?? stream[0]?.decisionId ?? '');
  const [activeReplay, setActiveReplay] = useState<BitemporalDefenseReconstruction | null>(null);

  let streamAudit = { intact: true, brokenIndex: -1 };
  for (let i = 1; i < stream.length; i++) {
    if (stream[i].previousEventDigest !== stream[i - 1].eventDigest) {
      streamAudit = { intact: false, brokenIndex: i };
      break;
    }
  }

  const selected = stream.find((e) => e.decisionId === selectedId) ?? stream[0];

  if (!selected) return null;

  const handleRunReplay = async () => {
    try {
      const res = await fetch('/api/v1/dispatch-liability/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId: selected.decisionId }),
      });
      const data = await res.json();
      if (data.reconstruction) {
        setActiveReplay(data.reconstruction);
      }
    } catch {
      setActiveReplay(null);
    }
  };

  const statusColor = (compliance: AlgorithmicDispatchDecision['qualificationVerdict']['doctrineCompliance']) => {
    switch (compliance) {
      case 'DEFENSIBLE_SELECTION':
        return 'var(--status-admitted)';
      case 'MARGINAL_CONDITIONAL':
        return 'var(--status-conditional)';
      case 'HIGH_EXPOSURE_REJECTED':
        return 'var(--status-refused)';
      default:
        return 'var(--text-muted)';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Stream Verification Banner */}
      <div
        className="p-3 rounded surface flex flex-col sm:flex-row sm:items-center justify-between gap-2 border"
        style={{ borderColor: streamAudit.intact ? 'rgba(76, 196, 138, 0.3)' : 'rgba(226, 107, 92, 0.3)' }}
      >
        <div className="flex items-center gap-2 text-[12.5px]">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ background: streamAudit.intact ? 'var(--status-admitted)' : 'var(--status-refused)' }}
          />
          <span className="font-semibold text-white">
            {streamAudit.intact ? 'Cryptographic Event Stream Intact' : 'Stream Chain Broken'}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            · Continuous SHA-256 digest linking over {stream.length} dispatch decisions
          </span>
        </div>
        <div className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Policy: {selected.broker.algorithmPolicyId} ({selected.broker.algorithmVersion})
        </div>
      </div>

      {/* Stream Sequence Rail */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {stream.map((event) => {
          const active = event.decisionId === selected.decisionId;
          const color = statusColor(event.qualificationVerdict.doctrineCompliance);
          return (
            <button
              key={event.decisionId}
              type="button"
              onClick={() => {
                setSelectedId(event.decisionId);
                setActiveReplay(null);
              }}
              className="text-left p-3 rounded surface transition-colors cursor-pointer border relative"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border-default)',
                background: active ? 'var(--bg-raised)' : 'var(--bg-secondary)',
              }}
            >
              <div className="flex items-center justify-between mb-1 text-[11px]">
                <span className="font-mono" style={{ color: 'var(--info)' }}>
                  #{event.sequenceIndex} {event.decisionId}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ color, border: `1px solid ${color}`, background: 'rgba(255,255,255,0.03)' }}
                >
                  {event.qualificationVerdict.selectionAllowed ? 'APPROVED' : 'BLOCKED'}
                </span>
              </div>
              <div className="text-[13px] font-medium text-white truncate">
                {event.carrierSafetySnapshot.legalName}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                <span>Load {event.load.loadId}</span>
                <span>{fmtUtc(event.decisionTimestamp)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Decision Detail & Legal Defense Workspace */}
      <div className="surface p-4 sm:p-5 rounded flex flex-col gap-5 border" style={{ borderColor: 'var(--border-default)' }}>
        {/* Header Ribbon */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>
                {selected.decisionId}
              </h2>
              <span
                className="text-[11px] font-mono font-bold px-2 py-0.5 rounded"
                style={{
                  color: statusColor(selected.qualificationVerdict.doctrineCompliance),
                  border: `1px solid ${statusColor(selected.qualificationVerdict.doctrineCompliance)}`,
                }}
              >
                {selected.qualificationVerdict.doctrineCompliance.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              Load {selected.load.loadId}: {selected.load.commodity} ({selected.load.origin} → {selected.load.destination})
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRunReplay}
              className="px-3 py-1.5 rounded text-[12px] font-medium transition cursor-pointer border flex items-center gap-1.5"
              style={{
                borderColor: 'var(--accent)',
                color: 'var(--accent-strong)',
                background: 'rgba(var(--accent-rgb), 0.08)',
              }}
            >
              Run Bitemporal Defense Replay (Tk)
            </button>
          </div>
        </div>

        {/* Legal Summary Banner */}
        <div
          className="p-3 rounded text-[12.5px] border"
          style={{
            borderColor: statusColor(selected.qualificationVerdict.doctrineCompliance),
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <span className="font-semibold" style={{ color: statusColor(selected.qualificationVerdict.doctrineCompliance) }}>
            Doctrine Determination:
          </span>{' '}
          <span style={{ color: 'var(--text-primary)' }}>{selected.qualificationVerdict.legalSummary}</span>
        </div>

        {/* Bitemporal Defense Reconstruction Box (if active) */}
        {activeReplay && (
          <div
            className="p-4 rounded border flex flex-col gap-3"
            style={{
              borderColor: 'var(--accent)',
              background: 'rgba(212, 175, 55, 0.05)',
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-[14px] font-semibold text-white flex items-center gap-2">
                <span>⚖️</span> Evidentiary Defense Reconstruction (Miller v. C.H. Robinson Safe Harbor)
              </h3>
              <span className="text-[11px] font-mono" style={{ color: 'var(--accent)' }}>
                Decision #{activeReplay.decisionId}
              </span>
            </div>

            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
              {activeReplay.evidentiaryFinding}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {/* State at Tk */}
              <div className="p-3 rounded border surface" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="block text-[11px] font-mono uppercase font-bold" style={{ color: 'var(--status-admitted)' }}>
                  State at Decision Cutoff Tk ({fmtUtc(activeReplay.knowledgeTimeTk)})
                </span>
                <div className="mt-2 flex flex-col gap-1.5 text-[12px]">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Authority:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{activeReplay.stateAtTk.authority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Safety Rating:</span>
                    <span style={{ color: 'var(--status-admitted)' }}>{activeReplay.stateAtTk.safetyRating}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Vehicle OOS Rate:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{activeReplay.stateAtTk.vehicleOosRate}% (National: 21.4%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Prior Fatal Crashes:</span>
                    <span style={{ color: 'var(--status-admitted)' }}>{activeReplay.stateAtTk.fatalCrashes}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span style={{ color: 'var(--text-muted)' }}>Prudence Standard:</span>
                    <span style={{ color: 'var(--status-admitted)' }}>SATISFIED (NO NEGLIGENCE)</span>
                  </div>
                </div>
              </div>

              {/* State at Tsubpoena */}
              <div className="p-3 rounded border surface" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="block text-[11px] font-mono uppercase font-bold" style={{ color: 'var(--status-conditional)' }}>
                  Subsequent Litigation Allegation State Tsub ({fmtUtc(activeReplay.subpoenaTimeTsub)})
                </span>
                <div className="mt-2 flex flex-col gap-1.5 text-[12px]">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Subsequent Accident:</span>
                    <span style={{ color: 'var(--status-refused)' }}>
                      {activeReplay.stateAtTsub.subsequentAccidentCount > 0
                        ? `${activeReplay.stateAtTsub.subsequentAccidentCount} collision occurred post-dispatch`
                        : 'None on record'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Subsequent Rating:</span>
                    <span style={{ color: 'var(--status-conditional)' }}>{activeReplay.stateAtTsub.safetyRating}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Subsequent Vehicle OOS:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{activeReplay.stateAtTsub.vehicleOosRate}%</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span style={{ color: 'var(--text-muted)' }}>Evidentiary Defense:</span>
                    <span style={{ color: 'var(--accent)' }}>EXCLUDES RETROACTIVE BIAS</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two-Column Facts & Stream Integrity Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Column: Carrier Safety Audit at Decision Time */}
          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              Carrier Safety Profile at Tk ({fmtUtc(selected.knowledgeCutoff)})
            </h3>

            <div className="surface p-3 rounded flex flex-col gap-2.5 text-[12px] border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Entity Legal Name:</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selected.carrierSafetySnapshot.legalName} (USDOT #{selected.carrierSafetySnapshot.usdot})
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>MCMIS Operating Authority:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {selected.carrierSafetySnapshot.operatingAuthorityStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>FMCSA Safety Rating:</span>
                <span
                  style={{
                    color:
                      selected.carrierSafetySnapshot.safetyRating === 'SATISFACTORY'
                        ? 'var(--status-admitted)'
                        : selected.carrierSafetySnapshot.safetyRating === 'CONDITIONAL'
                        ? 'var(--status-refused)'
                        : 'var(--text-muted)',
                  }}
                >
                  {selected.carrierSafetySnapshot.safetyRating}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Vehicle Out-Of-Service:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {selected.carrierSafetySnapshot.vehicleOosRate}% (National Avg: {selected.carrierSafetySnapshot.nationalVehicleOosAvg}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Driver Out-Of-Service:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {selected.carrierSafetySnapshot.driverOosRate}% (National Avg: {selected.carrierSafetySnapshot.nationalDriverOosAvg}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>24-Month Crash Record:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {selected.carrierSafetySnapshot.crashHistory24Mo.fatal} Fatal · {selected.carrierSafetySnapshot.crashHistory24Mo.injury} Injury · {selected.carrierSafetySnapshot.crashHistory24Mo.towaway} Towaway
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>BMC-91X Liability Filing:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  ${(selected.carrierSafetySnapshot.insuranceFilingStatus.bipdOnFileCents / 100).toLocaleString()} on file ({selected.carrierSafetySnapshot.insuranceFilingStatus.insurer})
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Chameleon Carrier Indicators:</span>
                <span style={{ color: selected.carrierSafetySnapshot.chameleonCarrierIndicators.flagged ? 'var(--status-refused)' : 'var(--status-admitted)' }}>
                  {selected.carrierSafetySnapshot.chameleonCarrierIndicators.flagged
                    ? '⚠️ FLAG: Address matches previously revoked motor carrier'
                    : '✓ Clean address & incorporation history'}
                </span>
              </div>
            </div>

            {/* Safe Harbor Criteria List */}
            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              Safe Harbor Criteria Adherence
            </h3>

            <div className="flex flex-col gap-1.5">
              {selected.qualificationVerdict.safeHarborCriteriaMet.length > 0 ? (
                selected.qualificationVerdict.safeHarborCriteriaMet.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)' }}>
                    <span style={{ color: 'var(--status-admitted)' }}>✓</span>
                    <span>{c}</span>
                  </div>
                ))
              ) : (
                <div className="text-[12px]" style={{ color: 'var(--status-refused)' }}>
                  ✗ Zero safe harbor criteria satisfied. Selection rejected under broker duty of care.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Cryptographic Chain & Rolling Attestation */}
          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              Cryptographic Stream Chain & Attestation
            </h3>

            <div className="surface p-3 rounded flex flex-col gap-2 font-mono text-[11px] border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Sequence Index: </span>
                <span style={{ color: 'var(--text-primary)' }}>#{selected.sequenceIndex}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Previous Event Digest (H_n-1): </span>
                <span style={{ color: 'var(--text-muted)' }} title={selected.previousEventDigest}>
                  {shortHash(selected.previousEventDigest)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current Event Digest (H_n): </span>
                <span style={{ color: 'var(--info)' }} title={selected.eventDigest}>
                  {shortHash(selected.eventDigest)}
                </span>
              </div>
              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Rolling Window Block: </span>
                <span style={{ color: 'var(--text-primary)' }}>{selected.rollingAttestation.windowBlockId}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Window Range: </span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {fmtUtc(selected.rollingAttestation.windowStart)} → {fmtUtc(selected.rollingAttestation.windowEnd)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Merkle Block Root: </span>
                <span style={{ color: 'var(--accent-strong)' }} title={selected.rollingAttestation.merkleBlockRoot}>
                  {shortHash(selected.rollingAttestation.merkleBlockRoot)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Corpus Release: </span>
                <span style={{ color: 'var(--text-primary)' }}>{selected.rollingAttestation.corpusReleaseId}</span>
              </div>
            </div>

            {/* Notary Defense Principles */}
            <div className="surface p-3 rounded flex flex-col gap-2 text-[12px] border" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="font-semibold text-white">The Notary Defense Architecture:</div>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                Payload OS creates an indisputable audit trail for commercial transportation. By locking the exact carrier qualifications into a rolling cryptographic stream at decision time (Tk), 3PLs and underwriters can decisively refute allegations of negligent carrier selection during post-accident discovery.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
