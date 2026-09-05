# Local Caravan candidate builds

Status update (2026-09-05): references below to six absences or no live connectors describe this document's earlier milestone. One bounded, operator-only FMCSA Company Census connector is now implemented for internal qualification; see [Local source connectors](LOCAL_SOURCE_CONNECTORS.md). It establishes neither recurring ingestion nor customer live feeds. All other authority, storage, identity, execution and verification boundaries below remain unchanged.

Payload OS can now assemble an explicit set of locally normalized Caravan Carrier candidates into a deterministic, time-bounded candidate build. This is a shared internal production rail for Caravan. It is not canonical corpus admission, a released information product or a customer API.

```text
Explicit normalization ids + Carrier definition + knowledge cutoff
→ reopen each normalization, acquisition and actual source bytes
→ check candidate eligibility, source scope and cutoff
→ evaluate INTERNAL DERIVE at builtAt for every member
→ publish an UNADMITTED candidate-build manifest
→ inspect by recomputing exact membership and historical decisions
```

The build stores references and member metadata, not a second copy of candidate data fields. Existing candidates remain `UNADMITTED`, with source-scoped `UNRESOLVED` identities and `canonicalId: null`. The fixture corpus, release history and public feed remain unchanged.

## Create and inspect a build

First complete [local evidence intake](LOCAL_EVIDENCE_INTAKE.md) and [local Carrier normalization](LOCAL_NORMALIZATION.md). Verify each selected result and read its `run.candidate.knownAt`; for the included Carrier example:

```sh
npm run evidence -- inspect-normalization --normalization demo-caravan-carrier-normalization-001
```

A quarantined normalization cannot be selected. For multiple members, inspect each explicit normalization id before choosing the cutoff.

Create a JSON request using this shape. Replace the cutoff placeholder with an explicit timezone-qualified ISO instant at or after every selected candidate's `knownAt`, but not after the build time. The CLI assigns `builtAt` when creating a new build; it does not infer or advance the cutoff.

```json
{
  "schema": "payload.local-candidate-build-request.v1",
  "buildId": "demo-caravan-carrier-build-001",
  "purpose": "CARAVAN_LOCAL_DEVELOPMENT",
  "knownThrough": "REPLACE_WITH_KNOWLEDGE_CUTOFF_ISO_INSTANT",
  "definition": {
    "id": "demo-caravan-carrier-definition-v1",
    "version": "1.0.0",
    "domain": "CARAVAN",
    "recordType": "Carrier",
    "sourceClasses": ["OPERATOR_DECLARATION"]
  },
  "normalizationIds": ["demo-caravan-carrier-normalization-001"]
}
```

The placeholder is deliberately not an accepted timestamp. The synthetic Carrier example's source class is `OPERATOR_DECLARATION`; this declaration establishes neither a real carrier nor independently verified source rights. A build definition may explicitly name other source classes, but every selected acquisition must belong to its declared set.

Save the completed request as a local JSON file and supply its path:

```sh
npm run evidence -- build-candidates --request <manifest.json>
npm run evidence -- inspect-candidate-build --build demo-caravan-carrier-build-001
```

No web server, coordination worker or network connector is required. Both commands default to `.payload/evidence`; pass the same `--root <directory>` used for acquisition and normalization when selecting another store.

Creation returns `status: "CREATED"` or `"EXISTING"` and a `build`. Inspection returns the recomputed `build`. Both include `integrity: "RECOMPUTED_LOCAL"`, `rawBytesIncluded: false` and `candidateFieldsIncluded: false`. Member identity, time, source-policy references and decisions are returned; source bytes and candidate `fields` are not. Success exits `0`; errors are JSON on stderr with exit `1`. Candidate builds have no quarantine result or exit `2`: selecting a quarantined normalization is an error, not a silently skipped member.

## Exact membership and time contract

The request schema is `payload.local-candidate-build-request.v1`. All fields in the example, including each definition field, are required; unknown fields are rejected. Only domain `CARAVAN` and record type `Carrier` are supported. Definition identity and version are declarations bound into the request, not a canonical ontology registration.

The request requires 1–64 unique, explicitly named normalization ids and 1–16 unique source classes. Duplicate entries are rejected rather than deduplicated. The parser sorts both lists and normalizes `knownThrough` to UTC ISO milliseconds, so their input order does not alter the resulting request identity.

Every selected normalization is reopened through `LocalNormalizationStore.inspect`, which reparses the original bytes and verifies acquisition and normalization integrity. The builder also checks the exact acquisition reference and declared source class. It rejects the entire build on a missing or corrupt dependency, quarantine, wrong record contract, undeclared source class or candidate known after the cutoff. There is no directory scan, automatic inclusion of newer files or silent filtering of failed members.

Each `(sourceId, sourceRecordId)` tuple can appear only once in a build. Selecting two versions of the same source-scoped record is an error; the builder does not choose a winner. The same label or registration number never establishes identity, and records from distinct sources are not merged.

The temporal contract is `candidate.knownAt ≤ knownThrough ≤ builtAt`. Candidate valid-time bounds are preserved as metadata without filtering: unobserved bounds stay null. A knowledge cutoff is not a claim that every relevant source or event has been captured through that time. `recordCount` is the number explicitly selected, not market coverage or corpus completeness.

## Separate build-time permission

A new build evaluates `operation: "DERIVE"`, `audience: "INTERNAL"`, the build's purpose and `requestedAt: builtAt` against every member's exact captured source registration. Only `ALLOWED` proceeds. Previous ingestion or normalization permission does not automatically permit a later build; an expired policy window, unlisted purpose or approval-required derivation blocks the new build before publication.

