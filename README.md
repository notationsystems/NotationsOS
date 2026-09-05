# Payload OS · Notation Systems

Notation Systems is a systems and intelligence firm for the physical economy. It builds computational representations of physical systems from authorized geospatial, remote-sensing, operational, and scientific source material. Its production system turns that material into provenance-bearing computational corpora through acquisition, extraction, normalization, identity, ontology, computation, storage, indexing, verification, release, correction, and recall. The corpora are the finished information inventory; APIs, feeds, reports, workbenches, and MCP tools distribute it; customers apply their own inference, models, agents, and workflows to the data streams.

This repository holds Payload OS, the shared information-production system, over a demonstration corpus, with three of the distribution mechanisms and one application above it. The inventory: certified corpus releases with their production records, release manifests, sources and intelligence-rights schedules; records with value, unit, basis, machine-readable uncertainty and validity bounds, both clocks, provenance, evidence class and stable identity; as-of answers; push retractions (corrections and recalls). Distribution: a fixture-backed feed API under `/api/v1`, the stream, and MCP tools (`npm run mcp`). The application: the Caravan ruling workbench. Where a customer wants a prescribed control, it turns a claim, a declared use, a tolerance, a valid time, a knowledge-time cutoff and evidence into an inspectable ruling (`ADMITTED`, `ADMITTED_WITH_CONDITIONS`, `PENDING_EVIDENCE`, `REFUSED`, `SUPERSEDED`, `REVOKED`) and makes every part of that ruling inspectable. It is not required for the corpus to be valuable, and it is not a fourth public API. Positioning is set in `docs/ECONOMIC_ARCHITECTURE.md`.

The corpus and ruling workbench are fixture only. The `/api/v1` endpoints serve the committed demonstration corpus and every response says `fixture_only: true`. Every fixture-backed screen says so. Payload OS also has an agent and apparatus stable at `/agents` and a shared message board at `/board`. These open as read-only seed definitions and messages; the opt-in `LOCAL_SANDBOX` mode records local registrations, messages and acknowledgements separately from the immutable corpus fixtures. A participant inbox and JavaScript/Python clients let local processes use the board. Manually started deterministic workers can review declared input/output compatibility or inspect an exact local candidate-build reference, post a result and acknowledge the request. They change no corpus facts or rulings and execute no model or customer workload.

A separate local evidence intake command evaluates an operator-declared source policy for exact `INTERNAL INGEST`, stores content-addressed bytes and an acquisition receipt, and reopens them for integrity checks. A subsequent local normalization command separately evaluates `INTERNAL DERIVE` and parses one fixed Caravan Carrier JSON contract into an unresolved, unadmitted candidate or a recorded quarantine. A local candidate builder now assembles an explicit, bounded set of those candidates under a definition and knowledge cutoff, with a separate build-time DERIVE check and recomputable membership root. These commands create no canonical domain state or corpus admission, activate no release and do not change the fixture API.

The [synthesized architecture](docs/SYNTHESIZED_ARCHITECTURE.md) organizes the system into Acquisition, Corpus, State, Compute/Decision and Projection fabrics without changing Payload OS or its domain products. Read-only `GET /api/projections/sources/[releaseId]` supplies an exact fixture source descriptor, including a full snapshot digest; `POST /api/projections/preview` consumes it with explicit record selection, both times and viewer. It returns rights-filtered evidence records or a record-to-subject incidence graph with stable identities; spatial requests declare kepler.gl, CesiumJS or Three.js routing but return missing geometry explicitly. No renderer dependency, instance or new visual workbench is installed. Local unadmitted evidence and builds are not served by this fixture path.

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

To exercise the separate normalized-candidate path, use the synthetic Carrier example, whose declaration permits both ingestion and derivation:

```sh
npm run evidence -- capture --request examples/carrier/acquisition.json --input examples/carrier/source.json
npm run evidence -- normalize --request examples/carrier/normalization.json
npm run evidence -- inspect-normalization --normalization demo-caravan-carrier-normalization-001
```

