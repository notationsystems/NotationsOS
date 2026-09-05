# Agent and apparatus coordination

Status update (2026-09-05): references below to six absences or no live connectors describe this document's earlier milestone. One bounded, operator-only FMCSA Company Census connector is now implemented for internal qualification; see [Local source connectors](LOCAL_SOURCE_CONNECTORS.md). It establishes neither recurring ingestion nor customer live feeds. All other authority, storage, identity, execution and verification boundaries below remain unchanged.

Payload OS now has the first shared agent warehouse/stable and message board for assembling its apparatuses and agents. The stable records what each participant does and the contracts it consumes and produces. The board lets those participants share context, requests, handoffs, blockers, results and acknowledgements. Synastry is represented as the declared connections between those contracts, with incomplete inputs stated explicitly.

These are shared Payload OS coordination facilities across Caravan, Tradewind and Landshark. The company's mandate and economic architecture remain defined in [Economic architecture](ECONOMIC_ARCHITECTURE.md). The corpus and API remain the data product; customer inference can run directly over that stream.

## What is assembled

| Surface | Current behavior |
|---|---|
| `/agents` | Search agent and apparatus definitions, filter by kind, inspect purpose, declared authority, runtime, version, domains, inputs, outputs, capabilities and references; inspect synastry; register local definitions when enabled |
| `/board` | Read and filter messages by topic and kind; post directed or broadcast messages, reply within a thread and acknowledge messages when enabled |
| `GET /api/coordination` | Return the full snapshot for the server's coordination scope: definitions, messages, acknowledgements, connections and available release contexts |
| `POST /api/coordination` | Accept `register`, `post` and `acknowledge` commands in local sandbox mode, returning the updated full snapshot |
| `GET /api/coordination/inbox` | Read a registered participant's directed messages, with bounded cursor pagination, receipt filtering and optional broadcasts |
| JavaScript and Python clients | Read the snapshot and inbox; register, post and acknowledge through the same HTTP contracts |
| `npm run agent:contract-review` | Manually run a local deterministic worker that reviews declared contracts, posts a result and then acknowledges its request |
| `npm run agent:candidate-build-review` | Manually run a local deterministic worker that inspects one exact saved candidate-build reference, posts and reads back a bounded result, then acknowledges its request |

The seed includes evidence, corpus, coordination, compute, delivery and verification apparatus definitions, and source acquisition, normalization, identity, release, recall and simulation agent definitions. `REFERENCE`, `PLANNED` and `LOCAL` describe the definition's status. Neither a seed entry nor a registration proves that a process is running. Runtime labels support C++, Rust, Python, JavaScript and `Unassigned`; registering one does not install or execute that runtime. The contract-review and candidate-build-review workers register through the API when their respective commands start, without changing the committed seed.

## State and contract synastry

The operational snapshot uses `payload.coordination.v1` from `src/coordination/types.ts`. It contains:

| Record | Meaning |
|---|---|
| `Participant` | Stable id and version; agent or apparatus; purpose, declared authority, runtime, status, scope, domains, input/output contract names, capabilities and reference |
| `BoardMessage` | Author, optional recipient, kind, topic, title and body; optional release context and parent message; request id, server sequence, scope and timestamp |
| `Acknowledgement` | Message id, acknowledging participant, scope and timestamp; receipt only |
| `Connection` | Source and target, exactly matching contract names, common domains, missing target inputs, and `MATCH` or `PARTIAL` |
| `ReleaseContext` | Exact domain, release id, build id and knowledge cutoff from an available fixture corpus release |

`connectionsFor` compares participants only inside the same scope. A directed connection exists when a source output exactly matches a target input and they declare at least one common domain. `MATCH` means that source declares every input required by that target. `PARTIAL` means some match and the rest are listed in `missingInputs`. For example, the corpus apparatus supplies `CorpusBuild/v1` to the release agent, but that connection is partial because the release agent also requires `VerificationEnvelope/v1`. Each connection is evaluated separately; the implementation does not infer a complete execution plan from multiple partial suppliers.

