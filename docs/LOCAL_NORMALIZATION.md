# Local Caravan normalization

Status update (2026-09-05): references below to six absences or no live connectors describe this document's earlier milestone. One bounded, operator-only FMCSA Company Census connector is now implemented for internal qualification; see [Local source connectors](LOCAL_SOURCE_CONNECTORS.md). It establishes neither recurring ingestion nor customer live feeds. All other authority, storage, identity, execution and verification boundaries below remain unchanged.

Payload OS can now parse one bounded, locally acquired Carrier JSON record into a provenance-bearing candidate. This is an internal production step for Caravan, not a new customer product or a public API. It is separate from [local evidence intake](LOCAL_EVIDENCE_INTAKE.md): capture alone still produces no normalized record.

```text
Saved acquisition + exact source-bound adapter profile
→ reopen and verify acquisition and source bytes
→ evaluate exact INTERNAL DERIVE at normalizedAt
→ parse the fixed Carrier JSON contract
→ persist NORMALIZED candidate or QUARANTINED run
→ inspect by recomputing the historical decision and parser output
```

Normalization alone performs no build, canonical admission, identity merging, release activation or customer delivery. A separate [local candidate builder](LOCAL_CANDIDATE_BUILDS.md) now assembles explicitly selected successful normalizations into an unadmitted, time-bounded manifest. The existing corpus/feed API still serves committed demonstration releases.

## Run the demonstration

From the repository root, after `npm install`:

```sh
npm run evidence -- capture --request examples/carrier/acquisition.json --input examples/carrier/source.json
npm run evidence -- normalize --request examples/carrier/normalization.json
npm run evidence -- inspect-normalization --normalization demo-caravan-carrier-normalization-001
```

The [source](../examples/carrier/source.json), [acquisition request](../examples/carrier/acquisition.json) and [normalization request](../examples/carrier/normalization.json) are synthetic. They assert no real carrier or independently established source license. Unlike the original notice in `examples/evidence`, this acquisition declaration permits both `INGEST` and `DERIVE` for `INTERNAL` use with purpose `CARAVAN_LOCAL_DEVELOPMENT`. The original notice remains an ingestion-only example.

No web server or coordination worker is required. All three commands default to `.payload/evidence`; pass the same `--root <directory>` to each command when selecting a different store. Normalization reads the captured bytes, not a replacement input file, and performs no network retrieval.

Normalization returns `status: "CREATED"` or `"EXISTING"` and a `run`; inspection returns the saved, recomputed `run`. Both include `integrity: "RECOMPUTED_LOCAL"`, `rawBytesIncluded: false` and `derivedFieldsIncluded`, which is true only when a candidate exists. Derived text fields are included in successful output even though raw source bytes are not.

| Process exit | Meaning |
|---|---|
| `0` | Successful capture or a `NORMALIZED` run; inspection also succeeds for a normalized run |
| `2` | A persisted `QUARANTINED` run, including when returned by `inspect-normalization`; inspect the JSON reasons |
| `1` | Request, policy, source-binding, storage or integrity error, printed as JSON on stderr |

A quarantine is a recorded rejection, not a successful candidate and not a reason to assume nothing was written. A publication failure can also occur after a result was committed; retry the identical request to discover the saved result.

## Fixed request and source contract

Every field in the normalization request is required; unknown fields are rejected.

| Field | Contract |
|---|---|
| `schema` | Literal `payload.local-normalization-request.v1` |
| `normalizationId` | Stable id for this request and its retries |
| `acquisitionId` | Existing local acquisition, reopened and verified before use |
| `purpose` | Use to evaluate separately for `DERIVE` |
| `profile.id`, `profile.version` | Declared profile identity and version, bound into the request digest |
| `profile.sourceRegistrationId`, `profile.sourceId` | Must exactly match the captured acquisition's registration and source |
| `profile.adapterId` | Only `caravan.carrier-json/v1` is supported |

