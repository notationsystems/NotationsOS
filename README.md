# Payload OS

The human-facing instrument over the Notation Systems claim, evidence, ruling, refusal, remediation, release and supersession system. A user submits a claim, a declared use, a tolerance, a valid time, a knowledge-time cutoff, evidence and a requested assurance class; the system returns a ruling — `ADMITTED`, `ADMITTED_WITH_CONDITIONS`, `PENDING_EVIDENCE`, `REFUSED`, `SUPERSEDED` or `REVOKED` — and this interface makes every part of that ruling inspectable.

This repository holds the frontend only. It renders rulings; it does not compute them. All data is demonstration fixture data (`fixture_only: true`), and every fixture-backed screen says so.

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
