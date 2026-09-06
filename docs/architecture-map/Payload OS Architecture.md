---
title: "Payload OS Architecture"
tags:
  - architecture-map
---

# Payload OS architecture map

An editable map of the Notation Systems / Payload OS repository as it exists on the branch, drawn for brainstorming and refinement. Every card is one part with its present state, what it is, where it lives, what it must not do, what it connects to, and open questions.

## Open it

- Open this folder (`docs/architecture-map`) as an Obsidian vault, or open the repository root as a vault: links resolve either way.
- **Payload OS Architecture.canvas** is the graph. Cards link to their notes under `parts/`. Drag, regroup, add cards and arrows; the canvas is a plain JSON Canvas file and survives a commit.
- Graph view: filter by tag `#architecture-map`, then by `fabric/…` or `layer/…` to see one fabric at a time.
- The Mermaid overview below renders in reading view.

## Legend

| Mark | Meaning |
|---|---|
| Row (group) | one fabric of the five, or one cross-cutting layer; rows follow the cycle Acquire → Preserve evidence → Compile corpus → Establish state → Project → Compute → Investigate → Act → Observe |
| `STATE` line on a card | the part's present standing, in the repository's own vocabulary (IMPLEMENTED, BOUNDED, SYNTHETIC PREVIEW, FIXTURE, CANDIDATE, ABSENT, DOCTRINE) |
| Red card, red arrow | a declared absence: the admission authority |
| Green arrow | feedback returning as evidence |
| `fabric/…`, `layer/…` tags | the fabric a part serves and the layer it sits in |

## Parts by group

### Firm, domain products and customers

- [[Notation Systems and Payload OS]] — `AUTHORITATIVE POSITIONING` — A systems and intelligence firm for the physical economy.
- [[Domain products (Caravan, Tradewind, Landshark)]] — `CARAVAN ACTIVE · TWO MODULE SLOTS` — Three domain products over one platform.
- [[Customers and distribution channels]] — `DECLARED` — Physical-economy brokers, asset and portfolio managers, insurance and financing firms.

### Doctrine and governance (applies to every layer)

- [[Five fabrics and the architectural cycle]] — `DOCTRINE AS DATA` — Acquire → Preserve evidence → Compile corpus → Establish state → Project → Compute → Investigate → Act → Observe.
- [[Seven doctrine rules and their enforcement]] — `BOUND · TESTED` — Evidence is not state; canonical state is not the entire corpus; inquiry is allowed to be wrong; computation produces derived objects; projection never mutates its source; identity survives representation; every promoted result crosses an explicit validation boundary.
- [[Semantic separations kept in every surface]] — `HOUSE VOCABULARY` — Evidence ≠ assertion.
- [[Verification tiers V0–V5]] — `V0, V1 REACHED` — V0 provenance and V1 deterministic reproducibility are reached.

### Runtimes, local stores and verification

- [[Runtimes and local stores]] — `NODE · RUST · PYTHON` — Node.js/TypeScript is the facade and workbench; Rust is the deterministic notation state kernel; Python runs the pinned GAT engine.
- [[Storage (polyglot persistence)]] — `DECLARED · NOTHING INSTALLED` — Six classes of information ask for six kinds of store; the technologies named are candidates and none is installed.
- [[Verification harness]] — `GREEN ON THE BRANCH` — Vitest unit and component tests, three Playwright configurations (regular desktop and Pixel 7, production rail with a real worker, real Rust kernel), axe accessibility checks, horizontal-overflow guards and regenerated screenshots.
- [[Sibling repositories and vendored contracts]] — `PINNED · READ-ONLY` — The control-plane result-manifest and canonical-URI code is vendored verbatim from Notations-Ecosystem at a pinned commit, used only by tests.

### World: sources, rights and recorded material

- [[Source inventory and connection queue]] — `21 INVENTORIED · 1 CONNECTED` — Twenty-one historical registry entries ranked by expected market value, with readiness separate from rank.
- [[FMCSA Company Census connector]] — `BOUNDED · LIVE-QUALIFIED · OPERATOR ONLY` — The first real source.
- [[Samsara vehicle GPS connector]] — `BOUNDED · CREDENTIAL-GATED · NOT RUN HERE` — An operator-only capture of vehicle GPS observations: collection is off unless the operator process sets the flag with a scoped token.
- [[Recorded dataset candidate (Boreas)]] — `CANDIDATE · NOT_IMPORTED` — The first qualification candidate for an independently checkable recorded-data case: Toronto traversals with camera, LiDAR, GNSS/inertial evidence and calibrations.
- [[Demonstration corpus and Carrier fixtures]] — `FIXTURE · SYNTHETIC` — The Caravan specialty-cargo corpus (three releases, nineteen records, two retractions, seven sources with rights) and the synthetic Carrier JSON contract drive every screen and the local rail's demonstration.

