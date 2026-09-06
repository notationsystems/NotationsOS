---
title: "Acquisition area of the workbench"
status: "SURFACE"
group: "Acquisition Fabric — world → evidence"
tags:
  - architecture-map
  - fabric/acquisition
  - layer/app
---

# Acquisition area of the workbench

**State:** `SURFACE`  
**Group:** Acquisition Fabric — world → evidence  
**Map:** [[Payload OS Architecture]]

> The navigation area for coverage, sources, collection attempts and failures: the acquisitions section of the candidates rail and the evidence list across cases.

## What it is

- `/candidates#cp-acquisitions` shows captures with the field each metric is read from and the clock of each instant.
- `/evidence` lists every artifact with producer, classes, hash and known-by.

## Where it lives

- `src/components/shell/nav.ts` (area `acquisition`)
- `src/app/evidence/page.tsx`, `src/components/production/CandidatePipeline.tsx`

## Boundaries

- Shows attempts and failures as they are; never manufactures coverage.

## Connects to

- ← [[Evidence capture and receipts]] — artifacts listed

## Open questions

- [ ] Does this area deserve its own page (a source-by-source coverage map) once more than one source is connected?

## Notes

_Brainstorm here._
