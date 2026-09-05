# Local candidate-build comparison

Status update (2026-09-05): references below to six absences or no live connectors describe this document's earlier milestone. One bounded, operator-only FMCSA Company Census connector is now implemented for internal qualification; see [Local source connectors](LOCAL_SOURCE_CONNECTORS.md). It establishes neither recurring ingestion nor customer live feeds. All other authority, storage, identity, execution and verification boundaries below remain unchanged.

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

## Local frontend comparison

The same operation is available through `POST /api/production/compare` after the operator starts `npm run dev:production`. The route requires explicit `PAYLOAD_PRODUCTION_LOCAL=1` and a same-origin literal-loopback request, including for read-only comparisons. It is disabled for public/customer operation. The backend's `PAYLOAD_PRODUCTION_DIR` selects the one evidence store; otherwise it uses `.payload/evidence`.

Send the exact existing request above with `Content-Type: application/json`. There is no `requestId`, query option, caller timestamp, replacement build, path, or completion flag. For builds returned by the production workflow, map each output's `id` to `buildId` and its full `digest` to `expectedDigest`. Existing CLI-created builds in the same store are also inspectable; comparison does not require a production registration or manufacture one.

```javascript
async function compareInspectedBuilds(before, after) {
  const reference = ({ id, digest }) => ({ buildId: id, expectedDigest: digest });
  const response = await fetch('/api/production/compare', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema: 'payload.local-candidate-build-comparison-request.v1',
      before: reference(before), after: reference(after),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error.message), { result });
  return result;
}
```

HTTP 200 returns `payload.production-candidate-comparison.v1`. Its `comparison` is **exactly** the unchanged `payload.local-candidate-build-comparison.v1` report returned by the CLI, including the deterministic digest and every nonclaim. The wrapper carries `mode: LOCAL_DEVELOPMENT`, `inspection: HISTORICAL`, `integrity: RECOMPUTED_LOCAL`, `sourceIdentifiersIncluded: true`, and false values for `rawBytesIncluded`, `candidateFieldsIncluded`, `comparisonPersisted`, `canonicalAdmission`, and `currentRightsGrant`. The TypeScript response type is `ProductionCandidateComparison` in `src/production/comparison.ts` (use a type-only import in frontend code).

The response is `no-store`. Comparisons start no acquisition, normalization, scientific analysis, production run, reservation, board event, or saved report. Repeating a request reopens the same evidence and returns the same result only while those inputs remain intact. A timeout is safe to retry as a read; this does not authorize retrying an interrupted production command. The input stream is bounded to 64 KiB and ten seconds; the existing fixed worker bounds execution to fifteen seconds, two concurrent workers per server process, and 2 MiB of process output. The underlying report retains its 512 KiB bound and maximum 128 entries.

Errors use `payload.production-error.v1` with fixed explanations, never underlying exception text or host diagnostics:

| HTTP | Code |
|---|---|
| 400 | `INVALID_COMPARISON_REQUEST` for an invalid nested comparison contract; `INVALID_REQUEST` for malformed JSON/UTF-8 or query options |
| 403 | `LOCAL_MODE_DISABLED` or `LOCAL_ONLY` |
| 404 | `BUILD_NOT_FOUND` |
| 408 / 413 / 415 | `BODY_TIMEOUT` / `BODY_TOO_LARGE` / `INVALID_CONTENT_TYPE` |
| 409 | `BUILD_DIGEST_MISMATCH`, `INCOMPATIBLE_BUILDS`, or `REVERSED_BUILD_ORDER` |
| 503 | `BUILD_INSPECTION_FAILED`, or an existing worker availability/concurrency/output failure |
| 504 | `EXECUTION_TIMEOUT` |

No partial comparison is returned on failure. Source identifiers are intentionally included, as in the CLI report; this is not the redacted board-review summary, a raw-data download, a new permission grant, or a release-bound customer change feed. The HTTP addition does not expand the comparator into field-level or semantic analysis.

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

For the local HTTP increment, the committed Bench `src/corpus-build-diff-workflow.js` and `test/corpus-build-diff-workflow.test.js` were reread at `c6d693613478f32e0b0d7dafe918d8e51274ffcc`: exact immutable references, explicit same-identity digest differences, and semantic nonclaims remain the governing lessons. The native `src/caravan-change-feed-workflow.js` is untracked in that sibling and is not cited as committed evidence for this increment. Its working state remained 53 modified tracked files and 74 untracked files on `codex/payloados-0.7-baseline`; nothing was imported, edited, installed or executed there.

Verification covers route gating and closed contracts, fresh worker-process parity with the direct comparator (including legacy CLI builds), every comparison error, unchanged temporary file hashes, and an actual built-server Carrier comparison. Run `npm run check` and `npm run e2e:production`; set `GAT_INTEGRATION=1` only with the pinned local runtime to include the unchanged IFC acceptance workflow. Operator evidence, board history, and the BIM source/runtime pin are not test fixtures and are preserved.

Executed for this increment: `npm run check` passed TypeScript, ESLint, 29 Rust tests, and 1,257 JavaScript/TypeScript tests across 55 files (six optional GAT tests skipped). The new route and worker-process files account for 87 tests. With `GAT_INTEGRATION=1`, `npm run e2e:production` passed the production build, build-trace guard, and all three HTTP workflows: Carrier production, pinned supported/blocked IFC audits, and historical Carrier build comparison. Existing operator evidence and coordination file hashes were unchanged; the pinned GAT execution checkout remained clean at `80272f94107cce4f70c81e57915800b04c5944a6`. No dependency versions changed.
