import type { Corpus, CorpusRecord, CorpusRelease, RecordStatus } from '../domain/corpus';
import { LOCATION_POSITION_PREDICATE, deliverable, releaseRecords } from '../domain/corpus';
import type { EvidenceClass } from '../domain/types';
import { FIXTURE_CORPORA } from '../fixtures';
import { canonicalJson } from '../fixtures/digest';
import { parseProjectionSpec, ProjectionError, routeProjection, type ProjectionSpec } from './spec';
import { projectionDigest as addressed, projectionRecord, projectionSource, resolveProjectionRelease, sourceTime as time, type ProjectionRecord } from './source';
export type { ProjectionRecord } from './source';

type GraphNode = { id: string; kind: 'RECORD'; recordId: string } | { id: string; kind: 'SUBJECT'; subjectId: string; subjectType: string };
export interface RecordSubjectGraph {
  nodes: GraphNode[];
  edges: Array<{ recordId: string; source: string; target: string; kind: 'RECORD_ABOUT_SUBJECT' }>;
}

interface Boundary { knownAt: number; validAt: number; releasedAt: number; viewer: ProjectionSpec['viewer'] }

function boundaryOf(release: CorpusRelease, spec: ProjectionSpec): Boundary {
  const knownAt = time(spec.selection.knownAt);
  const releasedAt = time(release.knownAt);
  if (knownAt > releasedAt) throw new ProjectionError('KNOWLEDGE_AFTER_RELEASE', 'The selected knowledge instant is later than this release cutoff.');
  return { knownAt, validAt: time(spec.selection.validAt), releasedAt, viewer: spec.viewer };
}

/** The one gate every projected record passes: committed, deliverable, visible to the viewer, knowable at the instant, valid at the instant. */
function admissible(corpus: Corpus, release: CorpusRelease, committed: Set<string>, record: CorpusRecord, b: Boundary): boolean {
  return committed.has(record.recordId) && deliverable(corpus, release, record) &&
    [...(b.viewer === 'COUNTERPARTY_SHARED' ? ['COUNTERPARTY_SHARED'] : []), 'PUBLIC_RULING'].includes(record.visibility) &&
    time(record.knownAt) <= Math.min(b.knownAt, b.releasedAt) && time(record.validFrom) <= b.validAt &&
    (record.validTo === undefined || b.validAt < time(record.validTo));
}

function rows(corpus: Corpus, release: CorpusRelease, spec: ProjectionSpec, b: Boundary): ProjectionRecord[] {
  const selected: ProjectionRecord[] = [];
  const committed = new Set(releaseRecords(corpus, release).map((record) => record.recordId));
  for (const recordId of spec.selection.recordIds) {
    const matches = corpus.records.filter((item) => item.recordId === recordId);
    const record = matches[0];
    if (matches.length !== 1 || !record || !admissible(corpus, release, committed, record, b)) {
      // Same refusal for hidden, absent, ambiguous, too-new and out-of-validity records.
      throw new ProjectionError('SELECTION_NOT_AVAILABLE', 'The complete selection is not available at this release, viewer and time boundary.');
    }
    selected.push(projectionRecord(corpus, release, record, b.knownAt));
  }
  return selected;
}

/** A declared position of a selected record's subject, resolved under the same gate as the record itself. */
export interface GeodeticPosition {
  /** The selected record this position was resolved for. */
  recordId: string;
  positionRecordId: string;
  canonicalId: string;
  subject: { subjectId: string; canonicalId: string; subjectType: string };
  point: { datum: 'WGS84'; longitude: number; latitude: number; horizontalUncertaintyM: number | null };
  value: string | number;
  basis: string | null;
  validity: { validFrom: string; validTo: string | null };
  knownAt: string;
  evidenceClass: EvidenceClass;
  source: { sourceId: string; sourceName: string | null };
  statusAtKnownAt: RecordStatus;
}

export interface ProjectionGeometry { datum: 'WGS84'; positions: GeodeticPosition[]; unplaced: string[] }

/**
 * Geometry is never invented: a selected record is placed only where a
 * `location.position` record for its own subject, itself committed,
 * deliverable, visible, knowable and valid at the same boundary, declares.
 * Every such position is returned with its own evidence class and source, so
 * two sources that disagree are both shown. A record without one is listed
 * as unplaced; a position the viewer may not see is simply absent.
 */
