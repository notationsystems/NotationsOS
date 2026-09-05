# Economic architecture

Authoritative positioning, as set by the founder. Every other document and every user-facing string in this repository is subordinate to it. The statement below (2026-09-05) supersedes the earlier formulation, which is kept beneath it for the detail it adds.

## The firm

Notation Systems is a systems and intelligence firm for the physical economy. It builds computational representations of physical systems from authorized geospatial, remote-sensing, operational, and scientific source material.

Its internal production system turns that material into provenance-bearing computational corpora through acquisition, extraction, normalization, identity, ontology, computation, storage, indexing, verification, release, correction, and recall.

The corpora are the finished information inventory. APIs, feeds, reports, workbenches, and MCP tools distribute it. Customers apply their own inference, models, agents, and workflows to the data streams.

## Customer categories

- Brokers
- Asset and portfolio managers
- Insurance and financing firms

## Economic architecture

```
Build governed computational corpora
→ distribute them as data systems and products
→ host compute over authorized corpus releases
→ separately govern any proprietary trading/speculation activity
```

Customer evidence, customer workloads, and proprietary-capital activity remain separated.

## Product architecture

```
Notation Systems
└─ Payload OS — shared information-production system
   ├─ Caravan — logistics, freight, cargo, supply-chain movement
   ├─ Tradewind — markets, instruments, pricing, risk
   └─ Landshark — parcels, zoning, entitlements, development state
```

Payload OS is the shared production layer, not a fourth customer API. Caravan, Tradewind, and Landshark are the bounded domain products.

## The concise formulation

| Layer | Who supplies it |
|---|---|
| Corpus + API / feed | The product |
| Inference, model, agent | Customer computation, or hosted computation over authorized releases |
| Ruling, admission profile, case workbench | Optional application layer over the corpus |

Providing the API is enough. The API exposes the governed substrate: point-in-time state, lineage, uncertainty, rights, corrections, and stable identity. A customer runs their own inference against the stream without receiving an opaque conclusion from Notation Systems. A ruling is one possible application built over the corpus, useful where a customer wants a prescribed control; it is not a requirement for value creation.

## The value proposition, kept concrete

- "As-of" answers that reconstruct what was knowable at a specific time.
- Machine-readable uncertainty and validity bounds, not footnotes.
- Certified release manifests and push retractions when a fact changes.
- Provenance that survives downstream use, audit, and resale.
- A customer can automate a decision against the feed without blindly trusting a black box.

## Shared production facilities inside Payload OS

Two internal facilities are implemented as local rails. Neither is a customer product, and neither creates canonical domain state.

The agent and apparatus stable and shared message board are internal coordination facilities within Payload OS. They record participant definitions and their working contracts, expose compatible connections and missing inputs, and carry scoped requests, handoffs, blockers, results and acknowledgements. A participant inbox and JavaScript/Python clients let local processes coordinate through these records. A manually started local contract-review worker reports declared suppliers and missing inputs, then acknowledges the request. A separate candidate-build-review worker can inspect an exact local build reference and report a bounded historical observation before acknowledging; it grants no retrieval or admission authority. This supports assembly of the shared production system. It does not change the customer categories, make inference a requirement for buying the corpus, or establish managed customer compute. The implementations and present limits are recorded in [Agent coordination](AGENT_COORDINATION.md) and [Candidate-build review worker](CANDIDATE_BUILD_REVIEW_WORKER.md).

The local evidence rail is another shared production facility: it evaluates a declared source policy, captures local bytes with a storage receipt and reopens the acquisition for integrity checks. Its authorization basis is an operator declaration. Capture alone creates no normalized record. A separate local normalization step evaluates INTERNAL DERIVE and parses a fixed Caravan Carrier JSON contract into a source-scoped, unresolved and unadmitted candidate, or persists a quarantine with no candidate. A subsequent local candidate builder assembles explicitly selected candidates under a definition and knowledge cutoff, reopening their evidence and separately evaluating DERIVE at build time. Its manifest remains unadmitted; none of these steps creates canonical domain state, admits a corpus or activates a release. The implementations are documented in [Local evidence intake](LOCAL_EVIDENCE_INTAKE.md), [Local normalization](LOCAL_NORMALIZATION.md) and [Local candidate builds](LOCAL_CANDIDATE_BUILDS.md).

