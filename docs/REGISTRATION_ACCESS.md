# Weighted registration and explicit access geometry

Implemented: a bounded 3D rigid weighted-least-squares estimator, local conditional covariance, held-out check-point comparisons, Cartesian distance, permitted-network shortest paths and closure scenarios. The operator CLI retains evidence-bound runs. `/compute/registration` is a selectable **synthetic preview**, not a view of operator history or a completed building survey.

This is a Compute-fabric instrument. Observations, derived alignment and operator-declared access remain distinct. No result admits a fact, changes a release, supplies independent pose evidence to GAT, installs a calibration in replay, or places a real object on Earth.

## Run and inspect

```sh
npm run spatial -- demo
npm run spatial -- inspect --id synthetic-building-access-v1 --root .payload/building-access-demo
npm run spatial -- run --request experiment-request.json --root .payload/spatial-experiments
```

The closed request has `schema: "payload.registration-access-request.v1"`, `runId`, and `manifest: {acquisitionId, acquisitionDigest, contentDigest}`. Both digests are full SHA-256 references. All artifacts must already be retained in the same evidence root. No provider URLs, programs, model overrides, clock overrides, robust-loss switches or acceptance thresholds are accepted by the CLI. Exit 0 means computed/inspected, not scientific acceptance; 2 means registration requirements remain unresolved; 1 means validation, rights, evidence or storage failed. An unreachable scenario is a valid network result, not an execution failure.

The demo captures five separate synthetic artifacts (BIM-control representation, fit readings, withheld check readings, annotated access graph, assumptions), then a manifest and create-only run. It never modifies scalar-benchmark, replay, GAT or FMCSA history. Invented fixed-source coordinates and known variances are explicit model assumptions; they are not noise estimates from an actual survey.

The browser preview computes the same method from built-in synthetic contents, with separately labelled in-memory descriptors. Its `acquisitionDigest` fields hash **preview descriptors, not actual acquisition receipts**. Selecting a measurement resolves the associated synthetic content and content digest. It cannot inspect or publish operator evidence, and does not write a run when visited. Use the CLI for actual retained receipts and policy checks. No public/customer execution endpoint was added.

## Estimation model and uncertainty

[`rigid-registration.ts`](../src/compute/rigid-registration.ts) estimates active source-to-target `R,t` minimizing `sum ||R p_i + t - q_i||² / variance_i`. Correspondences and exact source coordinates are supplied. Target errors are declared independent, isotropic, zero-mean Gaussian, with one known per-axis variance for each control. This is a restricted diagonal measurement covariance model, **not support for arbitrary correlations or uncertain coordinates on both sides**.

