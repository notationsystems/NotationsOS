# Payload OS Earth Twin

The Earth Twin is the projection fabric's geodetic instrument: the surface on which Payload OS realizes, on the Earth, whatever it can honestly place there. It is the CesiumJS role the [synthesized architecture](SYNTHESIZED_ARCHITECTURE.md) assigns ("where does this exist, and how does it move through geographic space and time?"), built on the globe stack of [God's Eye View](https://github.com/notationsystems/gods-eye-view) and held to Payload OS's rules: every layer names its source and its state, nothing is invented, nothing is acquired that has not been registered and decided, and a fixture is called a fixture. It lives at `/earth`, under Inquiry.

This document records what the twin is, what it accompanies, what was taken from God's Eye View and what was deliberately not, the staged plan, the truths the design does not bend, and the verification receipt. Present tense throughout: what the code does today.

## What it is built from

| | Pinned |
|---|---|
| Globe stack | God's Eye View at commit `6d83bb6008738db2aa067284586be04ea0c5eabb` (2026-08-31), MIT for the source code only; its bundled and fetched data keep their own terms |
| Engine | CesiumJS 1.124.0, Apache-2.0, installed as a dependency for its types and its static build; that build (the prebuilt ES module, workers, bundled imagery, widget stylesheet, third-party workers) is copied by `scripts/earth-assets.mjs` into `public/cesium` before every `dev` and `build`, git-ignored, and served from this origin only. The page loads the engine's module from there at runtime rather than bundling it, so there is exactly one copy of the engine and the application bundle carries none of it |
| Surface | Natural Earth II imagery bundled with the engine (public domain) on the WGS84 ellipsoid, no terrain; coarse by design |
| Source list | `DATA_SOURCES.md` at blob `68241fbef4c51796e43cc5a172b91131f5305941`, carried as a registry of names and terms |

Everything the twin is as data lives in `src/domain/earth.ts`: the origin pin, the engine, the layers with their states, the registry, the view codec, the projection request builder, and what the twin does not claim.

The engine version is Payload OS's explicit pin, not a claim to reproduce the upstream dependency lock: God's Eye View declares `^1.124.0`, but its [lockfile at the pinned commit](https://github.com/notationsystems/gods-eye-view/blob/6d83bb6008738db2aa067284586be04ea0c5eabb/package-lock.json) resolves CesiumJS 1.138.0. The registry carries the 21 rows of that commit's live-source table, not an exhaustive census of its runtime; NASA FIRMS is described elsewhere in the same source document. The upstream simplified Natural Earth **vector datasets** are not the engine's bundled Natural Earth II **imagery**, and neither supplies precise corpus geometry.

## What it accompanies

The five fabrics each meet the twin in a specific way, and today only two of them have anything to draw.

- **Projection.** The twin is the `GLOBE / GEODETIC / GLOBAL_3D` route made real. It asks the existing read-only compiler (`POST /api/projections/preview`) for one explicit record of the latest committed release, under the release's own commitments, at the release cutoff and the record's own validity start. The compiler answers `UNAVAILABLE: GEOMETRY_NOT_AVAILABLE`, because the fixture declares no geodetic position for any record and the compiler invents none. The twin shows that answer beside the selected record and draws nothing in its place. A record the compiler will not select shows the refusal code and what it means, and no more, so nothing withheld is disclosed. The compiler's `rendererExecuted: false` non-claim stays true of the compiler; the twin is the renderer, and it says so.
- **Acquisition.** The twenty-one sources in God's Eye View's pinned live-source table (aircraft, vessels, satellites, earthquakes, cameras, traffic, weather, headlines, radio, terrain, and the metered photorealistic tiles) are carried as a registry with their terms class, their attribution and what they would supply. Each is `NOT_INTEGRATED` with its blockers named: no source registration, no rights decision requested, no connector on the rail, and where the terms exclude commercial operation or meter a key, that too. None is contacted. A source enters the twin only the way anything enters Payload OS: registered, decided, captured with a receipt, normalized under a contract.
- **Corpus.** Records reach the globe only through the compiler, with rights, visibility and both times enforced there. Before sending selector metadata to the browser, `src/earth/records.ts` reuses the existing `deliverableRecords` gate for `COUNTERPARTY_SHARED` at the release cutoff. It sends only selectable IDs, titles, subjects, predicates and validity bounds; withheld records, their counts and refusal reasons are not serialized. This is not a second policy implementation or a second corpus. Every projection request is still decided by the compiler, including historical correction and retraction semantics.
- **State.** Notations and relations carry no geodetic position in the kernel's closed command set, so the authored-marks layer is `UNAVAILABLE` and says why. A geodetic command would be a backend contract request, like the evidence-reference commands in [Notation workspace](NOTATION_WORKSPACE.md).
- **Compute and decision.** Nothing yet. A case or a ruling has no position either.

## Layers and their states

| Layer | State | Source | Draws |
|---|---|---|---|
| Earth surface | `BUNDLED` | Natural Earth II bundled with CesiumJS, WGS84 ellipsoid, no terrain | The globe, at the bundled resolution |
| Day and night | `COMPUTED` | The sun's position at the twin's world time, from the engine's own ephemeris; exact once the Earth-orientation data served with the engine has loaded, and labelled as an approximation until then | Lighting, the terminator, the sub-solar point as a view preset |
| Corpus records | `FIXTURE` | The projection compiler over one exact release | Nothing: geometry refused, refusal shown |
| World signals | `NOT_INTEGRATED` | The pinned registry | Nothing: no connector, no rights decision |
| Authored marks | `UNAVAILABLE` | The notation kernel | Nothing: no geodetic command |

The state vocabulary is closed (`BUNDLED`, `COMPUTED`, `FIXTURE`, `UNAVAILABLE`, `NOT_INTEGRATED`) and each state's meaning is shown on hover. It is the twin's version of God's Eye View's live / delayed / simulated / unavailable discipline, with the states Payload OS actually has.

## Time

The twin has two clocks and labels both. **Known at** is the release cutoff: nothing knowable later appears. **World time** is the instant the Earth is shown at: day and night are computed from it, and the corpus is asked for what held then. World time follows the selected record's validity start, so the request the compiler receives is always within the record's validity and the picture on the globe is the world at that instant.

A replacement viewer receives the latest selected world time before becoming `READY`. Runtime status, camera callbacks and asynchronous sub-solar results belong to one viewer instance; late work from a destroyed instance cannot update its replacement. Projection answers are bound to the entire serialized request, including source/release commitments and both clocks, so a previous release's answer is not shown under a new release.

## Local engine package boundary

`scripts/earth-assets.mjs` delegates to the server/build-only `src/earth/assets.mjs`. Preparation requires the installed and declared CesiumJS version to match the exact 1.124.0 pin. It inventories the module, workers, widgets, assets and third-party files, and copies `LICENSE.md`, `ThirdParty.json` and `ThirdParty.extra.json` alongside them. `public/cesium/VERSION.json` is a versioned manifest with sorted paths, byte lengths, per-file SHA-256 hashes, total bytes and a manifest digest.

Preparation creates an exclusive local lock, copies into a new staging directory, verifies the full staged package and publishes it by rename. A matching existing bundle is verified and reused without writes. An incomplete, altered, old-format or different existing bundle is refused and **preserved**, never silently deleted or repaired. Only the preparer's own unpublished temporary tree is cleaned up after failure. The verifier rejects links/junctions, unknown files, malformed paths and oversized files or trees. The Earth server page verifies the manifest against all published file bytes before allowing the engine to load; a version stamp alone cannot make the viewer ready.

These hashes establish local package consistency, **not independent verification**, source rights, browser-side cryptographic attestation or protection against a privileged writer changing the installation. The published assets and manifest must remain read-only to untrusted processes. Publication assumes a trusted local filesystem and cooperating preparers: the lock and final existence check do not make `rename` an unconditional no-replace primitive against unrelated writers on every platform. No network request, corpus mutation or provider registration is involved. Build tracing also checks that `/earth` does not package `.payload`, `.stamp`, `.git`, environment files or unrelated native compiler output.

**Existing v0 cache / recovery:** stop local dev/build processes first. Preserve an invalid `public/cesium` directory outside `public` in an explicitly selected backup location; confirm that exact target before moving it. Then run `npm ci --ignore-scripts` and `npm run earth:assets` with the repository's lockfile. Do not move a bundle while another process serves or prepares it. A leftover `.stamp/earth-assets.lock` after interruption requires confirming there is no active preparation and preserving/removing that exact stale lock explicitly; the preparer never breaks another process's lock. No automated migration deletes an existing cache.

## A view is a link

The camera serializes into the URL hash as `#v=longitude,latitude,height,heading,pitch`, fixed precision, always the same five numbers. Loading a link restores the view. The codec is bounded (height between 1 km and 100,000 km, pitch at or below the horizon) and a hash that is not exactly a bounded view is ignored whole, never clamped or salvaged, as God's Eye View treats a malformed share link. Presets: the global view, and the sub-solar point.

## What was adopted from God's Eye View, and what was not

Adopted: the CesiumJS globe with the widget chrome off and the credit line kept visible; the layer discipline; a view as a link; the named list of sources it reads, as a registry. Not adopted: Google Photorealistic 3D Tiles and every keyed or metered provider (the twin runs without any key); the live feeds (each would enter through the acquisition rail); the bundled third-party datasets under non-permissive terms (not copied); voice control and the realtime agent.

The twin therefore makes no request that leaves its origin. The browser test asserts it: every request the page makes is same-origin, `blob:` or `data:`.

## The plan, staged

1. **v0, this increment.** The instrument exists: keyless, offline, on the shared shell with the inspector pattern, bound to the projection compiler, carrying the registry, with time computed and views linkable. Nothing on the globe but the Earth, and the reasons why.
2. **v1, declared geometry.** Geodetic positions for corpus subjects (a lot's holding site, a port) as declared fixture fields with their own evidence class and provenance, so the compiler can return `READY` for `GLOBE` and the twin can draw a record where the release says it is, with its status at the knowledge time. This is a corpus-fixture change with digests restamped, and a compiler change; both belong to the backend branch and the corpus owner, not to the twin alone.
3. **v2, signals through the rail.** One public-domain source from the registry (USGS earthquakes is the least encumbered) registered as a source, its rights decided for an exact purpose, operation and audience, captured with a receipt, normalized under a fixed contract into candidates with positions, and shown on the twin as candidates: `UNADMITTED`, `UNRESOLVED`, with their capture and knowledge times. That is the acquisition fabric's first observed geography, and it is not evidence of anything until admitted. The backend branch's bounded, operator-only FMCSA Company Census connector ([Local source connectors](LOCAL_SOURCE_CONNECTORS.md)) is the pattern to follow: one exact request, preserved bytes and receipts, no recurring ingestion; it carries carrier records, not positions, so it reaches the twin only once something declares where a carrier is.
4. **v3, interop.** A God's Eye View target handed to Payload OS as a share link becomes a notation with an evidence reference of kind `SIGNAL`, once the kernel has the attach command; a Payload OS view opens in God's Eye View at the same camera. Two instruments, one referent identity.

Each stage needs a material choice or a backend contract (a fixture change, a source registration, a kernel command) that is not the frontend's to make alone; each is stated here so the choice can be made.

## What the design does not bend

- The globe is not evidence. Bundled imagery and a computed sun are context; the inspector says so in the twin's non-claims.
- No position is invented. A record without declared geometry is not drawn, and the compiler's refusal is shown with the record.
- No signal is live. The registry names sources and their terms; it collects nothing, and each entry says why it is not on the globe.
- No key, no external request. The engine and its imagery are served from this origin; the test proves the absence of any other request.
- The compiler decides. The twin holds no copy of the corpus and no second gate; it inherits refusals and shows their codes.

## Original v0 verification receipt (2026-09-05, frontend branch)

**As data** (`src/domain/earth.test.ts`, 5 tests): the origin pin and engine; every layer with source, terms, draws and a state from the closed vocabulary, only the bundled surface and the computed sun drawing anything; the twenty-one registry entries, all `NOT_INTEGRATED`, each with terms, attribution and blockers, with the non-commercial and metered cases adding theirs; the view codec round trip and the rejection of thirteen malformed hashes; the GLOBE request accepted by the closed projection parser and the compiler's answers read without inventing geometry. `src/domain/doctrine.test.ts` now binds each engine's stated presence to the installed dependencies both ways.

**Over a mocked engine** (`src/components/earth/EarthTwin.test.tsx`, 3 tests): the assets-missing state with its remedy; a keyless start from bundled imagery with the ion token cleared; every layer's state; the GLOBE request for one record with the release's knowledge time and the record's validity start, the refusal shown, and a refused record shown as refused; world time following the selection; the sub-solar point computed and labelled; the camera writing a bounded hash when it stops, presets flying the camera, a bad hash ignored.

**In the browser** (`tests/e2e/earth.spec.ts`, desktop and Pixel 7, against the built application and the real CesiumJS on software WebGL): status `READY` with the renderer named; the canvas visible; the five layers with their states; twenty-one registry entries, none integrated; the compiler's `GEOMETRY_NOT_AVAILABLE` for the first record and a refusal or unavailability for the last; the sub-solar point computed; the hash written after a flight, restored from a link, and a malformed hash ignored; no horizontal overflow; no serious or critical axe findings; no page errors; and no request leaving the origin. `/earth` is in the overflow guard and the screenshot set (`docs/screenshots/00j-earth-twin.png`). Whole suites after the change: typecheck, lint, 1332 unit tests (the pinned GAT runtime tests excluded, their engine pin being `win32`), `next build`, 118 regular Playwright tests at desktop and Pixel 7, 10 real-kernel tests, screenshots regenerated.

**Not done.** Nothing but the Earth is drawn; the stages above say what would change that and who decides. The bundled imagery is coarse. The registry is a copy of a document at a commit, not a live read of it. The engine's own credit line is rendered by the engine.

## Foundation integration verification (2026-09-05, Windows)

Integrated frontend head `9aab8a7` by fast-forward into `codex/payload-os-foundation`, preserving the bounded FMCSA source work. This increment changes local asset verification, server-side record metadata delivery and asynchronous viewer/request ownership. It does not authorize stages v1–v3.

- `npm run check`: 29 Rust tests, typecheck, lint and 1,850 JavaScript tests passed; six optional GAT tests were excluded from that default run. New coverage includes 64 synthetic-package asset tests, 16 selector tests and 21 additional viewer/request tests (24 component tests total).
- `npm run build`: passed, including the Earth page's deployment-trace check. `npm run earth:assets` created then reused the same verified 377-file / 10,765,930-byte package, digest `sha256:ea46ee4be254297b1a76be4e83c39de02d0e11997a026ea41ca2ff2281747d4f`. This is a local integrity receipt, not independent attestation.
- Installed Edge, desktop and Pixel 7 emulation: 118 regular browser tests passed; 18 environment/device-specific cases were skipped by that configuration. The Earth test separately passed on both viewports and again in the full suite: real CesiumJS, same-origin requests only, verified manifest, withheld IDs absent from HTML/RSC and selector, explicit geometry refusal, clocks, camera links, no page errors, no horizontal overflow and no serious/critical axe findings outside the WebGL canvas. The Windows renderer was NVIDIA/ANGLE, not the original Linux software renderer. Both screenshots were visually inspected; local artifacts are under `.stamp/earth-browser-results/` and are not deployment assets.
- `node scripts/state-kernel-e2e.mjs`: 10 real-kernel browser tests passed in isolated temporary history. `GAT_INTEGRATION=1 node scripts/production-e2e.mjs`: all three real HTTP production tests passed, including the pinned GAT audit.
- `GAT_INTEGRATION=1 npx vitest run src/gat/runtime.test.ts src/gat/service.test.ts --no-file-parallelism`: all 67 tests passed, including the six optional cases. An initial parallel invocation returned `ENGINE_BUSY` in two service cases because both files used the same exclusive runtime; the serial invocation respects that existing lock. The scientific import guard's five Python tests also passed.

Existing evidence and coordination history hashes remained unchanged. No live Earth source was contacted; no source approval, fixture geometry, canonical identity, release digest, kernel command or customer-delivery deployment was added.
