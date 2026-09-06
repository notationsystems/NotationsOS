---
title: "Spatial inquiry (floor access)"
status: "IMPLEMENTED · MANUAL ANNOTATION"
group: "Compute / Decision Fabric — derived objects, never truth by default"
tags:
  - architecture-map
  - fabric/compute
---

# Spatial inquiry (floor access)

**State:** `IMPLEMENTED · MANUAL ANNOTATION`  
**Group:** Compute / Decision Fabric — derived objects, never truth by default  
**Map:** [[Payload OS Architecture]]

> How does opening or closing one explicit passage change access through one floor? A validated layout with spaces and passages, a scenario, and a directed-room-access analysis with CONFIRMED, POSSIBLE_ONLY and DISCONNECTED reachability.

## What it is

- Geometry is never used to create edges; layouts are validated and digest-identified.
- Analyses are retained and comparable; the page validates closed vocabularies at the consumer boundary.

## Where it lives

- `src/spatial/` (contracts, analysis, service, fixture), `src/domain/spatial.ts`
- `/api/spatial/analyses`, `/api/spatial/compare`, `/spatial`
- `docs/spatial/inquiry-v1.md`, `examples/spatial/`

## Boundaries

- A manually annotated synthetic example, not measured geometry.

## Connects to

- → [[Inquiry instrument pages]] — retained analyses
- ← [[Evidence capture and receipts]] — exact evidence references

## Open questions

- [ ] How does a GAT-audited IFC model become a layout with provenance instead of a manual annotation?

## Notes

_Brainstorm here._
