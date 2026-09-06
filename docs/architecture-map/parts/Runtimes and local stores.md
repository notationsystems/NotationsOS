---
title: "Runtimes and local stores"
status: "NODE · RUST · PYTHON"
group: "Runtimes, local stores and verification"
tags:
  - architecture-map
  - layer/runtime
---

# Runtimes and local stores

**State:** `NODE · RUST · PYTHON`  
**Group:** Runtimes, local stores and verification  
**Map:** [[Payload OS Architecture]]

> Node.js/TypeScript is the facade and workbench; Rust is the deterministic notation state kernel; Python runs the pinned GAT engine. Everything local is retained under ignored `.payload/` roots.

## What it is

- Next.js 16 app router pages and route handlers; pure domain modules under `src/domain`; rails under `src/data-os`, `src/production`, `src/acquisition`, `src/compute`, `src/observation`, `src/spatial`.
- Rust kernel in `native/state-kernel`, launched per command by the Node side.
- Local stores: `.payload/source-qualification`, `.payload/production`, `.payload/spatial-*`, `.payload/scalar-benchmark-demo`, `.payload/gat-runtime`, state-kernel snapshots.
- Operator CLIs via `scripts/*.entry.ts` bundled with esbuild: `evidence`, `source`, `replay`, `benchmark`, `spatial`, `samsara`, `clearance`, `mcp`.

## Where it lives

- `package.json` scripts
- `scripts/`
- `docs/SYNTHESIZED_ARCHITECTURE.md` — Runtime allocation

## Boundaries

- Node present does not mean planned authentication or transport services exist.
- Rust present does not mean a production canonical state kernel exists.

## Connects to

- → [[Notation state kernel (Rust)]] — Rust
- → [[GAT IFC audit instrument]] — Python, pinned

## Open questions

- [ ] Which rails should move from per-command processes to a long-lived local service, and what would that change about receipts?
- [ ] Do the `.payload/` roots need a single catalog?

## Notes

_Brainstorm here._
