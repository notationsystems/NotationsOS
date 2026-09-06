---
title: "Samsara vehicle GPS connector"
status: "BOUNDED · CREDENTIAL-GATED · NOT RUN HERE"
group: "World: sources, rights and recorded material"
tags:
  - architecture-map
  - fabric/acquisition
  - layer/world
---

# Samsara vehicle GPS connector

**State:** `BOUNDED · CREDENTIAL-GATED · NOT RUN HERE`  
**Group:** World: sources, rights and recorded material  
**Map:** [[Payload OS Architecture]]

> An operator-only capture of vehicle GPS observations: collection is off unless the operator process sets the flag with a scoped token. Offline tests and a synthetic demo exist; no request has been made from this environment.

## What it is

- Contract, store, HTTP client, observation typing and CLI are in place.
- Observations are typed as source observations with clocks stated, not as admitted positions.

## Where it lives

- `src/acquisition/samsara-*.ts`, `scripts/samsara.entry.ts`
- `docs/SAMSARA_CONNECTOR.md`

## Boundaries

- No credential exists in the repository or this environment.
- A telemetry point is an observation, not a canonical location of a real asset.

## Connects to

- → [[Source capture store and readback]] — credential-gated capture (not run here)
- ← [[Source inventory and connection queue]] — second bounded connector

## Open questions

- [ ] Once captured, which product question does a GPS trace answer (movement, dwell, exposure), and for which customer?
- [ ] How do Samsara timestamps map onto the replay contract's clocks?

## Notes

_Brainstorm here._
