---
title: "Customers and distribution channels"
status: "DECLARED"
group: "Firm, domain products and customers"
tags:
  - architecture-map
  - layer/firm
---

# Customers and distribution channels

**State:** `DECLARED`  
**Group:** Firm, domain products and customers  
**Map:** [[Payload OS Architecture]]

> Physical-economy brokers, asset and portfolio managers, insurance and financing firms. Distribution is by APIs, feeds, reports, workbenches and MCP tools; customer inference runs downstream over the stream.

## What it is

- Three customer categories, declared as data and shown on `/product`.
- Five distribution mechanisms: APIs, feeds, reports, workbenches, MCP tools.
- Economic engines: data systems and products; hosting and compute over authorized corpora; separately governed principal-capital trading.

## Where it lives

- `src/domain/product.ts` (`CUSTOMER_CATEGORIES`, `DISTRIBUTION_MECHANISMS`, `ECONOMIC_ARCHITECTURE`)
- `docs/ECONOMIC_ARCHITECTURE.md`

## Boundaries

- Customer evidence, customer workloads and proprietary-capital activity keep separate boundaries.
- Nothing here is measured revenue or validated willingness to pay.

## Connects to

- ← [[Domain products (Caravan, Tradewind, Landshark)]] — distribution
- ← [[Corpus feed API v1]] — APIs, feeds, MCP tools

## Open questions

- [ ] Which channel is validated first: the feed, the MCP tools, or a report?
- [ ] What does a customer need to see in a release to trust a correction?

## Notes

_Brainstorm here._
