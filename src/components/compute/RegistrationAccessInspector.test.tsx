import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { buildRegistrationAccessPreview } from '@/compute/registration-access-demo';
import { evaluateRegistrationAccess } from '@/compute/registration-access';
import { RegistrationAccessInspector } from './RegistrationAccessInspector';

const display = (n: number) => n.toLocaleString('en-US', { maximumSignificantDigits: 8 });

// The real preview builder runs in Node. jsdom supplies a different Uint8Array
// realm, so use Node's byte constructor only while executing server code; no
// hashes, solver results or browser interactions are mocked.
function serverComputation<T>(work: () => T): T {
  const browserUint8Array = globalThis.Uint8Array;
  try {
    globalThis.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
    return work();
  } finally { globalThis.Uint8Array = browserUint8Array; }
}
const buildPreview = () => serverComputation(buildRegistrationAccessPreview);

describe('RegistrationAccessInspector', () => {
  it('states its synthetic, non-retained boundary and separates fitting from withheld discrepancy', () => {
    const preview = buildPreview();
    render(<RegistrationAccessInspector {...preview} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Registration and access');
    const boundary = screen.getByTestId('registration-boundary');
    expect(boundary).toHaveTextContent('Synthetic BIM-control geometry, not a parsed BIM model');
    expect(boundary).toHaveTextContent('not retained acquisitions or an admitted release');
    expect(boundary).toHaveTextContent('not independently attested');
    expect(boundary).toHaveTextContent('safe-egress assurance');
    expect(boundary).toHaveTextContent('IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED');
    const summary = screen.getByTestId('alignment-summary');
    expect(summary).toHaveTextContent(`Fitting RMSE (m)${display(preview.result.registration.fittingRmseM!)}`);
    expect(summary).toHaveTextContent(`Withheld check-point discrepancy RMSE (m)${display(preview.result.registration.checkPointRmseM!)}`);
    expect(summary).toHaveTextContent(preview.manifest.sourceFrame.id);
    expect(summary).toHaveTextContent(preview.manifest.targetFrame.id);
    expect(screen.queryByRole('button', { name: /save|run|publish|admit/i })).not.toBeInTheDocument();
  });

  it('shows the actual permitted base path, preserving separate Euclidean semantics and blocked edges', () => {
    const preview = buildPreview();
    render(<RegistrationAccessInspector {...preview} />);
    const detail = screen.getByTestId('access-result');
    expect(detail).toHaveTextContent('EUCLIDEAN_3D — straight-line separation (m)2');
    expect(detail).toHaveTextContent('PERMITTED_NETWORK_LENGTH — declared path length (m)10');
    expect(detail).toHaveTextContent(preview.result.access.base.nodeIds.join(' → '));
    expect(detail).toHaveTextContent(preview.result.access.base.edgeIds.join(' → '));
    expect(detail).toHaveTextContent('Excluded UNKNOWN edgesunknown-shortcut');
    expect(detail).toHaveTextContent('Excluded PROHIBITED edgeslocked-door');
    expect(detail).toHaveTextContent('UNKNOWN is not permission');
  });

  it('selects the precomputed detour and an unreachable closure without replacing either with a chord', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    const original = JSON.stringify(preview);
    render(<RegistrationAccessInspector {...preview} />);
    const choices = screen.getByLabelText('Access scenario');
    await user.selectOptions(choices, '1');
    const detail = screen.getByTestId('access-result');
    expect(detail).toHaveTextContent('Selected scenariopassage-closed');
    expect(detail).toHaveTextContent('PERMITTED_NETWORK_LENGTH — declared path length (m)16');
    expect(detail).toHaveTextContent('detour-up → detour-across → detour-down');
    expect(detail).toHaveTextContent('Closed edgespassage');
    await user.selectOptions(choices, '2');
    expect(detail).toHaveTextContent('Unavailable — UNREACHABLE');
    expect(detail).toHaveTextContent('Ordered node pathNone');
    expect(detail).toHaveTextContent('Ordered edge pathNone');
    expect(detail).toHaveTextContent('EUCLIDEAN_3D — straight-line separation (m)2');
    await user.selectOptions(choices, '0');
    expect(detail).toHaveTextContent('PERMITTED_NETWORK_LENGTH — declared path length (m)10');
    expect(JSON.stringify(preview)).toBe(original);
  });

  it('exposes source, target, variance and fit residual with its exact synthetic descriptor and content', () => {
    const preview = buildPreview();
    render(<RegistrationAccessInspector {...preview} />);
    const control = preview.manifest.controls[0];
    const detail = screen.getByTestId('measurement-detail');
    expect(detail).toHaveTextContent('USED_IN_FIT');
    expect(detail).toHaveTextContent(control.measurementId);
    expect(detail).toHaveTextContent(`[${control.sourceM.map(display).join(', ')}]`);
    expect(detail).toHaveTextContent(`[${control.targetM.map(display).join(', ')}]`);
    expect(detail).toHaveTextContent('Target variance per axis (m²)0.0004');
    expect(detail).toHaveTextContent(control.evidence.acquisitionDigest);
    expect(detail).toHaveTextContent('Preview descriptor digest (not a receipt)');
    expect(screen.getByTestId('artifact-detail')).toHaveTextContent(control.evidence.contentDigest);
    expect(screen.getByTestId('artifact-detail')).toHaveTextContent(control.measurementId);
  });

  it('selects held-out evidence and reports conditional prediction covariance without promoting it to accuracy', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    render(<RegistrationAccessInspector {...preview} />);
    await user.selectOptions(screen.getByLabelText('Control or check point'), String(preview.manifest.controls.length));
    const checkpoint = preview.manifest.checkPoints[0];
    const comparison = preview.result.registration.comparisons[0];
    const detail = screen.getByTestId('measurement-detail');
    expect(detail).toHaveTextContent('EXCLUDED_FROM_FIT');
    expect(detail).toHaveTextContent(checkpoint.measurementId);
    expect(detail).toHaveTextContent(display(comparison.distanceM));
    expect(detail).toHaveTextContent(comparison.uncertaintyState);
    expect(screen.getByLabelText('Synthetic artifact')).toHaveValue(checkpoint.evidence.acquisitionId);
    expect(screen.getByTestId('artifact-detail')).toHaveTextContent(checkpoint.evidence.contentDigest);
    expect(screen.getByTestId('artifact-detail')).toHaveTextContent('Invented 0.1 metre check-point bias');
    await user.click(screen.getByText('Check-point prediction and residual uncertainty', { selector: 'summary' }));
    expect(detail).toHaveTextContent('Marginal standardized residuals are not independent unit-normal guarantees');
    expect(detail).toHaveTextContent('predictiveResidualCovariance');
  });

  it('exposes the local covariance parameterization and mixed units separately from transform translation', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    render(<RegistrationAccessInspector {...preview} />);
    await user.click(screen.getByText('Transform and conditional local covariance', { selector: 'summary' }));
    const covariance = screen.getByTestId('registration-covariance');
    expect(covariance).toBeVisible();
    expect(covariance).toHaveTextContent('not global accuracy');
    expect(covariance).toHaveTextContent('Rotation block: rad²');
    expect(covariance).toHaveTextContent('Centroid-translation block: m²');
    expect(covariance).toHaveTextContent('not covariance of the transform-origin translation');
    expect(covariance).toHaveTextContent(preview.result.registration.fit!.numerics.covarianceParameterization);
  });

  it('keeps unresolved alignment and unavailable check variance explicit while the graph remains inspectable', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    preview.manifest.controls[0].varianceM2 = null;
    preview.result = serverComputation(() => evaluateRegistrationAccess(preview.manifest));
    render(<RegistrationAccessInspector {...preview} />);
    expect(screen.getByTestId('alignment-summary')).toHaveTextContent('UNRESOLVED_REQUIREMENTS');
    expect(screen.getByText('Unresolved: CONTROL_VARIANCE_UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByTestId('measurement-detail')).toHaveTextContent('Residual distance (m)Unavailable');
    expect(screen.queryByTestId('registration-covariance')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Access scenario'), '2');
    expect(screen.getByTestId('access-result')).toHaveTextContent('UNREACHABLE');
  });

  it('lets operators inspect the graph artifact and complete manifest without any write action', async () => {
    const user = userEvent.setup();
    const preview = buildPreview();
    render(<RegistrationAccessInspector {...preview} />);
    await user.selectOptions(screen.getByLabelText('Synthetic artifact'), preview.manifest.access.evidence.acquisitionId);
    const artifact = screen.getByTestId('artifact-detail');
    expect(artifact).toHaveTextContent(preview.manifest.access.evidence.contentDigest);
    expect(artifact).toHaveTextContent('unknown-shortcut');
    expect(artifact).toHaveTextContent('locked-door');
    await user.click(screen.getByText('Complete input manifest and method contract', { selector: 'summary' }));
    const method = screen.getByRole('region', { name: 'Method, assumptions and source snapshot' });
    expect(within(method).getByRole('list', { name: 'Declared assumptions' })).toHaveTextContent('not independently verified');
    expect(method).toHaveTextContent('"canonicalAdmission": false');
    expect(method).toHaveTextContent('"physicalActionAuthorized": false');
    expect(method).toHaveTextContent('"liveAccessVerified": false');
  });
});
