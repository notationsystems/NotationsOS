---
title: "Identity core and cross-line join"
status: "MODELLED · JOIN ABSENT"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Identity core and cross-line join

**State:** `MODELLED · JOIN ABSENT`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> Identity is line-agnostic; the verticals are not. One core solves resolution, provenance, bitemporality and linkage for every line; the identifiers beneath belong to their line. The moat is the cross-line join, and it is absent.

## What it is

- The core, with the state that is true here: bitemporality present, provenance and linkage partial with the missing half named, resolution absent.
- Three identifier families: Caravan carries USDOT and lot/sample and declares IMO/MMSI; Tradewind declares LEI and an instrument identifier; Landshark declares APN and a cadastral identifier. Each says why its identifiers cannot be the next line's.
- Three join keys with the mistake each invites: spatial cell (absent), time interval (present, because both clocks exist), resolved entity (absent).
- `identityStanding(corpus)` counts subjects, identity links and linked subjects from the corpus, asserting nothing beyond it.

## Where it lives

- `src/domain/identity.ts`, `src/domain/identity.test.ts`
- `/product` — "Identity: one core, three families, one join"
- `docs/CORRECTION_AND_IDENTITY.md`

## Boundaries

- A matching name is not a resolution, and a matching label across two lines is the cheapest way to manufacture a moat that is not there.
- A shared spatial cell is co-location at a resolution, not a relationship.
- Overlapping in valid time is coincidence in the world; overlapping in knowledge time is only coincidence in what was known.
- A join built per line is not a join: solving the core for one line makes the second and third pay the whole cost again.

## Connects to

- ← [[Corpus object model]] — subjects, identity links and both clocks
- ← [[Domain products (Caravan, Tradewind, Landshark)]] — the three families
- → [[Storage (polyglot persistence)]] — the graph store waits on one identity authority
- → [[Correction and recall machinery]] — resolution recorded as a decision is what lets a link be wrong later

## Open questions

- [ ] What exactly is in a resolution decision object, and who may issue one?
- [ ] Which link types earn their own evidence requirements first?
- [ ] At what resolution is a spatial cell useful without implying a relationship?

## Notes

_Brainstorm here._
