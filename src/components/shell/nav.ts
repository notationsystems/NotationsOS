/**
 * The primary navigation as data: five activity areas over the existing
 * routes. Product names and routes are unchanged; only the grouping follows
 * what a person is doing. Acquisitions live on the rail page, so the
 * Acquisition area opens that page at its acquisitions section.
 */
export interface NavItem { href: string; label: string; match: RegExp }
export interface NavArea { id: 'acquisition' | 'corpus' | 'notations' | 'inquiry' | 'coordination'; label: string; activity: string; items: readonly NavItem[] }

export const NAV_AREAS: readonly NavArea[] = [
  { id: 'acquisition', label: 'Acquisition', activity: 'Coverage, sources, collection attempts and failures', items: [
    { href: '/candidates#cp-acquisitions', label: 'Acquisitions', match: /^\/candidates/ },
    { href: '/evidence', label: 'Evidence', match: /^\/evidence/ },
  ] },
  { id: 'corpus', label: 'Corpus', activity: 'Candidates, builds, releases and changes', items: [
    { href: '/production', label: 'Production', match: /^\/production/ },
    { href: '/candidates', label: 'Candidates', match: /^\/candidates/ },
    { href: '/products', label: 'Products', match: /^\/products/ },
    { href: '/releases', label: 'Releases', match: /^\/releases/ },
    { href: '/stream', label: 'Stream', match: /^\/stream/ },
    { href: '/retractions', label: 'Retractions', match: /^\/retractions/ },
    { href: '/api', label: 'API', match: /^\/api/ },
  ] },
  { id: 'notations', label: 'Notations', activity: 'Author, relate and preserve interpretations', items: [
    { href: '/notations', label: 'Notations', match: /^\/notations/ },
  ] },
  { id: 'inquiry', label: 'Inquiry', activity: 'Explore evidence, compare observations, investigate questions', items: [
    { href: '/cases', label: 'Cases', match: /^\/cases/ },
    { href: '/rulings', label: 'Rulings', match: /^\/rulings/ },
    { href: '/replay', label: 'Replay', match: /^\/replay/ },
    { href: '/profiles', label: 'Profiles', match: /^\/profiles/ },
    { href: '/earth', label: 'Earth Twin', match: /^\/earth/ },
    { href: '/spatial', label: 'Spatial Inquiry', match: /^\/spatial/ },
  ] },
  { id: 'coordination', label: 'Coordination', activity: 'Participants, requests, results and blockers', items: [
    { href: '/agents', label: 'Stable', match: /^\/agents/ },
    { href: '/board', label: 'Board', match: /^\/board/ },
  ] },
];

export const PRIMARY_NAV = NAV_AREAS.flatMap((a) => a.items);

/** The area and item a path belongs to, for the top bar's context line. */
export function locate(pathname: string): { area: NavArea; item: NavItem } | null {
  for (const area of NAV_AREAS) for (const item of area.items) if (item.match.test(pathname) && !item.href.includes('#')) return { area, item };
  for (const area of NAV_AREAS) for (const item of area.items) if (item.match.test(pathname)) return { area, item };
  return null;
}
