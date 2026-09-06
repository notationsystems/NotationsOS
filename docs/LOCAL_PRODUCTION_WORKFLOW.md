# Local acquisition-to-candidate workflow

Claude's frontend can now operate the existing local evidence rail: corpus/source registration → bounded acquisition → evidence inspection → fixed Carrier normalization → candidate-build assembly and inspection. These are real local artifacts and receipts, not fixture responses. They do not change released fixtures, authored notation state, resolved identity, canonical corpus state or admission.

## Start and boundaries

```console
npm run dev:production
```

The launcher bundles the fixed Node worker, enables `PAYLOAD_PRODUCTION_LOCAL=1`, and binds Next to `127.0.0.1` (operator `PORT`, default 3000). Use that same browser origin. Operational reads and writes require the flag and literal loopback/same-origin checks. This is a local-development boundary, **not authentication or tenant isolation**. Never enable it on an unauthenticated public deployment or behind a public proxy.

Operator-only `PAYLOAD_PRODUCTION_DIR` defaults to `.payload/evidence`. Existing evidence, normalization and candidate stores are reused. Registrations, request intents and run receipts occupy `production-v1`; GAT receipts/report artifacts occupy `gat-audits`. The GAT installation is separately fixed under `.payload/gat-runtime`. HTTP callers cannot select paths, executables, engine revisions, clocks, normalized replacement state or authoritative completion flags. This launcher does not enable notation/coordination writes.

The specialized [GAT IFC inspector](GAT_INSPECTOR.md) is a separate bounded instrument, not a Carrier normalizer or building-corpus admission path.

## Frontend contract

The frontend that operates this contract is `/production`, the [production path](PRODUCTION_PATH.md): it sends the commands below from a loopback origin, renders every receipt as returned, and derives the path's states from them.

Authoritative types and closed validators: [`contracts.ts`](../src/production/contracts.ts). Commands use `payload.production-command.v1`, **`kind`** as discriminator, and a stable caller-selected `requestId`. References are exact `{id, digest}` values returned by the backend.

| Route | Meaning |
|---|---|
| `GET /api/production` | Disabled descriptor without local reads by default; enabled/guarded `payload.production-catalog.v1` with bounded registrations and run summaries |
| `GET /api/production/source-inventory` | Guarded, pinned prototype source inventory; not live source status, registration, selection, or permission |
| `POST /api/production` | One closed command; returns `{status, historicalRetry, run}` |
| `POST /api/production/inspect` | Read-only `payload.production-inspection-request.v1` → `payload.production-inspection.v1` |
| `POST /api/gat/audits` | Explicit IFC audit against preserved source references |
| `GET /api/gat/audits/{requestId}` | Historical GAT inspection; no Python execution |

| `kind` | Additional command fields |
|---|---|
| `REGISTER_CORPUS` | `definition`: versioned corpus declaration |
| `REGISTER_SOURCE` | `source`: versioned configuration with exact `corpus` reference |
| `ACQUIRE` | exact `source` reference; `purpose`; canonical `contentBase64` |
| `NORMALIZE` | exact `source` and `acquisition` references; `purpose` |
| `BUILD_CANDIDATES` | exact `corpus`; `members`: 1–64 exact normalization references; `purpose` |

Definitions record required subjects/fields, geographic/temporal coverage, freshness, evidence classes and intended uses. Supported pairs: `CARAVAN`/`Carrier`, capture-only `LANDSHARK`/`IFCArtifact`. Sources declare provider, `LOCAL_INLINE_BYTES`, fixed adapter/version, exact corpus binding, matching declared coverage and existing operator-declared policy. Adapters are `caravan.carrier-json/v1` or `payload.ifc-artifact/v1`, both version `1.0.0`.

Registration validates compatible configuration, not connectivity, independent authorization, source truth or successful collection. General requirements/coverage/freshness evaluation is absent: `definitionRequirementsVerified`, `coverageVerified`, `freshnessVerified`, `completenessClaimed` stay false. Parser missingness is not proof that all declared requirements were met.

### Complete Caravan example

