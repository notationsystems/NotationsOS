import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('earth twin: a keyless globe served from this origin, every layer with its source and state, the corpus asked for honestly, a view that is a link, and no request leaves the origin', async ({ page, baseURL }, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const navigation = await page.goto('/earth');
  // Withheld metadata must never arrive in the document/RSC payload, not merely be hidden by the UI.
  expect(await navigation!.text()).not.toMatch(/REC-0305|REC-0401|REC-0402/);
  await expect(page.getByRole('heading', { level: 2, name: 'Payload OS Earth Twin' })).toBeVisible();
  const status = page.getByTestId('twin-status');
  await expect(status).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await expect(page.getByTestId('earth-renderer')).toContainText('CesiumJS on');
  await expect(page.locator('.earth-canvas canvas')).toBeVisible();
  const assetResponse = await page.request.get('/cesium/VERSION.json');
  expect(assetResponse.ok()).toBe(true);
  const assets = await assetResponse.json();
  expect(assets.schema).toBe('payload.earth-assets.v1');
  expect(assets.version).toBe('1.124.0');
  expect(assets.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(assets.files.some((file: { path: string }) => file.path === 'LICENSE.md')).toBe(true);

  // Layers say what they are; only the bundled surface and the computed sun draw anything.
  await expect(page.locator('[data-layer="surface"][data-state="BUNDLED"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="sun"][data-state="COMPUTED"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="corpus"][data-state="FIXTURE"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="signals"][data-state="NOT_INTEGRATED"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="notations"][data-state="UNAVAILABLE"]')).toHaveCount(1);
  await expect(page.locator('[data-signal][data-integration="NOT_INTEGRATED"]')).toHaveCount(21);
  await expect(page.locator('[data-signal]:not([data-integration="NOT_INTEGRATED"])')).toHaveCount(0);

  // The corpus: the compiler refuses geometry for a selectable record, and the twin draws nothing in its place.
  const projection = page.getByTestId('earth-projection');
  await expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE');
  await expect(projection).toHaveAttribute('data-code', 'GEOMETRY_NOT_AVAILABLE');
  await expect(projection).toContainText('invents none');
  const before = await page.getByTestId('earth-valid-at').textContent();
  const select = page.getByLabel('Record');
  const options = await select.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  expect(options.join('\n')).not.toMatch(/REC-0305|REC-0401|REC-0402/);
  await select.selectOption({ index: options.length - 1 });
  await expect(projection).toHaveAttribute('data-outcome', /UNAVAILABLE|REFUSED/);
  const after = await page.getByTestId('earth-valid-at').textContent();
  expect([before, after].every((t) => /UTC/.test(t ?? ''))).toBe(true);

  // Time is computed, not observed.
  await expect(page.getByTestId('earth-subsolar')).toContainText('computed by CesiumJS', { timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath('earth-twin.png') });

  // A view is a link: a flight ends with the camera in the hash; the global preset is the global hash; a link restores its view.
  const global = '#v=0.0000,0.0000,26000000,0.0,-90.0';
  await expect(page.getByTestId('earth-link')).toHaveText(global);
  const subSolarLatitude = /(-?\d+\.\d\d)°/.exec((await page.getByTestId('earth-subsolar').textContent()) ?? '')![1];
  await page.getByTestId('fly-subsolar').click();
  // A slow renderer can raise a camera stop mid-flight; the link is the view only once the camera has arrived.
  await expect(page.getByTestId('earth-camera')).toContainText(`${subSolarLatitude}`, { timeout: 20_000 });
  await expect.poll(async () => { const current = new URL(page.url()).hash; return current !== global && current === (await page.getByTestId('earth-link').textContent()); }, { timeout: 20_000 }).toBe(true);
  const hash = new URL(page.url()).hash;
  await expect(page.getByTestId('earth-camera')).toContainText('26,000 km');
  await page.getByTestId('fly-global').click();
  await expect(page.getByTestId('earth-camera')).toContainText('0.0000°, 0.0000°', { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(global.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), { timeout: 20_000 });
  // The same link in this page's address bar flies there; a fresh load of it starts there.
  await page.evaluate((next) => { window.location.hash = next; }, hash);
  await expect(page.getByTestId('earth-link')).toHaveText(hash, { timeout: 20_000 });
  await page.goto('/releases');
  await page.goto(`/earth${hash}`);
  await expect(status).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await expect(page.getByTestId('earth-link')).toHaveText(hash);
  await page.goto('/releases');
  await page.goto('/earth#v=999,0,1,0,0');
  await expect(status).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await expect(page.getByTestId('earth-link')).toHaveText(global);

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.earth-canvas').analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