The profile cannot supply a replacement schema or normalization program. The code-owned descriptor in `src/data-os/caravan-carrier-adapter.ts` fixes version `1.0.0`, domain `CARAVAN`, record type `Carrier`, media type `application/json` and source schema `caravan.carrier-source.v1`.

The adapter actually decodes the captured bytes as UTF-8 and parses JSON. It rejects invalid encoding, invalid JSON, duplicate object keys, unknown fields and omitted required keys. Its exact source contract is:

| Source field | Behavior |
|---|---|
| `schema` | Literal `caravan.carrier-source.v1` |
| `sourceRecordId` | Opaque, nonempty source identifier, at most 180 characters, without whitespace; preserved unchanged |
| `legalName` | Required nonempty text, at most 300 characters after trimming outer whitespace |
| `registrationNumber` | Required key; nonempty text up to 180 characters after trimming, or explicit `null` |
| `operatingSite` | Required key; nonempty text up to 180 characters after trimming, or explicit `null` |
| `validTime` | Exact object with `state`, `from` and `to`; rules below |

Text normalization trims outer whitespace only: it does not alter case, collapse internal whitespace, infer identifiers or merge organizations. An explicit `null` for either optional-valued field omits that field from candidate `fields` and adds its name to sorted `missingFields`. An omitted source key, empty string or invalid value is a contract failure, not an inferred missing value.

`UNOBSERVED` valid time requires both bounds to be `null` and preserves them as null. `OBSERVED` requires a valid timezone-qualified `from` and an optional `to` instant that is not before `from`; observed instants are normalized to UTC ISO strings with milliseconds. Knowledge time is the run's `normalizedAt`, which cannot precede evidence storage. Missingness and unobserved time never become zero or guessed dates.

Acquisition accepts up to 8 MiB, but this adapter accepts source bytes only up to 64 KiB. Normalization request files and persisted run metadata are each bounded at 64 KiB. A larger captured source cannot silently enlarge the parser's contract.

## Policy, rejection and quarantine

The service internally evaluates `operation: "DERIVE"`, `audience: "INTERNAL"`, the normalization purpose and `requestedAt: normalizedAt` against the acquisition's exact operator-declared registration. Only `ALLOWED` proceeds. Prior `INGEST` permission does not imply `DERIVE`, publication, model training, redistribution or any other permission. A fresh normalization outside the declared policy window is denied even if acquisition was previously allowed.

An unsupported adapter, wrong source/profile binding, unavailable or corrupt acquisition, invalid request or denied derivation raises an error; it does not create a candidate or a new quarantine run. After those gates, a media mismatch or parser failure persists `state: "QUARANTINED"`, `candidate: null` and an explicit reason such as `MEDIA_TYPE_MISMATCH`, `SCHEMA_MISMATCH`, `RECORD_CONTRACT_MISMATCH`, `INVALID_SOURCE_JSON`, `INVALID_SOURCE_ENCODING` or `SOURCE_TOO_LARGE`.

Quarantine is a decision in normalization metadata. It does not move, delete or rewrite the acquired bytes, establish a separate storage zone, or authorize a repaired interpretation. A changed source needs a separate valid acquisition; a changed normalization request needs a new normalization id.

## Candidate, provenance and durable inspection

A successful run contains a `payload.local-carrier-candidate.v1` record with domain `CARAVAN`, record type `Carrier` and state `UNADMITTED`. Its identity is `UNRESOLVED`: it retains the exact acquisition `sourceId` and parsed `sourceRecordId`, with `canonicalId: null`. A registration number or shared label is not a cross-source identity mapping.

The candidate binds acquisition id/digest, evidence id/content digest, receipt id/digest, source-policy id/digest, derivation-decision id/digest, and adapter id/version/contract digest. Its normalized fields, missingness, valid time and knowledge time are also covered by its digest. The adapter digest binds the declared parser contract; it is not a signed code attestation or proof of independently verified execution.

