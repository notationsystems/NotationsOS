---
title: "Admission authority"
status: "ABSENT · MILESTONE PRIORITY"
group: "State Fabric — validation, admission and canonical versions"
tags:
  - architecture-map
  - fabric/state
---

# Admission authority

**State:** `ABSENT · MILESTONE PRIORITY`  
**Group:** State Fabric — validation, admission and canonical versions  
**Map:** [[Payload OS Architecture]]

> The explicit validation boundary that turns a candidate into an admitted canonical version. It does not exist yet, and every surface says so; the rails refuse what they cannot vouch for.

## What it is

- Milestone priority three: one admission authority, owned by the backend, never duplicated in the browser.
- Planned corpus sequence: exact authored evidence references on notations, then an explicit admission contract.
- Until then: candidates are UNADMITTED, releases come from fixtures, and the notation kernel admits no corpus record.

## Where it lives

- `docs/PRODUCTION_PATH.md` (blockers for notation and release stages)
- `docs/ARCHITECTURE.md` — rule 7

## Boundaries

- Admission logic is never duplicated in the browser.
- A prediction, a projection or a drawing never grants admission.

## Connects to

- → [[Corpus object model]] — admitted versions (target)
- ← [[Candidate builds and comparison]] — UNADMITTED candidates → (absent boundary)
- ← [[Notation workspace]] — evidence references → admission contract (next)
- ← [[Three states of information (E, K, I)]] — I → K crosses validation

## Open questions

- [ ] What does the admission contract take: candidate reference, profile, evidence references, reviewer identity, two clocks? What does it return: version, refusal, or approval-required?
- [ ] Is admission per record, per build, or per release?
- [ ] Who can run it, and where is its receipt retained?

## Notes

_Brainstorm here._
