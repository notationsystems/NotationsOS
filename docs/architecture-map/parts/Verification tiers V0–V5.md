---
title: "Verification tiers V0–V5"
status: "V0, V1 REACHED"
group: "Doctrine and governance (applies to every layer)"
tags:
  - architecture-map
  - layer/doctrine
---

# Verification tiers V0–V5

**State:** `V0, V1 REACHED`  
**Group:** Doctrine and governance (applies to every layer)  
**Map:** [[Payload OS Architecture]]

> V0 provenance and V1 deterministic reproducibility are reached. V2 signed releases, V3 independent recomputation, V4 execution attestation and V5 formal proof are not, and are stated so.

## What it is

- Digests, captures, manifests, the production demonstration and projections regenerate under test (V1).
- Commitments exist (`sha256(canonicalJson(manifest))`) but nothing signs them (V2 absent).
- Verification today is internal recompute and is named as such (V3 absent).

## Where it lives

- `src/domain/doctrine.ts` (`VERIFICATION_TIERS`)
- `docs/ARCHITECTURE.md` — Verification tiers

## Boundaries

- A recomputed digest is not independent verification.

## Connects to

- (no drawn flow yet; add one)

## Open questions

- [ ] What is the smallest step to V2: a signing key policy, a release signer, or a manifest countersignature by a second process?
- [ ] Which customer would value V3 first, and on which corpus?

## Notes

_Brainstorm here._
