# Local evidence intake

Payload OS has a local evidence rail for capturing a file under a declared source-use policy and reopening the resulting acquisition to recompute its byte and receipt integrity. This is an internal means of information production. The company mandate and three domain products remain defined in [Economic architecture](ECONOMIC_ARCHITECTURE.md).

This increment implements only this path:

```text
Local file + operator-declared source registration
→ evaluate exact INTERNAL INGEST at capturedAt
→ capture content-addressed bytes and read them back
→ publish acquisition metadata and storage receipt
→ inspect and recompute the saved acquisition
```

Intake alone does not normalize the file, create canonical domain records, build a corpus, activate a release or send data to a customer. The separate [local normalization](LOCAL_NORMALIZATION.md) path now parses one fixed Caravan Carrier JSON contract after evaluating its own DERIVE permission. The source registration remains an operator declaration. Its evaluation does not independently establish that the operator possesses the stated source rights.

## Run the demonstration

From the repository root, after `npm install`:

```sh
npm run evidence -- capture --request examples/evidence/request.json --input examples/evidence/notice.txt
npm run evidence -- inspect --acquisition demo-caravan-local-notice-001
```

The example notice is explicitly synthetic. It establishes no real berth condition, shipment event or corpus record. The request declares only `INGEST` for the `INTERNAL` audience and purpose `CARAVAN_LOCAL_DEVELOPMENT`; its license identifier explicitly denotes a local demonstration declaration.

The commands run without the web server or coordination worker. Both use `.payload/evidence` by default. An explicit `--root <directory>` selects a different local store; use that same root for capture and inspection. `npm run evidence -- --help` prints the command forms. The CLI reads the supplied local input without modifying it and performs no source retrieval over the network.

Capture returns `status: "CREATED"` or `"EXISTING"`, the acquisition metadata, `integrity: "RECOMPUTED_LOCAL"` and `rawBytesIncluded: false`. Inspection returns the verified acquisition metadata with the same integrity and raw-byte fields. Neither output includes the source file's raw bytes. Errors are printed as JSON with `mode: "LOCAL_DEVELOPMENT"`, and the process exits unsuccessfully.

## Request and policy binding

The example [request](../examples/evidence/request.json) uses schema `payload.local-intake-request.v1`. Every field below is required; unknown fields are rejected.

| Field | Meaning |
|---|---|
| `schema` | Required literal `payload.local-intake-request.v1` |
| `acquisitionId` | Stable id for this intake request and its retry history |
| `evidenceId` | Id attached to the captured evidence |
| `sourceRegistration` | Exact declared source, license identifier, policy version, effective window, permitted purposes, operations, audiences and retention policy |
| `purpose` | The use evaluated against this registration |
| `mediaType` | Declared media type of the local bytes |
| `capturedAt` | Explicit ISO timestamp used for capture and policy evaluation |

The service constructs its own source-use request with `operation: "INGEST"`, `audience: "INTERNAL"`, the stated purpose and `requestedAt: capturedAt`. It evaluates the registration internally and proceeds only on `ALLOWED`. `APPROVAL_REQUIRED` and `DENIED` stop capture. The capture function also recomputes the supplied decision, including its source, purpose, operation, audience, timestamps and reasons. It does not trust an `ALLOWED` label alone.

Policy windows are half-open: the registration is inactive at `effectiveUntil` and afterward. Dates require an explicit timezone and a valid calendar instant. Storage cannot precede capture. A grant for ingestion does not grant derivation, indexing, publication, redistribution, customer delivery, model training or any other use. The original notice declaration remains INGEST-only; the separate Carrier example explicitly declares DERIVE as well. Retention declarations are validated as policy fields; no physical retention lock, expiry deletion or automatic cleanup is implemented.

## Stored acquisition

`src/data-os/local-intake.ts` defines schema `payload.local-acquisition.v1`. Its explicit status fields are:

```json
{
  "mode": "LOCAL_DEVELOPMENT",
  "policyAuthority": "OPERATOR_DECLARATION",
  "sourceTruthClaimed": false,
  "canonicalAdmission": false
}
```

The acquisition retains the complete request manifest, byte digest and length, the internally evaluated source-use decision, `BinaryEvidence` and its `StorageReceipt`. `requestDigest` binds the manifest and source-byte identity. The acquisition's `digest` covers that request, decision and capture, including the receipt's original `storedAt`. There is no separately signed receipt or authorization proof.

Metadata digests use a versioned local JSON encoding with sorted object keys and finite JSON values. This encoding and record schema are not the Kernel's canonical `Artifact`, `Claim`, `Operator` and `VerificationEnvelope` grammar. Existing `notations.binary-evidence.v1` and `notations.storage-receipt.v1` payload names are compatibility contracts; their presence does not create a canonical or signed Bench entity graph.

Reusing an acquisition id with the identical manifest and bytes returns `EXISTING` and the original saved acquisition, including its original storage timestamp. A changed request that is valid and policy-allowed returns `ACQUISITION_CONFLICT` under that id; malformed or denied requests fail validation or policy evaluation first. Identical concurrent requests converge on the saved acquisition; the losing caller reads and verifies the winner. A new acquisition id records a separate request even when its bytes already exist in the content store.

## Files, integrity and recovery

The default directory layout is:

```text
.payload/evidence/
  objects/sha256/<first-two-hex>/<content-sha256-hex>
  acquisitions/<sha256-of-acquisition-id-hex>.json
```

