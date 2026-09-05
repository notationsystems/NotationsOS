# Economic architecture

Authoritative positioning, as set by the founder. Every other document and every user-facing string in this repository is subordinate to it.

## The firm

Notation Systems builds provenance-bearing computational corpora: governed, time-bounded information inventory that can be inspected, computed against, corrected, and distributed with its evidence, method lineage, rights, uncertainty, and release history intact.

The firm monetizes this shared computational substrate through two operating businesses:

1. **Data systems and intelligence products.** Notation Systems licenses computational corpora, APIs, feeds, decision workbenches, reports, and vertical applications built on those corpora.
2. **Provenance-preserving compute.** The firm operates managed storage, models, simulations, agents, and computational workloads over authorized corpus releases, allowing customers to execute confidential work without losing lineage, policy, or recallability.

Over time, a separately governed principal-capital activity may deploy the firm's own capital using lawfully acquired and policy-permitted proprietary intelligence. This activity is distinct from customer products: it has separate information-access controls, capital allocation, risk management, reporting, and conflict governance. Customer evidence remains tenant-isolated; customer workloads remain confidential; proprietary strategies cannot draw on restricted customer information.

The underlying production system is shared: source acquisition, normalization, identity resolution, ontology alignment, canonical state, scientific computation, indexing, verification, release certification, and correction. The customer-facing API, feed, report, agent, or workbench is not the finished good itself; it is the distribution mechanism for a certified corpus release.

In this model, Notation Systems captures value by selling governed information, operating the computation that makes it useful, and, where legally and ethically permitted, selectively acting on its own intelligence.

Notation Systems builds computational corpora, operates the infrastructure that makes them useful, and selectively deploys proprietary capital against the intelligence they produce.

## The concise formulation

Notation Systems builds provenance-bearing computational corpora, exposes them as durable data streams and APIs, and operates the compute systems that make those corpora useful.

| Layer | Who supplies it |
|---|---|
| Corpus + API / feed | The product |
| Inference, model, agent | Customer computation, or hosted computation on customer authority |
| Ruling, admission profile, case workbench | Optional application layer over the corpus |

Providing the API is enough. The API exposes the governed substrate: point-in-time state, lineage, uncertainty, rights, corrections, and stable identity. A customer runs their own inference against the stream without receiving an opaque conclusion from Notation Systems. A ruling is one possible application built over the corpus, useful where a customer wants a prescribed control; it is not a requirement for value creation.

## The value proposition, kept concrete

- "As-of" answers that reconstruct what was knowable at a specific time.
- Machine-readable uncertainty and validity bounds, not footnotes.
- Certified release manifests and push retractions when a fact changes.
- Provenance that survives downstream use, audit, and resale.
- A customer can automate a decision against the feed without blindly trusting a black box.

The manufacturing analogy makes the moat legible: scraping is extraction; it is not the business. The durable asset is the continuously maintained corpus plus its identity mappings, release history, corrections, and computable interfaces.

## Product family

Payload OS is the shared production and assurance layer. It is not a fourth public API. Caravan, Tradewind and Landshark are the bounded domain products a buyer purchases; a buyer should always know which domain product and which corpus release they are buying.

The agent and apparatus stable and shared message board are internal coordination facilities within Payload OS. They record participant definitions and their working contracts, expose compatible connections and missing inputs, and carry scoped requests, handoffs, blockers, results and acknowledgements. This supports assembly of the shared production system. It does not change the customer categories, make inference a requirement for buying the corpus, or establish managed customer compute. The implementation and its present limits are recorded in [Agent coordination](AGENT_COORDINATION.md).

## Rules for this repository

- Lead with data systems and compute. Public-facing text does not lead with principal capital.
- Do not call any output a warrant. Ruling, assurance or admission decision describes what the current system can sell.
- The honest present tense: this repository holds a fixture-only corpus product surface and a fixture-only ruling workbench, the latter an optional application over the corpus. Its shared agent/apparatus stable and board open with read-only seed data; opt-in `LOCAL_SANDBOX` mode persists local definitions, messages and acknowledgements. This local coordination prototype has no running agent fleet or production identity. The repository has no live source connectors, production storage or identity, deployed customer delivery, managed execution of customer workloads, independent verification, or completed pilot.

## How this repository reflects it

| Statement | Where it is implemented | Presence |
|---|---|---|
| Governed, time-bounded information inventory with evidence, method lineage, rights, uncertainty and release history intact | `src/domain/corpus.ts`, `src/fixtures/caravan/release.ts`; `/releases` | Demonstration fixture |
| The shared production system: acquisition, normalization, identity resolution, ontology alignment, canonical state, scientific computation, indexing, verification, release certification, correction | `BuildRecord.stages` on every release; `/releases/:id` production record; `/product` | Demonstration fixture (stage records state what ran and what did not) |
| Certified release manifests | `src/fixtures/releaseManifest.ts`, `Certification` on every release, commitment stamped and drift-tested; `GET /api/v1/releases/:id/manifest` | Demonstration fixture; verification is internal recompute, never independent |
| Push retractions when a fact changes | `Retraction`, `/retractions`, `GET /api/v1/retractions?since=` | Demonstration fixture |
| As-of answers | `queryAsOf`, `/stream`, `GET /api/v1/releases/:id/as-of` | Demonstration fixture |
| Machine-readable uncertainty and validity bounds | `CorpusRecord.uncertainty`, `validFrom` / `validTo` on every record and in every payload | Demonstration fixture |
| Provenance that survives downstream use, audit and resale | provenance, evidence class, identity and `rights` (with attribution) on every delivered record | Demonstration fixture |
| A customer can automate a decision against the feed | the decision-rule example on `/api`; every answer names release, build, both clocks and bounds | Demonstration fixture |
| The intelligence-rights schedule: for every source, whether it may be used for acquisition, normalization, customer delivery, aggregation, model training, internal research, redistribution, proprietary strategy, trading | `RightsSchedule.permittedUses` (a use not listed is prohibited), the rights matrix on every release page, `customer_delivery` enforced by the feed's rights guard | Fixture schedule; delivery enforced, the rest recorded as policy |
| Tenant isolation, information barrier, release timing, non-use | `Corpus.governance`, shown on every release page and in the release manifest | Recorded as policy only |
| Payload OS is the shared production and assurance layer; Caravan, Tradewind and Landshark are the domain products | `src/domain/domains.ts`, the domain-product control in the shell, `/product` | Caravan as fixture; the others as disabled slots |
| A shared stable of agents and apparatuses, declaring purpose, authority, domains, contracts and capabilities | `src/coordination/types.ts`, `seed.ts`, `ledger.ts`; `/agents` | Seed definitions; local registrations in opt-in sandbox; registration does not launch a worker |
| Synastry across apparatuses and agents through declared input/output compatibility | `connectionsFor`; the stable's directed connections and explicit missing inputs | Local prototype calculation over definitions in a common scope and domain; no execution or deployment attestation |
| A shared message board for requests, handoffs, blockers, results and acknowledgements | `/board`, `GET` / `POST /api/coordination`; `src/coordination/store.ts` | Read-only seed board by default; append-only local event history with serialized writes in opt-in sandbox; simulated authors, no production authentication |
| Data systems and intelligence products; provenance-preserving compute; separately governed principal capital | `src/domain/product.ts`, `/product` | Stated with presence flags; managed customer-workload execution and principal capital absent |
| Live source connectors; production storage and identity; deployed customer delivery; managed execution of customer workloads; independent verification; a completed pilot | — | Absent, and each stated as absent on `/product` |
