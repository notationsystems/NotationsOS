---
title: "Candidates rail"
status: "IMPLEMENTED"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
  - fabric/corpus
---

# Candidates rail

**State:** `IMPLEMENTED`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> The candidate-production rail before admission as an observable process: collection, extraction, normalization, candidate readiness; every metric names the field it is read from and every instant its clock; where coverage stops and what would change it.

## What it is

- Hosts the acquisitions section the Acquisition area opens.

## Where it lives

- `src/components/production/CandidatePipeline.tsx`, `src/adapter/productionSource.ts`
- `src/app/candidates/page.tsx`

## Boundaries

- Shows UNADMITTED as UNADMITTED.

## Connects to

- ← [[Candidate builds and comparison]] — process view

## Open questions

- [ ] Should this fold into the production path, or stay as the process view while the path is the run view?

## Notes

_Brainstorm here._
