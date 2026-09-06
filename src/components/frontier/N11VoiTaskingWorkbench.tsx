'use client';

import { useState } from 'react';
import type { ProjectMilestoneDrawContext } from '@/domain/n11MeasurementEconomy';
import { optimizeInspectionTasking } from '@/domain/n11MeasurementEconomy';
import { fmtUtc, shortHash } from '@/lib/format';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';
import type { TaskingOrderRecord } from '@/domain/productionPipeline';
import { getActiveParameterSet } from '@/domain/parameterRegistry';

interface N11VoiTaskingWorkbenchProps {
  initialContexts: readonly ProjectMilestoneDrawContext[];
}

function createCompletedTaskingOrder(
  orderSeq: number,
  projectId: string,
  targetMilestone: string,
  instrumentId: TaskingOrderRecord['instrumentId'],
  sensitivity: number,
  falseAlarmRate: number,
  unitCostCents: number,
  defectExisted: boolean,
  sensorAlerted: boolean,
  latencyHours: number
): TaskingOrderRecord {
  const timestamp = 1786500000000 + orderSeq * 3600000;
  return {
    orderId: `N11-TASK-LIVE-${orderSeq.toString().padStart(4, '0')}`,
    projectId,
    targetMilestone,
    instrumentId,
    status: 'CALIBRATED',
    dispatchedAt: new Date(timestamp - 48 * 3600000).toISOString(),
    observedAt: new Date(timestamp).toISOString(),
    calibrationRunAt: new Date(timestamp).toISOString(),
    priors: {
      assumedSensitivity: sensitivity,
      assumedFalseAlarmRate: falseAlarmRate,
      authorizedCostCents: unitCostCents,
    },
    observationOutcome: {
      defectActuallyExisted: defectExisted,
      instrumentDetectedDefect: sensorAlerted,
      turnaroundHoursElapsed: latencyHours,
      measuredNoiseVarianceMm: 2.1,
    },
  };
}