Use the same store root for all three commands. This fixed adapter parses captured UTF-8 JSON up to 64 KiB, preserves source-scoped identity and explicit missingness, and leaves canonical identity unresolved. A contract mismatch records a quarantine with no candidate; source bytes are not moved. Normalization and inspection return JSON with exit `0` for a normalized run, `2` for a persisted quarantine and `1` for an error. Inspection recomputes the parser and original declared DERIVE decision, not a current access grant. See [Local normalization](docs/LOCAL_NORMALIZATION.md) for the exact schema, historical retries, provenance and nonclaims. The original notice remains ingestion-only.

Then select 1–64 normalization ids in an explicit candidate-build request. Set its `knownThrough` at or after each candidate's knowledge time and no later than the build time:

```sh
npm run evidence -- build-candidates --request <manifest.json>
npm run evidence -- inspect-candidate-build --build <build-id>
```

The builder reopens every selected normalization and its source bytes, rejects missing/quarantined members and duplicate source-scoped identities, and persists references and metadata without copying candidate data fields. It does not scan for members or choose a current version. Reordered identical requests preserve the original build and time; inspection recomputes the original decisions without granting current access. Builds remain `UNADMITTED` and do not feed the public API. See [Local candidate builds](docs/LOCAL_CANDIDATE_BUILDS.md) for the request shape, cutoff, source-class and DERIVE rules, storage limits and recovery behavior.

`npm run evidence -- compare-candidate-builds --request <manifest.json>` compares two inspected local builds by exact source-id/source-record-id tuples and normalization/candidate references. It requires full build digests, identical definition/contract/purpose and nondecreasing build/cutoff times. The deterministic report is not saved and includes no invented comparison time; it distinguishes reference changes without inferring field changes, corrections or retractions. Source identifiers are included, but raw bytes, candidate fields and policy bodies are not. See [Local candidate comparison](docs/LOCAL_CANDIDATE_COMPARISON.md) for the request template and limits. This creates no new build, current-use grant, board post or released change feed.

With the local coordination server running, `npm run agent:candidate-build-review -- --once` registers a separate build-inspection worker. Send it a directed request with topic `candidate-build-review`, `context: null` and exact JSON body `{ "buildId": "…", "expectedDigest": "sha256:…" }`, using the full `build.digest` returned by inspection, not `recordsRoot`. Run it again to obtain a redacted build-level result and acknowledgement. Its evidence root is selected only by the operator's `--root` flag, not the message. Saved results are validated and read back before acknowledgement; a failed receipt reuses the historical observation, while a new request obtains a new inspection. See [Candidate-build review worker](docs/CANDIDATE_BUILD_REVIEW_WORKER.md) for the complete client example, loopback-only configuration and simulated-identity limits. This grants no current retrieval rights or admission authority.

## Check

```
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest: node tests for selectors/fixtures, jsdom tests for screens
python -m unittest discover -s tests/python -v # standard-library coordination client checks
npm run stamp:digests  # recompute committed sha256 digests after editing a fixture
npm run e2e            # playwright: smoke, axe (WCAG 2.2 AA), keyboard, mobile, no horizontal document overflow
npm run screenshots    # writes docs/screenshots/*.png
npm run mcp            # MCP server over the fixture feed (stdio)
```

Playwright uses the environment's Chromium when `PW_CHROMIUM_PATH` is set (for example `/opt/pw-browsers/chromium`); otherwise its own download.

## Read

