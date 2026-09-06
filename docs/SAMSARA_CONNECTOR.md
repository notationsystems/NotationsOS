# Samsara GPS history: bounded Caravan acquisition

Status: **implemented and offline-tested; no live fleet qualification**. This operator-only connector supplies source observations to Payload OS. It does not implement fleet operations, infer visits, publish a customer feed, or give proprietary capital activity access to customer evidence. No Samsara customer API was contacted for this increment.

## One explicit slice

The code-owned request is `GET /fleet/vehicles/stats/history`, with `types=gps`, one positive decimal `vehicleIds` identifier, and canonical UTC `startTime` / `endTime` bounds no more than 15 minutes apart. The end must not be in the future at capture. There is no caller-supplied URL, cursor, automatic pagination, vehicle enumeration or recurring synchronization.

The operator explicitly declares the organization's dashboard region: `US` → `api.samsara.com`, `EU` → `api.eu.samsara.com`, or `CA` → `api.ca.samsara.com`. A vehicle's geographic location does not select its account region. Samsara describes a separate Canadian environment and legacy Canadian accounts in the US environment. [Base URLs](https://developers.samsara.com/docs/base-url), [multi-region guidance](https://developers.samsara.com/docs/multi-region-deployment-faq).

The history endpoint fits this bounded qualification. Samsara's incremental stats feed is a subsequent synchronization contract, **not implemented here**. Neither a successful request nor `hasNextPage: false` proves complete coverage of the interval. [History](https://developers.samsara.com/docs/telematics-history), [telematics](https://developers.samsara.com/docs/telematics), [pagination](https://developers.samsara.com/docs/pagination).

## Authorization and private-data boundary

Before a live capture, retain actual fleet permission and applicable terms/privacy evidence through the existing local intake rail, then retain an authorization JSON artifact. Each reference binds an exact acquisition ID, acquisition digest and content digest. A URL, API token, synthetic example or source registration is not independent proof of permission.

`payload.samsara-authorization.v1` is a closed contract in `src/acquisition/samsara-contract.ts`:

| Field | Required meaning |
| --- | --- |
| `connectionId`, `fleetId` | Operator-defined identifiers; one connection/fleet/region binding per local root |
| `authority` | `FLEET_OPERATOR_DECLARATION`, not independent verification |
| `evidenceClass` | `CUSTOMER_FLEET` for HTTPS; `SYNTHETIC_TEST` only for the injected offline transport |
| `organizationBinding` | `OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED`; the connector does not establish token-to-fleet ownership |
| `providerApiVersion` | `UNVERIFIED`; no invented API-version date |
| `privacyBasis` | Nonempty, bounded operator declaration tied to the retained evidence |
| `termsEvidence` | Exact retained evidence reference, never a token |
| `scope` | Explicit region, single vehicle ID, and bounded UTC interval |
| `sourceRegistration` | Source `samsara-vehicle-gps`; class `authorized-fleet-telematics` for real data; purpose only `caravan-fleet-qualification`; operations exactly `INGEST`, `DERIVE`, `RETRIEVE`; audience only `INTERNAL` |

The registration must have a finite effective window of at most 31 days and `UNTIL` retention ending no later than that window. These are local qualification limits, **not claims about Samsara's retention or contractual terms**. Shorter actual grants must be respected. Current source use and the authorization/terms artifacts' own `RETRIEVE` and `DERIVE` permissions are checked before capture and inspection. Retention expiry blocks readback and exact retries; a retry does not renew permission. Historical decisions are also recomputed against the pinned original declarations. There is no external revocation polling or authority service.

The token must have the minimum relevant Samsara permission, `Read Vehicle Statistics`, limited to authorized vehicle/tag access where available. Credentials enter only the operator process through `PAYLOAD_SAMSARA_TOKEN`; live collection separately requires `PAYLOAD_SAMSARA_COLLECTION=1`. Never put a credential in a request file, command argument, screenshot, browser, board message, log, chat or Git. The transport supplies the bearer header; it does not inspect other credentials. Token-scoped API versions remain unverified in this milestone. [Authentication](https://developers.samsara.com/docs/authentication), [history endpoint](https://developers.samsara.com/reference/getvehiclestatshistory), [versioning](https://developers.samsara.com/docs/versioning).

**This is not production tenant isolation or secure managed storage.** Files are local and unencrypted by this application. Git-ignore prevents ordinary commits, not access by other local processes or cloud synchronization. For real data, choose an access-controlled private `--root` outside shared/OneDrive-synced folders and provision its permissions/encryption separately. No deletion scheduler or retention purge is implemented: expiry denies this connector's reads but does not delete bytes. Generic intake tools or filesystem access can bypass this application-level read gate; do not expose this root through generic production APIs, other tools, or customer workloads. A production custody/retention mechanism remains required.

## Retained observation semantics

Before retention, a separate envelope guard requires well-formed JSON, known fields, the exact selected vehicle and valid in-window timestamps. Wrong/additional vehicles, unknown fields, hidden nested measurements or missing/unbounded timestamps are discarded without storing the response. Scope-safe bytes are then retained as an immutable local acquisition before source-specific GPS normalization. The inspection binds each normalized observation to the exact response acquisition and `rawGpsIndex`; the raw source and derived representation remain different artifacts. `vehicleId` is source-scoped, `canonicalId` stays `null`, and identity remains `UNRESOLVED`.

| Output | Treatment |
| --- | --- |
| Source `time` | Original string plus exact integer nanoseconds; explicit offsets and up to nine fractional digits, no millisecond rounding |
| Latitude / longitude | Required finite degree values within geographic ranges; no altitude, frame calibration or survey-accuracy claim |
| Speed | Original miles per hour, or explicit `null`; `isEcuSpeed` independently supplies `ECU`, `GPS` or `UNKNOWN` |
| Heading | Original degrees, or explicit `null`; no interpolation |
| Accuracy / RTK | `NOT_PROVIDED`; no invented covariance, GNSS fix type or correction age |
| Order / duplicates | Preserved as returned; no sorting, deduplication, resampling, trajectory fitting or gap filling |
| Optional address/name metadata | Validated and retained only in the raw response, not treated as proof of facility identity |
| Missing data / missing GPS / empty GPS array | `NOT_RETURNED`, never stationary, nonexistent vehicle or failed visit |
| Pagination | Exact opaque cursor retained, never followed; `PARTIAL_PAGE` when `hasNextPage` is true, otherwise `SINGLE_PAGE_ONLY` |

Only one returned vehicle may appear, with the requested ID. GPS timestamps must fall within the requested bounds; the local validator allows endpoints without asserting the provider's inclusion semantics. Limits are 1,000 observations, 256 KiB response bytes and a 2,048-character cursor. Scope-safe invalid positions or malformed bounded measurement scalars produce retained quarantine; unknown fields or unsupported envelopes are discarded before retention. This intentionally strict adapter may need a reviewed version update when Samsara adds fields. [Published schema](https://developers.samsara.com/openapi/samsara-api.json), [timestamps](https://developers.samsara.com/docs/timestamps).

Samsara documents differing GPS update behavior and separately timed diagnostic streams; privacy controls can withhold locations. No sample-frequency, continuous trajectory or missing-data explanation is guaranteed by this connector. A location does not establish a facility visit, shipment association, unloading event, RTK fix or surveyed control. [Telematics behavior](https://developers.samsara.com/docs/telematics), [privacy controls](https://kb.samsara.com/hc/en-us/articles/360047230551-Privacy-Button-Overview).

## Transport, receipts and failure behavior

The fixed HTTPS transport requires certificate verification and TLS 1.2+, resolves and pins a public IPv4 address for the selected host, and rejects redirects, compressed responses and unsafe TLS configuration. The request has a 10-second total deadline, 8 KiB response-header limit and 256 KiB body limit. It has no fallback region, proxy, cookie, background worker or automatic retry. Root-local attempt budgets are one per UTC minute and four per UTC day; this is a qualification guard, not a distributed quota service. Provider throttling terminates the attempt. [Samsara rate limits](https://developers.samsara.com/docs/rate-limits).

Before persistence, malformed UTF-8/JSON, duplicate keys, and literal or JSON-escaped reflections of the supplied bearer token are rejected. Provider errors, headers, raw network diagnostics and credentials are not retained or returned. Only schema-invalid measurements whose vehicle/time/field scope has passed the pre-retention guard are retained with a `QUARANTINED` receipt. The reflection guard is not a general secret/PII detector; permitted source content can itself be private.

An immutable intent precedes any attempted contact. A receipt records `CAPTURED`, `QUARANTINED` or `FAILED`; interruption without a receipt remains `INCOMPLETE`. Intent, request, authorization, terms, body, parse result and budget bindings are rechecked on inspection. Exact retries do not recontact the provider or repair history. Changed requests under an existing ID conflict. Local hashes detect inconsistent files; they are not third-party attestations or protection against an operator coherently rewriting an entire store.

## Operator workflow

The executable synthetic example is `src/acquisition/samsara-demo.ts`, not a permission template for real data:

```sh
npm run samsara -- demo
npm run samsara -- inspect --request-id samsara-synthetic-capture-v1 --root .payload/samsara-synthetic-demo
```

It preserves invented terms, authorization and three GPS records, uses `SYNTHETIC_OFFLINE`, reads no real token, and makes no provider contact. Its seven-day declaration is fixed on first creation and never renewed by replay. Keep it separate from private evidence.

For an authorized real qualification:

1. Select a private root and capture the actual permission/terms artifact there using `npm run evidence -- capture --request <intake-manifest.json> --input <local-evidence-file> --root <private-root>`. Its declaration must permit the required current use. Do not use synthetic permissions.
2. Populate and validate the authorization contract above with actual scope and the returned exact terms reference, then capture that JSON in the same root through the same intake command. Neither artifact contains credentials.
3. Form a closed request with `schema: "payload.samsara-capture-request.v1"`, a new `requestId`, and `authorization: { acquisitionId, acquisitionDigest, contentDigest }` from that exact capture. It contains no query overrides, token or clock.
4. Securely supply the scoped credential and explicit collection opt-in to the operator process, then run `npm run samsara -- capture --request <request.json> --root <private-root>` once.
5. Read back with `npm run samsara -- inspect --request-id <id> --root <private-root>`. Inspect the state and pagination; do not automatically widen scope or mint retry IDs.

CLI exit `0` means a single-page observation result or help, **not scientific validation or complete coverage**. Exit `2` means a retained failed/quarantined/incomplete, partial-page or not-returned result. Exit `1` is a sanitized scope, permission, credential, integrity or other error. Output contains private vehicle/timestamp/position data for successful inspection; keep stdout inside the same custody boundary.

## Architectural boundary

This is an acquisition adapter feeding a source-linked local representation. It does not change the Bench-derived 21-source inventory, FMCSA history, Carrier candidate schema, Earth Twin fixtures, notation kernel or public API. Its source class is not a new firm/customer category. Facility identity, geofence/visit derivation, appointment/gate comparison, evidence-linked notations, admission profiles, versioned internal releases and customer delivery remain separate work. No live qualification, independently verified fleet authority, managed execution, geodesic service or completed pilot is claimed.

## Verification

The implementation is tested with synthetic bytes and mocked transport. The final verification receipt below records commands actually executed; provider access and field accuracy require a separately authorized real capture.

### Local receipt — 2026-09-06 UTC

- 596 Samsara tests: transport 176, parser/pre-retention guard 195, authorization/request contract 73, CLI 49, store 103. Coverage includes precision, missingness, wrong-scope discard, safe quarantine, token reflections, expired current use, partial pages, immutable retry, concurrency and rehashed invalid history.
- Typecheck, repository lint and 29 locked Rust tests passed. The first full `npm run check`, overlapping the production build, had one 60-second timeout in the existing state-kernel version-ceiling test; 3,615 tests passed and six optional tests were skipped. No application code or test timeout was changed to mask it.
- The complete rerun, `npm test -- --maxWorkers=2 --minWorkers=1`, passed **104 files / 3,616 tests**, with six optional GAT runtime tests skipped. The previously timed-out kernel test passed in 25.5 seconds; total rerun duration was 179.71 seconds.
- `npm run build` passed, including checks that server traces exclude local histories, installed specialist runtimes and compiler scratch files. No Samsara web route or public delivery path was added.
- Four focused Playwright checks passed on desktop and Pixel 7 emulation using installed Edge: the product-page contract and accessibility across seven existing routes. The initial launch attempt could not find Playwright's bundled Chromium; no browser was downloaded. The complete browser/GAT/live-provider suites were not run for this increment.
- `npm run samsara -- demo` retained `samsara-synthetic-capture-v1` in `.payload/samsara-synthetic-demo` at `2026-09-06T02:47:40.283Z`: three invented observations, `SYNTHETIC_OFFLINE`, `SINGLE_PAGE_ONLY`. Fresh Node processes inspected and retried it without changing any of its 11 files. Separate subprocess tests forbid HTTPS, DNS and token/collection environment reads during demo/replay.
- Intent digest: `sha256:e5685e9b2acdf465bab586bcc4f77ab60f0b00a883b87a1b56d017635d411e1d`.
- Receipt digest: `sha256:9a55c9e633fee15459c232193a2807234dd5787961a8ac7fe2e28b8912f6f268`.
- Original response digest: `sha256:9ebed636bb07ad159091483741f8f839b4fd0aa5a04e01a288f9aa702e3729cc`.
- Derived observations digest: `sha256:4f51770503388a51a26ab04612012beb5dca9bc01313e5d01ac6a2afb52b122f`.
- Hash comparison confirmed all 39 pre-existing files across `.payload/source-qualification`, `.payload/observation-replay-demo`, `.payload/scalar-benchmark-demo` and `.payload/building-access-demo` remained unchanged. Raw artifacts and runtime output remain git-ignored; no credential, acquired fleet data or provider response was committed.
