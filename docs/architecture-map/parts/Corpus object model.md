---
title: "Corpus object model"
status: "THE PRODUCT · FIXTURE-BACKED"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Corpus object model

**State:** `THE PRODUCT · FIXTURE-BACKED`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> Releases with knowledge cutoffs and build records; records with stable `notation://` identity, subject, predicate, value, unit, basis, uncertainty bounds, validity bounds, two clocks, evidence class and provenance; retractions; rights schedules; governance.

## What it is

- Selectors: everything knowable by a release cutoff, a record's status as of a knowledge time, and the as-of query with typed refusals (`NO_RECORD`, `NO_IDENTITY_LINK`, …).
- Geodetic positions are declared as corpus records and resolved by the projection compiler for the Earth Twin.

## Where it lives

- `src/domain/corpus.ts`, `src/domain/selectors.ts`, `src/adapter/corpusSource.ts`
- `/releases`, `/releases/:id`, `/stream`, `/retractions`

## Boundaries

- Immutable per version; nothing is edited in place.
- Corpus admission is absent: today's records come from fixtures, not from the rail.

## Connects to

- → [[Certified release manifest and production record]] — certified release
- → [[Information products]] — coverage computed
- → [[Projection spec and compiler]] — one exact release
- → [[Corpus feed API v1]] — releases, records, as-of, retractions
- → [[Case workbench]] — evaluated against release and build
- ← [[Demonstration corpus and Carrier fixtures]] — demonstration releases
- ← [[Admission authority]] — admitted versions (target)

## Open questions

- [ ] What is the canonical schema registry: one per corpus, per domain product, or shared?
- [ ] How does a record reference its evidence exactly (artifact id + digest + locator) once authored references land?

## Notes

_Brainstorm here._
