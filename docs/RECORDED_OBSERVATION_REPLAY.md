# Local recorded-observation replay

Implementation: 2026-09-06 UTC. This is a bounded **operator CLI and deterministic replay contract**, not a sensor driver, fusion stack, real-data import, visual sensor inspector or admitted corpus. The runnable demonstration is explicitly synthetic. [Boreas qualification](RECORDED_DATASET_QUALIFICATION.md) identifies the first candidate dataset and the adapter work still required. The real cross-sensor/cross-session acceptance question is **not yet satisfied**.

## Run and inspect

```sh
npm run replay -- demo
npm run replay -- inspect --id synthetic-replay-v1 --root .payload/observation-replay-demo
npm run replay -- --help
```

The demo captures invented analytic inputs and their manifest through the existing evidence intake, then publishes a recomputable report: eight camera/LiDAR/GNSS/IMU placeholders across two sessions, four supplied point estimates and six pairwise residuals, including an invented 0.05 m discrepancy. These are not real images, scans, calibration measurements, receiver readings, object associations or achieved survey accuracy. No network is contacted.

For retained operator inputs:

```sh
npm run replay -- run --request replay-request.json --root .payload/observation-replay
npm run replay -- inspect --id my-replay-v1 --root .payload/observation-replay
```

The closed request has `schema: "payload.recorded-observation-replay-request.v1"`, `replayId`, and `manifest: {acquisitionId, acquisitionDigest, contentDigest}`. Both digests are `sha256:` plus 64 lowercase hex characters. The manifest must already be captured through [local intake](LOCAL_EVIDENCE_INTAKE.md) under an appropriate source registration. There are no URL, provider-key, hardware, executable or caller-clock controls. `--root` is a local operator choice, not a tenant storage API.

Output contains the parsed manifest, calibration/trajectory metadata, uncertainty, evidence references and report. `rawBytesIncluded: false` means referenced raw sensor payloads are not embedded; manifest fields and derived coordinates **are** included and remain internal data. No pixel/point-cloud decoder or browser viewer exists yet.

## Observation contract

[`src/observation/contract.ts`](../src/observation/contract.ts) defines strict `payload.recorded-observation-manifest.v1`. Unknown fields, missing references and contradictory frame relationships fail validation.

- Raw artifacts, calibrations, clock mappings, poses and supplied points carry exact acquisition/content references. Method, version and description are retained. Integrity does not prove that an operator interpretation accurately describes the bytes.
- Frames are right-handed local Cartesian metres, with declared axes/origins and separate sensor/body/world roles. No geographic conversion, datum registration or equivalence between distinct world IDs is inferred.
- Native times are integer **nanosecond strings**, retaining clock basis and epoch. An explicit offset, uncertainty, method, evidence and half-open validity interval map to a named timeline. No implicit GPS/UTC, leap-second, drift or millisecond conversion occurs.
- Samples retain sensor, timestamp meaning, duration, encoding and raw reference. `INSTANT` requires zero duration. A scan midpoint does not imply simultaneous points.
- Calibration is a versioned active `sensorToBody` transform with explicit direction and half-open timeline validity. Rotation is unit **xyzw** quaternion, checked within 1e-10; no silent normalization.
- Trajectory poses are explicit `bodyToWorld` transforms with their own clocks and evidence. No interpolation, nearest-pose substitution or inertial integration occurs.
- GNSS retains raw/typed solution status, correction service and age. Missing fields remain null/UNKNOWN. RTK is a GNSS status, not a separate modality or an accuracy guarantee. Communications are outside the sensor vocabulary.
- Object association is an operator assertion with rationale and uncertainty description—not canonical identity or verified correspondence.

