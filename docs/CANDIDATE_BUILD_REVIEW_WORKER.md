# Local candidate-build review worker

Payload OS now connects the stable and message board to read-only inspection of an existing local Caravan candidate build. A manually started deterministic worker consumes one exact build reference, recomputes its stored dependencies and reports a bounded observation before acknowledging the request. It does not create a build, admit records, activate a release or execute a model.

```text
Directed board request: build id + expected full build digest
→ manually running worker inspects its operator-selected local store
→ compare the recomputed build with the requested digest
→ post and read back a bounded RESULT
→ acknowledge the input request
```

This uses the existing [coordination sandbox](AGENT_COORDINATION.md) and [local candidate-build inspector](LOCAL_CANDIDATE_BUILDS.md). It changes only local coordination records, not the evidence store or committed corpus fixtures. A board post does not launch the worker.

## Run and send an exact request

First create and inspect a local candidate build as described in [Local candidate builds](LOCAL_CANDIDATE_BUILDS.md). For the documented example id:

```sh
npm run evidence -- inspect-candidate-build --build demo-caravan-carrier-build-001
```

Copy `build.buildId` and the complete `build.digest` from that output. The expected digest must be the full build digest, including its `sha256:` prefix and 64 lowercase hexadecimal characters, **not** `recordsRoot`, `requestDigest` or a normalization digest.

In terminal one, run the local board:

```sh
npm run dev:coordination
```

In terminal two, register the worker and run an initial pass:

```sh
npm run agent:candidate-build-review -- --once
```

Startup registers `agent.candidate-build-review.v1` in the server's scope as a local JavaScript verification worker with declared Caravan input `payload.local-candidate-build.v1` and output `payload.candidate-build-review.v1`. It does not change the committed seed. Registration and a declared verification role are not proof of authenticated identity or independent verification.

From a Node interpreter started in the repository root, post a request with the existing dependency-free client. Replace both reference values with those you inspected:

```javascript
const { CoordinationClient } = await import('./clients/javascript/coordination.mjs');
const client = new CoordinationClient('http://127.0.0.1:3000');
const buildId = 'demo-caravan-carrier-build-001';
const expectedDigest = 'REPLACE_WITH_FULL_BUILD_DIGEST';
await client.post({
  requestId: 'example-candidate-build-review-001',
  authorId: 'apparatus.coordination',
  recipientId: 'agent.candidate-build-review.v1',
  kind: 'REQUEST',
  topic: 'candidate-build-review',
  title: 'Inspect the local Carrier candidate build',
  body: JSON.stringify({ buildId, expectedDigest }),
  context: null,
  replyTo: null,
});
```

The digest placeholder is deliberately not accepted. `apparatus.coordination` is an existing simulated participant that declares Caravan. Use a new `requestId` for a new observation; retain the same id and payload only for a retry.

Exit the interpreter and run the worker once again:

```sh
npm run agent:candidate-build-review -- --once
```

Inspect the `RESULT` reply and input acknowledgement on `/board`. A plain `npm run agent:candidate-build-review` also runs once. `--watch` repeats passes with a two-second wait until stopped. Each pass starts its pending inbox scan at zero and handles at most ten supported requests by default, printing `processed`, `recovered`, `skipped` and `scanComplete` as JSON. A handled rejection or unavailable build counts as processed; worker exit `0` is not a claim that every build passed inspection. Pass failures report on stderr; once mode exits `1`, while watch mode can retry on its next pass.

The operator may supply `--root <directory>` when launching the worker; the default is `.payload/evidence`. Use the same root as capture, normalization and candidate builds. The root is never selected from a message. `PAYLOAD_COORDINATION_URL` may select only an HTTP literal-loopback origin such as `http://127.0.0.1:3000` or `http://[::1]:3000`. Hostnames including `localhost`, numeric aliases such as `127.1`, non-loopback addresses, HTTPS, credentials, non-root paths, queries and fragments are rejected. These local configuration checks do not provide authentication.

## Supported requests and redacted results

The worker consumes only directed `REQUEST` or `HANDOFF` messages addressed to `agent.candidate-build-review.v1`, with topic `candidate-build-review` and `context: null`. A non-null context is a fixture release reference, not a reference to this local unadmitted build; such messages are skipped and left unacknowledged. Unsupported topics, kinds and broadcasts are not consumed.

The body must be JSON with exactly `buildId` and `expectedDigest`. It cannot supply a storage root, filename, command, executable, model, policy override or release action. The requester must be registered in the same scope and declare `CARAVAN`. That domain check is a metadata constraint, not authorization to retrieve source information.

