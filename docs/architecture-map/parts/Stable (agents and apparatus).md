---
title: "Stable (agents and apparatus)"
status: "IMPLEMENTED · LOCAL REGISTRATION"
group: "Coordination layer — participants, requests, results"
tags:
  - architecture-map
  - layer/coordination
---

# Stable (agents and apparatus)

**State:** `IMPLEMENTED · LOCAL REGISTRATION`  
**Group:** Coordination layer — participants, requests, results  
**Map:** [[Payload OS Architecture]]

> Definitions of each participant: purpose, authority, runtime, version, domains, input and output contracts, capabilities and references; synastry is the declared connections between contracts with missing inputs stated.

## What it is

- Search and kind filters; local registration when enabled.

## Where it lives

- `src/components/coordination/CoordinationWorkspace.tsx`
- `docs/AGENT_COORDINATION.md`

## Boundaries

- A definition grants no authority beyond what it declares.

## Connects to

- ← [[App shell, navigation and design system]] — Coordination area
- ← [[Coordination ledger and contract]] — definitions

## Open questions

- [ ] Should Codex, the Claude sessions and the founder be registered participants with contracts, so the board records their handoffs?

## Notes

_Brainstorm here._
