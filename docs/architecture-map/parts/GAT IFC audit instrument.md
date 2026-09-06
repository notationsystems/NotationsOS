---
title: "GAT IFC audit instrument"
status: "PINNED ENGINE · SPECIALIST"
group: "Compute / Decision Fabric — derived objects, never truth by default"
tags:
  - architecture-map
  - fabric/compute
---

# GAT IFC audit instrument

**State:** `PINNED ENGINE · SPECIALIST`  
**Group:** Compute / Decision Fabric — derived objects, never truth by default  
**Map:** [[Payload OS Architecture]]

> A preserved IFC (Industry Foundation Classes) building-model artifact is audited by the exact pinned GAT engine; the original report, a separate safe projection and an immutable execution receipt keep distinct identities.

## What it is

- Supported, blocked and failure outcomes stay distinct; historical inspection never authorizes.
- Runs in an isolated Python environment with a hash-pinned dependency.

## Where it lives

- `src/gat/` (contracts, pin, runtime, service, report)
- `/api/gat/audits`, `/api/gat/audits/:requestId`
- `scripts/gat-audit-runner.py`, `scripts/gat-bootstrap.mjs`, `examples/gat/`
- `docs/GAT_INSPECTOR.md`, `docs/ACQUISITION_GAT_MILESTONE.md`

## Boundaries

- A specialist instrument, not a corpus authority or a customer execution service.

## Connects to

- ← [[Evidence capture and receipts]] — audits preserved IFC artifacts
- ← [[Runtimes and local stores]] — Python, pinned

## Open questions

- [ ] Which audited quantities become corpus records, under which predicate and evidence class?

## Notes

_Brainstorm here._
