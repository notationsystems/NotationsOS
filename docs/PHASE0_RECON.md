# Phase 0 — repository reconnaissance

Factual findings only. Produced 2026-09-04 by reading the sibling repositories under `notationsystems/` read-only. Ten reader/synthesis/critic passes were run; every claim below cites a file, and the critic pass re-opened the cited files to verify line references.

## Target state

`notationsystems/NotationsOS` had **no commits** and no remote branches when this work began. Everything in this repository was created in the session that produced this document. There was no existing Payload OS frontend to preserve; the sibling repositories were the substrate to shadow.

Sibling repositories inspected (all public, cloned shallow, read-only):

| Repository | What it is | Frontend? |
|---|---|---|
| `Payload-Terminal-V0` | Next.js 16 / React 19 / Tailwind 4 operator instrument: MapLibre world state, freight control tower, docs. 409 files. | Yes — the only sibling with a React UI |
| `Notations-Ecosystem` (`control-plane/`) | Node ≥20 ESM, zero-dependency coordination ledger with the result-manifest contract, canonical URI grammar, methodology and maturity vocabularies. | No |
| `Information-Systems-Archive` | The corpus provenance contract (`corpus-contract/contract.json` 1.0.0) and an archive mirror with a sha256 manifest. | No |
| `PayloadOS-Render-Engine` ("Payload Earth") | Vite + three.js globe; Assertion/Observation/Deviation model; its own steel-blue token set. No React. | Rendering only |
| `Notations-Corpus-Graph` | Python polymer corpus; mirrors the canonical URI grammar and the result manifest; states that verification never reaches `verified`. | No |
| `PayLoad-Corpus-Graph`, `Notations-Control-Centre-` | **Empty repositories** (no commits). | No |

`nsdist` and `yload`: zero whole-word occurrences in any repository. `yload` matches only inside `payload`, `dependencyLoad`, `verdictByLoad`. `Caravan`, `Tradewind`, `Landshark`: zero occurrences in any sibling.

## Observed frontend stack (Payload Terminal V0)

- `package.json`: next 16.2.6, react/react-dom 19.2.4, tailwindcss 4 via `@tailwindcss/postcss` (no tailwind config file), typescript 5 strict with `@/*` → `./src/*`, eslint 9 + eslint-config-next 16.2.6, vitest 2.1.9, playwright 1.62.1 (declared, no config, no specs), plus MapLibre, framer-motion, react-force-graph-2d, lightweight-charts, zod, an MCP server (`src/mcp/server.ts`) and many data-source clients.
- `vitest.config.ts:11-12`: `environment: 'node'`, `include: ['src/**/*.test.ts']`. UI is tested through exported pure helpers or by reading `page.tsx` as text (`src/lib/ui/panels.test.ts:9`). No DOM-level component tests exist.
- CI (`.github/workflows/ci.yml`, header still says "Sea Dog Terminal"): `tsc --noEmit`, `vitest run`, `next build` on Node 22.
- `next.config.ts`: `output: 'standalone'`, `typescript.ignoreBuildErrors: false`, CSP header, `X-Frame-Options: SAMEORIGIN`.
- Fonts: Google Fonts `@import` at `src/app/globals.css:1` (Inter, JetBrains Mono).
- State: plain React state inside a 1765-line client page (`src/app/page.tsx`); a pure panel registry (`src/lib/ui/panels.ts`) derives panel exclusion from render slots. No store library, no context provider.

## Existing routes (Payload Terminal V0)

Pages: `/` (map terminal), `/operations` (token-gated freight control tower), `/docs`. API: `/api/economy{,/search,/refusals,/table,/validate,/guards,/entity,/scenario}`, `/api/freight/{operations,control-tower,communications,carrier-events,sources,world,demo}`, `/api/health`, and a large set of live-or-retired routes governed by `ROUTE_DISPOSITION` + `RETIRED_ROUTES` (`src/lib/routeGate.ts:39-133`); retired routes answer 503 `route_retired` with a remedy.

**No route for cases, claims, rulings, evidence, checks, remediation, release or monitoring exists anywhere.**

