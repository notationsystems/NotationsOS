import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildClearancePreview } from '@/compute/clearance-demo';
import { evaluateClearanceDecision } from '@/compute/clearance-voi';
import { ClearanceInspector } from './ClearanceInspector';

const display = (n: number) => n.toLocaleString('en-US', { maximumSignificantDigits: 7 });

// Compute the real server preview with Node's byte realm; browser interaction does no numeric work.
function serverComputation<T>(work: () => T): T {
  const browserUint8Array = globalThis.Uint8Array;
  try {
    globalThis.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
    return work();
  } finally { globalThis.Uint8Array = browserUint8Array; }
}
const buildPreview = () => serverComputation(buildClearancePreview);

afterEach(() => vi.unstubAllGlobals());

describe('ClearanceInspector', () => {
  it('states synthetic evidence, unexecuted measurements and the bounded Bayesian method', () => {
    render(<ClearanceInspector {...buildPreview()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Clearance measurement design');
    const boundary = screen.getByTestId('clearance-boundary');
    expect(boundary).toHaveTextContent('no measurement or physical action is executed');
    expect(boundary).toHaveTextContent('not retained acquisitions or an admitted release');
    expect(boundary).toHaveTextContent('Selecting an outcome does not record an observation');
    expect(boundary).toHaveTextContent('not a variational free-energy solver');
    expect(boundary).toHaveTextContent('does not certify safe passage');
    expect(boundary).toHaveTextContent('IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED');
    expect(screen.queryByRole('button', { name: /save|run|publish|admit|execute|collect/i })).not.toBeInTheDocument();
  });

  it('shows actual current risk and recommendation values without equating confidence with a decision', () => {
    const preview = buildPreview();
    render(<ClearanceInspector {...preview} />);
    const current = screen.getByTestId('clearance-current-summary');
    expect(current).toHaveTextContent(`Current fit probability${display(preview.result.current!.fitProbability * 100)}%`);
    expect(current).toHaveTextContent(`Expected decision loss${display(preview.result.current!.expectedDecisionLoss)}`);
    expect(current).toHaveTextContent(`Expected loss if accepted${display(preview.result.current!.risks.acceptFit)}`);
    expect(current).toHaveTextContent(`Expected loss if rejected${display(preview.result.current!.risks.rejectFit)}`);
    expect(current).toHaveTextContent(preview.result.current!.decision);
    const recommendation = preview.result.actions.find((a) => a.actionId === preview.result.recommendation.actionId)!;
    const summary = screen.getByTestId('clearance-recommendation-summary');
    expect(summary).toHaveTextContent(recommendation.label);
    expect(summary).toHaveTextContent(`Expected decision-loss reduction${display(recommendation.evaluation!.expectedValueOfSampleInformation)}`);
    expect(summary).toHaveTextContent(`Acquisition cost${display(recommendation.evaluation!.cost)}`);
    expect(summary).toHaveTextContent(`Net decision value after cost${display(recommendation.evaluation!.netValue)}`);
    expect(screen.getByRole('region', { name: 'Recommended next measurement' })).toHaveTextContent('a recommendation is not authorization');
  });

  it('selects precomputed outcome beliefs without modifying the current belief, inputs or evidence', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    const original = JSON.stringify(preview);
    const fetch = vi.fn(() => { throw new Error('Unexpected provider access'); });
    vi.stubGlobal('fetch', fetch);
    render(<ClearanceInspector {...preview} />);
    const current = screen.getByTestId('clearance-current-summary').textContent;
    const selected = preview.result.actions.find((a) => a.actionId === preview.result.recommendation.actionId)!;
    const later = selected.evaluation!.branches[1];
    await user.selectOptions(screen.getByLabelText('Hypothetical outcome'), '1');
    const posterior = screen.getByTestId('clearance-posterior-detail');
    expect(posterior).toHaveTextContent(later.outcomes[0].outcomeId);
    expect(posterior).toHaveTextContent(`Conditional fit probability${display(later.fitProbability! * 100)}%`);
    expect(posterior).toHaveTextContent(later.decision!);
    await user.click(screen.getByText('Hypothetical joint-state probabilities', { selector: 'summary' }));
    expect(posterior).toHaveTextContent(later.posterior![0].stateId);
    expect(screen.getByTestId('clearance-current-summary').textContent).toBe(current);
    expect(JSON.stringify(preview)).toBe(original);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('changes measurement, resets outcome selection and binds its exact evidence artifact', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    render(<ClearanceInspector {...preview} />);
    await user.selectOptions(screen.getByLabelText('Hypothetical outcome'), '1');
    const next = preview.manifest.model.actions.find((a) => a.id !== preview.result.recommendation.actionId)!;
    await user.selectOptions(screen.getByLabelText('Candidate measurement'), next.id);
    expect(screen.getByLabelText('Hypothetical outcome')).toHaveValue('0');
    const detail = screen.getByTestId('clearance-action-detail');
    expect(detail).toHaveTextContent(next.id);
    expect(detail).toHaveTextContent(next.target);
    expect(detail).toHaveTextContent(next.permission);
    expect(screen.getByLabelText('Synthetic artifact')).toHaveValue(next.evidence.acquisitionId);
    const region = screen.getByRole('region', { name: 'Synthetic evidence inspector' });
    expect(region).toHaveTextContent(next.evidence.acquisitionDigest);
    expect(region).toHaveTextContent(next.evidence.contentDigest);
    const artifact = preview.artifacts.find((a) => a.id === next.evidence.acquisitionId)!;
    expect(screen.getByTestId('clearance-artifact-detail')).not.toBeVisible();
    await user.click(screen.getByText('Inspect selected artifact contents', { selector: 'summary' }));
    expect(screen.getByTestId('clearance-artifact-detail')).toBeVisible();
    expect(screen.getByTestId('clearance-artifact-detail').textContent).toBe(JSON.stringify(artifact.content, null, 2));
  });

  it('shows all five strategy expectations separately from withheld empirical scoring', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    render(<ClearanceInspector {...preview} />);
    const baseline = screen.getByTestId('clearance-baselines');
    expect(within(baseline).getAllByRole('article')).toHaveLength(5);
    const all = within(baseline).getByRole('article', { name: 'Measure everything permitted' });
    const allResult = preview.result.baselines.find((b) => b.strategy === 'MEASURE_ALL')!;
    expect(all).toHaveTextContent(`Expected total loss${display(allResult.evaluation.expectedTotalLoss)}`);
    for (const id of allResult.actionIds) expect(all).toHaveTextContent(id);
    const validation = screen.getByRole('region', { name: 'Reference comparison and validation boundary' });
    expect(validation).toHaveTextContent('UNRESOLVED');
    expect(validation).toHaveTextContent('Synthetic references are not independent physical observations');
    expect(validation).toHaveTextContent('Brier score assesses probability predictions');
    await user.click(screen.getByText('Reference scoring states and results', { selector: 'summary' }));
    expect(validation).toHaveTextContent('UNRESOLVED_INDEPENDENCE');
    expect(validation).toHaveTextContent('"metrics": null');
    expect(validation).toHaveTextContent('"scoredCaseCount": 0');
  });

  it('preserves the shared alignment and joint channel and does not claim a Markov blanket', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    render(<ClearanceInspector {...preview} />);
    const region = screen.getByRole('region', { name: 'Joint dependencies, method and source snapshot' });
    expect(region).toHaveTextContent('same offset affects the left and right clearances with opposite signs');
    expect(region).toHaveTextContent('An API or service boundary does not establish a Markov blanket');
    expect(region).toHaveTextContent(preview.result.model.version);
    expect(region).toHaveTextContent(preview.result.digest);
    await user.click(screen.getByText('Shared alignment and joint-state evidence', { selector: 'summary' }));
    const joint = screen.getByTestId('clearance-joint-detail');
    expect(joint).toHaveTextContent('alignmentOffsetM');
    expect(joint).toHaveTextContent('leftClearanceM');
    expect(joint).toHaveTextContent('rightClearanceM');
    expect(joint).toHaveTextContent(preview.manifest.model.evidence.contentDigest);
    expect(joint).toHaveTextContent(preview.manifest.model.jointOutcomes[0].id);
  });

  it('does not display contents with a matching identifier but the wrong content digest', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    const action = preview.manifest.model.actions[0];
    const artifact = preview.artifacts.find((a) => a.id === action.evidence.acquisitionId)!;
    artifact.contentDigest = `sha256:${'0'.repeat(64)}`;
    artifact.content = { outsideContext: 'UNRELATED CONTENT MUST STAY HIDDEN' };
    preview.artifacts.push({ id: 'unreferenced-extra', contentDigest: 'not-a-reference', content: 'UNREFERENCED CONTENT' });
    render(<ClearanceInspector {...preview} />);
    await user.selectOptions(screen.getByLabelText('Candidate measurement'), action.id);
    expect(screen.getByTestId('clearance-artifact-unavailable')).toHaveTextContent('Unrelated preview contents are not substituted');
    expect(screen.queryByTestId('clearance-artifact-detail')).not.toBeInTheDocument();
    expect(screen.queryByText('UNRELATED CONTENT MUST STAY HIDDEN', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'unreferenced-extra' })).not.toBeInTheDocument();
  });

  it('withholds current belief, recommendation and forecasts when model assumptions are unresolved', () => {
    const preview = buildPreview();
    preview.manifest.model.assumptions.state = 'UNRESOLVED';
    preview.result = serverComputation(() => evaluateClearanceDecision(preview.manifest));
    render(<ClearanceInspector {...preview} />);
    expect(screen.getByTestId('clearance-current-summary')).toHaveTextContent('Current fit probabilityUnavailable');
    expect(screen.getByTestId('clearance-requirements')).toHaveTextContent('MODEL_ASSUMPTIONS_UNRESOLVED');
    expect(screen.getByTestId('clearance-recommendation-summary')).toHaveTextContent('UNRESOLVED_REQUIREMENTS');
    expect(screen.getByLabelText('Hypothetical outcome')).toBeDisabled();
    expect(screen.getByTestId('clearance-baselines')).toHaveTextContent('unavailable while model requirements remain unresolved');
  });

  it('keeps a declared but impossible outcome explicit without fabricating a posterior', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    const action = preview.manifest.model.actions[0];
    action.outcomeIds.push('impossible-reading');
    preview.result = serverComputation(() => evaluateClearanceDecision(preview.manifest));
    render(<ClearanceInspector {...preview} />);
    await user.selectOptions(screen.getByLabelText('Candidate measurement'), action.id);
    const branchIndex = preview.result.actions.find((a) => a.actionId === action.id)!.evaluation!.branches.findIndex((b) => b.probability === 0);
    expect(branchIndex).toBeGreaterThanOrEqual(0);
    await user.selectOptions(screen.getByLabelText('Hypothetical outcome'), String(branchIndex));
    const posterior = screen.getByTestId('clearance-posterior-detail');
    expect(posterior).toHaveTextContent('impossible-reading');
    expect(posterior).toHaveTextContent('Outcome probability under the model0%');
    expect(posterior).toHaveTextContent('Conditional fit probabilityUnavailable');
    expect(posterior).toHaveTextContent('zero-probability outcome cannot be conditioned on');
    expect(within(posterior).queryByText('Hypothetical joint-state probabilities')).not.toBeInTheDocument();
  });

  it('exposes negative value and ineligible measurement without executing or recommending it', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    const action = preview.manifest.model.actions[0];
    action.permission = 'PROHIBITED';
    action.cost = 10000;
    preview.result = serverComputation(() => evaluateClearanceDecision(preview.manifest));
    render(<ClearanceInspector {...preview} />);
    await user.selectOptions(screen.getByLabelText('Candidate measurement'), action.id);
    const detail = screen.getByTestId('clearance-action-detail');
    expect(detail).toHaveTextContent('PROHIBITED');
    expect(detail).toHaveTextContent('Eligible for recommendationNo');
    const evaluation = preview.result.actions.find((a) => a.actionId === action.id)!.evaluation!;
    expect(evaluation.netValue).toBeLessThan(0);
    expect(detail).toHaveTextContent(`Net decision value after cost${display(evaluation.netValue)}`);
    expect(preview.result.recommendation.actionId).not.toBe(action.id);
  });

  it('shows numerical ambiguity and normalization diagnostics without promoting a tiny positive value', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    const action = preview.manifest.model.actions.find((a) => a.target === 'ALIGNMENT_OFFSET')!;
    for (const other of preview.manifest.model.actions) if (other.id !== action.id) other.permission = 'PROHIBITED';
    preview.manifest.model.states[0].probability += 1e-13;
    const initial = serverComputation(() => evaluateClearanceDecision(preview.manifest));
    action.cost = initial.actions.find((a) => a.actionId === action.id)!.evaluation!.expectedValueOfSampleInformation - 1e-13;
    preview.result = serverComputation(() => evaluateClearanceDecision(preview.manifest));
    const evaluation = preview.result.actions.find((a) => a.actionId === action.id)!.evaluation!;
    expect(evaluation.netValue).toBeGreaterThan(0);
    expect(evaluation.selectionState).toBe('NUMERICALLY_AMBIGUOUS');
    render(<ClearanceInspector {...preview} />);
    await user.selectOptions(screen.getByLabelText('Candidate measurement'), action.id);
    const detail = screen.getByTestId('clearance-action-detail');
    expect(detail).toHaveTextContent('Numerical selection stateNUMERICALLY_AMBIGUOUS');
    expect(detail).toHaveTextContent(`Numerical selection tolerance (loss units)${display(evaluation.selectionTolerance)}`);
    expect(screen.getByTestId('clearance-recommendation-summary')).toHaveTextContent('NO_MEASUREMENT');
    expect(screen.getByTestId('clearance-action-numerics')).toBeVisible();
    expect(screen.getByTestId('clearance-action-numerics')).toHaveTextContent('POSITIVE_NET_WITHIN_SELECTION_ROUNDOFF_TOLERANCE');
    expect(screen.getByTestId('clearance-model-numerics')).toBeVisible();
    expect(screen.getByTestId('clearance-model-numerics')).toHaveTextContent('UNIT_MASS_NORMALIZED_WITHIN_TOLERANCE');
  });
});
