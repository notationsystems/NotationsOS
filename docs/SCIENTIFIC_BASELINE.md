# Evidence-bound scientific baseline

Implemented: one conventional **scalar linear-Gaussian estimator**, an evidence-bound benchmark with held-out-reference metrics, and an operator CLI. The demonstration is synthetic. This is not GTSAM integration, 3D fusion, BIM certification, a trained model or independent physical validation. [Scientific model roles](SCIENTIFIC_MODEL_ROLES.md) records specialist families without changing the company or requiring customers to use supplied inference.

## Run

```sh
npm run benchmark -- demo
npm run benchmark -- inspect --id synthetic-scalar-benchmark-v1 --root .payload/scalar-benchmark-demo
npm run benchmark -- --help
```

The demo captures five distinct synthetic artifacts: assumptions, development input/reference and held-out input/reference, followed by their manifest. It never fills variances into the existing [observation replay](RECORDED_OBSERVATION_REPLAY.md). The two cases use separate invented session groups. Development observations are absolute positions 0 and 2 m and displacement 1 m, each variance 1 m². The analytic estimate is `[1/3, 5/3]` m and joint covariance `[[2/3, 1/3], [1/3, 2/3]]` m². The second case is translated synthetic data, not an unseen real collection.

For existing operator-retained data:

```sh
npm run benchmark -- run --request benchmark-request.json --root .payload/scientific-benchmarks
npm run benchmark -- inspect --id my-benchmark-v1 --root .payload/scientific-benchmarks
```

The closed request is `payload.scientific-benchmark-request.v1`, with `runId` and `manifest: {acquisitionId, acquisitionDigest, contentDigest}`. Both digests are full `sha256:` references. Manifest and dependencies must already exist in that local evidence root. There are no caller model, program, provider, training, clock or acceptance-threshold controls. Exit 0 means computed/inspected; 2 means an inspectable run has unresolved model requirements; 1 means validation/evidence/policy/storage failed. Preserve history and inspect the exact ID before retrying an uncertain publication.

## Fixed model

[`scalar-gaussian.ts`](../src/compute/scalar-gaussian.ts) defines ABSOLUTE as measuring `x`, and RELATIVE as measuring `x[to] - x[from]`. Variables are scalar positions on a declared Cartesian axis, in metres, with exact integer-nanosecond times. Frames, calibration and clocks are assumed fixed, not estimated. This is not a raw camera/LiDAR/GNSS/IMU adapter.

The model minimizes squared residuals weighted by inverse known variance. For linear design H and diagonal noise covariance R, joint precision is `HᵀR⁻¹H` and conditional covariance is its inverse. Marginal variances are covariance diagonals, **not** reciprocal precision diagonals. Independent measurement errors can yield correlated posterior states. This factor interpretation follows the [GTSAM introduction](https://gtsam.org/tutorials/intro.html); no GTSAM code is imported.

Every connected component needs an explicit absolute factor. Missing positive variance or unresolved fixed-representation/factor-independence declarations yields `UNRESOLVED_REQUIREMENTS`. There is no guessed noise, implicit anchor, damping or jitter. Diagonally scaled Cholesky refuses a scaled pivot ≤1e-12 or scaled infinity-norm condition estimate >1e10. These guards are named in the model descriptor.

`factorResiduals.standardizedResidual` is fitted residual divided by measurement sigma—not an independent unit-normal z-score. Fitting changes residual covariance. These residuals and conditional covariance do not establish calibrated coverage or field accuracy.

## Evaluation boundaries

[`benchmark-contract.ts`](../src/compute/benchmark-contract.ts) requires a declared validation domain/exclusions, and development/held-out cases split by whole collection session, site, geometry or operating condition. Factors and references carry exact artifact and measurement identities. Values remain operator-declared representations; verifying bytes does not establish extraction or physical accuracy.

Reference values never enter the solve, anchor a variable or tune a parameter. Groups cannot cross splits. Measurement bytes cannot cross development/held-out splits or input/reference roles; reused source measurement identities are refused. Shared assumption artifacts remain explicit. These checks detect obvious leakage, not copied labels, shared corrections or references used indirectly for calibration/correspondence selection. Identifier disjointness is not independence.

Results show per-case input counts, fitted means/full covariance, reference residuals, RMSE/max error and separate split summaries. `allCasesComputed` means only that every scalar solve produced a result; refusal counts/null metrics remain visible. The algorithm has no trained parameters. Split groups establish an evaluation contract, not evidence of learning or unseen-site generalization.

Held-out normalized residuals use estimate variance plus reference variance **only under declared independence**. Missing reference variance or unresolved independence leaves normalized metrics null while retaining raw residuals. No automatic pass threshold or independent validation is claimed.

## Evidence, policy and persistence

The store reopens the manifest and every input/reference/assumption acquisition, verifies bytes/receipts, and separately evaluates `INTERNAL / DERIVE / scientific-model-benchmark` at execution time. INGEST or the previous replay purpose does not grant this derivation. Neither does this purpose grant MODEL_TRAINING, export or trading.

Create-only runs reside at `<root>/scientific-benchmarks/<sha256-of-id>.json`, binding manifest, dependencies, decisions, model/version/assumptions/numerical guards, validation domain, uncertainty method and result digest. Inspection recomputes results and original policy gates without source contact, rewriting or repair. It establishes no current retention/access grant and checks no later external revocation.

`runtimeObservation` retains Node version, platform/architecture and monotonic elapsed time before publication: parsing/evidence verification/evaluation, **excluding persistence and readback**. It is retained telemetry, not independently attested or remeasured during inspection, and not a full-pipeline performance comparison. Exact retries preserve original timing; numerical output has its own deterministic digest.

Limits: 4 KiB request; 128 KiB manifest; 512 KiB run; 8 cases; 16 states, 64 factors and 16 references per case; 64 referenced dependencies plus manifest; 64 MiB aggregate and existing 8 MiB per-artifact bound. Variances are 1e-8–1e6 m²; measurement magnitudes ±1e6 m. Storage remains trusted-local and rights operator-declared.

All results deny independent verification, field accuracy, admission, physical-action authorization, full sensor fusion, Earth eligibility and trained-model execution. [GAT](GAT_INSPECTOR.md) remains an unchanged IFC audit integration. Real calibrated observations, independent reference uncertainty and withheld physical outcomes remain absent; these are prerequisites for physical validation and comparison with a learned alternative.

## Verification receipt — 2026-09-06 UTC

`npm run check` passed typecheck, lint, 2,584 JavaScript/TypeScript tests (six optional GAT tests skipped) and 29 Rust tests. The new Compute suites account for 265 tests; two further presence tests protect the product boundary. Production build and local-history trace exclusions passed. Fourteen focused desktop/mobile browser checks passed, covering product wording, disclosures/overflow, accessibility and unchanged information-product/release boundaries. Full browser, optional GAT execution and dedicated notation-browser suites were not rerun for this increment.

The actual synthetic CLI run `synthetic-scalar-benchmark-v1` is retained separately at `.payload/scalar-benchmark-demo`, digest `sha256:a12fa20d3d8be48d075df060d46ac42ff62d058af5cd6295c2b225c876739240`. Its numerical-result digest is `sha256:9a9154d4d42436a33cc301578fd2ce26ee3bd64221167082add5d934d76ca874`. Fresh-process inspection and an exact retry preserved all 13 files and the same result/timing. The prior observation-replay digest and all eight FMCSA history file hashes remained unchanged. No sensor dataset was downloaded and no admission, GAT execution, customer workload or neural training occurred.