Contract names such as `CorpusBuild/v1` and `CoordinationMessage/v1` are declarations in this prototype. Matching is exact string equality, not schema validation or proof of semantic compatibility. A connection grants no execution permission and makes no deployment or verification claim.

## Scope, messages and history

The current server binds coordination to `firm:coordination-demo`. Commands cannot choose a different scope. Registration must match that scope; authors, recipients, parent messages and acknowledgements must resolve within it. These checks define the local coordination perimeter. They do not authenticate callers or implement customer tenant isolation.

Messages have one of five kinds: `NOTE`, `REQUEST`, `HANDOFF`, `BLOCKER`, `RESULT`. A null recipient broadcasts to the scope. A handoff requires a different registered recipient. A release context must exactly match one of the snapshot's `releaseContexts`, and both sender and directed recipient must declare its domain. Replies keep their parent's topic and exact release context. A reply may add information; it does not overwrite its parent.

Only the recipient may acknowledge a directed message. A broadcast can be acknowledged by another participant in the scope, with the release domain when present. Acknowledgement records receipt; it does not assert completion, acceptance, correctness or canonical admission.

Messages are idempotent by author and `requestId`: retrying the same message returns the original record, sequence and timestamp; using that id for different content returns `IDEMPOTENCY_CONFLICT`. Repeated identical registrations and acknowledgements are also no-ops. Definitions cannot be overwritten under an existing id; a changed definition needs a new id. There are no edit or delete commands.

## Run the local prototype

```sh
npm install
npm run dev:coordination
```

Open `http://127.0.0.1:3000/agents` or `http://127.0.0.1:3000/board`. The launcher binds to `127.0.0.1`, sets `PAYLOAD_COORDINATION_LOCAL=1`, and uses `PORT` when set, otherwise 3000. Ordinary `npm run dev` leaves coordination read-only unless the local flag is explicitly set in its environment.

| Snapshot field | Default | Opt-in local sandbox |
|---|---|---|
| `fixture_only` | `true` | `true` |
| `mode` | `FIXTURE` | `LOCAL_SANDBOX` |
| `persistence` | `NONE` | `LOCAL_FILE` |
| `canWrite` | `false` | `true` |

The fixture flag continues to identify the demonstration environment even when coordination records are locally mutable. Corpus releases and workbench data remain immutable committed fixtures. Local participant selection is simulated author identity, not authentication. Use demonstration content; raw secrets, protected customer inputs and confidential workloads do not belong in this sandbox.

## HTTP and JSON interface

C++, Rust, Python and JavaScript clients can use the same plain HTTP and JSON interface. No model provider or language-specific agent framework is required. Read with `GET http://127.0.0.1:3000/api/coordination`. Send a command with `POST` to that URL and `Content-Type: application/json`. Successful reads and writes on this endpoint return HTTP 200 and the full snapshot; the inbox endpoint returns a participant-specific page. Responses are uncached and carry `X-Payload-Fixture-Only: true` and `X-Payload-Coordination: sandbox-v1`.

All fields shown in each command are required; unknown fields are rejected. This registration declares a local review agent without launching it:

```json
{
  "operation": "register",
  "participant": {
    "id": "agent.review.local-v1",
    "name": "Local release review agent",
    "kind": "AGENT",
    "version": "0.1.0",
    "purpose": "Record demonstration review notes against a corpus release.",
    "authority": "derived",
    "runtime": "Python",
    "status": "LOCAL",
    "scope": "firm:coordination-demo",
    "domains": ["CARAVAN"],
    "inputs": ["CorpusRelease/v1"],
    "outputs": ["ReviewNote/v1"],
    "capabilities": ["release.review"],
    "reference": "Local coordination demonstration"
  }
}
```

This handoff uses seed participant ids and an exact available release context. It can be posted independently of the registration above:

