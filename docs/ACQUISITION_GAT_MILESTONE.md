# Acquisition and IFC integration milestone

## Repository baseline and dependencies

Implementation began from clean NotationsOS commit `f68eb460001994891c2e0ade26cd0bd68fd78735` on `codex/payload-os-foundation`, not the older `9c16b1c` reference in the brief. All adapters, contracts, tests, fixtures and documentation are in NotationsOS.

The sibling Notations Kernel was rechecked read-only at `c6d693613478f32e0b0d7dafe918d8e51274ffcc`, branch `codex/payloados-0.7-baseline`: 53 modified tracked files and 74 untracked files before and after. No sibling files, branches, commits or uncommitted implementation were imported or changed. The prior [cross-repository assessment](CROSS_REPOSITORY_BASELINE.md) and test-only vendor pin remain unchanged.

The BIM source repository was not modified. The only execution checkout was an isolated NotationsOS-owned copy under ignored `.payload/gat-runtime/engine`, detached at `80272f94107cce4f70c81e57915800b04c5944a6`. Its full Git status remained clean after real executions. No engine install/build hooks were run; bootstrap uses verified source and a hash-pinned NumPy wheel in a dedicated environment.

| Dependency | Exact version or pin |
|---|---|
| GAT engine | `80272f94107cce4f70c81e57915800b04c5944a6` |
| Python / NumPy | 3.12.14 / 2.3.5, Windows x64 only |
| GAT adapter | `payload.gat-ifc-audit.v1` |
| Next / React | 16.2.6 / 19.2.4 |
| TypeScript / esbuild | 5.9.3 / 0.21.5 |
| Vitest / Playwright | 2.1.9 / 1.62.1 |
| Test host Node | v24.14.0 |
| Test host Rust / Cargo | 1.96.0 / 1.96.0 |

JavaScript versions come from the existing unchanged package lock; the Rust lock is unchanged. Full engine source/wheel hashes and fixture origins: [GAT inspector](GAT_INSPECTOR.md), [engine pin](../src/gat/engine-pin.json), [fixture origin](../examples/gat/ORIGIN.md).

## Responsibility mapping

| Component | Implemented authority |
|---|---|
| Existing evidence rail + new production adapter | Register local configuration, evaluate declared INGEST/DERIVE, preserve/reinspect exact evidence, run the fixed Carrier transformation |
| Existing candidate store | Explicit unadmitted membership organization and historical inspection; no release |
| GAT adapter | Bounded IFC audit, original report artifact, source/method/runtime-bound execution receipt |
| Frontend APIs | Safe operational results, exact references, stages, failures and historical projections |
| Rust notation kernel | Unchanged authored notation state; no hidden body-text evidence references |

## Executed acceptance paths

The actual built Next server was exercised over loopback HTTP, using a fresh temporary evidence root:

1. Register the synthetic Caravan corpus/source, capture bytes, retry without duplicate execution, inspect byte/receipt integrity, normalize an unresolved/unadmitted candidate, then assemble and inspect its selected-member build.
2. Capture malformed Carrier JSON, retain the evidence and explicit quarantine, preserve the earlier valid artifact, and reject cross-origin control requests.
3. Register a Landshark IFC-artifact source, capture the exact supported and controlled missing-Width specimens, check DERIVE, execute pinned GAT, save original reports and separate projections, then inspect/retry both without rerunning analysis.

The supported specimen returned ten `READY` products with passing lowering, compilation and verification. The controlled variant returned one missing required `Width`, blocked lowering, and downstream `NOT_RUN`. Both retained source digests unchanged. GAT's audit vocabulary was preserved; neither result implied Payload admission or engineering/physical-action authorization.

Unit and process checks additionally exercise digest mismatch before execution, current policy refusal, timeout/crash/invalid-report outcomes, tampered history, closed request schemas, concurrent request identities, finite catalog admission and partial-publication recovery. The build trace guard checks notation, production and GAT routes for accidental inclusion of local state, runtime installations or scratch files.

The six existing local evidence files and coordination history were hash-checked unchanged after tests. No authored notation history was created; no released fixture, canonical state, or sibling worktree was modified.

A final validation pass detected newly present NumPy cached bytecode and correctly refused the runtime rather than reporting audit success. Its creator was not established. The adapter now explicitly loads verified scientific source without consuming caches; five loader regressions cover valid poison-cache headers, malformed caches, sourceless bytecode refusal, cache-namespace refusal and no cache creation. All 91 existing cache files were preserved byte-for-byte, not deleted or trusted.

Reproduce with `npm run check`, then `GAT_INTEGRATION=1` and serial GAT tests plus `npm run e2e:production`. See the component docs for PowerShell commands and the explicit bootstrap prerequisite. Ordinary default tests skip real GAT execution; this milestone also executed those opt-in checks.

Final executed results on 2026-09-05:

| Check | Result |
|---|---|
| `npm run check` | 29 Rust tests; TypeScript and ESLint; 1,147 JS/TS tests passed, six optional GAT checks skipped here |
| `GAT_INTEGRATION=1`, serial runtime/service/GAT-route tests | 72 checks passed, including real engine execution and an invocation of five passing Python source-loader regressions |
| `GAT_INTEGRATION=1 npm run e2e:production` | Next build and deployment-trace guard passed; both real HTTP acceptance tests passed |
| Git diff whitespace check | Passed |

The focused counts overlap the full suite; they are separate execution results, not additive coverage claims.

## Frontend handoff and next gate

Claude's required contracts and end-to-end request sequences are in [Local production workflow](LOCAL_PRODUCTION_WORKFLOW.md) and [GAT inspector](GAT_INSPECTOR.md). Render backend stages/outcomes and exact retained references; HTTP success means a receipt was confirmed, not that a transformation or audit passed. No new browser workbench was built in this backend milestone.

Still absent: live collection, production storage/identity, customer delivery, managed customer workloads, independent verification and a completed pilot. GAT runtime portability beyond the reviewed Windows x64 pin is also absent. Production exposure requires authentication/authorization and reviewed storage/execution isolation; live collection requires an exact authorized source and scope. Authored evidence links, corpus admission, change-impact/evidence planning and Bevy remain separate future gates.
