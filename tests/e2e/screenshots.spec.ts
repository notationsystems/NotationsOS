import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

test('desktop screenshots', async ({ page }) => {
  await page.goto('/cases');
  await page.getByRole('table', { name: 'Case queue' }).waitFor();
  await page.screenshot({ path: `${OUT}/01-case-queue.png`, fullPage: true });
  await page.goto('/cases/CASE-CAR-7C104');
  await page.getByTestId('decision-rail').waitFor();
  await page.screenshot({ path: `${OUT}/02-case-workspace-refused.png`, fullPage: false });
  await page.getByRole('complementary', { name: 'Decision' }).getByRole('button', { name: /CAR-101 Lot identity reconciles/ }).click();
  await page.screenshot({ path: `${OUT}/03-refusal-remediation.png`, fullPage: false });
  await page.goto('/cases/CASE-CAR-5B221');
  await page.getByTestId('decision-rail').waitFor();
  await page.getByRole('navigation', { name: 'Case structure' }).getByRole('button', { name: /rev 1/ }).click();
  await page.screenshot({ path: `${OUT}/04-revision-comparison.png`, fullPage: false });
  await page.goto('/rulings/RUL-7C104-r2');
  await page.getByTestId('ruling-viewer').waitFor();
  await page.screenshot({ path: `${OUT}/05-ruling-viewer-desktop.png`, fullPage: true });
  await page.goto('/replay/CASE-CAR-7C104');
  await page.getByTestId('replay-view').waitFor();
  await page.getByRole('button', { name: '08-27 09:10' }).click();
  await page.screenshot({ path: `${OUT}/06-replay-historical.png`, fullPage: false });
  await page.goto('/profiles/caravan.brokerage.specialty-cargo');
  await page.getByTestId('profile-recognition').waitFor();
  await page.screenshot({ path: `${OUT}/07-profile-viewer.png`, fullPage: false });
  await page.goto('/cases/new');
  await page.getByTestId('new-case-intake').waitFor();
  await page.screenshot({ path: `${OUT}/08-new-case-intake.png`, fullPage: false });
});

test('mobile ruling viewer screenshot', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/rulings/RUL-7C104-r2');
  await page.getByTestId('ruling-viewer').waitFor();
  await page.getByRole('heading', { name: 'Supersession chain' }).waitFor();
  await page.screenshot({ path: `${OUT}/09-ruling-viewer-mobile.png`, fullPage: true });
  await page.goto('/cases');
  await page.getByRole('table', { name: 'Case queue' }).waitFor();
  await page.screenshot({ path: `${OUT}/10-case-queue-mobile.png`, fullPage: false });
  await ctx.close();
});
