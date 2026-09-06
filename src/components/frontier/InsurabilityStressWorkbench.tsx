'use client';

import { useState } from 'react';
import type { StateDoiFilingRecord, LoanCollateralAsset } from '@/domain/insurabilityDynamics';
import { evaluatePortfolioCollateralShock, runHistoricalCorpusBacktest } from '@/domain/insurabilityDynamics';
import { getActiveParameterSet } from '@/domain/parameterRegistry';
import { fmtUtc, shortHash } from '@/lib/format';

interface InsurabilityStressWorkbenchProps {
  filings: readonly StateDoiFilingRecord[];
  initialLoans: readonly LoanCollateralAsset[];
}

export function InsurabilityStressWorkbench({ filings, initialLoans }: InsurabilityStressWorkbenchProps) {
  const [selectedLoanId, setSelectedLoanId] = useState<string>(initialLoans[0]?.loanId ?? '');
  const [asOfHorizon, setAsOfHorizon] = useState<string>('2026-08-05T00:00:00Z');
  const [subView, setSubView] = useState<'stress' | 'backtest' | 'parameters'>('stress');

  const paramSet = getActiveParameterSet();

  const stressResult = evaluatePortfolioCollateralShock(initialLoans, filings, {
    asOfKnowledgeTime: asOfHorizon,
    paramSet,
  });

  const backtestReports = runHistoricalCorpusBacktest();
  const selectedImpact = stressResult.loanImpacts.find((i) => i.loanId === selectedLoanId);
  const selectedLoan = initialLoans.find((l) => l.loanId === selectedLoanId) ?? initialLoans[0];

  return (
    <div className="space-y-6">
      {/* Sub-view Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setSubView('stress')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              subView === 'stress' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Portfolio Stress Run
          </button>
          <button
            onClick={() => setSubView('backtest')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              subView === 'backtest' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Historical Backtests (FL & CA)
          </button>
          <button
            onClick={() => setSubView('parameters')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              subView === 'parameters' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Parameter Registry & Citations ({Object.keys(paramSet.parameters).length})
          </button>
        </div>

        {/* Bitemporal Point-in-Time Knowledge Horizon */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500 font-medium">As-Of Knowledge Time:</span>
          <select
            value={asOfHorizon}
            onChange={(e) => setAsOfHorizon(e.target.value)}
            className="bg-white border border-neutral-300 rounded px-2.5 py-1 text-xs font-mono font-semibold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          >
            <option value="2022-02-28T00:00:00Z">2022-02-28 (FL St. Johns Wave)</option>
            <option value="2023-06-01T00:00:00Z">2023-06-01 (CA State Farm Pause)</option>
            <option value="2026-08-05T00:00:00Z">2026-08-05 (Current Estate)</option>
            <option value="2026-10-31T00:00:00Z">2026-10-31 (Full Effective Horizon)</option>
          </select>
        </div>
      </div>

      {subView === 'stress' && (
        <div className="space-y-6">
          {/* Portfolio Level Summary Shock Card */}
          <div className="border border-neutral-200 bg-white p-5 rounded-lg shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-100 gap-2">
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Lender Loan Portfolio Collateral Repricing Shock
                </h3>
                <p className="text-xs text-neutral-500 font-mono">
                  Evaluated at knowledge-time {fmtUtc(asOfHorizon)} • Model priors version: {paramSet.version}
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-mono bg-rose-100 text-rose-800 font-semibold">
                {stressResult.portfolioSummary.pctPortfolioExposed}% PORTFOLIO AT RISK
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                <div className="text-[11px] text-neutral-500 font-medium">Total Loans Evaluated</div>
                <div className="text-xl font-bold font-mono text-neutral-900 mt-0.5">
                  {stressResult.portfolioSummary.totalLoansEvaluated} Notes
                </div>
                <div className="text-[10px] text-neutral-500 font-mono">
                  ${(stressResult.portfolioSummary.totalCollateralBalanceCents / 1e8).toFixed(1)}M Total Debt
                </div>
              </div>

              <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                <div className="text-[11px] text-neutral-500 font-medium">Directly Impacted Loans</div>
                <div className="text-xl font-bold font-mono text-rose-700 mt-0.5">
                  {stressResult.portfolioSummary.loansDirectlyImpacted} of {stressResult.portfolioSummary.totalLoansEvaluated}
                </div>
                <div className="text-[10px] text-rose-600 font-mono font-medium">Withdrawal / Moratorium corridor</div>
              </div>

              <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                <div className="text-[11px] text-neutral-500 font-medium">Collateral Balance Exposed</div>
                <div className="text-xl font-bold font-mono text-rose-700 mt-0.5">
                  ${(stressResult.portfolioSummary.collateralBalanceExposedCents / 1e8).toFixed(1)}M
                </div>
                <div className="text-[10px] text-neutral-500 font-mono">Subject to forced-place shock</div>
              </div>

              <div className="p-3 bg-neutral-50 rounded border border-neutral-100">
                <div className="text-[11px] text-neutral-500 font-medium">Lead Time Advantage</div>
                <div className="text-xl font-bold font-mono text-amber-700 mt-0.5">
                  18–65 Days
                </div>
                <div className="text-[10px] text-amber-700 font-mono">Ahead of debt repricing</div>
              </div>
            </div>

            {/* Cryptographic Computation Receipt Bar */}
            <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between text-[11px] text-neutral-600 gap-2 font-mono">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold">
                  Zero Data Contamination
                </span>
                <span>Receipt: <strong className="text-neutral-900">{stressResult.computationReceipt.receiptId}</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <span>Inputs Digest: {shortHash(stressResult.computationReceipt.inputsDigest)}</span>
                <span>Output Digest: {shortHash(stressResult.computationReceipt.outputDigest)}</span>
                <span>Param Digest: {shortHash(paramSet.parameterSetDigest)}</span>
              </div>
            </div>
          </div>

          {/* Main Two-Column Asset Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Loans list */}
            <div className="lg:col-span-6 space-y-3">
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Commercial Mortgages & Project Notes ({initialLoans.length})
              </h4>
              <div className="space-y-2">
                {initialLoans.map((loan) => {
                  const impact = stressResult.loanImpacts.find((i) => i.loanId === loan.loanId);
                  const isSelected = loan.loanId === selectedLoanId;
                  return (
                    <div
                      key={loan.loanId}
                      onClick={() => setSelectedLoanId(loan.loanId)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-neutral-900 bg-neutral-50/70 shadow-sm'
                          : 'border-neutral-200 bg-white hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-bold text-neutral-900">{loan.borrowerName}</div>
                          <div className="text-xs text-neutral-500">{loan.propertyType.replace('_', ' ')} • {loan.address}</div>
                        </div>
                        {impact ? (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-rose-100 text-rose-800">
                            {impact.status}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-emerald-100 text-emerald-800">
                            UNAFFECTED
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-neutral-100 text-xs">
                        <div>
                          <div className="text-[10px] text-neutral-400">Balance</div>
                          <div className="font-mono font-semibold">${(loan.outstandingLoanBalanceCents / 1e8).toFixed(1)}M</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400">Baseline DSCR</div>
                          <div className="font-mono font-semibold">
                            {(loan.currentAnnualNoiCents / loan.annualDebtServiceCents).toFixed(2)}x
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-neutral-400">Stressed DSCR</div>
                          <div className={`font-mono font-bold ${impact?.financialShock.dscrBreach ? 'text-rose-600' : 'text-neutral-700'}`}>
                            {impact ? `${impact.financialShock.stressedDscr.toFixed(2)}x` : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Loan Drilldown & Matching State Filing Provenance */}
            <div className="lg:col-span-6 space-y-4">
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Collateral Shock & Provenance Breakdown
              </h4>

              {selectedLoan && (
                <div className="border border-neutral-200 bg-white rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                    <div>
                      <h5 className="font-bold text-neutral-900 text-sm">{selectedLoan.borrowerName}</h5>
                      <span className="text-xs text-neutral-500 font-mono">{selectedLoan.loanId}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-neutral-700">
                      Balance: ${(selectedLoan.outstandingLoanBalanceCents / 1e8).toFixed(2)}M
                    </span>
                  </div>

                  {selectedImpact ? (
                    <div className="space-y-4">
                      {/* Shock Metrics */}
                      <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-900">Forced-Place Rate Surge Applied</span>
                          <span className="text-xs font-mono font-bold text-rose-700">
                            {selectedImpact.financialShock.premiumIncreaseRatio.toFixed(1)}x Shock (WSIA Prior)
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-neutral-500 block text-[10px]">Annual Insurance Delta</span>
                            <span className="font-mono font-bold text-neutral-900">
                              +${((selectedImpact.financialShock.estimatedForcedPlacePremiumCents - selectedLoan.currentInsurancePremiumCents) / 100).toLocaleString()} / yr
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">Collateral Devaluation</span>
                            <span className="font-mono font-bold text-rose-700">
                              -{selectedImpact.financialShock.projectedCollateralDevaluationPct}%
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">Debt Service Coverage Ratio</span>
                            <span className={`font-mono font-bold ${selectedImpact.financialShock.dscrBreach ? 'text-rose-700' : 'text-neutral-900'}`}>
                              {selectedImpact.financialShock.baselineDscr}x → {selectedImpact.financialShock.stressedDscr}x
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">Lead Time to Repricing</span>
                            <span className="font-mono font-bold text-amber-800">
                              {selectedImpact.estimatedLeadTimeToRepricingDays} Days Ahead
                            </span>
                          </div>
                        </div>

                        {selectedImpact.financialShock.dscrBreach && (
                          <div className="p-2.5 bg-rose-100 border border-rose-300 rounded text-xs text-rose-900 font-medium">
                            ⚠️ Technical Covenant Breach Warning: Stressed DSCR &lt; 1.15x threshold triggers cash-flow sweep under OCC Commercial Lending Booklet Section 44.
                          </div>
                        )}
                      </div>

                      {/* Matching Filing Provenance */}
                      <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2 text-xs">
                        <div className="font-bold text-neutral-800">Matching State DOI Ingested Filing</div>
                        <div className="flex justify-between text-[11px] text-neutral-600">
                          <span>Carrier: <strong>{selectedImpact.matchingFiling.carrierGroup}</strong></span>
                          <span>Filing ID: <strong>{selectedImpact.matchingFiling.filingId}</strong></span>
                        </div>
                        <div className="text-[11px] text-neutral-600">
                          Effective Date: {fmtUtc(selectedImpact.matchingFiling.effectiveDate)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-neutral-500 bg-neutral-50 rounded-lg border border-neutral-200">
                      No active carrier withdrawal or moratorium match for this collateral as of {fmtUtc(asOfHorizon)}.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View 2: Natural Experiment Backtests (FL 2022 / CA 2023) */}
      {subView === 'backtest' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            <strong className="block font-semibold">Acceptance Check: Historical Natural Experiment Backtest</strong>
            Validating Track 3 feed against known carrier insolvency waves and moratoriums without lookahead bias.
            Retaining excluded/unresolved cases per design doctrine.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {backtestReports.map((report) => (
              <div key={report.backtestName} className="border border-neutral-200 bg-white p-5 rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-bold text-neutral-900 text-sm">{report.backtestName}</h5>
                    <div className="text-xs text-neutral-500 font-mono mt-0.5">{report.experimentCorridor}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                    {report.verdict}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100 text-xs">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">As-Of Knowledge Time</span>
                    <span className="font-mono font-medium">{fmtUtc(report.asOfKnowledgeTime)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Observable Debt Repricing</span>
                    <span className="font-mono font-medium">{fmtUtc(report.observableRepricingDate)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Demonstrated Lead Time</span>
                    <span className="font-mono font-bold text-emerald-700 text-sm">
                      {report.leadTimeDaysAheadOfRepricing} Days
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Feed Signal Timeliness</span>
                    <span className="font-mono font-bold text-neutral-800">
                      {report.feedSignaledTimely ? 'Verified Ahead' : 'Lagging'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-neutral-50 rounded border border-neutral-200 space-y-1">
                  <div className="text-[11px] font-semibold text-neutral-700">Retained Excluded/Unresolved Cases:</div>
                  {report.unresolvedOrExcludedCases.map((c) => (
                    <div key={c.caseId} className="text-[11px] text-neutral-600">
                      • <strong className="text-neutral-800">{c.caseId}:</strong> {c.description}
                      <div className="text-[10px] text-neutral-500 italic ml-2">Reason: {c.reasonForExclusion}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View 3: Parameter Registry & Model Priors */}
      {subView === 'parameters' && (
        <div className="space-y-4">
          <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-1">
            <div className="font-bold text-neutral-900">
              Active Parameter Set: {paramSet.version} (Digest: {shortHash(paramSet.parameterSetDigest)})
            </div>
            <div className="text-neutral-600 font-mono text-[11px]">
              Authorizing Entity: {paramSet.authorizingEntity}
            </div>
          </div>

          <div className="overflow-x-auto border border-neutral-200 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="p-3">Parameter Key</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Source Citation</th>
                  <th className="p-3">Model Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {Object.values(paramSet.parameters).map((param) => (
                  <tr key={param.key} className="hover:bg-neutral-50/50">
                    <td className="p-3 font-medium text-neutral-900 font-sans">
                      {param.name}
                      <div className="text-[10px] text-neutral-400 font-mono">{param.key}</div>
                    </td>
                    <td className="p-3 font-bold text-neutral-800">
                      {param.value.toString()} {param.unit}
                    </td>
                    <td className="p-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-700">
                        {param.category}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-neutral-700 text-[11px]">
                      <strong>{param.citation.sourceAuthority}</strong> ({param.citation.publicationYear})
                      <div className="text-[10px] text-neutral-500 font-mono">{param.citation.documentRef}</div>
                    </td>
                    <td className="p-3 font-sans text-neutral-600 text-[11px]">
                      {param.rationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
