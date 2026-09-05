import { expect, test } from '@playwright/test';

// The page body never scrolls horizontally: wide tables scroll inside their
// own region, and nothing positioned inside a scroll region escapes it. On
// mobile Chrome an escaped box widens the layout viewport and every pointer
// coordinate after it lands on the wrong element.
const PAGES = ['/', '/cases', '/cases/new', '/cases/CASE-7C104', '/cases/CASE-5B221', '/evidence', '/profiles', '/rulings', '/rulings/RUL-5B221', '/replay', '/replay/CASE-7C104', '/releases', '/releases/REL-CAR-2026.09.01', '/stream', '/retractions', '/product', '/products', '/api', '/candidates', '/notations', '/earth', '/agents', '/board'];

for (const path of PAGES) {
  test(`no horizontal document overflow on ${path}, disclosures open`, async ({ page }) => {
    await page.goto(path);
    // The root redirects to the corpus; measure the page it lands on.
    if (path === '/') await page.waitForURL((u) => u.pathname !== '/');
    await page.waitForLoadState('load');
    const measure = () => page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    const closed = await measure();
    expect(closed.scroll, `closed disclosures: scrollWidth ${closed.scroll} > clientWidth ${closed.client}`).toBeLessThanOrEqual(closed.client);
    expect(closed.inner, 'layout viewport widened with disclosures closed').toBe(closed.client);
    await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
    const open = await measure();
    expect(open.scroll, `open disclosures: scrollWidth ${open.scroll} > clientWidth ${open.client}`).toBeLessThanOrEqual(open.client);
    expect(open.inner, 'layout viewport widened with disclosures open').toBe(open.client);
  });
}
