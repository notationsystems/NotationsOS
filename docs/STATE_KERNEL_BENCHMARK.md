# Local state-kernel near-capacity benchmark

The existing implementation was measured before any replay optimization or limit increase. At **63 saved versions**, a fresh load launched Rust **63 times**; a successful save of version 64 launched it **192 times**. Across three samples, median elapsed time was **2.779 seconds for load** and **7.771 seconds for save**.

This is a local development measurement, not a production performance target, a service-level guarantee, or an independent verification result. The notation workspace remains separate from canonical corpus admission.

## Reproduce

From the repository root, after installing the repository dependencies:

```sh
npm run kernel:build
node scripts/benchmark-state-kernel.mjs
```

The default is three samples. `--samples 1` through `--samples 10` selects a bounded alternative; `--help` describes usage. The harness prints progress to stderr and a structured JSON report to stdout. No package configuration or production module instrumentation is required.

The harness creates a uniquely named `notations-state-benchmark-*` directory directly under the OS temporary directory. It never opens the operator's `.payload` history or uses `PAYLOAD_NOTATION_STATE_DIR`. Successful runs remove only their own validated temporary directory. Failed runs retain their isolated files and print the path for inspection; interruption also leaves the isolated directory rather than deleting partial evidence.

## Fixture and method

- 63 immutable saved-version files, four commands per version: **252 accepted lifetime commands** before the measured save.
- One notation; its first command creates it and later commands update its title. Each command carries a 1,024-byte ASCII body. There are no relations.
- The measured successful save adds three updates: **255 commands and 64 saved versions** afterward. Both states remain below the 256-command ceiling; the save reaches the existing 64-version ceiling.
- The final native replay request is **291,568 bytes**. The 63 original saved files occupy **384,264 bytes**. This approaches the version and command limits, **not** the maximum byte size or live-object limits.

Setup constructs the version records using the existing digest codec and immutable file publisher. Every saved prefix is evaluated by the **real Rust executable** before its snapshot is written. This is a deterministic valid fixture, not a mocked validator and not 63 calls to the expensive save path. Setup required 63 native invocations and took 2.779 seconds in the recorded run; setup, bundling, and copying are excluded from the operation timings.

Each sample copies those 63 genuine records into another isolated temporary directory, calls the actual repository's `read()`, then calls its actual `save()` at base version 63. The timer includes all work performed by each method. Samples do not share a mutated saved workspace. After every save, the harness checks the resulting version and revision, counts the files, and compares the byte digests of all prior versions against the originals. All three final saved digests were identical.

Native invocation counts come from a harness-only wrapper around Node's `spawn`, synchronized with the builtin ESM export. It counts calls to the fixed native binary and forwards them unchanged. Production sources, evaluator behavior, native responses, locking, and file I/O are not replaced. The harness also refuses a run if its recorded source files or native executable change during measurement.

These are elapsed wall-clock measurements using `performance.now()`, including native process startup and filesystem work. They are not cold-cache measurements: preparation and earlier samples can warm filesystem and executable caches. There was no controlled host-load isolation, CPU profiling, or attempt to separate process startup, replay, hashing, and storage costs. Three samples describe this run only; they do not establish a latency distribution.

## Recorded results

Measured on **2026-09-05 at 19:01 UTC**. Repository HEAD `9c16b1c7b72603e252e93d7ea2293d777a728bc5` was the parent/base commit, **not an unmodified checkout being benchmarked**: the stabilization working tree already included capacity metadata and capacity-behavior changes. The measured source fingerprints below identify that working implementation; its per-prefix replay algorithm was unchanged.

| Sample | Load elapsed | Load native calls | Save elapsed | Save native calls |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2,779.097 ms | 63 | 8,666.020 ms | 192 |
| 2 | 3,005.712 ms | 63 | 7,771.499 ms | 192 |
| 3 | 2,274.062 ms | 63 | 7,318.103 ms | 192 |
| Median | **2,779.097 ms** | **63** | **7,771.499 ms** | **192** |

Environment:

- Windows `10.0.26200`, x64.
- Intel Core i7-10750H at 2.60 GHz; 12 logical CPUs; 34,151,780,352 bytes reported system memory.
- Node `v24.14.0`.
- `rustc 1.96.0 (ac68faa20 2026-05-25)`; Cargo `1.96.0 (30a34c682 2026-05-25)`.
- The normal **debug** Rust binary from `native/state-kernel/target/debug`, not an optimized release build.

Measured implementation fingerprints, using SHA-256:

```text
store.ts       4c7cf09558c9136e570ab675b46755cfb13ee4efe01c0a14d7763af4a0e977c2
runtime.ts     17eae6f4d76d3851f1badfa298275871ae3dd7c65dbf9925a568db9546b93db9
types.ts       d9080f79a77a8d42bd6276a4eb7914ffbe7defda852202361dfc7d3888701ac8
native binary  3bc1a652a1f30364db1177259f429e1ef0a837679041efda0264bd5973504f9c
```

The harness's JSON also records digests of the selected persistence helpers, native source files, and Cargo lockfile. A subsequent rerun measures the current checkout, so compare these fingerprints when interpreting changed timings. Capacity metadata and capacity-behavior changes were included in this run; they did not replace or optimize the replay and save-verification sequence being measured.

## Verification retained and scaling exposed

No verification step or limit was disabled for the measurements. The successful save still performs preflight replay, obtains the local writer lock, rechecks the latest saved base, evaluates the requested commands, publishes a create-only immutable version, and reloads the complete chain for readback. Each load recomputes every saved prefix through Rust and compares its state against the stored snapshot. All 63 earlier files remained byte-identical after every measured save; no writer lock or publication temporary file remained in the resulting 64-file workspace.

For **n existing saved versions**, the current algorithm performs:

| Operation | Native invocations |
| --- | ---: |
| Load | `n` |
| Successful new save | `n + 1 + n + 1 + (n + 1) = 3n + 3` |

The two standalone evaluations are preflight and the locked application; the three loads are the initial read, locked read, and readback of the newly extended chain. An idempotent retry is a different path and was not timed here.

Invocation count grows linearly with saved versions, but each invocation replays a progressively longer prefix. With four commands per old version, a 63-version load submits **8,064 total command occurrences** across its 63 native runs. The measured save submits **24,957 command occurrences** across 192 runs. For a fixed number of commands added per version, repeated-prefix replay work grows quadratically in version count per full load; these timings alone do not identify which cost dominates.

Keep the current limits until an explicitly verified optimization or checkpoint/archive design exists. A future batched native operation could validate multiple prefixes in one process, but it must preserve every historical snapshot check, predecessor digest check, deterministic state result, concurrency check, reserved identity, and undo/redo semantic. It must not simply trust the latest snapshot. No such optimization, checkpointing, archive path, or higher capacity is implemented by this benchmark.

Byte preservation in a controlled local run is not physical WORM storage, a backup policy, a power-loss guarantee, or protection against a malicious local filesystem operator. Existing local-storage assumptions remain unchanged. See [the local notation kernel contract](LOCAL_NOTATION_STATE_KERNEL.md).