The first [local source connector](LOCAL_SOURCE_CONNECTORS.md) now acquires a bounded FMCSA Company Census response through an operator-only CLI for internal qualification. It preserves original bytes, an immutable request intent and outcome history, with source-scoped observations or quarantine. This is the distinct `fmcsa-company-census` source, not QCMobile or the synthetic Carrier source contract. Its operator-declared qualification policy does not permit customer redistribution. One live qualification capture does not establish recurring ingestion, a public source-connector fleet, a released corpus or a customer live feed.

The [synthesized architecture](SYNTHESIZED_ARCHITECTURE.md) organizes these responsibilities into Acquisition, Corpus, State, Compute/Decision and Projection fabrics while preserving the same mandate and product hierarchy. kepler.gl, CesiumJS and Three.js are assigned distinct, non-authoritative projection roles over the same corpus, not separate information products. The implemented [Projection Fabric](PROJECTION_FABRIC.md) slice is a read-only preview over exact fixture releases: safe selected records or a record-to-subject graph, with spatial geometry explicitly unavailable. It serves no local unadmitted build and installs no renderer. A separate small [Rust notation state kernel](LOCAL_NOTATION_STATE_KERNEL.md) implements authored objects, commands, undo/redo and local frontend save/reload; InquiryState, Morpho and canonical domain-state admission remain target architecture.

## Rules for this repository

- Lead with data systems and compute. Public-facing text does not lead with principal capital.
- Do not call any output a warrant. Ruling, assurance or admission decision describes what the current system can sell.
- The honest present tense: this repository holds a demonstration corpus with its feed, MCP tools and a fixture-only ruling workbench, the latter an optional application over the corpus. Its shared agent/apparatus stable and board open with read-only seed data; opt-in `LOCAL_SANDBOX` mode persists local definitions, messages and acknowledgements, with a participant inbox, JavaScript/Python clients and manually started local contract-review and candidate-build-review workers, which inspect declarations or a saved local build and record results; the board has no process launcher or managed agent fleet, and identities remain simulated. A local evidence intake CLI persists source bytes and acquisition receipts after evaluating operator-declared policy; a fixed Carrier normalizer parses evidence after a distinct derivation-policy check and persists candidate or quarantine metadata; a bounded local candidate builder persists explicit membership roots, a knowledge cutoff and build-time source-use decisions; all three rails support historical integrity reinspection and none provides canonical admission or a public delivery path. The board-connected build reviewer returns only a bounded summary and does not mutate those files or establish current retrieval rights. One bounded, operator-only FMCSA Company Census live connector is implemented for internal qualification; a public source-connector fleet, recurring ingestion and customer live feeds remain absent. Production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, reports, and a completed pilot also remain absent.

## Earlier formulation (2026-09-04), retained for detail

Notation Systems builds provenance-bearing computational corpora: governed, time-bounded information inventory that can be inspected, computed against, corrected, and distributed with its evidence, method lineage, rights, uncertainty, and release history intact.

The firm monetizes this shared computational substrate through two operating businesses:

1. **Data systems and intelligence products.** Notation Systems licenses computational corpora, APIs, feeds, decision workbenches, reports, and vertical applications built on those corpora.
2. **Provenance-preserving compute.** The firm operates managed storage, models, simulations, agents, and computational workloads over authorized corpus releases, allowing customers to execute confidential work without losing lineage, policy, or recallability.

Over time, a separately governed principal-capital activity may deploy the firm's own capital using lawfully acquired and policy-permitted proprietary intelligence. This activity is distinct from customer products: it has separate information-access controls, capital allocation, risk management, reporting, and conflict governance. Customer evidence remains tenant-isolated; customer workloads remain confidential; proprietary strategies cannot draw on restricted customer information.

The underlying production system is shared. The customer-facing API, feed, report, agent, or workbench is not the finished good itself; it is the distribution mechanism for a certified corpus release. The manufacturing analogy makes the moat legible: scraping is extraction; it is not the business. The durable asset is the continuously maintained corpus plus its identity mappings, release history, corrections, and computable interfaces.

## How this repository reflects it

The [local production workflow](LOCAL_PRODUCTION_WORKFLOW.md) makes the existing acquisition-to-candidate rail operable through an opt-in loopback API, with configuration records, stage receipts and historical inspection. The [GAT IFC inspector](GAT_INSPECTOR.md) adds a pinned, bounded specialist audit over preserved evidence. The separate [FMCSA Company Census connector](LOCAL_SOURCE_CONNECTORS.md) adds one local operator-only live acquisition path, verified with one 371-byte response for USDOT 80806 on 2026-09-05 and unchanged historical inspection/replay. These are internal local capabilities, not public customer delivery, canonical admission, independent verification or managed customer compute. Only the earlier blanket absence of live connectors has changed; the other five firm-wide absences remain.

