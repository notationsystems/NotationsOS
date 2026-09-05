# Synthesized architecture

This document records the supplied synthesis of the earlier architecture: one maintained information substrate, five fabrics and several explicitly non-authoritative projection instruments. It describes target responsibilities and distinguishes them from the bounded local implementation. [Economic architecture](ECONOMIC_ARCHITECTURE.md) and [Company mandate](COMPANY_MANDATE.md) retain the business and product boundaries.

## Firm and product structure

Notation Systems builds and operates provenance-bearing computational corpora for the physical economy. Acquisition, scraping, extraction, normalization, identity, ontology, computation, storage, indexing, verification, correction and recall are internal means of production. The corpora are finished information inventory; APIs, feeds, reports, workbenches and MCP tools distribute it. Customers may apply their own inference directly to those streams.

The customer categories remain physical-economy brokers, asset and portfolio managers, and insurance and financing firms. The economic engines remain data systems/products, hosting and compute over authorized corpora, and separately governed principal-capital trading/speculation. Shared infrastructure does not grant unrestricted sharing of customer evidence, workloads or proprietary capital intelligence.

```text
Notation Systems
└─ Payload OS — shared information-production and operating platform
   ├─ Caravan — logistics, freight, cargo and supply-chain movement
   ├─ Tradewind — markets, instruments, pricing and risk
   └─ Landshark — parcels, zoning, entitlements and development state
```

The synthesis calls historical `PayloadOS` an ancestor of the five fabrics. That historical mapping is retained below; it is not an instruction to rename this repository's current shared **Payload OS** platform or create a fourth public API. Domain ownership, existing API routes and historical entity ids/digests remain unchanged until an explicit migration or rename is approved.

## Five fabrics over one substrate

The architectural cycle is:

```text
Acquire → Preserve Evidence → Compile Corpus → Establish State
→ Project → Compute → Investigate → Act → Observe
```

These are responsibility boundaries, not a claim that every stage is implemented or deployed. The fabrics share provenance-bearing references; they are not five separate customer databases.

| Fabric | Responsibility | Boundary |
|---|---|---|
| Acquisition Fabric | World → evidence: authorized files, documents, APIs, observations, telemetry, operations and other source material | Preserve source, bytes, time and use rights; observation does not directly mutate canonical state |
| Corpus Fabric | Evidence → computational corpora: normalization, identity, ontology, units, temporal reconciliation, uncertainty, indexes and explicit relationships | The Computational Commons is the organized corpus substrate, not a particular database product; preserve evidence alongside derived information |
| State Fabric | Corpus → candidate → validation → canonical version: schema, `CanonicalState`, `VersionStore` and `StateDelta` | Admit changes through explicit validation; canonical state is not the whole corpus |
| Compute/Decision Fabric | State/context → model → derived result → decision: `InquiryState`, Morpho, STE/SCL/SIL and decision machinery | Inquiry may contain hypotheses, temporary graphs, scenarios and errors; derived output is not automatically canonical truth |
| Projection Fabric | Selected corpus/state/inquiry → human- or machine-operable representation: APIs, reports, graphs and spatial/structural views | A projection changes representation, not source identity or authority; engines do not own separate authoritative state |

Feedback returns to the Acquisition Fabric as an observation or evidence-bearing input. It does not bypass the validation boundary into canonical state. A visual discovery may become a derived observation in inquiry, then a candidate for validation; drawing or selecting an object does not promote it.

## Seven doctrine invariants

1. Evidence is not state.
2. Canonical state is not the entire corpus.
3. Inquiry is allowed to be wrong.
4. Computation produces derived objects, not truth automatically.
5. Projection never mutates its source.
6. Identity survives representation changes.
7. Every promoted result crosses an explicit validation boundary.

The accompanying operational rule is: **Build shared information before multiplying reasoning processes.**

These rules apply across all three domain products. Visual adjacency is not a semantic edge; geographic proximity is not a causal relationship; embedding similarity is not a canonical relation. Cross-domain connections require explicit evidence-bearing mappings rather than matching labels or shared screen positions.

## Projection instruments, not information systems

The assigned roles below are architectural choices from the supplied synthesis. Of the three engines, CesiumJS is now installed and rendering as the [Earth Twin](EARTH_TWIN.md), keyless and offline, fed no fixture geometry yet; kepler.gl and Three.js remain routed to, not installed.

| Instrument | Assigned question and coordinate meaning | Target role |
|---|---|---|
| kepler.gl | Where are the patterns across geospatial observations? | Analytical cartography: distributions, density, flows and geographic exploration |
| CesiumJS | Where is the physical system in geographic space? | Geodetic/world realization of assets, infrastructure and movement |
| Three.js | How is the system structured in physical or computational space? | Intrinsic geometry, arbitrary model space, scientific structures and graph/field representations |

The same referent keeps its identity across a map point, geographic object, structural view, graph node and API record. The corpus determines which projections are useful; a product need not instantiate every engine. No graph layout or scientific geometry should be represented as a geographic position without an explicit transform and evidence for that interpretation.

