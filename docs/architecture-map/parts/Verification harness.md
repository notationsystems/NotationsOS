---
title: "Verification harness"
status: "GREEN ON THE BRANCH"
group: "Runtimes, local stores and verification"
tags:
  - architecture-map
  - layer/runtime
---

# Verification harness

**State:** `GREEN ON THE BRANCH`  
**Group:** Runtimes, local stores and verification  
**Map:** [[Payload OS Architecture]]

> Vitest unit and component tests, three Playwright configurations (regular desktop and Pixel 7, production rail with a real worker, real Rust kernel), axe accessibility checks, horizontal-overflow guards and regenerated screenshots.

## What it is

- Latest combined-tree run: 3901 unit tests (118 files), 139 regular browser tests at desktop and Pixel 7, 4 production-harness tests, 10 real-kernel tests, screenshots regenerated.
- Architecture tests assert doctrine invariants (byte-identical corpus after projections, no rail identifiers in releases, import direction).
- Contract tests parse every manifest with the vendored control-plane parser and pin vendored digests.

## Where it lives

- `vitest.config.ts`, `playwright.config.ts`, `playwright.production.config.ts`, `playwright.state-kernel.config.ts`
- `scripts/production-e2e.mjs`, `scripts/state-kernel-e2e.mjs`
- `tests/e2e/`, `src/**/*.test.ts(x)`
- Receipts in `docs/PRODUCTION_PATH.md`, `docs/WORKSPACE_DESIGN.md`

## Boundaries

- A passing suite is evidence of reproducibility, not of source truth.

## Connects to

- ← [[Seven doctrine rules and their enforcement]] — architecture tests

## Open questions

- [ ] Which checks should run against a recorded (non-synthetic) manifest once one exists?
- [ ] Is a nightly full run worth the machine, or is per-push enough?

## Notes

_Brainstorm here._
