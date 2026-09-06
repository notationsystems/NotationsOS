---
title: "Clearance value-of-information experiment"
status: "IMPLEMENTED · SYNTHETIC PREVIEW"
group: "Compute / Decision Fabric — derived objects, never truth by default"
tags:
  - architecture-map
  - fabric/compute
---

# Clearance value-of-information experiment

**State:** `IMPLEMENTED · SYNTHETIC PREVIEW`  
**Group:** Compute / Decision Fabric — derived objects, never truth by default  
**Map:** [[Payload OS Architecture]]

> Exact finite Bayesian decision analysis over a declared joint model: expected decision-loss reduction minus acquisition cost for a measurement, without executing any action.

## What it is

- Separates hypothetical belief changes, model-expected performance and still-unknown truth.
- Contract, store, CLI, synthetic preview and inspector.

## Where it lives

- `src/compute/clearance*.ts`
- `/compute/clearance`
- `docs/CLEARANCE_VOI.md`

## Boundaries

- Not variational free energy, not active inference; a dependency drawing is not a Markov blanket.

## Connects to

- → [[Inquiry instrument pages]] — synthetic preview

## Open questions

- [ ] Which real measurement decision (a survey, a sensor placement) would this design first?

## Notes

_Brainstorm here._
