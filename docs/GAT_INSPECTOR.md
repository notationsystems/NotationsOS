# Local GAT IFC evidence inspector

Status update (2026-09-05): references below to six absences or no live connectors describe this document's earlier milestone. One bounded, operator-only FMCSA Company Census connector is now implemented for internal qualification; see [Local source connectors](LOCAL_SOURCE_CONNECTORS.md). It establishes neither recurring ingestion nor customer live feeds. All other authority, storage, identity, execution and verification boundaries below remain unchanged.

Implemented: a preserved IFC artifact can be audited through the exact pinned GAT engine and inspected through a local API. Source bytes, the original report, a separate safe projection, and an immutable execution receipt retain distinct identities. This is a specialist instrument within Payload OS, not a new corpus authority or a customer execution service.

```text
Payload acquisition + exact evidence references
  → source-byte integrity + current INTERNAL DERIVE policy evaluation
  → pinned, bounded GAT IFC audit
  → original report artifact + safe projection artifact + execution receipt
  → historical, non-authorizing inspection
```

The closest domain mapping is Landshark's physical-building context. It does not establish zoning, legal entitlement, engineering certification, or operational capability. Caravan facilities are a possible later mapping, not additional scope implemented here. The Rust notation kernel remains responsible only for authored notation state; this API does not modify it or hide evidence links in note text.

## Exact engine and execution boundary

The authoritative integration pin is [engine-pin.json](../src/gat/engine-pin.json):

| Item | Bound value |
|---|---|
| Engine repository | `notationsystems/BIM-State-Transformer-Engine` |
| Engine commit | `80272f94107cce4f70c81e57915800b04c5944a6` |
| Git tree | `4312c807b040a472a4a670c13dde07ac10a41c24` |
| Source-tree digest | `sha256:70eaf7b239679274ec8ebe019e69ad63e5e80202692a17a402f621deb3e98672` |
| Payload adapter | `payload.gat-ifc-audit.v1` |
| Original report | `gat-ifc-audit-v1` |
| Runtime | Windows x64, Python 3.12.14, NumPy 2.3.5 |
| NumPy wheel SHA-256 | `86945f2ee6d10cdfd67bcb4069c1662dd711f7e2a4343db5cecec06b87cf31aa` |

The source pin covers the committed `gat/` files and `pyproject.toml`, with explicit UTF-8/LF source encoding. The dedicated execution checkout, virtual environment, wheel, and scratch area live under this repository's ignored `.payload/gat-runtime`. Neither the sibling BIM checkout nor a moving remote branch is used as mutable runtime input. The bootstrap does not install the GAT package or execute its build/install hooks.

An operator with the exact Python version can prepare the reviewed runtime:

```console
node scripts/gat-bootstrap.mjs "<absolute path to Python 3.12.14>"
npm run dev:production
```

The Python path is an operator bootstrap argument, never an HTTP field. The service requires `PAYLOAD_PRODUCTION_LOCAL=1` and same-origin literal loopback requests. `dev:production` starts that opt-in service. `PAYLOAD_PRODUCTION_DIR` selects the shared evidence root, default `.payload/evidence`; it does not select the engine or a per-request output path. No raw source/report download endpoint is provided.

Runtime bounds are 128 KiB of IFC, 2 MiB of process output, 30 seconds, one cross-process audit slot, and a pre-compilation maximum of 2,048 parsed STEP instances / 64 product instances. Source capture can retain a larger artifact; that does not imply this instrument can process it. Fixed arguments, isolated Python startup, fixed dependency verification, and controlled `source.ifc` scratch naming prevent the browser from selecting commands, environments, trust roots, or engine revisions. Unexpected scratch outputs and stale locks are preserved for operator review; they are not automatically deleted to force progress.

Scientific `.py` modules use a source-only loader after source/wheel verification: cached bytecode is never deserialized or executed. Regular NumPy `__pycache__/*.pyc` files from other tooling remain untouched and inert; standalone bytecode, unpinned source/native modules and unsafe loaders remain rejected. Loader regression tests include a validly timestamped poison-cache sentinel that ordinary CPython would execute, proving that this adapter instead uses the unchanged source. The engine's own source-copy pin remains strict.

## Capture and exact source selection

The [fixture origin record](../examples/gat/ORIGIN.md) identifies the unchanged upstream demonstration and the controlled missing-Width variant. These are synthetic test artifacts, not released corpus records.

One CLI capture using the existing evidence rail is:

```console
npm run evidence -- capture --request examples/gat/acquisition.json --input examples/gat/supported-demo.ifc
npm run evidence -- inspect --acquisition demo-gat-supported-001
```