function geometryFor(corpus: Corpus, release: CorpusRelease, selected: ProjectionRecord[], b: Boundary): ProjectionGeometry {
  const committed = releaseRecords(corpus, release);
  const committedIds = new Set(committed.map((record) => record.recordId));
  const positions: GeodeticPosition[] = [];
  const unplaced: string[] = [];
  for (const row of selected) {
    const declared = committed
      .filter((record) => record.predicate === LOCATION_POSITION_PREDICATE && record.geometry?.kind === 'POINT' && record.geometry.datum === 'WGS84' &&
        record.subjectId === row.subject.subjectId && admissible(corpus, release, committedIds, record, b))
      .sort((a, c) => a.recordId < c.recordId ? -1 : a.recordId > c.recordId ? 1 : 0);
    if (!declared.length) { unplaced.push(row.recordId); continue; }
    for (const record of declared) {
      const projected = projectionRecord(corpus, release, record, b.knownAt);
      positions.push({
        recordId: row.recordId, positionRecordId: record.recordId, canonicalId: record.canonicalId,
        subject: { subjectId: record.subjectId, canonicalId: record.subjectCanonicalId, subjectType: record.subjectType },
        point: { datum: 'WGS84', longitude: record.geometry!.longitude, latitude: record.geometry!.latitude, horizontalUncertaintyM: record.geometry!.horizontalUncertaintyM ?? null },
        value: record.value, basis: record.basis ?? null, validity: { validFrom: record.validFrom, validTo: record.validTo ?? null }, knownAt: record.knownAt,
        evidenceClass: record.evidenceClass, source: { sourceId: record.provenance.sourceId, sourceName: projected.rights?.sourceName ?? release.sources.find((s) => s.sourceId === record.provenance.sourceId)?.sourceName ?? null },
        statusAtKnownAt: projected.statusAtKnownAt,
      });
    }
  }
  return { datum: 'WGS84', positions, unplaced };
}

function graphFor(records: ProjectionRecord[]): RecordSubjectGraph {
  const nodes = new Map<string, GraphNode>();
  const add = (node: GraphNode) => {
    const existing = nodes.get(node.id);
    if (existing && canonicalJson(existing) !== canonicalJson(node)) throw new ProjectionError('SOURCE_INTEGRITY_FAILED', 'The selected identities have incompatible referents.');
    nodes.set(node.id, node);
  };
  const subjectIds = new Map<string, string>();
  for (const record of records) {
    const previous = subjectIds.get(record.subject.subjectId);
    if (previous && previous !== record.subject.canonicalId) throw new ProjectionError('SOURCE_INTEGRITY_FAILED', 'The selected identities have incompatible referents.');
    subjectIds.set(record.subject.subjectId, record.subject.canonicalId);
    add({ id: record.canonicalId, kind: 'RECORD', recordId: record.recordId });
    add({ id: record.subject.canonicalId, kind: 'SUBJECT', subjectId: record.subject.subjectId, subjectType: record.subject.subjectType });
  }
  return { nodes: [...nodes.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    edges: records.map((record) => ({ recordId: record.recordId, source: record.canonicalId, target: record.subject.canonicalId, kind: 'RECORD_ABOUT_SUBJECT' })) };
}

/** Application-side fixture projection, not a scientific kernel or local-store delivery gate. */
export function compileProjection(input: unknown, corpora: readonly Corpus[] = FIXTURE_CORPORA) {
  const spec = parseProjectionSpec(input);
  const { corpus, release } = resolveProjectionRelease(spec.source.corpusId, spec.source.releaseId, corpora);
  if (release.releaseDigest !== spec.source.releaseDigest || release.certification.manifestCommitment !== spec.source.manifestCommitment) {
    throw new ProjectionError('SOURCE_VERSION_MISMATCH', 'The supplied version does not match this exact release.');
  }
  if (projectionSource(corpus, release).snapshotDigest !== spec.source.snapshotDigest) {
    throw new ProjectionError('SOURCE_VERSION_MISMATCH', 'The full source snapshot does not match the supplied version.');
  }
  let records: ProjectionRecord[];
  let geometry: ProjectionGeometry | null = null;
  try {
    const boundary = boundaryOf(release, spec);
    records = rows(corpus, release, spec, boundary);
    if (spec.view.coordinateSemantics === 'GEODETIC') geometry = geometryFor(corpus, release, records, boundary);
  } catch (error) {
    if (error instanceof ProjectionError) throw error;
    throw new ProjectionError('SOURCE_INTEGRITY_FAILED', 'The selected source records could not be projected.');
  }
  // Validate referent identity in every view, not just when a graph is requested.
  const graph = graphFor(records);
  const ready = spec.view.representation === 'RECORDS' || spec.view.representation === 'GRAPH' || Boolean(geometry && geometry.positions.length > 0);
  const result = {
    schema: 'payload.projection.v1' as const, fixture_only: true as const, spec, engine: routeProjection(spec.view),
    authority: 'REPLACEABLE_PROJECTION' as const,
    status: ready ? 'READY' as const : 'UNAVAILABLE' as const,
    error: ready ? null : 'GEOMETRY_NOT_AVAILABLE' as const,
    records,
    graph: spec.view.representation === 'GRAPH' ? graph : null,
    geometry,
    provenance: { compilerId: 'payload.fixture-projection', compilerVersion: '1.1.0',
      transformIdentity: `payload.projection/${spec.view.representation}/v1`, specDigest: addressed(spec),
      sourceSelectionDigest: addressed(records) },
    nonclaims: { sourceMutated: false, canonicalAdmission: false, relationInferred: false, positionInferred: false, sourceTruthClaimed: false,
      independentlyVerified: false, rendererExecuted: false },
  };
  // No references to mutable input, fixture arrays, rights, uncertainty or view state escape.
  return structuredClone({ ...result, digest: addressed(result) });
}
