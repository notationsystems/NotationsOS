import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The production path in the browser against the real local worker and a fresh, isolated evidence root:
// every receipt below is produced by the rail, not by the page.
test.skip(process.env.PRODUCTION_E2E !== '1', 'Use the isolated production acceptance runner.');

const stage = (page: Page, id: string) => page.locator(`[data-stage="${id}"]`);
const step = (page: Page, key: string) => page.getByTestId(`step-${key}`);

test('production path: registers, captures, normalizes, builds and inspects on the real rail; retries are historical; quarantine and conflict recover under new identities; the real source readback is honest', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/production');
  await expect(page.getByRole('heading', { level: 1, name: 'Production path' })).toBeVisible();
  await expect(page.getByTestId('production-path')).toHaveAttribute('data-mode', 'LOCAL');
  await expect(page.getByTestId('path-mode')).toHaveText('LOCAL RAIL');
  // The real source: the checked-in request and policy are shown; the operator's capture is not in this isolated root.
  await expect(page.getByTestId('source-readback')).toHaveAttribute('data-status', 'NOT_FOUND', { timeout: 15_000 });
  await expect(page.getByTestId('source-readback')).toContainText('SOURCE_CAPTURE_NOT_FOUND');
  await expect(page.getByTestId('source-card')).toContainText('fmcsa-census-80806-2026-09-05-qualification');
  await expect(page.getByTestId('source-card')).toContainText('No normalization adapter exists for fmcsa-company-census');
  await expect(stage(page, 'source')).toHaveAttribute('data-state', 'READY');
  await expect(stage(page, 'acquisition')).toHaveAttribute('data-state', 'WAITING');
  await expect(stage(page, 'notation')).toHaveAttribute('data-state', 'BLOCKED');
  await expect(stage(page, 'release')).toHaveAttribute('data-state', 'BLOCKED');

  // A name of this run, so identities never collide with another run in the same root.
  const name = `path-e2e-${Date.now().toString(36)}`;
  await page.getByLabel('Run name · five request identities').fill(name);
  await page.getByRole('button', { name: 'Start over with this name' }).click();
  await expect(step(page, 'corpus')).toHaveAttribute('data-request-id', `${name}-corpus`);

  await page.getByTestId('send-corpus').click();
  await expect(step(page, 'corpus')).toHaveAttribute('data-run-state', 'COMPLETED', { timeout: 30_000 });
  await expect(step(page, 'corpus').getByTestId('receipt')).toContainText('CREATED');
  await expect(step(page, 'corpus').locator('[data-run-stage="REGISTRATION"]')).toHaveAttribute('data-state', 'COMPLETED');
  await page.getByTestId('send-source').click();
  await expect(step(page, 'source')).toHaveAttribute('data-run-state', 'COMPLETED', { timeout: 30_000 });
  await expect(stage(page, 'acquisition')).toHaveAttribute('data-state', 'READY');

  await page.getByTestId('send-capture').click();
  await expect(stage(page, 'acquisition')).toHaveAttribute('data-state', 'DONE', { timeout: 30_000 });
  await expect(step(page, 'capture').locator('[data-run-stage="EXTRACTION"]')).toHaveAttribute('data-state', 'NOT_RUN');
  // The identical command again: the original receipt, no new execution.
  await page.getByRole('button', { name: 'Capture again (same identity)' }).click();
  await expect(step(page, 'capture').getByTestId('receipt')).toHaveAttribute('data-historical', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('stage-acquisition-detail')).toContainText('Historical retry');

  await page.getByTestId('send-normalize').click();
  await expect(stage(page, 'normalization')).toHaveAttribute('data-state', 'DONE', { timeout: 30_000 });
  await page.getByTestId('send-build').click();
  await expect(stage(page, 'build')).toHaveAttribute('data-state', 'DONE', { timeout: 30_000 });
  await expect(page.getByTestId('build-reference')).toContainText('"attachment": "DISABLED"');
  await expect(page.getByTestId('build-reference')).toContainText('"kind": "CANDIDATE_BUILD"');

  // Inspect the build by exact reference, then follow its member to the candidate and its acquisition.
  await step(page, 'build').getByRole('button', { name: /CANDIDATE BUILD/ }).first().click();
  await expect(page.getByTestId('inspection')).toHaveAttribute('data-kind', 'CANDIDATE_BUILD', { timeout: 30_000 });
  await expect(page.getByTestId('production-inspector')).toContainText('UNADMITTED');
  await expect(page.getByTestId('inspection-flags')).toContainText('canonicalAdmission false');
  await expect(page.getByTestId('inspection-flags')).toContainText('rawBytesIncluded false');
  await expect(page.getByTestId('build-members')).toContainText('identity UNRESOLVED · canonical id null');
  await page.getByTestId('build-members').getByRole('button', { name: 'Inspect' }).click();
  await expect(page.getByTestId('inspection')).toHaveAttribute('data-kind', 'NORMALIZATION', { timeout: 30_000 });
  await expect(page.getByTestId('candidate')).toContainText('UNRESOLVED');
  await expect(page.getByTestId('candidate')).toContainText('Demonstration Carriers Incorporated');
  await expect(page.getByTestId('candidate')).toContainText('operatingSite');
  await page.getByTestId('candidate').getByRole('button', { name: 'Inspect' }).click();
  await expect(page.getByTestId('inspection')).toHaveAttribute('data-kind', 'ACQUISITION', { timeout: 30_000 });
  await expect(page.getByTestId('inspection')).toContainText('INGEST decision');
  await expect(page.getByTestId('inspection')).toContainText('ALLOWED');
  await expect(page.getByTestId('catalog-runs').locator(`tr[data-run="${name}-build"]`)).toHaveAttribute('data-state', 'COMPLETED');

  // A changed command under a used identity is a conflict; a new identity carries on and the earlier receipt stands.
  await page.getByLabel('pasted bytes').check();
  await page.getByLabel('Source bytes to capture, as text (UTF-8)').fill('{bad');
  await page.getByRole('button', { name: 'Capture again (same identity)' }).click();
  await expect(step(page, 'capture')).toHaveAttribute('data-run-state', 'REFUSED', { timeout: 30_000 });
  await expect(step(page, 'capture').getByTestId('refusal')).toHaveAttribute('data-code', 'REQUEST_CONFLICT');
  await step(page, 'capture').getByRole('button', { name: 'Use a new request identity' }).click();
  await expect(step(page, 'capture')).toHaveAttribute('data-request-id', `${name}-capture-a2`);
  await expect(step(page, 'normalize')).toHaveAttribute('data-request-id', `${name}-normalize-a2`);
  // Malformed bytes are captured as bytes; normalization quarantines them with the rail's own remediation.
  await page.getByTestId('send-capture').click();
  await expect(stage(page, 'acquisition')).toHaveAttribute('data-state', 'DONE', { timeout: 30_000 });
  await page.getByTestId('send-normalize').click();
  await expect(stage(page, 'normalization')).toHaveAttribute('data-state', 'QUARANTINED', { timeout: 30_000 });
  await expect(step(page, 'normalize').getByTestId('failure')).toHaveAttribute('data-code', 'INVALID_SOURCE_JSON');
  await expect(step(page, 'normalize').getByTestId('failure')).toContainText('artifact retained true');
  await expect(step(page, 'normalize').getByTestId('run-recovery')).toContainText('Retry the identical request');
  await expect(page.getByTestId('send-build')).toBeDisabled();
  await step(page, 'normalize').getByRole('button', { name: 'Inspect the quarantine' }).click();
  await expect(page.getByTestId('inspection')).toHaveAttribute('data-kind', 'NORMALIZATION', { timeout: 30_000 });
  await expect(page.getByTestId('no-candidate')).toBeVisible();
  await expect(page.getByTestId('production-inspector')).toContainText('QUARANTINED');
  // The earlier build is still there, by exact reference, in the catalog.
  await expect(page.getByTestId('catalog-runs').locator(`tr[data-run="${name}-normalize-a2"]`)).toHaveAttribute('data-state', 'QUARANTINED');
  await expect(page.getByTestId('catalog-runs').locator(`tr[data-run="${name}-build"]`)).toHaveAttribute('data-state', 'COMPLETED');

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(errors).toEqual([]);
});
