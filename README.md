# Payload OS

Notation Systems builds provenance-bearing computational corpora, exposes them as durable data streams and APIs, and operates the compute systems that make those corpora useful. The corpus and its API are the product. Customers apply their own inference, models, agents and workflows to the stream.

This repository holds one optional application layer over that substrate: the Payload OS ruling workbench for the Caravan domain product. Where a customer wants a prescribed control, it turns a claim, a declared use, a tolerance, a valid time, a knowledge-time cutoff and evidence into an inspectable ruling (`ADMITTED`, `ADMITTED_WITH_CONDITIONS`, `PENDING_EVIDENCE`, `REFUSED`, `SUPERSEDED`, `REVOKED`) and makes every part of that ruling inspectable. It is not required for the corpus to be valuable, and it is not a fourth public API. Positioning is set in `docs/ECONOMIC_ARCHITECTURE.md`.

This repository is frontend only and fixture only. It renders rulings; it does not compute them, and it serves no endpoint. Every fixture-backed screen says so.

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
```

Playwright uses the environment's Chromium when `PW_CHROMIUM_PATH` is set (for example `/opt/pw-browsers/chromium`); otherwise its own download.

## Read

- `docs/ECONOMIC_ARCHITECTURE.md` — authoritative positioning: corpus and API are the product; the workbench is an optional application layer.
- `docs/PHASE0_RECON.md` — what the sibling repositories contain, verbatim vocabulary, conflicts, recorded ambiguities.
- `docs/UX_ARCHITECTURE.md` — object model, navigation, projections, component boundaries, the authority boundary.
- `docs/INTERACTION_SPEC.md` — status transitions, refusal interaction, replay, supersession, visibility.
- `docs/DEMO_CASE.md` — the fixtures, why they are synthetic, what they demonstrate, what is unvalidated.

## Layout

```
src/domain      view model types, presentation selectors (projection, replay, highlight linking), domains
src/adapter     CaseSource — the only seam; FixtureCaseSource is the only implementation
src/fixtures    Caravan profile and cases; manifest builder; digest plan; committed digests
src/components  primitives, case workspace, ruling viewer, replay, queue, intake, shell
src/app         routes: /cases, /cases/new, /cases/[caseId], /rulings, /rulings/[rulingId], /replay/[caseId], /profiles, /evidence, /api
tests/e2e       Playwright smoke, accessibility, keyboard, mobile, screenshots
```
