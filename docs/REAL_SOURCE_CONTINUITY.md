# Real-source continuity

Implementation receipt: 2026-09-06 UTC (2026-09-05 local). The milestone remains one complete path from a real observation to an inspectable, versioned information product. This increment completes **retained real capture → typed source candidate → exact, inspectable candidate build**. It does not rename an unadmitted build as a release.

## Present path and remaining work

| Boundary | Current status |
|---|---|
| Real FMCSA observation | Captured previously under the bounded Company Census qualification policy; original bytes and receipts retained |
| Source-specific normalization | Implemented and executed over that retained observation; no new network request |
| Versioned candidate membership | Implemented as a separate v2 contract, with exact normalization/candidate references and dependency readback |
| Evidence-linked authored notations | Not implemented; authored interpretation remains separate from admitted corpus state |
| Admission and canonical identity authority | Not implemented; no sibling uncommitted code imported and no candidate admitted |
| Internal release and real-source query interface | Not implemented; browser/customer feeds and MCP distribution still use demonstration releases |
| Correction and superseding release | Not implemented for real-source v2 builds; a changed observation is not automatically a justified correction |
| External customer workflow/pilot | Not completed |

Earth Twin v1 has been integrated from frontend head `efeb70a`: it draws two declared **synthetic fixture** positions. FMCSA country/state fields do not provide facility points, asset positions, trajectories or precise geography and are not drawn on the globe.

## Source-specific normalization

`src/acquisition/census-adapter.ts` defines the immutable `fmcsa.company-census-observation/v1` adapter. `src/acquisition/census-normalization.ts` binds it to the acquisition rail. The original source parser, synthetic Carrier adapter and their historical digests are unchanged.

A closed `payload.fmcsa-census-normalization-request.v1` selects one USDOT from an exact `{requestId, receiptDigest}` capture reference. The store reopens the complete source capture, requires `CAPTURED`, verifies the original acquisition and bytes, and evaluates `INTERNAL / DERIVE / source-qualification` at normalization time. Missing, quarantined, failed, incomplete or mismatched captures cannot produce candidates.

