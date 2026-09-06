---
title: "Recorded observation replay"
status: "CONTRACT + COMPILER · SYNTHETIC MANIFEST"
group: "Compute / Decision Fabric — derived objects, never truth by default"
tags:
  - architecture-map
  - fabric/compute
---

# Recorded observation replay

**State:** `CONTRACT + COMPILER · SYNTHETIC MANIFEST`  
**Group:** Compute / Decision Fabric — derived objects, never truth by default  
**Map:** [[Payload OS Architecture]]

> A strict manifest of frames, sessions, clocks with alignments, sensors, calibrations with validity, poses with stamps, operator associations and observations with point estimates; the compiler places each observation or states exactly why it is unplaced.

## What it is

- Rows: PLACED_ESTIMATE or UNPLACED with blockers, aligned time, pose delta, world point. Comparisons: RESIDUAL_ONLY or UNRESOLVED with limitations.
- Synthetic manifest in `examples/observations`; a store and CLI retain runs.

## Where it lives

- `src/observation/` (contract, replay, rigid, store, cli, preview)
- `examples/observations/synthetic-manifest.ts`
- `docs/RECORDED_OBSERVATION_REPLAY.md`

## Boundaries

- A supplied estimate is an operator input, not an estimator output; residual-only comparison is not agreement.

## Connects to

- → [[Observation replay surface]] — rows and comparisons
- ← [[Recorded dataset candidate (Boreas)]] — target recorded manifest (NOT_IMPORTED)
- ← [[Scientific model roles]] — factor graphs first

## Open questions

- [ ] What replaces the point estimate: a factor graph over the same manifest, with the same blockers vocabulary?
- [ ] Which real manifest first: Boreas, a Samsara trace, or a self-recorded session?

## Notes

_Brainstorm here._
