/**
 * Polyglot persistence for the corpus, as data. Six classes of information
 * with different access patterns need different stores; naming a technology
 * here is a candidate, never a selection, and never a claim that anything is
 * installed. Nothing in this list exists in this repository: every class is
 * held today by local content-addressed files under operator-selected
 * `.payload/` roots and by committed fixtures, and `package.json` carries no
 * database, index, object-store or vector-store dependency at all.
 *
 * The reason to write it down is that a store choice is where the doctrine is
 * easiest to lose. Each class therefore carries the invariant its store must
 * preserve, in the same words the seven rules use, so that adopting one later
 * is a decision made against a stated constraint rather than against a
 * benchmark alone.
 */
import type { Fabric } from './doctrine';

/** What kind of store the access pattern asks for. Closed. */
export type StoreKind = 'OBJECT_STORE' | 'LAKEHOUSE' | 'SEARCH_INDEX' | 'GRAPH' | 'VECTOR' | 'GEOSPATIAL';

export const STORE_KIND_LABEL: Record<StoreKind, string> = {
  OBJECT_STORE: 'Immutable object storage',
  LAKEHOUSE: 'Lakehouse over object storage',
  SEARCH_INDEX: 'Search index',
  GRAPH: 'Graph database',
  VECTOR: 'Vector store',
  GEOSPATIAL: 'Geospatial database',
};

/**
 * What holds this class of information here, now. `LOCAL_FILES` is the honest
 * answer everywhere today: content-addressed files an operator selects a root
 * for. `FIXTURE` means the committed demonstration stands in its place.
 */
export type StorageState = 'SERVICE' | 'LOCAL_FILES' | 'FIXTURE' | 'ABSENT';

export const STORAGE_STATE_LABEL: Record<StorageState, string> = {
  SERVICE: 'A running service holds it',
  LOCAL_FILES: 'Local content-addressed files hold it',
  FIXTURE: 'The committed demonstration stands in its place',
  ABSENT: 'Nothing holds it',
};

export interface StorageClass {
  id: 'artifacts' | 'records' | 'text' | 'entities' | 'embeddings' | 'geospatial';
  /** The information, named the way the corpus names it. */
  dataClass: string;
  kind: StoreKind;
  /** The access pattern that asks for this kind of store, not a feature list. */
  why: string;
  /** Candidate technologies. A candidate is not a choice and not an endorsement. */
  candidates: readonly string[];
  /** Which fabric owns the information. Storage follows responsibility, never the reverse. */
  fabric: Fabric['id'];
  here: { state: StorageState; what: string; where?: string };
  /** The doctrine this store must not break. Adopting it is a decision against this sentence. */
  invariant: string;
  /** What has to be true before choosing one at all. */
  before: string;
}

