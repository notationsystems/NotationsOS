# Spatial Inquiry v1

This module answers: **How does opening or closing one explicit passage change access through one floor?** It uses a manually annotated synthetic example, not independently measured geometry. It runs outside the Rust notation kernel.

## Reproduce the example

From the repository root, after installing dependencies:

```sh
npx esbuild scripts/spatial-demo.ts --bundle --platform=node --format=esm --outfile=.stamp/spatial-demo.mjs
node .stamp/spatial-demo.mjs
```

The utility preserves the exact plan SVG and layout JSON through `LocalEvidenceIntake`, then saves baseline and closed-bridge executions. Evidence defaults to `.payload/spatial-demo`; inspectable JSON and SVG copies go to `.payload/spatial-demo-artifacts`. Two optional CLI arguments choose these local directories. Running again inspects the same executions without graph recomputation.

The checked-in `examples/spatial` files are copies of this reproducible example. The SVG is a schematic source artifact, not a scale drawing. Layout coordinates declare synthetic metres, X right/Y up. Geometry is never used to create edges. Source digests identify exact bytes; layout digests identify validated, record-order-normalized layouts. Moving geometry changes layout identity while preserving graph measures.

## Expected result

| Space | Baseline confirmed depth | Baseline possible depth | P-07 closed depth |
|---|---:|---:|---:|
| Entrance / S-1 | 0 | 0 | 0 |
| Hall / S-2 | 1 | 1 | 1 |
| Studio / S-3 | 2 | 2 | unreachable |
| Office / S-4 | 3 | 3 | unreachable |
| Store / S-5 | unknown | 4 | unreachable |

P-09 remains an explicitly unknown passage even when its entire wing is disconnected. Baseline mean confirmed depth is 2 across three reachable non-root spaces; possible-graph mean is 2.5 across four. After closure both means are 1 across one. A smaller mean here does **not** mean improved access: its denominator shrank. These are conditional summaries, not uncertainty bounds, footfall estimates or Space Syntax integration.

## Consumer/API contract for Claude

All routes require `PAYLOAD_PRODUCTION_LOCAL=1`, loopback and the existing same-origin checks. Storage comes only from backend `PAYLOAD_PRODUCTION_DIR` (default `.payload/evidence`). Set it to the demonstration evidence directory to inspect the fixture over HTTP. Reads are historical integrity inspections; they do not grant current source rights. New computations check DERIVE/INTERNAL policy for the exact layout and every referenced source.

- `POST /api/spatial/analyses`: `AnalysisRequest` from `src/spatial/contracts.ts`. Submit an exact retained layout acquisition/evidence reference, purpose, root space id, unique request id and either `scenario: null` or a one-passage delta bound to the layout digest. See `examples/spatial/baseline.json` and `scenario.json`. Returns 201 CREATED or 200 EXISTING with receipt and projection.
- `GET /api/spatial/analyses/{requestId}`: inspect saved receipt/result bindings and retained source bytes; never recomputes graph analysis. Unknown identity returns 404; an interrupted reserved identity returns 409 and cannot silently rerun.
- `POST /api/spatial/compare`: `{ "baselineRequestId": "spatial-demo-baseline", "scenarioRequestId": "spatial-demo-closed-bridge" }`. Requires identical exact source, layout, method and root. Returns changed spaces with baseline/scenario reachability and depths.

The distinct `payload.spatial-analysis-projection.v1` has `sourceKind: LOCAL_ANALYSIS`, receipt/result digests, preserved layout and saved result. It does not extend or impersonate the corpus-release projection. Render all labels/provenance as plain text, never HTML. Render polygons from validated coordinates, flipping Y for SVG. Do not embed arbitrary source SVG from retained evidence into the UI.

The linked plan/graph UI can key everything by space id. `confirmed.spaces` and `possible.spaces` contain depths and incoming/outgoing **distinct neighbor** counts (parallel passages do not double-count neighbors). Reachability statuses are CONFIRMED, POSSIBLE_ONLY and DISCONNECTED. Unknown edges are included only in the possible graph. BOTH passages add two directed arcs; FROM_TO adds one. A closed passage or unsatisfied condition blocks traversal. Unknown state/condition yields an unresolved passage. An assumed OPEN never bypasses its conditions.

Entrance changes require a new analysis request id; baseline/scenario switches can use retained results. Show changed depth and reachability using the comparison artifact. Provide a table of the same space ids, labels, both depths and statuses, plus keyboard-operable selection. The inspector should show source references, passage declarations/conditions, scenario provenance, method, denominator and unresolved passage ids. Claude owns this polished interaction; this increment supplies its reproducible backend and artifacts.

## Boundaries and integrity

V1 allows at most 256 spaces, 1024 explicit passages, 16 conditions per passage, 16 source artifacts and 64 vertices per polygon. It requires one declared frame with no parent frame; nested transforms, IFC extraction, geometry validation, behavioral prediction and compliance checks are deferred. Layout-wide annotation provenance applies to spaces; each passage has explicit provenance. Baseline facts are never overwritten by scenario assumptions.

Receipts contain the original result, policy decisions, request, method/version, execution start, reservation digest and independent result/receipt digests. Immutable create-only files preserve execution identity. Projection is assembled from validated retained layout and result, with no graph recomputation. Local digests detect corruption and bind content; they are not authenticated signatures, independent truth verification or physical WORM storage. A reserved execution interrupted before receipt publication remains inspectably incomplete and needs a new id for deliberate execution.

Tests cover directed/conditional access, exact small-graph measures, bridge closure, unknown retention, ordering invariance, drawing independence, baseline immutability, persisted identity, idempotent inspection, failure replay and local HTTP access gates.
