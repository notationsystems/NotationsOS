import { parseISOInstant, requireIdentifier, requireRecord, requireText } from '../data-os/validation';

export type ProjectionErrorCode = 'INVALID_PROJECTION_SPEC' | 'SOURCE_NOT_AVAILABLE' | 'SOURCE_VERSION_MISMATCH' |
  'SOURCE_INTEGRITY_FAILED' | 'KNOWLEDGE_AFTER_RELEASE' | 'SELECTION_NOT_AVAILABLE';

export class ProjectionError extends Error {
  constructor(readonly code: ProjectionErrorCode, message: string) { super(message); this.name = 'ProjectionError'; }
}

export interface ProjectionView {
  mode: 'EVIDENCE' | 'MAP' | 'GLOBE' | 'STRUCTURE';
  coordinateSemantics: 'NONE' | 'GEODETIC' | 'GRAPH_LAYOUT' | 'INTRINSIC_PHYSICAL' | 'FEATURE_SPACE' | 'ARBITRARY_MODEL_SPACE';
  representation: 'RECORDS' | 'POINT' | 'DENSITY' | 'GLOBAL_3D' | 'GRAPH' | 'MESH' | 'FIELD';
}

export interface ProjectionSpec {
  schema: 'payload.projection-spec.v1';
  source: { kind: 'CORPUS_RELEASE'; corpusId: string; releaseId: string; releaseDigest: string; manifestCommitment: string; snapshotDigest: string };
  selection: { recordIds: string[]; knownAt: string; validAt: string };
  view: ProjectionView;
  viewer: 'COUNTERPARTY_SHARED' | 'PUBLIC_RULING';
}

function fields(value: unknown, names: readonly string[]): asserts value is Record<string, unknown> {
  requireRecord(value, 'projection');
  if (names.some((name) => !Object.hasOwn(value, name)) || Object.keys(value).some((name) => !names.includes(name))) throw new Error('Unexpected projection fields.');
}

function id(value: unknown) { requireText(value, 'identifier', 180); return requireIdentifier(value, 'identifier'); }
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Expected the existing release 64-hex digest.');
  return value;
}

/** Routing declares the instrument; it neither executes a renderer nor asserts geometry exists. */
export function routeProjection(view: ProjectionView): 'records' | 'kepler.gl' | 'CesiumJS' | 'Three.js' {
  if (view.mode === 'EVIDENCE' && view.coordinateSemantics === 'NONE' && view.representation === 'RECORDS') return 'records';
  if (view.mode === 'MAP' && view.coordinateSemantics === 'GEODETIC' && ['POINT', 'DENSITY'].includes(view.representation)) return 'kepler.gl';
  if (view.mode === 'GLOBE' && view.coordinateSemantics === 'GEODETIC' && view.representation === 'GLOBAL_3D') return 'CesiumJS';
  if (view.mode === 'STRUCTURE' && ((view.coordinateSemantics === 'GRAPH_LAYOUT' && view.representation === 'GRAPH') ||
      (['INTRINSIC_PHYSICAL', 'FEATURE_SPACE', 'ARBITRARY_MODEL_SPACE'].includes(view.coordinateSemantics) && ['MESH', 'FIELD'].includes(view.representation)))) return 'Three.js';
  throw new ProjectionError('INVALID_PROJECTION_SPEC', 'The mode, coordinate semantics and representation are incompatible.');
}

/** Closed v1 contract: no latest aliases, paths, commands, source overrides, or authority flags. */
export function parseProjectionSpec(input: unknown): ProjectionSpec {
  try {
    fields(input, ['schema', 'source', 'selection', 'view', 'viewer']);
    if (input.schema !== 'payload.projection-spec.v1' || !['COUNTERPARTY_SHARED', 'PUBLIC_RULING'].includes(input.viewer as string)) throw new Error('Invalid schema or viewer.');
    const source = input.source;
    fields(source, ['kind', 'corpusId', 'releaseId', 'releaseDigest', 'manifestCommitment', 'snapshotDigest']);
    if (source.kind !== 'CORPUS_RELEASE') throw new Error('Only explicit fixture corpus releases are supported.');
    if (typeof source.snapshotDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(source.snapshotDigest)) throw new Error('Expected a full projection source snapshot digest.');
    const selection = input.selection;
    fields(selection, ['recordIds', 'knownAt', 'validAt']);
    if (!Array.isArray(selection.recordIds) || selection.recordIds.length < 1 || selection.recordIds.length > 128) throw new Error('Select 1 to 128 records.');
    // Array.from visits holes too; Array.map would silently skip them.
    const recordIds = Array.from(selection.recordIds, id).sort();
    if (new Set(recordIds).size !== recordIds.length) throw new Error('Repeated record selection.');
    fields(input.view, ['mode', 'coordinateSemantics', 'representation']);
    const view = { ...input.view } as unknown as ProjectionView;
    routeProjection(view);
    return {
      schema: 'payload.projection-spec.v1',
      source: { kind: 'CORPUS_RELEASE', corpusId: id(source.corpusId), releaseId: id(source.releaseId),
        releaseDigest: hash(source.releaseDigest), manifestCommitment: hash(source.manifestCommitment), snapshotDigest: source.snapshotDigest },
      selection: { recordIds, knownAt: new Date(parseISOInstant(selection.knownAt, 'knownAt')).toISOString(),
        validAt: new Date(parseISOInstant(selection.validAt, 'validAt')).toISOString() },
      view, viewer: input.viewer as ProjectionSpec['viewer'],
    };
  } catch {
    throw new ProjectionError('INVALID_PROJECTION_SPEC', 'Use a bounded, exact release reference, record selection, valid/knowledge instants and compatible projection view.');
  }
}
