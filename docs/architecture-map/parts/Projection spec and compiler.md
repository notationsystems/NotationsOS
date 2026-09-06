---
title: "Projection spec and compiler"
status: "IMPLEMENTED · READ-ONLY"
group: "Projection Fabric — representations, APIs and instruments"
tags:
  - architecture-map
  - fabric/projection
---

# Projection spec and compiler

**State:** `IMPLEMENTED · READ-ONLY`  
**Group:** Projection Fabric — representations, APIs and instruments  
**Map:** [[Payload OS Architecture]]

> One closed spec (`payload.projection-spec.v1`) and one router; the compiler works over one exact fixture release, enforces rights, visibility and time bounds, returns detached copies and states `sourceMutated: false`.

## What it is

- Modes and instruments are declared as data; kepler.gl and Three.js are routed to but ABSENT; CesiumJS is PRESENT.
- Served by a preview POST and a source-descriptor GET with legacy commitments and a full snapshot digest, never source rows.

## Where it lives

- `src/projection/spec.ts`, `compile.ts`, `source.ts`; `src/domain/projection.ts`
- `/api/projections/preview`, `/api/projections/sources/:releaseId`
- `docs/PROJECTION_FABRIC.md`

## Boundaries

- A projection changes representation, not identity or authority (rules 5 and 6).

## Connects to

- → [[Earth Twin (CesiumJS)]] — GLOBE spec, declared positions
- ← [[Corpus object model]] — one exact release

## Open questions

- [ ] Which projection is next after GLOBE: MAP over observations, GRAPH over record incidence, or TIME?

## Notes

_Brainstorm here._