- `docs/ECONOMIC_ARCHITECTURE.md` — authoritative positioning: the information manufacturer, two operating businesses, a separately governed principal-capital activity, and how this repository reflects each.
- `docs/PHASE0_RECON.md` — what the sibling repositories contain, verbatim vocabulary, conflicts, recorded ambiguities.
- `docs/COMPANY_MANDATE.md` — the company mandate, customer categories, economic architecture, and Payload OS product structure.
- `docs/SYNTHESIZED_ARCHITECTURE.md` — five fabrics, seven doctrine invariants, historical concept mapping and target runtime/projection responsibilities; implemented boundaries are explicit.
- `docs/PROJECTION_FABRIC.md` — exact fixture ProjectionSpec, read-only preview example, identity-preserving records/graph, rights/time gates and explicit missing geometry; no renderer implementation.
- `docs/UX_ARCHITECTURE.md` — object model, navigation, projections, component boundaries, the authority boundary.
- `docs/AGENT_COORDINATION.md` — the shared agent/apparatus stable, scoped board and inbox, contract synastry, JavaScript/Python clients, local worker and Bench references.
- `docs/LOCAL_EVIDENCE_INTAKE.md` — local source-policy evaluation, content-addressed evidence, acquisition receipts, inspection and Bench-derived boundaries.
- `docs/LOCAL_NORMALIZATION.md` — fixed Caravan Carrier parsing, separate derivation permission, source-scoped candidates, quarantine and read-only recomputation.
- `docs/LOCAL_CANDIDATE_BUILDS.md` — explicit time-bounded candidate membership, build-time derivation permission, reference roots and historical inspection; no canonical admission.
- `docs/LOCAL_CANDIDATE_COMPARISON.md` — read-only exact local build comparison, source-scoped reference changes and deterministic ephemeral reports; no semantic diff or released change feed.
- `docs/CANDIDATE_BUILD_REVIEW_WORKER.md` — manually launched board-to-local-build inspection, bounded results, result-before-receipt recovery and authority limits.
- `docs/INTERACTION_SPEC.md` — status transitions, refusal interaction, replay, supersession, visibility.
- `docs/DEMO_CASE.md` — the fixtures, why they are synthetic, what they demonstrate, what is unvalidated.

## Layout

```
src/domain      corpus types and as-of selectors (corpus.ts); the operating model as data (product.ts); workbench view model and selectors; domains
src/adapter     CorpusSource and CaseSource seams; feed payload builders; fixture implementations only
src/projection  closed ProjectionSpec, full fixture-source snapshot descriptor and replaceable records/graph compiler; engine routing only, no renderer dependencies
src/data-os     Bench-derived source policy/capture, local evidence store, fixed Carrier parser, candidate builds and read-only reference comparison; no canonical corpus admission
src/coordination agent/apparatus definitions, scope and message rules, contract matching, participant inbox, deterministic contract/build-inspection workers and opt-in local event log
clients         dependency-free JavaScript and Python coordination clients
scripts         local server launcher, contract-review and candidate-build-review workers; evidence intake/normalization/candidate-build entry points
examples/evidence synthetic notice and operator-declared intake manifest
examples/carrier synthetic Carrier JSON, acquisition declaration and normalization request
src/mcp         MCP tools over the same feed payloads, and the stdio server
src/domain/doctrine.ts   the architecture carried forward as data: five fabrics, three states of information, seven rules with where each is enforced and which tests prove it, verification tiers (docs/ARCHITECTURE.md is the prose; /product renders it)
src/domain/projection.ts the projection contract and its pure router: kepler.gl / CesiumJS / Three.js / table by coordinate semantics and intent; engines named, not installed
src/architecture.test.ts structural doctrine: browser and page layers take only types and the pure policy evaluator from the rails; the rails import nothing from above; every projection leaves the corpus untouched and identities intact
src/fixtures/production  the candidate-production demonstration: pipeline.ts runs examples/ through the real local rails at fixed instants; demo.json is its committed output, drift-tested and separation-tested
src/fixtures    Caravan corpus releases, records, retractions and rights; profile and cases; manifest builder; digest plan; committed digests
src/components  primitives, case workspace, ruling viewer, replay, queue, intake, shell
src/app         product model: /product
                corpus: /releases, /releases/[releaseId], /stream, /retractions, /api, /api/v1/* (fixture feed)
                workbench: /cases, /cases/new, /cases/[caseId], /rulings, /rulings/[rulingId], /replay/[caseId], /profiles, /evidence
                coordination: /agents, /board, /api/coordination, /api/coordination/inbox (read-only fixtures or local sandbox)
                production: /candidates (the local rail's acquisitions, normalizations, candidate build and refusals, all UNADMITTED; reproduced from examples/ by npm run stamp:production)
                projection: /api/projections/sources/[releaseId] (descriptor GET), /api/projections/preview (read-only POST over pinned fixture releases)
tests/e2e       Playwright smoke, accessibility, keyboard, mobile, overflow guard, screenshots
```
