/**
 * The Payload OS Earth Twin: the CesiumJS instrument of the projection
 * fabric, a geodetic realization surface for whatever Payload OS can place
 * on the Earth. It is built on God's Eye View's globe stack and borrows its
 * discipline: every layer names its source and its state, a modeled or
 * missing thing is labelled as such, and a view is a link. It runs keyless
 * and offline: the Earth's surface comes from imagery bundled with the
 * engine, day and night are computed from the twin's clock, and nothing is
 * fetched from anywhere but this origin. Browser-safe; nothing here renders.
 */
import { ENGINE_ROLE } from './projection';
import type { ProjectionSpec } from '@/projection/spec';

/** What the twin is built from, pinned exactly. */
export const EARTH_TWIN_ORIGIN = {
  name: "God's Eye View",
  repository: 'https://github.com/notationsystems/gods-eye-view',
  commit: '6d83bb6008738db2aa067284586be04ea0c5eabb',
  committedAt: '2026-08-31T20:25:02Z',
  codeLicense: 'MIT, source code only; bundled and fetched data keep their own terms',
  dataSourcesPath: 'DATA_SOURCES.md',
  dataSourcesBlob: '68241fbef4c51796e43cc5a172b91131f5305941',
} as const;

export const EARTH_ENGINE = {
  name: 'CesiumJS',
  version: '1.124.0',
  license: 'Apache-2.0',
  role: ENGINE_ROLE.CesiumJS,
  /** Served from this origin under /cesium after `npm run earth:assets`; never from a CDN. */
  assetsPath: '/cesium/',
} as const;

/** What was taken from God's Eye View and what was deliberately not. */
export const ADOPTED = [
  'The CesiumJS globe with the widget chrome off and the credit line kept visible.',
  'Layer discipline: each layer names its source, its terms and its state; modeled, computed and missing states are labelled, never implied.',
  'A view is a link: the camera serializes into the URL hash, bounded and validated, and a bad value is rejected rather than clamped.',
  'The named list of public world signals it reads from, carried here as a registry with their terms, not as connectors.',
] as const;
export const NOT_ADOPTED = [
  'Google Photorealistic 3D Tiles and every other keyed or metered provider: the twin runs without any key.',
  'Live feeds (aircraft, vessels, satellites, earthquakes, cameras, traffic, weather, news): no source is acquired here; each would enter through the acquisition rail under a registration and a rights decision.',
  'Bundled third-party datasets under non-permissive terms (submarine cables, CC BY-NC-SA): not copied.',
  'Voice control and the realtime agent.',
] as const;

export type LayerState = 'BUNDLED' | 'COMPUTED' | 'FIXTURE' | 'UNAVAILABLE' | 'NOT_INTEGRATED';
export const LAYER_STATE_MEANING: Record<LayerState, string> = {
  BUNDLED: 'Shipped with the engine and served from this origin; nothing is fetched elsewhere.',
  COMPUTED: 'Derived by the engine from the twin’s clock; not observed, not a source.',
  FIXTURE: 'Read from the committed demonstration through the projection compiler.',
  UNAVAILABLE: 'Asked for and refused, with the reason shown; nothing is drawn in its place.',
  NOT_INTEGRATED: 'A named source with its terms, no connector, no rights decision, no acquisition.',
};

export interface TwinLayer {
  id: 'surface' | 'sun' | 'corpus' | 'signals' | 'notations';
  label: string;
  state: LayerState;
  source: string;
  terms: string;
  draws: string;
}

export const TWIN_LAYERS: readonly TwinLayer[] = [
  { id: 'surface', label: 'Earth surface', state: 'BUNDLED', source: 'Natural Earth II imagery bundled with CesiumJS 1.124.0, on the WGS84 ellipsoid with no terrain', terms: 'Natural Earth: public domain. CesiumJS: Apache-2.0.', draws: 'The globe, at the resolution the bundled tiles carry (coarse; no streets, no buildings).' },
  { id: 'sun', label: 'Day and night', state: 'COMPUTED', source: 'The sun’s position at the twin’s world-time instant, computed by CesiumJS', terms: 'Computation, not data.', draws: 'Lighting and the terminator; the sub-solar point as a view preset.' },
  { id: 'corpus', label: 'Corpus records', state: 'FIXTURE', source: 'The projection compiler over one exact release, view GLOBE / GEODETIC / GLOBAL_3D', terms: 'Rights, visibility and both times enforced by the compiler; the twin inherits its refusals.', draws: 'Nothing yet: the release declares no geodetic position for any record, the compiler invents none, and the twin draws none. The refusal is shown with the selected record.' },
  { id: 'signals', label: 'World signals', state: 'NOT_INTEGRATED', source: `The public signal sources God's Eye View reads (DATA_SOURCES.md at ${EARTH_TWIN_ORIGIN.commit.slice(0, 7)})`, terms: 'Per source, as recorded; several exclude commercial operation.', draws: 'Nothing: no connector exists and no rights decision has been requested. The registry is inspectable.' },
  { id: 'notations', label: 'Authored marks', state: 'UNAVAILABLE', source: 'The notation state kernel', terms: 'Authored local state; not evidence.', draws: 'Nothing: the kernel’s closed command set carries no geodetic position for a notation or a relation.' },
];

