---
title: "Domain products (Caravan, Tradewind, Landshark)"
status: "CARAVAN ACTIVE · TWO MODULE SLOTS"
group: "Firm, domain products and customers"
tags:
  - architecture-map
  - layer/firm
---

# Domain products (Caravan, Tradewind, Landshark)

**State:** `CARAVAN ACTIVE · TWO MODULE SLOTS`  
**Group:** Firm, domain products and customers  
**Map:** [[Payload OS Architecture]]

> Three domain products over one platform. Caravan (logistics, freight, cargo, supply-chain movement) is the reference implementation; Tradewind (markets, pricing, risk) and Landshark (parcels, zoning, entitlements) are declared, disabled slots.

## What it is

- Caravan carries every fixture: the `caravan.specialty-cargo` demonstration corpus (three releases, nineteen records, two retractions, seven sources) and the Carrier candidate contract.
- Tradewind and Landshark exist as module slots in the domain-product control so their absence is stated, not implied.

## Where it lives

- `src/domain/domains.ts`
- `src/fixtures/caravan/` — release, profile, cases
- Top bar domain-product control in `src/components/shell/AppShell.tsx`

## Boundaries

- No fourth public API; historical `PayloadOS` naming is an ancestor, not a rename instruction.
- Cross-domain connections require explicit evidence-bearing mappings, never matching labels.

## Connects to

- → [[Customers and distribution channels]] — distribution
- ← [[Notation Systems and Payload OS]] — one platform, three domains

## Open questions

- [ ] What is the first Tradewind or Landshark source whose rights are actually clear?
- [ ] Which corpus objects are shared across the three products, and which are domain-specific?

## Notes

_Brainstorm here._
