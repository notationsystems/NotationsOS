# Local notation state kernel

The first state-kernel milestone is a small Rust command/history core consumed by the existing web frontend. It owns authored notation objects and explicit notation relationships in one local workspace. It does not own evidence, admit physical-economy corpus records, activate releases or merge canonical identities.

```text
/notations frontend → loopback command API → Rust replay/validation
                                        → versioned local snapshots on Save
```

Bevy is not a dependency. A later standalone ECS runtime may process projections of this state if a concrete simulation workload requires it. It must consume the same application rules; adopting an ECS would not supply permissions, undo, storage or frontend synchronization.

## Run the milestone

Install the Rust toolchain and existing Node dependencies, then run:

```sh
npm run dev:state-kernel
```

The launcher builds the locked Rust crate and starts the application on `127.0.0.1:3000` (or the operator's `PORT`). Open `/notations`. Create a notation, select it, apply an update, undo the update, save, then reload the page. The original content and logical ID should return from saved storage, with the command revision and undo/redo capability reconstructed by Rust.

Ordinary `npm run dev` and production startup leave the workspace disabled unless the operator explicitly sets `PAYLOAD_STATE_KERNEL_LOCAL=1`. There is no browser-only replacement kernel or localStorage fallback. A missing native executable fails closed with a build instruction. The host-specific executable is built locally, not shipped through Next.js file tracing; this milestone does not supply a portable native deployment package. Build traces exclude local history, environment files and Rust build scratch files and are checked before `npm run build` can succeed.

Default storage is `.payload/notation-state`, separate from evidence and the coordination board. The optional operator environment variable `PAYLOAD_NOTATION_STATE_DIR` selects an isolated local workspace for testing. HTTP requests cannot select directories, executables, tenants or existing corpus records.

## State and commands

`notations.notation-state.v1` contains a monotonically increasing command `revision`, stable-ID `notations` with title/body, explicit `relations` with source/target/label, and undo/redo availability. Lists use lexical ID order, not visual position. Relations require existing endpoints; a label is an authored relationship, not an independently verified physical fact.

The closed command vocabulary is `CREATE_NOTATION`, `UPDATE_NOTATION`, `CREATE_RELATION`, `UNDO` and `REDO`. Every accepted command has a unique `commandId`. Content IDs are never reassigned to a different notation or relation, including after undo. Redo restores the same original ID. Update preserves the target ID. Empty undo/redo, no-op updates, missing endpoints, duplicate IDs and extra fields are rejected without returning a partially applied state.

Undo reverses the latest content operation. Repeated undo walks backwards; redo walks forwards. A new content command after undo clears the redo branch, but does not free its used IDs. The accepted command history retains the undo/redo operations so a reload reconstructs the same behavior. Undo is not evidence deletion, source correction, corpus retraction or erasure of saved history.

Limits are 256 accepted commands across the entire workspace history (including undo/redo), 64 current notations, 128 current relations and 2 MiB of native request bytes. IDs are 1–80 ASCII characters (`[A-Za-z0-9][A-Za-z0-9_.:-]*`). Title/body/relation-label limits are 160/8,000/80 Unicode scalar values. Title and label cannot be blank. The frontend may impose stricter text-entry limits. The core performs no network access, filesystem persistence, inference or renderer operations.

## Frontend contract

| Endpoint | Contract |
|---|---|
| `GET /api/state-kernel` | Read and replay the saved workspace, or return a disabled empty descriptor when the local mode is off |
| `POST /api/state-kernel/preview` | Validate the complete pending command batch over the exact saved base version; return state without saving |
| `POST /api/state-kernel/save` | Validate again, save a new immutable version, then read it back before confirming success |

POST accepts only `{ schema: "payload.notation-command-batch.v1", baseVersion, commands }`. It does not accept a replacement state, arbitrary attributes, storage paths or a renderer's ECS world. Rust receives the existing accepted history plus the submitted batch, never browser-supplied state as authority.

Successful responses contain the notation state, `savedVersion`, `savedDigest`, `enabled`, `persistence`, `capacity`, `mode: "LOCAL_DEVELOPMENT"` and `canonicalAdmission: false`. Preview changes the returned command revision, not the saved version. `capacity` reports maximum, used and remaining lifetime commands and saved versions. Previewed commands count toward the displayed command budget; unsaved form text does not. Errors are structured `{ error: { code, message } }` responses; source payloads, native stderr and local paths are not returned.

The frontend retains pending commands until Save succeeds. Typed text is a draft until Create/Update succeeds. A failed preview or save leaves the last accepted state and draft available. Reload discarding unsaved commands or text requires explicit confirmation. Controls are locked during requests so an older completion cannot mark newer changes saved.

The root browser-document provider owns the draft, selection, form text, original saved base version and in-flight requests. Client navigation away from `/notations` and back does not discard them, cancel a save, or silently rebase a draft onto newer storage. The unload warning remains active while away with unsaved work. This is in-memory retention within one browser document, not localStorage, crash recovery or durable unsaved state. Full browser reload or tab closure still requires saving or accepting draft loss; separate tabs remain independent and competing saves use the existing version-conflict behavior.

## Capacity and recovery

The interface exposes the 256-command and 64-version ceilings before they are reached. Undo and redo consume commands; neither frees lifetime capacity or reserved IDs. At the command ceiling, new previews (including undo/redo) stop, but the already accepted pending batch can still be saved if a version slot remains. At 64 saved versions, both preview and new save return `CAPACITY` rather than accepting an unsaveable preview. Reading and an exact retry of the final successful save continue to work. The native 2 MiB input, text and object limits also remain enforced; available command slots do not override those bounds.

Do not delete snapshots, reset the history or raise limits to reclaim space. Save pending work while capacity remains and preserve the whole directory. An operator may start the local service against a different empty `PAYLOAD_NOTATION_STATE_DIR`; that is a separate workspace, not migration, compaction or continuation of identity/history. Existing drafts are not automatically transferred. Deliberate checkpoint/archive support remains absent: any future design must preserve reserved IDs, undo/redo semantics and integrity across the archive boundary.

Every saved prefix is still replayed through Rust. The [near-capacity benchmark](STATE_KERNEL_BENCHMARK.md) measures the resulting cost without skipping integrity checks or increasing limits. It is a local baseline, not a production throughput claim.

## Saved versions and concurrency

Each create-only numbered snapshot stores the schema, saved version, prior snapshot digest, exact command batch/base version, resulting state and full deterministic digest. Saved version and command revision are different clocks: one save can contain several accepted commands. There are at most 64 saved versions, each bounded at 8 MiB. The encoding is Payload's local sorted JSON codec, not the sibling Bench's portable integrity grammar or a cross-language scientific proof format.

Loading validates the contiguous version sequence, full digests and predecessor links, then replays every saved command prefix through Rust and compares each saved state. Corrupt JSON, stale schemas, broken links, invalid commands or mismatched state produce an error; they do not create an empty replacement. Digests detect inconsistency, not a malicious local operator rewriting the entire history. No remote attestation or external head exists to detect rollback of the complete local directory.

Save requires the expected saved `baseVersion`, takes an exclusive local writer lock, checks that base again, and atomically publishes a complete create-only file. A stale draft cannot overwrite another save. An immediate identical retry returns the already saved version without adding history; retries against a later unrelated save fail with a conflict. Preview is not a reservation: another save may win before Save.

Temporary publication files are never treated as saved versions. Failed or interrupted writes preserve existing snapshots. An abandoned `writer.lock` requires deliberate operator recovery after verifying that no writer remains; the system does not automatically steal locks, delete saved history or silently repair corruption. This is trusted local-filesystem persistence, not distributed storage, power-loss-proof WORM, production backup or multi-user authentication.

## Verification

`npm run check` runs the Rust tests, TypeScript, lint and JavaScript/React tests; `npm test` builds the native executable before integration tests. `npm run e2e:state-kernel` builds the application and runs the real create/update/undo/save/page-reload milestone on desktop and mobile at loopback port 3112. It uses a fresh temporary state directory, never the operator's `.payload` history. Set `PW_CHROMIUM_PATH` to an installed compatible Chromium browser if Playwright has no browser available; the runner does not download one. Successful runs remove only their own temporary history; failures preserve it for inspection.

The browser tests check stable ID/content after a full page reload, reconstructed redo availability, and edit → Releases → return draft retention, plus viewport overflow, page errors and serious/critical accessibility findings. Component tests also exercise in-flight completion while away and explicit discard. Store tests exercise the final command, final saved version, rejected over-capacity writes and identical retries against real Rust replay. Screenshots are written under `test-results/`. This is local implementation verification, not independent verification or a completed customer pilot.

## Boundaries and Bench lessons

Bench's `NotationRegistry` rejects a new digest for an existing immutable entity ID. It is not reused as an editable object store. This implementation separates a stable authored object ID from versioned snapshot identity. Its journal/release patterns inform complete replay and expected-current checks, without inheriting release authority.

The [cross-repository baseline audit](CROSS_REPOSITORY_BASELINE.md) records the dependency boundary before evidence integration. Test-only pinned control-plane copies are not proof that this workspace is compatible with the sibling's uncommitted provenance or admission changes. Evidence-linked inquiry remains a later increment: reference exact candidate/build digests, keep authored interpretation distinct from source and validation status, and submit admission separately. Saving a note must not admit data; undoing it must not retract evidence.

The shared Payload OS operating rail owns this local workspace. Caravan, Tradewind and Landshark retain their domain state; the internal loopback endpoints are not a fourth customer API. There is no production tenant identity, RBAC, collaboration merge, evidence attachment, canonical admission, simulation or Bevy runtime in this milestone. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
