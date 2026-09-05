# UX architecture

What exists in this repository, not what might.

## Position in the product

The corpus and its API are the product (`docs/ECONOMIC_ARCHITECTURE.md`). This workbench is an optional application layer over the corpus for customers who want a prescribed control: it takes a claim, a declared use, a tolerance, two clocks and evidence, and renders the ruling the substrate returns. Payload OS is the shared production and assurance layer, not a fourth public API; Caravan, Tradewind and Landshark are the bounded domain products, and the shell always shows which one is active. Nothing here is required for a customer to apply their own inference to the data stream.

This document describes the object model the screens are built around, the navigation, the two projections of a case, the component boundaries, and where authority stops.

## Corpus object model (the product)

`src/domain/corpus.ts`:

| Object | Carries |
|---|---|
| `CorpusRelease` | release id, corpus id, knowledge cutoff (`knownAt`), `BuildRecord` (build id, built at, methodology id/version/status, input digests, deterministic, and the production record: the twelve stages acquisition, extraction, normalization, identity, ontology, computation, storage, indexing, verification, release, correction, recall, each with its state for this build), release digest (sha256 over the canonical record set, stamped), `Certification` (status, certified at, basis, verification, manifest commitment), supersedes / superseded-by, status, coverage, the `RightsSchedule` of every source |
| `ReleaseManifestV0` | the certified release manifest (`src/fixtures/releaseManifest.ts`): build, release digest, record count, retractions applied, sources with rights, certification, governance; its commitment is stamped and drift-tested |
| `CorpusGovernance` | tenant isolation, information barrier, release timing, non-use, enforcement: policy statements shown on every release page and in the manifest |
| `CorpusRecord` | stable `notation://` identity, subject with its own identity, predicate, value, unit, basis, `UncertaintyBounds` (low, high, semantics, method), validity bounds (`validFrom`, `validTo`), `knownAt`, `observedAt`, `EvidenceClass` on all three axes, provenance (source, artifact, content hash, producer, transform), visibility, supersedes / superseded-by, retracted-by, first release |
| `Retraction` | correction or withdrawal, issued at, release, affected and replacement records, affected rulings, reason, source |
| `RightsSchedule` | source, material class (geospatial, remote sensing, operational, scientific), licence, permitted uses over acquisition, normalization, customer delivery, aggregation, model training, internal research, redistribution, proprietary strategy and trading (a use not listed is prohibited), explicit non-use statements, redistribution, attribution |

Selectors: `releaseRecords` (everything knowable by the release cutoff), `recordStatusAt` (current, superseded or retracted as of a knowledge time), `queryAsOf` (newest knowable record within validity, reached directly or through an identity-link record, or a typed refusal `NO_RECORD` / `NO_IDENTITY_LINK` / `RETRACTED` / `OUTSIDE_VALIDITY` / `NOT_DELIVERABLE` with a remedy and the candidates set aside), `deliverableRecords` (rights guard, then visibility, with counts withheld), `retractionsSince`.

