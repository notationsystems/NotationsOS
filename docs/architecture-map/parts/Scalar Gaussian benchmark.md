---
title: "Scalar Gaussian benchmark"
status: "BASELINE · SYNTHETIC"
group: "Compute / Decision Fabric — derived objects, never truth by default"
tags:
  - architecture-map
  - fabric/compute
---

# Scalar Gaussian benchmark

**State:** `BASELINE · SYNTHETIC`  
**Group:** Compute / Decision Fabric — derived objects, never truth by default  
**Map:** [[Payload OS Architecture]]

> One conventional scalar linear-Gaussian estimator with an evidence-bound benchmark and held-out-reference metrics: the baseline every later model must beat on the same evidence.

## What it is

- Operator CLI retains runs under a local root.

## Where it lives

- `src/compute/scalar-gaussian.ts`, `benchmark*.ts`
- `docs/SCIENTIFIC_BASELINE.md`

## Boundaries

- Not GTSAM, not 3D fusion, not a trained model.

## Connects to

- → [[Scientific model roles]] — baseline to beat

## Open questions

- [ ] What is the first non-scalar baseline, and does it reuse the benchmark store?

## Notes

_Brainstorm here._
