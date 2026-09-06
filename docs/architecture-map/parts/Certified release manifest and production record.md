---
title: "Certified release manifest and production record"
status: "COMMITTED · UNSIGNED"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Certified release manifest and production record

**State:** `COMMITTED · UNSIGNED`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[Payload OS Architecture]]

> Each release carries a manifest (build, release digest, record count, retractions applied, sources with rights, certification, governance) whose commitment is the digest of its canonical JSON, and a production record across the twelve stages.

## What it is

- Manifests parse under the control plane's vendored `notations.result-manifest.v1` parser; commitments are stamped and drift-tested.
- The production record shows each stage's status with a glyph and label, never a single score.

## Where it lives

- `src/fixtures/releaseManifest.ts`, `src/fixtures/manifest.ts`
- `src/components/corpus/ProductionRecord.tsx`
- `npm run stamp:digests`

## Boundaries

- Committed, not signed (V2 absent).

## Connects to

- → [[Corpus feed API v1]] — manifests and commitments
- ← [[Corpus object model]] — certified release
- ← [[Sibling repositories and vendored contracts]] — vendored parser pins the contract

## Open questions

- [ ] Which stage statuses should be machine-derived from rail receipts instead of authored?

## Notes

_Brainstorm here._
