# Request-bound failed-run inspection

This increment tightens the local production reader introduced in `355d384eb399709aae5a106f3253054c4e5ce98c`. It changes neither the company mandate nor any domain, fixture, admission, release, customer-workload or principal-capital boundary.

## Gap and implemented checks

Previously a rehashed `FAILED` receipt could pass generic shape/integrity checks while advertising an unrelated, independently valid artifact or an impossible completed-stage prefix. Validating the artifact's own digest did not establish that it belonged to this production request.

The reader now validates the operation-specific stage sequence and exact retained-output relationships before returning a saved run, an identical retry, or a catalog entry:

| Command | Permitted failed-stage sequence | Retained-output binding |
|---|---|---|
| Registration | `REGISTRATION` failed | No confirmed output reference; does not prove the configuration is absent |
| Capture | `CAPTURE` failed | At most the exact request-generated acquisition or matching unbound content digest/length |
| Normalize | `EVIDENCE_INSPECTION` failed; or completed evidence inspection → `NORMALIZATION` failed | No named source before inspection; afterward the exact requested acquisition, plus only this request's verified normalization if retained |
| Build | `CANDIDATE_ASSEMBLY` failed; or completed assembly → `BUILD_INSPECTION` failed | Exact ordered prefix of selected members; a retained generated build requires the complete member set and exact definition, purpose and original times |

Terminal failed stages always have empty stage-output lists. Retained outputs live in `run.outputs` and, where appropriate, completed upstream stages. Parser rejection remains a separate `QUARANTINED` outcome, not an invented `EXTRACTION FAILED` stage. INGEST/DERIVE/member-eligibility error codes cannot be moved to phases that do not perform those checks. Recorded capture/normalization policy denials are checked at their original operation time, not against a new current-time grant.

Existing published-then-failed normalizations/builds remain inspectable. A verified output retains its exact reference while the operation remains failed. If a published build cannot be verified during build inspection, the historical assembly stage can have no artifact reference only with explicit `additionalOutputRetention: UNCONFIRMED`; that is not a verified-build claim. The flag can also report uncertain discovery after an early lookup failure; it does not prove publication happened.

Missing/corrupt dependencies that caused an early failure are not required to become valid before the empty-output failure can be inspected. Registration may have published a configuration before lock cleanup failed: no confirmed reference is not evidence of absence. Transient filesystem errors are not rerun or independently proved from a receipt.

## Bench evidence and compatibility

The sibling Notations Kernel was inspected read-only at committed revision `c6d693613478f32e0b0d7dafe918d8e51274ffcc`. The working tree remained on `codex/payloados-0.7-baseline` with 53 modified tracked files and 74 untracked files; none were imported or edited.

Relevant committed sources:

- `src/evidence-capture-workflow.js`: `receiptShape`, `referencesExactly`, source-byte/receipt checks, and recomputed envelope check agreement.
- `src/authorized-acquisition-workflow.js`: exact source-policy/evidence/receipt participant closure and separately recomputed INGEST authorization.
- Their `test/*-workflow.test.js` tests: detached-reference verification, denied capture before storage, actual byte corruption and refusal to overwrite damaged storage.

The applied lesson is narrow: object integrity and request/closure membership are separate checks. No sibling implementation, Kernel Artifact/VerificationEnvelope schema or dependency was added. Payload's local `{id,digest}` records remain local and unadmitted; these checks are not authenticated origin or independent verification.

The existing `payload.production-run.v1` schema is unchanged. Valid saved failures continue to inspect and retry without mutation. Previously accepted inconsistent receipts now fail closed; the reader preserves their files and never repairs/re-signs them or reruns a production operation to hide the mismatch. No migration of real `.payload` history was performed.

## Verification

The new `src/production/failure-integrity.test.ts` starts from real local stores, produces genuine failed runs, modifies only a test receipt, recomputes its digest, and proves inspection plus identical retry reject unrelated outputs/impossible prefixes without executing capture/normalize/build or changing files. Positive controls cover policy refusal, wrong exact references, published-then-failed outputs, unreadable build inspection and registration publication followed by cleanup failure.

Run `npm run check` and `npm run e2e:production`. The latter runs the local Carrier HTTP path against temporary evidence history; the unchanged optional IFC check is enabled only with `GAT_INTEGRATION=1` and a bootstrapped pinned runtime. No live source acquisition, customer deployment, canonical admission, fixture mutation or managed workload is introduced.

Verified for this increment: `npm run check` passed TypeScript, ESLint, 29 Rust tests and 1,170 JavaScript/TypeScript tests across 53 files (six optional GAT tests skipped), including all 23 new failed-run integrity tests. With `GAT_INTEGRATION=1`, `npm run e2e:production` passed the production build, build-trace guard and both real HTTP workflows (Carrier and IFC). Existing operator evidence and coordination history hashes remained unchanged; the pinned GAT execution checkout remained clean.
