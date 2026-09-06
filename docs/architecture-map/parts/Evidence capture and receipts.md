---
title: "Evidence capture and receipts"
status: "IMPLEMENTED"
group: "Acquisition Fabric — world → evidence"
tags:
  - architecture-map
  - fabric/acquisition
---

# Evidence capture and receipts

**State:** `IMPLEMENTED`  
**Group:** Acquisition Fabric — world → evidence  
**Map:** [[Payload OS Architecture]]

> Bytes are bound to a source only under an allowed use, content-addressed, with a capture receipt and `sourceTruthClaimed: false`. The local evidence rail reopens an acquisition to recompute byte and receipt integrity.

## What it is

- Evidence artifacts carry digests, classes on three axes and clocks; they are append-only.
- The GAT audit and the spatial inquiry consume preserved artifacts by exact evidence reference.

## Where it lives

- `src/data-os/evidence-capture.ts`, `file-object-store.ts`, `local-intake.ts`, `local-record.ts`
- `scripts/evidence.entry.ts`
- `docs/LOCAL_EVIDENCE_INTAKE.md`

## Boundaries

- Evidence is not state (rule 1).

## Connects to

- → [[Local production rail]] — ACQUIRE
- → [[Acquisition area of the workbench]] — artifacts listed
- → [[GAT IFC audit instrument]] — audits preserved IFC artifacts
- → [[Spatial inquiry (floor access)]] — exact evidence references
- ← [[Source rights and use evaluation]] — ALLOWED / APPROVAL_REQUIRED / DENIED
- ← [[Inquiry instrument pages]] — feedback re-enters as evidence, never as state

## Open questions

- [ ] Should every rail share one evidence store with one catalog, or keep purpose-scoped roots?
- [ ] What is the retention and recall policy for evidence a source later withdraws?

## Notes

_Brainstorm here._
