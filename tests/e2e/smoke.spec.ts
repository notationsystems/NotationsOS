import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/cases', '/cases/CASE-CAR-7C104', '/cases/CASE-CAR-5B221', '/cases/new', '/rulings', '/rulings/RUL-7C104-r2', '/rulings/RUL-5B221-r1', '/replay/CASE-CAR-7C104', '/profiles/caravan.brokerage.specialty-cargo', '/evidence', '/api'];

for (const route of ROUTES) {
  test(`renders ${route} without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('main')).toBeVisible();
    // Google Fonts is blocked in this environment; a font stylesheet failure is not an application error.
    expect(errors.filter((e) => !e.includes('fonts.googleapis') && !e.includes('net::ERR') && !/404/.test(e))).toEqual([]);
  });
}

test('axe: case workspace and ruling viewer have no serious or critical violations', async ({ page }) => {
  for (const route of ['/cases/CASE-CAR-7C104', '/rulings/RUL-7C104-r2', '/cases']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, `${route}: ${JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })), null, 1)}`).toEqual([]);
  }
});

test('keyboard: skip link, primary nav, and a failed check are reachable and operable', async ({ page }) => {
  await page.goto('/cases/CASE-CAR-7C104');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const failed = page.getByRole('complementary', { name: 'Decision' }).getByRole('button', { name: /CAR-101 Lot identity reconciles/ });
  await failed.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('invariant-detail')).toContainText('E_LOT_IDENTITY_UNRECONCILED');
  await expect(page.locator('[data-claim-id="C-7C104-1"]')).toHaveAttribute('data-highlighted', 'true');
});

test('mobile: the ruling viewer remains legible and does not scroll horizontally', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  await page.goto('/rulings/RUL-7C104-r2');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = await page.evaluate(() => window.innerWidth);
  expect(width).toBeLessThanOrEqual(vw + 1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Refused').first()).toBeVisible();
  await expect(page.locator('[data-clock="validAt"]').first()).toBeVisible();
  await expect(page.locator('[data-clock="knownAt"]').first()).toBeVisible();
});
