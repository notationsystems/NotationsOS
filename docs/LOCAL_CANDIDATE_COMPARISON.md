# Local candidate-build comparison

Payload OS can compare two exact, existing local Caravan Carrier candidate builds by source-scoped membership and immutable references. The comparison reopens both builds and their evidence chains before reporting. It is a read-only diagnostic in the local production rail, not a projection, canonical-state transition, correction decision or released change feed.

```text
Before build id/full digest + after build id/full digest
→ inspect both builds through original source bytes
→ require compatible definition, contract, purpose and time order
→ match exact source-id/source-record-id tuples
→ return deterministic reference-comparison JSON without saving a comparison
```

Builds and candidates remain `UNADMITTED`; their identities remain `UNRESOLVED`. Nothing is repaired, promoted, released, written to the board or exposed through the fixture projection API.

## Run against inspected builds

First create builds using [Local candidate builds](LOCAL_CANDIDATE_BUILDS.md), then inspect the actual ids you want to compare:

```sh
npm run evidence -- inspect-candidate-build --build <before-build-id>
npm run evidence -- inspect-candidate-build --build <after-build-id>
```

Copy `build.buildId` and the complete `build.digest` from each output. Do not use `recordsRoot`, a normalization digest or a fixture release commitment. The required format is `sha256:` followed by 64 lowercase hexadecimal characters.

Create a local JSON request using the following shape, replacing all placeholders with the inspected values:

```json
{
  "schema": "payload.local-candidate-build-comparison-request.v1",
  "before": {
    "buildId": "REPLACE_WITH_INSPECTED_BEFORE_BUILD_ID",
    "expectedDigest": "REPLACE_WITH_INSPECTED_BEFORE_BUILD_DIGEST"
  },
  "after": {
    "buildId": "REPLACE_WITH_INSPECTED_AFTER_BUILD_ID",
    "expectedDigest": "REPLACE_WITH_INSPECTED_AFTER_BUILD_DIGEST"
  }
}
```

These are deliberately not fake valid hashes. For a baseline self-comparison, use the same inspected id and digest on both sides; no second build needs to be manufactured. Otherwise select two builds whose definition, build contract and purpose are identical and whose times meet the rules below.

```sh
npm run evidence -- compare-candidate-builds --request <manifest.json>
```

The operator selects one store with `--root <directory>`; the default is `.payload/evidence`. Use the same root for both build inspections and the comparison. The request cannot select paths, separate stores or replacement build bodies. No web server, board worker or network connection is required.

The CLI returns `comparison`, `integrity: "RECOMPUTED_LOCAL"`, `rawBytesIncluded: false`, `candidateFieldsIncluded: false` and `comparisonPersisted: false`. Success exits `0`, including comparisons that contain changes. Errors are printed as JSON on stderr and exit `1`; no partial report or quarantine result is returned.

## Compatibility before comparison

The request is a closed `payload.local-candidate-build-comparison-request.v1` object containing only `schema`, `before` and `after`; each reference contains only `buildId` and `expectedDigest`. Every field is required. Request JSON is bounded at 64 KiB and must be valid UTF-8; malformed bytes are rejected rather than replaced during decoding.

`LocalCandidateBuildStore.inspect` reopens each build, its normalization records, acquisitions and original source bytes. It recomputes their original declarations, parser output, metadata and digests. The inspected full build digest must match the expected reference. A missing build, mismatch or corrupt dependency stops comparison; the command does not compare supplied JSON while bypassing stored evidence.

Both builds must have the same definition digest and exact definition body, build-contract digest and purpose. `before.builtAt ≤ after.builtAt` and `before.knownThrough ≤ after.knownThrough` must both hold. Equal times and self-comparison are allowed. Definitions, purposes or cutoffs are not silently reconciled, and reversed time order is not automatically swapped.

The existing per-build limits and checks still apply, including at most 64 members and no repeated source-scoped identity within either build. The comparison covers at most 128 entries in the union of both member sets. It verifies that its categories conserve each inspected build's record count.

## What each entry means

Matching uses only the exact tuple `(sourceId, sourceRecordId)`. The output preserves the unresolved identity and its null canonical id. It does not match legal names, registration numbers, labels, geometry or semantic similarity, and it does not merge sources.

Each entry has `kind`, `identity`, `before` and `after`. A present side contains only the normalization id/digest and candidate id/digest; an absent side is null.

| Kind | Reference-level meaning |
|---|---|
| `ADDED` | The tuple appears only in the after build |
| `REMOVED` | The tuple appears only in the before build |
| `UNCHANGED` | The tuple appears in both, with identical normalization and candidate references |
| `REFERENCE_CHANGED` | The tuple appears in both, but at least one normalization/candidate reference differs |

