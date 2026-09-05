/**
 * The projection fabric's engines and routing table as data, over the
 * implemented contract in src/projection (payload.projection-spec.v1: a
 * closed spec, a source-pinned compiler, read-only endpoints). There is one
 * router, src/projection/spec.ts; this module names the instruments'
 * questions and roles and records the routing table that
 * docs/PROJECTION_FABRIC.md states, and projection.test.ts asserts the table
 * agrees with the router for every combination. Nothing here renders.
 */
import { routeProjection, type ProjectionView } from '@/projection/spec';

export type { ProjectionSpec, ProjectionView } from '@/projection/spec';
export { routeProjection };

export const PROJECTION_MODES = ['EVIDENCE', 'MAP', 'GLOBE', 'STRUCTURE'] as const satisfies readonly ProjectionView['mode'][];
export const COORDINATE_SEMANTICS = ['NONE', 'GEODETIC', 'GRAPH_LAYOUT', 'INTRINSIC_PHYSICAL', 'FEATURE_SPACE', 'ARBITRARY_MODEL_SPACE'] as const satisfies readonly ProjectionView['coordinateSemantics'][];
export const REPRESENTATIONS = ['RECORDS', 'POINT', 'DENSITY', 'GLOBAL_3D', 'GRAPH', 'MESH', 'FIELD'] as const satisfies readonly ProjectionView['representation'][];

export const PROJECTION_ENGINES = ['kepler.gl', 'CesiumJS', 'Three.js', 'records'] as const;
export type ProjectionEngine = (typeof PROJECTION_ENGINES)[number];

export const ENGINE_ROLE: Record<ProjectionEngine, { question: string; role: string; runtime: string }> = {
  'kepler.gl': { question: 'Where is the pattern?', role: 'Analytical cartography over many geospatial observations: density, aggregation, flows, time filters.', runtime: 'Browser, deck.gl / WebGL' },
  CesiumJS: { question: 'Where does this exist, and how does it move through geographic space and time?', role: 'Geodetic realization on a WGS84 globe: terrain, imagery, 3D Tiles, trajectories.', runtime: 'Browser, WebGL' },
  'Three.js': { question: 'How is the system constituted, in whatever space it lives in?', role: 'Structural and computational geometry: meshes, fields, graphs, state spaces, Morpho.', runtime: 'Browser, WebGL / WebGPU' },
  records: { question: 'What are the records?', role: 'Selected safe record payloads, the evidence view and the workbench default.', runtime: 'JSON, HTML' },
};

export interface ProjectionRoute extends ProjectionView {
  engine: ProjectionEngine;
  /** What the fixture compiler returns today for this route. */
  currentResult: 'READY' | 'UNAVAILABLE';
  note: string;
}

/** The routing table of docs/PROJECTION_FABRIC.md. Every other combination is rejected by the router. */
export const PROJECTION_ROUTING: readonly ProjectionRoute[] = [
  { mode: 'EVIDENCE', coordinateSemantics: 'NONE', representation: 'RECORDS', engine: 'records', currentResult: 'READY', note: 'Selected safe record payloads with status at the knowledge instant.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'GRAPH', engine: 'Three.js', currentResult: 'READY', note: 'Records plus a record-to-subject incidence graph; no layout, no inferred edge.' },
  { mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'POINT', engine: 'kepler.gl', currentResult: 'UNAVAILABLE', note: 'No fixture geometry; nothing is invented.' },
  { mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'DENSITY', engine: 'kepler.gl', currentResult: 'UNAVAILABLE', note: 'No fixture geometry; nothing is invented.' },
  { mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D', engine: 'CesiumJS', currentResult: 'UNAVAILABLE', note: 'No fixture geometry; nothing is invented.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'MESH', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'No fixture geometry.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'FIELD', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'No fixture geometry.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'FEATURE_SPACE', representation: 'MESH', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'No fixture geometry.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'FEATURE_SPACE', representation: 'FIELD', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'No fixture geometry.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'ARBITRARY_MODEL_SPACE', representation: 'MESH', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'No fixture geometry.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'ARBITRARY_MODEL_SPACE', representation: 'FIELD', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'No fixture geometry.' },
];

/** What every compiled projection states it did not do. */
export const PROJECTION_NONCLAIMS = ['sourceMutated', 'canonicalAdmission', 'relationInferred', 'sourceTruthClaimed', 'independentlyVerified', 'rendererExecuted'] as const;

export function routeFor(view: ProjectionView): ProjectionRoute | undefined {
  return PROJECTION_ROUTING.find((r) => r.mode === view.mode && r.coordinateSemantics === view.coordinateSemantics && r.representation === view.representation);
}