Notation Workbench is the target interaction environment above these instruments. MAP, GLOBE, STRUCTURE, GRAPH, STATE, TIME, EVIDENCE and COMPLEXITY describe possible user modes; they are not eight implemented screens. The user chooses an interpretation, while a shared `ProjectionSpec` declares the selected source/version, records, temporal bounds, coordinate semantics, representation and transformation lineage. See [Projection fabric](PROJECTION_FABRIC.md) for the narrower implemented contract.

Meaning → state → projection → GPU remains the direction of authority. WebGPU is an optional rendering/compute target, not the data model or source of knowledge.

## Runtime allocation

These are target responsibilities, not claims that all language services exist today:

| Runtime | Responsibility | Must not imply |
|---|---|---|
| Node.js / TypeScript | Application/API facade, request routing, session/workspace state, projection requests, synchronization and stream mediation | Canonical scientific truth, ontology authority or heavy scientific computation; planned authentication/transport services are not implemented merely because Node is present |
| Rust | Deterministic core systems, graph operations, compilation and kernels | A production canonical state kernel already exists in this repository |
| Python | Acquisition adapters, scientific workflows and models | A model output is admitted truth or an automatically authorized source |
| C++ and C/CUDA where appropriate | Performance-critical scientific/numerical kernels and bounded simulation/computation | A GPU or native runtime defines source identity, policy or corpus meaning |
| SQL / PostgreSQL / PostGIS | Durable structured operations and spatial persistence | The database itself is the information product, or production storage is already deployed |
| Browser | Visualization, selection and interaction | Renderer state is canonical domain state |

`WorkbenchSession` would hold extrinsic interaction state such as selected entities, active view, visible layers, filters, camera and UI preferences. `InquiryState` would hold selected evidence, hypotheses, temporary graphs, calculations, annotations and scenarios. Neither becomes `CanonicalState` through ordinary UI updates. A proposed `CandidateDelta` still crosses validation before admission.

Current local TypeScript implementations perform bounded byte/policy checks, deterministic Carrier parsing, candidate-manifest assembly and historical inspection. A small Rust [notation state kernel](LOCAL_NOTATION_STATE_KERNEL.md) now supplies stable authored-object IDs, explicit relations, validated commands and reversible history, consumed through the web frontend and versioned local storage. This does not make either application runtime an authoritative scientific engine or establish production canonical state. The local notation kernel and proposed canonical State Fabric admission machinery are distinct from the sibling Notations Kernel's portable `Artifact`/`Claim`/`Operator`/`VerificationEnvelope` grammar.

## Historical concept mapping

These mappings preserve the supplied synthesis without silently promoting old concepts into running services:

| Historical concept | Home or interpretation |
|---|---|
| Annotated Systems Archive | Evidence and Corpus Fabric |
| Computational Commons | Corpus Fabric and its organized information inventory |
| Oracle | Query/compute service role |
| Odyssey | Exploration/inquiry workflow |
| Librarian | Operator/interface role |
| PayloadOS | Historical ancestor wording in the synthesis; current Payload OS remains the shared platform for Caravan, Tradewind and Landshark |
| DAF | Acquisition Fabric |
| EvidencePool | Evidence substrate |
| Immutable graph | Structural representation of the corpus, not the whole corpus or a universal canonical database |
| InquiryState | Compute/Decision Fabric; not implemented here |
| CanonicalState | State Fabric; production canonical state is absent |
| Morpho | Representation/compute intermediate representation; not implemented here |
| STE | Deterministic execution responsibility |
| SCL | High-performance scientific computation responsibility |
| SIL | Models, ML and optimization responsibility |
| FEP | Resource/control policy role |
| Model Complexity | Cross-cutting representation audit |
| Graph-State Decision Fabric | Decision subsystem |
| Kepler / Cesium / Three.js | kepler.gl analytical geography / CesiumJS geodetic world / Three.js structural-scientific projection |
| Node.js | Workbench/application runtime |
| Postgres/PostGIS | Persistence implementation |
| Rust / Python | Deterministic core / acquisition and scientific implementation |
| SP1/ZK | Optional verification backend, not required or claimed by this increment |
| Mistral | Deferred; no architectural role assigned |

## Implemented boundary

The [local production API](LOCAL_PRODUCTION_WORKFLOW.md) connects Acquisition and candidate organization through explicit registered inputs, stage receipts and historical inspection. The [GAT IFC inspector](GAT_INSPECTOR.md) is a pinned Compute/Decision instrument over preserved evidence, with a separate safe Projection response. Its analysis model does not become State Fabric canonical authority; the Rust notation kernel remains authored state only. Neither local path activates a release or public customer execution.

The local acquisition, normalization and candidate-build rails and the manually launched coordination reviewers remain as documented. Their unadmitted local files do not become a released corpus or a source for the fixture projection endpoint. The public corpus/workbench surfaces remain demonstration fixtures.

The Projection Fabric supplies a bounded, read-only specification and preview over exact fixture releases, not installed kepler.gl, CesiumJS or Three.js instances. The first small state-kernel milestone is now implemented locally: `/notations` supports create → update → undo → save → page reload through the Rust command kernel. Its stable IDs and authored relationships do not confer source truth or admission authority. Bevy ECS is deferred; there is no ECS, renderer or simulation dependency in this kernel.

`InquiryState`, canonical domain-state admission, Morpho, scientific compute runtimes and spatial renderer adapters remain target architecture, not implemented capabilities. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