MCP tools (`src/mcp/tools.ts`, served by `src/mcp/server.ts` over stdio) wrap the same payloads: `list_releases`, `get_release`, `get_release_manifest`, `list_records`, `query_as_of`, `list_retractions`, `get_ruling`, `get_ruling_manifest`. The feed under `/api/v1` (`src/adapter/feed.ts`, route handlers in `src/app/api/v1`) serves releases, a release with its rights schedule and governance, the certified release manifest, records (each carrying its source's rights and attribution so provenance survives downstream use), as-of answers, retractions, and the application-layer ruling and manifest. Every response is deterministic, uncached, carries `fixture_only: true` and names the release it was served from.

## Workbench object model (the application layer)

The interaction model is the sequence the left rail of the workspace shows:

```
CASE → USE → CLAIMS → EVIDENCE → CHECKS → RULING → REMEDIATION → RELEASE → MONITORING
```

The view model (`src/domain/types.ts`) is one `ClaimCaseBundle` per case:

| Object | Carries | Substrate vocabulary carried verbatim |
|---|---|---|
| `Subject` | what the case is about | `notation://entity/...` canonical id |
| `UseScope` | declared use, use code, tolerance kind/value, requested assurance, reliance class | — |
| `TemporalBasis` | `validAt`, `knownAt`, `submittedAt`, `evaluatedAt`, `ruledAt`, `releasedAt`, `supersededAt`, `revokedAt`, `expiresAt` | `knownAt` (methodology `temporalSemantics`) |
| `Claim` | predicate, asserted and normalized `ClaimValue` (value, unit, basis, uncertainty, valid time, knowledge time, source, transform), evidence ids, status, combined evidence class, `knownAt`, visibility | `notation://claim/...`, `notation://transform/...` |
| `EvidenceArtifact` | kind, producer, `EvidenceClass` on all three corpus-contract axes, `contentHash`, visibility, `capturedAt` / `validAt` / `knownAt`, declared identifiers, bounded extracted fields, supersedes | corpus contract axes `claim_strength`, `production_class`, `interest`; `notation://artifact/...` |
| `InvariantResult` | invariant id, authority class (core / domain / governance), status, refusal code, summary, detail, materiality, origin (automatic / reviewer), reviewer id and basis, affected claims, inspected evidence, missing or contradictory evidence, remediation ids, disclosure class, public summary | refusal-with-remedy shape from `AlternativeFeasibility` / `CheckResult` |
| `Ruling` | status, `AssuranceStatus`, use scope, profile id/version, register digest, temporal basis, results, conditions, limitations, scope statement, `ReleaseProof` (manifest id, manifest commitment, evidence root, anchor), supersedes / superseded-by, visibility, ruled claim ids, considered evidence ids | manifest `verification.status`, `Anchor.kind`, `ProofRef.system` |
| `AdmissionProfile` | invariants with authority class, purpose, applicability, input requirements, refusal code, implementation maturity; use codes with default tolerances; recognition statement; register digest | `CAPABILITY_MATURITIES` |
| `CaseEvent`, lineage nodes and edges | the history and the path from source artifact to ruling | — |

Every status, check result and assurance value is read from the bundle. The manifest a ruling commits to is built by `src/fixtures/manifest.ts` to the control plane's `notations.result-manifest.v1` contract, and its commitment is `sha256(canonicalJson(manifest))`, stamped by `npm run stamp:digests` and asserted by `src/fixtures/digest.test.ts`. Every fixture manifest is parsed by a vendored, digest-pinned copy of the control plane's `parseResultManifest` in `src/fixtures/manifest.contract.test.ts`.

## Navigation

Top bar, two groups: **Corpus** (`Releases`, `Stream`, `Retractions`, `API`) then **Workbench** (`Cases`, `Rulings`, `Evidence`, `Replay`, `Profiles`), and a small domain-product control (`Caravan` active; `Tradewind` and `Landshark` are disabled module slots declared in `src/domain/domains.ts`). `/` opens the releases. The shell is 48 px tall and gets out of the way.

| Route | Screen | Component |
|---|---|---|
| `/product` | the operating model as data: the firm, the classes of source material, the twelve-stage production system, inventory and distribution, the three customer categories, the four-step economic architecture with the separation statement, the product architecture tree, what exists in this repository, the value proposition | `app/product/page.tsx` |
| `/releases` | corpora and their release history: status, knowledge cutoff, build, record and retraction counts, certification, digest, supersession | `app/releases/page.tsx` |
| `/releases/:releaseId` | certification with the manifest commitment and the certified release manifest, the production record stage by stage, build inputs, the rights matrix and governance, deliverable records with status in that release, retractions knowable in it | `app/releases/[releaseId]/page.tsx` |
| `/stream` | as-of query: release, subject, predicate, world time, knowledge time → the answering record with bounds, clocks, provenance, class and rights, the identity link used, or a typed refusal with remedy; the feed URL that reproduces it | `components/corpus/StreamExplorer.tsx` |
| `/retractions` | the push-retraction feed with affected and replacement records and affected rulings | `app/retractions/page.tsx` |
| `/api` | the feed endpoints with live examples, how to automate against the feed, both adapter contracts | `app/api/page.tsx` |
| `/cases` | case queue: textual operational summary, filters (status, sponsor/counterparty, profile, visibility, reviewer, valid-time and knowledge-time ranges), search by case / manifest / lot / shipment / claim identifiers | `components/queue/CaseQueue.tsx` |
| `/cases/new` | staged intake (Subject, Intended use, Claims, Evidence, Time basis, Admission profile, Review and submit); draft is saved in the page and says it is not evaluated; submission is an intent | `components/intake/NewCaseIntake.tsx` |
| `/cases/:caseId` | the workspace: left rail (structure, claims, evidence, revisions, history), centre (selected object), right decision rail | `components/case/CaseWorkspace.tsx` |
| `/rulings` | every ruling ever issued, including superseded and revoked | `app/rulings/page.tsx` |
| `/rulings/:rulingId` | relying-party projection with export and API example | `components/ruling/RulingViewer.tsx` |
| `/replay/:caseId` | bitemporal replay with an explicit knowledge-time control | `components/replay/ReplayView.tsx` |
| `/profiles/:profileId` | invariant register by authority class, use codes, recognition statement | `app/profiles/[profileId]/page.tsx` |
| `/evidence` | every artifact across cases with producer, classes, hash, known-by | `app/evidence/page.tsx` |

## Sponsor and relying-party projections

Both are projections of the same bundle through `projectForViewer(bundle, viewerClass)` in `src/domain/selectors.ts`. The projection removes objects the viewer may not see, reduces invariant results whose detail is narrower than the viewer to their bounded `publicSummary`, strips private party notes, and reports withheld counts so the screen can say "N withheld" without leaking what was withheld.

- The workspace offers `Sponsor` (PRIVATE_PREFLIGHT) and `Internal reviewer` (INTERNAL_ONLY). Reviewer-entered findings classed INTERNAL_ONLY appear only to the reviewer.
- The ruling viewer offers `Named counterparty` (COUNTERPARTY_SHARED) and `Public` (PUBLIC_RULING). A COUNTERPARTY_SHARED ruling is not visible at all at the public projection; a PUBLIC_RULING ruling shows its status, use, clocks, checks and conditions and withholds the artifacts. The machine-readable export is built from the projected bundle and says when identities were withheld and that the committed manifest was computed over the full evidence set.

## Component boundaries

Primitives in `src/components/primitives/` are the stable semantic objects: `RulingStatusPill`, `AssuranceBadge` / `AssuranceDetail`, `VisibilityBadge`, `EvidenceClassBadge` (three labelled axes, never a single score), `PartyRoleBadge`, `Digest` / `ManifestCommitment`, `TemporalBasisPanel` (every clock labelled; no "Date"), `UseScopeCard`, `ClaimValueView` (value + unit + basis; expands to uncertainty, both clocks, source, class, transform), `ProfileReference`, `FixtureBanner`, `Section`, `CopyButton`.

Case components in `src/components/case/`: `CaseIdentityHeader`, `DecisionRail`, `ClaimRow` / `ClaimDetail`, `EvidenceRow` / `EvidenceDetail`, `InvariantRow` / `InvariantResultDetail`, `RemediationActions` / `ActionIntentPanel`, `LineagePath` (layered list, deterministic order, broken links stated in text), `RevisionComparison`.

Ruling components in `src/components/ruling/`: `RulingViewer`, `SupersessionBanner`, `MachineReadableExport`, `ApiExampleDrawer`. Replay: `components/replay/ReplayView.tsx`.

Domain rules live in fixture and profile data (`src/fixtures/caravan/profile.ts`), not in components. No component knows what a lot, a certificate or a moisture value means.

Every ruling names the corpus release and build it was evaluated against (`Ruling.corpus`), the manifest's `corpusBuild` is that build, the workspace and the ruling viewer show it, and evidence detail links each artifact to the corpus records extracted from it.

## Frontend / backend authority boundary

- Screens read through `CorpusSource` (`src/adapter/corpusSource.ts`) and `CaseSource` (`src/adapter/caseSource.ts`). The only implementations read committed fixtures. Their `origin` is rendered as a banner on every fixture-backed screen, and the `/api/v1` responses carry `fixture_only: true` in the body and `X-Payload-Fixture-Only: true` in the headers.
- The browser performs presentation validation only: visibility projection, knowledge-time projection, highlight linking from a failed check to its claims, evidence, broken lineage edge and remediation, queue summaries. There is no admission logic, no second gate battery, and no inference of a status from display fields.
- Every user action (request evidence, replace evidence, correct claim, change use, change tolerance, appeal, resubmit, reviewer intervention, submit) produces an `ActionIntent` shown in an "Action intents (not sent)" panel. Nothing is sent; nothing is re-evaluated. There is no bare "Override": reviewer intervention requires an authority, a reason and a basis before it can be recorded, and it is recorded beside the automatic results, not over them.
- Digests are computed only in Node (`scripts/stamp-digests.entry.ts`) and committed; the browser never hashes anything.
- The brief's assurance classes are a presentation vocabulary. The mapping recorded in this repository, applied by the fixture author and to be applied by any live adapter, is: `UNVERIFIED_EVALUATION` when the manifest verification status is `unverified` and no review or external anchor exists; `HUMAN_REVIEWED` when a named reviewer approved with a recorded basis; `VERIFIED_ATTESTATION` when a verifier checked the manifest (`verified`) with a real proof; `EXTERNALLY_WITNESSED` when the anchor kind is `counterparty_cosigned`, `timestamp_authority` or `public_chain`. The substrate values are carried beside the class so the interface never shows the class without its basis.