Control plane: `/health`, `/v1/snapshot`, `/v1/events`, `/v1/commands`, `/v1/profiles/payload-terminal` (+ `/apply`), `/v1/profiles/notation-data-fabric`, `/v1/methodologies/payload`, `/v1/contracts/result-manifest`, `/v1/adapters/payload-terminal/observe` (`src/server.js:66-105`). `parseResultManifest` is exported but no route calls it (`result-manifest.js:113`).

## Existing visual system

`payload-terminal-v0/src/app/globals.css:9-69` is authoritative per `docs/UX_UI_V0.md:52-54`: void backgrounds (`--bg-void #04040A`, `--bg-primary #06060C`, `--bg-secondary #0C0E1A`, `--bg-tertiary #121628`), gold accent (`--gold-primary #D4AF37`, `--gold-light #F0D060`), cyan telemetry (`--cyan-primary #00E5FF`), alert red/orange/green/blue (`#FF3D3D`, `#FF9500`, `#00E676`, `#448AFF`), text (`#E8E6E0`, `#9B978E`, `#5C5A54`, `#F5F0E0`), Inter for body and JetBrains Mono for HUD values, and a Tailwind 4 `@theme inline` bridge (`:120-125`). Semantic conventions: gold = primary state/action, cyan = information, green = confirmed healthy, red/orange = exceptions.