export function N11VoiTaskingWorkbench({ initialContexts }: N11VoiTaskingWorkbenchProps) {
  const [selectedContextId, setSelectedContextId] = useState<string>(initialContexts[0]?.projectId ?? '');
  const [drawAmountMultiplier, setDrawAmountMultiplier] = useState<number>(1.0);
  const [priorProbabilityPct, setPriorProbabilityPct] = useState<number>(14);
  const [ordersHistory, setOrdersHistory] = useState<TaskingOrderRecord[]>([...FIXTURE_TASKING_ORDERS]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [defectExisted, setDefectExisted] = useState(true);
  const [sensorAlerted, setSensorAlerted] = useState(true);

  const baseContext = initialContexts.find((c) => c.projectId === selectedContextId) ?? initialContexts[0];

  const activeContext: ProjectMilestoneDrawContext = {
    ...baseContext,
    requestedDrawAmountCents: Math.round(baseContext.requestedDrawAmountCents * drawAmountMultiplier),
    estimatedDefectCostAtRiskCents: Math.round(baseContext.estimatedDefectCostAtRiskCents * drawAmountMultiplier),
    priorDefectProbability: priorProbabilityPct / 100,
  };

  const paramSet = getActiveParameterSet();
  const schedule = optimizeInspectionTasking(activeContext, {
    paramSet,
    taskingHistory: ordersHistory,
  });
  const recommended = schedule.recommendedInstrument;

  const handleRecordObservation = () => {
    const newOrder = createCompletedTaskingOrder(
      ordersHistory.length + 1,
      activeContext.projectId,
      activeContext.milestoneTitle,
      recommended.instrument.id,
      recommended.instrument.defectDetectionSensitivity,
      recommended.instrument.falseAlarmRate,
      recommended.instrument.unitCostCents,
      defectExisted,
      sensorAlerted,
      recommended.instrument.latencyHours
    );

    setOrdersHistory((prev) => [newOrder, ...prev]);
    setShowLogModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Scenario Switcher */}
      <div className="border border-neutral-200 bg-white p-5 rounded-lg shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-neutral-100 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-900">
                N11 Value-of-Information (VOI) Tasking Optimizer
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold">
                CLOSED-LOOP CALIBRATED
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">
              Bayesian Decision Loss Optimization for Project Finance Milestone Draws • Model Priors: {paramSet.version}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-medium">Megaproject Draw:</span>
            <select
              value={selectedContextId}
              onChange={(e) => setSelectedContextId(e.target.value)}
              className="text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              {initialContexts.map((ctx) => (
                <option key={ctx.projectId} value={ctx.projectId}>
                  {ctx.projectName} (${(ctx.requestedDrawAmountCents / 1e8).toFixed(1)}M Draw)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Sliders for Credit Officers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs">
          <div>
            <div className="flex justify-between font-medium text-neutral-700 mb-1">
              <span>Requested Draw Size</span>
              <span className="font-mono font-bold">${(activeContext.requestedDrawAmountCents / 1e8).toFixed(1)}M USD</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={drawAmountMultiplier}
              onChange={(e) => setDrawAmountMultiplier(parseFloat(e.target.value))}
              className="w-full accent-neutral-900 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
            />
            <div className="text-[10px] text-neutral-400 mt-1">
              Defect cost at risk: ${(activeContext.estimatedDefectCostAtRiskCents / 1e8).toFixed(2)}M
            </div>
          </div>

          <div>
            <div className="flex justify-between font-medium text-neutral-700 mb-1">
              <span>Prior Defect Probability P(θ)</span>
              <span className="font-mono font-bold">{priorProbabilityPct}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="45"
              step="1"
              value={priorProbabilityPct}
              onChange={(e) => setPriorProbabilityPct(parseInt(e.target.value, 10))}
              className="w-full accent-neutral-900 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
            />
            <div className="text-[10px] text-neutral-400 mt-1">
              Subcontractor baseline defect rate prior to metrology inspection
            </div>
          </div>

          <div>
            <div className="flex justify-between font-medium text-neutral-700 mb-1">
              <span>Lender Draw Latency Window</span>
              <span className="font-mono font-bold">{activeContext.maxAllowedLatencyHours} Hours</span>
            </div>
            <div className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded border border-neutral-200">
              Dispute Delay Penalty: <strong className="font-mono">${((activeContext.requestedDrawAmountCents * 0.015) / 1e5).toFixed(1)}k</strong>
              <span className="block text-[10px] text-neutral-400 mt-0.5">CFMA Prior: 1.5% draw interest carry</span>
            </div>
          </div>
        </div>

        {/* Computation Receipt Strip */}
        <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between text-[11px] text-neutral-600 gap-2 font-mono">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold">
              Receipt Notarized
            </span>
            <span>ID: <strong className="text-neutral-900">{schedule.computationReceipt.receiptId}</strong></span>
          </div>
          <div className="flex items-center gap-3">
            <span>Inputs: {shortHash(schedule.computationReceipt.inputsDigest)}</span>
            <span>Outputs: {shortHash(schedule.computationReceipt.outputDigest)}</span>
            <span>Params: {schedule.computationReceipt.parameterSetVersion}</span>
          </div>
        </div>
      </div>

      {/* Recommended Pareto Instrument Hero Card */}
      <div className="border border-emerald-300 bg-emerald-50/40 p-6 rounded-lg shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-emerald-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-600 text-white uppercase tracking-wider">
                Optimal VOI Instrument
              </span>
              <span className="text-xs text-emerald-800 font-mono font-semibold">
                Status: {recommended.calibrationStatus}
              </span>
            </div>
            <h4 className="text-xl font-bold text-neutral-900 mt-1">
              {recommended.instrument.label}
            </h4>
            <p className="text-xs text-neutral-600 mt-1 max-w-2xl">
              {recommended.reasoning}
            </p>
          </div>

          <div className="flex flex-col items-end">
            <div className="text-xs text-neutral-500 font-medium">Net Measurement Surplus</div>
            <div className="text-3xl font-extrabold font-mono text-emerald-700">
              +${(recommended.netMeasurementSurplusCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[11px] font-mono text-emerald-800 font-bold">
              ROI: {recommended.returnOnMeasurementSpendRatio}x Information Return
            </div>
          </div>
        </div>

        {/* Bayesian Loss Delta Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs font-mono">
          <div className="bg-white/80 p-3 rounded border border-emerald-200">
            <div className="text-[10px] text-neutral-500 uppercase font-sans font-semibold">Prior Expected Loss L₀</div>
            <div className="text-base font-bold text-neutral-900 mt-0.5">
              ${(recommended.priorExpectedLossCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[10px] text-neutral-500">Unmitigated risk</div>
          </div>

          <div className="bg-white/80 p-3 rounded border border-emerald-200">
            <div className="text-[10px] text-neutral-500 uppercase font-sans font-semibold">Posterior Loss L₁</div>
            <div className="text-base font-bold text-emerald-700 mt-0.5">
              ${(recommended.posteriorExpectedLossCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[10px] text-neutral-500">Post-sensor residual</div>
          </div>

          <div className="bg-white/80 p-3 rounded border border-emerald-200">
            <div className="text-[10px] text-neutral-500 uppercase font-sans font-semibold">Authorized Cost</div>
            <div className="text-base font-bold text-neutral-800 mt-0.5">
              ${(recommended.instrument.unitCostCents / 1e5).toFixed(1)}k
            </div>
            <div className="text-[10px] text-neutral-500">Vendor tasking fee</div>
          </div>

          <div className="bg-white/80 p-3 rounded border border-emerald-200">
            <div className="text-[10px] text-neutral-500 uppercase font-sans font-semibold">Turnaround Window</div>
            <div className="text-base font-bold text-neutral-800 mt-0.5">
              {recommended.instrument.latencyHours}h / {activeContext.maxAllowedLatencyHours}h
            </div>
            <div className="text-[10px] text-emerald-700 font-bold">Within lender bound</div>
          </div>
        </div>
      </div>

      {/* Full Candidate Instruments Matrix */}
      <div className="border border-neutral-200 bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-neutral-900 text-sm">
              Candidate Instrument Portfolio & Metrology Specs
            </h4>
            <p className="text-xs text-neutral-500">
              Ranking candidate inspection technologies by Net Expected Economic Surplus (EVSI − Cost)
            </p>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-semibold transition-colors"
          >
            + Record Ground Truth Outcome
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-100/75 text-neutral-600 font-semibold border-b border-neutral-200">
              <tr>
                <th className="p-3">Instrument</th>
                <th className="p-3">Category</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Turnaround</th>
                <th className="p-3">EVSI Value</th>
                <th className="p-3">Net Surplus</th>
                <th className="p-3">ROI</th>
                <th className="p-3">Calibration Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {schedule.evaluations.map((evalItem, idx) => {
                const isOptimal = evalItem.recommendationStatus === 'OPTIMAL_SELECTION';
                return (
                  <tr
                    key={evalItem.instrument.id}
                    className={`transition-colors ${
                      isOptimal ? 'bg-emerald-50/70 font-medium' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-neutral-400 font-bold">#{idx + 1}</span>
                        <div>
                          <div className="font-semibold text-neutral-900">{evalItem.instrument.label}</div>
                          <div className="text-[10px] text-neutral-500 font-mono">
                            Sensitivity {(evalItem.instrument.defectDetectionSensitivity * 100).toFixed(1)}% · False Alarm {(evalItem.instrument.falseAlarmRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-neutral-600 text-[11px]">
                      {evalItem.instrument.category}
                    </td>
                    <td className="p-3 font-mono font-semibold text-neutral-900">
                      ${(evalItem.instrument.unitCostCents / 1e5).toFixed(1)}k
                    </td>
                    <td className="p-3 font-mono text-neutral-600">
                      {evalItem.instrument.latencyHours}h
                    </td>
                    <td className="p-3 font-mono text-emerald-800 font-semibold">
                      ${(evalItem.expectedValueOfInformationCents / 1e5).toFixed(1)}k
                    </td>
                    <td className="p-3 font-mono">
                      <span className={`font-bold ${
                        evalItem.netMeasurementSurplusCents > 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {evalItem.netMeasurementSurplusCents > 0 ? '+' : ''}
                        ${(evalItem.netMeasurementSurplusCents / 1e5).toFixed(1)}k
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-neutral-800">
                      {evalItem.returnOnMeasurementSpendRatio > 100 ? '∞' : `${evalItem.returnOnMeasurementSpendRatio}x`}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        evalItem.calibrationStatus === 'CALIBRATED_EMPIRICAL'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {evalItem.calibrationStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closed Loop Calibration History Strip */}
      <div className="border border-neutral-200 bg-white p-5 rounded-lg shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
          <div>
            <h5 className="font-bold text-neutral-900 text-sm">
              Empirical Sensor Calibration Loop ({ordersHistory.length} Completed Orders)
            </h5>
            <p className="text-xs text-neutral-500">
              Observation history updating sensor noise and sensitivity beyond initial vendor spec guesses
            </p>
          </div>
          <span className="text-xs font-mono text-neutral-500">The Calibration Moat</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {ordersHistory.slice(0, 3).map((ord) => (
            <div key={ord.orderId} className="p-3 bg-neutral-50 rounded border border-neutral-200 space-y-1">
              <div className="flex justify-between font-mono text-[10px]">
                <strong className="text-neutral-900">{ord.orderId}</strong>
                <span className="text-emerald-700 font-bold">{ord.status}</span>
              </div>
              <div className="text-neutral-700 font-medium truncate">{ord.targetMilestone}</div>
              <div className="text-[10px] text-neutral-500 font-mono">
                Instrument: {ord.instrumentId}
              </div>
              {ord.observationOutcome && (
                <div className="text-[10px] text-neutral-600 pt-1 border-t border-neutral-200">
                  Defect Existed: <strong className={ord.observationOutcome.defectActuallyExisted ? 'text-rose-600' : 'text-emerald-600'}>
                    {ord.observationOutcome.defectActuallyExisted ? 'YES' : 'NO'}
                  </strong> • Detected: <strong>{ord.observationOutcome.instrumentDetectedDefect ? 'YES' : 'NO'}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Generated Tasking Dispatch Order Draft */}
      <div className="border border-neutral-200 bg-neutral-900 text-neutral-100 p-5 rounded-lg shadow-sm font-mono text-xs space-y-3">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
          <span className="text-emerald-400 font-bold tracking-wider">
            N11 MEASUREMENT TASKING ORDER DRAFT
          </span>
          <span className="text-neutral-400 text-[11px]">
            {schedule.measurementOrderDraft.orderId}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
          <div>
            <span className="text-neutral-500 block">TARGET MILESTONE</span>
            <span className="text-neutral-200 font-semibold">{schedule.measurementOrderDraft.targetMilestone}</span>
          </div>
          <div>
            <span className="text-neutral-500 block">DISPATCHED INSTRUMENT</span>
            <span className="text-emerald-300 font-semibold">{schedule.measurementOrderDraft.dispatchedInstrument}</span>
          </div>
          <div>
            <span className="text-neutral-500 block">AUTHORIZED BUDGET</span>
            <span className="text-neutral-200 font-semibold">
              ${(schedule.measurementOrderDraft.budgetAuthorizedCents / 1e5).toFixed(2)}k USD
            </span>
          </div>
          <div>
            <span className="text-neutral-500 block">PROJECTED SURPLUS VALUE</span>
            <span className="text-emerald-300 font-semibold">
              +${(schedule.measurementOrderDraft.expectedSurplusGeneratedCents / 1e5).toFixed(2)}k USD
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-800 text-[10px] text-neutral-400 flex justify-between items-center">
          <span>{schedule.measurementOrderDraft.notaryNotice}</span>
          <span>{fmtUtc(schedule.measurementOrderDraft.generatedAt)}</span>
        </div>
      </div>

      {/* Ground Truth Observation Recording Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4 shadow-xl text-xs">
            <h4 className="text-base font-bold text-neutral-900">Record Ground Truth Inspection Outcome</h4>
            <p className="text-neutral-600">
              Close the N11 loop by recording ground-truth physical verification. This updates the empirical calibration of the instrument.
            </p>

            <div className="space-y-3">
              <div>
                <label className="font-semibold text-neutral-700 block mb-1">Target Instrument</label>
                <div className="p-2 bg-neutral-100 rounded font-mono font-medium">{recommended.instrument.label}</div>
              </div>

              <div>
                <label className="font-semibold text-neutral-700 block mb-1">Did a defect actually exist on ground truth physical teardown?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={defectExisted} onChange={() => setDefectExisted(true)} />
                    <span>Yes, defect existed</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={!defectExisted} onChange={() => setDefectExisted(false)} />
                    <span>No, site was sound</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="font-semibold text-neutral-700 block mb-1">Did the instrument trigger an alert?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={sensorAlerted} onChange={() => setSensorAlerted(true)} />
                    <span>Yes, alerted</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={!sensorAlerted} onChange={() => setSensorAlerted(false)} />
                    <span>No alert</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
              <button
                onClick={() => setShowLogModal(false)}
                className="px-3 py-1.5 border border-neutral-300 rounded font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordObservation}
                className="px-3 py-1.5 bg-neutral-900 text-white rounded font-semibold hover:bg-neutral-800"
              >
                Commit & Recalibrate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
