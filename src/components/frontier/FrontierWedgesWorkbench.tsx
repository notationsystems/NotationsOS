'use client';

import { useState } from 'react';
import type {
  DisclosureAssurancePack,
  InsurabilityChangeFeedEvent,
  CapexProgressVerification,
} from '@/domain/frontierWedges';
import { fmtUtc, shortHash } from '@/lib/format';
import { InsurabilityStressWorkbench } from './InsurabilityStressWorkbench';
import { N11VoiTaskingWorkbench } from './N11VoiTaskingWorkbench';
import {
  FIXTURE_STATE_DOI_FILINGS,
  FIXTURE_LOAN_PORTFOLIO,
  FIXTURE_PROJECT_DRAWS,
} from '@/fixtures/frontier/insurabilityAndN11';

interface FrontierWedgesWorkbenchProps {
  disclosurePacks: readonly DisclosureAssurancePack[];
  insurabilityEvents: readonly InsurabilityChangeFeedEvent[];
  capexVerifications: readonly CapexProgressVerification[];
}

export function FrontierWedgesWorkbench({
  disclosurePacks,
  insurabilityEvents,
  capexVerifications,
}: FrontierWedgesWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<'assurance' | 'insurability' | 'capex' | 'matrix'>('assurance');
  const [selectedPackId, setSelectedPackId] = useState<string>(disclosurePacks[0]?.packId ?? '');
  const [selectedEventId, setSelectedEventId] = useState<string>(insurabilityEvents[0]?.eventId ?? '');
  const [selectedCapexId, setSelectedCapexId] = useState<string>(capexVerifications[0]?.verificationId ?? '');
  const [insurabilityMode, setInsurabilityMode] = useState<'stress' | 'feed'>('stress');
  const [capexMode, setCapexMode] = useState<'optimizer' | 'verifications'>('optimizer');

  const selectedPack = disclosurePacks.find((p) => p.packId === selectedPackId) ?? disclosurePacks[0];
  const selectedEvent = insurabilityEvents.find((e) => e.eventId === selectedEventId) ?? insurabilityEvents[0];
  const selectedCapex = capexVerifications.find((c) => c.verificationId === selectedCapexId) ?? capexVerifications[0];

  return (
    <div className="space-y-6">
      {/* Strategic Header */}
      <div className="border border-neutral-200 bg-white p-6 shadow-sm rounded-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                Frontier Products 1–3
              </span>
              <span className="text-xs text-neutral-500 font-mono">Notary Substrate Sequence</span>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mt-1">
              Frontier Expansion Workbench
            </h1>
            <p className="text-sm text-neutral-600 mt-1 max-w-3xl">
              Anchoring the enterprise on the three immediate customer categories: mandatory disclosure assurance, insurability change feeds, and capex draw progress states.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 bg-neutral-100 border border-neutral-300 rounded font-mono text-neutral-700">
              No Liability Absorption
            </span>
            <span className="px-2.5 py-1 bg-neutral-100 border border-neutral-300 rounded font-mono text-neutral-700">
              No Actuarial Underwriting
            </span>
            <span className="px-2.5 py-1 bg-neutral-100 border border-neutral-300 rounded font-mono text-neutral-700">
              No Engineer Stamping
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 mt-6 -mb-6">
          <button
            onClick={() => setActiveTab('assurance')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'assurance'
                ? 'border-neutral-900 text-neutral-900 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            1. Disclosure Assurance (CBAM/CSRD)
          </button>
          <button
            onClick={() => setActiveTab('insurability')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'insurability'
                ? 'border-neutral-900 text-neutral-900 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            2. Insurability Dynamics
          </button>
          <button
            onClick={() => setActiveTab('capex')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'capex'
                ? 'border-neutral-900 text-neutral-900 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            3. Capex Progress (N11 VOI)
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'matrix'
                ? 'border-neutral-900 text-neutral-900 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            Frontier 8-Passage Matrix
          </button>
        </div>
      </div>

      {/* Tab 1: Disclosure Assurance */}
      {activeTab === 'assurance' && selectedPack && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Facility Evidence Packs ({disclosurePacks.length})
            </h2>
            <div className="space-y-2">
              {disclosurePacks.map((pack) => (
                <button
                  key={pack.packId}
                  onClick={() => setSelectedPackId(pack.packId)}
                  className={`w-full text-left p-3.5 rounded border transition-all ${
                    selectedPack.packId === pack.packId
                      ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-semibold text-neutral-800">{pack.packId}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono">
                      {pack.framework}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-neutral-900 truncate">
                    {pack.facilityName}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1 flex justify-between">
                    <span>{pack.sector} · {pack.countryCode}</span>
                    <span className="font-mono">{pack.metrics.specificIntensityPerTonProduct} tCO₂e/t</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 border border-blue-100 bg-blue-50/60 rounded text-xs text-blue-900 space-y-1.5">
              <div className="font-semibold">The Productization Gate</div>
              <p>
                <strong>Sells:</strong> Assurance substrate & raw primary evidence packs to Big 4 verifiers.
              </p>
              <p>
                <strong>Must Not Become:</strong> The registry of record or standards body. The Big 4 hold client relationship and audit liability.
              </p>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="border border-neutral-200 bg-white p-5 rounded-lg shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-100 gap-2">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{selectedPack.facilityName}</h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    Facility ID: {selectedPack.facilityId} · Sector: {selectedPack.sector} ({selectedPack.countryCode})
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-mono bg-emerald-100 text-emerald-800 font-medium">
                  {selectedPack.auditReadiness.substrateStatus}
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Specific Carbon Intensity</div>
                  <div className="text-xl font-bold font-mono text-neutral-900 mt-0.5">
                    {selectedPack.metrics.specificIntensityPerTonProduct}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">tCO₂e / ton product</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Direct Emissions (Scope 1)</div>
                  <div className="text-lg font-bold font-mono text-neutral-900 mt-0.5">
                    {selectedPack.metrics.directTonsCo2e.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">tCO₂e verified</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Production Volume</div>
                  <div className="text-lg font-bold font-mono text-neutral-900 mt-0.5">
                    {selectedPack.metrics.productionVolumeTons.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">metric tons</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Uncertainty Bound</div>
                  <div className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                    ±{(selectedPack.metrics.uncertaintyMarginRatio * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">Continuous CEMS metrology</div>
                </div>
              </div>

              {/* Provenance & Cryptographic Substrate */}
              <div className="border border-neutral-200 rounded p-4 space-y-3">
                <div className="text-xs font-semibold text-neutral-800 uppercase tracking-wider">
                  Cryptographic Evidence Chain
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100 space-y-1">
                    <span className="text-neutral-500 block text-[10px]">PRIMARY METER LOG DIGEST</span>
                    <span className="text-neutral-800 font-semibold break-all">
                      {shortHash(selectedPack.evidenceSubstrate.primaryMeterLogDigest, 18)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100 space-y-1">
                    <span className="text-neutral-500 block text-[10px]">RAW PRODUCTION RUN DIGEST</span>
                    <span className="text-neutral-800 font-semibold break-all">
                      {shortHash(selectedPack.evidenceSubstrate.verifiedRunDigest, 18)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-neutral-600 flex justify-between items-center pt-1">
                  <span>Grid Emission Source: <strong className="font-mono">{selectedPack.evidenceSubstrate.gridEmissionFactorSourceId}</strong></span>
                  <span className="font-mono text-[11px]">Valid: {fmtUtc(selectedPack.validAt)}</span>
                </div>
              </div>

              {/* Boundary & Auditor Readiness */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>Auditor Target: {selectedPack.auditReadiness.targetAuditorTier} ({selectedPack.auditReadiness.assuranceStandard})</span>
                  <span className="font-mono text-[10px]">Scope: {selectedPack.systemBoundary.scope}</span>
                </div>
                <p className="text-[11px] text-amber-800 italic">
                  &quot;{selectedPack.auditReadiness.disclaimer}&quot;
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Insurability Dynamics */}
      {activeTab === 'insurability' && (
        <div className="space-y-6">
          {/* Sub-view Selector */}
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <div className="flex gap-2">
              <button
                onClick={() => setInsurabilityMode('stress')}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  insurabilityMode === 'stress'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                Lender Portfolio Stress Engine
              </button>
              <button
                onClick={() => setInsurabilityMode('feed')}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  insurabilityMode === 'feed'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                Corridor Withdrawal Feed ({insurabilityEvents.length})
              </button>
            </div>
            <span className="text-xs text-neutral-500 font-mono hidden sm:inline">
              Leading Indicator of Collateral Repricing
            </span>
          </div>

          {insurabilityMode === 'stress' ? (
            <InsurabilityStressWorkbench
              filings={FIXTURE_STATE_DOI_FILINGS}
              initialLoans={FIXTURE_LOAN_PORTFOLIO}
            />
          ) : selectedEvent ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              State DOI Withdrawal Actions ({insurabilityEvents.length})
            </h2>
            <div className="space-y-2">
              {insurabilityEvents.map((evt) => (
                <button
                  key={evt.eventId}
                  onClick={() => setSelectedEventId(evt.eventId)}
                  className={`w-full text-left p-3.5 rounded border transition-all ${
                    selectedEvent.eventId === evt.eventId
                      ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-semibold text-neutral-800">{evt.stateDoiCode}</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-mono">
                      {evt.actionType.replace('_FILING', '')}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-neutral-900 truncate">
                    {evt.carrierName}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1 flex justify-between">
                    <span>{evt.geography.countyName}, {evt.geography.stateCode}</span>
                    <span className="font-mono text-rose-700 font-semibold">{evt.impactAssessment.collateralRepricingRisk}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 border border-amber-100 bg-amber-50/60 rounded text-xs text-amber-900 space-y-1.5">
              <div className="font-semibold">The Productization Gate</div>
              <p>
                <strong>Sells:</strong> Insurability change feed from public state DOI filings + Landshark parcel overlays.
              </p>
              <p>
                <strong>Must Not Become:</strong> An insurance carrier or actuarial risk pricer. Buyers are lenders and brokers monitoring collateral repricing risk.
              </p>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="border border-neutral-200 bg-white p-5 rounded-lg shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-100 gap-2">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{selectedEvent.carrierName}</h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    NAIC: {selectedEvent.carrierNaic} · Action: {selectedEvent.actionType} · DOI: {selectedEvent.stateDoiCode}
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-mono bg-rose-100 text-rose-800 font-medium">
                  {selectedEvent.impactAssessment.collateralRepricingRisk} COLLATERAL RISK
                </span>
              </div>

              {/* Geographic Exposure & Impact */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Target Geography</div>
                  <div className="text-base font-bold text-neutral-900 mt-0.5">
                    {selectedEvent.geography.countyName}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">FIPS: {selectedEvent.geography.fipsCode}</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Exposed Parcels</div>
                  <div className="text-lg font-bold font-mono text-neutral-900 mt-0.5">
                    {selectedEvent.impactAssessment.estimatedParcelsExposed.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">in active corridor</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Coverage Gap Delta</div>
                  <div className="text-lg font-bold font-mono text-rose-700 mt-0.5">
                    +{(selectedEvent.impactAssessment.coverageGapDeltaBps / 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">capacity withdrawn</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Repricing Lead Time</div>
                  <div className="text-lg font-bold font-mono text-amber-800 mt-0.5">
                    {selectedEvent.impactAssessment.leadTimeDaysToCollateralRepricing} Days
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">ahead of market debt</div>
                </div>
              </div>

              {/* Peril & Artifact Details */}
              <div className="p-4 bg-neutral-50 rounded border border-neutral-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Triggering Hazard Peril:</span>
                  <span className="font-semibold text-neutral-800">{selectedEvent.geography.primaryHazardPeril}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">State Filing Effective Date:</span>
                  <span className="font-mono text-neutral-800">{fmtUtc(selectedEvent.effectiveDate)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Filing Evidence Artifact Digest:</span>
                  <span className="font-mono text-neutral-800">{shortHash(selectedEvent.filingArtifactDigest, 20)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
          ) : null}
        </div>
      )}

      {/* Tab 3: Capex Progress Verification & N11 VOI Tasking Optimizer */}
      {activeTab === 'capex' && (
        <div className="space-y-6">
          {/* Sub-view Selector */}
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <div className="flex gap-2">
              <button
                onClick={() => setCapexMode('optimizer')}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  capexMode === 'optimizer'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                N11 VOI Tasking Optimizer
              </button>
              <button
                onClick={() => setCapexMode('verifications')}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  capexMode === 'verifications'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                Verified Draw Receipts ({capexVerifications.length})
              </button>
            </div>
            <span className="text-xs text-neutral-500 font-mono hidden sm:inline">
              Max Measurement Surplus = EVSI − Cost
            </span>
          </div>

          {capexMode === 'optimizer' ? (
            <N11VoiTaskingWorkbench initialContexts={FIXTURE_PROJECT_DRAWS} />
          ) : selectedCapex ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Project Finance Draw Verifications ({capexVerifications.length})
            </h2>
            <div className="space-y-2">
              {capexVerifications.map((cpx) => (
                <button
                  key={cpx.verificationId}
                  onClick={() => setSelectedCapexId(cpx.verificationId)}
                  className={`w-full text-left p-3.5 rounded border transition-all ${
                    selectedCapex.verificationId === cpx.verificationId
                      ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono font-semibold text-neutral-800">Draw #{cpx.drawRequest.drawNumber}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                      cpx.stateFinding.physicalMilestoneCleared
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {cpx.stateFinding.physicalMilestoneCleared ? 'CLEARED' : 'DISCREPANCY'}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-neutral-900 truncate">
                    {cpx.projectName}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1 flex justify-between">
                    <span>${(cpx.drawRequest.requestedDrawCents / 1e8).toFixed(1)}M Draw</span>
                    <span className="font-mono">Variance: {cpx.milestone.variancePct > 0 ? '+' : ''}{cpx.milestone.variancePct}%</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 border border-emerald-100 bg-emerald-50/60 rounded text-xs text-emerald-900 space-y-1.5">
              <div className="font-semibold">The Productization Gate</div>
              <p>
                <strong>Sells:</strong> Verified physical milestone progress states + N11 value-of-information measurement decisions.
              </p>
              <p>
                <strong>Must Not Become:</strong> The certifying engineer of record (stamp & professional liability trap). Sell the physical state; lenders&apos; engineers stamp.
              </p>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="border border-neutral-200 bg-white p-5 rounded-lg shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-100 gap-2">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{selectedCapex.projectName}</h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    Project ID: {selectedCapex.projectId} · Type: {selectedCapex.projectType}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-mono font-medium ${
                  selectedCapex.stateFinding.physicalMilestoneCleared
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {selectedCapex.stateFinding.physicalMilestoneCleared
                    ? 'PHYSICAL STATE VERIFIED'
                    : 'DEFICIT ALERT: HELD FOR AUDIT'}
                </span>
              </div>

              {/* Draw Request & Variance */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Requested Draw #{selectedCapex.drawRequest.drawNumber}</div>
                  <div className="text-lg font-bold font-mono text-neutral-900 mt-0.5">
                    ${(selectedCapex.drawRequest.requestedDrawCents / 1e8).toFixed(1)}M
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">of ${(selectedCapex.drawRequest.totalFacilityCommitmentCents / 1e8).toFixed(0)}M total</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Contract Target</div>
                  <div className="text-lg font-bold font-mono text-neutral-900 mt-0.5">
                    {selectedCapex.milestone.contractualTargetPct}%
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">{selectedCapex.milestone.milestoneId}</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Verified Physical Progress</div>
                  <div className="text-lg font-bold font-mono text-neutral-900 mt-0.5">
                    {selectedCapex.milestone.verifiedPhysicalPct}%
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">Independent observation</div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                  <div className="text-[11px] text-neutral-500 font-medium">Milestone Variance</div>
                  <div className={`text-lg font-bold font-mono mt-0.5 ${
                    selectedCapex.milestone.variancePct >= -1.0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {selectedCapex.milestone.variancePct > 0 ? '+' : ''}{selectedCapex.milestone.variancePct}%
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">Confidence: {selectedCapex.stateFinding.confidenceScorePercentile}%ile</div>
                </div>
              </div>

              {/* N11 Measurement Economics */}
              <div className="p-4 bg-neutral-50 rounded border border-neutral-200 space-y-2">
                <div className="text-xs font-semibold text-neutral-800 uppercase tracking-wider flex justify-between">
                  <span>N11 Measurement Economics (Value of Information)</span>
                  <span className="font-mono text-emerald-800">Net Surplus: +${(selectedCapex.measurementEconomics.netMeasurementSurplusCents / 1e8).toFixed(2)}M</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono pt-1">
                  <div className="p-2 bg-white rounded border border-neutral-100">
                    <span className="text-neutral-500 text-[10px] block">INSTRUMENT SELECTED</span>
                    <span className="font-semibold text-neutral-800">{selectedCapex.measurementEconomics.selectedInstrument}</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-neutral-100">
                    <span className="text-neutral-500 text-[10px] block">INSTRUMENT COST</span>
                    <span className="font-semibold text-neutral-800">${(selectedCapex.measurementEconomics.instrumentCostCents / 1e2).toLocaleString()}</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-neutral-100">
                    <span className="text-neutral-500 text-[10px] block">EXPECTED VOI</span>
                    <span className="font-semibold text-emerald-700">${(selectedCapex.measurementEconomics.expectedValueOfInformationCents / 1e8).toFixed(2)}M</span>
                  </div>
                </div>
              </div>

              {/* Liability Notice */}
              <div className="p-3 bg-neutral-100 border border-neutral-200 rounded text-xs text-neutral-600 font-mono">
                NOTICE: {selectedCapex.stateFinding.liabilityNotice}
              </div>
            </div>
          </div>
        </div>
          ) : null}
        </div>
      )}

      {/* Tab 4: 8-Passage Matrix */}
      {activeTab === 'matrix' && (
        <div className="border border-neutral-200 bg-white p-6 rounded-lg shadow-sm space-y-4">
          <div className="border-b border-neutral-200 pb-3">
            <h3 className="text-lg font-bold text-neutral-900">The Eight Frontier Passages</h3>
            <p className="text-xs text-neutral-500 mt-1">
              The productization gate across all eight frontiers: sell the substrate, leave liability, capital, and network positions to others.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Passage</th>
                  <th className="py-2.5 px-3">Primary Buyer</th>
                  <th className="py-2.5 px-3 text-emerald-800">Sells (Surviving Wedge)</th>
                  <th className="py-2.5 px-3 text-rose-800">Must Not Become (The Trap)</th>
                  <th className="py-2.5 px-3">Lifecycle Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                <tr className="bg-emerald-50/40">
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">1. Assurance Economy</td>
                  <td className="py-2.5 px-3">Big 4 & ESG Auditors</td>
                  <td className="py-2.5 px-3 font-medium text-emerald-900">Evidence packs & emissions substrate</td>
                  <td className="py-2.5 px-3 font-medium text-rose-900">Registry of record (standards body)</td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-emerald-800">Anchor Customer (Immediate)</td>
                </tr>
                <tr className="bg-emerald-50/40">
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">2. Insurability Dynamics</td>
                  <td className="py-2.5 px-3">Lenders, Brokers, Municipalities</td>
                  <td className="py-2.5 px-3 font-medium text-emerald-900">State DOI withdrawal & change feeds</td>
                  <td className="py-2.5 px-3 font-medium text-rose-900">Carrier / actuarial underwriting shop</td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-emerald-800">Anchor Customer (Immediate)</td>
                </tr>
                <tr className="bg-emerald-50/40">
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">3. Progress Verification</td>
                  <td className="py-2.5 px-3">Project Finance Agents</td>
                  <td className="py-2.5 px-3 font-medium text-emerald-900">Verified progress states + N11 VOI</td>
                  <td className="py-2.5 px-3 font-medium text-rose-900">Certifying engineer of record</td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-emerald-800">Anchor Customer (Immediate)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">4. Measurement Economy</td>
                  <td className="py-2.5 px-3">Insurers & Financiers</td>
                  <td className="py-2.5 px-3">VOI inspection scheduling subscription</td>
                  <td className="py-2.5 px-3 text-rose-800">Sensor owner or service marketplace</td>
                  <td className="py-2.5 px-3 font-mono text-neutral-500">Secondary Maturation</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">5. Parametric Triggers</td>
                  <td className="py-2.5 px-3">ILS & Parametric Covers</td>
                  <td className="py-2.5 px-3">Attested event ledger trigger index</td>
                  <td className="py-2.5 px-3 text-rose-800">Settlement oracle / escrow payer</td>
                  <td className="py-2.5 px-3 font-mono text-neutral-500">Secondary Maturation</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">6. Clean-Room Compute</td>
                  <td className="py-2.5 px-3">Competing Lenders & Brokers</td>
                  <td className="py-2.5 px-3">Clean-room compute over cross-vertical join</td>
                  <td className="py-2.5 px-3 text-rose-800">General-purpose analytics platform</td>
                  <td className="py-2.5 px-3 font-mono text-neutral-500">Estate Gated</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">7. Disagreement Layer</td>
                  <td className="py-2.5 px-3">Proprietary Capital Pillar</td>
                  <td className="py-2.5 px-3">Internal signals from multi-source gaps</td>
                  <td className="py-2.5 px-3 text-rose-800">Public product feature / early trade</td>
                  <td className="py-2.5 px-3 font-mono text-neutral-500">Internal Capital Gated</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-neutral-900">8. Sovereign Illumination</td>
                  <td className="py-2.5 px-3">Government Agencies</td>
                  <td className="py-2.5 px-3">Gated vertical over unpartitioned corpus</td>
                  <td className="py-2.5 px-3 text-rose-800">Government-contractor identity</td>
                  <td className="py-2.5 px-3 font-mono text-neutral-500">Late / Estate Mature</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
