# Source connection program

Provider documentation reviewed **2026-09-05**. This is the bounded connection queue for the 21 entries in `src/production/source-inventory.ts`, not a claim that those sources are connected or that public access grants customer-distribution rights.

## Purpose and authority

The user authorized connecting sources sequentially, testing each pipeline, and choosing the order by expected market value. The customers remain physical-economy brokers, asset/portfolio managers, and insurance/financing firms. The outputs are provenance-bearing data; customer inference remains downstream.

The ranking below is an explicit engineering judgment: prioritize identifiable counterparties, physical movements and exposures, then production and market context. It is **not measured revenue, validated willingness to pay, investment advice, or a claim that a provider's data is uniquely valuable**. Readiness is separate from rank. A blocked high-value source does not prevent the next eligible source from proceeding.

Authorization covers bounded collection through qualified public routes. It does not authorize paid accounts, purchases, contracts, invented permissions, access-control bypass, unrestricted scraping, personal profiles, or collection of customer evidence. An available page, old prototype adapter, API key, or successful response is not itself a rights grant.

## First implementation boundary

- `fmcsa-company-census` is a **new acquisition variant**, distinct from the inventoried `fmcsa-qcmobile` API. Its [official dataset listing][fmcsa-census] identifies public access but an unknown license; the fixed endpoint is `https://data.transportation.gov/resource/az4n-8mr2.json`. It must have its own provider binding, schema and rights record; it does not silently change the QCMobile entry into a connected source.
- The first candidate is the verified U.S. corporate carrier **USDOT 80806**, one present daily snapshot. The profile may expand only to **25 explicitly selected corporate USDOT identifiers maximum**. No enumeration of the entire carrier population.
- The exact 15 selected, non-contact fields are `dot_number`, `legal_name`, `business_org_desc`, `status_code`, `carrier_operation`, `phy_country`, `phy_state`, `power_units`, `total_drivers`, `mcs150_date`, `mcs150_mileage`, `mcs150_mileage_year`, `docket1prefix`, `docket1`, and `docket1_status_code`.
- The [FMCSA dissemination program][fmcsa-program] describes daily Census publication, approximately 24 hours behind. This is not a carrier history, a proof of operating authority, an insurance determination, or independent verification of the carrier's statements. Preserve field meanings, source timestamps and observation time separately. [Socrata supports limited keyless access][socrata-token]; that access is not a license or an unlimited quota.
- The source's public license is **not established**. Its first use is internal source qualification only; customer redistribution is **not granted**. Missing permission remains explicit rather than being converted to `ALLOWED` by the connector.
- Initial implementation is **locally implemented and live-qualified**: an operator-only CLI, opt-in `PAYLOAD_SOURCE_COLLECTION=1`, no new HTTP collection route or remote trigger, and a dedicated `.payload/source-qualification` root. On 2026-09-05 it captured one selected record (371 original bytes) for USDOT 80806 and passed offline readback plus disabled-collection replay. See [exact receipt and implementation limits](LOCAL_SOURCE_CONNECTORS.md). This is one qualification capture, not ongoing coverage or a customer-delivery service.

## Value-ranked queue and first acceptance scopes

Each scope is a small proposed acceptance slice, not authority to collect its entire surrounding dataset. Dates are fixed deliberately; expansion and recurring refresh are separate, recorded decisions. Where an exact provider or registry identifier remains unresolved, the row stays blocked before collection.

