---
title: "Storage (polyglot persistence)"
status: "DECLARED · NOTHING INSTALLED"
group: "Runtimes, local stores and verification"
tags:
  - architecture-map
  - layer/runtime
---

# Storage (polyglot persistence)

**State:** `DECLARED · NOTHING INSTALLED`  
**Group:** Runtimes, local stores and verification  
**Map:** [[Payload OS Architecture]]

> Six classes of information ask for six kinds of store: object storage for raw artifacts, a lakehouse for records, a search index for text and facets, a graph for entities and relationships, a vector store for embeddings, a geospatial database for positions. The technologies named are candidates, not selections, and none is installed.

## What it is

- Recorded as data in `src/domain/storage.ts` and rendered on `/product`, in the same honest-present-state pattern as the fabrics and the projection engines.
- Every class carries the access pattern that asks for that store kind, the candidate technologies, the fabric that owns the information, what holds it here today, the doctrine invariant the store must not break, and what has to be true before choosing one.
- Today every class is held by local content-addressed files under operator-selected `.payload/` roots and by committed fixtures. The package manifest declares no store dependency of any kind.

## Where it lives

- `src/domain/storage.ts`, `src/domain/storage.test.ts`
- `/product` section "Where the corpus is stored"
- `docs/STORAGE.md`

## Boundaries

- A candidate is not a selection: a selection would appear as a dependency and a running service, not as prose.
- The lakehouse follows the admission authority, never the other way round; holding candidates in it would imply they were admitted.
- An edge requires evidence, and embedding similarity is never a canonical relation.
- A test fails if a store dependency appears while the data still says nothing is installed.

## Connects to

- ← [[Admission authority]] — the lakehouse waits on it
- ← [[Corpus object model]] — the information these stores would hold
- ← [[Evidence capture and receipts]] — object storage is the class already enforced
- → [[Earth Twin (CesiumJS)]] — geospatial positions are drawn from declared records

## Open questions

- [ ] Which class earns a real store first, and what volume makes local files stop being enough?
- [ ] Does the object store come before or after the admission authority, given it is the only class already at volume?
- [ ] Where do frames and transforms live so a coordinate is never separated from what produced it?

## Notes

_Brainstorm here._
