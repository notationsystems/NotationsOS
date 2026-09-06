---
title: "Production path workspace"
status: "IMPLEMENTED · REAL RAIL OR FIXTURE MODE"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
  - fabric/corpus
---

# Production path workspace

**State:** `IMPLEMENTED · REAL RAIL OR FIXTURE MODE`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> One continuous path in seven stages (source, acquisition, normalization, candidate build, inspection, notation, release), each with a state from a closed vocabulary derived from what the rails produced, with recovery actions and an inspector.

## What it is

- Drives the real local rail when enabled; otherwise an honest fixture mode with the enable command.
- Notation and release stages state their blockers: no attach command, no admission authority.

## Where it lives

- `src/domain/productionPath.ts`, `src/components/production/ProductionPath.tsx`, `src/app/production/page.tsx`
- `docs/PRODUCTION_PATH.md`

## Boundaries

- Never derives a state the rail did not report.

## Connects to

- ← [[Source capture store and readback]] — read-only readback
- ← [[Local production rail]] — run.stages, receipts, inspect
- ← [[App shell, navigation and design system]] — Corpus area

## Open questions

- [ ] What is the release stage's first real transition once admission exists?

## Notes

_Brainstorm here._