### Acquisition Fabric — world → evidence

- [[Source rights and use evaluation]] — `IMPLEMENTED` — One exact decision per purpose, operation and audience at one instant: ALLOWED, APPROVAL_REQUIRED or DENIED, with reasons.
- [[Evidence capture and receipts]] — `IMPLEMENTED` — Bytes are bound to a source only under an allowed use, content-addressed, with a capture receipt and `sourceTruthClaimed: false`.
- [[Source capture store and readback]] — `IMPLEMENTED · READ-ONLY ROUTE` — The operator's qualification root holds real captures.
- [[Acquisition area of the workbench]] — `SURFACE` — The navigation area for coverage, sources, collection attempts and failures: the acquisitions section of the candidates rail and the evidence list across cases.

### Corpus Fabric — evidence → candidates, releases, products

- [[Local production rail]] — `IMPLEMENTED · OPT-IN · LOOPBACK` — One command contract drives registration, capture, fixed normalization and candidate-build assembly with structured stage receipts, historical retry, conflict detection, quarantine of invalid input and request-bound failed-run integrity.
- [[Normalization adapters]] — `TWO ADAPTERS` — A fixed Caravan Carrier adapter and the FMCSA Census normalization turn captured bytes into typed candidates; every derived quantity names its method and version and every run carries the adapter digest.
- [[Candidate builds and comparison]] — `IMPLEMENTED · UNADMITTED` — Exact, inspectable candidate builds assembled from normalizations, each member carrying its derivation decision, source class and knowledge time; two builds can be compared by source-scoped membership and immutable references.
- [[Corpus object model]] — `THE PRODUCT · FIXTURE-BACKED` — Releases with knowledge cutoffs and build records; records with stable `notation://` identity, subject, predicate, value, unit, basis, uncertainty bounds, validity bounds, two clocks, evidence class and provenance; retractions; rights schedules; governance.
- [[Correction and recall machinery]] — `MODELLED · LEDGER SPECIFIED AND EMPTY` — For one retraction, which derived artifacts a corrected fact taints, and which cannot be decided.
- [[Identity core and cross-line join]] — `MODELLED · JOIN ABSENT` — One identity core, three per-line identifier families, and the absent cross-line join with what it needs.
- [[Certified release manifest and production record]] — `COMMITTED · UNSIGNED` — Each release carries a manifest (build, release digest, record count, retractions applied, sources with rights, certification, governance) whose commitment is the digest of its canonical JSON, and a production record across the twelve stages.
- [[Information products]] — `SPECIFIED · FIXTURE-COVERED` — The first information product: a customer question, subjects, fields with evidence requirements and the corpus's coverage of them, freshness by release, permitted uses, correction as the same question at two knowledge times, and the delivered-record contract.

### State Fabric — validation, admission and canonical versions

- [[Admission authority]] — `ABSENT · MILESTONE PRIORITY` — The explicit validation boundary that turns a candidate into an admitted canonical version.
- [[Notation state kernel (Rust)]] — `PRESENT · LOCAL · AUTHORED STATE ONLY` — A deterministic Rust command and history core for authored notation objects and explicit relationships: the frontend sends commands over a loopback API; Rust replays and validates; Save writes a versioned local snapshot.
- [[Three states of information (E, K, I)]] — `DOCTRINE AS DATA` — Evidence (what was observed; append-only, content-addressed), Canonical (admitted under a schema as a version; immutable per version), Inquiry (what one investigation manipulates; allowed to be wrong; promotion crosses validation).

### Compute / Decision Fabric — derived objects, never truth by default

