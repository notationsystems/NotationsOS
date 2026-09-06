import { createHash } from 'node:crypto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildObservationReplayPreview } from '@/observation/preview';
import { ObservationReplay } from './ObservationReplay';

// jsdom gives this file another realm's Uint8Array, so the rail's byte digest refuses Node buffers here. The same
// SHA-256 over the same bytes stands in; the node-environment domain test proves the preview against the unmodified helper.
vi.mock('@/data-os/evidence-capture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data-os/evidence-capture')>();
  return { ...actual, byteDigest: (bytes: Uint8Array) => `sha256:${createHash('sha256').update(Buffer.from(bytes)).digest('hex')}` };
});

const preview = buildObservationReplayPreview();
const row = (id: string) => document.querySelector<HTMLElement>(`[data-observation="${id}"]`)!;

describe('ObservationReplay', () => {
  it('states the boundary, the method and every false flag, lists every observation with its state, blockers and kinds, and draws every frame and every window', () => {
    render(<ObservationReplay {...preview} />);
    expect(screen.getByTestId('observation-replay')).toHaveAttribute('data-selected', 'none');
    expect(screen.getByTestId('observation-replay')).toHaveTextContent('IN MEMORY SYNTHETIC PREVIEW NOT RETAINED');
    expect(screen.getByTestId('observation-replay')).toHaveTextContent('evidence class SYNTHETIC TEST');
    expect(screen.getByTestId('replay-boundary')).toHaveTextContent('payload.recorded-observation-replay 1.0.0');
    expect([...screen.getByTestId('replay-flags').querySelectorAll('li')].map((item) => item.textContent)).toEqual(['canonicalAdmission false', 'earthProjectionEligible false', 'sensorFusionPerformed false', 'objectIdentityEstablished false', 'accuracyEstablished false']);
    expect(screen.getByTestId('observation-register').querySelectorAll('tr[data-observation]')).toHaveLength(10);
    expect(row('session-a-LIDAR-observation')).toHaveAttribute('data-state', 'PLACED_ESTIMATE');
    expect(row('session-a-LIDAR-observation')).toHaveTextContent('synthetic input');
    expect(row('session-a-LIDAR-observation')).toHaveTextContent('placed estimate');
    expect(row('session-b-RADAR-observation')).toHaveAttribute('data-state', 'UNPLACED');
    expect(row('session-b-RADAR-observation')).toHaveTextContent('CALIBRATION_NOT_VALID_AT_OBSERVATION POSE_TIME_MISMATCH');
    expect(row('session-b-RADAR-observation')).toHaveTextContent('unresolved placement');
    expect(row('session-a-GNSS-observation')).toHaveTextContent('no estimate');
    expect(row('session-b-drift-LIDAR-observation')).toHaveTextContent('unaligned');
    const diagram = screen.getByTestId('frame-diagram');
    expect(diagram.querySelectorAll('[data-node]')).toHaveLength(preview.manifest.frames.length);
    expect(diagram.querySelectorAll('[data-node][data-active="true"]')).toHaveLength(0);
    expect(diagram.querySelectorAll('[data-edge]')).toHaveLength(preview.manifest.calibrations.length + preview.manifest.poses.length);
    const timeline = screen.getByTestId('timeline');
    expect(timeline).toHaveAttribute('data-timeline', 'test-timeline');
    expect(timeline.querySelectorAll('[data-window][data-kind="CLOCK"]')).toHaveLength(2);
    expect(timeline.querySelectorAll('[data-tick][data-kind="OBSERVATION"]')).toHaveLength(9);
    expect(timeline.querySelector('[data-mismatch="session-b-RADAR-observation"]')).toHaveTextContent('pose +10 ms');
    expect(screen.getByTestId('timeline-unaligned')).toHaveTextContent('session-b-drift-LIDAR-observation');
    expect(screen.getByTestId('timeline-unaligned')).toHaveTextContent('DEVICE_MONOTONIC');
    expect(screen.getByTestId('comparison-register').querySelectorAll('tr[data-comparison]')).toHaveLength(preview.computation.comparisons.length);
    expect(screen.queryByTestId('replay-inspector')).toBeNull();
  });

  it('connects a selected observation to its retained evidence, its supplied estimate, its chain judged at its time, its placement and its comparisons; selection follows the diagram, the timeline and the comparisons', async () => {
    const user = userEvent.setup();
    render(<ObservationReplay {...preview} />);
    await user.click(within(row('session-a-LIDAR-observation')).getByRole('button'));
    expect(screen.getByTestId('observation-replay')).toHaveAttribute('data-selected', 'session-a-LIDAR-observation');
    const inspector = screen.getByTestId('replay-inspector');
    expect(within(inspector).getByTestId('inspector-evidence')).toHaveTextContent(preview.artifact.id);
    expect(within(inspector).getByTestId('inspector-evidence')).toHaveTextContent('SYNTHETIC_TEST_TEXT_NOT_SENSOR_DATA');
    expect(within(inspector).getByTestId('inspector-estimate')).toHaveTextContent('(5, 0, 0) m in session-a-LIDAR-frame');
    expect(within(inspector).getByTestId('inspector-estimate')).toHaveTextContent('none supplied');
    expect(within(inspector).getByTestId('inspector-estimate')).toHaveTextContent('OPERATOR_ASSERTION');
    const steps = [...within(inspector).getByTestId('inspector-chain').querySelectorAll('[data-step]')].map((s) => `${s.getAttribute('data-step')}:${s.getAttribute('data-state')}`);
    expect(steps).toEqual(['SENSOR:FRAME', 'CALIBRATION:VALID', 'BODY:FRAME', 'POSE:VALID', 'WORLD:FRAME']);
    expect(within(inspector).getByTestId('inspector-chain')).toHaveTextContent('t = (1, 0, 0) m');
    expect(within(inspector).getByTestId('inspector-placement')).toHaveAttribute('data-state', 'PLACED_ESTIMATE');
    expect(within(inspector).getByTestId('inspector-placement')).toHaveTextContent('(16.000, 0.000, 0.000) m');
    expect(within(inspector).getByTestId('inspector-placement')).toHaveTextContent('NOT_PROPAGATED');
    expect(within(inspector).getByTestId('inspector-comparisons')).toHaveTextContent('RESIDUAL_ONLY');
    expect(within(inspector).getByTestId('inspector-comparisons')).toHaveTextContent('not a verified identity');
    // The diagram activates exactly the chain; the timeline marks the selection.
    const diagram = screen.getByTestId('frame-diagram');
    expect([...diagram.querySelectorAll('[data-node][data-active="true"]')].map((n) => n.getAttribute('data-node')).sort()).toEqual(['session-a-LIDAR-frame', 'session-a-body', 'world']);
    expect(diagram.querySelector('[data-edge="session-a-LIDAR-calibration"]')).toHaveAttribute('data-state', 'VALID');
    expect(screen.getByTestId('timeline').querySelector('[data-tick="session-a-LIDAR-observation"]')).toHaveAttribute('data-selected', 'true');
    // Selection from the diagram: the radar's sensor node opens the unresolved placement with its blockers explained.
    await user.click(within(diagram).getByRole('button', { name: 'Select the observation of session-b-RADAR' }));
    expect(screen.getByTestId('observation-replay')).toHaveAttribute('data-selected', 'session-b-RADAR-observation');
    const placement = within(screen.getByTestId('replay-inspector')).getByTestId('inspector-placement');
    expect(placement).toHaveAttribute('data-state', 'UNPLACED');
    expect(placement).toHaveTextContent('POSE_TIME_MISMATCH');
    expect(placement).toHaveTextContent('Exact support only: no interpolation, no nearest pose.');
    expect([...within(screen.getByTestId('replay-inspector')).getByTestId('inspector-chain').querySelectorAll('[data-step]')].map((s) => s.getAttribute('data-state'))).toEqual(['FRAME', 'INVALID', 'FRAME', 'INVALID', 'FRAME']);
    expect(diagram.querySelector('[data-edge="session-b-late-pose"]')).toHaveAttribute('data-state', 'INVALID');
    expect(within(screen.getByTestId('replay-inspector')).getByTestId('inspector-comparisons')).toHaveTextContent('One side of the comparison has no computed placement.');
    // Selection from the timeline and from the unaligned list.
    await user.click(within(screen.getByTestId('timeline')).getByRole('button', { name: 'Select session-b-CAMERA-observation' }));
    expect(screen.getByTestId('observation-replay')).toHaveAttribute('data-selected', 'session-b-CAMERA-observation');
    expect(within(screen.getByTestId('replay-inspector')).getByTestId('inspector-placement')).toHaveTextContent('(16.050, 0.000, 0.000) m');
    await user.click(within(screen.getByTestId('timeline-unaligned')).getByRole('button', { name: 'session-b-drift-LIDAR-observation' }));
    const drift = screen.getByTestId('replay-inspector');
    expect(drift).toHaveTextContent('none: no declared mapping to a common timeline');
    expect(within(drift).getByTestId('inspector-placement')).toHaveTextContent('CLOCK_ALIGNMENT_UNAVAILABLE');
    expect(within(drift).getByTestId('inspector-estimate')).toHaveTextContent('UNRESOLVED');
    // A GNSS observation: a receiver status, no estimate, no chain to judge.
    await user.click(within(row('session-a-GNSS-observation')).getByRole('button'));
    expect(within(screen.getByTestId('replay-inspector')).getByTestId('inspector-gnss')).toHaveTextContent('UNKNOWN · a receiver solution status as recorded, not an accuracy');
    expect(within(screen.getByTestId('replay-inspector')).getByTestId('inspector-estimate')).toHaveTextContent('no point');
    // Escape closes the inspector.
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('replay-inspector')).toBeNull();
  });
});
