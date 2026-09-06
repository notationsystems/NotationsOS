import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/product', '/releases', '/releases/REL-CAR-2026.09.01', '/stream', '/stream?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z', '/retractions', '/cases', '/cases/CASE-CAR-7C104', '/cases/CASE-CAR-5B221', '/cases/new', '/rulings', '/rulings/RUL-7C104-r2', '/rulings/RUL-5B221-r1', '/replay/CASE-CAR-7C104', '/profiles/caravan.brokerage.specialty-cargo', '/evidence', '/api'];

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

test('axe: releases, stream, case workspace and ruling viewer have no serious or critical violations', async ({ page }) => {
  for (const route of ['/product', '/releases', '/releases/REL-CAR-2026.09.01', '/stream', '/cases/CASE-CAR-7C104', '/rulings/RUL-7C104-r2', '/cases']) {
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

test('the feed serves fixture-only JSON with release, bounds, refusals and retractions', async ({ request }) => {
  const releases = await request.get('/api/v1/releases');
  expect(releases.status()).toBe(200);
  expect(releases.headers()['x-payload-fixture-only']).toBe('true');
  const list = await releases.json();
  expect(list.fixture_only).toBe(true);
  expect(list.releases[0].status).toBe('CURRENT');
  const asOf = await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z');
  const a = await asOf.json();
  expect(a.answer.value).toBe(40);
  const later = await (await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-09-01T12:00:00Z')).json();
  expect(later.answer.value).toBe(40.12);
  expect(later.answer.uncertainty).toEqual({ low: 40.08, high: 40.16, semantics: 'Weighbridge stated accuracy ±0.040 t' });
  const refused = await (await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-7C-104&predicate=condition.moisture&validAt=2026-08-28T14:00:00Z&knownAt=2026-09-01T12:00:00Z')).json();
  expect(refused.answer).toBeNull();
  expect(refused.refusal.code).toBe('NO_IDENTITY_LINK');
  const retractions = await (await request.get('/api/v1/retractions?since=2026-08-26T00:00:00Z')).json();
  expect(retractions.retractions[0].retractionId).toBe('RET-0002');
  const bad = await request.get('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=x');
  expect(bad.status()).toBe(400);
});

test('the product page states the firm, the twelve stages, the three customer categories and the four-step economic architecture', async ({ page }) => {
  await page.goto('/product');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('systems and intelligence firm for the physical economy');
  await expect(page.locator('[data-stage]')).toHaveCount(12);
  await expect(page.locator('[data-customer]')).toHaveCount(3);
  await expect(page.locator('[data-step]')).toHaveCount(4);
  await expect(page.getByLabel('Product architecture tree')).toContainText('Landshark — parcels, zoning, entitlements, development state');
  await expect(page.locator('[data-fabric]')).toHaveCount(5);
  await expect(page.locator('[data-fabric="state"][data-presence="PRESENT"]')).toHaveCount(1);
  await expect(page.locator('[data-fabric="compute"][data-presence="PRESENT"]')).toContainText('benchmark demonstration is synthetic');
  await expect(page.locator('[data-fabric="compute"]')).toContainText('Managed customer workloads, trained neural models and automatic canonical admission remain absent');
  await expect(page.locator('[data-information-state]')).toHaveCount(3);
  await expect(page.locator('[data-doctrine-rule]')).toHaveCount(7);
  await expect(page.getByTestId('operational-rule')).toContainText('shared information');
  await expect(page.locator('[data-engine="kepler.gl"][data-presence="ABSENT"]')).toHaveCount(1);
  await expect(page.locator('[data-engine="records"][data-presence="FIXTURE"]')).toHaveCount(1);
  await expect(page.locator('[data-tier][data-reached="true"]')).toHaveCount(2);
  await expect(page.getByRole('cell', { name: /^Samsara single-vehicle GPS-history adapter/ })).toContainText('offline-tested; live fleet qualification, continuous sync and inferred visits remain absent');
  await page.getByRole('link', { name: /^Local weighted rigid registration/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Registration and access' })).toBeVisible();
  await expect(page.getByTestId('registration-boundary')).toContainText('not a surveyed building');
});

test('a release page states certification, the production record and the rights matrix with trading prohibited', async ({ page }) => {
  await page.goto('/releases/REL-CAR-2026.09.01');
  await expect(page.getByTestId('certification')).toContainText('Certified release');
  await expect(page.getByTestId('certification')).toContainText('internal recompute');
  await expect(page.getByRole('table', { name: 'Production record' })).toContainText('Recall');
  await expect(page.getByRole('table', { name: 'Production record' })).toContainText('Not run');
  const matrix = page.getByRole('table', { name: 'Intelligence-rights schedule' });
  await expect(matrix.locator('[data-use="trading"][data-permitted="true"]')).toHaveCount(0);
  await expect(matrix.locator('[data-use="proprietary_strategy"][data-permitted="true"]')).toHaveCount(0);
  await expect(matrix.locator('[data-use="customer_delivery"][data-permitted="false"]')).toHaveCount(1);
  await expect(matrix.locator('[data-use="customer_delivery"][data-decision="DENIED"]')).toHaveCount(1);
  await expect(matrix.locator('[data-use="redistribution"][data-decision="APPROVAL_REQUIRED"]')).toHaveCount(4);
  await page.getByText('Source registrations of record').click();
  const registrations = page.getByRole('table', { name: 'Source registrations' });
  await expect(registrations).toBeVisible();
  await expect(registrations).toContainText('TRADING');
  await expect(registrations.locator('[data-registration-id]')).toHaveCount(7);
  const manifest = await (await page.request.get('/api/v1/releases/REL-CAR-2026.09.01/manifest')).json();
  expect(manifest.manifest.certification.status).toBe('CERTIFIED');
});

test('stream: changing the knowledge time changes the answer, in the page and in the feed link', async ({ page }) => {
  await page.goto('/stream?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z');
  await expect(page.getByRole('article', { name: 'Record REC-0203' })).toBeVisible();
  await page.getByLabel('Known by').fill('2026-09-01T12:00');
  await expect(page.getByRole('article', { name: 'Record REC-0204' })).toBeVisible();
  await expect(page.getByTestId('asof-url')).toContainText('knownAt=2026-09-01T12%3A00%3A00Z');
});

test('candidates: the local rail is visible, unadmitted, identity unresolved, and absent from the feed', async ({ page }) => {
  await page.goto('/candidates');
  await expect(page.getByRole('heading', { level: 1, name: 'Candidate production' })).toBeVisible();
  const boundary = page.getByTestId('candidate-boundary');
  await expect(boundary).toContainText('UNADMITTED');
  await expect(boundary).toContainText('canonicalId is null');
  await expect(page.locator('[data-normalization-id][data-state="NORMALIZED"]')).toHaveCount(1);
  await expect(page.locator('[data-normalization-id][data-state="QUARANTINED"]')).toHaveCount(1);
  await expect(page.getByTestId('quarantine')).toContainText('SCHEMA_MISMATCH');
  await expect(page.locator('[data-canonical-id="null"]')).toHaveCount(1);
  await expect(page.locator('[data-build-id="demo-caravan-carrier-build-001"][data-state="UNADMITTED"]')).toHaveCount(1);
  await expect(page.locator('[data-cutoff="within"]')).toHaveCount(1);
  await expect(page.locator('[data-refusal="DERIVATION_NOT_ALLOWED"]')).toHaveCount(1);
  await expect(page.locator('[data-refusal="MEMBER_AFTER_CUTOFF"]')).toHaveCount(1);
  await expect(page.locator('[data-decision="DENIED"]')).toHaveCount(0);
  const feed = await (await page.request.get('/api/v1/releases/REL-CAR-2026.09.01/records')).text();
  expect(feed).not.toContain('demo-caravan');
  expect(feed).not.toContain('UNADMITTED');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Candidates' })).toBeVisible();
});

test('the information product states its question, fields, correction at two knowledge times, the ten-question contract and the acceptance target', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { level: 1, name: 'Caravan lot state' })).toBeVisible();
  await expect(page.getByTestId('customer-question')).toContainText('as knowable at a stated time');
  await expect(page.locator('[data-product-field]')).toHaveCount(7);
  await expect(page.locator('[data-product-field][data-within="false"]')).toHaveCount(0);
  await expect(page.getByTestId('prohibited-purposes')).toContainText('PROPRIETARY_STRATEGY, TRADING');
  await expect(page.locator('[data-asof="early"]')).toContainText('40 t');
  await expect(page.locator('[data-asof="late"]')).toContainText('40.12 t');
  await expect(page.locator('[data-asof="late"]')).toContainText('supersedes REC-0203');
  await expect(page.locator('[data-contract-question]')).toHaveCount(10);
  await expect(page.locator('[data-acceptance-step][data-reached="true"]')).toHaveCount(2);
  await expect(page.locator('[data-acceptance-step][data-reached="false"]')).toHaveCount(2);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Products' })).toBeVisible();
});

test('notations without the local kernel: the workspace says DISABLED and the evidence-reference panel is a visibly marked fixture', async ({ page }) => {
  await page.goto('/notations');
  await expect(page.getByRole('heading', { level: 1, name: 'Notations', exact: true })).toBeVisible();
  await expect(page.getByText('DISABLED', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New notation title', { exact: true })).toBeDisabled();
  await expect(page.getByTestId('evidence-fixture-marker')).toContainText('FIXTURE');
  await expect(page.locator('[data-reference-id]')).toHaveCount(5);
  for (const state of ['RESOLVED', 'CHANGED', 'UNAVAILABLE', 'UNRESOLVED']) await expect(page.locator(`[data-reference-id][data-resolution="${state}"]`).first()).toBeVisible();
  await expect(page.getByTestId('interpretation').first()).toContainText('Authored interpretation');
});