`.payload/` is git-ignored. Acquisition filenames are derived from the acquisition id's SHA-256 digest; the caller's identifier is not used as a path. Each object is addressed by its byte digest and reopened against that digest when read.

`FileContentAddressedStore` and the shared local-file helper publish complete files without overwriting an existing target. They write a unique temporary file, flush its data with `fsync`, then create the final name with an atomic hard link. The normal cleanup removes only that operation's temporary link. Existing identical content is reused; different content at the same final path is an error. The filesystem must support this publication operation. There is no overwrite fallback.

The service validates the request and full metadata size before publishing evidence, writes the bytes, and verifies the stored digest, length and storage key by readback. Only then does it publish the acquisition metadata. These two publications are separate: a failure after storing the object can leave bytes without acquisition metadata. A failed response therefore does not imply that nothing was written. Retry the original acquisition request to discover a committed result or complete a new publication.

Inspection reopens the saved metadata, checks its exact schema and authority fields, recomputes the request and acquisition digests, reevaluates the original declared policy at the original `capturedAt`, and checks the evidence/receipt against the actual stored bytes. This reconstructs the historical declaration; it grants no current access or retention permission and checks no subsequent external revocation. It does not create directories, return raw bytes, rewrite records or repair damaged state. Missing acquisitions return `ACQUISITION_NOT_FOUND`; malformed metadata, conflicting content or failed integrity checks remain errors.

Inputs are limited to 1 byte–8 MiB. Request and acquisition metadata are each limited to 64 KiB. Reads are bounded and check for file-size changes. Storage paths reject unsafe segments and detected symbolic links; this remains a trusted-local-filesystem implementation. The create-only API is not physical WORM storage, and flushing a file does not establish a power-loss durability guarantee. Direct filesystem modification is outside the API's protection. Metadata hashes establish internal consistency, not authenticated authorship.

A process crash can leave an unreferenced object or temporary file. There is no automatic garbage collection, deletion, repair or migration. Preserve the files for inspection and retry the original request where appropriate; this implementation does not silently discard failed intake evidence.

## What was reused from Notations Bench

The sibling `Notations Kernel` was studied read-only, including its `AGENTS.md`, `PROJECT_CONTEXT.md`, Caravan product contract and the source files below. The normalization, connector, corpus and profile tests were also reviewed. Its product boundary remains Payload OS shared rails with Caravan, Tradewind and Landshark owning their respective domains.

| Bench source | Concrete lesson carried into this increment or retained for its successor |
|---|---|
| `src/source-policy-workflow.js` — `evaluateSourceUse`, `verifySourceUseEvidence` | Recompute a decision from one exact registration, operation, audience, purpose and time; unlisted or approval-required use never becomes allowed. O applies these checks to an operator declaration, without importing the Bench's policy-evidence artifact closure. |
| `src/authorized-acquisition-workflow.js` — `captureAuthorizedEvidence`, `admittedDecision` | Evaluate INGEST at the exact capture time before storing bytes, then bind source, decision, evidence, receipt and timestamps in one acquisition. O fixes the audience to INTERNAL and records the reduced local authority explicitly. |
| `src/evidence-capture-workflow.js` — `contentAvailable`, `verifyEvidenceCaptureEvidence` | Reopen the object and verify actual byte length and SHA-256 against the exact evidence/receipt binding. O performs readback before publishing acquisition metadata; its payloads do not supply the Bench's claim or envelope. |
| `src/object-store.js` — `FileObjectStore.put`, `get` | Use SHA-256 paths, compare existing bytes on repeat writes and detect corrupt content on reads. O adds bounded reads and temporary-file/hard-link publication for its local implementation. |
| `src/file-archive-store.js` — `FileArchiveStore.put`, `get` | Bind one stable target to one content identity, accept identical retries and reject conflicting or uncommitted content. O applies that lesson to acquisition-id/request binding and keeps object publication separate from metadata publication. |
| `src/source-connector-workflow.js` | A connector binds one source registration and versioned media/schema contract. A verified quarantine decision still blocks normalization. Live transport remains future work; the separate local Carrier normalizer now checks its own fixed media/schema contract against captured bytes without moving storage zones. |
| `src/evidence-normalization-workflow.js` | Preserve exact source, acquisition, evidence, storage-receipt and method references; preserve missingness and unobserved time. Provenance verification alone does not establish extraction execution or field accuracy. The separate local normalizer now executes a bounded parser; intake alone does not. |
| `src/corpus-workflow.js` | Deterministic corpus membership and a recomputable build root are a separate later operation; byte capture is not a corpus build. |
| `src/corpus-admission-workflow.js` | Admission separately requires exact verified normalization coverage for every build member, declared record types/source classes and knowledge cutoffs. A compiled build alone does not admit records. |
| `src/domain-corpus-profiles.js` | Retain explicit domain definitions and source classes. Preserve legacy Payload artifact identifiers and digests; native Caravan logistics ownership does not justify renaming historical evidence. |

This local rail applies source-policy recomputation, content-addressed byte storage, exact receipt linkage, durable acquisition identity and read-only reinspection. It does not import the Bench verification graph, produce Kernel canonical entities or add signatures. A separate normalized-candidate path is now implemented locally and documented in [Local normalization](LOCAL_NORMALIZATION.md); identity resolution, canonical state, corpus build/admission and release gates remain subsequent work. No synthetic stage-completion records are added to the released fixtures.

The existing corpus/feed adapter continues serving committed demonstration releases. The board and local contract-review worker do not automatically ingest files or admit these acquisitions. No authentication, source-truth claim, canonical state, live connector or deployment is established by the intake CLI. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