The result is `FMCSACompanyCensusObservation`, not synthetic `Carrier`. Each of the 15 source fields retains its original text/null, presence (`PRESENT`, `EXPLICIT_NULL`, `OMITTED`), separately typed value, unit and interpretation. Zero remains present. USDOT and docket identifiers remain strings. Counts become nonnegative integers. Source codes remain uninterpreted; country/state codes are not coordinates. Filing dates become date-only values without an invented timezone. Mileage year `"0"` retains its raw value and unresolved interpretation, not calendar year zero. Mileage magnitude is typed but its dataset unit remains unresolved; no conversion is performed. Power-unit and driver units follow the [FMCSA program's field description](https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program), not an inferred operating-authority or insurance determination.

The whole original response is validated before row selection. Field presence is recovered from validated bytes without changing the earlier parser's null-filled observations. A requested but unreturned identifier produces a retained `NOT_RETURNED` run with no candidate. That means the bounded corporate-only query did not return it—not that the carrier does not exist or has ceased operating.

Clocks remain separate:

- `capturedAt`: original acquisition time.
- `providerLastModified`: provider HTTP metadata, not the row's effective date.
- `mcs150_date`: source filing date, not validity start.
- `knownAt`: normalization's declared backend time.
- `validTime`: `UNOBSERVED`, with null bounds. The snapshot establishes no valid-time interval.

The candidate binds exact capture intent/receipt, acquisition, original content, intake receipt, source policy, derivation decision and adapter references. Source-scoped identity remains `UNRESOLVED`; canonical ID is null. Source truth, field accuracy, admission, independent verification and customer distribution are not claimed.

## Versioned candidate build

`src/data-os/local-census-candidate-build.ts` extends the local build pattern under new `payload.local-candidate-build-request.v2` / `payload.local-candidate-build.v2` schemas. Legacy Carrier v1 is unchanged. The definition selects `CARAVAN / FMCSACompanyCensusObservation`, a version and explicit source classes. Members are exact `{id,digest}` normalization references, not names that silently follow a newer version.

The build permits 1–64 unique references and 1–16 source classes, sorts by UTF-16 normalization ID, verifies each dependency closure, rejects `NOT_RETURNED`/mismatched members, and selects at most one version per source-scoped identity. Member knowledge times must be at or before `knownThrough`, which must be at or before build time. Each member needs a fresh permitted INTERNAL DERIVE decision at build time.

Output contains reference-only membership, knowledge/validity metadata, source-policy decisions, definition/contract digests and a membership root. It remains `UNADMITTED`, not an internal release or admission decision. The root is a local integrity commitment, not independent certification. The existing v1 comparison service does not accept v2 by implication.

## Operator path

No server or provider call is needed. Commands default to `.payload/source-qualification`; an explicit operator `--root` must identify the same repository throughout. No replacement input bytes or arbitrary URLs can be supplied for normalization/build. Capture and normalization requests remain bounded at 8 KiB; build requests have a separate 32 KiB bound for maximum exact membership. Unknown fields, duplicate JSON keys, credentials and caller clocks are rejected.

```powershell
npm run source -- normalize --request examples/sources/fmcsa-company-census-normalize.json
npm run source -- inspect-normalization --normalization-id fmcsa-census-80806-2026-09-05-normalized-v1
npm run source -- build --request examples/sources/fmcsa-company-census-build.json
npm run source -- inspect-build --build-id fmcsa-census-80806-2026-09-06-candidate-build-v1
```

These checked-in requests pin actual local qualification history. They cannot recreate original bytes in a fresh clone. Missing dependencies stay unavailable; do not substitute another capture or edit the pinned digest to make a request pass. A different authorized capture needs a new exact request after receipt inspection. The build's member digest and knowledge cutoff must come from that selected normalization.

Exit 0 means normalized, built or successfully inspected; exit 2 means retained `NOT_RETURNED`; exit 1 means request, policy, eligibility, integrity or storage failure. Fixed error codes distinguish selection/cutoff problems from invalid history and unconfirmed publication. Normalization JSON includes source-derived fields, but no original response body, filesystem paths or credentials. `rawBytesIncluded:false` does not mean derived fields are public; this CLI is operator-only.

New create-only records live under `source-normalizations/` and `source-candidate-builds/`. Identical requests return verified history; changed requests conflict. Readback recomputes original decisions and interpretation at stored times. It does not renew current rights, contact providers, edit budgets or repair history. Valid results remain inspectable after policy expiry; new derivation/build after expiry is denied. Publication readback and concurrent-winner handling preserve the first committed result.

The existing policy permits only **internal source qualification**, not unrestricted internal commercial use, customer redistribution, trading, model training or release activation. Admission/publication—even internally—needs a reviewed contract and matching source-use basis. No provider license was granted by this implementation.

## Executed against retained real evidence

The existing 371-byte corporate USDOT 80806 capture was reopened without collection. At `2026-09-06T01:29:10.984Z`, the adapter produced one unadmitted candidate. At `2026-09-06T01:30:14.817Z`, its exact one-member v2 build was created and read back.

| Reference | Digest |
|---|---|
| Original content | `sha256:cf37d1d04131c3d0ccca0098d8f202c170eb094004efdafd9a9486f34f3b2095` |
| Normalization | `sha256:e94800cf1216ee7de525e50872326c7e6d4ec4031e62fce1ba70c600890efb00` |
| Typed candidate | `sha256:5ca8b5ceed782c2b5781b505314bb7c4178614c2489624976be7fe75e61ec60c` |
| Candidate build | `sha256:cc2200811e3601db0766e19dc6fd0e4427a753545d946fac8027e0ffe96d953a` |
| Membership root | `sha256:78b18bb3ec51c73fd1162c98a2c06243e5dc87990f53633964a27e46f4af83be` |

Only references and implementation are committed. Original bytes and derived operator records remain under ignored `.payload`. These hashes identify local artifacts, not independently certified facts.

Separate built-CLI inspection and identical-request retries returned the same normalization/build digests and `EXISTING` status. All eight files in the qualification repository were hash-identical before and after those reads. The six pre-existing capture/evidence/budget files retained their original hashes; the two added records are the normalization and candidate build. No new capture or budget reservation was made.

## Verification

Verification for this increment on Windows: `npm run check` passed typecheck, ESLint, 29 Rust tests and 2,083 JavaScript/TypeScript tests across 85 files; six optional GAT unit tests were skipped by the default configuration. New coverage includes 59 adapter, 88 normalization, 53 candidate-build and 27 CLI tests, plus a product-presence assertion. Cases include missing/null/zero, malformed source/requests, NOT_RETURNED, wrong exact references, expired policy, historical retry, rehashed corruption, concurrency, failed publication, maximum build size and fresh-process readback. No offline test contacts a provider.

`npm run build` passed, including the deployment-trace exclusions. Installed Edge ran 118 regular desktop/Pixel 7 browser tests successfully (18 environment/device-specific cases skipped), including Earth Twin v1 placement and the still-fixture customer feed. `GAT_INTEGRATION=1 node scripts/production-e2e.mjs` passed all three real HTTP workflows, including the pinned Windows GAT runtime, using isolated temporary evidence. Dedicated notation browser tests were not rerun in this source increment; the authored kernel and its 29 Rust tests remain unchanged. The subsequent frontend `cb6dc98` merge changed only the Earth Twin verification document, not the tested implementation.

## Next contract: authored references, then admission

Saved references need a closed logical repository selector (`SOURCE_QUALIFICATION` versus `LOCAL_PRODUCTION`), target kind and exact digest. Acquisitions, v1/v2 builds and GAT reports/receipts retain their distinct schemas and proof dependencies; a GAT report's content hash alone does not pin its execution receipt. Resolution must be read-only, operator-gated, and unable to accept arbitrary paths, execute GAT, collect sources or silently advance references. Local integrity is not current delivery permission or admission.

Rust changes must preserve existing histories: unconditionally adding an empty reference array would change replayed snapshots. References should serialize only when present; explicit reversible attach/detach commands must preserve references across notation edits and enforce bounded IDs/commands. The kernel stores authored links/interpretation, not evidence bytes or admission decisions. These are implementation requirements, not supported commands today.

Admission then needs one versioned authority binding profile, exact candidate/build coverage, identity decisions, evidence requirements, reasons and release eligibility. No mutable sibling checkout supplies it; see [the committed-contract baseline](CROSS_REPOSITORY_BASELINE.md). Internal releases and later corrections need immutable lineage and policy checks. A second observation must not overwrite the first or become a supersession merely because its digest differs. The frontend can consume these contracts as they become implemented; it must not present today's candidate build as finished information inventory.