The declaration grants this local demonstration `INGEST` and `DERIVE` for `GAT_IFC_INSPECTION`; these remain operator-declared permissions. The example capture time is a declaration in this CLI manifest, while storage and audit execution have backend times. The same evidence root must be configured for capture and the API. The existing local production API can also register a `LANDSHARK` / `IFCArtifact` definition and a `payload.ifc-artifact/v1` source, then acquire bounded inline bytes. Registration alone proves neither permission nor connectivity.

Select the acquisition's exact `digest`, its `capture.evidence.evidenceId`, and its `request.contentDigest` from inspection. Do not use the receipt digest or a shortened hash as a substitute. To inspect a production acquisition through the API, POST this closed read-only request to `/api/production/inspect`:

```json
{
  "schema": "payload.production-inspection-request.v1",
  "kind": "ACQUISITION",
  "reference": { "id": "<exact acquisition ID>", "digest": "<full sha256 digest from capture>" }
}
```

Its `data.id`, `data.digest`, `data.evidence.id`, and `data.evidence.contentDigest` supply the GAT request references. No source bytes need to be copied into an audit request.

### Complete browser registration → capture → inspection → audit

This opt-in helper is intended for a frontend handler on the same local Payload origin. Pass a `File` explicitly selected by the operator from `examples/gat/supported-demo.ifc` or `unsupported-missing-width.ifc`, and a stable run ID such as `demo-ifc-001`. Defining the helper does not run it. Reuse the same ID only for an identical retry; choose a new ID for a deliberate new acquisition/audit. Production stages are checked individually; a later failure does not discard their already returned references.

```javascript
async function registerCaptureAndAuditIfc(file, runId) {
  async function post(path, body) {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error.message), { result });
    return result;
  }
  const completed = [];
  async function production(suffix, fields, outputKind) {
    const result = await post('/api/production', {
      schema: 'payload.production-command.v1', requestId: `${runId}:${suffix}`, ...fields,
    });
    completed.push(result); // Retain stage results even if the next stage fails.
    if (result.run.state !== 'COMPLETED') {
      throw Object.assign(new Error(result.run.failure?.code ?? 'PRODUCTION_STAGE_FAILED'), { completed });
    }
    const output = result.run.outputs.find((item) => item.kind === outputKind);
    if (!output) throw Object.assign(new Error('EXPECTED_OUTPUT_ABSENT'), { completed });
    return { id: output.id, digest: output.digest };
  }
  const purpose = 'GAT_IFC_INSPECTION';
  const coverage = { geography: 'SYNTHETIC_IFC_DEMONSTRATION', temporal: 'MANUAL_LOCAL_CAPTURE' };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length || bytes.length > 128 * 1024) throw new Error('LOCAL_GAT_INPUT_BOUND');
    const corpus = await production('corpus', {
      kind: 'REGISTER_CORPUS', definition: {
        schema: 'payload.production-corpus-definition.v1', id: 'demo-landshark-ifc-definition', version: '1.0.0',
        domain: 'LANDSHARK', recordType: 'IFCArtifact', requiredSubjects: ['Preserved IFC artifact'],
        requiredFields: ['Source bytes', 'Exact evidence identity'], coverage,
        freshness: 'Manual synthetic fixture; no live freshness claim',
        evidenceClasses: ['SYNTHETIC_DEMONSTRATION'], intendedUses: [purpose],
      },
    }, 'CORPUS');
    const source = await production('source', {
      kind: 'REGISTER_SOURCE', source: {
        schema: 'payload.production-source-config.v1', id: 'demo-landshark-ifc-source', version: '1.0.0', corpus,
        provider: 'Notation Systems pinned synthetic GAT demonstration', method: 'LOCAL_INLINE_BYTES',
        adapter: { id: 'payload.ifc-artifact/v1', version: '1.0.0' }, supportedCoverage: coverage,
        policy: {
          registrationId: 'demo-landshark-ifc-policy', sourceId: 'notation://source/local/gat-ifc-demo',
          displayName: 'Synthetic IFC demonstration', sourceClass: 'SYNTHETIC_DEMONSTRATION',
          licenseId: 'gat-demo-mit-see-examples-gat-origin', policyVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z', permittedPurposes: [purpose],
          allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' },
        },
      },
    }, 'SOURCE');
    const contentBase64 = btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join(''));
    const acquired = await production('capture', { kind: 'ACQUIRE', source, purpose, contentBase64 }, 'ACQUISITION');
    const inspected = await post('/api/production/inspect', {
      schema: 'payload.production-inspection-request.v1', kind: 'ACQUISITION', reference: acquired,
    });
    const audit = await post('/api/gat/audits', {
      schema: 'payload.gat-audit-request.v1', requestId: `${runId}:audit`,
      operation: 'IFC_AUDIT', adapterVersion: 'payload.gat-ifc-audit.v1', purpose,
      source: {
        acquisition: acquired,
        evidence: { id: inspected.data.evidence.id, contentDigest: inspected.data.evidence.contentDigest },
      },
    });
    return { completed, acquired, inspected, audit };
  } catch (error) {
    error.completed = completed;
    throw error;
  }
}
```

