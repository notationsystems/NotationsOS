---
title: "Candidate builds and comparison"
status: "IMPLEMENTED · UNADMITTED"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Candidate builds and comparison

**State:** `IMPLEMENTED · UNADMITTED`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> Exact, inspectable candidate builds assembled from normalizations, each member carrying its derivation decision, source class and knowledge time; two builds can be compared by source-scoped membership and immutable references.

## What it is

- Builds are catalogued and re-openable; comparison reopens both evidence chains before reporting.
- The candidate-build review worker inspects a build on request from the board and reports a bounded observation.

## Where it lives

- `src/data-os/local-candidate-build.ts`, `local-census-candidate-build.ts`, `candidate-build-comparison.ts`
- `docs/LOCAL_CANDIDATE_BUILDS.md`, `docs/LOCAL_CANDIDATE_COMPARISON.md`

## Boundaries

- No candidate, run or build identifier ever appears in a release, feed payload or MCP result (rule 2).

## Connects to

- → [[Admission authority]] — UNADMITTED candidates → (absent boundary)
- → [[Candidates rail]] — process view
- ← [[Normalization adapters]] — BUILD_CANDIDATES
- ← [[Board (messages and acknowledgements)]] — review worker inspects one exact build

## Open questions

- [ ] What makes a candidate "ready": a schema check, a reviewer, a profile evaluation, or all three?
- [ ] Should comparison become a correction proposal object?

## Notes

_Brainstorm here._
