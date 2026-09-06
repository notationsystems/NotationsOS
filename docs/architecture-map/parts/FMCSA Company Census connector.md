---
title: "FMCSA Company Census connector"
status: "BOUNDED · LIVE-QUALIFIED · OPERATOR ONLY"
group: "World: sources, rights and recorded material"
tags:
  - architecture-map
  - fabric/acquisition
  - layer/world
---

# FMCSA Company Census connector

**State:** `BOUNDED · LIVE-QUALIFIED · OPERATOR ONLY`  
**Group:** World: sources, rights and recorded material  
**Map:** [[Payload OS Architecture]]

> The first real source. One checked-in request (USDOT 80806, corporations, US) against dataset az4n-8mr2 under a declared policy window; original bytes and receipts are retained; no recurring ingestion, no customer feed.

## What it is

- Fifteen pinned fields; no street address, phone or personal data.
- Census is a daily snapshot about 24 hours behind; `mcs150_date` is a filing date, not capture time.
- The retained capture flows on to a typed source candidate and an exact, inspectable candidate build (real-source continuity).

## Where it lives

- `src/acquisition/fmcsa.ts`, `census-adapter.ts`, `census-normalization.ts`, `cli.ts`, `store.ts`
- `examples/sources/fmcsa-company-census*.json`
- `docs/LOCAL_SOURCE_CONNECTORS.md`, `docs/REAL_SOURCE_CONTINUITY.md`

## Boundaries

- Does not resolve identity, admit a Carrier, assemble a corpus or infer a recommendation.
- Collection flags and credentials belong to the operator; the frontend never collects.

## Connects to

- → [[Source capture store and readback]] — retained bytes + receipts
- → [[Normalization adapters]] — census normalization
- ← [[Source inventory and connection queue]] — first connected source

## Open questions

- [ ] What does "the same carrier, two captures, one correction" look like for this source?
- [ ] Which Census fields deserve a product predicate, and with what uncertainty semantics?

## Notes

_Brainstorm here._