Neither the browser's size check nor a completed registration authorizes the computation. The backend independently validates bytes, reference equality, source configuration, applicable policy, runtime pin, limits, and report structure. IFC acquisition ends with preserved evidence; it is not passed through the Carrier normalizer or silently assembled into an admitted/released Landshark corpus.

## Frontend contract

POST `/api/gat/audits` accepts only:

```json
{
  "schema": "payload.gat-audit-request.v1",
  "requestId": "demo-gat-audit-001",
  "operation": "IFC_AUDIT",
  "adapterVersion": "payload.gat-ifc-audit.v1",
  "purpose": "GAT_IFC_INSPECTION",
  "source": {
    "acquisition": { "id": "<exact acquisition ID>", "digest": "<full sha256 acquisition digest>" },
    "evidence": { "id": "<exact evidence ID>", "contentDigest": "<full sha256 source-byte digest>" }
  }
}
```

The request is bounded to 8 KiB. IDs are 1–128 characters from letters, digits, `.`, `_`, `:`, `-`, beginning with a letter or digit. Purpose is bounded declared text without paths or control characters. Unknown fields, caller clocks, source replacements, arbitrary operations, and path/executable options are rejected. Accepted media declarations are `model/ifc`, `application/step`, and `application/x-step`.

For Claude's frontend, after a successful production acquisition inspection:

```javascript
async function auditInspectedAcquisition(acquisitionInspection, requestId) {
  const acquisition = acquisitionInspection.data;
  const response = await fetch('/api/gat/audits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema: 'payload.gat-audit-request.v1', requestId,
      operation: 'IFC_AUDIT', adapterVersion: 'payload.gat-ifc-audit.v1',
      purpose: 'GAT_IFC_INSPECTION',
      source: {
        acquisition: { id: acquisition.id, digest: acquisition.digest },
        evidence: { id: acquisition.evidence.id, contentDigest: acquisition.evidence.contentDigest },
      },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result; // {status: 'CREATED'|'EXISTING', inspection}
}
```

HTTP 201 means a new execution receipt was confirmed, not that the audit passed. HTTP 200 on POST means an identical historical retry. Inspect `inspection.outcome` and the separate `inspection.stages`. GET `/api/gat/audits/{requestId}` returns a historical `payload.gat-inspection.v1` response without running Python. Query options are rejected. Responses are `no-store`, local development, and explicitly non-admitted.

The inspection carries exact source, engine, runtime, report, projection and receipt references; backend start/completion times; the original-time declared DERIVE decision; separate evidence/permission/execution/report/lowering/compilation/verification states; and fixed retry/remediation fields. It never includes original report bytes, source bytes, host paths, raw stderr, or free-form engine exceptions.

The projection is `payload.gat-audit-projection.v1`, separate from the unchanged original report. GAT status vocabulary is preserved: `PASS`, `WARN`, `BLOCKED`, `NOT_RUN`; product states remain `READY`, `NEEDS_GEOMETRY_DERIVATION`, `MISSING_SOURCE_DATA`, `BLOCKED`. The original report's IFC `schema` is exposed as `ifc_schema` because the projection's `schema` identifies its own version. Count maps become explicit name/count entries where names require sanitization. Unsafe tokens are visibly `[REDACTED]`; entity names/GlobalIds and uncontrolled diagnostic text are omitted. Quantities remain required/available/missing names, not invented measurements. `canonical_class` retains GAT's internal classification meaning, not Payload canonical identity.

## Outcomes, retries, and retained state