- [[Recorded observation replay]] — `CONTRACT + COMPILER · SYNTHETIC MANIFEST` — A strict manifest of frames, sessions, clocks with alignments, sensors, calibrations with validity, poses with stamps, operator associations and observations with point estimates; the compiler places each observation or states exactly why it is unplaced.
- [[Registration and access geometry]] — `IMPLEMENTED · SYNTHETIC PREVIEW` — A bounded 3D rigid weighted-least-squares estimator with local conditional covariance and held-out check points, plus explicit access geometry: Cartesian distance, permitted-network shortest paths and closure scenarios.
- [[Spatial inquiry (floor access)]] — `IMPLEMENTED · MANUAL ANNOTATION` — How does opening or closing one explicit passage change access through one floor? A validated layout with spaces and passages, a scenario, and a directed-room-access analysis with CONFIRMED, POSSIBLE_ONLY and DISCONNECTED reachability.
- [[Clearance value-of-information experiment]] — `IMPLEMENTED · SYNTHETIC PREVIEW` — Exact finite Bayesian decision analysis over a declared joint model: expected decision-loss reduction minus acquisition cost for a measurement, without executing any action.
- [[Scalar Gaussian benchmark]] — `BASELINE · SYNTHETIC` — One conventional scalar linear-Gaussian estimator with an evidence-bound benchmark and held-out-reference metrics: the baseline every later model must beat on the same evidence.
- [[GAT IFC audit instrument]] — `PINNED ENGINE · SPECIALIST` — A preserved IFC (Industry Foundation Classes) building-model artifact is audited by the exact pinned GAT engine; the original report, a separate safe projection and an immutable execution receipt keep distinct identities.
- [[Scientific model roles]] — `DOCTRINE` — Different methods answer different questions: factor graphs first for estimation, then physics-informed and operator models where they earn their place; a prediction never grants canonical admission or distribution rights.

### Projection Fabric — representations, APIs and instruments

- [[Projection spec and compiler]] — `IMPLEMENTED · READ-ONLY` — One closed spec (`payload.projection-spec.v1`) and one router; the compiler works over one exact fixture release, enforces rights, visibility and time bounds, returns detached copies and states `sourceMutated: false`.
- [[Corpus feed API v1]] — `IMPLEMENTED · FIXTURE-BACKED` — Releases, records, manifests, as-of queries, retractions and rulings as JSON over the same payloads the screens use; the stream page shows the feed URL that reproduces every answer.
- [[MCP server and tools]] — `IMPLEMENTED · STDIO` — Eight Model Context Protocol tools wrap the same payloads as the feed: list and get releases, manifests, records, as-of queries, retractions and rulings.
- [[Earth Twin (CesiumJS)]] — `PRESENT · KEYLESS · OFFLINE` — A CesiumJS globe served from this origin with bundled imagery on the WGS84 ellipsoid, computed day and night at the twin's world time, and one point per geodetic position declared as a corpus record; the inspector names every layer's source and state.
- [[Ruling projections and result manifests]] — `IMPLEMENTED · FIXTURE CASES` — The same case bundle projected for sponsor, internal reviewer, named counterparty or public; rulings commit to a result manifest with a commitment, evidence root and anchor, exported machine-readably with an API example.

### Application layer — the Payload OS workbench (Next.js)

- [[App shell, navigation and design system]] — `IMPLEMENTED` — One shell: a top bar that says where you are, the domain-product control, five activity areas (Acquisition, Corpus, Notations, Inquiry, Coordination) declared as data, a center surface and an inspector pattern with responsive sheets.
- [[Production path workspace]] — `IMPLEMENTED · REAL RAIL OR FIXTURE MODE` — One continuous path in seven stages (source, acquisition, normalization, candidate build, inspection, notation, release), each with a state from a closed vocabulary derived from what the rails produced, with recovery actions and an inspector.
- [[Candidates rail]] — `IMPLEMENTED` — The candidate-production rail before admission as an observable process: collection, extraction, normalization, candidate readiness; every metric names the field it is read from and every instant its clock; where coverage stops and what would change it.
- [[Notation workspace]] — `IMPLEMENTED · LOCAL AUTHORING` — Author, relate and preserve interpretations against the Rust kernel: drafts survive navigation and reload, three states told apart (unapplied, previewed, saved), undo and redo, conflict recovery, capacity, and an evidence-reference panel whose persistence waits for the backend.
- [[Case workbench]] — `IMPLEMENTED · FIXTURE CASES` — The optional prescribed control over the corpus: CASE → USE → CLAIMS → EVIDENCE → CHECKS → RULING → REMEDIATION → RELEASE → MONITORING, with staged intake, a decision rail, lineage from artifact to ruling, bitemporal replay and admission profiles.
- [[Observation replay surface]] — `IMPLEMENTED · SYNTHETIC PREVIEW` — The recorded-observation contract made understandable: a linked frame diagram (sensor → calibration → body → pose → world), a timeline of clock alignments, calibration validity, stamps and pose mismatches, an observation register, and an inspector connecting a selection to its evidence, estimate, placement and comparisons.
- [[Inquiry instrument pages]] — `IMPLEMENTED · SYNTHETIC PREVIEWS` — Spatial Inquiry (/spatial), Registration and access (/compute/registration), Clearance (/compute/clearance) and the Earth Twin (/earth): each a page over one compute or projection contract, marked as synthetic preview where it is one.
- [[Corpus and product pages]] — `IMPLEMENTED` — /product (the operating model as data), /products, /releases and release detail with certification and rights, /stream (as-of), /retractions and /api (endpoints with live examples).

