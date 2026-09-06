---
title: "Source inventory and connection queue"
status: "21 INVENTORIED · 1 CONNECTED"
group: "World: sources, rights and recorded material"
tags:
  - architecture-map
  - fabric/acquisition
  - layer/world
---

# Source inventory and connection queue

**State:** `21 INVENTORIED · 1 CONNECTED`  
**Group:** World: sources, rights and recorded material  
**Map:** [[Payload OS Architecture]]

> Twenty-one historical registry entries ranked by expected market value, with readiness separate from rank. One source (FMCSA Company Census) is connected for internal qualification.

## What it is

- Ranking is an explicit engineering judgment, not measured revenue.
- Authorization covers bounded collection through qualified public routes only: no paid accounts, no invented permissions, no scraping beyond the qualified route, no customer evidence.
- Served read-only at `/api/production/source-inventory`.

## Where it lives

- `src/production/source-inventory.ts`
- `docs/SOURCE_CONNECTION_PROGRAM.md`, `docs/SOURCE_INTEGRATION_INVENTORY.md`

## Boundaries

- An available page, an old adapter or a successful response is not a rights grant.

## Connects to

- → [[FMCSA Company Census connector]] — first connected source
- → [[Samsara vehicle GPS connector]] — second bounded connector

## Open questions

- [ ] Which is the next source whose rights can be settled without a contract?
- [ ] Should readiness be a machine-checked state rather than a document column?

## Notes

_Brainstorm here._
