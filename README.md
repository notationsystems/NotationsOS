# Payload OS

Notation Systems is a systems and intelligence firm for the physical economy. It builds computational representations of physical systems from authorized geospatial, remote-sensing, operational, and scientific source material. Its production system turns that material into provenance-bearing computational corpora through acquisition, extraction, normalization, identity, ontology, computation, storage, indexing, verification, release, correction, and recall. The corpora are the finished information inventory; APIs, feeds, reports, workbenches, and MCP tools distribute it; customers apply their own inference, models, agents, and workflows to the data streams.

This repository holds Payload OS, the shared information-production system, over a demonstration corpus, with three of the distribution mechanisms and one application above it. The inventory: certified corpus releases with their production records, release manifests, sources and intelligence-rights schedules; records with value, unit, basis, machine-readable uncertainty and validity bounds, both clocks, provenance, evidence class and stable identity; as-of answers; push retractions (corrections and recalls). Distribution: a fixture-backed feed API under `/api/v1`, the stream, and MCP tools (`npm run mcp`). The application: the Caravan ruling workbench. Where a customer wants a prescribed control, it turns a claim, a declared use, a tolerance, a valid time, a knowledge-time cutoff and evidence into an inspectable ruling (`ADMITTED`, `ADMITTED_WITH_CONDITIONS`, `PENDING_EVIDENCE`, `REFUSED`, `SUPERSEDED`, `REVOKED`) and makes every part of that ruling inspectable. It is not required for the corpus to be valuable, and it is not a fourth public API. Positioning is set in `docs/ECONOMIC_ARCHITECTURE.md`.

This repository is fixture only. It computes no fact and adjudicates nothing; the `/api/v1` endpoints serve the committed demonstration corpus and every response says `fixture_only: true`. Every fixture-backed screen says so.

## Run

```
npm install
npm run dev            # http://localhost:3000 → /cases
npm run build && npm start
```

## Check

```
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest: node tests for selectors/fixtures, jsdom tests for screens
npm run stamp:digests  # recompute committed sha256 digests after editing a fixture
npm run e2e            # playwright: smoke, axe (WCAG 2.2 AA), keyboard, mobile
npm run screenshots    # writes docs/screenshots/*.png
npm run mcp            # MCP server over the fixture feed (stdio)
```

Playwright uses the environment's Chromium when `PW_CHROMIUM_PATH` is set (for example `/opt/pw-browsers/chromium`); otherwise its own download.

## Read

- `docs/ECONOMIC_ARCHITECTURE.md` — authoritative positioning: the information manufacturer, two operating businesses, a separately governed principal-capital activity, and how this repository reflects each.
- `docs/PHASE0_RECON.md` — what the sibling repositories contain, verbatim vocabulary, conflicts, recorded ambiguities.
- `docs/UX_ARCHITECTURE.md` — object model, navigation, projections, component boundaries, the authority boundary.
- `docs/INTERACTION_SPEC.md` — status transitions, refusal interaction, replay, supersession, visibility.
- `docs/DEMO_CASE.md` — the fixtures, why they are synthetic, what they demonstrate, what is unvalidated.

## Layout

```
src/domain      corpus types and as-of selectors (corpus.ts); the operating model as data (product.ts); workbench view model and selectors; domains
src/adapter     CorpusSource and CaseSource seams; feed payload builders; fixture implementations only
src/mcp         MCP tools over the same feed payloads, and the stdio server
src/fixtures    Caravan corpus releases, records, retractions and rights; profile and cases; manifest builder; digest plan; committed digests
src/components  primitives, case workspace, ruling viewer, replay, queue, intake, shell
src/app         product model: /product
                corpus: /releases, /releases/[releaseId], /stream, /retractions, /api, /api/v1/* (fixture feed)
                workbench: /cases, /cases/new, /cases/[caseId], /rulings, /rulings/[rulingId], /replay/[caseId], /profiles, /evidence
tests/e2e       Playwright smoke, accessibility, keyboard, mobile, screenshots
```
