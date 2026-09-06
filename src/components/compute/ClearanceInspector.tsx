'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { ClearanceExperiment } from '@/compute/clearance-contract';
import type { ClearanceDecisionResult } from '@/compute/clearance-voi';
import type { ArtifactReference } from '@/observation/contract';

export interface ClearanceInspectorProps {
  mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED';
  manifest: ClearanceExperiment;
  result: ClearanceDecisionResult;
  artifacts: Array<{ id: string; content: unknown; contentDigest: string }>;
}

const secondary = { color: 'var(--text-secondary)' };
const selectStyle = { background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)' };
const number = (value: number | null | undefined) => value == null ? 'Unavailable' : value.toLocaleString('en-US', { maximumSignificantDigits: 7 });
const probability = (value: number | null | undefined) => value == null ? 'Unavailable' : `${number(value * 100)}%`;
const strategies: Record<string, string> = {
  NONE: 'No measurement', VOI: 'Value of information', CHEAPEST_FIRST: 'Cheapest first',
  LARGEST_VARIANCE_FIRST: 'Largest uncertainty first', MEASURE_ALL: 'Measure everything permitted',
};

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="surface p-3 sm:p-4 min-w-0 flex flex-col gap-3">
    <h2 id={id} className="m-0 text-[15px] font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</h2>
    {children}
  </section>;
}
function Value({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[12px]" style={secondary}>{label}</dt><dd className="m-0 mono text-[12px] break-words [overflow-wrap:anywhere]">{children}</dd></div>;
}
function Json({ value }: { value: unknown }) {
  return <pre className="m-0 p-3 text-[11px] whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 rounded" style={{ background: 'var(--bg-inset)' }}>{JSON.stringify(value, null, 2)}</pre>;
}
function Evidence({ reference }: { reference: ArtifactReference }) {
  return <dl className="m-0 grid gap-2">
    <Value label="Preview acquisition identifier">{reference.acquisitionId}</Value>
    <Value label="Preview descriptor digest (not a receipt)">{reference.acquisitionDigest}</Value>
    <Value label="Exact content digest">{reference.contentDigest}</Value>
  </dl>;
}

/** Browser selection only: all beliefs and outcome forecasts arrive precomputed from the server. */
export function ClearanceInspector({ mode, manifest, result, artifacts }: ClearanceInspectorProps) {
  const [actionId, setActionId] = useState(result.recommendation.actionId ?? manifest.model.actions[0].id);
  const [branchIndex, setBranchIndex] = useState(0);
  const [artifactId, setArtifactId] = useState(manifest.model.evidence.acquisitionId);
  const action = manifest.model.actions.find((a) => a.id === actionId) ?? manifest.model.actions[0];
  const actionResult = result.actions.find((a) => a.actionId === action.id);
  const evaluation = actionResult?.evaluation;
  const branch = evaluation?.branches[branchIndex] ?? evaluation?.branches[0];
  const recommended = manifest.model.actions.find((a) => a.id === result.recommendation.actionId);
  const recommendation = result.actions.find((a) => a.actionId === recommended?.id)?.evaluation;
  const actionArtifact = artifacts.find((a) => a.id === action.evidence.acquisitionId && a.contentDigest === action.evidence.contentDigest);
  const references = [manifest.model.evidence, manifest.model.assumptions.evidence, manifest.loss.evidence,
    manifest.validation.independence.evidence, ...manifest.model.actions.map((a) => a.evidence), ...manifest.validation.cases.map((c) => c.evidence)];
  const selectedReference = references.find((reference) => reference.acquisitionId === artifactId);
  const artifact = selectedReference ? artifacts.find((a) => a.id === selectedReference.acquisitionId && a.contentDigest === selectedReference.contentDigest) : undefined;
  const evidenceChoices = references.filter((reference, i) => references.findIndex((r) => r.acquisitionId === reference.acquisitionId) === i);

  function selectAction(nextId: string) {
    const next = manifest.model.actions.find((a) => a.id === nextId);
    if (!next) return;
    setActionId(next.id);
    setBranchIndex(0);
    setArtifactId(next.evidence.acquisitionId);
  }

  return <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full min-w-0 flex flex-col gap-4 text-[13px]">
    <header className="flex flex-col gap-2">
      <div className="label-sm">Compute · bounded measurement design</div>
      <h1 className="m-0 text-[20px] font-semibold" style={{ color: 'var(--text-heading)' }}>Clearance measurement design</h1>
      <p className="m-0" style={secondary}>Which permitted measurement could improve one declared clearance decision? Inspect the beliefs, decision loss and possible updates. <Link href="/product" style={{ color: 'var(--info)' }}>Product architecture</Link></p>
    </header>

    <section aria-label="Experiment boundary" data-testid="clearance-boundary" className="p-3 rounded min-w-0" style={{ background: 'var(--highlight-bg)', border: '1px solid var(--border-accent)' }}>
      <p className="m-0 font-semibold">Synthetic demonstration · no measurement or physical action is executed</p>
      <p className="mt-1 mb-0">These are invented joint states and measurement outcomes, not a surveyed opening or equipment specification. Preview evidence and results are not retained acquisitions or an admitted release. Selecting an outcome does not record an observation.</p>
      <p className="mt-1 mb-0">The method is exact finite-state Bayesian value of information, not a variational free-energy solver or a claim that the platform satisfies the Free Energy Principle. It does not certify safe passage or independently validated accuracy.</p>
      <p className="mt-2 mb-0 mono text-[11px] [overflow-wrap:anywhere]">{mode}</p>
    </section>

    <div className="grid lg:grid-cols-2 gap-4 min-w-0">
      <Panel id="clearance-current" title="Current belief and decision">
        <p className="m-0" style={secondary}>A one-axis opening and equipment model includes a shared lateral alignment offset. The decision uses the declared minimum side clearance and asymmetric losses, not confidence alone.</p>
        <dl className="m-0 grid sm:grid-cols-2 gap-3" data-testid="clearance-current-summary">
          <Value label="Computation state">{result.state}</Value>
          <Value label="Declared frame">{manifest.frame.id} · {manifest.frame.axis} · {manifest.frame.units}</Value>
          <Value label="Required minimum side clearance (m)">{number(manifest.minimumSideClearanceM)}</Value>
          <Value label="Current fit probability">{probability(result.current?.fitProbability)}</Value>
          <Value label="Model decision">{result.current?.decision ?? 'Unavailable'}</Value>
          <Value label="Expected decision error under the model">{probability(result.current?.expectedDecisionError)}</Value>
          <Value label="Expected decision loss">{number(result.current?.expectedDecisionLoss)}</Value>
          <Value label="Expected loss if accepted">{number(result.current?.risks.acceptFit)}</Value>
          <Value label="Expected loss if rejected">{number(result.current?.risks.rejectFit)}</Value>
          <Value label="Expected Brier score under the model">{number(result.current?.expectedBrierScore)}</Value>
          <Value label="Loss for unsafe acceptance">{number(manifest.loss.unsafeAccept)}</Value>
          <Value label="Loss for unnecessary rejection">{number(manifest.loss.unnecessaryReject)}</Value>
        </dl>
        <p className="m-0" style={secondary}>Loss and measurement cost use the same declared loss unit, not currency. Expected error and Brier score are predictions of this model, not measured field performance or calibration evidence.</p>
        {result.requirements.length > 0 && <p className="m-0 [overflow-wrap:anywhere]" data-testid="clearance-requirements">Unresolved requirements: {result.requirements.join(', ')}</p>}
      </Panel>

      <Panel id="clearance-recommendation" title="Recommended next measurement">
        <dl className="m-0 grid sm:grid-cols-2 gap-3" data-testid="clearance-recommendation-summary">
          <Value label="Recommendation state">{result.recommendation.state}</Value>
          <Value label="Measurement">{recommended?.label ?? 'None'}</Value>
          <Value label="Reason">{result.recommendation.reason}</Value>
          <Value label="Expected decision-loss reduction">{number(recommendation?.expectedValueOfSampleInformation)}</Value>
          <Value label="Acquisition cost">{number(recommendation?.cost)}</Value>
          <Value label="Net decision value after cost">{number(recommendation?.netValue)}</Value>
        </dl>
        <p className="m-0">Value of information = current expected decision loss − expected loss after observing the measurement. Net value subtracts its acquisition cost. A reduction in uncertainty alone does not establish a better decision.</p>
        <p className="m-0" style={secondary}>Only DECLARED_PERMITTED actions are eligible. This declaration is part of the synthetic model; a recommendation is not authorization to operate equipment, collect data or contact a provider.</p>
      </Panel>
    </div>

    <div className="grid lg:grid-cols-2 gap-4 min-w-0">
      <Panel id="clearance-measurement" title="Measurement and possible outcomes">
        <label htmlFor="clearance-action">Candidate measurement</label>
        <select id="clearance-action" className="p-2 w-full min-w-0" style={selectStyle} value={action.id} onChange={(event) => selectAction(event.target.value)}>
          {manifest.model.actions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <dl className="m-0 grid sm:grid-cols-2 gap-3" data-testid="clearance-action-detail">
          <Value label="Measurement identifier">{action.id}</Value>
          <Value label="Target">{action.target}</Value>
          <Value label="Declared permission">{action.permission}</Value>
          <Value label="Eligible for recommendation">{actionResult?.eligible ? 'Yes' : 'No'}</Value>
          <Value label="Prior target variance (m²)">{number(actionResult?.targetPriorVarianceM2)}</Value>
          <Value label="Acquisition cost">{number(action.cost)}</Value>
          <Value label="Expected post-measurement decision loss">{number(evaluation?.expectedDecisionLoss)}</Value>
          <Value label="Expected total loss including cost">{number(evaluation?.expectedTotalLoss)}</Value>
          <Value label="Expected information value before cost">{number(evaluation?.expectedValueOfSampleInformation)}</Value>
          <Value label="Net decision value after cost">{number(evaluation?.netValue)}</Value>
          <Value label="Numerical selection state">{evaluation?.selectionState ?? 'Unavailable'}</Value>
          <Value label="Numerical selection tolerance (loss units)">{number(evaluation?.selectionTolerance)}</Value>
        </dl>
        <p className="m-0" style={secondary}>A tiny positive net value within the numerical selection tolerance is retained as ambiguous, not recommended. Permission and model requirements are separate gates.</p>
        {!!evaluation?.numericalDiagnostics.length && <div data-testid="clearance-action-numerics" className="min-w-0">
          <h3 className="m-0 mb-2 text-[13px] font-semibold">Selected measurement numerical diagnostics</h3>
          <Json value={evaluation.numericalDiagnostics} />
        </div>}
        <Evidence reference={action.evidence} />
        <p className="m-0" style={secondary}>{actionArtifact ? 'Matching synthetic measurement artifact is available in the evidence inspector; choosing a measurement selects its artifact.' : 'No content-matching measurement artifact is available in this preview.'}</p>
        <label htmlFor="clearance-outcome">Hypothetical outcome</label>
        <select id="clearance-outcome" className="p-2 w-full min-w-0" style={selectStyle} disabled={!evaluation?.branches.length} value={branchIndex} onChange={(event) => setBranchIndex(Number(event.target.value))}>
          {evaluation?.branches.length ? evaluation.branches.map((b, index) => <option key={index} value={index}>{b.outcomes.map((o) => o.outcomeId).join(' + ')}</option>) : <option value={0}>Unavailable</option>}
        </select>
      </Panel>

      <Panel id="clearance-posterior" title="What would change afterward?">
        <p className="m-0 font-semibold">Hypothetical posterior · not an observed event</p>
        <div data-testid="clearance-posterior-detail" aria-live="polite" className="flex flex-col gap-3 min-w-0">
          <dl className="m-0 grid sm:grid-cols-2 gap-3">
            <Value label="Selected measurement">{action.label}</Value>
            <Value label="Hypothetical outcome">{branch?.outcomes.map((o) => o.outcomeId).join(' + ') ?? 'Unavailable'}</Value>
            <Value label="Outcome probability under the model">{probability(branch?.probability)}</Value>
            <Value label="Conditional fit probability">{probability(branch?.fitProbability)}</Value>
            <Value label="Conditional model decision">{branch?.decision ?? 'Unavailable'}</Value>
            <Value label="Conditional expected decision loss">{number(branch?.posteriorExpectedLoss)}</Value>
          </dl>
          {!branch?.posterior && <p className="m-0">No posterior is available. A zero-probability outcome cannot be conditioned on; unresolved model requirements also withhold evaluation.</p>}
          {branch?.posterior && <details>
            <summary className="cursor-pointer">Hypothetical joint-state probabilities</summary>
            <div className="mt-3"><Json value={branch.posterior} /></div>
          </details>}
        </div>
        <p className="m-0" style={secondary}>The browser selects among server-computed outcomes. It does not recalculate the model, save beliefs, commission a measurement or modify any evidence. The current belief above remains unchanged.</p>
      </Panel>
    </div>

    <Panel id="clearance-baselines" title="Compare decision strategies">
      <p className="m-0" style={secondary}>Predictions under one fixed model and one measurement step. Cheapest-first and largest-uncertainty-first choose one eligible measurement; measure-everything uses the declared joint channel, not an independence shortcut.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 min-w-0" data-testid="clearance-baselines">
        {result.baselines.map((baseline) => <article key={baseline.strategy} className="p-3 rounded min-w-0" style={{ background: 'var(--bg-inset)' }} aria-label={strategies[baseline.strategy] ?? baseline.strategy}>
          <h3 className="m-0 mb-3 text-[13px] font-semibold">{strategies[baseline.strategy] ?? baseline.strategy}</h3>
          <dl className="m-0 grid gap-3">
            <Value label="Measurement identifiers">{baseline.actionIds.join(', ') || 'None'}</Value>
            <Value label="Expected decision error">{probability(baseline.evaluation?.expectedDecisionError)}</Value>
            <Value label="Expected decision loss">{number(baseline.evaluation?.expectedDecisionLoss)}</Value>
            <Value label="Measurement cost">{number(baseline.evaluation?.cost)}</Value>
            <Value label="Expected total loss">{number(baseline.evaluation?.expectedTotalLoss)}</Value>
            <Value label="Expected Brier score">{number(baseline.evaluation?.expectedBrierScore)}</Value>
          </dl>
        </article>)}
        {!result.baselines.length && <p className="m-0">Strategy comparison is unavailable while model requirements remain unresolved.</p>}
      </div>
    </Panel>

    <div className="grid lg:grid-cols-2 gap-4 min-w-0">
      <Panel id="clearance-validation" title="Reference comparison and validation boundary">
        <p className="m-0">{manifest.validation.independence.description}</p>
        <dl className="m-0 grid sm:grid-cols-2 gap-3" data-testid="clearance-validation-summary">
          <Value label="Declared reference independence">{manifest.validation.independence.state}</Value>
          <Value label="Reference cases provided">{manifest.validation.cases.length}</Value>
          <Value label="Validation domain">{manifest.validationDomain}</Value>
          <Value label="Independent verification">Not established</Value>
        </dl>
        <p className="m-0" style={secondary}>Synthetic references are not independent physical observations. Observed error, loss and calibration must not be replaced by the model’s own expectations. Brier score assesses probability predictions; it is not, by itself, proof of calibration.</p>
        <details>
          <summary className="cursor-pointer">Reference scoring states and results</summary>
          <div className="mt-3 grid gap-3">
            {result.baselines.map((baseline) => <div key={baseline.strategy} className="min-w-0">
              <h3 className="m-0 mb-2 text-[13px] font-semibold">{strategies[baseline.strategy] ?? baseline.strategy}</h3>
              <Json value={baseline.validation} />
            </div>)}
          </div>
        </details>
        <Evidence reference={manifest.validation.independence.evidence} />
      </Panel>

      <Panel id="clearance-evidence" title="Synthetic evidence inspector">
        <p className="m-0" style={secondary}>Model, loss, measurement and reference contents are kept distinct. Each displayed artifact must match the manifest’s exact content digest. Preview acquisition digests identify synthetic descriptors, not retained receipts.</p>
        <label htmlFor="clearance-artifact">Synthetic artifact</label>
        <select id="clearance-artifact" className="p-2 w-full min-w-0" style={selectStyle} value={artifactId} onChange={(event) => setArtifactId(event.target.value)}>
          {evidenceChoices.map((reference) => <option key={reference.acquisitionId} value={reference.acquisitionId}>{reference.acquisitionId}</option>)}
        </select>
        {selectedReference && <Evidence reference={selectedReference} />}
        {artifact ? <details>
          <summary className="cursor-pointer">Inspect selected artifact contents</summary>
          <div data-testid="clearance-artifact-detail" className="mt-3 min-w-0"><Json value={artifact.content} /></div>
        </details> : <p data-testid="clearance-artifact-unavailable" className="m-0">No content-matching artifact is available. Unrelated preview contents are not substituted.</p>}
      </Panel>
    </div>

    <Panel id="clearance-method" title="Joint dependencies, method and source snapshot">
      <p className="m-0">The opening width, equipment width and alignment offset belong to one explicit joint state distribution. Minimum side clearance = (opening width − equipment width) / 2 − |alignment offset|. The same offset affects the left and right clearances with opposite signs.</p>
      <p className="m-0">Measurement channels are represented jointly; shared alignment must not disappear when data is split into software objects.</p>
      <p className="m-0" style={secondary}>An API or service boundary does not establish a Markov blanket. This experiment does not certify conditional independence between physical subsystems or estimate a learned dependency structure.</p>
      <dl className="m-0 grid md:grid-cols-2 gap-3">
        <Value label="Experiment">{manifest.experimentId}</Value>
        <Value label="Algorithm version">{result.model.id} · {result.model.version}</Value>
        <Value label="Model assumptions">{manifest.model.assumptions.state}: {manifest.model.assumptions.description}</Value>
        <Value label="Manifest digest">{result.manifestDigest}</Value>
        <Value label="Model digest">{result.modelDigest}</Value>
        <Value label="Result digest">{result.digest}</Value>
      </dl>
      <p className="m-0">{manifest.description}</p>
      {result.numericalDiagnostics.length > 0 && <div data-testid="clearance-model-numerics" className="min-w-0">
        <h3 className="m-0 mb-2 text-[13px] font-semibold">Model numerical diagnostics</h3>
        <Json value={result.numericalDiagnostics} />
      </div>}
      <details>
        <summary className="cursor-pointer">Shared alignment and joint-state evidence</summary>
        <div data-testid="clearance-joint-detail" className="mt-3 flex flex-col gap-3">
          <p className="m-0" style={secondary}>Displayed margins are floating-point summaries. Fit classification uses the exact decimal input predicate recorded in the model contract, not a comparison against a rounded display value.</p>
          <Evidence reference={manifest.model.evidence} /><Json value={result.states} /><Json value={manifest.model.jointOutcomes} /><Json value={manifest.model.likelihoodByState} />
        </div>
      </details>
      <ul className="m-0 pl-5" aria-label="Validation exclusions">{manifest.exclusions.map((exclusion) => <li key={exclusion}>{exclusion}</li>)}</ul>
      <details>
        <summary className="cursor-pointer">Complete input manifest and computed result</summary>
        <div className="mt-3 flex flex-col gap-3"><Json value={manifest} /><Json value={result} /></div>
      </details>
    </Panel>
  </div>;
}
