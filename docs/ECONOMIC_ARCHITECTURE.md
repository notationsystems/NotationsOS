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

## Rules for this repository

- Lead with data systems and compute. Public-facing text does not lead with principal capital.
- Do not call any output a warrant. Ruling, assurance or admission decision describes what the current system can sell.
- The honest present tense: this repository holds a demonstration corpus with its feed, MCP tools and a fixture-only ruling workbench. It has no live source connectors, production storage or identity, deployed customer delivery, managed execution, reports, or completed pilot.

## Earlier formulation (2026-09-04), retained for detail

Notation Systems builds provenance-bearing computational corpora: governed, time-bounded information inventory that can be inspected, computed against, corrected, and distributed with its evidence, method lineage, rights, uncertainty, and release history intact.

The firm monetizes this shared computational substrate through two operating businesses:

1. **Data systems and intelligence products.** Notation Systems licenses computational corpora, APIs, feeds, decision workbenches, reports, and vertical applications built on those corpora.
2. **Provenance-preserving compute.** The firm operates managed storage, models, simulations, agents, and computational workloads over authorized corpus releases, allowing customers to execute confidential work without losing lineage, policy, or recallability.

Over time, a separately governed principal-capital activity may deploy the firm's own capital using lawfully acquired and policy-permitted proprietary intelligence. This activity is distinct from customer products: it has separate information-access controls, capital allocation, risk management, reporting, and conflict governance. Customer evidence remains tenant-isolated; customer workloads remain confidential; proprietary strategies cannot draw on restricted customer information.

The underlying production system is shared. The customer-facing API, feed, report, agent, or workbench is not the finished good itself; it is the distribution mechanism for a certified corpus release. The manufacturing analogy makes the moat legible: scraping is extraction; it is not the business. The durable asset is the continuously maintained corpus plus its identity mappings, release history, corrections, and computable interfaces.

## How this repository reflects it

| Statement | Where it is implemented | Presence |
|---|---|---|
| Governed, time-bounded information inventory with evidence, method lineage, rights, uncertainty and release history intact | `src/domain/corpus.ts`, `src/fixtures/caravan/release.ts`; `/releases` | Demonstration fixture |
| The production system: acquisition, extraction, normalization, identity, ontology, computation, storage, indexing, verification, release, correction, recall | `ProductionStage` in `src/domain/corpus.ts`; `BuildRecord.stages` on every release; `/releases/:id` production record; `/product` | Demonstration fixture: storage is stated as not run, computation as not applicable |
| Authorized geospatial, remote-sensing, operational and scientific source material | `RightsSchedule.materialClass`; the material column of the rights matrix; `/product` | Operational and scientific in the demonstration corpus; geospatial and remote sensing not represented, and stated so |
| APIs, feeds, reports, workbenches and MCP tools distribute the inventory | `/api/v1` feed, `/stream`, `src/mcp/tools.ts` + `src/mcp/server.ts` (`npm run mcp`), the Caravan workbench | Feed, stream, MCP tools and workbench as fixture; reports absent |
| Three customer categories: brokers, asset and portfolio managers, insurance and financing firms | `CUSTOMER_CATEGORIES` in `src/domain/product.ts`; `/product` | Stated; the Caravan fixture is broker-shaped |
| The four-step economic architecture and the separation of customer evidence, customer workloads and proprietary-capital activity | `ECONOMIC_ARCHITECTURE` and `THESIS.separation` in `src/domain/product.ts`; `/product`; `Corpus.governance` | Stated; separation recorded as governance and prohibited uses |
| The product architecture tree | `src/domain/domains.ts`; `/product` | Caravan as fixture; Tradewind and Landshark as disabled slots |
| Certified release manifests | `src/fixtures/releaseManifest.ts`, `Certification` on every release, commitment stamped and drift-tested; `GET /api/v1/releases/:id/manifest` | Demonstration fixture; verification is internal recompute, never independent |
| Push retractions when a fact changes | `Retraction`, `/retractions`, `GET /api/v1/retractions?since=` | Demonstration fixture |
| As-of answers | `queryAsOf`, `/stream`, `GET /api/v1/releases/:id/as-of` | Demonstration fixture |
| Machine-readable uncertainty and validity bounds | `CorpusRecord.uncertainty`, `validFrom` / `validTo` on every record and in every payload | Demonstration fixture |
| Provenance that survives downstream use, audit and resale | provenance, evidence class, identity and `rights` (with attribution) on every delivered record | Demonstration fixture |
| A customer can automate a decision against the feed | the decision-rule example on `/api`; every answer names release, build, both clocks and bounds | Demonstration fixture |
| The intelligence-rights schedule: for every source, whether it may be used for acquisition, normalization, customer delivery, aggregation, model training, internal research, redistribution, proprietary strategy, trading | `RightsSchedule.permittedUses` (a use not listed is prohibited), the rights matrix on every release page, `customer_delivery` enforced by the feed's rights guard | Fixture schedule; delivery enforced, the rest recorded as policy |
| Tenant isolation, information barrier, release timing, non-use | `Corpus.governance`, shown on every release page and in the release manifest | Recorded as policy only |
| Payload OS is the shared production and assurance layer; Caravan, Tradewind and Landshark are the domain products | `src/domain/domains.ts`, the domain-product control in the shell, `/product` | Caravan as fixture; the others as disabled slots |
| Data systems and intelligence products; provenance-preserving compute; separately governed principal capital | `src/domain/product.ts`, `/product` | Stated with presence flags; managed compute and principal capital absent |
| Live source connectors, production storage and identity, deployed customer delivery, a completed pilot | — | Absent, and stated as absent on `/product` |