| Rank | Existing source ID | First bounded records / geography / time | Readiness and remaining conditions |
| ---: | --- | --- | --- |
| 1 | `fmcsa-qcmobile` | U.S. corporate carrier USDOT 80806; present snapshot only, up to 25 expressly selected corporate USDOTs after the first acceptance. | Highest initial Caravan identity relevance. QCMobile access remains separately qualified; the new Company Census variant above is the first implementation candidate, not an equivalent authority/history feed. |
| 2 | `maritime-ais` | Candidate historical profile: cargo/tanker vessel identifiers, timestamp, position, course and speed; WGS84 box west -95.0, south 29.0, east -94.5, north 29.8; 2024-01-02 UTC; at most 25 observations in the acceptance artifact. | **Provider family, not a connector.** [MarineCadastre][ais-public] is a candidate U.S. historical route; verify selected export/license and avoid unbounded bulk downloads. [MarineTraffic][ais-commercial] live coverage requires separate API entitlements. Historical U.S. data is not live global coverage. |
| 3 | `opencorporates` | Corporate registry identity/status/source links for the corporate entity corresponding to USDOT 80806; one current registry record. Expand to at most 25 expressly selected corporate counterparties. No officers' personal profiles. | [API key and compatible license needed][oc-api]. First verify the exact jurisdiction/company-number match; a similar name is not identity proof. Free access is tied to an attribution/share-alike open product; proprietary reuse needs compatible terms. |
| 4 | `sec-edgar` | Freeport-McMoRan CIK `0000831259` and Southern Copper CIK `0001001838`; submissions metadata and 10-K/10-Q/8-K references dated 2026-01-01 through 2026-09-04, at most 20 selected filings per issuer. Document acquisition is a separate bounded step. | [Keyless official API][sec-api]; requires a real declared requester/contact and [fair-access compliance][sec-access]. No invented contact or anonymous-header workaround. Public access is not a blanket license to redistribute every third-party exhibit. |
| 5 | `eia-weekly-diesel` | U.S. nationwide on-highway diesel price, USD/gallon including taxes, for observation dates 2026-08-17, 2026-08-24 and 2026-08-31. Three rows first; regional/52-week expansion later. | **Next public-publication candidate.** [Official HTML/XLS publication][eia-publication] avoids an API-key dependency. [EIA reuse policy][eia-rights] permits its data with source/date acknowledgment, subject to protected-material exceptions. The [API][eia-api] itself still requires a key. |
| 6 | `un-comtrade` | First: Chile reporter `152`, partner world `0`, exports `X`, HS `2603`, January 2025; at most 500 rows. Preserve classification, value, net weight, quantity units and reported/estimated flags. Subsequent slices may add Peru/U.S./China and HS `7403`, one explicit slice at a time. | [Public preview exists][comtrade-api], but [use/redistribution conditions][comtrade-rights] must be resolved for the intended corpus/API product. Free preview is not permission for a paid raw feed; transformed outputs also have stated subscription conditions. |
| 7 | `company-filings` | Freeport-McMoRan first-party operational releases dated 2026-07-01 through 2026-08-31; at most 10 documents, limited to production, assets and reported interruptions. | **Publisher family.** Select and verify the issuer host, document URLs and permissions before collection. Deduplicate EDGAR copies by digest/accession. Do not infer operational events from headlines alone. |
| 8 | `lme-licensed` | Copper warehouse location, stock and warrant-status observations, next-day delayed; 2026-08-03 through 2026-08-31, at most 25 warehouse-date rows initially. | [Contract/license and feed access required][lme-rights]. External distribution and derived/non-display uses have distinct terms. Do not buy access or accept contracts automatically. |
| 9 | `cme-copper-stocks` | COMEX copper warehouse identity, registered/eligible quantities and report date; one published report dated 2026-09-03, at most 25 warehouse rows. Do not substitute another date silently. | [Official reports exist][cme-reports]. Qualify exact report access/reuse against [CME policies][cme-rights]; public availability does not establish unrestricted commercial redistribution. |
| 10 | `shfe-stocks` | SHFE copper weekly warehouse stocks, Chinese delivery warehouses, report week ending 2026-08-28; at most 25 warehouse/product rows with native units and date. | [Official market/data site][shfe-data] exists. Exact weekly-stock endpoint and applicable reuse terms remain unqualified. This is a review blocker, not a claim that all SHFE statistics require the same license as a trading feed. |
| 11 | `usgs-mcs` | Copper chapter/data tables from MCS 2026 version 1.3, May 2026: U.S. salient statistics 2021–2025 and world country production/reserve rows; one selected copper file, at most 100 extracted rows. | [Keyless official release][usgs-mcs]. Pin release/file/version and units; retain third-party-material exceptions. Country aggregates are not observed facility output. |
| 12 | `cochilco` | Chilean copper production by product from the March 2026 monthly bulletin, January–December 2025 rows only; one table, at most 100 cells/observations. | [Official table/export available][cochilco-data]. [Published bulletin attribution notice][cochilco-rights] supports reproduction with source credit, but bind the selected publication's terms before capture. Do not inherit permission for separately sourced exchange prices. |
| 13 | `minem-peru` | December 2025 BEM copper-production table: Peru, company/region totals for January–December 2025; one XLSX attachment, at most 100 extracted observations. | [Official PDF/XLSX collection][minem-data]. Resolve exact attachment, unit definitions and publication reuse notice. Another MINEM dataset's open license is not this publication's license. |
| 14 | `icsg-bulletin` | World monthly copper mine/refined production, usage and balance for January–December 2025, at most 60 observations; retain preliminary/revised labels. | [Bulletin/database subscription required][icsg-access]. Supplied entitlement and intended-use rights needed. A free Factbook or sample does not constitute access to the subscribed bulletin. |
| 15 | `wb-pink-sheet` | Copper and crude-oil-average monthly reference series, January 2024–August 2026, at most 64 observations from one official monthly workbook; preserve units and missing markers. | [Keyless official workbook][wb-data]; [catalog license][wb-license] is CC BY 4.0. Pin the actual workbook and attribution/third-party exceptions before setting source policy. |
| 16 | `cftc-cot` | COMEX copper, disaggregated futures-only, report dates in August 2026; at most five weekly rows, open interest and participant-class aggregates. No individual-trader identification. | [Official API documentation][cftc-guide] and [FAQ][cftc-faq] support reasonable tokenless use. Verify contract/report identity and schema. Weekly positioning is not daily shipment activity or a price forecast. |
| 17 | `news-events` | One selected publisher's copper/logistics disruption items tied to the initial corporate/asset scope, 2026-08-01 through 2026-08-31; maximum 25 items. | **Provider family.** Select publisher, endpoint and extraction/redistribution rights. [Reuters text][news-example] is an example of subscription content, not an implicitly selected or authorized scraping source. |
| 18 | `openownership` | Candidate replacement: one dated Armenian mining-company BODS release, organizational statements and ownership relationships only, at most 25 statements. No personal contact/profile enrichment. | **Original Register retired 2024-11-29** ([official notice][oo-status]). Replacement needs an explicit release URL, license, dates and privacy-minimized field profile. Do not present the retired Register as live or silently substitute a different dataset. |
| 19 | `curated-flow-snapshot` | The pinned prototype's `curated-copper-v1` annual topology, exactly its existing snapshot year and records; first at most 25 edges with source citations. No fabricated historical interval. | **Curated local snapshot, not a network connector.** Actual snapshot year, record provenance and reuse rights must be inspected before import. Do not label curated relationships as observed shipments or current flows. |
| 20 | `westmetall-lme` | Only if separately permitted: copper-stock report dated 2026-09-03, at most 25 observations; preserve upstream LME identity and avoid duplicate canonical observations. | [Publisher permission][westmetall-rights] and applicable upstream LME rights unresolved. Not a workaround for the licensed LME route. |
| 21 | `yahoo-hg` | Only with express permission: HG futures daily series, 2026-08-03 through 2026-08-31, at most 23 sessions; preserve actual contract versus continuous-series semantics. | **Permission blocker.** [Yahoo terms][yahoo-terms] restrict automated collection; [Finance notice][yahoo-finance] disallows redistribution. A prototype adapter or working endpoint is not authorization. |