export const STORAGE_CLASSES: readonly StorageClass[] = [
  {
    id: 'artifacts',
    dataClass: 'Raw artifacts: source bytes, documents, media and their capture receipts',
    kind: 'OBJECT_STORE',
    why: 'Written once, never edited, addressed by content, read rarely and whole. Size grows without bound and retention is per source.',
    candidates: ['S3', 'MinIO', 'WARC for captured web material'],
    fabric: 'acquisition',
    here: { state: 'LOCAL_FILES', what: 'The local evidence rail writes immutable files under an operator-selected root, keyed by content digest, with an acquisition receipt beside each.', where: '/evidence' },
    invariant: 'Evidence is not state. Bytes stay append-only and content-addressed, a record of what a source said, never an assertion about the world.',
    before: 'A retention and recall policy per source, because an object store makes deletion a deliberate operation rather than an accident of a build.',
  },
  {
    id: 'records',
    dataClass: 'Structured records, normalized candidates and observations, with both clocks',
    kind: 'LAKEHOUSE',
    why: 'Columnar scans over versions and time ranges, with schema evolution and snapshot isolation, so that an as-of answer is a query rather than a rebuild.',
    candidates: ['Apache Iceberg or Delta Lake on object storage', 'queried through Trino, Spark or DuckDB'],
    fabric: 'corpus',
    here: { state: 'FIXTURE', what: 'Committed demonstration releases answer as-of queries in memory; the rail writes UNADMITTED candidates and builds as local files.', where: '/stream' },
    invariant: 'Canonical state is not the entire corpus, and valid time is not knowledge time. A snapshot is a version, so table time travel must never be confused with the record\'s own two clocks.',
    before: 'An admission authority. Without one there is no canonical version to store, and a lakehouse would hold candidates while implying they were admitted.',
  },
  {
    id: 'text',
    dataClass: 'Full text and facets over records, artifacts and their extracted fields',
    kind: 'SEARCH_INDEX',
    why: 'Ranked retrieval and faceted counts, which a columnar scan answers slowly and a graph answers not at all.',
    candidates: ['OpenSearch', 'Elasticsearch'],
    fabric: 'projection',
    here: { state: 'ABSENT', what: 'Search is in-memory filtering over the committed fixtures on each page; nothing is indexed.', where: '/cases' },
    invariant: 'Projection never mutates its source, and identity survives representation. An index is a derived view that must be rebuildable from the corpus and must never become the place a fact lives.',
    before: 'Rights evaluation at query time, so that an index cannot return to an audience what the source registration denies it.',
  },
  {
    id: 'entities',
    dataClass: 'Entities and the explicit relationships between them',
    kind: 'GRAPH',
    why: 'Traversal over declared edges: lineage, supersession, identity links, incidence between records and subjects.',
    candidates: ['Neo4j', 'Memgraph', 'ArangoDB'],
    fabric: 'corpus',
    here: { state: 'FIXTURE', what: 'The projection compiler emits a record-to-subject incidence graph from the edges a record already names; the notation kernel holds authored relations with their inverses.', where: '/notations' },
    invariant: 'An edge requires evidence. Visual adjacency is not a semantic edge, geographic proximity is not a causal relationship, and a store that makes edges cheap to create must not make them cheap to assert.',
    before: 'One identity authority. A graph over unresolved identities multiplies the ambiguity instead of recording it.',
  },
  {
    id: 'embeddings',
    dataClass: 'Embeddings computed over artifacts and records',
    kind: 'VECTOR',
    why: 'Approximate nearest-neighbour retrieval for candidate generation, where an exact index has no answer to give.',
    candidates: ['Qdrant', 'Milvus', 'pgvector'],
    fabric: 'compute',
    here: { state: 'ABSENT', what: 'No embedding is computed anywhere in this repository, and no model is trained or served.', where: '/product' },
    invariant: 'Computation produces derived objects, not truth. Embedding similarity is not a canonical relation: a neighbour is a candidate for a human or a validation boundary to judge, never an admitted link.',
    before: 'A declared model, version and input scope per embedding, so a vector can be traced to what produced it and recomputed. Customers apply their own inference to the corpus; this store would serve retrieval, not sell a model.',
  },
  {
    id: 'geospatial',
    dataClass: 'Geodetic positions, footprints and the frames they are declared in',
    kind: 'GEOSPATIAL',
    why: 'Spatial predicates and indexes over declared geometry, with the coordinate reference system carried by the store rather than by convention.',
    candidates: ['PostGIS on PostgreSQL'],
    fabric: 'projection',
    here: { state: 'FIXTURE', what: 'Positions are declared as corpus records and resolved by the projection compiler; the Earth Twin draws one point per declared position and shows the refusal where none exists.', where: '/earth' },
    invariant: 'A projection changes representation, not identity or authority. A coordinate is only as good as the frame and the transform that produced it, and no graph layout or model geometry becomes a geographic position without an explicit transform and evidence for that interpretation.',
    before: 'Frames and transforms as first-class corpus objects, which the recorded-observation contract already models and the corpus does not yet carry.',
  },
];

/** Nothing above is installed. Stated once, so no surface has to imply it separately. */
export const STORAGE_PRESENT_STATE = {
  summary: 'None of these stores exists here. Every class is held by local content-addressed files under operator-selected roots and by committed fixtures.',
  roots: '.payload/*, selected per command by the operator; never a deployment path',
  dependencies: 'package.json declares no database, object store, search index, graph, vector or geospatial dependency.',
} as const;

/** The order a store earns its place, from the sequencing the classes state. */
export const STORAGE_SEQUENCE: readonly string[] = [
  'Object storage first: it is the only class whose information already exists in volume and whose invariant is already enforced.',
  'The lakehouse follows admission, not the other way round: without an admission authority there is no canonical version to store.',
  'Search and geospatial are projections of an admitted corpus and are rebuildable from it; they can arrive late and be rebuilt.',
  'The graph waits on one identity authority, and the vector store on declared models with recomputable inputs.',
];