### Coordination layer — participants, requests, results

- [[Stable (agents and apparatus)]] — `IMPLEMENTED · LOCAL REGISTRATION` — Definitions of each participant: purpose, authority, runtime, version, domains, input and output contracts, capabilities and references; synastry is the declared connections between contracts with missing inputs stated.
- [[Board (messages and acknowledgements)]] — `IMPLEMENTED · LOCAL POSTING` — Shared messages by topic and kind: requests, handoffs, blockers, results and acknowledgements, directed or broadcast, with replies and release context.
- [[Coordination ledger and contract]] — `IMPLEMENTED · payload.coordination.v1` — The contract behind stable and board: validated commands, references restricted to the current scope, directed contract connections, an inbox, a seed, and two thin clients (Python and JavaScript).

## Overview diagram

```mermaid
flowchart TB
  subgraph firm["Firm, domain products and customers"]
    direction LR
    firm["Notation Systems and Payload OS"]
    products["Domain products (Caravan, Tradewind, Landshark)"]
    customers["Customers and distribution channels"]
  end
  subgraph doctrine["Doctrine and governance (applies to every layer)"]
    direction LR
    fabrics["Five fabrics and the architectural cycle"]
    rules["Seven doctrine rules and their enforcement"]
    separations["Semantic separations kept in every surface"]
    tiers["Verification tiers V0V5"]
  end
  subgraph runtime["Runtimes, local stores and verification"]
    direction LR
    runtimes["Runtimes and local stores"]
    verification["Verification harness"]
    siblings["Sibling repositories and vendored contracts"]
  end
  subgraph world["World: sources, rights and recorded material"]
    direction LR
    inventory["Source inventory and connection queue"]
    fmcsa["FMCSA Company Census connector"]
    samsara["Samsara vehicle GPS connector"]
    boreas["Recorded dataset candidate (Boreas)"]
    fixtures["Demonstration corpus and Carrier fixtures"]
  end
  subgraph acquisition["Acquisition Fabric  world → evidence"]
    direction LR
    rights["Source rights and use evaluation"]
    capture["Evidence capture and receipts"]
    capturestore["Source capture store and readback"]
    acqarea["Acquisition area of the workbench"]
  end
  subgraph corpus["Corpus Fabric  evidence → candidates, releases, products"]
    direction LR
    rail["Local production rail"]
    normalization["Normalization adapters"]
    candidates["Candidate builds and comparison"]
    corpusmodel["Corpus object model"]
    manifest["Certified release manifest and production record"]
    infoproducts["Information products"]
  end
  subgraph state["State Fabric  validation, admission and canonical versions"]
    direction LR
    admission["Admission authority"]
    kernel["Notation state kernel (Rust)"]
    states["Three states of information (E, K, I)"]
  end
  subgraph compute["Compute / Decision Fabric  derived objects, never truth by default"]
    direction LR
    replay["Recorded observation replay"]
    registration["Registration and access geometry"]
    spatial["Spatial inquiry (floor access)"]
    clearance["Clearance value-of-information experiment"]
    benchmark["Scalar Gaussian benchmark"]
    gat["GAT IFC audit instrument"]
    modelroles["Scientific model roles"]
  end
  subgraph projection["Projection Fabric  representations, APIs and instruments"]
    direction LR
    projspec["Projection spec and compiler"]
    feed["Corpus feed API v1"]
    mcp["MCP server and tools"]
    earth["Earth Twin (CesiumJS)"]
    workbenchproj["Ruling projections and result manifests"]
  end
  subgraph app["Application layer  the Payload OS workbench (Nextjs)"]
    direction LR
    shell["App shell, navigation and design system"]
    productionpath["Production path workspace"]
    candidatesrail["Candidates rail"]
    notations["Notation workspace"]
    cases["Case workbench"]
    replaysurface["Observation replay surface"]
    inquirysurfaces["Inquiry instrument pages"]
    corpussurfaces["Corpus and product pages"]
  end
  subgraph coordination["Coordination layer  participants, requests, results"]
    direction LR
    stable["Stable (agents and apparatus)"]
    board["Board (messages and acknowledgements)"]
    ledger["Coordination ledger and contract"]
  end
  inventory -- "first connected source" --> fmcsa
  inventory -- "second bounded connector" --> samsara
  fmcsa -- "retained bytes  receipts" --> capturestore
  samsara -- "credential-gated capture (not run here)" --> capturestore
  boreas -- "target recorded manifest (NOTIMPORTED)" --> replay
  fixtures -- "Carrier bytes for the demonstration" --> rail
  fixtures -- "demonstration releases" --> corpusmodel
  rights -- "ALLOWED / APPROVALREQUIRED / DENIED" --> capture
  capture -- "ACQUIRE" --> rail
  capturestore -- "read-only readback" --> productionpath
  capture -- "artifacts listed" --> acqarea
  rail -- "NORMALIZE" --> normalization
  normalization -- "BUILDCANDIDATES" --> candidates
  fmcsa -- "census normalization" --> normalization
  candidates -- "UNADMITTED candidates → (absent boundary)" --> admission
  admission -- "admitted versions (target)" --> corpusmodel
  corpusmodel -- "certified release" --> manifest
  corpusmodel -- "coverage computed" --> infoproducts
  kernel -- "loopback command API" --> notations
  notations -- "evidence references → admission contract (next)" --> admission
  states -- "I → K crosses validation" --> admission
  capture -- "audits preserved IFC artifacts" --> gat
  capture -- "exact evidence references" --> spatial
  replay -- "rows and comparisons" --> replaysurface
  registration -- "synthetic preview" --> inquirysurfaces
  spatial -- "retained analyses" --> inquirysurfaces
  clearance -- "synthetic preview" --> inquirysurfaces
  modelroles -- "factor graphs first" --> replay
  benchmark -- "baseline to beat" --> modelroles
  corpusmodel -- "one exact release" --> projspec
  projspec -- "GLOBE spec, declared positions" --> earth
  manifest -- "manifests and commitments" --> feed
  corpusmodel -- "releases, records, as-of, retractions" --> feed
  feed -- "same payloads" --> mcp
  corpusmodel -- "evaluated against release and build" --> cases
  cases -- "projected per viewer" --> workbenchproj
  earth -- "/earth" --> inquirysurfaces
  rail -- "runstages, receipts, inspect" --> productionpath
  candidates -- "process view" --> candidatesrail
  feed -- "the same payloads on screen" --> corpussurfaces
  shell -- "Corpus area" --> productionpath
  shell -- "Notations area" --> notations
  shell -- "Inquiry area" --> cases
  shell -- "Coordination area" --> stable
  ledger -- "definitions" --> stable
  ledger -- "messages" --> board
  board -- "review worker inspects one exact build" --> candidates
  inquirysurfaces -- "feedback re-enters as evidence, never as state" --> capture
  firm -- "one platform, three domains" --> products
  products -- "distribution" --> customers
  feed -- "APIs, feeds, MCP tools" --> customers
  rules -- "architecture tests" --> verification
  fabrics -- "E / K / I" --> states
  siblings -- "vendored parser pins the contract" --> manifest
  runtimes -- "Rust" --> kernel
  runtimes -- "Python, pinned" --> gat
  classDef absent fill:#7a1f1f,stroke:#e06666,color:#fff;
  class admission absent;
```

## Brainstorm starters

- [ ] The red card. What does the admission contract take and return, and which fabric owns its receipt?
- [ ] The next real source after FMCSA: rights first, adapter second, product predicate third.
- [ ] The first recorded manifest for replay, and the acceptance test for "independently checkable".
- [ ] Which synthetic previews become retained experiments with a shared request → run → inspector shell?
- [ ] Which prose separations should become closed vocabularies in contracts?
- [ ] Where does "Act" live for a corpus company, and should anything here act at all?

## Provenance of this map

Drawn from the repository's own documents and code: `docs/SYNTHESIZED_ARCHITECTURE.md`, `docs/ARCHITECTURE.md`, `docs/UX_ARCHITECTURE.md`, `docs/ECONOMIC_ARCHITECTURE.md`, the per-increment docs under `docs/`, `src/domain/doctrine.ts`, `src/components/shell/nav.ts` and the route handlers under `src/app/api`. It describes the present state; a card's state line is the claim, and the note's "Where it lives" is where to check it.