Not carried into Payload OS (recorded deviations): glass blur and glow, scanline and pulse keyframes, the global 0.6 s colour transition on `*` (`:74-79`), the violet `theme-ghost` variant (`:84-118`), the fixed viewport overflow lock, the Google Fonts import (a blocked font host blocked page rendering behind this environment's proxy). Gaps Terminal has that Payload OS had to add: no global `:focus-visible` rule, no status tokens for verdict states, no light/print theme, no spacing scale, `--text-muted #5C5A54` fails 4.5:1 on the primary background.

The Render Engine's `src/ui/theme.css` is a different palette (`--accent #4da6ff`, IBM Plex Mono) and was not mixed in. Its `docs/ARCHITECTURE.md:306` cites a Terminal `--unk` token that does not exist.

## Relevant domain types (where the brief's concepts already live)

- **Verdicts, all three-valued and lowercase, all carrying a reason and remedy on the non-decisive branch**: `AuthorizationDecision` authorized | refused | undetermined with `CheckResult{check, outcome, detail, remedy?}` (`authorization.ts:50-115`); `TrustVerdict` cleared | blocked | undetermined (`carrierTrust.ts:99-124`); `NotaryVerdict` held | breached | unproven with `UnprovenReason` + `remedy`, `ProofRef.system 'sp1' | 'none'`, `Anchor.kind` internal | counterparty_cosigned | timestamp_authority | public_chain, `DeviceTrust.attestation` (`notary.types.ts:97-105, 187-207, 277-318`); `ClaimVerdict` supported | partially_supported | unsupported | overstated | inadmissible (`validator.ts:25`).
- **Evidence standing**: `Attestation{evidenceClass, confidence, inputCount, restsOnRepresentative, interest, restsOnInterested}`, `isAdmissible = !restsOnRepresentative` (`attestation.ts:36-119, 192-197`). The corpus contract names three axes — `claim_strength` (ranked), `production_class` (unranked, `unclassified` is an absence), `interest` (ranked) — and refuses to translate `reported` across a corpus boundary (`contract.json:15-68`). Terminal implements two axes; `production_class` is an OPEN GAP (`contract.ts:54-56`).
- **Bitemporal**: `Observation.period / knownAt / supersedes` (`types.ts:142-163`); ordering `startedAt ≤ occurredAt ≤ knownAt ≤ recordedAt` enforced (`decisionEpisode.ts:658-661`); knowledge mode `best_known | as_known_then` (`corpusTable.ts:58`, `EconTimeBar.tsx:30`); methodology `temporalSemantics` (`payload-methodology.js`).
- **Manifests and identity**: `RESULT_MANIFEST_SCHEMA` with `verification.status` verified | partially_verified | unverified | challenged (`result-manifest.js:5-32`); `notation://<kind>/<authority>/<local-id>` with kinds source, artifact, entity, observation, claim, dataset, model, state, transform, proof, node (`canonical-uri.js:3-26`); `CAPABILITY_MATURITIES` production | beta | experimental | research | planned (`maturity.js`); `Commitment{root, leafCount, postedAt, anchor}` (`notary.types.ts:73-85`); sha256 archive manifest with durability classes.
- **Case-like objects**: `LoadOperationSnapshot` (`loadOperations.ts:56-72`), `ControlTowerIssue{code, severity, detail, remedy, deadlineAt, evidenceIds}` (`controlTower.ts:46-53`), `AlternativeFeasibility` refused `{code, reason, remedy, evidenceIds}` (`decisionEpisode.ts:37-48`).
- **Universal refusal envelope**: `{kind: 'refusal', code, detail, remedy}` (`controlTower.ts:126-131`; control-plane `errors.js:11-13`). Doctrine: "a refusal is a rendered state, not an empty picture" (`EconGraphView.tsx:221-224`).

## Existing case or manifest fixtures

Terminal: `fixtures.ts` (`sourceId 'test-fixture'`), `freightFixture.ts` (five loads, `DEMO_NOW 2026-08-31T18:00Z`), `freightWorld.ts` (every record `representative`, so nothing is admissible by construction, `:51, :893`), `simulatedProver.ts` (`SIMULATED-` proof ids, `isSimulatedProof()`), committed data snapshots. Control plane: a test-only result manifest (`test/control-plane.test.js:243-258`). Render Engine: every record `provenance.source: 'synthetic:demo'` and the build fails on a missing source. **No case, ruling or admission-profile fixture existed anywhere.**

## Safe extension points used

The `CaseSource` adapter interface is the only seam this repository introduces. The substrate seams a live adapter would map from: `Attested<T>` constructors, `NotarizeInput.prove` and `Anchor`, `parseResultManifest`, the refusal envelope, `EvidenceHit` refusal rendering, `useHydrated/useOrigin` in `src/lib/ui/clientOnly.ts`.

## Conflicts or duplicated concepts

- **Product name**: Terminal (`layout.tsx:6-8`) was OSIRIS then Sea Dog Terminal; `identity.ts:16-19` records rename churn as a defect class. "Payload OS" is a third name.
- **"attestation"** has three code meanings (evidence lattice, sensor trust, carrier attestation class) plus Ed25519 posture statements in the control plane. None is the brief's VERIFIED_ATTESTATION.
- **"admissible"** in Terminal means "rests on no representative input"; it is not a ruling.
- **"refused"** has at least five meanings (authorization decision, a carrier refusing a tender, an emit result, a search family, a contract translation).
- **"manifest"** has five meanings; none carries release or recall state.
- **Supersession** in the substrate is always a pointer from the later record (`Observation.supersedes`, `supersedesEventId`), never a status on the earlier one.
- **Timestamps**: camelCase everywhere in code, snake_case on the corpus-table export and in the brief. `ruled_at`, `released_at`, `superseded_at`, `revoked_at` exist nowhere in the substrate.
- **Doc/code drift**: `docs/notary.program.md:102-107` vs `notary.ts:143-151`; `AnchorKind` three kinds in `transparencyLog.ts:372` vs four in `notary.types.ts:97`; ncg tests hard-code a control-plane path.

## What is real, mocked, absent

Real: the Terminal domain engines (clockless, tested), the control-plane journal and contracts, the ncg identity and manifest code, the archive manifest. Mocked: the freight world, the simulated prover and extractor, every dataset the Render Engine draws. Absent in every sibling: ruling statuses, assurance classes, visibility classes, a human-review state, recall or revocation of rulings, a manifest used as a certification handle, a machine-readable invariant register, DOM-level UI tests, a light or print theme, and any persistence a live case source could read from.

## Vocabulary map

| Relation | Brief term | Existing term (file) |
|---|---|---|
| OVERLAPS | CASE | `LoadOperationSnapshot` (`loadOperations.ts:56-72`) — phased operation record, no adjudication |
| ABSENT | USE / tolerance / reliance | none; only `ConditionPredicate.toleranceSeconds` |
| OVERLAPS | CLAIM | `Claim{claimId, claimantId, subjectKey, knownAt, value, attestation}` (`claims.ts:69-82`) |
| OVERLAPS | EVIDENCE | opaque `evidenceIds: string[]`; `OcrArtifact{contentHash}`; control-plane `evidenceUsed` |
| CONFLICTS | evidence class | corpus contract axes vs `carrierTrust.AttestationClass` vs ncg evidence policy |
| OVERLAPS | CHECKS / gate failures | `CheckResult{check, outcome, detail, remedy?}`, `Authorization.blockedBy` (`authorization.ts:52-115`) |
| OVERLAPS | RULING | `NotaryVerdict` / `AuthorizationDecision` / `TrustVerdict` / `ClaimVerdict` |
| ABSENT | ADMITTED, ADMITTED_WITH_CONDITIONS | nearest authorized / cleared / held / supported; no conditional state |
| OVERLAPS | PENDING_EVIDENCE | undetermined `{missing[], remedy}`, unproven `{reason, remedy}` |
| CONFLICTS | REFUSED | five existing meanings |
| OVERLAPS | SUPERSEDED | `Observation.supersedes`, `supersedesEventId`, ncg `_superseded` — pointer, not status |
| ABSENT | REVOKED / recall | `authorityRevokedAt` on carriers only |
| OVERLAPS | UNVERIFIED_EVALUATION | `ProofRef.system 'none'`, `isSimulatedProof()`, manifest `unverified` |
| ABSENT | HUMAN_REVIEWED | only `decidedBy.kind 'operator'`, `override.approvedBy` |
| OVERLAPS | VERIFIED_ATTESTATION | `NotaryVerdict` with `ProofRef.system 'sp1'`; manifest `verified` (never emitted by ncg) |
| OVERLAPS | EXTERNALLY_WITNESSED | `Anchor.kind` counterparty_cosigned / timestamp_authority / public_chain (shapes only, no adapter) |
| ABSENT | visibility classes | `Claimable.offeredTo`, `AccessScope`, `RedistributionPosture internal_only` — per source, not per ruling |
| SAME | known_at | `knownAt` pervasive |
| OVERLAPS | valid_at | `period{start,end}`, `occurredAt`, `coversFrom/To`, Render Engine `validFrom/To` |
| OVERLAPS | evaluated_at | `decidedAt`, `provedAt`, `verification.checkedAt` |
| ABSENT | ruled_at, released_at, superseded_at, revoked_at | none |
| CONFLICTS | manifest as certification/recall handle | result-manifest sidecar; `Commitment{root, postedAt, anchor}` is the nearest handle |
| OVERLAPS | content-addressed identity | `Commitment.root`, `Claimable.contentHash`, RFC 6962 log, ncg blake2b ids |
| OVERLAPS | canonical invariant register | `DEFERRED_DECISIONS` guards, `TRANSITIONS` table, `DEFECT_CLASSES.md` — code and prose, no machine-readable register |
| OVERLAPS | REMEDIATION | `remedy: string` on every refusal, finding, issue and unproven verdict |
| ABSENT | RELEASE, MONITORING of rulings | `execution_started`, `SignedTreeHead.publishedAt`; monitoring is of loads and nodes |

## Recorded architectural ambiguities

These could not be resolved by inspection. Where the implementation needed an answer, the choice is stated in `docs/UX_ARCHITECTURE.md` as a presentation policy and is reversible.

1. No substrate object carries a ruling status, assurance class or visibility class. Any mapping from held/breached/unproven, authorized/refused/undetermined, verified/partially_verified/unverified/challenged and `Anchor.kind` onto the brief's enums is an adapter policy, not a fact read from code.
2. HUMAN_REVIEWED has no substrate source beyond `decidedBy.kind 'operator'` and `override.approvedBy`.
3. Timestamp casing on the wire (camelCase substrate vs snake_case brief).
4. Whether Payload OS namespaces the brief's senses of "attestation", "admissible", "refused", "evidence class", "manifest", "claim" and "INTERNAL_ONLY", or overloads existing words.
5. Whether "Payload OS" is a rename of Payload Terminal or a third product.
6. Direction of the supersession edge (status on the earlier ruling vs pointer from the later one).
7. Whether `production_class` is shown as a third axis (with `unclassified`) or omitted until an acquisition corpus feeds it.
8. No live case, manifest or receipt store exists; the adapter can only be specified against fixtures until persistence exists.
9. DOM-level tests are a deliberate departure from the mirrored stack.
10. Which repository owns the "which kind of nothing" render channel (`--unk`).
