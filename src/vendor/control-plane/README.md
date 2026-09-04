# Vendored control-plane contract code

Verbatim copies from `notationsystems/Notations-Ecosystem` at commit
`256e603e18e031ac5e2e1bfaf926075a9b0b8c14` (2026-09-02), path
`control-plane/src/`. They are used only by tests, to assert that every
manifest this frontend builds parses under the control plane's own
`parseResultManifest`, and that the canonical identities the fixtures use
are valid `notation://` URIs.

Digests are pinned in `src/fixtures/manifest.contract.test.ts`; editing a
copy fails the test rather than silently redefining the contract. As the
corpus contract's own README says of vendored copies: this proves the copy
matches its pin, not that the pin matches the current upstream.

| File | sha256 |
|---|---|
| governance/result-manifest.js | `315041ac785b2f9877f11296a5a7df1f62a2c8728ec6f120d3dfa79da796f621` |
| identity/canonical-uri.js | `2a3357d9e680fbdd5d62de4e01240be8596a59588fa69b162101a72f4877a36b` |
