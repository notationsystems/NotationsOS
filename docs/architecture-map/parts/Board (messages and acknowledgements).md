---
title: "Board (messages and acknowledgements)"
status: "IMPLEMENTED · LOCAL POSTING"
group: "Coordination layer — participants, requests, results"
tags:
  - architecture-map
  - layer/coordination
---

# Board (messages and acknowledgements)

**State:** `IMPLEMENTED · LOCAL POSTING`  
**Group:** Coordination layer — participants, requests, results  
**Map:** [[Payload OS Architecture]]

> Shared messages by topic and kind: requests, handoffs, blockers, results and acknowledgements, directed or broadcast, with replies and release context.

## What it is

- A directed request can ask the candidate-build review worker to inspect one exact build.

## Where it lives

- `/board`, `/api/coordination`, `/api/coordination/inbox`

## Boundaries

- A board message resolves no identity and admits nothing (rule 3).

## Connects to

- → [[Candidate builds and comparison]] — review worker inspects one exact build
- ← [[Coordination ledger and contract]] — messages

## Open questions

- [ ] Which messages should become typed commands on a rail rather than prose?

## Notes

_Brainstorm here._
