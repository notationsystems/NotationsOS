# Architecture carried forward

The founder's synthesis (2026-09-05) of every earlier iteration, as it binds this repository. `src/domain/doctrine.ts` holds the same content as data; `/product` renders it; `src/domain/doctrine.test.ts` and `src/architecture.test.ts` keep it honest. The mandate in [Economic architecture](ECONOMIC_ARCHITECTURE.md) and [Company mandate](COMPANY_MANDATE.md) is unchanged by this document; this is how the machinery is arranged underneath it.

## The system

```
Acquire → preserve evidence → compile corpus → establish state → project → compute → investigate → act → observe
```

with provenance, lineage, quality, policy and replayability around the whole of it, and observation returning to acquisition, never directly into state.

## Five fabrics

| # | Fabric | Transforms | In this repository |
|---|---|---|---|
| 1 | Acquisition | world → evidence | The local evidence rail: declared policy, exact INGEST decision, content-addressed bytes, receipt. No connector, frontier, crawler or change detector. |
| 2 | Corpus | evidence → computational commons | Carrier normalization after a separate DERIVE decision; UNADMITTED, UNRESOLVED candidates or a quarantine; time-bounded candidate builds. Demonstration releases stand in for compiled inventory. |
| 3 | State | candidate → validation → version | Absent as a kernel. Admission is a separate act nothing here performs. The deterministic state kernel is specified outside this repository. |
| 4 | Compute and decision | state → model → result → decision | The ruling workbench, one optional application over the corpus. No model, simulation or optimizer runs here. |
| 5 | Projection | state or inquiry → operable representation | The feed API, MCP tools, stream and pages. `ProjectionSpec` and its router exist and are tested; kepler.gl, CesiumJS and Three.js are named, not installed. |

## Three states of information

| State | Meaning | Invariants | Here |
|---|---|---|---|
| Evidence, E | what has been observed | append-only, content-addressed, a record of what a source said | evidence artifacts with capture digests and receipts; acquisitions on the rail |
| Canonical, K | what has been admitted under a schema and a validation regime, as a version | immutable per version, schema-constrained, deterministic identity | released records in certified releases; admission absent |
| Inquiry, I | what one investigation is manipulating; allowed to be wrong | exploratory, mutable, never a source of truth, promotion crosses validation | the intake draft; candidates on the rail; no general inquiry workspace yet |

Corpus ≠ canonical state. Corpus ≠ graph. Evidence ≠ assertion. The identity chain is kept distinct, with the morphisms between its members preserved: evidence ≠ observation ≠ claim ≠ canonical state ≠ representation ≠ model ≠ execution ≠ verification.

## Doctrine

1. Evidence is not state.
2. Canonical state is not the entire corpus.
3. Inquiry is allowed to be wrong.
4. Computation produces derived objects, not truth automatically.
5. Projection never mutates its source.
6. Identity survives representation changes.
7. Every promoted result crosses an explicit validation boundary.

And one operational rule: build shared information before multiplying reasoning processes.

Each rule's enforcement here and the tests that prove it are listed in `src/domain/doctrine.ts` and on `/product`. Rules 5, 6 and 7 gained direct tests in this cycle (`src/architecture.test.ts`): the fixture corpus is byte-identical before and after every feed payload and every MCP tool; a record's `notation://` identity is the same string in the records feed, the as-of answer and the tool results; browser and page layers import only types and the pure source-use evaluator from `src/data-os`, and the rails import nothing from above them.

## Projection fabric

Three instruments answer three different questions over the same corpus; none of them is a data store and none of them derives a relation from where things land.

| Engine | Question | Role |
|---|---|---|
| kepler.gl | Where is the pattern? | analytical cartography over many geospatial observations |
| CesiumJS | Where does this exist, and how does it move through geographic space and time? | geodetic realization on a WGS84 globe |
| Three.js | How is the system constituted, in whatever space it lives in? | structural and computational geometry, Morpho |
| table | What are the records? | the workbench listing |

`ProjectionSpec` names the source (a corpus release, a canonical version or an inquiry state), the selection, the coordinate semantics (GEODETIC, INTRINSIC_PHYSICAL, FEATURE_SPACE, GRAPH_LAYOUT, MODEL_SPACE, NONE), the representation, the intent (PATTERN, REALIZATION, STRUCTURE, LISTING) and the provenance needed to reproduce it. `routeProjection` is pure and total: geodetic patterns over points, lines or polygons go to kepler.gl; anything else geodetic goes to CesiumJS; anything not geographic goes to Three.js; listings and tables go to the table. The plan carries the referents unchanged, `derivesRelations: false` and `mutatesSource: false`.

Node.js is the workbench and application runtime, owning sessions, transport and projection requests, never canonical state. Extraction is an interface, not a vendor: no model vendor has an architectural role here.

## Verification tiers

| Tier | Name | Here |
|---|---|---|
| V0 | provenance | reached |
| V1 | deterministic reproducibility | reached: digests, captures, manifests and the production demonstration regenerate under test |
| V2 | signed releases and manifests | not reached: commitments exist, nothing signs them |
| V3 | independent recomputation | not reached: verification is internal recompute, stated as such |
| V4 | cryptographic execution attestation | not reached |
| V5 | formal or zero-knowledge proof | not reached, and selective by design |

## What the earlier iterations became

| Earlier concept | Where it lives now |
|---|---|
| PayloadOS as the company | the shared production layer, Payload OS, beneath the domain products |
| DAF, EvidencePool | acquisition fabric, evidence substrate; here the local evidence rail |
| Archive, Odyssey, Oracle, Librarian | corpus vault, query engine, operator interface: functions kept, labels retired |
| Computational Commons, InquiryState | corpus fabric and the inquiry state; the intake draft is the first instance here |
| Deterministic State Architecture | the state fabric's kernel, specified outside this repository |
| Morpho, STE/SCL/SIL, Model-Complexity, FEP/SCG | compute fabric, representation audit, control plane; none present here |
| Tradewind, LANDSHARK, Caravan | products over the domain corpora |
| Kepler, Cesium, Three.js, Node.js | the projection fabric and its runtime |
| Mistral | no architectural role |
| blockchain, RWA | not core; an external commitment adapter if a customer case ever justifies it |
