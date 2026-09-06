---
title: "Five fabrics and the architectural cycle"
status: "DOCTRINE AS DATA"
group: "Doctrine and governance (applies to every layer)"
tags:
  - architecture-map
  - layer/doctrine
---

# Five fabrics and the architectural cycle

**State:** `DOCTRINE AS DATA`  
**Group:** Doctrine and governance (applies to every layer)  
**Map:** [[Payload OS Architecture]]

> Acquire → Preserve evidence → Compile corpus → Establish state → Project → Compute → Investigate → Act → Observe. Five fabrics share provenance-bearing references over one substrate; feedback re-enters as evidence, never straight into canonical state.

## What it is

- Acquisition, Corpus, State, Compute/Decision and Projection fabrics are responsibility boundaries, not five databases.
- The cycle is the spine of this map: the main column follows it from world to representation.
- Feedback from any instrument returns to the Acquisition Fabric as an observation or evidence-bearing input.

## Where it lives

- `src/domain/doctrine.ts` — `FABRICS`, `INFORMATION_STATES`, `DOCTRINE`, `VERIFICATION_TIERS`, `IDENTITY_CHAIN`
- `docs/SYNTHESIZED_ARCHITECTURE.md` (prose of record), `docs/ARCHITECTURE.md` (what is bound here)

## Boundaries

- Drawing or selecting an object does not promote it.
- Engines do not own separate authoritative state.

## Connects to

- → [[Three states of information (E, K, I)]] — E / K / I

## Open questions

- [ ] Is the State Fabric a service, a library, or a contract that several rails honour? Today it is mostly absent.
- [ ] Where does "Act" live in this repository? Nothing acts yet; is that the right boundary for a corpus company?

## Notes

_Brainstorm here._
