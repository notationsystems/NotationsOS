---
title: "Three states of information (E, K, I)"
status: "DOCTRINE AS DATA"
group: "State Fabric — validation, admission and canonical versions"
tags:
  - architecture-map
  - fabric/state
  - layer/doctrine
---

# Three states of information (E, K, I)

**State:** `DOCTRINE AS DATA`  
**Group:** State Fabric — validation, admission and canonical versions  
**Map:** [[Payload OS Architecture]]

> Evidence (what was observed; append-only, content-addressed), Canonical (admitted under a schema as a version; immutable per version), Inquiry (what one investigation manipulates; allowed to be wrong; promotion crosses validation).

## What it is

- Here: E is evidence artifacts and acquisitions; K is released records in certified releases (admission absent); I is notation drafts, saved local versions, the intake draft and candidates on the rail.

## Where it lives

- `src/domain/doctrine.ts` (`INFORMATION_STATES`)
- `docs/ARCHITECTURE.md` — Three states of information

## Boundaries

- Inquiry is never a source of truth.

## Connects to

- → [[Admission authority]] — I → K crosses validation
- ← [[Five fabrics and the architectural cycle]] — E / K / I

## Open questions

- [ ] Should every object carry its state letter as a field so a surface can never mislabel it?

## Notes

_Brainstorm here._
