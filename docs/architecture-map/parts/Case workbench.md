---
title: "Case workbench"
status: "IMPLEMENTED · FIXTURE CASES"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
  - fabric/compute
---

# Case workbench

**State:** `IMPLEMENTED · FIXTURE CASES`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> The optional prescribed control over the corpus: CASE → USE → CLAIMS → EVIDENCE → CHECKS → RULING → REMEDIATION → RELEASE → MONITORING, with staged intake, a decision rail, lineage from artifact to ruling, bitemporal replay and admission profiles.

## What it is

- Every status, check result and assurance value is read from one `ClaimCaseBundle`; the intake draft is saved unevaluated and submission is an intent.
- Every ruling names the corpus release and build it was evaluated against.

## Where it lives

- `src/domain/types.ts`, `src/components/case/`, `queue/`, `intake/`, `replay/`, `src/fixtures/caravan/profile.ts`
- `docs/INTERACTION_SPEC.md`, `docs/DEMO_CASE.md`

## Boundaries

- The workbench adjudicates nothing; rulings come from the substrate contract.

## Connects to

- → [[Ruling projections and result manifests]] — projected per viewer
- ← [[Corpus object model]] — evaluated against release and build
- ← [[App shell, navigation and design system]] — Inquiry area

## Open questions

- [ ] Is the case workbench the customer's tool, an internal reviewer's tool, or a demonstration of the profile contract?

## Notes

_Brainstorm here._