export type TermsClass = 'PUBLIC_DOMAIN' | 'OPEN_DATABASE' | 'ATTRIBUTION' | 'COURTESY' | 'NON_COMMERCIAL' | 'PERSONAL_NON_COMMERCIAL' | 'PROPRIETARY_OWN_KEY';
export const TERMS_CLASS_LABEL: Record<TermsClass, string> = {
  PUBLIC_DOMAIN: 'public domain',
  OPEN_DATABASE: 'ODbL, attribution and share-alike on data',
  ATTRIBUTION: 'attribution required',
  COURTESY: 'courtesy attribution, no formal licence stated',
  NON_COMMERCIAL: 'non-commercial; operational use needs an agreement',
  PERSONAL_NON_COMMERCIAL: 'personal, non-commercial use only',
  PROPRIETARY_OWN_KEY: 'proprietary; your own key and billing',
};
export type KeyRequirement = 'NONE' | 'FREE_KEY' | 'OPTIONAL_KEY' | 'METERED_KEY';

export interface SignalSource {
  id: string;
  name: string;
  supplies: string;
  termsClass: TermsClass;
  terms: string;
  attribution: string;
  key: KeyRequirement;
  integrationState: 'NOT_INTEGRATED';
}

const COMMON_BLOCKERS = [
  'No source registration exists for it in Payload OS.',
  'No rights decision has been requested for any purpose, operation or audience.',
  'No connector exists on the acquisition rail; nothing has been captured or receipted.',
] as const;

/** Why a source in the registry is not on the globe. Terms that exclude commercial operation add a fourth reason. */
export function integrationBlockers(source: SignalSource): string[] {
  const blockers: string[] = [...COMMON_BLOCKERS];
  if (source.termsClass === 'NON_COMMERCIAL' || source.termsClass === 'PERSONAL_NON_COMMERCIAL') blockers.push('Its terms exclude commercial operation without a separate agreement.');
  if (source.key === 'METERED_KEY') blockers.push('It is metered against an operator’s own key and billing; the twin runs without any key.');
  return blockers;
}

/**
 * The live sources God's Eye View reads, as its DATA_SOURCES.md records them
 * at the pinned commit. This is a registry of names and terms, not
 * connectors: none is contacted, selected or collected by Payload OS.
 */
