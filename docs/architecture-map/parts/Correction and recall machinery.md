---
title: "Correction and recall machinery"
status: "MODELLED · LEDGER SPECIFIED AND EMPTY"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Correction and recall machinery

**State:** `MODELLED · LEDGER SPECIFIED AND EMPTY`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> For one retraction, which derived artifacts does a corrected fact taint? Seven classes are decided by whether their producer retained the reference that would answer. A class that cannot be decided returns undetermined with the reason, never clean.

## What it is

- `correctionImpact(corpus, retraction)` computes the blast radius over what the corpus records: affected records with their status at the issuing instant, replacements, and a verdict per derived class.
- Rulings and projections are decided today. Compute runs retain their dependencies but reference evidence artifacts while retractions name corpus records, so the vocabularies cannot yet meet. Delivered records, candidate builds and notations are undecidable because no producer retains the reference.
- The delivery ledger answers "which supersessions shipped to which customers, when". Its contract is specified and it is empty: no customer exists, and inventing one would be a fabricated record.
- The as-of contract is stated on both sides: what the corpus does, and what it cannot do yet.

## Where it lives

- `src/domain/correction.ts`, `src/domain/correction.test.ts`
- `/retractions` — a per-retraction impact table and the recall machinery section
- `docs/CORRECTION_AND_IDENTITY.md`

## Boundaries

- Undetermined is not clean. "We cannot tell" and "nothing is affected" are different answers and only one is safe to act on.
- The ledger stays empty until a real subscriber exists; populating it would invent customer scope.
- A retraction is not complete when published; it is complete when every recipient of an affected record has been told.

## Connects to

- ← [[Corpus object model]] — retractions, records and both clocks
- ← [[Admission authority]] — candidate-build ancestry waits on it
- ← [[Notation workspace]] — notation taint waits on the attach command
- → [[Ruling projections and result manifests]] — the one class already closed

## Open questions

- [ ] What is the extraction lineage object that lets a corrected record reach the compute runs that read its artifact?
- [ ] Where does admission record candidate ancestry without leaking rail identifiers into a release?
- [ ] Should a delivered-record snapshot be retained per release so product taint is a lookup rather than a recomputation?

## Notes

_Brainstorm here._