`UNCHANGED` does not compare the entire build-member object. Separate builds can have different build-time DERIVE decisions and full build digests while carrying unchanged candidate references. The report does not reinterpret a changed policy-decision timestamp as a changed Carrier field.

Conversely, renormalizing identical source bytes under a new normalization id produces different references and can yield `REFERENCE_CHANGED`. That is not evidence of a changed name, registration number or physical fact. `ADDED` is not a new company or event; `REMOVED` is not a withdrawal or retraction. These categories describe only the selected builds' reference membership.

Entries are ordered deterministically by the local JSON encoding of the source-identity tuple. The summary contains `beforeCount`, `afterCount`, `added`, `removed`, `referenceChanged`, `unchanged`, `total`, `recordsRootChanged` and `buildDigestChanged`. Counts are not completeness or market-coverage measures.

## Output, timing and disclosure boundary

The report schema is `payload.local-candidate-build-comparison.v1`, with `mode: "LOCAL_DEVELOPMENT"`, `basis: "REFERENCE_COMPARISON"` and `temporalBasis: "INPUT_BUILD_TIMES_ONLY"`. It includes the exact request, comparison-contract digest, definition/build-contract digests, common purpose, summaries of both builds, entries and counts. The complete payload is bound by a deterministic local `digest`; its digest encoding is bounded at 512 KiB.

Build summaries retain their id, full digest, records root, knowledge cutoff, build time and record count. There is no `comparedAt`, new knowledge time or claimed execution attestation. Repeating the same request against the same intact inputs yields the same report; the command does not label an unchanged historical input as a new scientific observation.

This report intentionally includes source identifiers and normalization/candidate references. It does not include raw source bytes, candidate data fields, full policy bodies or filesystem paths. Accordingly, `sourceIdentifiersIncluded` is true, while `rawBytesIncluded` and `candidateFieldsIncluded` are false. It is not the redacted build-level summary used by the separate [board review worker](CANDIDATE_BUILD_REVIEW_WORKER.md), and it should not be treated as suitable for an unauthenticated or customer-facing channel.

The remaining nonclaims are false: `canonicalAdmission`, `canonicalStateMutated`, `identityResolved`, `semanticMeaningInferred`, `fieldChangeInferred`, `correctionInferred`, `retractionInferred`, `completenessClaimed`, `sourceTruthClaimed`, `independentlyVerified`, `currentSourceUseGranted`, `customerDeliveryClaimed`, `releaseActivated` and `comparisonPersisted`.

Historical inspection reconstructs the original acquisition, normalization and build-time policy declarations. Comparison supplies no new current-use grant, RETRIEVE authorization, retention permission or external revocation check. No comparison file, active pointer, new build or recovery record is published. Corrupt or unavailable input remains an error and is preserved; no repair or cleanup runs.

## Errors

| Code | Meaning |
|---|---|
| `INVALID_COMPARISON_REQUEST` | The request file is unreadable, oversized or invalid UTF-8/JSON, or the bounded request does not contain the exact required references |
| `BUILD_NOT_FOUND` | A selected build is absent from the operator-selected root |
| `BUILD_DIGEST_MISMATCH` | An inspected build differs from its expected full digest |
| `BUILD_INSPECTION_FAILED` | A build/dependency did not recompute, or membership counts are inconsistent |
| `INCOMPATIBLE_BUILDS` | Definition, build contract or purpose differs |
| `REVERSED_BUILD_ORDER` | Before follows after in build time or knowledge cutoff |

Comparison inspection errors use bounded explanations rather than returning underlying source bytes, identities or exception text. CLI failures while opening or decoding the request file use one fixed `INVALID_COMPARISON_REQUEST` explanation without file paths or input snippets. Missing or malformed command-line flags return usage text.

## What was learned from Notations Bench

The following sources in the sibling `Notations Kernel` were read without modification:

| Bench source | Lesson and local difference |
|---|---|
| `src/corpus-build-diff-workflow.js` — `diffCorpusBuilds`, `verifyCorpusBuildDiffEvidence` | Compare immutable references without inferring semantic meaning; expose same-identity digest conflicts. Bench compares canonical record references and can report changed definitions or reversed build ordering, provided its comparison time is after both builds. O instead matches source-scoped candidate tuples, deliberately requires one definition/contract/purpose and nondecreasing input times, and emits no persisted Kernel artifact, claim, envelope or comparison timestamp. |
| `src/caravan-change-feed-workflow.js` — `createCaravanChangeFeed`, `evidenceChecks` | A Caravan change feed requires one exact definition, a verified comparison and a verified release containing the definition, later build and diff. Its reference changes are release-bound without claiming source truth or deployed delivery. This local comparison implements none of those release/feed gates and is not a customer change feed. |

The comparison fits the [five-fabric architecture](SYNTHESIZED_ARCHITECTURE.md) as a bounded inspection of local corpus candidates, not a canonical state transition or Projection Fabric input. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
