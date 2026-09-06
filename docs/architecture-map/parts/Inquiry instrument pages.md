---
title: "Inquiry instrument pages"
status: "IMPLEMENTED · SYNTHETIC PREVIEWS"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
  - fabric/compute
---

# Inquiry instrument pages

**State:** `IMPLEMENTED · SYNTHETIC PREVIEWS`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> Spatial Inquiry (/spatial), Registration and access (/compute/registration), Clearance (/compute/clearance) and the Earth Twin (/earth): each a page over one compute or projection contract, marked as synthetic preview where it is one.

## What it is

- Each page validates closed vocabularies at the consumer boundary and states what it does not claim.

## Where it lives

- `src/components/spatial/`, `src/components/compute/`, `src/components/earth/`
- Inquiry area in `src/components/shell/nav.ts`

## Boundaries

- A page never creates evidence.

## Connects to

- → [[Evidence capture and receipts]] — feedback re-enters as evidence, never as state
- ← [[Registration and access geometry]] — synthetic preview
- ← [[Spatial inquiry (floor access)]] — retained analyses
- ← [[Clearance value-of-information experiment]] — synthetic preview
- ← [[Earth Twin (CesiumJS)]] — /earth

## Open questions

- [ ] Which of these instruments deserve a shared "experiment" shell (request, retained run, inspector) instead of four bespoke pages?

## Notes

_Brainstorm here._
