# Notation workspace: the frontend contract

`/notations` authors local notation state against the [Rust state kernel](LOCAL_NOTATION_STATE_KERNEL.md). This document is the frontend's side of that contract: what the interface promises about drafts, states, conflicts and capacity; the contract it asks the backend for; the evidence-reference contract it is prepared to display; and the implementation receipt for the increment that introduced them. Authority does not move: Rust validates every command, the store saves versions, the browser holds drafts.

## Three states, told apart

| State | What it is | Where it lives | Shown as |
|---|---|---|---|
| 1 · Unapplied text | Typed into a form, not yet previewed. The kernel has not seen it. | React state, mirrored to this tab's `sessionStorage` | `state-text` with a field count; an "Unapplied edit" marker on an edited notation |
| 2 · Validated, not saved | Commands the kernel accepted in a preview against the saved version, not yet saved | React state, mirrored to this tab's `sessionStorage` | `state-pending` with the command count and the draft revision |
| 3 · Saved local version | A version the store wrote and read back | `.payload/notation-state` (or the operator's directory) | `state-saved` with the version and digest |

A successful preview changes the draft revision, never the saved version, and the interface says so: "Not saved: another save may still win before yours." Save validates the whole pending batch again; a preview is not a reservation.

## Draft lifecycle

- **Persistence.** Whenever anything is unsaved, the workspace writes `payload.notation-browser-drafts.v1` to `sessionStorage`: the pending commands, the form text, the selection, and the saved version and digest they were made against. When nothing is unsaved the entry is cleared. Nothing in it is authority; nothing in it is saved.
- **Internal navigation.** The draft's home is a root client provider that lives for the whole browser document, above every route. Navigating to another page and back finds the draft, the selection, the pending commands, their original saved base version and any request in flight exactly where they were, without another read of the kernel; nothing is rebased onto a newer saved version behind the person's back. Navigation is never interrupted: instead the rail marks the Notations link `draft` while unsaved work exists, with the counts in its tooltip, on every page.
- **Browser reload and close.** The browser's own `beforeunload` prompt is armed while work is unsaved or a preview or save is in flight, on whichever page the person is; never for a read. After a reload the workspace restores the tab's copy: the text at once, the pending commands only after the kernel re-validates them in a preview against the loaded saved version. Restored commands are re-validated, never trusted. Another tab is another draft.
- **Stale drafts.** Drafts pinned to a different saved version or digest than the one loaded are set aside as stale: shown in the conflict panel, inspectable and copyable, never applied.
- **Failed requests.** A failed preview or save leaves the text and the pending commands exactly where they were.

## Version conflicts

When a save is refused with `VERSION_CONFLICT`, the workspace explains which saved version the drafts were validated against and which version the workspace is at now, lists the pending commands one per line, shows the unapplied text summary, offers **Copy drafts as JSON** (clipboard, with a selectable textarea when the clipboard is unavailable), and offers **Keep working with these drafts** or **Reload saved state and discard drafts**. Reload is deliberate and passes through the existing confirmation; nothing is discarded by the conflict itself.

## Capacity

The snapshot reports `capacity` (`maxCommands`, `usedCommands`, `remainingCommands`, `maxSavedVersions`, `usedSavedVersions`, `remainingSavedVersions`; `src/state-kernel/types.ts`), and the frontend refuses any snapshot whose capacity is missing or disagrees with the contract's arithmetic, keeping the accepted draft. The meter shows lifetime commands and saved versions as the API reports them and current notations and relations against the kernel contract's limits, each as used / limit / remaining. It warns in the last sixteen commands or four versions. The lifetime command count includes undo and redo and only grows: at 256 no further command, undo or redo is accepted, the forms are disabled, and an already accepted pending batch can still be saved while a version slot remains. At 64 saved versions the kernel accepts no further preview or save; the forms and Save are disabled, reading and a deliberate reload still work. Recovery today is to save what is pending, copy the drafts, and have an operator start a new workspace directory; a checkpoint or archive facility that preserves reserved identities is not implemented, and the interface says that too. The contract request the previous increment made for this field is answered by the backend's shape above, which the frontend adopted.

## Evidence references: the contract, ahead of the backend

A notation will refer to exact evidence. The contract the frontend displays, `payload.notation-evidence-reference.v0` in `src/domain/evidenceReference.ts`, carries:

| Field | Meaning |
|---|---|
| `kind` | `ACQUISITION`, `NORMALIZATION_RUN`, `CANDIDATE`, `CANDIDATE_BUILD`, `CORPUS_RECORD` or `RELEASE` |
| `targetId` | The target's stable identifier in its own namespace |
| `digest` | The exact version referred to: the target's digest, or the release digest for a record. Empty means no version is pinned |
| `context` | Domain and the source, acquisition, normalization, build or release the target belongs to |
| `temporal` | Whatever the target carries: captured, stored, normalized, known, cutoff, built, valid |
| `interpretation` | The author's reading, with its own time. Authored local text, never a property of the evidence |

Resolution is computed, not stored: `RESOLVED` when the exact digest exists where the reference points, `CHANGED` when the target exists with a different current digest, `UNAVAILABLE` when no target exists there, `UNRESOLVED` when no digest is pinned. A reference copies nothing and promotes nothing; it establishes neither evidence truth nor canonical identity.

**What exists now.** The panel on `/notations` is server-rendered over fixture references, marked `FIXTURE · attachment DISABLED`, with one example of every resolution state against the committed production demonstration and corpus. Nothing is editable, stored or saved. References are not encoded into notation text.

**Backend contract request.** Two commands in the closed vocabulary, validated by Rust like every other command, and a `references` list on each notation in `notations.notation-state.v1`:

```json
{ "commandId": "…", "kind": "ATTACH_EVIDENCE_REFERENCE", "notationId": "…",
  "reference": { "referenceId": "…", "kind": "CANDIDATE_BUILD", "targetId": "…", "digest": "sha256:…",
                 "context": { "domain": "CARAVAN", "buildId": "…" }, "temporal": { "knownThrough": "…", "builtAt": "…" },
                 "interpretation": { "text": "…", "authoredAt": "…" } } }
{ "commandId": "…", "kind": "DETACH_EVIDENCE_REFERENCE", "notationId": "…", "referenceId": "…" }
```

Rules the frontend expects the kernel to enforce: the notation exists; `referenceId` is unique and never reassigned; `digest` is empty or `sha256:` plus 64 hex; bounded text; undo of an attach detaches, redo re-attaches the same `referenceId`; no command reads, copies or verifies the target. Resolution stays outside the kernel, computed by the application against the rail and the corpus at read time, so a saved reference never carries a resolution as if it were a fact.

## Layout, selection and keyboard

The workspace is one centre surface with a contextual inspector (`src/components/primitives/Inspector.tsx`, layout in `globals.css` under `.workspace`). Selection connects them: the register lists every notation in the draft state with its identity, its relation count and where it stands (`new in draft`, `changed in draft`, `unapplied edit`); the selected notation's inspector holds its editor, its origin (`Created in this draft · not saved`, `Changed in this draft · not saved`, or `In saved local version N`, read from the pending commands and the saved version), the relations that name it with their direction, the pending commands that name it, and its evidence line. A relation selected from either list opens its own inspector with both ends, its origin, and a way back to each notation. From 1024 px the inspector is a sticky column beside the surface; below that it is an inline detail view directly beneath the register, so the create form and the relation form stay reachable beneath it and nothing is modal.

**Fast selection.** Rows are buttons with `aria-pressed`; `↑` `↓` `Home` `End` move the selection in the register and focus follows; Enter on the selected row moves focus into its title field. `Relate this notation…` pre-fills the relation form's source and moves focus to the target. `Esc` outside a text field closes the inspector and returns focus.

**Keyboard commands.** `Ctrl+Z` undoes and `Ctrl+Shift+Z` or `Ctrl+Y` redoes the last command in the draft, through the kernel, only outside text fields (inside them the field's own history applies); `Ctrl+S` saves anywhere and, when it cannot, says why in the status line (disabled state, request in progress, open dialog, unapplied text, version limit, nothing pending). The controls carry `aria-keyshortcuts`, visible key hints, and a `Keyboard` disclosure that lists everything. ⌘ stands for Ctrl on a Mac; the hints do not detect the platform.

**Progress and empty states.** Every request names itself in the status line while it runs (`Loading…`, `Validating N commands with the state kernel…`, `Saving N commands against saved version V…`, `Reloading…`); the Save control reads `Saving…` with `aria-busy` while its request is in flight. An empty register explains what to do and, when the state is disabled, why nothing can be authored; an empty relation list points at `Relate this notation…`.

## Boundaries

Commands go through the existing API and Rust remains the validation authority. Selection, dialogs, form text and the capacity view are presentation state, separate from notation state. A saved notation is authored local state. A reference establishes neither evidence truth nor canonical identity. An authored relationship establishes no factual or causal relationship. Saving or undoing a note admits or retracts no corpus evidence. Unavailable, unresolved, conflict and disabled states stay explicit. Bevy, canonical admission, source ingestion and production authentication are outside this increment.

## Verification

`npm run check` runs the Rust tests, TypeScript, lint and the unit tests, which include the draft store, the capacity view, the evidence-reference resolver, the workspace's protection behaviours, the provider's retention across route changes and in-flight requests, the capacity ceilings, and the refusal of inconsistent capacity, all over a mocked API. `npm run e2e:state-kernel` runs the real kernel and store in an isolated temporary directory on desktop and mobile through: create → update → undo → save → reload; edit → Releases → return with one kernel read and the rail's draft marker; unapplied text and pending commands → browser reload; a preview the kernel refuses → retained draft; a competing save → version conflict → inspect, copy, keep, deliberate reload; the capacity meter with the API's numbers; the fixture panel's marker and resolution states; the inspector, relations and keyboard. The at-limit behaviour (256 commands, 64 versions) is verified in unit tests over snapshots at the limit and in the store tests against the real kernel, not by filling a real workspace through the browser.

## Implementation receipt (2026-09-05)

**Changed screens.** `/notations`: the state strip (unapplied text, validated-not-saved, saved version) replaces the flat counters; the leave dialog on internal navigation; the conflict panel with inspection and copy; the capacity meter; per-control at-limit messages; the "Unapplied edit" marker on an edited notation and in the register; preview and save wording that promises no save; the server-rendered evidence-reference panel below the workspace, marked `FIXTURE · attachment DISABLED`. No other screen changed; Notations already sat in the Workbench group of the navigation.

**Working integration, verified on desktop and mobile against the real Rust kernel and the real local store in an isolated directory** (`npm run e2e:state-kernel`, 8 passed): create → update → undo → save → page reload with the same stable identity and reconstructed redo; edit → internal navigation → Stay (focused, Escape), Leave and keep drafts (drafts restored on return), Discard drafts and leave; unapplied text and a pending command → browser reload → restored, the command re-validated by the kernel; a preview the kernel refuses → retained text, no command appended; a competing save through the API → version conflict → pending commands listed, draft JSON copyable, keep working, then deliberate reload to the other writer's version; the capacity meter with the contract limits; the fixture panel's marker and one reference per resolution state; no page errors, no horizontal overflow, no serious or critical axe findings.

**Verified over a mocked API** (`src/components/notations/*.test.tsx`, 13 tests; `capacity.test.ts`, `drafts.test.ts`, `src/domain/evidenceReference.test.ts`): drafts persisted and restored across unmount and remount; stale drafts set aside; the leave dialog's focus, Escape and three actions; the conflict panel; the capacity view from the snapshot and from an API-reported `capacity`; controls disabled with explanations at 256 commands and at 64 saved versions; preview wording. The at-limit behaviour is not exercised on a real workspace.

**Fixture-only presentation.** The evidence-reference panel. Its references belong to no stored notation, resolve against the committed production demonstration and corpus at a fixed clock, and cannot be attached, edited or saved.

**Backend contract requests.** A `capacity` field on the workspace snapshot: answered since by the backend in its own shape, which the frontend adopted (see Capacity). `ATTACH_EVIDENCE_REFERENCE` and `DETACH_EVIDENCE_REFERENCE` commands with a `references` list per notation, validated by Rust under the rules above, with resolution left to the application: not implemented; the frontend shows the reference contract as a fixture until the commands exist.

**Remaining limitations.** Drafts live in one browser tab's `sessionStorage`; another tab or another browser does not see them. Restoring pending commands costs one preview request. A conflict panel does not show what the other writer saved; reload does. Capacity limits are the contract's until the API reports them. The kernel's O(n²) replay on save near capacity (noted in review) is unchanged and outside this frontend increment. No graph interaction, keyboard shortcuts for undo and redo, or relation inspector were added; the design brief's notation slice continues from here.

## Implementation receipt: layout, selection and keyboard (2026-09-05)

**Changed screens.** `/notations` only: the register, the selected-notation inspector and the relation inspector on the shared `.workspace` layout; the create form and the relation form beneath the inspector on narrow screens; keyboard commands with hints; the named progress states; the empty states. Every label, control name and test id from the previous increment is unchanged, and the previous suites pass unmodified. The shared shell (five activity areas as a left rail) is documented in `UX_ARCHITECTURE.md`.

**Verified on desktop and Pixel 7 against the real Rust kernel and the real local store in an isolated directory** (`npm run e2e:state-kernel`, 10 passed, the earlier 8 plus one new test per viewport): two notations created, the inspector on the newest with `CREATED`; the inspector beside the register on desktop and directly beneath it, above the create form, on mobile (bounding boxes); `Relate this notation…` pre-filling the source and focusing the target; a relation previewed, shown on both ends with its direction, inspected from the inspector, and followed back to the target; `Ctrl+Z` removing the relation and `Ctrl+Shift+Z` restoring it through the kernel; `Ctrl+Z` inside a text field sending nothing; `Ctrl+S` saving; the origin turning to `In saved local version N`; `Esc` closing the inspector with the register and the create form still usable; no serious or critical axe findings. Screenshots written by that run: `docs/screenshots/00h-notations-inspector-desktop.png`, `00h-notations-inspector-mobile.png`, `00i-notations-relation-inspector.png`.

**Verified over a mocked API** (`NotationWorkspace.inspector.test.tsx`, 5 tests, with the earlier 13 unchanged): the inspector following the selection with origin, relations, pending commands and the evidence line; Escape honoured outside text fields only; relation creation from the inspector and relation inspection; arrow keys, Home and Enter; the empty and disabled register; the four shortcuts with their conditions; `Saving…` and the status text while a save is in flight.

**Not done.** No platform detection for key hints. No multi-selection. No relation editing or deletion, because the kernel has no such command. Evidence references remain the fixture panel; the inspector's evidence line states that attachment is disabled by the backend contract.

## Reconciliation with the backend's draft stabilization (2026-09-05)

The backend branch stabilized the same workflow from its side: a root draft provider, a required `capacity` on the snapshot, previews refused at the version ceiling, strict snapshot validation, and tests for in-flight requests across navigation. The merge kept one implementation. The provider architecture and the capacity contract are the backend's; the tab's `sessionStorage` copy with kernel re-validation, the stale-draft and conflict panels, the inspector layout and the keyboard are this frontend's. The leave dialog was removed: with the draft retained in the document, interrupting navigation protected nothing, so the rail's `draft` marker and the browser's own unload prompt carry that duty. Both test suites pass unmodified in their assertions except where they named the dialog or the earlier capacity shape.