A fresh valid request calls `LocalCandidateBuildStore.inspect`, which reopens the build, normalizations, acquisitions and original source bytes and recomputes their historical contracts and decisions. The requested full digest must equal the recomputed build digest. The resulting `payload.candidate-build-review.v1` body binds the full board request with `requestDigest` and retains the requested build id/digest.

| Result | Meaning |
|---|---|
| `RECOMPUTED_LOCAL`, `error: null` | The exact local build recomputed and matched the requested digest |
| `REJECTED`, `INVALID_BUILD_REVIEW_REQUEST` | Invalid body, extra fields, invalid id or malformed expected digest |
| `REJECTED`, `AUTHOR_DOMAIN_MISMATCH` | The requester does not declare Caravan |
| `REJECTED`, `BUILD_DIGEST_MISMATCH` | An inspected build does not match the requested full digest |
| `UNAVAILABLE`, `BUILD_NOT_FOUND` | The operator-selected local store has no build with that id |
| `UNAVAILABLE`, `BUILD_INSPECTION_FAILED` | Build inspection or its stored dependencies failed; exception details are not posted |

Only successful results contain a `summary`: `buildId`, `digest`, `recordsRoot`, `recordCount`, `knownThrough`, `builtAt` and `state: "UNADMITTED"`. Failures have `summary: null`. The report is bounded to the board limit and includes no source bytes, candidate data fields, member/source identities, storage paths or exception text. Build ids are still caller-supplied identifiers; use non-sensitive demonstration identifiers in this unauthenticated board.

All reports set `canonicalAdmission`, `releaseActivated`, `independentlyVerified`, `sourceTruthClaimed`, `rawBytesIncluded`, `candidateFieldsIncluded` and `sourceIdentifiersIncluded` to false. Internal recomputation does not establish field accuracy, empirical source truth, completeness, source rights or independent verification.

## Result-before-receipt recovery

The worker checks that the inbox input exactly matches the durable board request. Its result idempotency key combines the worker id and input message id. It posts a `RESULT` reply to the requester, retaining the topic and null context, then reads the board again before acknowledgement—even after an uncertain post response.

Before acknowledging, it checks the saved result's route, schema, request digest, requested build, summary/error shape and false nonclaim fields. If no valid durable result is found, the request remains pending. A conflicting saved result is an error, not an overwrite or an automatic acknowledgement. Invalid requests and unavailable builds receive the same result/readback/receipt treatment rather than being silently dropped.

After acknowledgement, the returned board snapshot must contain a receipt for this exact input, worker and scope. A response without that receipt is a failed pass; the next pass can recover the saved result without rerunning inspection.

If acknowledgement failed after the result was saved, a later pass validates and reuses that historical result without reinspecting the files. This remains true if a source file has subsequently changed or the original inspection was unavailable. Recovery completes the receipt for the old observation; it does not refresh the observation. Post a new request id to obtain a new inspection. Report time is the board server's RESULT `createdAt`, not an independently attested execution timestamp. That original timestamp remains visible; no new inspection timestamp is invented during recovery.

These checks validate structure and request binding, not authorship. Sandbox participants are simulated identities. A caller able to post as the worker can still forge a structurally valid, correctly bound result; this system does not prevent such forgery. Use no protected customer data, secrets or confidential workloads in the sandbox.

## Authority and Bench grounding

The worker's local root is an operator-selected diagnostic scope. It reconstructs historical source declarations at the acquisition, normalization and build times. It does not reevaluate rights for current retrieval, check subsequent external revocation, grant retention permission or create a `RETRIEVE` authorization. Its summary is not a source-data delivery or authorized model context.

The sibling `Notations Kernel` provides the following studied boundaries:

| Bench source | Lesson and explicit difference here |
|---|---|
| `src/context-access-workflow.js` — `authorizeBindings`, `authorizeContextDelivery` | Bench context delivery requires exact record-to-source bindings and verified ALLOWED RETRIEVE decisions for a common purpose and audience. This worker does not implement that gate or claim authorized context delivery. |
| `src/agent-execution-workflow.js` — `recordAgentExecutionResult`, `verifyAgentExecutionEvidence` | Keep bounded output, exact input references and explicit nonclaims. Bench records a supplied model result against authorized context; it does not itself run the model or attest model execution. This worker performs deterministic local inspection, with no model call, context package or Kernel result/claim/envelope. |

No new agent fleet, process launcher, automation, admission gate, release path or customer compute service is introduced. Caravan candidates retain their unresolved identities and unadmitted status. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