```json
{
  "operation": "post",
  "message": {
    "requestId": "demo-release-handoff-001",
    "authorId": "agent.release",
    "recipientId": "apparatus.delivery",
    "kind": "HANDOFF",
    "topic": "release-assembly",
    "title": "Inspect the demonstration release",
    "body": "Review the fixture release and its rights schedule. Record any delivery blocker in this thread.",
    "context": {
      "domain": "CARAVAN",
      "releaseId": "REL-CAR-2026.09.01",
      "buildId": "build-caravan-sc-2026.09.01",
      "knownAt": "2026-09-01T12:00:00Z"
    },
    "replyTo": null
  }
}
```

To reply, supply a new request id and the returned parent message id in `replyTo`, keeping the parent's topic and context. General OS assembly messages can use `context: null`.

This acknowledgement applies to the seeded verification-to-release handoff `MSG-00003`, whose recipient is `agent.release`:

```json
{
  "operation": "acknowledge",
  "messageId": "MSG-00003",
  "participantId": "agent.release"
}
```

The local route accepts loopback hosts and checks any supplied Host, Origin and browser fetch-site headers. These are local request checks, not credentials or production authentication. Command bodies are limited to 16 KiB. Errors return `{ "fixture_only": true, "error": "CODE", "detail": "Explanation" }`; examples include `READ_ONLY` (403), `INVALID_RELEASE_CONTEXT` (400), `UNKNOWN_PARTICIPANT` (404), `IDEMPOTENCY_CONFLICT` (409) and `BOARD_BUSY` (503).

## Participant inbox and polling

```text
GET /api/coordination/inbox?participant=agent.contract-review.v1&after=0&limit=50&acknowledged=false&broadcasts=false
```

The participant must already be registered. Add `&kind=REQUEST` to select one of the five message kinds, or omit `kind` to receive all kinds. Unknown query fields, repeated fields, invalid booleans and unsupported kinds are rejected. `after` is a nonnegative safe integer; `limit` is 1–100 and defaults to 50. An `after` cursor beyond the current board history returns `CURSOR_AHEAD` (409), with instructions to read again from zero.

The server uses its bound scope and the participant's declared domains. An inbox excludes the participant's own messages, messages addressed to somebody else, and messages whose release domain the participant does not declare. Broadcasts are excluded unless `broadcasts=true`. Already acknowledged messages are excluded unless `acknowledged=true`. This filters the demonstration inbox; it does not create authenticated access or customer tenant isolation.

The response has schema `payload.coordination-inbox.v1`, the fixture/mode/scope fields, participant id, `messages`, relevant `acknowledgements`, `afterSequence`, `nextSequence`, `highWaterSequence` and `hasMore`. Messages arrive in ascending sequence order. While `hasMore` is true, use `nextSequence` as the next `after` value to continue that scan. At the end of a scan, `nextSequence` equals the board's current high-water sequence, including messages excluded by the filters.

A cursor records how far a scan looked; an acknowledgement is the durable receipt. For pending-work polling, begin each new pass at `after=0` with `acknowledged=false`, and always do so after restarting. Paginate within the pass, complete the chosen work, save its result, then acknowledge the input. Persisting only the last cursor could skip an earlier message whose result or acknowledgement failed. Resetting the scan to zero lets durable receipts exclude completed inputs while retaining pending ones. Messages the worker does not handle remain unacknowledged.

## Run the local contract-review worker

In terminal one, start the local server from the repository root:

```sh
npm run dev:coordination
```

In terminal two, register the worker and make an initial pass:

```sh
npm run agent:contract-review -- --once
```

This registers `agent.contract-review.v1` using the server's scope. Post a request with either client example below, then run the same `--once` command again. Inspect the resulting thread and acknowledgement on `/board`. A plain `npm run agent:contract-review` also runs once; `npm run agent:contract-review -- --watch` repeats passes with a two-second wait between them until stopped. `PAYLOAD_COORDINATION_URL` can select a different local server URL; the default is `http://127.0.0.1:3000`.

The worker handles only `REQUEST` or `HANDOFF` messages directed to `agent.contract-review.v1` with topic `contract-review`. The body must be JSON with exactly one field, for example `{"participantId":"agent.release"}`. It checks that target's declared input contracts against registered suppliers in the same scope with common domains. It reports matched input counts, supplier connections and `missingInputs` in a `RESULT` reply, preserving the request's topic, release, build and knowledge cutoff. This result combines declared suppliers; the stable's `MATCH` and `PARTIAL` labels still describe individual connections. Large reports state how many connection or missing-input details were omitted to fit the board's body limit. Invalid bodies and unknown targets produce an error result so their requests can be acknowledged explicitly.

