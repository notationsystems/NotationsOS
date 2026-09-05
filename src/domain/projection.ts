/**
 * The projection fabric as a contract. A projection turns a selection of
 * corpus, canonical or inquiry state into something a person or program can
 * look at; it never changes what it looks at, never invents a relation from
 * where things land on a screen, and never changes what a thing is.
 *
 * Three engines are named for three different jobs (kepler.gl for patterns
 * across many geospatial observations, CesiumJS for geodetic realization,
 * Three.js for structural or computational geometry) and a fourth, the
 * table, for listings. None of the three engines is installed here; the
 * router decides deterministically which one a spec would go to, so the
 * decision table exists and is tested before any engine does.
 */
import type { CanonicalURI } from './types';

export const COORDINATE_SEMANTICS = ['GEODETIC', 'INTRINSIC_PHYSICAL', 'FEATURE_SPACE', 'GRAPH_LAYOUT', 'MODEL_SPACE', 'NONE'] as const;
export type CoordinateSemantics = (typeof COORDINATE_SEMANTICS)[number];

export const REPRESENTATIONS = ['POINT', 'LINE', 'POLYGON', 'MESH', 'VOLUME', 'TRAJECTORY', 'GRAPH', 'FIELD', 'TABLE'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

/** What the viewer is asking of the projection; it selects the instrument together with the coordinate semantics. */
export const PROJECTION_INTENTS = ['PATTERN', 'REALIZATION', 'STRUCTURE', 'LISTING'] as const;
export type ProjectionIntent = (typeof PROJECTION_INTENTS)[number];

export const PROJECTION_ENGINES = ['kepler.gl', 'CesiumJS', 'Three.js', 'table'] as const;
export type ProjectionEngine = (typeof PROJECTION_ENGINES)[number];

export type ProjectionSource =
  | { kind: 'CORPUS_RELEASE'; releaseId: string }
  | { kind: 'CANONICAL_VERSION'; versionId: string }
  | { kind: 'INQUIRY_STATE'; inquiryId: string };

export interface ProjectionSpec {
  source: ProjectionSource;
  selection: {
    entities: readonly CanonicalURI[];
    relations?: readonly string[];
    temporalWindow?: { from: string; to: string };
  };
  coordinateSemantics: CoordinateSemantics;
  representation: Representation;
  intent: ProjectionIntent;
  /** Enough to reproduce the projection: what was projected, by which compiler, through which transform. */
  provenance: { sourceVersion: string; compilerVersion: string; transformId: string };
}

export interface ProjectionPlan {
  engine: ProjectionEngine;
  reasons: string[];
  /** The referents pass through unchanged. A projection changes representation, not identity. */
  referents: readonly CanonicalURI[];
  /** Proximity, layout and similarity on the instrument are never relations. */
  derivesRelations: false;
  /** The plan reads its source; it has no path back into it. */
  mutatesSource: false;
  provenance: ProjectionSpec['provenance'];
}

export const ENGINE_ROLE: Record<ProjectionEngine, { question: string; role: string; runtime: string }> = {
  'kepler.gl': { question: 'Where is the pattern?', role: 'Analytical cartography over many geospatial observations: density, aggregation, flows, time filters.', runtime: 'Browser, deck.gl / WebGL' },
  CesiumJS: { question: 'Where does this exist, and how does it move through geographic space and time?', role: 'Geodetic realization on a WGS84 globe: terrain, imagery, 3D Tiles, trajectories.', runtime: 'Browser, WebGL' },
  'Three.js': { question: 'How is the system constituted, in whatever space it lives in?', role: 'Structural and computational geometry: meshes, fields, graphs, state spaces, Morpho.', runtime: 'Browser, WebGL / WebGPU' },
  table: { question: 'What are the records?', role: 'A listing with every field, the workbench default.', runtime: 'HTML' },
};

/** The decision table. Pure: the same spec always routes the same way. */
export function routeProjection(spec: ProjectionSpec): ProjectionPlan {
  const reasons: string[] = [];
  let engine: ProjectionEngine;
  const geodetic = spec.coordinateSemantics === 'GEODETIC';
  const flat = spec.representation === 'POINT' || spec.representation === 'LINE' || spec.representation === 'POLYGON';
  if (spec.representation === 'TABLE' || spec.intent === 'LISTING' || spec.coordinateSemantics === 'NONE') {
    engine = 'table';
    reasons.push(spec.representation === 'TABLE' ? 'representation is TABLE' : spec.intent === 'LISTING' ? 'intent is LISTING' : 'no coordinate semantics');
  } else if (geodetic && spec.intent === 'PATTERN' && flat) {
    engine = 'kepler.gl';
    reasons.push('GEODETIC coordinates', `intent PATTERN over ${spec.representation}`);
  } else if (geodetic) {
    engine = 'CesiumJS';
    reasons.push('GEODETIC coordinates', spec.intent === 'PATTERN' ? `${spec.representation} needs the globe, not the analytic map` : `intent ${spec.intent} on the globe`);
  } else {
    engine = 'Three.js';
    reasons.push(`${spec.coordinateSemantics} coordinates are not geographic`, `intent ${spec.intent}`);
  }
  return { engine, reasons, referents: spec.selection.entities, derivesRelations: false, mutatesSource: false, provenance: spec.provenance };
}
