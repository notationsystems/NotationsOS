---
title: "Semantic separations kept in every surface"
status: "HOUSE VOCABULARY"
group: "Doctrine and governance (applies to every layer)"
tags:
  - architecture-map
  - layer/doctrine
---

# Semantic separations kept in every surface

**State:** `HOUSE VOCABULARY`  
**Group:** Doctrine and governance (applies to every layer)  
**Map:** [[Payload OS Architecture]]

> Evidence ≠ assertion. Evaluation ≠ verification. Refused ≠ false. Valid time ≠ knowledge time. History stays visible. Visibility classes are explicit. Output is never called a warrant.

## What it is

- These separations come from founder corrections and are applied to every string and state in the workbench.
- Two clocks on everything: `validAt` (world time) and `knownAt` (knowledge time); as-of answers change with knowledge time.
- A refusal is a typed outcome with a remedy, never a false value; evaluation under a profile is not verification, which is stated as internal recompute.
- Visibility classes (PRIVATE_PREFLIGHT, INTERNAL_ONLY, COUNTERPARTY_SHARED, PUBLIC_RULING) project the same bundle differently.

## Where it lives

- `docs/INTERACTION_SPEC.md`, `docs/UX_ARCHITECTURE.md`
- `src/domain/selectors.ts` (`projectForViewer`, `queryAsOf`, `recordStatusAt`)
- Primitives in `src/components/primitives/` (badges that never collapse three axes into one score)

## Boundaries

- Honest present tense: a surface says what exists, not what might.
- No component knows what a lot, a certificate or a moisture value means; domain rules are data.

## Connects to

- (no drawn flow yet; add one)

## Open questions

- [ ] Which separations should become closed vocabularies in contracts rather than conventions in prose?
- [ ] Is there a separation missing for "synthetic input vs recorded input" beyond the replay surface?

## Notes

_Brainstorm here._