[`demo.ts`](../src/production/demo.ts) provides the deterministic definition, source constructor and Node-side base64 encoding of existing [`examples/carrier/source.json`](../examples/carrier/source.json). These are inputs, not precomputed successful receipts; backend times/digests come from execution. In a same-origin frontend, wire the selected definition, source constructor, purpose and byte content into:

```javascript
async function command(requestId, fields) {
  const response = await fetch('/api/production', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema: 'payload.production-command.v1', requestId, ...fields }),
  });
  const result = await response.json();
  if (!response.ok) throw result; // retain structured recovery details
  return result; // HTTP 200 is not a claim that run.state is COMPLETED
}
function ref(result, kind) {
  const item = result.run.outputs.find(output => output.kind === kind);
  if (!item) throw new Error('Output absent; inspect run stages.');
  return { id: item.id, digest: item.digest }; // flattened {kind,id,digest}
}
async function inspect(kind, reference) {
  const response = await fetch('/api/production/inspect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema: 'payload.production-inspection-request.v1', kind, reference }),
  });
  const result = await response.json();
  if (!response.ok) throw result;
  return result;
}
const corpus = ref(await command('demo-corpus', { kind: 'REGISTER_CORPUS', definition }), 'CORPUS');
const source = ref(await command('demo-source', { kind: 'REGISTER_SOURCE', source: makeSource(corpus) }), 'SOURCE');
const captureRequest = { kind: 'ACQUIRE', source, purpose, contentBase64: localBytesBase64 };
const captured = await command('demo-capture', captureRequest);
const acquisition = ref(captured, 'ACQUISITION');
await command('demo-capture', captureRequest); // historical retry, no new capture
await inspect('ACQUISITION', acquisition);
const normalized = await command('demo-normalize', { kind: 'NORMALIZE', source, acquisition, purpose });
// Render failures/quarantine before offering assembly.
if (normalized.run.state === 'COMPLETED') {
  const members = [ref(normalized, 'NORMALIZATION')];
  const built = await command('demo-build', { kind: 'BUILD_CANDIDATES', corpus, members, purpose });
  if (built.run.state === 'COMPLETED') await inspect('CANDIDATE_BUILD', ref(built, 'CANDIDATE_BUILD'));
}
```

IDs are 1–120 characters (`[A-Za-z0-9][A-Za-z0-9:_.-]*`); digests are full lowercase `sha256:` plus 64 hexadecimal characters. Member sets are sorted by ID; duplicates are rejected. Exact definition/source/version/adapter/purpose/evidence/member bindings are checked through existing dependencies. Knowledge cutoff is the backend build start, never a browser-selected backdate.

Inspection kinds: `CORPUS`, `SOURCE`, `ACQUISITION`, `NORMALIZATION`, `CANDIDATE_BUILD`, `RUN`, and recovery-only `CONTENT`. Inspect a run with `{id: run.id, digest: run.digest}`. `CONTENT` uses `{id: contentDigest, digest: contentDigest}` and **claims no acquisition, source binding or receipt**. Inspection rechecks local integrity, omits raw bytes/storage paths and grants no current retrieval/distribution/training right.

## Stage outcomes and recovery

Render `run.stages` directly. Capture, extraction, normalization, candidate assembly and inspection have separate outcomes. Capture leaves parsing unperformed. Quarantine has no candidate. Assembly leaves the build `UNADMITTED`; no release activates. Preserve `NOT_RUN` instead of inferring completion.

| Example | Result |
|---|---|
| Valid Carrier | `COMPLETED` normalization; `UNRESOLVED`, `UNADMITTED` candidate |
| Captured malformed JSON | Capture succeeds; normalization `QUARANTINED`, `INVALID_SOURCE_JSON`; evidence/quarantine retained |
| Assemble quarantine | `FAILED`, `MEMBER_NOT_ELIGIBLE`; prior evidence intact |
| INGEST prohibited | `FAILED`, `INGEST_DISALLOWED`; no new source artifact/acquisition receipt |
| DERIVE prohibited now | `FAILED`, `DERIVATION_DISALLOWED`; previous outputs preserved |
| Same ID, changed command | Conflict; no original intent/receipt replacement |
| Paths/clocks/completion injection | Structured refusal before execution |

