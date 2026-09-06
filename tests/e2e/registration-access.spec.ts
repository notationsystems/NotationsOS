import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('spatial inspector separates fit/check evidence and base/detour/unreachable distances', async ({ page }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:3111/')) externalRequests.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  const response = await page.goto('/compute/registration');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Registration and access' })).toBeVisible();
  await expect(page.getByTestId('registration-boundary')).toContainText('IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED');
  await expect(page.getByTestId('alignment-summary')).toContainText('Withheld check-point discrepancy RMSE');
  const route = page.getByTestId('access-result');
  await expect(route).toContainText('EUCLIDEAN_3D — straight-line separation (m)2');
  await expect(route).toContainText('PERMITTED_NETWORK_LENGTH — declared path length (m)10');
  await expect(route).toContainText('unknown-shortcut');
  await expect(route).toContainText('locked-door');
  await page.screenshot({ path: test.info().outputPath('registration-base.png'), fullPage: true });
  await page.getByLabel('Access scenario').selectOption({ label: 'Closure: passage-closed' });
  await expect(route).toContainText('PERMITTED_NETWORK_LENGTH — declared path length (m)16');
  await expect(route).toContainText('detour-up → detour-across → detour-down');
  await page.getByLabel('Access scenario').selectOption({ label: 'Closure: room-exit-closed' });
  await expect(route).toContainText('Unavailable — UNREACHABLE');
  await expect(route).toContainText('Ordered node pathNone');
  await expect(route).toContainText('EUCLIDEAN_3D — straight-line separation (m)2');
  await page.getByLabel('Control or check point').selectOption({ label: 'Withheld check point: check-0' });
  await expect(page.getByTestId('measurement-detail')).toContainText('EXCLUDED_FROM_FIT');
  await expect(page.getByTestId('measurement-detail')).toContainText('LOCAL_APPROXIMATION_UNDER_DECLARED_INDEPENDENCE');
  await expect(page.getByTestId('artifact-detail')).toContainText('Invented 0.1 metre check-point bias');
  await expect(page.getByTestId('artifact-detail')).toContainText('sha256:');
  await page.getByRole('region', { name: 'Measurement inspector', exact: true }).screenshot({ path: test.info().outputPath('registration-check-point.png') });
  await page.getByText('Check-point prediction and residual uncertainty', { exact: true }).click();
  await expect(page.getByTestId('measurement-detail')).toContainText('predictiveResidualCovariance');
  await page.getByText('Transform and conditional local covariance', { exact: true }).click();
  await expect(page.getByTestId('registration-covariance')).toBeVisible();
  await page.getByText('Complete input manifest and method contract', { exact: true }).click();
  const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(bounds.document).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(writes).toEqual([]);
});

test('spatial inspector has no serious accessibility violations and native controls work by keyboard', async ({ page }) => {
  await page.goto('/compute/registration');
  const select = page.getByLabel('Access scenario');
  await select.focus();
  await expect(select).toBeFocused();
  await select.press('ArrowDown');
  await select.press('Enter');
  await expect(page.getByTestId('access-result')).toContainText('Selected scenariopassage-closed');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});
