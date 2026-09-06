---
title: "Sibling repositories and vendored contracts"
status: "PINNED · READ-ONLY"
group: "Runtimes, local stores and verification"
tags:
  - architecture-map
  - layer/runtime
---

# Sibling repositories and vendored contracts

**State:** `PINNED · READ-ONLY`  
**Group:** Runtimes, local stores and verification  
**Map:** [[Payload OS Architecture]]

> The control-plane result-manifest and canonical-URI code is vendored verbatim from Notations-Ecosystem at a pinned commit, used only by tests. Notations Kernel and the Payload Terminal V0 prototype were audited read-only.

## What it is

- Every manifest this frontend builds must parse under the control plane's own `parseResultManifest`; digests of the vendored files are pinned.
- The source inventory is grounded in the prototype's `sourceRegistry.ts` at an exact blob.
- The GAT engine checkout is an isolated, detached copy under an ignored root.

## Where it lives

- `src/vendor/control-plane/README.md`
- `docs/CROSS_REPOSITORY_BASELINE.md`, `docs/SOURCE_INTEGRATION_INVENTORY.md`, `docs/ACQUISITION_GAT_MILESTONE.md`

## Boundaries

- The pin proves the copy matches its pin, not that the pin matches upstream.

## Connects to

- → [[Certified release manifest and production record]] — vendored parser pins the contract

## Open questions

- [ ] When does the corpus contract move from a vendored copy to a published package, and who owns the version?

## Notes

_Brainstorm here._