## Execution order versus value rank

**Current implementation priority (2026-09-06 UTC): finish the first source's continuity before expanding the connector fleet.** The retained FMCSA capture now has source-specific typed normalization and an unadmitted candidate build; evidence-linked notations, admission, internal release and correction remain subsequent work. See [Real-source continuity](REAL_SOURCE_CONTINUITY.md). The eligibility queue below remains future source onboarding order, not authorization to skip this milestone.

Start with the Company Census qualification increment. Then assess **EIA's public publication**, followed by **SEC metadata once declared requester/contact is configured**, USGS copper, World Bank benchmarks, and CFTC copper. This execution queue uses qualified public routes while higher-value provider/license-dependent entries remain visible and blocked. Cochilco can proceed when the selected publication and attribution notice are pinned. Eligibility must be rechecked at execution; this document grants none.

No initial collection here implies recurring automation. After one accepted capture, record the actual coverage and next bounded scope; do not turn a one-record test into a population crawl. Missing dates/files or unavailable routes produce explicit failures, not automatic widening or third-party replacement.

## One source, one verifiable increment

1. Establish exact provider/host, purpose, rights evidence, allowed fields, geography, fixed time slice, byte/row limits, refresh policy and selected corporate identifiers. Keep ingestion, derivation and redistribution permissions distinct.
2. Implement a fixed-host HTTPS connector with no caller-supplied URLs, safe redirect behavior, timeouts, bounded response bytes, rate limits and explicit failure states. Keep credentials server/operator-side, redact receipts/logs, and do not commit secrets or acquired raw records.
3. Preserve immutable response bytes and a capture receipt binding source variant, selected request, collection time, content digest, media type, parser version and policy decision. Inspection/retry must not silently recapture or rewrite historical evidence.
4. Test offline first: schema drift, incorrect identity, additional/unexpected fields, malformed/oversized responses, unsafe redirects, throttling, partial writes and receipt tampering. A successful mocked response is not proof of provider access.
5. Run one explicitly opt-in, bounded live acceptance using the same guarded path. Record success, rejection or unresolved rights honestly. Successful transport is not canonical admission, corpus release, customer delivery or independent verification.
6. Verify tests and readback, commit only code/docs/safe fixtures, push the existing branch and verify the remote commit. Keep acquired evidence outside Git. State precisely which source variant and slice passed, then choose the next eligible source.

