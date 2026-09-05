# GAT audit fixtures

These are synthetic demonstrations, not acquired customer building records,
certified models, Payload admissions, or released domain-corpus fixtures.

`supported-demo.ifc` is an exact LF-byte copy of `gat/demo/model.ifc` from
`https://github.com/notationsystems/BIM-State-Transformer-Engine` at commit
`80272f94107cce4f70c81e57915800b04c5944a6`.

| Fixture | Bytes | SHA-256 |
|---|---:|---|
| `supported-demo.ifc` | 7358 | `8faa1d97998e084d57c0a96c01a35210a76372472ec9c716012ceeb3f9caac3a` |
| `unsupported-missing-width.ifc` | 7362 | `8446f2aab4c9905681b820dd7af2d3437622f70a2b85ccfa8a2739e511d81a33` |

The unsupported variant makes exactly the mutation used by the upstream
`tests/test_ifc_audit.py` missing-quantity test: STEP instance `#111` names its
quantity `Thickness` instead of `Width`. No dimensions are fabricated. The
original source repository was not changed.

The accompanying `.audit.json` files are original compact GAT report bytes from
the pinned local adapter, Python 3.12.14 / NumPy 2.3.5 / Windows x64. The adapter
uses the controlled source basename `source.ifc`; this is not a user or host
path. They demonstrate 10 ready supported products and, respectively, one
missing required Width with blocked lowering. Raw report diagnostics are kept
for artifact inspection; frontend responses use the separate safe projection.

IFC bytes are kept LF by the scoped attributes file so Windows checkout does not
change the pinned demonstration inputs. Re-running GAT is optional for ordinary
unit tests; `GAT_INTEGRATION=1` explicitly enables native integration checks.

## Upstream license

MIT License

Copyright (c) 2026 Notation Systems

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
