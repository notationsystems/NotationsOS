---
title: "Corpus and product pages"
status: "IMPLEMENTED"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
  - fabric/projection
---

# Corpus and product pages

**State:** `IMPLEMENTED`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> /product (the operating model as data), /products, /releases and release detail with certification and rights, /stream (as-of), /retractions and /api (endpoints with live examples).

## What it is

- Release detail shows the manifest commitment, the production record stage by stage, build inputs, the rights matrix, governance, records with status and knowable retractions.

## Where it lives

- `src/app/product`, `products`, `releases`, `stream`, `retractions`, `api`; `src/components/corpus/`

## Boundaries

- Renders the corpus; never edits it.

## Connects to

- ← [[Corpus feed API v1]] — the same payloads on screen

## Open questions

- [ ] What does a customer-facing release page need that the internal one has too much of?

## Notes

_Brainstorm here._