The result uses a request id derived from the worker id and input message id. The worker saves the result before acknowledging the request. If acknowledgement fails, a later pass reuses the saved result and retries the receipt, even if the stable has changed in between. Each pass processes at most 50 requests by default and prints processed, recovered and skipped counts. Unsupported topics and message kinds remain pending. The worker performs deterministic declaration review; it invokes no model and performs no corpus, source, simulation or customer-workload execution. Starting the worker is an explicit local process operation; posting to the board does not start it.

## Inspect a local candidate build through the board

The separate `npm run agent:candidate-build-review -- --once` command registers `agent.candidate-build-review.v1` and handles directed REQUEST/HANDOFF messages with topic `candidate-build-review`, `context: null` and exactly `{ "buildId": "…", "expectedDigest": "sha256:…" }` as the JSON body. The expected digest is the full saved build digest, not its membership root. The requester must declare Caravan; that is a simulated-participant metadata check, not authenticated retrieval authority.

This worker reopens an existing local build and its evidence through the read-only inspector. It reports only build-level id, digests, count, times and unadmitted state, or a bounded error code. It does not accept message-supplied paths or commands, include source bytes/member identities/candidate fields, create builds or activate releases. Non-null fixture release contexts are skipped and left unconsumed. After posting, it reads back and structurally validates the bound result before acknowledging; recovery after a failed acknowledgement reuses the saved observation without a new inspection. A new request is required for a fresh check.

See [Candidate-build review worker](CANDIDATE_BUILD_REVIEW_WORKER.md) for the two-terminal/client workflow, operator-selected `--root`, HTTP literal-loopback URL restriction and the distinction between historical integrity inspection and current RETRIEVE permission. Result binding does not authenticate authorship or prevent a structurally valid forgery by another sandbox caller.

## JavaScript and Python clients

The clients require no additional libraries. JavaScript uses Node's `fetch`; Python uses its standard library. Both expose `snapshot`, `register`, `post`, `acknowledge` and `inbox`, with bounded timeouts and retries for transient failures. `post` requires a caller-supplied `requestId`. Automatic retries reuse the serialized command; an application retry should retain that same id and payload. Each client raises `CoordinationClientError` with `status`, `code` and `detail` when a request fails.

After the worker has registered, run `node` from the repository root and enter:

```javascript
const { CoordinationClient } = await import('./clients/javascript/coordination.mjs');
const client = new CoordinationClient('http://127.0.0.1:3000');
const snapshot = await client.snapshot();
await client.post({
  requestId: 'demo-contract-review-js-001',
  authorId: 'apparatus.coordination',
  recipientId: 'agent.contract-review.v1',
  kind: 'REQUEST',
  topic: 'contract-review',
  title: 'Review the release agent contracts',
  body: JSON.stringify({ participantId: 'agent.release' }),
  context: snapshot.releaseContexts[0] ?? null,
  replyTo: null,
});
```

Exit the interpreter, run the worker once again, then read results through a new client session:

```javascript
await client.inbox('apparatus.coordination', {
  afterSequence: 0, limit: 50, includeAcknowledged: false,
  includeBroadcasts: false, kind: 'RESULT',
});
```

In the new session, repeat the import and client construction first. A result can be acknowledged with `await client.acknowledge(messageId, 'apparatus.coordination')` after inspection.

Alternatively, run `python` from the repository root and enter:

```python
import json
from clients.python.payload_coordination import CoordinationClient

client = CoordinationClient("http://127.0.0.1:3000")
snapshot = client.snapshot()
client.post({
    "requestId": "demo-contract-review-py-001",
    "authorId": "apparatus.coordination",
    "recipientId": "agent.contract-review.v1",
    "kind": "REQUEST",
    "topic": "contract-review",
    "title": "Review the release agent contracts",
    "body": json.dumps({"participantId": "agent.release"}),
    "context": next(iter(snapshot["releaseContexts"]), None),
    "replyTo": None,
})
```

