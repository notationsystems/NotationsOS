# Local source connectors

Payload OS has an operator-only acquisition connector for **FMCSA Company Census**, dataset `az4n-8mr2`. It feeds the existing local evidence rail, not the fixture customer API. The source is `fmcsa-company-census`; the prototype's `fmcsa-qcmobile` remains a different, credential-dependent API. See the [market-value connection queue](SOURCE_CONNECTION_PROGRAM.md) for all 21 inventoried sources and their blockers.

## Exact initial slice

The checked-in request selects **USDOT 80806**, a U.S. corporation, for one present source snapshot. The source does not provide historical state through this query. FMCSA describes Census as a daily snapshot approximately 24 hours behind its database; `mcs150_date` is the source filing date, not the capture time. Census does not establish comprehensive operating authority or insurance coverage. [FMCSA program](https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program)

The profile accepts 1–25 unique, explicit corporate USDOT identifiers. The query always requires `business_org_desc='CORPORATION'` and `phy_country='US'`. Its 15 fields are pinned in `CENSUS_FIELDS`: identifiers, legal name, organization/status/operation codes, country/state, power-unit and driver counts, MCS-150 date/mileage/year, and the first docket's prefix/number/status. No street address, phone, email, fax, officers or DUNS is requested. Missing fields remain null; source quantities remain source text. A missing requested identifier is `notReturned`, not proof of nonexistence. Invalid or unexpected fields quarantine the entire response.

This is a source observation contract, not the synthetic Caravan Carrier JSON contract. The connector does not run identity resolution, turn a Census record into an admitted Carrier, assemble a corpus, or infer a business recommendation.

**Continuity update (2026-09-06 UTC):** retained `CAPTURED` responses now enter a separate FMCSA-specific adapter and exact-reference v2 candidate build through operator commands. This preserves the capture contract above; it does not force observations into synthetic Carrier v1 or grant admission/release/customer delivery. See [Real-source continuity](REAL_SOURCE_CONTINUITY.md) for contracts, commands and the executed one-record acceptance.

## Operator commands

From the repository root in PowerShell:

```powershell
$env:PAYLOAD_SOURCE_COLLECTION = '1'
npm run source -- capture --request examples/sources/fmcsa-company-census.json
Remove-Item Env:PAYLOAD_SOURCE_COLLECTION
npm run source -- inspect --request-id fmcsa-census-80806-2026-09-05-qualification
```

The opt-in is process-local. Remove it after collection; no persistent environment or credential setting is modified. The default evidence root is `.payload/source-qualification`, separate from `.payload/evidence` and the board. Both commands support an operator-controlled `--root <directory>`. Do not rotate roots or erase reservations to bypass request limits. JSON requests are closed and limited to 8 KiB; hosts, URLs, paths, clocks, headers, credentials, pagination and retries cannot be supplied inside them.

Exit `0` means captured-and-parsed or help; `2` means a retained failure, quarantine or incomplete run; `1` means a command/integrity/storage error. Output includes source-scoped observations and full local references, but not raw response bytes, local filesystem paths or network diagnostics. It is operator data, not a customer delivery response. No web server is needed; there is no new HTTP or board collection trigger.

## Capture and readback

`closed request → qualification policy → immutable intent → request-budget reservations → fixed HTTPS request → original-byte intake → source parser → immutable outcome → dependency readback`