`covarianceM2` describes a supplied point in its sensor frame. Supplied `covariance6` requires convention `PARENT_FRAME_XYZ_METRE_ROTATION_VECTOR_RADIAN_LEFT_PERTURBATION`: translational metre then rotational radian perturbations in the transform's parent frame, using left SE(3) perturbation. Matrices are checked for finite dimensions, symmetry and positive semidefiniteness within scaled 1e-12 numerical tolerance. Other source conventions require explicit upstream conversion. Null means not supplied. Covariance is **preserved, not propagated**; pose/calibration/timing correlations are not modelled.

## Placement and residuals

A supplied point marked `AT_REFERENCE_STAMP` needs valid calibration and a pose on **exactly the same timeline and nanosecond**. This asserts the point has already been referred to that timestamp, not that the whole exposure/scan has that support. No camera-depth inference, point-cloud deskew, extraction or motion compensation is performed. Unknown timestamp meaning, missing point/time support, expired calibration or even a 1 ns pose mismatch produces inspectable `UNPLACED` blockers.

The transform is `p_world = R_body_world (R_sensor_body p_sensor + t_sensor_body) + t_body_world`. Mounting/lever-arm transformation precedes platform pose. Antenna position is not substituted for object position. The importance of lever arms and mounting rotations is documented in [NovAtel's configuration guidance](https://docs.novatel.com/OEM7/Content/SPAN_Operation/SPAN_IMU_Configuration.htm).

Comparisons require one declared world frame and report right-minus-left vector, distance, time gap when comparable, and cross-session status. They retain `RESIDUAL_ONLY`, `accuracyEstablished: false`, unverified association, unpropagated uncertainty and absent static-scene/motion-model limitations. Small residuals can reflect shared bias or wrong association. There is no automatic acceptance threshold.

## Policy and persistence

A new replay reopens the exact manifest and every dependency, verifies bytes/receipts, and separately evaluates **INTERNAL / DERIVE / recorded-observation-replay** at replay time. INGEST-only, approval-required or expired grants refuse new computation. Acquisition `capturedAt`/`storedAt` remain separate from original sensor time.

Create-only reports live at `<root>/observation-replays/<sha256-of-id>.json`, pinning request, dependencies, decisions, method/version, input and output digests. Inspection recomputes the complete report at original policy time without writing; it grants no current access/retention rights and checks no later external revocation. Exact retries preserve history. Changed manifests require new acquisitions and replay IDs. Damaged/conflicting records are never repaired. After publication/readback failure, preserve history and inspect the exact ID before retrying.

Limits: 4 KiB CLI request, 256 KiB manifest, 512 KiB report, 8 MiB per artifact, 64 MiB aggregate dependencies, 64 observations, 128 poses, 32 calibrations, 16 clocks, 8 sessions and 256 comparisons. Filesystem trust and operator-declared rights remain existing rail limitations; hashing is not independent verification or physical WORM storage.

Bench study contributed exact reference closure, explicit missingness and replaceable-projection boundaries—not sensor-calibration code. Existing Carrier/FMCSA history, Rust notation state, customer fixtures and Earth release gates are unchanged. Every computation retains `canonicalAdmission: false`, `earthProjectionEligible: false`, `sensorFusionPerformed: false`, `objectIdentityEstablished: false` and `accuracyEstablished: false`.

Next: the bounded provenance-preserving Boreas adapter, actual retained calibration/timing/trajectory/raw observations, then an evidenced cross-session object association. Real-data replay, a visual sensor inspector, Earth registration, uncertainty propagation and completed acceptance remain absent.

## Verification receipt

On Windows, `npm run check` passed typecheck, lint, 2,317 JavaScript/TypeScript tests (including 234 new replay tests; six optional GAT runtime tests skipped) and 29 Rust tests. `npm run build` passed, including the local-history exclusion trace guard. Browser and optional GAT integration suites were not rerun for this CLI-only increment.

An actual **synthetic** demo was retained separately at `.payload/observation-replay-demo`: `synthetic-replay-v1`, digest `sha256:010d76c92c837b8cd15b9b8a97247ba6cb6a83f805c15591ebbb5e311e38b3dc`. Fresh-process inspection and an exact retry returned the same digest with all five files unchanged. All eight files in the existing FMCSA source-qualification history retained their prior hashes. No Boreas sensor records were downloaded, and no customer delivery, canonical admission or Earth geometry was changed.

## The replay surface (frontend)

`/compute/observations` makes this contract readable without changing it. The page computes an in-memory synthetic preview on the server (`src/observation/preview.ts`: the synthetic manifest, plus, for the preview only, the support failures the contract can express: a clock with no mapping to the common timeline, a calibration that has expired, a pose stamped ten milliseconds after its observation, and a supplied point whose time support is unresolved) and renders it with `src/components/compute/ObservationReplay.tsx` over the pure derivations in `src/domain/observationReplay.ts`. The mode is `IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED`: no acquisition receipt, no policy decision and no retained report are asserted, as the registration preview does. Retained manifests are replayed by the operator CLI, not by the page.

- **Frames.** A diagram in three columns: sensor frames, body frames per session, world frames. Calibrations are the edges from sensor to body, poses the edges from body to world. Selecting an observation activates its chain and judges each link at the observation's aligned time: solid where valid, dashed where the calibration's window or the pose's stamp does not support the point, dotted where there is no aligned time to judge at. Each link carries its transform as declared. Nothing links two world frames.
- **Time.** Every aligned instant on the declared common timeline, as seconds from the earliest instant it carries, with the exact nanosecond string on every mark. Clock alignment windows and calibration validity windows are bars; observations and poses are ticks; a pose that arrived later than the observation that names it is a red bracket labelled with the exact delta. Observations whose clock declares no mapping are listed apart, on their own clock and basis, with no place on the timeline and no comparison with anything on it.
- **Observations.** The computation's rows as returned: aligned time or `unaligned`, `PLACED_ESTIMATE` or `UNPLACED`, the blockers by code, and the kinds of thing each row is, from a closed vocabulary: synthetic input or recorded input; supplied estimate or no estimate; placed estimate or unresolved placement. A comparison is a fourth kind, residual only.
- **The inspector.** For the selected observation: its stamp with clock, basis, native nanoseconds, meaning and duration, and its aligned time or the absence of one; its retained evidence by exact artifact reference, encoding and processing method; its GNSS block where present, the receiver solution shown as a status as recorded and not an accuracy; its supplied estimate with point, covariance or none, temporal support, method, evidence and the association with its authority, description and uncertainty; the chain with each link's state and transform; the computed placement in the declared world frame with uncertainty `NOT_PROPAGATED`, or the blockers with what each means; and every comparison it takes part in, with the other side one click away, the residual as a difference and nothing more, and the limitations spelled out.

Selection connects the views: a row in the register, a sensor node in the diagram, a tick on the timeline, an entry in the unaligned list, or either side of a comparison. Escape closes the inspector. The surface infers nothing: every number is the contract's or the computation's, and every state is named by the code that produced it.

**Verified** (`src/domain/observationReplay.test.ts`, `src/components/compute/ObservationReplay.test.tsx`, `tests/e2e/observation-replay.spec.ts`): the preview accepted by the strict contract with the added failures producing exactly `CALIBRATION_NOT_VALID_AT_OBSERVATION + POSE_TIME_MISMATCH` (a ten-millisecond pose delta), `CLOCK_ALIGNMENT_UNAVAILABLE + POINT_TIME_UNRESOLVED + …` and `NO_POINT_ESTIMATE`; every blocker and limitation the computation emits named; the chain judged link by link; the diagram activating exactly the selected chain; the timeline's windows, ticks, mismatch bracket and unaligned lane; the inspector's evidence, estimate, chain, placement and comparisons; selection from every view; no request leaving the origin, no write, no page error, no serious or critical axe findings, no horizontal overflow at desktop or Pixel 7.
