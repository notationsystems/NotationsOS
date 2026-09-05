import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('earth twin: a keyless globe served from this origin, every layer with its source and state, the corpus asked for honestly, a view that is a link, and no request leaves the origin', async ({ page, baseURL }) => {
  // Real CesiumJS on software WebGL, several camera flights and one request per record of the release: this test is slow by nature.
  test.slow();
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/earth');
  await expect(page.getByRole('heading', { level: 2, name: 'Payload OS Earth Twin' })).toBeVisible();
  const status = page.getByTestId('twin-status');
  await expect(status).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await expect(page.getByTestId('earth-renderer')).toContainText('CesiumJS on');
  await expect(page.locator('.earth-canvas canvas')).toBeVisible();

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
  const select = page.getByLabel('Record', { exact: true });
  const options = await select.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  await select.selectOption({ index: options.length - 1 });
  await expect(projection).toHaveAttribute('data-outcome', /UNAVAILABLE|REFUSED/);
  const after = await page.getByTestId('earth-valid-at').textContent();
  expect([before, after].every((t) => /UTC/.test(t ?? ''))).toBe(true);

  // Time is computed, not observed.
  await expect(page.getByTestId('earth-subsolar')).toContainText('computed by CesiumJS', { timeout: 15_000 });

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

  // A record is drawn only where its own subject's position record declares. The draft-survey record's lot has a berth position from the port custody system: choosing it lists that declaration, with its source's interest and stated uncertainty, and flies the camera there.
  await expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE');
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '0');
  await page.getByLabel('Record', { exact: true }).selectOption('REC-0203');
  await expect(projection).toHaveAttribute('data-outcome', 'READY', { timeout: 15_000 });
  await expect(projection).toContainText('1 declared position');
  const berth = projection.locator('[data-position-record="REC-0207"]');
  await expect(berth).toHaveAttribute('data-interest', 'disinterested');
  await expect(berth).toContainText('disinterested source');
  await expect(berth).toContainText('±250 m · WGS84');
  await expect(berth).toContainText('Port custody operator system');
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('earth-camera')).toContainText('51.9497°, 4.0250° · 1,000 km', { timeout: 20_000 });
  await expect.poll(async () => new URL(page.url()).hash, { timeout: 20_000 }).toMatch(/^#v=4\.0250,51\.9497,1000000,/);

  // Every record of the release, each at its own validity start: two lots declare a position, so their records are placed; samples, identity links and retracted inventory are not, nothing is inferred across the sample-of-lot link, and the records this viewer may not select stay refused by the compiler rather than drawn.
  await page.getByTestId('place-all').click();
  const summary = page.getByTestId('place-summary');
  await expect(summary).toHaveAttribute('data-placed', '9', { timeout: 60_000 });
  await expect(summary).toHaveAttribute('data-unplaced', '9');
  await expect(summary).toHaveAttribute('data-refused', '3');
  await expect(summary).toContainText('9 placed at 9 positions');
  await expect(summary).toContainText('REC-0101, REC-0102, REC-0111, REC-0112, REC-0201, REC-0202, REC-0301, REC-0411, REC-0412');
  await expect(summary).toContainText('REC-0305 SELECTION_NOT_AVAILABLE');
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '9');
  await expect(page.locator('[data-placed-record]')).toHaveCount(9);
  await expect(page.locator('[data-placed-record="REC-0306"]')).toContainText('LOT-7C-104');
  await page.locator('[data-placed-record="REC-0302"]').getByRole('button').click();
  await expect(projection).toHaveAttribute('data-outcome', 'READY', { timeout: 15_000 });
  await expect(projection.locator('[data-position-record="REC-0306"]')).toHaveAttribute('data-interest', 'self_reported');
  await expect(projection).toContainText('self-reported');
  await expect(page.getByTestId('earth-camera')).toContainText('-23.9535°, -46.3130° · 1,000 km', { timeout: 20_000 });
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '9');

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.earth-canvas').analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
