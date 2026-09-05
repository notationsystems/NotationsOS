# Cross-repository baseline audit

Audit date: 2026-09-05. This is a read-only dependency assessment, not a
compatibility declaration, dependency update, release approval, or production
readiness assessment. No sibling files were modified and no uncommitted code was
copied or pinned.

## Observed repositories

The sibling `../Notations Kernel` currently reports:

| Observation | Value |
|---|---|
| Branch | `codex/payloados-0.7-baseline` |
| Committed HEAD | `c6d693613478f32e0b0d7dafe918d8e51274ffcc` |
| Commit timestamp | `2026-09-03T11:58:17-04:00` |
| Modified tracked files | 53 |
| Untracked files, counted individually | 74 |
| Staged tracked files | 0 |

Counts came from `git status --porcelain=v1 --untracked-files=all`; HEAD and
branch came from Git, not an attachment. These are observations at audit time,
not a guarantee that another process has left the checkout unchanged.

The sibling's working-tree `AGENTS.md` and `PROJECT_CONTEXT.md` were read first,
followed by its owning product, API, provenance-platform and warrant-graph docs.
`PROJECT_CONTEXT.md` explicitly labels its newer work
`UNCOMMITTED_REFERENCE_WORK`. Its reported local test results therefore do not
establish the acceptance state of this exact committed HEAD. The working-tree
`docs/API_SURFACE.md`, `docs/PAYLOAD_API_PRODUCT.md` and
`docs/PROVENANCE_PLATFORM.md` are absent from that committed tree; so are paths
matching `src/caravan-*`. Their newer contract descriptions were not treated as
committed dependencies.

The committed `docs/REFERENCE_RELEASE_0_7.md` describes a reference milestone,
including incomplete production gates and a blocked SP1 gate. Its acceptance
instructions are not evidence that this audit executed those checks.

## Existing NotationsOS pin is different

[The test-only vendor README](../src/vendor/control-plane/README.md) identifies
`notationsystems/Notations-Ecosystem`, commit
`256e603e18e031ac5e2e1bfaf926075a9b0b8c14`, original directory
`control-plane/src/`. It does **not** identify the sibling Notations Kernel HEAD.
That commit could not be resolved in the sibling's local Git object database.

Both existing vendor hashes were recomputed after CRLF-to-LF normalization,
matching the rule in [the contract test](../src/fixtures/manifest.contract.test.ts):

| Vendored file | SHA-256, normalized LF |
|---|---|
| `governance/result-manifest.js` | `315041ac785b2f9877f11296a5a7df1f62a2c8728ec6f120d3dfa79da796f621` |
| `identity/canonical-uri.js` | `2a3357d9e680fbdd5d62de4e01240be8596a59588fa69b162101a72f4877a36b` |

Those tests cover result-manifest parsing and fixture `notation://` identity
syntax. They do not exercise Kernel acquisition, normalization, admission,
envelope dispatch, storage or authorization. A passing vendor hash cannot imply
compatibility between those systems, or with the authored-notation Rust state
kernel.

## Committed contract observations

The following observations use `git show <full-HEAD>:<path>`, not imports from
the mutable sibling checkout.

| Boundary | Committed contract and limitation |
|---|---|
| Canonical identity and bytes | `src/canonical.js` defines exact `{type,id,digest}` references and `sha256:` plus 64 lowercase hexadecimal digits. Entity digests cover canonical JSON without the entity's own `digest`; key/collection ordering uses UTF-16 string ordering. A reference is not a `notation://` URI and is not itself proof that the target exists or verifies. |
| Entity integrity | `src/kernel.js` admits four canonical types: `Artifact`, `Claim`, `Operator`, `VerificationEnvelope`. Exact entity shape plus digest integrity is separate from workflow verification. Timestamps use exact UTC milliseconds. |
| Evidence capture | `notations.binary-evidence.v1` and `notations.storage-receipt.v1` are Artifact payloads. They bind the byte digest, byte length, storage key, source ID and capture/storage times. Capture verification re-reads actual object-store bytes. Capture alone does not establish source-use authorization. |
| Authorized acquisition | `notations.authorized-acquisition.v1` binds source registration, source-use decision, evidence and receipt references. The decision must explicitly allow `INGEST` at capture time; the verifier recomputes the policy and byte-storage checks. |
| Normalization | `notations.normalized-evidence-record.v1` binds an authorized-acquisition envelope, extraction operator, normalized fields, missingness and both time axes. Its verification level is `PROVENANCE`; transformation execution, field accuracy and empirical source truth remain unclaimed. The newer `normalizeAuthorizedEvidence` contract and older compatibility adapter are not interchangeable records. |
| Corpus admission | `notations.corpus-admission.v1` requires a verified corpus build plus exact, unique normalized-record coverage, source-class and ontology agreement, and the nested acquisition/normalization proof closures. Its minimum verification level is `PROVENANCE`, with `sourceTruthClaimed:false`. A bare build digest is insufficient. |
| Independent recomputation | Scope-specific verifiers resolve exact references through `registry.resolve(reference)`; byte-bearing scopes also need an object store. `verification-router.js` dispatches by envelope scope. Neither a digest-valid envelope nor its declared `verdict` alone substitutes for recomputing the required checks. |

NotationsOS's [local candidate builds](../src/data-os/local-candidate-build.ts)
instead use `payload.local-candidate-build.v1`, `UNADMITTED`,
`LOCAL_DEVELOPMENT` and `OPERATOR_DECLARATION`, with false canonical-admission
and independent-verification claims. Their member references have local
`{id,digest}` contracts. They must not be relabeled as Kernel Artifacts,
VerificationEnvelopes or admitted builds. Authored notation nodes and manually
drawn relations also establish none of those claims.

