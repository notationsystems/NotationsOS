import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('clearance inspector exposes precomputed outcomes, joint evidence and honest validation without writes', async ({ page, isMobile }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:3111/')) externalRequests.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  const response = await page.goto('/compute/clearance');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Clearance measurement design' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByTestId('clearance-boundary')).toContainText('IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED');
  await expect(page.getByTestId('clearance-boundary')).toContainText('no measurement or physical action is executed');
  const current = page.getByTestId('clearance-current-summary');
  const original = await current.textContent();
  const recommendation = page.getByTestId('clearance-recommendation-summary');
  await expect(recommendation).toContainText('MEASUREMENT_RECOMMENDED');
  await expect(recommendation).toContainText('Net decision value after cost4');
  await page.screenshot({ path: `.stamp/clearance-browser/${test.info().project.name}-overview.png`, fullPage: true, scale: 'css' });
  if (isMobile) {
    await page.screenshot({ path: '.stamp/clearance-browser/mobile-viewport.png', scale: 'css' });
    await page.getByRole('region', { name: 'Current belief and decision' }).screenshot({ path: '.stamp/clearance-browser/mobile-current.png', scale: 'css' });
    await page.getByRole('region', { name: 'Measurement and possible outcomes' }).screenshot({ path: '.stamp/clearance-browser/mobile-measurement.png', scale: 'css' });
    await page.getByLabel('Candidate measurement').evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: '.stamp/clearance-browser/mobile-measurement-viewport.png', scale: 'css' });
  }
  await page.getByLabel('Hypothetical outcome').selectOption('1');
  const posterior = page.getByTestId('clearance-posterior-detail');
  await expect(posterior).not.toContainText('Conditional fit probabilityUnavailable');
  await page.getByText('Hypothetical joint-state probabilities', { exact: true }).click();
  await expect(posterior).toContainText('stateId');
  const measurement = page.getByLabel('Candidate measurement');
  await measurement.selectOption({ index: 0 });
  await expect(page.getByLabel('Hypothetical outcome')).toHaveValue('0');
  const actionId = await measurement.inputValue();
  await expect(page.getByTestId('clearance-action-detail')).toContainText(actionId);
  const evidence = page.getByRole('region', { name: 'Synthetic evidence inspector' });
  await expect(evidence).toContainText('Preview descriptor digest (not a receipt)');
  await expect(evidence).toContainText('sha256:');
  await page.getByText('Inspect selected artifact contents', { exact: true }).click();
  await expect(page.getByTestId('clearance-artifact-detail')).toBeVisible();
  await page.getByText('Shared alignment and joint-state evidence', { exact: true }).click();
  await expect(page.getByTestId('clearance-joint-detail')).toContainText('alignmentOffsetM');
  await expect(page.getByTestId('clearance-joint-detail')).toContainText('leftClearanceM');
  await page.getByText('Reference scoring states and results', { exact: true }).click();
  const validation = page.getByRole('region', { name: 'Reference comparison and validation boundary' });
  await expect(validation).toContainText('UNRESOLVED_INDEPENDENCE');
  await expect(validation).toContainText('"metrics": null');
  await expect(page.getByTestId('clearance-baselines').getByRole('article')).toHaveCount(5);
  await page.getByText('Complete input manifest and computed result', { exact: true }).click();
  await expect(current).toHaveText(original!);
  await expect(page.getByRole('button', { name: /execute measurement|collect|admit|publish/i })).toHaveCount(0);
  const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(bounds.document).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(writes).toEqual([]);
});

test('clearance controls are keyboard-operable and have no serious accessibility violations', async ({ page }) => {
  await page.goto('/compute/clearance');
  // Confirm a real handler-driven state change before testing focus on the hydrated page.
  await page.getByLabel('Candidate measurement').selectOption('measure-equipment');
  await expect(page.getByTestId('clearance-action-detail')).toContainText('measure-equipment');
  const outcomes = page.getByLabel('Hypothetical outcome');
  await outcomes.scrollIntoViewIfNeeded();
  await outcomes.focus();
  await expect(outcomes).toBeFocused();
  await outcomes.press('ArrowDown');
  await outcomes.press('Enter');
  await expect(outcomes).toHaveValue('1');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});
