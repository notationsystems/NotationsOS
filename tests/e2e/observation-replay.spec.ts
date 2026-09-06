import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('observation replay: the synthetic preview reads as frames, time, observations and comparisons, and selection connects the diagram, the timeline, the register and the inspector', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/compute/observations');
  await expect(page.getByRole('heading', { level: 1, name: 'Observation replay' })).toBeVisible();
  const surface = page.getByTestId('observation-replay');
  await expect(surface).toContainText('IN MEMORY SYNTHETIC PREVIEW NOT RETAINED');
  await expect(page.getByTestId('replay-boundary')).toContainText('payload.recorded-observation-replay 1.0.0');
  await expect(page.getByTestId('replay-flags')).toContainText('accuracyEstablished false');
  await expect(page.getByTestId('observation-register').locator('tr[data-observation]')).toHaveCount(10);
  await expect(page.getByTestId('frame-diagram').locator('[data-node]')).toHaveCount(13);
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-timeline', 'test-timeline');
  await expect(page.getByTestId('timeline').locator('[data-mismatch="session-b-RADAR-observation"]')).toContainText('pose +10 ms');
  await expect(page.getByTestId('timeline-unaligned')).toContainText('session-b-drift-LIDAR-observation');

  // Register → inspector: a placed estimate with its chain valid at its time and its residual-only comparisons.
  await page.getByTestId('observation-register').locator('[data-observation="session-a-LIDAR-observation"]').getByRole('button').click();
  await expect(surface).toHaveAttribute('data-selected', 'session-a-LIDAR-observation');
  const inspector = page.getByTestId('replay-inspector');
  await expect(inspector.getByTestId('inspector-placement')).toHaveAttribute('data-state', 'PLACED_ESTIMATE');
  await expect(inspector.getByTestId('inspector-placement')).toContainText('(16.000, 0.000, 0.000) m');
  await expect(inspector.getByTestId('inspector-chain').locator('[data-step="CALIBRATION"]')).toHaveAttribute('data-state', 'VALID');
  await expect(inspector.getByTestId('inspector-evidence')).toContainText('synthetic-preview-input-v1');
  await expect(inspector.getByTestId('inspector-comparisons')).toContainText('RESIDUAL_ONLY');
  await expect(page.getByTestId('frame-diagram').locator('[data-node="session-a-LIDAR-frame"]')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('frame-diagram').locator('[data-edge="session-a-LIDAR-calibration"]')).toHaveAttribute('data-state', 'VALID');
  await expect(page.getByTestId('timeline').locator('[data-tick="session-a-LIDAR-observation"]')).toHaveAttribute('data-selected', 'true');

  // Diagram → inspector: the radar's chain fails on an expired calibration and a late pose, each explained.
  await page.getByTestId('frame-diagram').getByRole('button', { name: 'Select the observation of session-b-RADAR' }).click();
  await expect(surface).toHaveAttribute('data-selected', 'session-b-RADAR-observation');
  await expect(inspector.getByTestId('inspector-placement')).toHaveAttribute('data-state', 'UNPLACED');
  await expect(inspector.getByTestId('inspector-placement')).toContainText('POSE_TIME_MISMATCH');
  await expect(inspector.getByTestId('inspector-chain').locator('[data-step="POSE"]')).toHaveAttribute('data-state', 'INVALID');
  await expect(inspector.getByTestId('inspector-chain')).toContainText('10 ms (10000000 ns) from the observation');
  await expect(page.getByTestId('frame-diagram').locator('[data-edge="session-b-RADAR-calibration"]')).toHaveAttribute('data-state', 'INVALID');

  // Timeline → inspector; unaligned list → inspector; comparison → the other side.
  await page.getByTestId('timeline').getByRole('button', { name: 'Select session-b-CAMERA-observation' }).click();
  await expect(inspector.getByTestId('inspector-placement')).toContainText('(16.050, 0.000, 0.000) m');
  await page.getByTestId('timeline-unaligned').getByRole('button', { name: 'session-b-drift-LIDAR-observation' }).click();
  await expect(inspector).toContainText('no declared mapping to a common timeline');
  await expect(inspector.getByTestId('inspector-placement')).toContainText('CLOCK_ALIGNMENT_UNAVAILABLE');
  await page.getByTestId('comparison-register').locator('[data-comparison="session-a-CAMERA-observation:session-b-CAMERA-observation"]').getByRole('button', { name: 'session-a-CAMERA-observation' }).click();
  await expect(surface).toHaveAttribute('data-selected', 'session-a-CAMERA-observation');
  await expect(page.getByTestId('comparison-register').locator('[data-comparison="session-a-CAMERA-observation:session-b-CAMERA-observation"]')).toContainText('0.050');

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
