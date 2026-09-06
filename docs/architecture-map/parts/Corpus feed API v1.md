---
title: "Corpus feed API v1"
status: "IMPLEMENTED · FIXTURE-BACKED"
group: "Projection Fabric — representations, APIs and instruments"
tags:
  - architecture-map
  - fabric/projection
---

# Corpus feed API v1

**State:** `IMPLEMENTED · FIXTURE-BACKED`  
**Group:** Projection Fabric — representations, APIs and instruments  
**Map:** [[Payload OS Architecture]]

> Releases, records, manifests, as-of queries, retractions and rulings as JSON over the same payloads the screens use; the stream page shows the feed URL that reproduces every answer.

## What it is

- `GET /api/v1/releases`, `/releases/:id`, `/records`, `/manifest`, `/as-of`, `/retractions?since=`, `/rulings/:id`, `/manifest`.

## Where it lives

- `src/adapter/feed.ts`, `feedShapes.ts`
- `/api` (the endpoints page with live examples)

## Boundaries

- Fixture corpus is byte-identical before and after every payload.

## Connects to

- → [[MCP server and tools]] — same payloads
- → [[Corpus and product pages]] — the same payloads on screen
- → [[Customers and distribution channels]] — APIs, feeds, MCP tools
- ← [[Certified release manifest and production record]] — manifests and commitments
- ← [[Corpus object model]] — releases, records, as-of, retractions

## Open questions

- [ ] What is the versioning and deprecation contract for the feed once a real corpus ships?

## Notes

_Brainstorm here._
