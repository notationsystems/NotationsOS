# Storage: polyglot persistence

Six classes of information in a provenance-bearing corpus have different access
patterns, so they ask for different stores. This document records the plan as a
plan. **Nothing here is installed.** `src/domain/storage.ts` carries the same
content as data, `/product` renders it, and `src/domain/storage.test.ts` fails
if this repository ever gains a store dependency while the data still says
nothing is installed.

## What holds the corpus today

Every class is held by local content-addressed files under roots the operator
selects per command (`.payload/*`, never a deployment path) and by committed
demonstration fixtures. `package.json` declares no database, object store,
search index, graph, vector store or geospatial dependency.

## The six classes

| Information | Store kind | Candidates | Fabric | Here |
|---|---|---|---|---|
| Raw artifacts: source bytes, documents, media, capture receipts | Immutable object storage | S3, MinIO, WARC for captured web material | Acquisition | Local content-addressed files |
| Structured records, normalized candidates and observations, with both clocks | Lakehouse over object storage | Iceberg or Delta, queried through Trino, Spark or DuckDB | Corpus | Committed demonstration releases |
| Full text and facets | Search index | OpenSearch, Elasticsearch | Projection | Nothing; pages filter fixtures in memory |
| Entities and explicit relationships | Graph database | Neo4j, Memgraph, ArangoDB | Corpus | The projection compiler's incidence graph; authored notation relations |
| Embeddings | Vector store | Qdrant, Milvus, pgvector | Compute | Nothing; no embedding is computed here |
| Geodetic positions, footprints and their frames | Geospatial database | PostGIS on PostgreSQL | Projection | Positions declared as corpus records, drawn by the Earth Twin |

A candidate is not a selection. A selection would appear as a dependency and a
running service, not as prose.

## The invariant each store must not break

A store choice is where the doctrine is easiest to lose, so each class carries
the rule it is bound by:

- **Object storage** — evidence is not state. Bytes stay append-only and
  content-addressed: a record of what a source said, never an assertion about
  the world.
- **Lakehouse** — canonical state is not the entire corpus, and valid time is
  not knowledge time. A table snapshot is a version; it must never be confused
  with the record's own two clocks.
- **Search index** — projection never mutates its source, and identity survives
  representation. An index is a derived view, rebuildable from the corpus, and
  never the place a fact lives.
- **Graph** — an edge requires evidence. Visual adjacency is not a semantic
  edge and geographic proximity is not a causal relationship; a store that
  makes edges cheap to create must not make them cheap to assert.
- **Vector store** — computation produces derived objects, not truth. Embedding
  similarity is not a canonical relation: a neighbour is a candidate for a
  human or a validation boundary to judge. Customers apply their own inference
  to the corpus; this store would serve retrieval, not sell a model.
- **Geospatial** — a projection changes representation, not identity or
  authority. A coordinate is only as good as the frame and the transform that
  produced it, and no graph layout or model geometry becomes a geographic
  position without an explicit transform and evidence for that interpretation.

## Sequence

1. **Object storage first.** It is the only class whose information already
   exists in volume and whose invariant is already enforced by the evidence
   rail.
2. **The lakehouse follows admission, not the other way round.** Without an
   admission authority there is no canonical version to store, and a lakehouse
   holding candidates would imply they were admitted.
3. **Search and geospatial are projections** of an admitted corpus and are
   rebuildable from it, so they can arrive late.
4. **The graph waits on one identity authority**, and the vector store on
   declared models with recomputable inputs.

Each class also records what has to be true before choosing one at all; the
data in `src/domain/storage.ts` is the authority for that list.