This is a fresh evaluation of the stored operator declaration, not retrieval of a current external license or revocation state. It grants no publication, customer delivery, model training, trading or other use. Different purposes or knowledge cutoffs are different build requests, even when they select the same members.

## Digests, storage and historical inspection

`src/data-os/local-candidate-build.ts` defines the fixed `payload.local-caravan-candidate-build/v1` contract and persisted schema `payload.local-candidate-build.v1`.

| Binding | What it covers |
|---|---|
| `requestDigest` | Normalized request manifest, build-contract digest and exact ordered normalization/candidate id-and-digest references |
| `definitionDigest` | The complete declared Carrier definition |
| `recordsRoot` | Versioned membership domain, definition digest, contract digest and ordered member references; it is a membership root, not a standalone permission or time proof |
| Member metadata | Exact references, source-scoped identity, source class, knowledge/valid time, source-policy id/digest and the separately evaluated build-time DERIVE decision |
| Build `digest` | The complete build payload, including request, roots, time, member metadata, decisions and nonclaims |

The contract digest binds a declared local build contract, not a signed code attestation. Reopening normalization references supplies the acquisition, evidence, receipt, parser and original derivation dependencies; the build file does not replace that chain or duplicate candidate data fields.

The complete build is published in one create-only file at `.payload/evidence/candidate-builds/<sha256-of-build-id-hex>.json`, using the existing temporary-file write, `fsync` and atomic hard-link publication helper. Request JSON is bounded at 64 KiB and saved build metadata at 512 KiB. There is no active-build pointer, overwrite fallback, partial-member publication or automatic repair. A process failure can leave a temporary file or a committed result whose response was lost; retry the original request to discover its state. The underlying filesystem remains trusted local storage, not physical WORM or a production durability guarantee.

An identical request, including a reordered member list or source-class list, returns `EXISTING` with the saved build's original `builtAt` and decisions. It does not perform a new build-time use at the retry time. A different valid request under the same id yields `CANDIDATE_BUILD_CONFLICT`; malformed requests, invalid dependencies or corrupt saved state can fail earlier checks. Concurrent identical requests converge on the saved, verified winner. New membership, purpose, definition or cutoff requires a new build id.

Inspection is read-only. It reconstructs the request, reopens every normalization and its source bytes, then recomputes membership, definition, contract, roots and member-policy decisions at the original saved `builtAt`. Acquisition and normalization checks retain their own original times. The complete result must match the stored build. This reconstructs historical declared permission; it grants no current access or retention permission and checks no subsequent external revocation. Missing dependencies, changed contracts and corruption remain errors. Files are preserved rather than silently repaired, deleted or migrated.

## Compare two existing builds

The separate read-only `npm run evidence -- compare-candidate-builds --request <manifest.json>` command reopens two exact build ids/full digests from the same operator-selected root. It requires one definition, build contract and purpose, with nondecreasing build times and knowledge cutoffs; self-comparison and equal times are valid. Entries match only source-id/source-record-id tuples and compare normalization/candidate references, not build-time policy decisions or candidate fields. The report is deterministic and ephemeral, includes source identifiers, and invents no comparison timestamp. It changes no stored build and is not a correction, retraction or released change feed. See [Local candidate comparison](LOCAL_CANDIDATE_COMPARISON.md) for the inspected-reference request template and full boundary.

## Optional board inspection

A separately launched [candidate-build review worker](CANDIDATE_BUILD_REVIEW_WORKER.md) now uses this same read-only inspector. Its board request names an exact build id and expected full `build.digest`, with `context: null`; a fixture release context does not identify these local candidate builds. The evidence root is fixed by the operator at startup, never by a message. The worker posts only a bounded build-level summary or redacted error, reads back the saved result and then acknowledges its input. It does not build candidates, return source/member data or grant current retrieval rights. Retrying a failed acknowledgement reuses the historical result; post a new request for a fresh inspection.

## Status and Bench grounding

Every saved build explicitly declares `state: "UNADMITTED"`, `mode: "LOCAL_DEVELOPMENT"` and `policyAuthority: "OPERATOR_DECLARATION"`. Its flags `canonicalAdmission`, `canonicalStateMutated`, `identityResolved`, `releaseActivated`, `sourceTruthClaimed`, `independentlyVerified` and `completenessClaimed` are all false. Local recomputation establishes consistency with the stored declarations and bytes, not authenticated authorship, source truth, field accuracy or independent verification.

The sibling `Notations Kernel` was studied read-only, including `AGENTS.md`, `PROJECT_CONTEXT.md` and the following build/admission sources and tests:

| Bench evidence | Concrete lesson and local boundary |
|---|---|
| `src/corpus-workflow.js` — `compileCorpusBuild`, `verifyCorpusBuildEvidence`; `test/corpus-workflow.test.js` | Bind one exact versioned definition and ordered immutable member references into a recomputable membership root and count; preserve a non-anachronistic cutoff/build time. O applies this to local candidate references, not Kernel `Artifact`, `Claim`, `Operator` and `VerificationEnvelope` entities. |
| `src/corpus-admission-workflow.js` — `admitCorpusBuild`, `verifyCorpusAdmissionEvidence`; `test/corpus-admission-workflow.test.js` | Bench admission separately requires exact verified normalization coverage, declared record types/source classes and member knowledge times within cutoff. O enforces several of these restrictions early for its bounded candidate builder, but does not implement Bench admission or emit an admission proof. |

Explicit source-identity collision rejection and a separate build-time INTERNAL DERIVE check are local restrictions. They do not create resolution or admission authority. Identity resolution, canonical domain state, corpus admission, release and delivery remain subsequent work. The board does not automatically build candidates, and no public API exposes these local files. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
