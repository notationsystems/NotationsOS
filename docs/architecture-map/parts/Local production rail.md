---
title: "Local production rail"
status: "IMPLEMENTED · OPT-IN · LOOPBACK"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Local production rail

**State:** `IMPLEMENTED · OPT-IN · LOOPBACK`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> One command contract drives registration, capture, fixed normalization and candidate-build assembly with structured stage receipts, historical retry, conflict detection, quarantine of invalid input and request-bound failed-run integrity.

## What it is

- Commands: REGISTER_CORPUS, REGISTER_SOURCE, ACQUIRE, NORMALIZE, BUILD_CANDIDATES; every run reports `run.stages`.
- Errors are typed (`payload.production-error.v1`); identical retries return EXISTING; changed commands on the same id are REQUEST_CONFLICT.
- A failed receipt must belong to its own request: stage sequence and retained-output bindings are validated before it is returned.

## Where it lives

- `src/production/` (contracts, worker, store, http, connector, comparison, errors)
- `/api/production`, `/api/production/inspect`, `/api/production/compare`
- `docs/LOCAL_PRODUCTION_WORKFLOW.md`, `docs/FAILED_RUN_INTEGRITY.md`

## Boundaries

- Guarded by `PAYLOAD_PRODUCTION_LOCAL=1` and loopback only.
- Writes UNADMITTED records only.

## Connects to

- → [[Normalization adapters]] — NORMALIZE
- → [[Production path workspace]] — run.stages, receipts, inspect
- ← [[Demonstration corpus and Carrier fixtures]] — Carrier bytes for the demonstration
- ← [[Evidence capture and receipts]] — ACQUIRE

## Open questions

- [ ] Which commands are missing for the milestone path: ATTACH_EVIDENCE to a notation, ADMIT, RELEASE?
- [ ] Should the rail be one worker or one worker per fabric?

## Notes

_Brainstorm here._
