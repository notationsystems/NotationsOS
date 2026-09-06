# Doctrine binding

An editable map of every part and its flows, for brainstorming in Obsidian, is in [`docs/architecture-map/`](architecture-map/Payload%20OS%20Architecture.md). [Synthesized architecture](SYNTHESIZED_ARCHITECTURE.md) is the prose of record for the five fabrics, the seven doctrine invariants, the projection instruments, the runtime allocation and the historical concept mapping. This document records only what that architecture binds in this repository: where each rule is enforced, which tests prove it, the three states of information as they exist here, the verification tier reached, and the identity chain. `src/domain/doctrine.ts` holds the same content as data; `/product` renders it; `src/domain/doctrine.test.ts` fails if a named test file disappears.

## Three states of information, here

| State | Meaning | Invariants | In this repository |
|---|---|---|---|
| Evidence, E | what has been observed | append-only, content-addressed, a record of what a source said | evidence artifacts with capture digests and receipts; acquisitions on the local rail |
| Canonical, K | what has been admitted under a schema and a validation regime, as a version | immutable per version, schema-constrained, deterministic identity | released records in certified releases; corpus admission absent. A deterministic local notation-state kernel exists for authored state (Rust validation and replay, versioned local snapshots); it admits no corpus record |
| Inquiry, I | what one investigation is manipulating; allowed to be wrong | exploratory, mutable, never a source of truth, promotion crosses validation | the notation workspace's drafts, unsaved commands and saved local versions; the intake draft; candidates on the rail |

The identity chain is kept distinct, with the morphisms between its members preserved: evidence ≠ observation ≠ claim ≠ canonical state ≠ representation ≠ model ≠ execution ≠ verification.

## The seven rules, bound

| # | Rule | Enforced here | Proved by |
|---|---|---|---|
| 1 | Evidence is not state. | Evidence artifacts and corpus records are distinct types; every record names its artifact and receipt; every capture and candidate carries `sourceTruthClaimed: false`. | `src/fixtures/capture.contract.test.ts`, `src/fixtures/production/demo.contract.test.ts` |
| 2 | Canonical state is not the entire corpus. | No candidate, run or build identifier or digest appears in any release, feed payload or MCP result; the rail has its own page. | `src/fixtures/production/demo.contract.test.ts` |
| 3 | Inquiry is allowed to be wrong. | The intake draft is saved unevaluated with submission as an intent; the workbench adjudicates nothing; a board message resolves no identity. | `src/components/case/CaseWorkspace.test.tsx`, `src/coordination/ledger.test.ts` |
| 4 | Computation produces derived objects, not truth automatically. | Derived quantities carry named, versioned methods; every candidate carries its derivation decision and adapter digest; checks are evaluation, verification is stated as internal recompute. | `src/domain/corpus.test.ts`, `src/data-os/local-normalization.test.ts` |
| 5 | Projection never mutates its source. | The fixture corpus is byte-identical before and after every feed payload and MCP tool; the projection compiler returns detached copies and states `sourceMutated: false`. | `src/architecture.test.ts`, `src/domain/projection.test.ts`, `src/projection/projection.test.ts` |
| 6 | Identity survives representation changes. | One `notation://` identity per record across the records feed, the as-of answer, every MCP result and every compiled projection; the only graph edge is the record-to-subject incidence a record already names. | `src/architecture.test.ts`, `src/domain/projection.test.ts`, `src/projection/projection.test.ts` |
| 7 | Every promoted result crosses an explicit validation boundary. | The rail writes UNADMITTED records only and refuses what it cannot vouch for; browser and page layers import only types and the pure source-use evaluator from the rails; the rails import nothing from above them; admission is absent and stated so. | `src/architecture.test.ts`, `src/data-os/local-candidate-build.test.ts` |

Operational rule: build shared information before multiplying reasoning processes.

## Projection, here

There is one router, `routeProjection` in `src/projection/spec.ts`, and one closed spec, `payload.projection-spec.v1`, compiled read-only over one exact fixture release by `src/projection/compile.ts` and served by `GET /api/projections/sources/:releaseId` and `POST /api/projections/preview` ([Projection fabric](PROJECTION_FABRIC.md)). `src/domain/projection.ts` records the instruments' questions and roles and the routing table as data; `src/domain/projection.test.ts` asserts the table agrees with the router for every combination of mode, coordinate semantics and representation, that the compiler returns what the table says, keeps identity and states its non-claims. kepler.gl, CesiumJS and Three.js are routed to, not installed; geometry requests return `UNAVAILABLE` and nothing is invented.

## Verification tiers

| Tier | Name | Here |
|---|---|---|
| V0 | provenance | reached |
| V1 | deterministic reproducibility | reached: digests, captures, manifests, the production demonstration and projections regenerate under test |
| V2 | signed releases and manifests | not reached: commitments exist, nothing signs them |
| V3 | independent recomputation | not reached: verification is internal recompute, stated as such |
| V4 | cryptographic execution attestation | not reached |
| V5 | formal or zero-knowledge proof | not reached, and selective by design |
