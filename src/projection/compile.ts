import type { Corpus, CorpusRelease } from '../domain/corpus';
import { deliverable, releaseRecords } from '../domain/corpus';
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

function rows(corpus: Corpus, release: CorpusRelease, spec: ProjectionSpec): ProjectionRecord[] {
  const knownAt = time(spec.selection.knownAt);
  const validAt = time(spec.selection.validAt);
  const releasedAt = time(release.knownAt);
  if (knownAt > releasedAt) throw new ProjectionError('KNOWLEDGE_AFTER_RELEASE', 'The selected knowledge instant is later than this release cutoff.');
  const selected: ProjectionRecord[] = [];
  const committed = new Set(releaseRecords(corpus, release).map((record) => record.recordId));
  for (const recordId of spec.selection.recordIds) {
    const matches = corpus.records.filter((item) => item.recordId === recordId);
    const record = matches[0];
    if (matches.length !== 1 || !record || !committed.has(recordId) || !deliverable(corpus, release, record) ||
        ![...(spec.viewer === 'COUNTERPARTY_SHARED' ? ['COUNTERPARTY_SHARED'] : []), 'PUBLIC_RULING'].includes(record.visibility) ||
        time(record.knownAt) > Math.min(knownAt, releasedAt) || time(record.validFrom) > validAt ||
        (record.validTo !== undefined && validAt >= time(record.validTo))) {
      // Same refusal for hidden, absent, ambiguous, too-new and out-of-validity records.
      throw new ProjectionError('SELECTION_NOT_AVAILABLE', 'The complete selection is not available at this release, viewer and time boundary.');
    }
    selected.push(projectionRecord(corpus, release, record, knownAt));
  }
  return selected;
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
  try { records = rows(corpus, release, spec); }
  catch (error) {
    if (error instanceof ProjectionError) throw error;
    throw new ProjectionError('SOURCE_INTEGRITY_FAILED', 'The selected source records could not be projected.');
  }
  // Validate referent identity in every view, not just when a graph is requested.
  const graph = graphFor(records);
  const ready = spec.view.representation === 'RECORDS' || spec.view.representation === 'GRAPH';
  const result = {
    schema: 'payload.projection.v1' as const, fixture_only: true as const, spec, engine: routeProjection(spec.view),
    authority: 'REPLACEABLE_PROJECTION' as const,
    status: ready ? 'READY' as const : 'UNAVAILABLE' as const,
    error: ready ? null : 'GEOMETRY_NOT_AVAILABLE' as const,
    records,
    graph: spec.view.representation === 'GRAPH' ? graph : null,
    provenance: { compilerId: 'payload.fixture-projection', compilerVersion: '1.0.0',
      transformIdentity: `payload.projection/${spec.view.representation}/v1`, specDigest: addressed(spec),
      sourceSelectionDigest: addressed(records) },
    nonclaims: { sourceMutated: false, canonicalAdmission: false, relationInferred: false, sourceTruthClaimed: false,
      independentlyVerified: false, rendererExecuted: false },
  };
  // No references to mutable input, fixture arrays, rights, uncertainty or view state escape.
  return structuredClone({ ...result, digest: addressed(result) });
}