The `payload.local-normalization-run.v1` record explicitly states:

```json
{
  "mode": "LOCAL_DEVELOPMENT",
  "policyAuthority": "OPERATOR_DECLARATION",
  "canonicalAdmission": false,
  "sourceTruthClaimed": false,
  "fieldAccuracyClaimed": false,
  "independentlyVerified": false
}
```

The complete run and its candidate, if any, are published together in one create-only file at `.payload/evidence/normalizations/<sha256-of-normalization-id-hex>.json`. They use the existing bounded local-file helper: temporary-file write and `fsync`, followed by atomic hard-link publication without overwrite. There is no separate partially published candidate file. These local metadata hashes are not Kernel canonical artifacts, signatures, authenticated authorship or physical WORM storage.

The request digest binds the full manifest, acquisition digest and adapter descriptor digest. An identical retry returns the original saved run and original `normalizedAt`; it does not assert a new derivation at the retry time. A different valid request under that id conflicts. Concurrent identical requests read and verify the saved winner. Invalid requests, source mismatches or corrupt existing records can fail earlier checks instead of returning a conflict.

Inspection is read-only. It reopens and verifies the acquisition and bytes, reevaluates the stored declaration at the original `normalizedAt`, reruns the actual parser and compares the complete expected run, candidate and digests. It reconstructs the historical declared decision, grants no current access or retention permission, and checks no subsequent external revocation. Changed adapter contracts or damaged stored state fail recomputation; inspection does not silently migrate, repair or overwrite them. Preserve conflicting or corrupt files for investigation. No automatic deletion, repair or garbage collection is provided.

## What was learned from Notations Bench

The following paths are in the read-only sibling `Notations Kernel`, studied with its `AGENTS.md`, `PROJECT_CONTEXT.md` and `docs/CARAVAN_API_PRODUCT.md`. They identify the actual reference behavior, not dependencies imported into this local runtime.

| Bench evidence | Application and boundary here |
|---|---|
| `test/caravan-entity-resolution-workflow.test.js` — `sourceRecord` | Native Carrier examples use `legalName`, `registrationNumber`, missing `operatingSite` and unobserved time. These ground this bounded field choice; the exact JSON schema and executable parser are new local work. |
| `src/domain-corpus-profiles.js`; `src/caravan-source-adapter-profile-workflow.js` and its test | Retain Caravan ownership and explicit source/profile bindings. A declared profile does not establish a live connection, credentials or transport. The local profile binds one exact acquired source. |
| `src/source-connector-workflow.js` and its test | Media/schema drift can have a verified quarantine decision without becoming normalization-eligible; wrong source binding fails separately. Bench accepts a supplied schema fingerprint. This local parser checks actual JSON bytes against a code-owned schema, without implementing transport or moving storage zones. |
| `src/evidence-normalization-workflow.js` and its test | Preserve exact acquisition/evidence/receipt/method references, missingness and both time roles. Bench wraps supplied normalized fields and does not attest extraction execution. This local increment executes a bounded parser but still claims neither field accuracy nor source truth. |
| `src/source-policy-workflow.js`; `src/authorized-acquisition-workflow.js` | Bind operation, purpose, audience and time to the exact source registration. The separate `INTERNAL DERIVE` guard is a local extension beyond Bench normalization's acquisition-authorization check. |
| `src/corpus-workflow.js`; `src/corpus-admission-workflow.js` and their tests | Compilation and admission are separate operations: a normalized candidate is not a build, and a build alone does not establish admission. Neither is performed by normalization. The separate local candidate builder now checks explicit member dependencies and creates a manifest, without implementing Bench admission. |

Normalization and separate explicit candidate builds are now implemented locally. Identity resolution, canonical domain state, corpus admission and release remain subsequent work. No synthetic stage-completion records are added to fixtures, and the board does not automatically run normalization or candidate builds. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
