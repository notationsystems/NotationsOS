---
title: "Seven doctrine rules and their enforcement"
status: "BOUND · TESTED"
group: "Doctrine and governance (applies to every layer)"
tags:
  - architecture-map
  - layer/doctrine
---

# Seven doctrine rules and their enforcement

**State:** `BOUND · TESTED`  
**Group:** Doctrine and governance (applies to every layer)  
**Map:** [[Payload OS Architecture]]

> Evidence is not state; canonical state is not the entire corpus; inquiry is allowed to be wrong; computation produces derived objects; projection never mutates its source; identity survives representation; every promoted result crosses an explicit validation boundary.

## What it is

- Each rule names where it is enforced and which test proves it (`docs/ARCHITECTURE.md`).
- The identity chain is kept distinct: evidence ≠ observation ≠ claim ≠ canonical state ≠ representation ≠ model ≠ execution ≠ verification.
- Operational rule: build shared information before multiplying reasoning processes.

## Where it lives

- `src/domain/doctrine.ts` (`DOCTRINE`, `IDENTITY_CHAIN`, `OPERATIONAL_RULE`)
- `src/architecture.test.ts`, `src/domain/projection.test.ts`, `src/fixtures/production/demo.contract.test.ts`, `src/data-os/local-candidate-build.test.ts`

## Boundaries

- Rule 7 is enforced today by absence: the rails write UNADMITTED records only and admission is stated as absent.

## Connects to

- → [[Verification harness]] — architecture tests

## Open questions

- [ ] Which rule would a real admission service most easily break, and what test would catch it?
- [ ] Should the rules be checked at runtime (a validator at the boundary) as well as in tests?

## Notes

_Brainstorm here._