| Outcome | Meaning |
|---|---|
| `SUPPORTED_SCOPE_AUDIT` | GAT completed its supported product scope; `pipeline_ready=true`. No admission or action authorization. |
| `AUDIT_BLOCKED` | A valid retained report explains incompatibilities; parsing or later pipeline stages may be blocked. This is not a process crash. |
| `SOURCE_UNAVAILABLE`, `SOURCE_REFERENCE_MISMATCH`, `SOURCE_INTEGRITY_FAILED` | Missing, incorrectly selected, or damaged preserved input; execution did not establish an audit. |
| `SOURCE_MEDIA_UNSUPPORTED`, `SOURCE_TIME_MISMATCH` | Input declaration or chronology is incompatible with this instrument. |
| `PROCESSING_DISALLOWED` | Current-time INTERNAL DERIVE was denied or requires approval. INGEST never substitutes for DERIVE. |
| `ENGINE_UNAVAILABLE`, `ENGINE_INTEGRITY_FAILED`, `ENGINE_BUSY` | The fixed runtime cannot be used; no successful audit is claimed. |
| `EXECUTION_TIMEOUT`, `EXECUTION_FAILED`, `INVALID_REPORT`, `INPUT_TOO_LARGE` | Bounded execution or report validation failed; no valid report is delivered. |

Every valid request identity is reserved before execution. A completed failure also receives a receipt, with explicit retained-output flags and remediation inputs. Identical retries return the original receipt and timestamps without executing again or reevaluating a new permission grant. A distinct `requestId` is required for a deliberate new execution, including after an engine-busy or denied result. Changing the input bound to an existing identity returns `GAT_REQUEST_CONFLICT`.

Storage is create-only: `gat-audits/requests`, `gat-audits/receipts`, and content-addressed `gat-audits/artifacts` under the shared evidence root. Published report bytes are read back before completion is returned. Metadata digests use the existing local JSON codec, not the Bench's signed canonical artifact grammar. These are local byte-integrity and replay bindings, not authenticated origin, independent verification, physical WORM, or proof of source truth.

If an execution is reserved but has no confirmed receipt, GET/POST reports `GAT_EXECUTION_INCOMPLETE`; it does not silently rerun a potentially completed process. Partial artifacts remain untouched. After a publication/readback failure, `GAT_SAVE_UNCONFIRMED` discovers each attempted report/projection by its known digest: a successful readback returns the exact retained reference; otherwise retention is `UNCONFIRMED`, not asserted absent. `expectedOutputs` identifies the attempted references even when retention cannot be verified; a null entry means publication was not attempted. Corrupt receipts, source bytes, reports, or projections fail inspection without repair. Invalid/oversized engine output is not retained as a valid report; the failure receipt makes this absence explicit. No automatic restart, garbage collection, lock removal, history pruning, or scheduler is implemented.

Historical inspection recomputes stored metadata, exact source bytes, original-time source/media/chronology/DERIVE gates, report validation, and the safe projection. It does not rerun GAT, establish a current RETRIEVE/redistribution right, check subsequent external revocation, or grant a new access permission. Rehashed receipts cannot relabel a permission or media failure as an engine failure or successful audit. If retained source state changes so that an originally failed source gate no longer recomputes, inspection refuses the record rather than converting it to success; the receipt remains preserved and a deliberate new audit needs a new request ID.

## Verified scope and remaining gate

The real integration tests capture both IFC fixtures through `LocalEvidenceIntake`, evaluate DERIVE, invoke the pinned runtime, retain original reports and safe projections, and then inspect/retry without further engine calls. The supported fixture yields ten `READY` products and passing lowering/compilation/verification. The controlled variant preserves one missing `Width`, blocked lowering, and downstream `NOT_RUN` states. Source bytes remain unchanged.

```powershell
$env:GAT_INTEGRATION='1'
npm run test -- src/gat/service.test.ts src/gat/runtime.test.ts --fileParallelism=false
```

Serial files are required because the runtime deliberately has one cross-process slot. Ordinary unit tests cover exact-reference rejection, policy denial, corrupt retained state, unknown fields, structured engine failures, concurrent retry reservation, partial storage failure, safe projection, and route access controls; they do not substitute for the opt-in real executions.

Grounding inspected at the engine pin: `gat/ifc_audit.py`, its audit tests, the headless interface/tests, and `docs/real-ifc-validation-v1.md`, `docs/workflow-deployment-v1.md`, `docs/incremental-propagation-v1.md`. GAT `ACCEPT` elsewhere means eligibility for a separate authorization step; this IFC-audit integration neither invokes acceptance nor translates it into Payload `ADMITTED`.

Deferred: evidence links in authored notations, independently governed admission, change-impact and calibrated observation planning, rendering/Bevy, IFC authoring, full-building simulation, live collection, public authentication/authorization, and customer execution. The firm-wide six absences remain: live source connectors, production storage and identity, deployed customer delivery, managed customer workloads, independent verification, and a completed pilot. This local instrument does not remove those boundaries.
