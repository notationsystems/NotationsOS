---
title: "Registration and access geometry"
status: "IMPLEMENTED · SYNTHETIC PREVIEW"
group: "Compute / Decision Fabric — derived objects, never truth by default"
tags:
  - architecture-map
  - fabric/compute
---

# Registration and access geometry

**State:** `IMPLEMENTED · SYNTHETIC PREVIEW`  
**Group:** Compute / Decision Fabric — derived objects, never truth by default  
**Map:** [[Payload OS Architecture]]

> A bounded 3D rigid weighted-least-squares estimator with local conditional covariance and held-out check points, plus explicit access geometry: Cartesian distance, permitted-network shortest paths and closure scenarios.

## What it is

- Fit and check evidence are separated; base, detour and unreachable distances are distinct results.
- The CLI retains evidence-bound runs; the page is a synthetic preview.

## Where it lives

- `src/compute/rigid-registration.ts`, `access-geometry.ts`, `registration-access*.ts`
- `/compute/registration`
- `docs/REGISTRATION_ACCESS.md`

## Boundaries

- No result admits a fact, supplies pose evidence to GAT, installs a calibration in replay, or places a real object on Earth.

## Connects to

- → [[Inquiry instrument pages]] — synthetic preview

## Open questions

- [ ] Should distance semantics become a named service with versions (Euclidean, geodesic, permitted-network)?

## Notes

_Brainstorm here._
