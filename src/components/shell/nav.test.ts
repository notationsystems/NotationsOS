import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_AREAS, locate } from './nav';

/** Every page route in the app, discovered from the filesystem rather than listed by hand. */
function pageRoutes(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageRoutes(full, `${base}/${entry}`));
    else if (entry === 'page.tsx' && base) out.push(base);
  }
  return out.sort();
}

/** A dynamic segment stands in for a real identifier the fixtures carry. */
const SAMPLE: Record<string, string> = {
  '[caseId]': 'CASE-CAR-7C104',
  '[rulingId]': 'RUL-5B221-r1',
  '[releaseId]': 'REL-CAR-2026.09.01',
  '[profileId]': 'caravan.brokerage.specialty-cargo',
};
const concrete = (route: string) => route.replace(/\[[^\]]+\]/g, (seg) => SAMPLE[seg] ?? 'x');

describe('the navigation can name every page', () => {
  const routes = pageRoutes(join(process.cwd(), 'src/app'));

  it('finds the app’s page routes', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain('/product');
    expect(routes).toContain('/compute/registration');
  });

  /**
   * The top bar says "area · page" from locate(). A route no pattern matches
   * leaves the bar unable to say where the reader is, which is how /product and
   * the two compute pages went unnamed.
   */
  it('locates every page route in an area', () => {
    const unreachable = routes.filter((route) => locate(concrete(route)) === null);
    expect(unreachable).toEqual([]);
  });

  it('gives each route the area whose activity it belongs to', () => {
    expect(locate('/product')?.area.id).toBe('corpus');
    expect(locate('/products')?.area.id).toBe('corpus');
    expect(locate('/production')?.area.id).toBe('corpus');
    expect(locate('/compute/registration')?.area.id).toBe('inquiry');
    expect(locate('/compute/clearance')?.area.id).toBe('inquiry');
    expect(locate('/compute/observations')?.area.id).toBe('inquiry');
  });

  /** /product, /production and /products are three different pages with one prefix. */
  it('keeps the three product-prefixed routes apart', () => {
    expect(locate('/product')?.item.label).toBe('Operating model');
    expect(locate('/production')?.item.label).toBe('Production');
    expect(locate('/products')?.item.label).toBe('Products');
  });

  it('declares every nav item with a unique href and a matching pattern', () => {
    const items = NAV_AREAS.flatMap((a) => a.items);
    expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    for (const item of items) {
      const path = item.href.split('#')[0];
      expect(item.match.test(path), `${item.href} does not match its own pattern`).toBe(true);
    }
  });
});
