# Clearance measurement design: exact value of information

Implemented: one bounded, evidence-linked Bayesian decision experiment and a synthetic inspector at `/compute/clearance`. It predicts how a possible measurement would change a clearance decision, compares its expected decision benefit with cost, and preserves the declared joint dependencies. **It executes no measurements, source queries, agent workflows or physical actions.** It is optional Compute-fabric machinery; customers can still apply their own inference to the firm's data streams.

## What this implements—and what it does not

This is finite Bayesian decision analysis, not a Free Energy Principle implementation, variational-inference solver or active-inference policy. The [active-inference comparison paper](https://arxiv.org/abs/2110.04074) distinguishes expected utility, information gain and expected free energy. The criterion used here is specifically expected reduction in decision loss minus acquisition cost, consistent with the [EVSI tutorial's distinction between information value and sampling cost](https://journals.sagepub.com/doi/10.1177/0272989X211026292).

A Markov blanket describes conditional independence under a specified probability model. An API, building wall or service boundary is not evidence of that relation. The [Markov-blanket paper](https://discovery.ucl.ac.uk/id/eprint/10048231/) and [Free Energy Principle formulation](https://arxiv.org/abs/2201.06387) concern statistical/dynamical assumptions; this repository does not establish them for the OS. The inspector exposes a declared dependency structure without certifying a blanket.

Existing GAT work was inspected read-only: the pinned `gat/gaussian/condition.py` updates a raw-space Gaussian belief, and `gat/engine/propagate.py` propagates joint covariance through a total Jacobian. That supports preserving shared uncertainty as an architectural requirement. **This increment neither imports those methods nor runs/modifies GAT.** It adds a separate exact finite model, not a Gaussian approximation, a changed runtime pin or an admission authority. The Bench-derived evidence rail supplies immutable references and policy checks; it does not certify probability-model correctness.

## The bounded physical question

For a stationary, lateral, rectangular opening/equipment model in one declared Cartesian metre frame, each joint state supplies opening width `O`, equipment width `W` and equipment-center offset `A` relative to the opening center:

```text
left side margin  = (O − W) / 2 + A
right side margin = (O − W) / 2 − A
minimum margin   = (O − W) / 2 − |A|
```

`fits` means the minimum margin is at least the declared threshold. Its boundary is tested by exact decimal comparison of `O − W − 2|A| ≥ 2 × threshold`, interpreting each parsed number's shortest decimal representation (`Number.toString`). Displayed side margins are floating-point projections, not the fit predicate; for example, 1.2 m minus 1.1 m gives exactly two 0.05 m margins under this declared-decimal convention. No tolerance promotes a below-threshold geometry to a fit. Reference minimum margins use the same inclusive decimal comparison. The same `A` enters both sides with opposite signs. It is **not** a common translation artificially changing an object's width. Both widths and the shared alignment remain in every joint state; marginal distributions are never multiplied to replace that joint belief.

This checks only the specified one-axis static model. It is not a 3D collision test, BIM import, scanned-opening fit, rotating transport envelope, overhead clearance, dynamic maneuver, accessible/fire-safe egress or safe-passage authorization. Discretization error, missing physical states, empirical noise and unmodelled geometry remain the operator's unresolved modelling responsibilities.

## Explicit objective and observation model

There are two hypothetical decisions: `ACCEPT_FIT` and `REJECT_FIT`. Incorrect acceptance incurs `unsafeAccept`; unnecessary rejection incurs `unnecessaryReject`; correct decisions have zero loss. Both losses and measurement costs use the same abstract `DECLARED_LOSS_UNIT`, not inferred money. Decision ties choose `REJECT_FIT`; this tie rule is not a safety certification.

For joint state `s`, prior `p(s)`, decision loss `L(d,s)` and possible measurement outcome `y`:

```text
current risk = min_d Σ_s p(s) L(d,s)
post-measurement risk = Σ_y min_d Σ_s p(s) p(y | s, a) L(d,s)
EVSI = current risk − post-measurement risk
net value = EVSI − measurement cost
```

The unnormalized branch-risk calculation handles impossible outcomes without division by zero. A branch with positive outcome probability has an exact finite posterior proportional to `p(s) p(y|s,a)`; a zero-probability outcome has **null posterior**, not invented certainty. The browser's outcome selector displays these hypothetical posteriors; it neither records a real observation nor replaces the current belief.

The manifest supplies **one explicit joint outcome likelihood table** covering every candidate measurement. Single-measurement likelihoods and selected subsets are obtained by summing its columns. The measure-all baseline uses this joint table, not a product of separately supplied likelihoods. Correlated measurement errors therefore remain representable. Omitted joint outcome tuples have zero probability under the declared model; missingness/failure requires an explicit outcome if it is to be modelled.

The selector considers one measurement followed by a decision. Only `DECLARED_PERMITTED` actions are eligible. Unknown/prohibited actions remain inspectable counterfactuals but cannot be selected. The result also compares no measurement, cheapest-first, largest-target-variance-first and measuring every declared-permitted action. The variance baseline uses prior variance of the named target in m², not entropy, measurement quality or the largest predicted decision improvement. It deliberately measures once even when its net value is negative. No measurement is selected by VOI unless its positive net value is numerically resolved. This is not an optimized adaptive multi-step policy or a guarantee that a measurement bundle cannot outperform one step.

Unit-mass probabilities are checked within `1e-12`; admitted within-tolerance mass normalization is explicit in diagnostics. Larger errors fail. Decision risks within `1e-12 × max(|accept risk|, |reject risk|)` choose conservative rejection; this relative tie threshold has no absolute floor. Measurement net value must exceed `1e-12 × max(1, current risk, posterior risk, cost)` to be recommended. A smaller positive net value is retained and marked numerically ambiguous, not promoted into an action recommendation. Positive probability or loss products that underflow to zero are refused. The method descriptor pins numerical conventions, IDs, version and tie behavior. The original manifest digest is retained; probabilities are not silently edited in evidence. Floating-point guards are numerical tolerances, not empirical uncertainty.

## Synthetic oracle and comparisons

The demonstration enumerates eight equally likely states: opening width `{2.0, 2.4}` m, equipment width `{1.78, 1.82}` m, and center offset `{0, 0.2}` m. The required margin is 0.05 m. Only a narrow opening with the nonzero offset fails, so the prior fit probability is 0.75. Synthetic losses are 100 for unsafe acceptance and 10 for unnecessary rejection. Perfect categorical measurements are assumed **only for this software oracle**.

| Strategy | Measurement cost | Expected decision loss | Expected total |
| --- | ---: | ---: | ---: |
| None | 0 | 7.5 | 7.5 |
| VOI: alignment | 1 | 2.5 | 3.5 |
| Largest target variance: opening | 4 | 2.5 | 6.5 |
| Cheapest: equipment width | 0.5 | 7.5 | 8 |
| All declared-permitted measurements | 5.5 | 0 | 5.5 |

Alignment and opening each reduce expected decision loss by 5, but their costs differ. Equipment width is uncertain and its measurement informative about that variable, yet it does not improve this particular decision under these losses. All values above are analytically predicted under the invented model, not measured business value, actual acquisition prices or field performance.

The conservative loss policy also illustrates why error rate and decision loss differ: the initial `REJECT_FIT` decision is wrong in 75% of these states but costs less in expectation than accepting with a 25% unsafe rate. The inspector shows both risks rather than turning fit probability into an unconditional accept/reject threshold.

## Reference comparison is separate from prediction

Optional reference cases supply independently characterized minimum-side-clearance measurements and the candidate measurement outcomes. They are inspected **only after** the model-only recommendation and baseline selections are fixed. Their labels never enter prior probabilities, likelihoods, strategy selection or tuning in this implementation.

With declared independence and valid outcomes, the code reports descriptive decision-error rate, mean decision loss, measurement cost, total loss and Brier score against those cases. Brier score is a probability-prediction score, not a calibration certificate. Groups are counted, not treated as proof of independence or converted into spurious confidence intervals. There is no fitted noise model, calibration curve, hypothesis test or automatic acceptance threshold.

Reference artifacts must be distinct from model, likelihood, action and loss artifacts; reused measurement references and conflicting exact acquisition references fail. This catches direct byte reuse, not undisclosed copying, shared survey corrections, prior human tuning or incorrectly declared independence. A full validation outcome tuple with zero probability under the model is an explicit model contradiction: that case is unscored and aggregate metrics are withheld rather than silently dropping inconvenient records. Independent-reference status `UNRESOLVED` also withholds scoring.

The demo's separate reference artifact repeats constructed oracle scenes. Its independence is deliberately **UNRESOLVED**. Consequently the screen provides expected strategy metrics but does not claim empirical error or calibration. A completed test against real independent observations remains absent.

## Retained run and current-use checks

```sh
npm run clearance -- demo
npm run clearance -- inspect --id synthetic-clearance-voi-v1 --root .payload/clearance-demo
npm run clearance -- run --request <request.json> --root <private-evidence-root>
```

The closed request contains `schema: "payload.clearance-voi-request.v1"`, `runId`, and `manifest: { acquisitionId, acquisitionDigest, contentDigest }`. There are no source URLs, programs, agent IDs, clock overrides or execution commands. New input artifacts must already be retained through the evidence intake rail. The typed experiment contract is in `src/compute/clearance-contract.ts`; the executable synthetic input builder is in `src/compute/clearance-demo.ts` and is not permission for real collection.

Each retained run reopens exact manifest/dependency bytes, checks original `INTERNAL / DERIVE / clearance-measurement-design`, and binds capture/storage times, model version, decisions, result and digest. **Current** `RETRIEVE` and `DERIVE` permission and declared `UNTIL` retention are also checked, including inspection and retry. A run cannot precede its evidence storage or lie in the future relative to inspection. Expiry refuses output; it does not renew policy, repair files or delete retained bytes. Capture/ingestion permission or the previous benchmark purpose alone is insufficient.

History is create-only at `<root>/clearance-voi/<sha256-of-run-id>.json`. Exact retries preserve the original result/time. Reused IDs with changed requests conflict; missing or changed dependencies fail without repair. Demo retries inspect an existing run before bootstrapping any artifacts, so lost evidence is not silently regenerated. Local digest recomputation demonstrates consistency, not external attestation or protection against an operator coherently rewriting an entire store.

Bounds: request 4 KiB, manifest 256 KiB, run/result 1 MiB, 2–16 distinct joint states, 1–4 actions, 2–4 outcomes per action, at most 64 joint outcome tuples and 64 optional validation cases. Up to 64 unique dependencies plus the manifest and 64 MiB total retained input bytes are supported. Widths are 0.001–1000 m, offsets ±1000 m, required margin 0–10 m, positive decision losses 1e-9–1e6 loss units, and measurement costs 0–1e6 loss units. Smaller positive decision losses, including subnormals, are refused instead of silently rounding their risks into misleading ties. These are local numerical/resource limits, not physical validity guarantees.

CLI exit `0` means computed or inspected, **not independent validation**. Exit `2` means model assumptions remain unresolved; exit `1` means input, current-use, evidence or storage failed with a fixed sanitized error. Source bytes are not printed, but manifests and derived results can contain private information: keep stdout and the selected root inside the same authorized custody boundary. Default roots are `.payload/clearance-demo` for synthetic material and `.payload/clearance-experiments` otherwise.

This is trusted-local storage, not managed tenant isolation, an encryption service, an external revocation monitor or a retention-purge scheduler. Generic intake tools/filesystem access can bypass this connector's read gate. Use an access-controlled private root outside shared/synced folders for permitted private evidence, and do not expose it through generic APIs. No private source evidence was used for this increment.

## Frontend and product boundaries

`/compute/clearance` receives only a server-computed synthetic preview. Its evidence references are labelled **preview descriptors, not acquisition receipts**. Selecting a measurement changes the inspected artifact and possible posterior outcomes; selecting an outcome changes no saved belief. Model assumptions, loss, measurement declarations and references stay distinguishable. No browser computation, collection route or mutation endpoint was added.

The original FMCSA and Samsara histories, observation replay, scalar benchmark, registration/access runs, Earth Twin and GAT runtime are not input to this demonstration and remain unchanged. No new customer category, data-release authority, proprietary-capital access, agent execution permission or platform-wide self-organization claim follows from it.

## Verification receipt

The synthetic CLI demonstration was retained at `2026-09-06T03:12:58.454Z` in `.payload/clearance-demo`, separate from all previous demonstrations. It contains 13 files: five source artifacts, a bound manifest, their six acquisition records and one computed run.

- Run ID: `synthetic-clearance-voi-v1`.
- Run digest: `sha256:91713979d520719f82a5f744ed394486cdb294bd602e2a5ecb356586377843f6`.
- Result digest: `sha256:d60aa13c0e6ae3f889592f3b11c0ec383e08a92932a2d45c5b0a5da39f6962a0`.
- Method digest: `sha256:d4e783defb85c3d936b82578aec6cd6bbffcf9bd721f194e46df26f8a9199b61`.
- Result: hypothetical `measure-alignment`, expected loss 2.5 plus cost 1; all five totals match the oracle table above.
- Independent reference state: `UNRESOLVED_INDEPENDENCE`; eight supplied synthetic cases, zero scored cases, null empirical metrics.

Fresh Node-process inspection and exact demo retry returned the same run/result/time and preserved all 13 file hashes. A separate CLI regression additionally disables HTTP, HTTPS, DNS and fetch during its fresh-process demo → inspect → run → demo cycle. The 50 pre-existing source-qualification, observation-replay, scalar-benchmark, building-access and Samsara-demo files also retain their original hashes.

Review caught and fixed ordinary decimal threshold and risk-tie counterexamples, refused unsupported subnormal loss inputs, and fixed demo retry to refuse missing evidence without regenerating it. These behaviors have executable regressions. Full software verification results are recorded below; real independent measurement validation remains absent regardless of those results.

- Repository typecheck and ESLint: passed.
- Rust notation kernel: 29 tests passed.
- Full JavaScript/TypeScript suite, two workers: 109 files passed; **3,869 tests passed**, six existing opt-in GAT runtime tests skipped. This includes 71 clearance numerical tests, 54 contract tests, 78 store tests, 38 CLI tests and 11 inspector tests.
- Production build: passed, including the unchanged 377-file Cesium asset manifest and checks excluding local history, runtime installations and compiler scratch from build traces.
- Built-app browser checks in headless Edge: **six passed** across desktop and Pixel 7 profiles, with two workers. They cover hypothetical outcomes, exact evidence inspection, unchanged current beliefs, five strategy comparisons, withheld reference scores, product navigation, no horizontal overflow, keyboard operation, and no serious/critical axe findings. The workflow recorded no external requests, non-read requests or page errors.
- One initial parallel keyboard test lost focus before its assertion; all six checks passed unchanged serially. The test was then strengthened to prove a real handler-driven selection change before checking focus, without arbitrary waits or weakening the focus assertion. Two subsequent parallel runs passed. The original focus-loss cause was not conclusively identified.
- Desktop and CSS-scale mobile screenshots were visually inspected. Tall device-pixel captures were replaced with CSS-scale and smaller viewport/section captures for readable inspection. Evidence artifacts remain collapsed by default, controls and values fit, and the corrected full-page capture contains one page, not a stitched duplicate. Screenshots are local under `.stamp/clearance-browser` and are not committed.

No provider connection, live GAT integration, field calibration, independent observation study, source-query selector deployment, customer release or action execution was performed or claimed by these checks.
