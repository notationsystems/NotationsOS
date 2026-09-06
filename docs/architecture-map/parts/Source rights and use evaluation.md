---
title: "Source rights and use evaluation"
status: "IMPLEMENTED"
group: "Acquisition Fabric — world → evidence"
tags:
  - architecture-map
  - fabric/acquisition
---

# Source rights and use evaluation

**State:** `IMPLEMENTED`  
**Group:** Acquisition Fabric — world → evidence  
**Map:** [[Payload OS Architecture]]

> One exact decision per purpose, operation and audience at one instant: ALLOWED, APPROVAL_REQUIRED or DENIED, with reasons. Every capture, normalization and build evaluates it before acting.

## What it is

- `SourceRegistration` declares permitted and prohibited purposes, allowed and approval-required operations, audiences and effective windows.
- The `RightsSchedule` on a release shows the same registration of record with a rights matrix.

## Where it lives

- `src/data-os/source-policy.ts` (`evaluateSourceUse`), `src/data-os/contracts.ts`
- `src/components/corpus/RightsMatrix.tsx`

## Boundaries

- The browser never duplicates the decision; it renders the rail's decision.

## Connects to

- → [[Evidence capture and receipts]] — ALLOWED / APPROVAL_REQUIRED / DENIED

## Open questions

- [ ] Is a single instant enough, or do windows of use need their own object?
- [ ] How is APPROVAL_REQUIRED resolved, by whom, and where is that recorded?

## Notes

_Brainstorm here._
