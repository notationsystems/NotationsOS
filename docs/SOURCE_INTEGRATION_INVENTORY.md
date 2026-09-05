# Source integration inventory

Payload OS now has a named inventory of the sources already recorded in the Payload Terminal prototype. It is the starting list for integration, not a list of sources currently being scraped or a new choice of market, geography or customer. No source was selected or contacted in this increment.

## Exact origin and observed standing

The inventory is grounded in [`Payload-Terminal-V0/src/lib/economy/sourceRegistry.ts`](https://github.com/notationsystems/Payload-Terminal-V0/blob/b5c99dd1d40cfb125a322b67904a622c6f6fde74/src/lib/economy/sourceRegistry.ts), commit `b5c99dd1d40cfb125a322b67904a622c6f6fde74`, Git blob `c7b67421bf153daba7d0fa3f11cdca102bf8d30a`.

It contains **21 historical registry entries: seven external adapter declarations, one curated snapshot assembly declaration, and thirteen entries without adapter declarations**. These are statements about that exact registry. They do not establish current provider availability, successful historical collection, reviewed rights, or working Payload OS connectors.

| Prototype source ID | Named source | Declared adapter |
|---|---|---|
| `usgs-mcs` | USGS Mineral Commodity Summaries / ScienceBase | `usgs-mcs-live` |
| `un-comtrade` | UN Comtrade public preview | `comtrade-trade` |
| `yahoo-hg` | COMEX copper benchmark through Yahoo Finance | `yahoo-copper-price` |
| `cftc-cot` | CFTC Commitments of Traders | `cftc-positioning` |
| `fmcsa-qcmobile` | FMCSA QCMobile carrier records | `fmcsa-qcmobile` |
| `eia-weekly-diesel` | EIA weekly U.S. on-highway diesel benchmark | `eia-weekly-diesel` |
| `westmetall-lme` | LME daily stocks republished by Westmetall | `westmetall-lme-stocks` |
| `curated-flow-snapshot` | Curated annual facility-flow topology; not an external connector | `curated-copper-v1` |

The other thirteen named entries are World Bank Pink Sheet, licensed LME, SHFE stocks, CME/COMEX copper stocks, ICSG bulletin, Cochilco, MINEM Peru, news/wire extraction, company disclosures, SEC EDGAR facility structure, maritime AIS, OpenCorporates, and OpenOwnership. Generic families such as news and AIS still need an exact provider/dataset; a name in this table is not a collection target. Nothing here prioritizes or activates those entries.

This is bounded to that registry, not an exhaustive scan of every Terminal client, all company repositories, or currently running scraping jobs. The existing local Carrier, notice, and generated IFC examples remain synthetic inputs, not additional live sources. Invented parties in the released demonstration fixtures are not real providers.

## Frontend and apparatus access

Start `npm run dev:production` and read `GET /api/production/source-inventory` from the same literal-loopback origin. Like other operational reads it requires explicit local mode. Query options are rejected. The route returns `no-store` JSON and does not start the worker, inspect credentials or local evidence, import prototype clients, call a provider, or write any state.

The response is `payload.source-integration-inventory.v1`, implemented in [`src/production/source-inventory.ts`](../src/production/source-inventory.ts). Its exact prototype repository/commit/path/blob travels with all entries; `sourceId` remains scoped to that prototype registry, not a canonical source identity or Payload source registration.

Each entry includes its name/category, declared adapter ID, prototype standing, and separate Payload integration state. All currently have:

- `integrationState: NOT_INTEGRATED`
- `selectedScope`, `sourceRegistration`, `lastAcquisition`: `null`
- Explicit blockers for source/scope selection, current terms review, Payload connector implementation, and a bounded acceptance capture.

The summary distinguishes eight non-null adapter declarations (including the curated assembly) from thirteen entries without one; `integrated` and `selected` are zero. `providerAvailability: NOT_CHECKED` and `credentialConfiguration: NOT_INSPECTED` are absences, not provider failures or missing-key findings. `liveCollectionEnabled`, `connectionEstablished`, `currentRightsGrant`, `canonicalAdmission`, `scopeSelected`, and `inventoryPersisted` are false.

This is code-owned discovery metadata. Its deterministic digest detects local metadata differences; it is not a signed source policy or independent verification. It does not change when a synthetic production example runs, and is not a runtime health monitor. A future integration must update its declared standing only with corresponding implementation and acceptance evidence. The separate `GET /api/production` catalog still represents actual local registrations and runs.

## Reuse the prototype, preserve Payload's acquisition boundary

The pinned [`freightDataSources.ts`](https://github.com/notationsystems/Payload-Terminal-V0/blob/b5c99dd1d40cfb125a322b67904a622c6f6fde74/src/lib/economy/freightDataSources.ts) was also inspected. It contains fixed FMCSA carrier/authority/out-of-service requests and a fixed EIA diesel-series request; [`freightDataSourcesRuntime.ts`](https://github.com/notationsystems/Payload-Terminal-V0/blob/b5c99dd1d40cfb125a322b67904a622c6f6fde74/src/lib/economy/freightDataSourcesRuntime.ts) names `FMCSA_WEB_KEY` and `EIA_API_KEY`. Only configuration **names** were read from code, never credential values. No requests or prototype tests were executed, and no source implementation was copied or installed.

Those implementations are reference material, not a drop-in evidence adapter: their request/parsing outputs do not supply Payload's immutable original-byte acquisition records. Integration must preserve original responses before deriving candidates, bind each sub-request and partial failure, preserve absent fields, qualify the exact input/media/schema contract, bound streaming bytes/redirects/time/pagination/retries, and return inspectable receipts. Provider status does not establish cargo insurance, canonical identity or admission.

The registry's old access and redistribution labels were deliberately not translated into current source-use grants. Public accessibility, possession of credentials, a declared adapter, and successful retrieval are separate from permission for INGEST, DERIVE, retention, redistribution, model training, or proprietary use. Rights must be recorded against the exact selected source, purpose, audience, policy version and time using the existing policy machinery. Source terms were not reviewed in this inventory pass.

## Required input for the first real integration

Select the source from this inventory (or supply an existing scraping job/source list elsewhere) and provide the exact dataset/endpoint plus bounded record selection, geography, period and desired cadence. Identify the approved purpose and source-rights evidence, and an operator-controlled credential reference if required; do not put credential values in Git or a board message.

Then implement and qualify one complete path:

`selected source and scope → operation-specific policy check → bounded retrieval → preserved original bytes and receipts → source-specific extraction → candidate/quarantine → inspection`

The existing synthetic Carrier normalizer is not presumed compatible with FMCSA or another real provider's response. Additional record types, product mappings and distribution rights are explicit subsequent contracts, not consequences of naming a source. No generic scraper fleet, scheduler, release activation, customer delivery or live collection is introduced here.

## Verification

Inventory tests pin the 21 IDs/adapter mappings, distinguish the curated assembly, recompute the deterministic digest, and verify defensive copies/nonclaims. Route tests cover opt-in/origin gates, rejected query options, safe errors and no provider execution. The built-server Carrier acceptance test reads the inventory before and after local fixture production and proves that fixture activity does not promote an external connection.

Run `npm run check` and `npm run e2e:production`. Tests use isolated histories; existing operator evidence, the board, the authored-notation kernel, sibling repositories and dependency pins remain unchanged. Actual connector integration remains pending the selected source and collection scope.

Executed for this increment: `npm run check` passed TypeScript, ESLint, 29 Rust tests, and 1,281 JavaScript/TypeScript tests across 57 files (six optional GAT tests skipped), including 24 new inventory/route tests. With `GAT_INTEGRATION=1`, `npm run e2e:production` passed the production build, build-trace guard and all three HTTP workflows. A separate text comparison confirmed all 21 source IDs, names, categories and adapter IDs match the pinned registry exactly. Operator evidence and coordination hashes were unchanged; the sibling Kernel remained at `c6d693613478f32e0b0d7dafe918d8e51274ffcc` with its existing 53 modified tracked and 74 untracked files, and the pinned GAT execution checkout remained clean. No provider availability or source-rights checks were performed.
