import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('candidates: the process is observable stage by stage, every metric sourced, gaps with remediation, and the candidate opens as evidence beside record', async ({ page }, testInfo) => {
  await page.goto('/candidates');
  await expect(page.getByRole('heading', { level: 1, name: 'Candidate production' })).toBeVisible();
  const stages = page.getByTestId('process-stages').getByRole('listitem');
  await expect(stages).toHaveCount(4);
  await expect(page.locator('[data-metric]:not([data-source])')).toHaveCount(0);
  await expect(page.locator('[data-metric="captures"]')).toHaveText('3');
  await expect(page.locator('[data-metric="refused before parsing"]')).toHaveText('1');
  const gaps = page.getByRole('table', { name: 'Coverage gaps' });
  await expect(gaps.locator('tbody tr')).toHaveCount(5);
  await expect(gaps.locator('[data-gap-code="INGEST_ONLY"]')).toHaveCount(1);
  const workspace = page.getByTestId('production-workspace');
  await expect(workspace).toHaveAttribute('data-inspecting', 'none');

  const trigger = page.getByRole('button', { name: 'Inspect normalization demo-caravan-carrier-normalization-001' }).first();
  await trigger.click();
  const inspector = page.getByTestId('production-inspector');
  await expect(inspector).toBeVisible();
  await expect(workspace).toHaveAttribute('data-inspecting', 'normalization');
  const mapping = inspector.getByRole('list', { name: 'Field mapping' });
  await expect(mapping.locator('[data-field="legalName"][data-field-status="PARSED"]')).toContainText('trimmed');
  await expect(mapping.locator('[data-field="operatingSite"][data-field-status="MISSING"]')).toContainText('not inferred');
  await expect(inspector.getByTestId('source-bytes')).toContainText('caravan.carrier-source.v1');
  await expect(inspector.getByTestId('source-bytes')).toContainText('digest matches the evidence record');
  await expect(inspector.getByTestId('sequence').locator('li[data-outcome="REFUSED"]')).toHaveCount(1);
  await expect(inspector.getByTestId('times')).toContainText('knowledge time');
  // The page's own counts are untouched by the inspector.
  await expect(page.locator('[data-canonical-id="null"]')).toHaveCount(1);
  await expect(page.locator('[data-cutoff="within"]')).toHaveCount(1);
  await expect(page.locator('[data-decision="DENIED"]')).toHaveCount(0);

  // Layout: beside the surface on wide screens; on narrow ones the inspector is brought into view and its heading takes focus.
  const box = await inspector.boundingBox();
  const surface = await page.getByTestId('candidate-boundary').boundingBox();
  if (testInfo.project.name === 'desktop') {
    expect(box!.x).toBeGreaterThan(surface!.x + surface!.width - 1);
  } else {
    await expect(inspector.getByRole('heading', { level: 2 })).toBeFocused();
    const top = await inspector.evaluate((element) => element.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(-1);
    expect(top).toBeLessThan(400);
  }

  await inspector.getByRole('button', { name: /Inspect refusal/ }).click();
  await expect(inspector.getByRole('heading', { level: 2 })).toHaveText('MEMBER_AFTER_CUTOFF');
  await expect(inspector.getByTestId('inspector-remediation')).toContainText('never advances a cutoff');
  await page.getByRole('button', { name: 'Inspect normalization demo-caravan-carrier-normalization-002' }).first().click();
  await expect(inspector.getByTestId('source-unavailable')).toBeVisible();
  await expect(inspector.getByTestId('record-side')).toContainText('No record. SCHEMA_MISMATCH');
  await page.getByRole('button', { name: 'Inspect acquisition demo-caravan-local-notice-001' }).first().click();
  await expect(inspector.getByTestId('inspector-gap')).toHaveAttribute('data-gap-code', 'INGEST_ONLY');

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
  await expect(workspace).toHaveAttribute('data-inspecting', 'none');
});
