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

## What it accompanies

The five fabrics each meet the twin in a specific way, and today only two of them have anything to draw.

- **Projection.** The twin is the `GLOBE / GEODETIC / GLOBAL_3D` route made real. It asks the existing read-only compiler (`POST /api/projections/preview`) for one explicit record of the latest committed release, under the release's own commitments, at the release cutoff and the record's own validity start. The compiler answers `UNAVAILABLE: GEOMETRY_NOT_AVAILABLE`, because the fixture declares no geodetic position for any record and the compiler invents none. The twin shows that answer beside the selected record and draws nothing in its place. A record the compiler will not select shows the refusal code and what it means, and no more, so nothing withheld is disclosed. The compiler's `rendererExecuted: false` non-claim stays true of the compiler; the twin is the renderer, and it says so.
- **Acquisition.** The twenty-one public signal sources God's Eye View reads (aircraft, vessels, satellites, earthquakes, cameras, traffic, weather, headlines, radio, terrain, and the metered photorealistic tiles) are carried as a registry with their terms class, their attribution and what they would supply. Each is `NOT_INTEGRATED` with its blockers named: no source registration, no rights decision requested, no connector on the rail, and where the terms exclude commercial operation or meter a key, that too. None is contacted. A source enters the twin only the way anything enters Payload OS: registered, decided, captured with a receipt, normalized under a contract.
- **Corpus.** Records reach the globe only through the compiler, with rights, visibility and both times enforced there. The twin holds no second copy of the corpus and no second gate.
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

## A view is a link

The camera serializes into the URL hash as `#v=longitude,latitude,height,heading,pitch`, fixed precision, always the same five numbers. Loading a link restores the view. The codec is bounded (height between 1 km and 100,000 km, pitch at or below the horizon) and a hash that is not exactly a bounded view is ignored whole, never clamped or salvaged, as God's Eye View treats a malformed share link. Presets: the global view, and the sub-solar point.

## What was adopted from God's Eye View, and what was not

Adopted: the CesiumJS globe with the widget chrome off and the credit line kept visible; the layer discipline; a view as a link; the named list of sources it reads, as a registry. Not adopted: Google Photorealistic 3D Tiles and every keyed or metered provider (the twin runs without any key); the live feeds (each would enter through the acquisition rail); the bundled third-party datasets under non-permissive terms (not copied); voice control and the realtime agent.

The twin therefore makes no request that leaves its origin. The browser test asserts it: every request the page makes is same-origin, `blob:` or `data:`.

## The plan, staged

1. **v0, this increment.** The instrument exists: keyless, offline, on the shared shell with the inspector pattern, bound to the projection compiler, carrying the registry, with time computed and views linkable. Nothing on the globe but the Earth, and the reasons why.
2. **v1, declared geometry.** Geodetic positions for corpus subjects (a lot's holding site, a port) as declared fixture fields with their own evidence class and provenance, so the compiler can return `READY` for `GLOBE` and the twin can draw a record where the release says it is, with its status at the knowledge time. This is a corpus-fixture change with digests restamped, and a compiler change; both belong to the backend branch and the corpus owner, not to the twin alone.
3. **v2, signals through the rail.** One public-domain source from the registry (USGS earthquakes is the least encumbered) registered as a source, its rights decided for an exact purpose, operation and audience, captured with a receipt, normalized under a fixed contract into candidates with positions, and shown on the twin as candidates: `UNADMITTED`, `UNRESOLVED`, with their capture and knowledge times. That is the acquisition fabric's first observed geography, and it is not evidence of anything until admitted.
4. **v3, interop.** A God's Eye View target handed to Payload OS as a share link becomes a notation with an evidence reference of kind `SIGNAL`, once the kernel has the attach command; a Payload OS view opens in God's Eye View at the same camera. Two instruments, one referent identity.

Each stage needs a material choice or a backend contract (a fixture change, a source registration, a kernel command) that is not the frontend's to make alone; each is stated here so the choice can be made.

## What the design does not bend

- The globe is not evidence. Bundled imagery and a computed sun are context; the inspector says so in the twin's non-claims.
- No position is invented. A record without declared geometry is not drawn, and the compiler's refusal is shown with the record.
- No signal is live. The registry names sources and their terms; it collects nothing, and each entry says why it is not on the globe.
- No key, no external request. The engine and its imagery are served from this origin; the test proves the absence of any other request.
- The compiler decides. The twin holds no copy of the corpus and no second gate; it inherits refusals and shows their codes.

## Verification receipt (2026-09-05)

**As data** (`src/domain/earth.test.ts`, 5 tests): the origin pin and engine; every layer with source, terms, draws and a state from the closed vocabulary, only the bundled surface and the computed sun drawing anything; the twenty-one registry entries, all `NOT_INTEGRATED`, each with terms, attribution and blockers, with the non-commercial and metered cases adding theirs; the view codec round trip and the rejection of thirteen malformed hashes; the GLOBE request accepted by the closed projection parser and the compiler's answers read without inventing geometry. `src/domain/doctrine.test.ts` now binds each engine's stated presence to the installed dependencies both ways.

**Over a mocked engine** (`src/components/earth/EarthTwin.test.tsx`, 3 tests): the assets-missing state with its remedy; a keyless start from bundled imagery with the ion token cleared; every layer's state; the GLOBE request for one record with the release's knowledge time and the record's validity start, the refusal shown, and a refused record shown as refused; world time following the selection; the sub-solar point computed and labelled; the camera writing a bounded hash when it stops, presets flying the camera, a bad hash ignored.

**In the browser** (`tests/e2e/earth.spec.ts`, desktop and Pixel 7, against the built application and the real CesiumJS on software WebGL): status `READY` with the renderer named; the canvas visible; the five layers with their states; twenty-one registry entries, none integrated; the compiler's `GEOMETRY_NOT_AVAILABLE` for the first record and a refusal or unavailability for the last; the sub-solar point computed; the hash written after a flight, restored from a link, and a malformed hash ignored; no horizontal overflow; no serious or critical axe findings; no page errors; and no request leaving the origin. `/earth` is in the overflow guard and the screenshot set (`docs/screenshots/00j-earth-twin.png`). Whole suites after the change: typecheck, lint, 1332 unit tests (the pinned GAT runtime tests excluded, their engine pin being `win32`), `next build`, 118 regular Playwright tests at desktop and Pixel 7, 10 real-kernel tests, screenshots regenerated.

**Not done.** Nothing but the Earth is drawn; the stages above say what would change that and who decides. The bundled imagery is coarse. The registry is a copy of a document at a commit, not a live read of it. The engine's own credit line is rendered by the engine.
