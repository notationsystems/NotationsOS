---
title: "MCP server and tools"
status: "IMPLEMENTED · STDIO"
group: "Projection Fabric — representations, APIs and instruments"
tags:
  - architecture-map
  - fabric/projection
---

# MCP server and tools

**State:** `IMPLEMENTED · STDIO`  
**Group:** Projection Fabric — representations, APIs and instruments  
**Map:** [[Payload OS Architecture]]

> Eight Model Context Protocol tools wrap the same payloads as the feed: list and get releases, manifests, records, as-of queries, retractions and rulings.

## What it is

- One `notation://` identity per record across feed, as-of answer and every MCP result.

## Where it lives

- `src/mcp/server.ts`, `src/mcp/tools.ts`
- `npm run mcp`

## Boundaries

- MCP results never carry rail identifiers.

## Connects to

- ← [[Corpus feed API v1]] — same payloads

## Open questions

- [ ] Which customer agent workflow is the first to consume the tools, and what refusal shapes does it need?

## Notes

_Brainstorm here._