Unresolved provider selection, credentials, entitlement, privacy, redistribution rights or endpoint behavior remain explicit blockers. These sources feed Payload OS production; they do not merge Caravan, Tradewind or Landshark domain ownership, add a new corporate mandate, or give proprietary capital activity access to customer material.

## Primary documentation reviewed

All links below were reviewed on 2026-09-05. Links are research pointers, not immutable permission records; the selected publication/terms still need capture and binding in the actual source-qualification record.

[ais-public]: https://marinecadastre.gov/accessais/
[fmcsa-census]: https://catalog.data.gov/dataset/company-census-file
[fmcsa-program]: https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program
[socrata-token]: https://dev.socrata.com/docs/app-tokens.html
[ais-commercial]: https://servicedocs.marinetraffic.com/
[oc-api]: https://api.opencorporates.com/documentation/API-Reference
[sec-api]: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
[sec-access]: https://www.sec.gov/about/developer-resources
[eia-publication]: https://www.eia.gov/petroleum/gasdiesel/
[eia-rights]: https://www.eia.gov/about/copyrights_reuse.php
[eia-api]: https://www.eia.gov/opendata/documentation.php
[comtrade-api]: https://uncomtrade.org/docs/un-comtrade-api/
[comtrade-rights]: https://uncomtrade.org/docs/faqs-on-use-and-re-dissemination/
[lme-rights]: https://www.lme.com/en/Market-data/Market-data-licensing/Data-distribution
[cme-reports]: https://www.cmegroup.com/clearing/operations-and-deliveries/registrar-reports.html
[cme-rights]: https://www.cmegroup.com/market-data/license-data/information-policies.html
[shfe-data]: https://www.shfe.cn/eng/Market/
[usgs-mcs]: https://pubs.usgs.gov/publication/mcs2026
[cochilco-data]: https://boletin.cochilco.cl/productos/boletin.asp?anio=2026&mes=03&tabla=tabla21
[cochilco-rights]: https://www.cochilco.cl/web/download/980/2025/14865/agosto-2025.pdf
[minem-data]: https://www.gob.pe/institucion/minem/colecciones/6-boletin-estadistico-minero
[icsg-access]: https://icsg.org/publications-list/
[wb-data]: https://www.worldbank.org/en/research/commodity-markets
[wb-license]: https://datacatalog.worldbank.org/search/dataset/0038238/commodity-prices-history-and-projections
[cftc-guide]: https://publicreporting.cftc.gov/stories/s/User-s-Guide/p2fg-u73y/
[cftc-faq]: https://www.cftc.gov/es/node/128971
[news-example]: https://www.reutersconnect.com/feed/text
[oo-status]: https://www.openownership.org/en/topics/open-ownership-register/
[westmetall-rights]: https://www.westmetall.com/en/impressum.html
[yahoo-terms]: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
[yahoo-finance]: https://in.help.yahoo.com/kb/SLN2310.html