After another worker pass, recreate the Python client and call:

```python
client.inbox("apparatus.coordination", after_sequence=0, limit=50,
             include_acknowledged=False, include_broadcasts=False, kind="RESULT")
```

Python acknowledges with `client.acknowledge(message_id, "apparatus.coordination")`. Both clients accept a complete participant definition through `client.register(...)`; all required fields are shown in the registration command above. Identical retries remain idempotent. Use a new request id for a new review; reusing either example id with changed content returns a conflict.

## Local persistence and recovery

`src/coordination/store.ts` records accepted state-changing commands with their original server timestamps in `.payload/coordination/events.json`, under log schema `payload.coordination-log.v1`. The `.payload/` directory is git-ignored. Reading replays this log over the seed; restarting with the same seed and valid log reconstructs the original registrations, message ids, sequence, timestamps and acknowledgements. Idempotent retries do not add an event.

A writer takes an exclusive `writer.lock`, reads and validates the current log, applies a command, writes and syncs a unique temporary file, then atomically replaces `events.json`. The lock serializes writers across local processes; contention returns `BOARD_BUSY` so the caller can retry the same request id. This is a bounded local file store, not distributed production storage. Limits are 200 definitions, 5,000 messages, 15,000 log entries and 16 MiB of serialized log.

Normal completion removes that writer's lock and temporary file. A crashed writer may leave a lock behind. There is no automatic stale-lock deletion: stop or identify the prior writer and inspect the lock, event log and any temporary file before operator recovery. An unreadable or invalid log returns `INVALID_LOCAL_LOG` and is preserved for inspection. A failed write response does not confirm success; after recovery, retry the original request id to discover or apply the original message without duplication.

The log records a digest of its initial seed and refuses replay if that seed changes. This prevents a later fixture revision from silently reassigning message ids or acknowledgements; migrating such a log requires an explicit migration. The log is append-only through the command API but is not a signed, tamper-evident or independently verified ledger. Direct file edits can invalidate replay.

## Relationship to Notations Bench

The Bench prototype supplies reference contracts and authority boundaries. The following source paths were checked in the sibling `Notations Kernel` repository:

| Bench source | Relationship to this first assembly |
|---|---|
| `src/apparatus-workflow.js` | Defines apparatus purpose, inputs, outputs, capabilities and distinct canonical, evidence, coordination, derived, projection and verification authority modes |
| `src/authorized-acquisition-workflow.js`, `src/source-policy-workflow.js`, `src/source-connector-workflow.js` | Reference acquisition boundaries behind evidence and source definitions |
| `src/evidence-normalization-workflow.js`, `src/corpus-workflow.js` | Reference evidence-to-record and corpus boundaries behind normalization, identity and corpus definitions |
| `src/context-access-workflow.js`, `src/agent-execution-workflow.js` | Reference authorized context and bounded agent-result contracts; board posts do not execute these workflows |
| `src/verification-router.js`, `src/kernel.js` | Reference verification and the four canonical entity types: `Artifact`, `Claim`, `Operator`, `VerificationEnvelope` |

`payload.coordination.v1` is an operational contract introduced in this repository. It is separate from those four canonical entity types, and its messages are not Bench artifacts or verification envelopes. There is no automatic import, signed board, digest proof or independent verification bridge. A posted result can record a proposed next step; evidence admission, identity changes, corpus builds and release activation remain the responsibility of their respective apparatuses.

## Present limits

The implemented portion is the stable, contract connection calculation, scoped board, participant inbox, opt-in local persistence, JavaScript and Python clients, and manually started local contract-review and candidate-build-review workers. They can poll, inspect declarations or a referenced saved build, post results and acknowledge requests. Build inspection is read-only and redacted; it does not create a build or supply authorized model context. The board has no process launcher or managed agent fleet; neither worker executes a model, production mutation or customer workload. Caller identities remain simulated. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
