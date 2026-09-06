---
title: "Observation replay surface"
status: "IMPLEMENTED · SYNTHETIC PREVIEW"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
  - fabric/compute
---

# Observation replay surface

**State:** `IMPLEMENTED · SYNTHETIC PREVIEW`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> The recorded-observation contract made understandable: a linked frame diagram (sensor → calibration → body → pose → world), a timeline of clock alignments, calibration validity, stamps and pose mismatches, an observation register, and an inspector connecting a selection to its evidence, estimate, placement and comparisons.

## What it is

- Closed distinctions shown as badges: synthetic input, recorded input, supplied estimate, no estimate, placed estimate, unresolved placement, residual-only comparison.

## Where it lives

- `src/domain/observationReplay.ts`, `src/components/compute/ObservationReplay.tsx`, `src/observation/preview.ts`
- `docs/RECORDED_OBSERVATION_REPLAY.md` — The replay surface

## Boundaries

- Reads the compiler's rows; never recomputes placement in the browser.

## Connects to

- ← [[Recorded observation replay]] — rows and comparisons

## Open questions

- [ ] What changes in the surface when the manifest is recorded rather than synthetic: a provenance lane, a download of the exact bytes?

## Notes

_Brainstorm here._
