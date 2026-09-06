---
title: "Information products"
status: "SPECIFIED · FIXTURE-COVERED"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Information products

**State:** `SPECIFIED · FIXTURE-COVERED`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> The first information product: a customer question, subjects, fields with evidence requirements and the corpus's coverage of them, freshness by release, permitted uses, correction as the same question at two knowledge times, and the delivered-record contract.

## What it is

- Specified as data and tested against the corpus (coverage is computed, not claimed).

## Where it lives

- `src/domain/informationProduct.ts`, `src/domain/deliveredRecord.ts`
- `/products`

## Boundaries

- A product specification is not a release.

## Connects to

- ← [[Corpus object model]] — coverage computed

## Open questions

- [ ] What is the second product, and does it share the delivered-record contract?
- [ ] How is coverage reported to a customer when a field is refused for rights reasons?

## Notes

_Brainstorm here._
