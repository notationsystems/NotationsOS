# Payload OS · Notation Systems

Payload OS is the shared information-production system of Notation Systems: a
systems and intelligence firm for the physical economy. It turns authorized
heterogeneous source material into provenance-bearing computational corpora.
Those corpora are the finished information inventory; APIs, feeds, reports,
workbenches, and MCP tools distribute it. See [the company
mandate](docs/COMPANY_MANDATE.md).

Within that structure, Caravan, Tradewind, and Landshark are the domain
distribution products. This repository is their distribution-workbench
prototype, not a second canonical Data OS. Its current case/ruling interface
is a fixture-only Caravan workbench over synthetic data (`fixture_only: true`).
It does not serve customer data, construct canonical corpus state, or apply
inference for customers.

`src/data-os/` contains small TypeScript compatibility contracts for the first
two Bench workflows—source-use evaluation and immutable-evidence capture. They
are not an independent provenance system or a customer API.

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

- `docs/PHASE0_RECON.md` — what the sibling repositories contain, verbatim vocabulary, conflicts, recorded ambiguities.
- `docs/COMPANY_MANDATE.md` — the company mandate, customer categories, economic architecture, and Payload OS product structure.
- `docs/UX_ARCHITECTURE.md` — object model, navigation, projections, component boundaries, the authority boundary.
- `docs/INTERACTION_SPEC.md` — status transitions, refusal interaction, replay, supersession, visibility.
- `docs/DEMO_CASE.md` — the fixtures, why they are synthetic, what they demonstrate, what is unvalidated.

## Layout

```
src/domain      view model types, presentation selectors (projection, replay, highlight linking), domains
src/adapter     CaseSource — the only seam; FixtureCaseSource is the only implementation
src/data-os     frontend compatibility contracts for source-use policy and immutable-evidence capture
src/fixtures    Caravan profile and cases; manifest builder; digest plan; committed digests
src/components  primitives, case workspace, ruling viewer, replay, queue, intake, shell
src/app         routes: /cases, /cases/new, /cases/[caseId], /rulings, /rulings/[rulingId], /replay/[caseId], /profiles, /evidence, /api
tests/e2e       Playwright smoke, accessibility, keyboard, mobile, screenshots
```
