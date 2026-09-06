import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { runFixture } from '../../src/spatial/fixture';

test.skip(process.env.PRODUCTION_E2E !== '1', 'Use the isolated production acceptance runner.');

// The isolated evidence root the runner started the server with receives the retained demonstration; the page then inspects it over HTTP, never recomputing.
test.beforeAll(() => { runFixture(process.env.PAYLOAD_PRODUCTION_DIR!); });

test('spatial inquiry: plan, graph and table share one selection, the scenario is the service\'s comparison, and no request leaves the origin', async ({ page, baseURL }, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/spatial');
  await expect(page.getByRole('heading', { level: 1, name: 'Spatial Inquiry' })).toBeVisible();
  const root = page.getByTestId('spatial-inquiry');
  await expect(root).toHaveAttribute('data-status', 'READY', { timeout: 30_000 });
  await expect(page.locator('[data-plan-space]')).toHaveCount(5);
  await expect(page.locator('[data-graph-node]')).toHaveCount(5);
  await expect(page.locator('[data-graph-edge]')).toHaveCount(4);
  await expect(page.locator('[data-plan-passage="P-09"]')).toHaveAttribute('data-state', 'UNKNOWN');
  await expect(page.getByTestId('spatial-mean-confirmed')).toHaveText('2 over 3 reachable non-root spaces');
  await expect(page.getByTestId('spatial-unresolved')).toHaveText('P-09');
  await expect(page.locator('[data-space-row="S-5"]')).toContainText('unknown');
  await expect(page.getByTestId('spatial-changes')).toHaveAttribute('data-count', '3', { timeout: 15_000 });

  // One selection: the plan sets it, the graph and the table show it, the inspector explains it, the link carries it.
  await page.locator('[data-plan-space="S-3"]').click();
  await expect(page.locator('[data-space-row="S-3"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-graph-node="S-3"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('spatial-inspector').getByRole('heading', { level: 2 })).toHaveText('Studio');
  await expect(page.locator('[data-passage="P-07"]')).toContainText('Hall ↔ Studio');
  expect(new URL(page.url()).hash).toBe('#space=S-3');
  await page.locator('[data-graph-node="S-4"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('spatial-inspector').getByRole('heading', { level: 2 })).toHaveText('Office');
  await page.screenshot({ path: testInfo.outputPath('spatial-baseline.png') });

  // The scenario: closing P-07 disconnects Studio and Office and removes Store's possible access; P-09 stays unresolved; the mean's denominator shrinks with it.
  await page.getByTestId('spatial-view-scenario').click();
  await expect(root).toHaveAttribute('data-view', 'scenario');
  await expect(page.locator('[data-space-row="S-3"]')).toContainText('unreachable');
  await expect(page.locator('[data-space-row="S-3"]')).toHaveAttribute('data-status', 'DISCONNECTED');
  await expect(page.locator('[data-plan-passage="P-07"]')).toHaveAttribute('data-state', 'CLOSED');
  await expect(page.getByTestId('spatial-mean-confirmed')).toHaveText('1 over 1 reachable non-root space');
  await expect(page.getByTestId('spatial-scenario-provenance')).toContainText('P-07 assumed CLOSED');
  await expect(page.getByTestId('spatial-changes').locator('[data-changed-space]')).toHaveCount(3);
  await page.locator('[data-space-row="S-2"] button').click();
  await expect(page.locator('[data-passage="P-07"]')).toContainText('declared OPEN');
  await expect(page.locator('[data-passage="P-07"]')).toContainText('scenario assumption');
  await page.screenshot({ path: testInfo.outputPath('spatial-scenario.png') });

  // A link pasted into this page's address bar selects; a fresh load of the link restores the selection on the baseline view.
  await page.evaluate(() => { window.location.hash = '#space=S-5'; });
  await expect(page.getByTestId('spatial-inspector').getByRole('heading', { level: 2 })).toHaveText('Store');
  await expect(page.getByTestId('spatial-selected-confirmed')).toHaveText('unreachable');
  await page.goto('/releases');
  await page.goto('/spatial#space=S-5');
  await expect(root).toHaveAttribute('data-status', 'READY', { timeout: 30_000 });
  await expect(root).toHaveAttribute('data-view', 'baseline');
  await expect(page.getByTestId('spatial-inspector').getByRole('heading', { level: 2 })).toHaveText('Store');
  await expect(page.getByTestId('spatial-selected-confirmed')).toHaveText('unknown');

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.locator('[data-plan-space]')).toHaveCount(5);
  const narrow = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(narrow.content).toBeLessThanOrEqual(narrow.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
