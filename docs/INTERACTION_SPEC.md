# Interaction specification

Describes the behaviour that exists. Tests in `src/**/*.test.tsx` and `tests/e2e/` assert the points marked with a check number.

## Status transitions

Statuses: `DRAFT → EVALUATING → PENDING_EVIDENCE | ADMITTED | ADMITTED_WITH_CONDITIONS | REFUSED`, then `SUPERSEDED` (replaced by a later ruling) or `REVOKED` (reliance withdrawn after release). Every status renders as glyph + label + colour token, and the scoped meaning is available in the title and, where the status is prominent, as visible text (`STATUS_SEMANTICS` in `src/domain/selectors.ts`). Colour is never the only channel [T1].

- `DRAFT` says nothing has been evaluated. Intake can save a draft without pretending otherwise.
- `PENDING_EVIDENCE` names the artifacts that would let evaluation complete (`InvariantResult.missingEvidence`).
- `REFUSED` reads: "Not admissible for this declared use, tolerance, evidence state, knowledge cutoff and profile version. Refusal is not a finding of falsity or misconduct." The ruling viewer repeats that sentence under every failed check [T2].
- `SUPERSEDED` and `REVOKED` rulings are never removed: the rulings list, the revision rail and the supersession chain keep them, and the viewer opens them with a banner that links to the current ruling [T5].

## Refusal interaction

A refusal is a product object, not an error. `error.tsx` renders application failures without a status, an invariant or a remediation and says so.

1. The decision rail lists failed checks first, then blocked (not evaluated, evidence missing) checks, then conditions, then next actions, then use scope, time basis, profile, assurance, manifest, and finally every check grouped by authority class.
2. Selecting a failed check highlights the affected claims in the left rail ("affected"), the inspected artifacts ("inspected"), the broken lineage edges (stated in text under "Broken lineage") and the permitted remediations [T7].
3. The check's full record shows identifier, title, authority class, automatic vs reviewer-entered, status, refusal code, summary, reason, materiality, affected claims, evidence inspected, evidence missing or contradictory, reviewer identity and basis when reviewer-entered, evaluation time, disclosure class with the public statement, and remediation with whether resubmission is allowed.
4. Remediation actions: Request evidence, Replace evidence, Correct claim, Change use, Change tolerance, Appeal, Resubmit. Each produces an action intent. Reviewer intervention requires a selected authority, a reason and a basis of at least twelve characters before "Record intervention" enables; there is no Override control [T-override].
5. Disclosure: each result carries a disclosure class; results narrower than the viewer collapse to their public statement; INTERNAL_ONLY findings never reach a sponsor or counterparty [T6].

## Bitemporal replay

`/replay/:caseId` holds a knowledge-time cutoff. Changing it (date-time input, a slider over the case's knowledge instants, Earlier / Later / Present buttons, or the instant list):

- filters evidence, claims and events to those with `knownAt ≤ cutoff`;
- selects the ruling that was current at the cutoff, with the status it carried then (a ruling later superseded shows as it stood) [T4];
- shows a persistent textual banner: "Viewing this case as it was knowable on 2026-08-27 09:10 UTC. Later evidence and corrections are hidden: N evidence, N claims, N rulings, N events.";
- keeps three clocks separate: **World state valid on** (unchanged by replay), **Information known on** (the cutoff), **Ruling issued on** (the applicable ruling's issue time) [T-clocks];
- offers "Then versus now": a `RevisionComparison` between the applicable ruling and the current one.

## Supersession

A superseding ruling carries `supersedesRulingId`; the superseded ruling carries `supersededByRulingId`, `temporalBasis.supersededAt` and status `SUPERSEDED`. The event log records the `SUPERSEDED` transition and the `RULED` event records the status the ruling carried before the transition, which replay reads back. `RevisionComparison` puts two rulings side by side (status, use, tolerance, both clocks, issue time, expiry, profile version, assurance, evidence considered, conditions, manifest commitment, and every automatic check) and marks changed rows with the word "changed" [T5].

## Visibility classes

`INTERNAL_ONLY < PRIVATE_PREFLIGHT < COUNTERPARTY_SHARED < PUBLIC_RULING`; `DELAYED_AGGREGATE` is never shown per case. A viewer at class V sees objects at V or wider (`visibleClassesFor` in `selectors.ts`). Applied to claims, evidence, events, lineage nodes, rulings, invariant results (with public-summary reduction) and party private notes [T6]. The workspace's "Withheld at this visibility" line and the viewer's "N artifacts withheld" line state counts only.

## Every value exposes its basis

`ClaimValueView` shows value, unit and basis on one line and expands (native `<details>`, state announced by the browser) to basis, uncertainty with its semantics, world-state time, knowledge time, source artifact, evidence class on all three axes, and transform.

## Every time identifies its clock

`fmtUtc` renders `YYYY-MM-DD HH:MM UTC`. Labels are always one of: World state valid on, Information known by / on, Submitted, Evaluated, Ruling issued on, Released, Reliance ends, Superseded, Revoked, Captured by producer. The words "Date", "Updated" and "As of" do not appear as labels [T3].

## Keyboard and accessibility

Skip link is the first tab stop; the primary nav uses `aria-current`; every selectable row is a `<button>` with `aria-pressed`; grouped controls use `role="group"` with labels; tables have `<th scope>`; scroll containers are focusable; the workspace grid collapses to decision rail → centre → structure on narrow screens with each landmark intact; `prefers-reduced-motion` disables transitions; the print stylesheet gives the ruling a light background. axe (WCAG 2.2 AA tags) reports no serious or critical violations on the queue, the workspace and the ruling viewer [E-axe]; the mobile ruling viewer does not scroll horizontally [E-mobile].

Check numbers: T1–T7 in `src/components/**/*.test.tsx` and `src/domain/selectors.test.ts`; E-axe, E-mobile and the keyboard walk in `tests/e2e/smoke.spec.ts`.
