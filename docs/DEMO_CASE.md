# Demonstration cases

## Which fixtures are used

`src/fixtures/caravan/` holds one admission profile and seven cases, all `fixture_only: true`, all deterministic, all committed with sha256 digests in `src/fixtures/digests.json` (`npm run stamp:digests` recomputes them; `src/fixtures/digest.test.ts` fails on drift).

| Case | Status | What it demonstrates |
|---|---|---|
| `CASE-CAR-7C104` Specialty Cargo Lot 7C-104 | **REFUSED** (rev 2), rev 1 PENDING_EVIDENCE superseded | The brief's example: lot identity does not reconcile across certificate NIS-4418 (sample S-4418, no lot id), the claimant's own custody log (lot 7C-104, sampling event, no sample id, interest `self_reported`) and bill of lading BAL-77812 (lot 7C-104). CAR-101 fails BLOCKING; CAR-105 is not evaluated because it depends on CAR-101; the quantity, certificate-timing, custody-gap and producer-independence checks pass. Three remediations: amended certificate, independent custody record, resubmit. A private contract (PRIVATE_PREFLIGHT) and an internal reviewer note (INTERNAL_ONLY) exercise disclosure. |
| `CASE-CAR-5B221` Specialty Cargo Lot 5B-221 | **ADMITTED_WITH_CONDITIONS** (rev 2, PUBLIC_RULING), rev 1 ADMITTED superseded | Use changed from indicative offer (±2 %) to provisional settlement (±0.5 %); the carrier draft survey was replaced by a terminal weighbridge ticket that was captured on 2026-08-17 but only became knowable on 2026-08-25. Two conditions, a named reviewer approval (assurance HUMAN_REVIEWED, manifest `partially_verified`, anchor internal), reliance ends 2026-09-15. |
| `CASE-CAR-9A017` | PENDING_EVIDENCE | Laboratory report missing for an insurance declaration. |
| `CASE-CAR-3F440` | REVOKED | Admitted for an insurance declaration, then revoked when the producer withdrew the certificate. Revocation is stated not to be a finding about the cargo. |
| `CASE-CAR-8D902` | DRAFT | Saved, never submitted, no knowledge cutoff declared. |
| `CASE-CAR-2E118` | ADMITTED | Reliance ends 2026-09-04, three days after the fixture clock; the queue shows it as nearing expiry. |
| `CASE-CAR-6C305` | EVALUATING | Submitted, evaluation not complete. |

Fixture clock ("now"): 2026-09-01 12:00 UTC. Queue "changed since": 2026-08-31 12:00 UTC.

## Why the fixtures are synthetic

The industry profile is commercially provisional. Every party (Harbourline Brokerage, Meridian Origination, Northgate Inspection Services, Blue Anchor Lines, Castellan Metals, the port custody operator, the terminal weighbridge, Reviewer R-02), every identifier, quantity, moisture value, timestamp and hash is invented. The commodity is described only as "specialty cargo, demonstration class SC-3". No real certificate, bill of lading or custody record was used or redacted.

## The demonstration profile

`caravan.brokerage.specialty-cargo` version `0.3.0-demo`, register digest computed over its fifteen invariants (five core distribution, six domain profile, four governance policy). Its recognition statement says it is not accredited, regulated or externally recognized, and the profile viewer prints that statement before the register. Every invariant's implementation state is `beta` or `experimental` (the control plane's maturity vocabulary); none is `production`.

## What the case demonstrates

A broker relying on facts produced by others can open the case, see the subject, the declared use and tolerance, the valid time and the knowledge cutoff, the claims and the evidence with their classes and hashes, the ruling with its scoped meaning, the exact invariant that failed and why, the remediation that would clear it, the assurance class with what is and is not available, the manifest commitment, the relying-party projection of the same bundle at counterparty and public visibility, the superseded ruling side by side with the current one, and the case as it was knowable at any earlier instant.

## What remains commercially unvalidated

- The domain rules (CAR-101 to CAR-106), their thresholds (14-day certificate window, 6-hour custody gap, 0.5 % settlement tolerance) and the use codes are placeholders for a real brokerage profile.
- The assurance-class mapping from substrate facts is a recorded presentation policy, not an agreed doctrine (see `docs/PHASE0_RECON.md`, ambiguities).
- No customer, counterparty, inspector or regulator has reviewed any of it. Nothing here is certified, accredited, cryptographically verified or externally witnessed, and every screen that could imply otherwise says which of those is not available.
- The Tradewind and Landshark verticals exist only as disabled module slots.