Committed tests exist for byte corruption, detached proof transport, denied
acquisition before storage, explicit missingness, inflated truth claims, exact
admission coverage and source-class/ontology mismatches. Test source presence
is not a test execution result. This audit did not execute sibling code, run its
dirty working-tree tests, inspect a clean CI run, or certify the full dependency
closure.

## Exact sampled source identifiers

These SHA-256 values identify raw committed blob bytes at the full HEAD above.
They are audit observations, **not a new dependency lock**. Working-copy equality
was checked separately with CRLF normalized to LF. The table is not an exhaustive
transitive dependency manifest.

| Committed path | Git blob ID | SHA-256 | Working copy equals committed LF |
|---|---|---|---|
| `src/canonical.js` | `c22046b42766d36d77aacf304668b269929911d3` | `478c639dbb9c5ec979616fe7efdd85cd6cd6768a2c201c3bda96ec7c639e543d` | Yes |
| `src/kernel.js` | `e06fcc48fb2b71abc2787422b4e9d449df2dd297` | `22056e6ab4aab876e92b19e99bc62ee9b8f98a11f3df1264ed521d6c0fabd073` | Yes |
| `src/object-store.js` | `58f10508c598b9b37c730a92a565a5ac0627aed7` | `692d888b4163ef0d166c5866fc1643d745ff0c8b97193cdbe1647e68c8d75668` | Yes |
| `src/registry.js` | `802597b4921ea71604c8b450dbfa6512e56285f9` | `9934f62688ca88f1abc16bebbfe738346c86ff04944729699f323484e691dc8f` | Yes |
| `src/workflow-support.js` | `4a9df84f3b372f253c812141e74feedb4d0759f5` | `d1d4e098fa2ba1d063e04f267724d30740e597a620834b765263d2966af88890` | Yes |
| `src/source-policy-workflow.js` | `d504c33376af8100c661dae80a1bb4d126328e77` | `b3f5b3e83ffedbd169411bb4e91613a91a22d3fca9b4f6d41ecd1e6c7a903b92` | Yes |
| `src/evidence-capture-workflow.js` | `44a78a169b05ff3a48a28ece1ad8e66d91243294` | `ab9a6dacf23ce75f013393f953582e2d642921fab531dd4912d589bbb4c44b98` | Yes |
| `src/authorized-acquisition-workflow.js` | `2ac7135d405edc90b2d9b70dcbef69a82015da76` | `28b161ac70e8b3fa0f4bde66432cc26e076e15f3ef9eb604c9b10efdcb080419` | Yes |
| `src/evidence-normalization-workflow.js` | `dfffa5bca7e978dedf394f4fd1b41a1e1ca7bcbc` | `9324cb93008f330eefb370ecd05741e5390d32e2ab15cf35395b413f517b778f` | No |
| `src/corpus-workflow.js` | `f2d06dd27cd7f45b201deb466950ec133ad9e9d7` | `26ef1b608cd66cee21ca33054808f8136c80a8bffea00fa897471b748e87f974` | Yes |
| `src/corpus-admission-workflow.js` | `ad87066dec77994dc389e37e83ed9ecb4259612d` | `384ea08d5147547073be2247e7dcc6d931ae4bb6156ac10a263a65b503d09814` | No |
| `src/verification-router.js` | `f066b39c5229e231a9accf129a9129b75b1627ff` | `2128545af74f59a2e9d277ae479b5b5f9a107fa24827f1df0c4b03968711394c` | No |

In particular, importing the sibling normalization, admission or verifier module
from disk would not consume the committed code inspected here.

## Minimum boundary for a later Kernel-backed evidence-reference bridge

This section applies only if a later increment consumes cross-repository Kernel
machinery. Plain local Payload candidate/build links retain their existing
`{id,digest}` schema and namespace; they do not require migration to Kernel
Artifacts or conversion into `{type,id,digest}`. A local reference-only increment
can preserve the existing unadmitted boundary without introducing that dependency.

Before implementing a Kernel-backed bridge, select and review an immutable contract export or package
from a known commit, including the dependency closure actually used. The current
HEAD is a precise candidate for that review; this bounded audit does not qualify
it as a drop-in dependency or approve its newer uncommitted work.

The smallest Kernel-backed reference-only increment needs:

1. An exact typed `{type,id,digest}` target reference, preserving its digest and
   namespace. Any `notation://` display mapping must be explicit and must not
   replace the exact reference.
2. A separate exact VerificationEnvelope reference if verification is requested.
   A target reference, a proof-root reference and a source-byte digest are
   different objects; none may stand in for another.
3. A bounded resolver and response contract distinguishing unresolved, resolved
   entity-integrity and recomputed workflow evidence. Missing dependencies,
   unavailable bytes and unsupported scopes must remain explicit failures, not
   verified badges. Read-only reference presence is not source-record delivery.
4. If authorization or admission is displayed, the matching source-policy,
   authorized-acquisition, normalization, corpus-build and admission contracts,
   exact closure rules, time rules, operator/verifier identities and nonclaims.
   Otherwise the first increment must remain reference-only and unadmitted.
5. For a customer-facing resolver, caller/tenant-bound authorization and a
   separately reviewed delivery contract. Evidence references confer no current
   right to retrieve or redistribute source bytes. Raw bytes, storage locators
   and private policy material should not enter the authored-notation payload.
6. Conformance tests against the selected immutable export: canonical digest and
   Unicode ordering, detached references, wrong digest/type, absent targets,
   corrupt bytes, unavailable proof closure, denied source use, missing admission
   members, time mismatch and rejection of inflated verification/truth claims.

No evidence-reference bridge, Kernel admission integration, reviewed dependency
package, customer delivery boundary or production verification deployment was
established by this audit. The existing test-only vendor pins remain unchanged.