- **Policy first.** Both INTERNAL INGEST and DERIVE must be allowed before contact. The same code-owned source declaration is evaluated at capture. Only `source-qualification` is permitted. The [catalog](https://catalog.data.gov/dataset/company-census-file) labels access public but the license unknown; the declaration permits narrow internal qualification, **not** customer redistribution, public export, model training, or proprietary trading. Its identifier says provider-license-unresolved. The intent binds the review date, official reference URLs and operator-declaration basis. These URLs are research pointers, not immutable copies or independently verified permission evidence.
- **Time-bounded authority.** This initial declaration is effective from 2026-09-05 through, but not including, 2026-10-05 UTC. New captures after that fail pending explicit review/versioning. Local evidence retention is an operator-declared history policy, not a provider retention guarantee. No record is automatically deleted on policy expiry. Future policy/adapter versions must preserve historical v1 validation, not rewrite old intents.
- **One intent, at most one request.** A create-only intent binds request, exact query, adapter version, policy and backend time before any provider call. Same ID and scope return history even with collection disabled or the policy now expired. A changed scope conflicts. An incomplete intent is never automatically resumed. A deliberately authorized retry needs a new request ID and consumes a new budget slot; it cannot replace the original.
- **Bounded network.** One fixed HTTPS host/path; public IPv4 DNS answers checked and pinned to the connection; certificate/hostname verification retained. No IPv6 fallback, caller credentials, cookies, proxy selection, redirects, retries or compressed bodies. The total DNS-through-body deadline is 10 seconds, headers 8 KiB, body 256 KiB, and query at most 25 rows. HTTP 429 records rate limitation, not retry. The keyless provider quota is unspecified; these are local safety bounds, not an asserted provider allowance. [Socrata keyless access](https://dev.socrata.com/docs/app-tokens.html)
- **Permanent budgets.** Atomic create-only files permit at most one outbound attempt per UTC minute and four per UTC day per configured root, across processes. Attempts that fail consume their slots. No stale-lock removal or mutable counter reset. These limits are not account-wide or cross-machine scheduling, and trusted operators can change roots; there is no production distributed quota service.
- **Bytes before interpretation.** Accepted nonempty, bounded HTTP 200 JSON-media response bytes enter `LocalEvidenceIntake` unchanged, with original content digest and acquisition receipt, before parsing. Invalid UTF-8, invalid/duplicate JSON keys, scope drift or parser mismatch retains those bytes with `QUARANTINED`. Rejected transport bodies (non-200, wrong media, encoding, over-limit or empty) are not retained; their safe failed outcome is. A mid-storage or receipt-publication failure preserves whatever was already written and leaves `INCOMPLETE`; it does not claim a finished capture.
- **Inspect without mutation.** Readback verifies intent/query/policy/budget bindings, local evidence digest, exact acquisition manifest, chronological consistency and the parser result. A quarantine must fail the same parser. Inspection does not call the network or clock, renew rights, or modify state. ETag and provider Last-Modified are separately retained, not promoted to capture time. Source filing date, provider refresh and local capture remain different clocks.

The receipt's `CAPTURED` state means only that the selected response was preserved and parsed. Empty arrays can still be valid captured responses and carry all requested IDs in `notReturned`. Results always declare unresolved canonical identity, no canonical admission, no source-truth claim, no independent verification and no customer-distribution permission. There is no normalization/build compatibility shortcut into existing candidate machinery.

## Storage and failure boundaries

`source-captures/<request-id-hash>/intent.json` and `receipt.json` are create-only. `source-budgets/fmcsa-company-census/<UTC-day>/` holds permanent minute/day reservations. Source acquisitions and content-addressed objects use the existing `acquisitions/` and `objects/` layout. Raw records and receipts stay under git-ignored `.payload`; do not commit them or credential material.

This is a trusted-local-filesystem mechanism: hashes detect inconsistencies, not malicious rewriting of the whole history by an authorized filesystem writer. It is not authenticated provenance, physical WORM, independent verification, production tenancy, a distributed job queue or a power-loss durability guarantee. The source has no customer release/delivery route. Existing operator history is never repaired or overwritten; incomplete evidence remains available for diagnosis under its original request.

## Verification and continuation

Offline transport, parser, capture-history and CLI tests live in `src/acquisition/*.test.ts`. They never contact a provider. Run `npm run check`; `npm run e2e:production` additionally checks the existing built application and local production workflows. Live qualification is a separate explicit command using the guarded connector, never an ordinary CI test.

Continue one eligible source at a time through [SOURCE_CONNECTION_PROGRAM.md](SOURCE_CONNECTION_PROGRAM.md). Reuse the evidence and immutable-intent approach, but do not broaden this FMCSA endpoint allowlist or reuse its source policy for another provider. Each source needs its own bounded request, parser, current rights basis and acceptance evidence. High-value sources lacking credentials or compatible rights remain blocked while the next eligible source advances.

Live acceptance results are recorded below only after the operator command and separate local readback have actually run.

### Executed 2026-09-05

The checked-in request completed through the actual guarded HTTPS/CLI path: one corporate record for USDOT 80806, 371 source-original bytes, captured at `2026-09-05T20:48:11.364Z`. Provider Last-Modified was `Sat, 05 Sep 2026 10:16:48 GMT`; these are not the same clock. No contact fields were requested or returned. The record remains `UNRESOLVED`, unadmitted and internal-only.

- Request: `fmcsa-census-80806-2026-09-05-qualification`.
- Original-byte digest: `sha256:cf37d1d04131c3d0ccca0098d8f202c170eb094004efdafd9a9486f34f3b2095`.
- Acquisition digest: `sha256:6e4782de89c03d29fdf20b20a07d1847367683d5cf6c24aa71f42ec3841bdbae`.
- Capture receipt digest: `sha256:b4f88660506a383bc0e20dd92685ad12a0beffdde4c696dd40498682ee65deff`.

A separate built-CLI `inspect` and same-request `capture` with collection disabled both succeeded with the identical historical receipt. All six files in the qualification root were hash-identical before/after those reads. No second provider capture occurred. These references permit local verification where the ignored evidence is retained; the acquired records are not published in Git, and digests alone are not independent certification.

Verification completed for this increment: `npm run check` passed TypeScript, ESLint, 29 Rust tests and 1,676 JavaScript/TypeScript tests across 62 files (six optional GAT tests skipped). This includes 393 new offline acquisition tests and two product-presence tests. With `GAT_INTEGRATION=1`, `npm run e2e:production` passed the production build, history/runtime trace exclusion guard and all three real-HTTP workflows. Lint and TypeScript now exclude ignored `.payload` operator histories and dependency checkouts; none of those files were modified to satisfy tooling. Existing evidence/board hashes, the dirty sibling Kernel checkout and the clean pinned GAT runtime were preserved.