export const GEV_SIGNAL_SOURCES: readonly SignalSource[] = [
  { id: 'google-map-tiles', name: 'Google Map Tiles API (Photorealistic 3D Tiles), Places, Geocoding', supplies: 'The photorealistic globe, scene context, nearby search', termsClass: 'PROPRIETARY_OWN_KEY', terms: 'Google Maps Platform ToS; content may not be cached, stored or rehosted', attribution: '"Google" / "Google Maps" logo, required while displayed', key: 'METERED_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'opensky', name: 'OpenSky Network', supplies: 'Worldwide live aircraft state vectors', termsClass: 'NON_COMMERCIAL', terms: 'Non-commercial research and education licence; operational REST use can require a written agreement', attribution: 'Schäfer et al., "Bringing Up OpenSky", IPSN 2014; opensky-network.org', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'adsb-lol-point', name: 'adsb.lol point API', supplies: 'Bounded live aircraft fallback around a point', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: 'adsb.lol contributors', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'adsb-lol-traces', name: 'adsb.lol', supplies: 'Military aircraft and aircraft traces', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: '"adsb.lol" (ODbL)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'aisstream', name: 'AISStream.io', supplies: 'Live vessel positions (AIS)', termsClass: 'COURTESY', terms: 'Free, beta, no formal terms; AIS is a public broadcast', attribution: '"AISStream.io" (courtesy)', key: 'FREE_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'celestrak', name: 'CelesTrak', supplies: 'Satellite orbital elements (TLE) for SGP4 propagation', termsClass: 'COURTESY', terms: 'US-government-origin data, no licence; citation requested', attribution: 'CelesTrak (celestrak.org), Dr. T.S. Kelso', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'launch-library-2', name: 'The Space Devs, Launch Library 2 v2.3', supplies: 'Recent launch, payload, stage and recovery metadata', termsClass: 'COURTESY', terms: 'May be used and shared in any form; attribution encouraged; 15 unauthenticated calls per hour', attribution: '"Launch Library 2 — The Space Devs"', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'usgs-earthquakes', name: 'USGS', supplies: 'Earthquakes', termsClass: 'PUBLIC_DOMAIN', terms: 'U.S. public domain', attribution: 'Data courtesy of the U.S. Geological Survey', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'osm-overpass-roads', name: 'OpenStreetMap (Overpass API)', supplies: 'Road geometry for traffic', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'tomtom-traffic', name: 'TomTom Traffic API (flow vector tiles)', supplies: 'Live congestion colouring', termsClass: 'PROPRIETARY_OWN_KEY', terms: 'TomTom for Developers terms; your own key and quota', attribution: 'Traffic flow data © TomTom', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'osm-overpass-installations', name: 'OpenStreetMap (Overpass API)', supplies: 'Viewport-bounded mapped installation context', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0', attribution: '© OpenStreetMap contributors (incomplete mapped context)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'osm-nominatim', name: 'OpenStreetMap (Nominatim)', supplies: 'Reverse-geocoded place labels', termsClass: 'OPEN_DATABASE', terms: 'ODbL 1.0 and the Nominatim usage policy', attribution: '© OpenStreetMap contributors', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'open-meteo', name: 'Open-Meteo', supplies: 'Current weather observations', termsClass: 'ATTRIBUTION', terms: 'CC BY 4.0 with an adjacent-link attribution requirement', attribution: 'Weather data by Open-Meteo.com', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'google-news-rss', name: 'Google News RSS', supplies: 'Locality-matched headlines', termsClass: 'PERSONAL_NON_COMMERCIAL', terms: 'Google News Terms of Service restrict use to personal, non-commercial use', attribution: 'Google News RSS and each linked publisher', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'gdelt-doc', name: 'GDELT Project DOC 2.0', supplies: 'Fallback location-matched headlines', termsClass: 'ATTRIBUTION', terms: 'Unrestricted dataset use with citation and link required; articles keep publisher terms', attribution: 'GDELT Project and each linked publisher', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'austin-open-data', name: 'City of Austin Open Data', supplies: 'CCTV camera catalog and frames', termsClass: 'ATTRIBUTION', terms: 'City of Austin Open Data Terms of Use', attribution: 'City of Austin, TX — data.austintexas.gov', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'caltrans-cctv', name: 'Caltrans (cwwp2.dot.ca.gov)', supplies: 'CCTV camera catalogs and frames, California districts', termsClass: 'COURTESY', terms: 'Public Caltrans traffic camera data', attribution: 'Caltrans — cwwp2.dot.ca.gov (courtesy)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'tfl-jamcams', name: 'TfL Open Data (JamCams)', supplies: 'CCTV camera catalog and frames, London', termsClass: 'ATTRIBUTION', terms: 'TfL Open Data terms; attribution required', attribution: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights', key: 'OPTIONAL_KEY', integrationState: 'NOT_INTEGRATED' },
  { id: 'gbfs', name: 'GBFS (Lyft / BCycle)', supplies: 'Bikeshare availability', termsClass: 'ATTRIBUTION', terms: 'Per feed, attribution only', attribution: 'The operator and its license_url', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'radio-browser', name: 'Radio Browser', supplies: 'Geolocated internet-radio station directory', termsClass: 'PUBLIC_DOMAIN', terms: 'PDDL 1.0 directory data; each broadcaster’s stream terms apply', attribution: 'Radio Browser and the selected broadcaster', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
  { id: 'reearth-terrain', name: 'Re:Earth Terrain (Mapterhorn)', supplies: 'Keyless terrain mesh and point heights', termsClass: 'ATTRIBUTION', terms: 'Terrain mesh CC BY 4.0; geoid EGM2008 (NGA, public domain)', attribution: 'Re:Earth Terrain / Mapterhorn (CC BY 4.0) / EGM2008 (NGA)', key: 'NONE', integrationState: 'NOT_INTEGRATED' },
];

/* ═══ Time ═══ */

export interface TwinClock { knownAt: string; validAt: string }
export const CLOCK_MEANING = {
  knownAt: 'Knowledge time: the release cutoff. Nothing knowable later than this appears on the twin.',
  validAt: 'World time: the instant the Earth is shown at. Day and night are computed from it; the corpus is asked for what held then.',
} as const;

/* ═══ A view is a link ═══ */

export interface TwinView { longitude: number; latitude: number; height: number; heading: number; pitch: number }
export const GLOBAL_VIEW: TwinView = { longitude: 0, latitude: 0, height: 26_000_000, heading: 0, pitch: -90 };
export const VIEW_BOUNDS = { height: { min: 1_000, max: 100_000_000 }, pitch: { min: -90, max: 0 } } as const;

const finite = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

/** `#v=lon,lat,height,heading,pitch`, fixed precision, always the same five numbers in the same order. Heading is written on [0, 360), so an engine heading a hair below a full turn is 0.0, not 360.0. */
export function formatView(view: TwinView): string {
  const heading = (((view.heading % 360) + 360) % 360).toFixed(1);
  return `v=${view.longitude.toFixed(4)},${view.latitude.toFixed(4)},${Math.round(view.height)},${heading === '360.0' ? '0.0' : heading},${view.pitch.toFixed(1)}`;
}

/** A hash that is not exactly a bounded view is rejected whole; nothing is clamped or salvaged. */
export function parseView(hash: string): TwinView | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length > 96) return null;
  const match = /^v=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+),(\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(text);
  if (!match) return null;
  const [longitude, latitude, height, heading, pitch] = match.slice(1).map(Number);
  if (!finite(longitude, -180, 180) || !finite(latitude, -90, 90) || !finite(height, VIEW_BOUNDS.height.min, VIEW_BOUNDS.height.max) || !finite(heading, 0, 360) || heading === 360 || !finite(pitch, VIEW_BOUNDS.pitch.min, VIEW_BOUNDS.pitch.max)) return null;
  return { longitude, latitude, height, heading, pitch };
}

