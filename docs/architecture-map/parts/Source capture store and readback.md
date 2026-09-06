---
title: "Source capture store and readback"
status: "IMPLEMENTED · READ-ONLY ROUTE"
group: "Acquisition Fabric — world → evidence"
tags:
  - architecture-map
  - fabric/acquisition
---

# Source capture store and readback

**State:** `IMPLEMENTED · READ-ONLY ROUTE`  
**Group:** Acquisition Fabric — world → evidence  
**Map:** [[Payload OS Architecture]]

> The operator's qualification root holds real captures. A guarded loopback route reads one capture back without collection or provider contact, returning the store's own inspection or an exact not-found state.

## What it is

- Readback states are kept distinct on the production path: found, not on this machine, readback refused (with code), reading.
- Same flag and loopback guard as the production rail.

## Where it lives

- `src/acquisition/store.ts` (`SourceCaptureStore.inspect`)
- `/api/production/source-captures/:requestId`, `/api/production/source-normalizations/:id`, `/api/production/source-builds/:id`

## Boundaries

- No clock, no derivation, no provider.

## Connects to

- → [[Production path workspace]] — read-only readback
- ← [[FMCSA Company Census connector]] — retained bytes + receipts
- ← [[Samsara vehicle GPS connector]] — credential-gated capture (not run here)

## Open questions

- [ ] Should readback grow into a general "evidence inspector" route across all rails?

## Notes

_Brainstorm here._