Failures distinguish `artifactRetained`, source/transformation `receiptRetained`, and separate `runReceiptRetained`. `UNCONFIRMED` is not affirmative retention. `run.outputs` and stage outputs provide exact inspectable references; remediation identifies required review/inputs. Bytes retained before capture-receipt failure can appear as explicitly unbound `CONTENT`.

If normalization/build publication succeeds before a later failure, the run remains `FAILED` but exposes the verified additional output reference. If that output cannot be inspected, optional `failure.additionalOutputRetention: UNCONFIRMED` distinguishes it from already verified upstream artifacts. An identical retry never reruns the transformation to conceal a failed publication.

[Failed-run integrity](FAILED_RUN_INTEGRITY.md) additionally validates exact request-bound output references and operation-specific completed-stage prefixes, even when a saved receipt has been rehashed. It preserves genuine partial-write/early-lookup failures and performs no automatic repair or reexecution.

After build inspection, `POST /api/production/compare` compares two exact historical candidate builds through the same bounded local worker. See [the frontend comparison contract](LOCAL_CANDIDATE_COMPARISON.md#local-frontend-comparison). This is a read-only reference comparison, not a production command, field-level change claim, saved run, or released change feed.

Identical completed requests return `EXISTING`, `historicalRetry: true`, original receipt/times after dependency reinspection, without fresh execution or permission grant. Corrected inputs or intentional re-execution require a new ID and current-time policy check. Policy remains an immutable operator declaration; there is no external permission-revocation service.

Incomplete intents are not silently rerun/backdated. The catalog exposes `INCOMPLETE_OR_RUNNING`; identical POST returns recovery information. After timeout or uncertain storage, retry the same identity to discover retained state, inspect outputs, then use a new ID only for an intentional new attempt. Never automatically delete history or stale locks. Corrupt dependencies block inspection rather than being repaired.

Transport refusals use `payload.production-error.v1` with `error.code`, fixed safe `error.message`, optional reference/remediation `error.details`. Confirmed stage failures instead return HTTP 200 with `run.state: FAILED` or `QUARANTINED`. Handle both envelopes. Errors never include host paths, credentials or uncontrolled exceptions/stderr.

## Bounds, verification and remaining gate

Limits: 2 MiB JSON, 1 MiB decoded capture, 10-second body deadline, 64 members, 4 KiB inspection request, 512 KiB metadata. Carrier parsing additionally caps input at 64 KiB. Catalog limits are 64 corpora, 64 sources and 128 intents/runs, with no automatic archive. A cross-process reservation lock serializes capacity admission; stale locks require operator review.

The adapter starts only `.stamp/production-worker.mjs` through the current Node executable, without a shell: two workers per server process, 15 seconds each, combined 2 MiB stdout/stderr cap. Killed workers keep their slot until closure. Local histories, runtime installations and scratch are excluded from deployment traces; the build is not a provisioned portable execution service.

[`connector.ts`](../src/production/connector.ts) declares future scope, transport, pagination, resource limits, retries/cursors, credential reference and extraction version. It activates **no connector**. No URL is fetched, scheduler/fleet created or customer workload accepted. Field-level comparison, independent rights verification, canonical identity/admission, release activation and public delivery remain absent.

[Source integration inventory](SOURCE_INTEGRATION_INVENTORY.md) establishes the 21 named entries in the existing Payload Terminal registry as integration inputs. Seven external adapter declarations, one curated assembly and thirteen entries without adapters remain distinct; none is represented as a connected Payload OS source. The first live connector still requires exact source and collection-scope selection.

```console
npm run check
npm run e2e:production
```

`check` runs Rust, TypeScript, lint and default tests. Store/route tests use real local stores and subprocesses, including quarantine, denied policy, retries, corrupted dependencies, concurrent capacity and failure preservation. `e2e:production` starts built Next on port 3113 with fresh temporary evidence history, never operator data; no browser binary is needed.

After exact GAT bootstrap, set `GAT_INTEGRATION=1` before `e2e:production` to execute both real IFC cases through HTTP. Default GAT unit tests use controlled doubles; real engine tests are opt-in/serial. Existing package/Rust locks are unchanged; GAT pins and fixture origins are in [GAT inspector](GAT_INSPECTOR.md). No sibling Notations Kernel package is imported at runtime.