/* ═══ The corpus, asked for honestly ═══ */

/** The GLOBE realization request for one explicit record, under the release's own commitments. */
export function globeSpec(source: ProjectionSpec['source'], recordId: string, clock: TwinClock, viewer: ProjectionSpec['viewer'] = 'COUNTERPARTY_SHARED'): ProjectionSpec {
  return {
    schema: 'payload.projection-spec.v1',
    source,
    selection: { recordIds: [recordId], knownAt: clock.knownAt, validAt: clock.validAt },
    view: { mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D' },
    viewer,
  };
}

export type ProjectionOutcome =
  | { state: 'READY'; detail: string }
  | { state: 'UNAVAILABLE'; code: string; detail: string }
  | { state: 'REFUSED'; code: string; detail: string };

const REFUSAL_MEANING: Record<string, string> = {
  SELECTION_NOT_AVAILABLE: 'The compiler would not select this record for this viewer at these instants: absent, hidden, ambiguous, not yet knowable, or outside its validity. It says which no more than that, so nothing withheld is disclosed.',
  KNOWLEDGE_AFTER_RELEASE: 'The knowledge instant is later than the release cutoff.',
  SOURCE_VERSION_MISMATCH: 'The pinned source snapshot no longer matches the committed release.',
  SOURCE_INTEGRITY_FAILED: 'The committed release failed its own integrity check.',
  SOURCE_NOT_AVAILABLE: 'No such release.',
  INVALID_PROJECTION_SPEC: 'The request did not fit the closed projection contract.',
};

/** What the compiler's answer means for the twin. `READY` for GLOBE would mean geometry exists; today it never does. */
export function projectionOutcome(status: number, body: { status?: string; error?: string | null }): ProjectionOutcome {
  if (status === 200 && body.status === 'READY') return { state: 'READY', detail: 'The compiler returned a geodetic realization for this record.' };
  if (status === 200 && body.status === 'UNAVAILABLE') return { state: 'UNAVAILABLE', code: body.error ?? 'GEOMETRY_NOT_AVAILABLE', detail: 'The record is selectable, but the release declares no geodetic position for it. The compiler invents none and the twin draws none.' };
  const code = body.error ?? 'PROJECTION_UNAVAILABLE';
  return { state: 'REFUSED', code, detail: REFUSAL_MEANING[code] ?? 'The projection service refused the request.' };
}

export const TWIN_NONCLAIMS = [
  'No source is contacted: every request the twin makes stays on this origin.',
  'No position is invented: a record without declared geometry is not drawn.',
  'No signal is live: the registry names sources and their terms; it collects nothing.',
  'The globe is not evidence: bundled imagery and a computed sun are context, not observations.',
] as const;
