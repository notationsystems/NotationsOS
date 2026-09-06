---
title: "Ruling projections and result manifests"
status: "IMPLEMENTED · FIXTURE CASES"
group: "Projection Fabric — representations, APIs and instruments"
tags:
  - architecture-map
  - fabric/projection
---

# Ruling projections and result manifests

**State:** `IMPLEMENTED · FIXTURE CASES`  
**Group:** Projection Fabric — representations, APIs and instruments  
**Map:** [[Payload OS Architecture]]

> The same case bundle projected for sponsor, internal reviewer, named counterparty or public; rulings commit to a result manifest with a commitment, evidence root and anchor, exported machine-readably with an API example.

## What it is

- A projection removes what the viewer may not see and reduces detail to bounded public summaries.

## Where it lives

- `src/domain/selectors.ts` (`projectForViewer`)
- `src/components/ruling/`
- `/rulings/:id`

## Boundaries

- Visibility is a class on the object, not a UI toggle.

## Connects to

- ← [[Case workbench]] — projected per viewer

## Open questions

- [ ] Should the relying-party projection become a feed endpoint with its own rights evaluation?

## Notes

_Brainstorm here._
