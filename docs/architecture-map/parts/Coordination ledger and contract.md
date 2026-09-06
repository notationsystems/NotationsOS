---
title: "Coordination ledger and contract"
status: "IMPLEMENTED · payload.coordination.v1"
group: "Coordination layer — participants, requests, results"
tags:
  - architecture-map
  - layer/coordination
---

# Coordination ledger and contract

**State:** `IMPLEMENTED · payload.coordination.v1`  
**Group:** Coordination layer — participants, requests, results  
**Map:** [[Payload OS Architecture]]

> The contract behind stable and board: validated commands, references restricted to the current scope, directed contract connections, an inbox, a seed, and two thin clients (Python and JavaScript). Two manually started workers consume it: contract review and candidate-build review.

## What it is

- The candidate-build review worker recomputes a build's stored dependencies, compares with the requested digest and reports before acknowledging.

## Where it lives

- `src/coordination/` (types, ledger, store, http, inbox, seed, contract-review, candidate-build-review)
- `clients/python/payload_coordination.py`, `clients/javascript/coordination.mjs`
- `docs/CANDIDATE_BUILD_REVIEW_WORKER.md`

## Boundaries

- Workers inspect; they do not create builds, admit records or execute models.

## Connects to

- → [[Stable (agents and apparatus)]] — definitions
- → [[Board (messages and acknowledgements)]] — messages

## Open questions

- [ ] Is the ledger the right home for admission requests and approvals (APPROVAL_REQUIRED resolution)?

## Notes

_Brainstorm here._
