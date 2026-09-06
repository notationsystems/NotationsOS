---
title: "Notation state kernel (Rust)"
status: "PRESENT · LOCAL · AUTHORED STATE ONLY"
group: "State Fabric — validation, admission and canonical versions"
tags:
  - architecture-map
  - fabric/state
---

# Notation state kernel (Rust)

**State:** `PRESENT · LOCAL · AUTHORED STATE ONLY`  
**Group:** State Fabric — validation, admission and canonical versions  
**Map:** [[Payload OS Architecture]]

> A deterministic Rust command and history core for authored notation objects and explicit relationships: the frontend sends commands over a loopback API; Rust replays and validates; Save writes a versioned local snapshot.

## What it is

- Owns authored notations and relationships in one local workspace; does not own evidence, admit corpus records, activate releases or merge identities.
- Benchmark at 63 versions: load launched Rust 63 times, save 192 times; a measurement, not a target.

## Where it lives

- `native/state-kernel/` (Cargo)
- `src/state-kernel/` (runtime, store, http, types, errors)
- `/api/state-kernel`, `/api/state-kernel/preview`, `/api/state-kernel/save`
- `docs/LOCAL_NOTATION_STATE_KERNEL.md`, `docs/STATE_KERNEL_BENCHMARK.md`

## Boundaries

- Bevy or an ECS would not supply permissions, undo, storage or synchronization.

## Connects to

- → [[Notation workspace]] — loopback command API
- ← [[Runtimes and local stores]] — Rust

## Open questions

- [ ] Does the future canonical `VersionStore` reuse this kernel's replay model, or is corpus state a different kernel?
- [ ] When does per-command process launch become the bottleneck, and is a resident kernel worth it?

## Notes

_Brainstorm here._