The proper rotation is solved using a weighted quaternion eigenproblem and bounded symmetric Jacobi iteration; translation follows the weighted centroids. This follows the quaternion absolute-orientation construction in [Horn's paper](https://people.csail.mit.edu/bkph/papers/Absolute_Orientation_Scanned.pdf), with scale fixed to one. No Ceres, GTSAM or other native dependency was installed.

At least three noncollinear controls are required; planar noncollinear controls are valid. Coincident, collinear, near-collinear, ambiguous-eigenvalue and numerically unsafe cases are refused. There is no jitter, invented anchor, scale/reflection fit, automatic correspondence search, outlier deletion or robust loss. Robust least squares is a possible distinct future method, not a capability implied by this implementation; see [Ceres loss-function documentation](https://ceres-solver.readthedocs.io/latest/nnls_tutorial.html).

The full 6×6 inverse `JᵀWJ` is a **local Gauss–Newton covariance**, conditional on the declared model. Its parameter order is target-frame small rotation `(rx, ry, rz)` in radians **about the transformed weighted source centroid**, followed by centroid translation `(tx, ty, tz)` in metres. It is not covariance of the output transform's origin translation. Rotation blocks have rad² units, translation blocks m², and cross blocks rad·m. Known noise is never rescaled to make a good fit look more certain. The local/conditional interpretation and rank requirement follow [Ceres covariance documentation](https://ceres-solver.readthedocs.io/latest/nnls_covariance.html).

For check point `p`, propagation uses `Jp = [-skew(R(p-sourceCentroid)), I]`. Under explicitly declared independence and known reference variance, predictive residual covariance is `Jp C Jpᵀ + variance_reference I`. Marginal standardized residuals are not a joint statistic or a guaranteed independent standard-normal test. Unknown check variance or unresolved independence retains raw discrepancies but leaves normalized uncertainty null.

Fit controls alone enter the estimator. Check points never enter correspondence selection or fitting in this code. The contract rejects reused measurement identities and fit/source-geometry/graph content reused as withheld check evidence, including disguised acquisition IDs. It cannot prove physical independence, prevent undisclosed copied observations or detect prior operator tuning against the check points. No pass threshold or independent accuracy claim follows from low RMSE.

The demo deliberately includes small fitting perturbations and a separate 0.1 m check-point bias. Its fitting error and withheld discrepancy therefore differ. This demonstrates software behavior, not accuracy on an unseen building.

## Distance semantics

| Model | Meaning | Here |
| --- | --- | --- |
| `EUCLIDEAN_3D` | Straight-line separation in one declared right-handed local Cartesian metre frame | Implemented |
| `PERMITTED_NETWORK_LENGTH` | Minimum sum of declared positive walking-edge lengths through permitted directed/bidirectional edges | Implemented |
| `ELLIPSOID_GEODESIC` | Geographic separation on a declared reference ellipsoid | Absent; no spherical fallback |
| `SURFACE_MESH_GEODESIC` | A path constrained to a declared surface mesh | Absent; no graph path relabelled as a mesh geodesic |

The graph shares the BIM source frame. The report also supplies registered node coordinates in the survey target frame when alignment succeeds. Proper rigid alignment preserves distances; it does not establish passage permission. A failed registration still permits source-frame network evaluation, but yields no registered nodes. Edge lengths and permissions remain static declarations, not uncertainty-propagated geometry, independently verified access or live route instructions.

Only `PERMITTED` edges participate. `PROHIBITED` and `UNKNOWN` are separately reported and excluded. A scenario removes named edges without mutating or reopening the base graph. Disconnection returns `UNREACHABLE` and null length; straight-line distance is never substituted. The six-node demo has 2 m straight-line separation, a 10 m permitted path, a 16 m passage-closure detour, and no route when the room exit closes. The two direct shortcuts are unknown/prohibited, not silently used.

Positive-weight Dijkstra uses deterministic exact-distance/lexicographic-edge-path ties. Edge lengths must not be shorter than endpoint chords beyond an explicit floating-point tolerance (`1e-9 m + 1e-12 * chord`); that tolerance is not survey uncertainty. The implementation does not establish accessible or fire-safe egress, truck routing, door width, temporal permissions or travel time. Relevant distinct future engines are [GeographicLib ellipsoid geodesics](https://geographiclib.sourceforge.io/html/java/net/sf/geographiclib/Geodesic.html) and [CGAL surface paths](https://doc.cgal.org/latest/Surface_mesh_shortest_path/index.html); [NetworkX shortest paths](https://networkx.org/documentation/stable/reference/algorithms/shortest_paths.html) describes the network problem. None is installed or invoked here.

## Evidence and authority boundary

`payload.registration-access-experiment.v1` pins the BIM-control representation, fit/control measurements, check measurements, frames, assumptions, graph snapshot, scenarios and domain exclusions. Values are operator-declared representations: checking source bytes proves byte continuity, not correct extraction, a real surveyed BIM, truthful measurement covariance or correspondence accuracy.

For a new retained run, every exact acquisition and its content are reopened and verified, and each requires `INTERNAL / DERIVE / spatial-registration-access` at the backend execution time. Prior replay/scalar/INGEST permission does not confer this use. The run must not precede evidence storage. Storage is create-only under `<root>/registration-access/<sha256-of-run-id>.json`, retaining source capture/storage times, original policy decisions, numerical guards, algorithm versions, result and digest.

Inspection recomputes the original policy gates and result, and fails on missing or altered inputs/results without repair or source contact. An exact retry preserves its existing run. This trusted-local historical inspection is not a new use grant, customer authorization service, independent verification, external revocation check or claim that retention remains permissible today.

Bounds: request 4 KiB, manifest 256 KiB, run 512 KiB; 3–64 fit controls and 1–32 check points; 128 graph nodes, 256 edges, 8 scenarios; 64 dependencies plus manifest, 64 MiB aggregate, existing 8 MiB per-artifact limit. Coordinates are within ±1e6 m, variances 1e-8–1e6 m², edge lengths 1e-6–1e7 m. Numerical guard values are pinned in each result's method descriptor.

Still absent: real surveyed BIM import, scan matching, general correlated/noisy-source registration, camera–LiDAR extrinsic calibration, temporal calibration, sensor trajectory fusion, independent survey validation, ellipsoid/mesh engines, production customer execution and automatic admission. These foundations do not change the company mandate or require customers to use supplied inference.

## Verification receipt — 2026-09-06 UTC

`npm run check` passed typecheck, lint, 3,019 JavaScript/TypeScript tests (99 files; six optional GAT tests skipped), and 29 Rust tests. This increment adds 435 unit/component checks, including numerical analytic oracles, coordinate-origin-invariant check covariance, independent graph path enumeration, exact policy/evidence refusals, rehashed-history tampering and fresh-process CLI readback. Production build and local-history trace exclusions passed.

Six focused desktop/mobile browser checks passed: four spatial-inspector interaction/accessibility checks, plus two product-to-inspector navigation checks. The inspector tests proved no external requests or writes and no horizontal overflow with expanded content. Desktop/mobile screenshots were inspected. Full browser, optional GAT execution and dedicated notation-browser suites were not rerun.

Actual retained synthetic run: `synthetic-building-access-v1`, digest `sha256:ddbe79c18c1eefaf00b41d66143b389d58b020ea0485731b924646b152a6e2f7`; result digest `sha256:2b5207a5a207f79c99f71bfd38bcd2864ca15e79ac90eeb7419fc85125053814`. Fitting RMSE is 0.0181679442 m; synthetic withheld discrepancy RMSE is 0.1001001809 m. Straight-line/base/detour distances are 2/10/16 m, and the closed-exit scenario is unreachable. Fresh-process inspection and exact retry preserved all 13 files. Prior scalar-benchmark, observation-replay and all eight FMCSA history files remained byte-identical. No real survey dataset, BIM import, source collection or independent physical validation occurred.
