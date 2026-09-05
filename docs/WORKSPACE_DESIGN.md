# Workspace design: one shell, one inspector pattern, two slices

Payload OS is one workspace, not a set of pages. This document records the design language, the interaction pattern every surface shares, the two slices built on it so far, the truths the design is not allowed to bend, and the verification receipt. Everything here is present tense: what the code does today.

## The design language

Tokens live in `src/app/globals.css`; nothing else defines a colour, a size or a duration.

- **Type.** A seven-step scale (`--text-2xs` 10 px … `--text-2xl` 22 px) over a 14 px body. Values in mono sit one step below their label. Identifiers, digests and times are always mono; prose never is.
- **Space and surfaces.** Three depth levels: hairline surfaces (`.surface`, `.surface-inset`), `--shadow-1` for a panel that sits beside the page (the inspector), `--shadow-2` only for what floats. The 48 px top bar and the 232 px rail are the only fixed chrome.
- **Colour.** One accent (the Notation Systems gold) for selection and primary action. Status colours mean status and nothing else: passed, pending, conditional, refused. Text has four roles: heading, primary, secondary, muted.
- **Controls.** `.btn` with `-sm`, `-primary`, `-quiet`; rows that can be selected carry `.row-selectable` with `aria-pressed`, `aria-selected` or `data-selected`; keyboard hints are `.kbd`; first use is `.empty-state`.
- **Motion.** `--motion-fast` (120 ms) for controls, `--motion-base` (180 ms, ease-out) for a panel entering, `--motion-slow` (260 ms) for a one-off flash. Nothing animates while the system waits: progress is named in the status line, not spun. `prefers-reduced-motion` disables all of it.

## The shell

`src/components/shell/AppShell.tsx`: a skip link, the top bar (brand, where you are as area · page, the domain-product control), then the body: the one primary navigation as a left rail from 1024 px and a horizontal strip beneath the bar below that, and the main surface. Navigation is data (`nav.ts`): five activity areas over the unchanged routes and product names, Acquisition, Corpus, Notations, Inquiry, Coordination, each stating the activity it serves. The rail also carries what never changes on a screen: the domain product and what the data is.

## The interaction pattern

Every working surface is `.workspace`: a centre surface in two parts (`.workspace-top`, `.workspace-bottom`) and, when an object is selected, a contextual `.inspector` (`src/components/primitives/Inspector.tsx`). From 1024 px the inspector is a sticky column beside the surface, spanning both parts; below that it is an inline detail view directly beneath the top part, so whatever the top part is (a register, a table) stays in reach above it and the forms beneath it stay reachable. Nothing is modal. The inspector's heading takes focus on narrow screens when the object that opened it may be far away (`focusOnNarrow`), Escape closes it outside text fields, and closing returns focus to what opened it.

Selection connects views: a row pressed in a list, a button pressed on a card, a link followed from inside the inspector all set the same selection; the list marks the selected row and the inspector shows the object in context, with the actions allowed on it and a way to what it refers to.

## Slice one: notations (`/notations`)

Documented in [Notation workspace](NOTATION_WORKSPACE.md) under "Layout, selection and keyboard". In short: the register with each notation's identity, relation count and standing; the selected notation's inspector with its editor, its origin (created or changed in this draft and not saved, or in saved version N), its relations with direction, the pending commands that name it, and its evidence line; a relation's own inspector; keyboard undo, redo and save through the kernel; named progress; draft protection unchanged.

## Slice two: candidate production (`/candidates`)

The rail is shown as a process, read only from what it recorded:

- **Four stages**, collection, extraction, normalization, candidate readiness (`processStages` in `src/domain/production.ts`). Every metric carries the field of the demonstration it is read from (`data-source`, shown on hover) and every instant its clock (capture time as declared, record time, decision time, run time, knowledge time, knowledge cutoff, build time). Extraction and normalization are one recorded run on this rail; the stage says so instead of inventing a step.
- **Where coverage stops** (`coverageGaps`): INGEST-only registrations, quarantines and refused steps, each with what stopped, the remediation someone could take, and the field it is read from. The rail takes none of the remediations; the screen performs none.
- **The inspector** on any acquisition, normalization run, build or refusal: provenance as a sequence (`acquisitionSequence`, `normalizationSequence`, `buildSequence`) with each step's identity, exact digest, time and clock, done or refused; for a candidate, evidence beside record: the captured bytes' identity and digest against the candidate's, then field by field the value in the source and the value in the record with what the adapter did between them (`fieldMapping`: copied, trimmed, or missing and not inferred). The source bytes themselves appear only when a committed file has exactly the evidence's content digest (`readCommittedSources` in the adapter, matched on the server); otherwise an explicit unavailable state names the storage key this screen does not open. Nothing on this rail is authored, and the inspector says so.

## What the design does not bend

- Fixtures are identified on the surface (the fixture banner, `FIXTURE` markers), never implied by polish.
- No control is shown for an operation the backend has no contract for: evidence-reference attachment stays disabled with the reason; no remediation is a button.
- A preview is never presented as saved, a candidate never as admitted, a source never as verified: origin lines, `UNADMITTED`, `UNRESOLVED`, `canonical null` and the not-claimed lists are rendered from the records.
- Evidence and interpretation stay apart (the notation evidence panel), evaluation and verification stay apart (source truth and field accuracy are not claimed), refused is not false (refusals are records of their own with the rail's words), valid time and knowledge time are labelled as such.

## Verification receipt (2026-09-05)

**Shell and design system.** Typecheck, lint, `next build`, 112 regular Playwright tests at desktop and Pixel 7 (keyboard smoke test through the primary navigation, overflow guard on every page, axe), screenshots regenerated. Commit `9969ed5`.

**Notation slice.** 158 unit tests in the notations and app trees (5 new), 112 regular browser tests, 10 real-kernel tests (one new per viewport), screenshots `00h-notations-inspector-desktop.png`, `00h-notations-inspector-mobile.png`, `00i-notations-relation-inspector.png` written by the real-kernel run. Commit `03fae40`. Receipt in [Notation workspace](NOTATION_WORKSPACE.md).

**Candidate production slice.** `src/domain/production.test.ts` (3 new: stage metrics and gaps against the committed demonstration, sequences with labelled clocks and refusals, field mapping bound to the adapter's own contract); `src/components/production/CandidatePipeline.test.tsx` (4: stages sourced and gaps before selection, evidence beside record, unavailable bytes and refusal follow-through with focus return, INGEST-only stop and build sequence); `tests/e2e/candidates.spec.ts` at desktop and Pixel 7 (metrics all sourced, five gaps, the candidate opened as evidence beside record with the committed bytes, the page's own counts unchanged by the inspector, layout beside the surface on desktop and brought into view with focus on mobile, refusal and quarantine and INGEST-only states, no horizontal overflow, no serious or critical axe findings, Escape). The existing candidates smoke test and the production separation test pass unchanged. Whole suites: 1063 unit tests, 114 regular browser tests, 10 real-kernel tests, screenshots including `00e2-candidates-inspector.png` and `11-candidates-inspector-mobile.png`.

**Not done.** The inspector pattern is on two surfaces; cases, rulings, releases and coordination keep their earlier layouts inside the new shell. Source bytes are shown only for evidence whose bytes are committed in `examples/`; the local object store is not read by the screen. No selection is carried in the URL, so an inspected object cannot be linked to directly. Key hints do not detect the platform.
