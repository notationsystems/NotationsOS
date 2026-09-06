---
title: "Normalization adapters"
status: "TWO ADAPTERS"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Normalization adapters

**State:** `TWO ADAPTERS`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> A fixed Caravan Carrier adapter and the FMCSA Census normalization turn captured bytes into typed candidates; every derived quantity names its method and version and every run carries the adapter digest.

## What it is

- Normalization is computation (rule 4): derived objects, not truth.
- No adapter exists for most inventoried sources; the path says so where it stops.

## Where it lives

- `src/data-os/caravan-carrier-adapter.ts`, `local-normalization.ts`
- `src/acquisition/census-normalization.ts`
- `docs/LOCAL_NORMALIZATION.md`

## Boundaries

- A normalized field is not an identity resolution.

## Connects to

- → [[Candidate builds and comparison]] — BUILD_CANDIDATES
- ← [[Local production rail]] — NORMALIZE
- ← [[FMCSA Company Census connector]] — census normalization

## Open questions

- [ ] What is the adapter contract that a third source could implement without touching the rail?
- [ ] Where do units, ontology and temporal reconciliation live: in adapters or in a later corpus compile step?

## Notes

_Brainstorm here._