| Statement | Where it is implemented | Presence |
|---|---|---|
| Operate one local Caravan production path through supported frontend contracts | `src/production`, `/api/production`, `/api/production/inspect`; [Local production workflow](LOCAL_PRODUCTION_WORKFLOW.md) | Local development implementation: registered definitions/sources, bounded capture, exact retries, evidence inspection, fixed Carrier normalization/quarantine and unadmitted candidate-build inspection. This API has no live or public acquisition controls |
| Connect a bounded external source while preserving evidence and restricting use | `src/acquisition`, `scripts/source.entry.ts`; `npm run source -- capture` and `inspect`; [Local source connectors](LOCAL_SOURCE_CONNECTORS.md) | One operator-only FMCSA Company Census connector for internal qualification: fixed bounded HTTPS request, original-byte evidence intake, immutable intent/budget/outcome history, strict source parser or retained quarantine, and offline reinspection without recollection. Customer redistribution is not permitted by the qualification policy; provider license remains unresolved. Distinct from QCMobile; no synthetic Carrier adapter compatibility, canonical admission, recurring ingestion or customer live feed |
| Inspect building-model evidence through a pinned specialist engine | `src/gat`, `/api/gat/audits`; [GAT inspector](GAT_INSPECTOR.md) | Local implementation: exact IFC bytes + current declared DERIVE permission → pinned GAT audit → original report/receipt + safe projection. Supported and blocked outcomes; no source-truth, engineering approval, admission or physical-action authority |
| Governed, time-bounded information inventory with evidence, method lineage, rights, uncertainty and release history intact | `src/domain/corpus.ts`, `src/fixtures/caravan/release.ts`; `/releases` | Demonstration fixture |
| The production system: acquisition, extraction, normalization, identity, ontology, computation, storage, indexing, verification, release, correction, recall | `ProductionStage` in `src/domain/corpus.ts`; `BuildRecord.stages` on every release; `/releases/:id` production record; `/product` | Demonstration fixture: storage is stated as not run, computation as not applicable |
| Authorized geospatial, remote-sensing, operational and scientific source material | `RightsSchedule.materialClass`; the material column of the rights matrix; `/product` | Operational and scientific in the demonstration corpus; geospatial and remote sensing not represented, and stated so |
| APIs, feeds, reports, workbenches and MCP tools distribute the inventory | `/api/v1` feed, `/stream`, `src/mcp/tools.ts` + `src/mcp/server.ts` (`npm run mcp`), the Caravan workbench | Feed, stream, MCP tools and workbench as fixture; reports absent |
| Three customer categories: brokers, asset and portfolio managers, insurance and financing firms | `CUSTOMER_CATEGORIES` in `src/domain/product.ts`; `/product` | Stated; the Caravan fixture is broker-shaped |
| The four-step economic architecture and the separation of customer evidence, customer workloads and proprietary-capital activity | `ECONOMIC_ARCHITECTURE` and `THESIS.separation` in `src/domain/product.ts`; `/product`; `Corpus.governance` | Stated; separation recorded as governance and prohibited uses |
| The product architecture tree | `src/domain/domains.ts`; `/product` | Caravan as fixture; Tradewind and Landshark as disabled slots |
| Capture authorized local source material and retain its bytes and receipt | `src/data-os/local-intake.ts`, `source-policy.ts`, `evidence-capture.ts`, `file-object-store.ts`, `local-files.ts`; `npm run evidence -- capture` | Local implementation: exact INTERNAL INGEST evaluated against operator-declared policy; create-only content-addressed files and acquisition metadata; readback and reinspection. Capture alone does not normalize; no independent authorization, canonical admission, physical WORM or production storage claim |
| Normalize acquired evidence into source-scoped, provenance-bearing candidates | `src/data-os/caravan-carrier-adapter.ts`, `local-normalization.ts`; `npm run evidence -- normalize` and `inspect-normalization` | Local implementation: separate INTERNAL DERIVE check; fixed UTF-8 Carrier JSON parser; explicit missingness/time; durable UNRESOLVED, UNADMITTED candidate or quarantine with no candidate; historical reparse and digest recomputation. No source-truth or field-accuracy claim, independent verification, identity merge, corpus build/admission, release or public API exposure |
| Assemble explicitly selected candidates into a time-bounded build | `src/data-os/local-candidate-build.ts`; `npm run evidence -- build-candidates` and `inspect-candidate-build` | Local implementation: 1–64 selected Carrier normalizations; actual dependency reinspection; definition/source-class and cutoff checks; separate build-time INTERNAL DERIVE; exact membership references and root, create-only manifest and historical recomputation. UNADMITTED, with no canonical state, identity resolution, completeness claim, release or public delivery |
| Candidate records stay visible and separate from canonical admission, release and the feed | `/candidates` over `src/fixtures/production/demo.json`, produced through the real rails by `pipeline.ts` and reproduced by `demo.contract.test.ts`; `separationTerms` checked against every feed payload and MCP tool result | Demonstration reproduced under the rails; every record UNADMITTED, identity UNRESOLVED; the page reads no local store |
| The architecture carried forward, bound to this repository: three states of information, the seven rules with their enforcement and tests, verification tiers, the routing table over the one projection router | `src/domain/doctrine.ts`, `src/domain/projection.ts`, `docs/ARCHITECTURE.md` (binding) over `docs/SYNTHESIZED_ARCHITECTURE.md` (prose); `/product`; `src/domain/doctrine.test.ts` keeps every named test present; `src/architecture.test.ts` proves rules 5, 6 and 7 structurally; `src/domain/projection.test.ts` checks the table against `routeProjection` for every combination | Stated as data with presence flags; the state kernel and the three projection engines absent, and stated so |
| The first information product, specified, and the promise a delivered record makes | `src/domain/informationProduct.ts` (customer question, subjects, fields with evidence requirements, freshness, permitted uses, correction, acceptance target), `src/domain/deliveredRecord.ts` (ten questions mapped to payload fields); `/products`; both held to the corpus and the feed by their tests | Specified against the demonstration corpus; the acceptance target's admission and release-from-candidates steps stated as not reached |
| Compare local candidate membership without inventing business meaning | `src/data-os/candidate-build-comparison.ts`; `npm run evidence -- compare-candidate-builds`; [Local candidate comparison](LOCAL_CANDIDATE_COMPARISON.md) | Read-only local implementation: exact full build references and source-byte reinspection; same definition/contract/purpose and ordered input times; source-scoped added/removed/unchanged/reference-changed entries. Deterministic ephemeral report, no new timestamp, field-change inference, correction/retraction decision, current-use grant, canonical mutation or released feed |
| Stable authored notation state with validated, reversible commands | `native/state-kernel`, `src/state-kernel`, `/notations`; [Local notation state kernel](LOCAL_NOTATION_STATE_KERNEL.md) | Implemented locally: Rust create/update/relation/undo/redo replay, loopback preview/save API, versioned create-only snapshots and frontend reload. Browser milestone verified on desktop/mobile. Not canonical corpus admission, independent verification, production permissions/storage or a Bevy runtime |
| A dependable local inquiry workspace: drafts that survive navigation and reload, three states told apart, conflicts kept inspectable, capacity explained, and the evidence-reference contract ahead of its backend | `src/components/notations/*`, `src/domain/evidenceReference.ts`, `src/fixtures/notations/`; [Notation workspace](NOTATION_WORKSPACE.md) | Frontend over the real kernel and store, verified on desktop and mobile; evidence references are fixture-marked with attachment DISABLED until the requested backend commands exist |
| Project one source without changing its identity or authority | `src/projection/spec.ts`, `source.ts`, `compile.ts`; `GET /api/projections/sources/[releaseId]`, `POST /api/projections/preview` | Read-only fixture implementation: legacy release commitments plus a required full snapshot pin, explicit rights/visibility/time-bound selection, preserved record/subject identities, safe records and RECORD_ABOUT_SUBJECT graph; detached payload and projection digests. No inferred relation, source mutation, canonical admission or independent verification |
| Distinct spatial and structural instruments over the same corpus | `routeProjection`; `docs/SYNTHESIZED_ARCHITECTURE.md`, `docs/PROJECTION_FABRIC.md` | Configured architectural roles: kepler.gl for analytical geography, CesiumJS for geographic-world realization, Three.js for structural/computational representation. Geometry requests return UNAVAILABLE; renderer dependencies, instances, spatial adapters and new visual workbench modes are not implemented |
| Certified release manifests | `src/fixtures/releaseManifest.ts`, `Certification` on every release, commitment stamped and drift-tested; `GET /api/v1/releases/:id/manifest` | Demonstration fixture; verification is internal recompute, never independent |
| Push retractions when a fact changes | `Retraction`, `/retractions`, `GET /api/v1/retractions?since=` | Demonstration fixture |
| As-of answers | `queryAsOf`, `/stream`, `GET /api/v1/releases/:id/as-of` | Demonstration fixture |
| Machine-readable uncertainty and validity bounds | `CorpusRecord.uncertainty`, `validFrom` / `validTo` on every record and in every payload | Demonstration fixture |
| Provenance that survives downstream use, audit and resale | provenance, evidence class, identity and `rights` (with attribution) on every delivered record | Demonstration fixture |
| A customer can automate a decision against the feed | the decision-rule example on `/api`; every answer names release, build, both clocks and bounds | Demonstration fixture |
| The intelligence-rights schedule: for every source, whether it may be used for acquisition, normalization, customer delivery, aggregation, model training, internal research, redistribution, proprietary strategy, trading | A data-os `SourceRegistration` of record per source (`src/fixtures/caravan/release.ts`), every matrix cell an exact decision from `evaluateSourceUse` with reasons, `permittedUses` derived from the registration, delivery enforced by `deliveryDecision` at the feed | Fixture registrations; delivery enforced by exact decision, the rest recorded as policy |
| Evidence bound to its bytes: content digest, storage key, receipt, source truth not claimed | data-os `captureEvidence` / `verifyEvidenceCapture`; every fixture artifact's capture binding reproduced by `src/fixtures/capture.contract.test.ts`; shown in evidence detail and record provenance | Fixture bindings, reproduced under the contract |
| The Notations Bench is the reference implementation of the shared machinery | `docs/COMPANY_MANDATE.md`; `REFERENCE_IMPLEMENTATION` on `/product`; `src/data-os` as its TypeScript counterparts | Not in this repository |
| Tenant isolation, information barrier, release timing, non-use | `Corpus.governance`, shown on every release page and in the release manifest | Recorded as policy only |
| Payload OS is the shared production and assurance layer; Caravan, Tradewind and Landshark are the domain products | `src/domain/domains.ts`, the domain-product control in the shell, `/product` | Caravan as fixture; the others as disabled slots |
| A shared stable of agents and apparatuses, declaring purpose, authority, domains, contracts and capabilities | `src/coordination/types.ts`, `seed.ts`, `ledger.ts`; `/agents` | Seed definitions; local registrations in opt-in sandbox; registration does not launch a worker |
| Synastry across apparatuses and agents through declared input/output compatibility | `connectionsFor`; the stable's directed connections and explicit missing inputs | Local prototype calculation over definitions in a common scope and domain; no execution or deployment attestation |
| A shared message board for requests, handoffs, blockers, results and acknowledgements | `/board`, `GET` / `POST /api/coordination`; `src/coordination/store.ts` | Read-only seed board by default; append-only local event history with serialized writes in opt-in sandbox; simulated authors, no production authentication |
| Agents and apparatuses consume scoped work and preserve receipt history | `GET /api/coordination/inbox`; `src/coordination/inbox.ts`; `clients/javascript/coordination.mjs`, `clients/python/payload_coordination.py` | Local prototype: bounded cursor pages, scope/domain checks, opt-in broadcasts and durable acknowledgement filtering; dependency-free clients |
| A local agent uses the board to inspect declared working relationships and report back | `src/coordination/contract-review.ts`, `scripts/contract-review.entry.ts`; `npm run agent:contract-review` | Manually started deterministic worker; registers through the API, posts a result before acknowledgement, recovers saved results after receipt failure; no model, corpus-production or customer-workload execution |
| Connect coordination to inspection of an exact local candidate build | `src/coordination/candidate-build-review.ts`, `candidate-build-review-cli.ts`, `scripts/candidate-build-review.entry.ts`; `npm run agent:candidate-build-review` | Manually started deterministic worker; fixed operator-selected evidence root, id/full-digest request and null release context; read-only dependency recomputation, bounded redacted result, saved-result validation/readback before acknowledgement. Simulated identity; no authenticated RETRIEVE gate, admission, release, model or customer-workload execution |
| Data systems and intelligence products; provenance-preserving compute; separately governed principal capital | `src/domain/product.ts`, `/product` | Stated with presence flags; managed customer-workload execution and principal capital absent |
| A public source-connector fleet, recurring ingestion and customer live feeds | `src/acquisition`; [Local source connectors](LOCAL_SOURCE_CONNECTORS.md) | Absent. One bounded operator-only FMCSA Company Census live connector is present for internal qualification, not a deployed source fleet or customer delivery |
| Production storage and identity; deployed customer delivery; managed execution of customer workloads; independent verification; a completed pilot | — | All five remain absent, as stated on `/product` |
