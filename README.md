# Payload OS · Notation Systems

Notation Systems is an information manufacturer. It turns heterogeneous source material into governed, point-in-time, computable corpus releases; products and infrastructure distribute and execute against those releases. The corpus and its API are the product; the API, feed, report, agent or workbench is the distribution mechanism for a certified corpus release. Customers apply their own inference, models, agents and workflows to the stream.

This repository holds the product surface over a demonstration corpus and one optional application layer above it. The product surface: certified corpus releases with their build records, production records, release manifests, sources and intelligence-rights schedules; records with value, unit, basis, machine-readable uncertainty and validity bounds, both clocks, provenance, evidence class and stable identity; as-of answers that reconstruct what was knowable at a knowledge time; push retractions; and a fixture-backed feed API under `/api/v1`. The application layer: the Payload OS ruling workbench for the Caravan domain product. Where a customer wants a prescribed control, it turns a claim, a declared use, a tolerance, a valid time, a knowledge-time cutoff and evidence into an inspectable ruling (`ADMITTED`, `ADMITTED_WITH_CONDITIONS`, `PENDING_EVIDENCE`, `REFUSED`, `SUPERSEDED`, `REVOKED`) and makes every part of that ruling inspectable. It is not required for the corpus to be valuable, and it is not a fourth public API. Positioning is set in `docs/ECONOMIC_ARCHITECTURE.md`.

The corpus and ruling workbench are fixture only. The `/api/v1` endpoints serve the committed demonstration corpus and every response says `fixture_only: true`. Every fixture-backed screen says so. Payload OS also has an agent and apparatus stable at `/agents` and a shared message board at `/board`. These open as read-only seed definitions and messages; the opt-in `LOCAL_SANDBOX` mode records local registrations, messages and acknowledgements separately from the immutable corpus fixtures. A participant inbox and JavaScript/Python clients let local processes use the board. A manually started contract-review worker inspects declared input/output compatibility, posts a result and acknowledges its request; it changes no corpus facts or rulings and executes no model or customer workload.

A separate local evidence intake command evaluates an operator-declared source policy for exact `INTERNAL INGEST`, stores content-addressed bytes and an acquisition receipt, and reopens them for integrity checks. This establishes a local evidence rail only: normalization, canonical domain admission and release activation remain absent from that path.

## Run

```
npm install
npm run dev            # http://localhost:3000 → /releases; coordination is read-only
npm run dev:coordination # http://127.0.0.1:3000; local stable and board writes enabled
npm run agent:contract-review -- --once # in a second terminal; register and run a local review pass
npm run build && npm start
```

The coordination launcher binds to `127.0.0.1` and uses `PORT` when set, otherwise port 3000. Visit `/agents` to inspect and register definitions and `/board` to post, reply and acknowledge. Local history persists in the git-ignored `.payload/coordination/events.json`. Selecting an author simulates an identity; it is not authentication. The same `GET` / `POST /api/coordination` JSON interface and `GET /api/coordination/inbox` are available to C++, Rust, Python and JavaScript clients; dependency-free JavaScript and Python clients are included under `clients/`.

Run the contract reviewer once to register `agent.contract-review.v1`, post a directed `REQUEST` with topic `contract-review` and body `{"participantId":"agent.release"}`, then run it again to receive a result. `--watch` repeats passes with a two-second wait. Each pending-work pass starts its inbox scan at zero; durable acknowledgements exclude handled inputs. `PAYLOAD_COORDINATION_URL` selects the worker's local server URL. See [Agent coordination](docs/AGENT_COORDINATION.md) for the two-terminal workflow, client examples, cursor semantics and recovery behavior.

To exercise local evidence intake without a web server, use the included synthetic notice:

```sh
npm run evidence -- capture --request examples/evidence/request.json --input examples/evidence/notice.txt
npm run evidence -- inspect --acquisition demo-caravan-local-notice-001
```

The default store is `.payload/evidence`; `--root <directory>` selects another local root. An identical retry returns the original acquisition and timestamp; a changed valid, policy-allowed request under the same id conflicts, while invalid requests fail earlier checks. Inspection recomputes policy at the original capture time and byte/receipt integrity without returning raw bytes or modifying storage. It grants no current access or retention permission and checks no subsequent external revocation. Inputs are bounded at 8 MiB and metadata at 64 KiB. See [Local evidence intake](docs/LOCAL_EVIDENCE_INTAKE.md) for exact status, storage and recovery boundaries. The declaration is not independent authorization, and the local files are not production storage or canonical corpus state.

## Check

```
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest: node tests for selectors/fixtures, jsdom tests for screens
python -m unittest discover -s tests/python -v # standard-library coordination client checks
npm run stamp:digests  # recompute committed sha256 digests after editing a fixture
npm run e2e            # playwright: smoke, axe (WCAG 2.2 AA), keyboard, mobile
npm run screenshots    # writes docs/screenshots/*.png
```

Playwright uses the environment's Chromium when `PW_CHROMIUM_PATH` is set (for example `/opt/pw-browsers/chromium`); otherwise its own download.

## Read

- `docs/ECONOMIC_ARCHITECTURE.md` — authoritative positioning: the information manufacturer, two operating businesses, a separately governed principal-capital activity, and how this repository reflects each.
- `docs/PHASE0_RECON.md` — what the sibling repositories contain, verbatim vocabulary, conflicts, recorded ambiguities.
- `docs/COMPANY_MANDATE.md` — the company mandate, customer categories, economic architecture, and Payload OS product structure.
- `docs/UX_ARCHITECTURE.md` — object model, navigation, projections, component boundaries, the authority boundary.
- `docs/AGENT_COORDINATION.md` — the shared agent/apparatus stable, scoped board and inbox, contract synastry, JavaScript/Python clients, local worker and Bench references.
- `docs/LOCAL_EVIDENCE_INTAKE.md` — local source-policy evaluation, content-addressed evidence, acquisition receipts, inspection and Bench-derived boundaries.
- `docs/INTERACTION_SPEC.md` — status transitions, refusal interaction, replay, supersession, visibility.
- `docs/DEMO_CASE.md` — the fixtures, why they are synthetic, what they demonstrate, what is unvalidated.

## Layout

```
src/domain      corpus types and as-of selectors (corpus.ts); the operating model as data (product.ts); workbench view model and selectors; domains
src/adapter     CorpusSource and CaseSource seams; feed payload builders; fixture implementations only
src/data-os     Bench-derived source policy and capture contracts; local file object store, acquisition receipts and intake CLI; no canonical corpus admission
src/coordination agent/apparatus definitions, scope and message rules, contract matching, participant inbox, deterministic reviewer and opt-in local event log
clients         dependency-free JavaScript and Python coordination clients
scripts         local server launcher, contract-review worker and evidence-intake entry points
examples/evidence synthetic notice and operator-declared intake manifest
src/fixtures    Caravan corpus releases, records, retractions and rights; profile and cases; manifest builder; digest plan; committed digests
src/components  primitives, case workspace, ruling viewer, replay, queue, intake, shell
src/app         product model: /product
                corpus: /releases, /releases/[releaseId], /stream, /retractions, /api, /api/v1/* (fixture feed)
                workbench: /cases, /cases/new, /cases/[caseId], /rulings, /rulings/[rulingId], /replay/[caseId], /profiles, /evidence
                coordination: /agents, /board, /api/coordination, /api/coordination/inbox (read-only fixtures or local sandbox)
tests/e2e       Playwright smoke, accessibility, keyboard, mobile, screenshots
```
