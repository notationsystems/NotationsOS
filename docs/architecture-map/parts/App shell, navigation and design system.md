---
title: "App shell, navigation and design system"
status: "IMPLEMENTED"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
---

# App shell, navigation and design system

**State:** `IMPLEMENTED`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> One shell: a top bar that says where you are, the domain-product control, five activity areas (Acquisition, Corpus, Notations, Inquiry, Coordination) declared as data, a center surface and an inspector pattern with responsive sheets.

## What it is

- Tokens: a type scale, three depth levels, one accent, status colours that mean status; motion restrained.
- Primitives are the stable semantic objects: status pills, assurance and visibility badges, three-axis evidence-class badges, digests, temporal-basis panels.

## Where it lives

- `src/components/shell/` (`AppShell.tsx`, `nav.ts`), `src/components/primitives/`, `src/app/globals.css`
- `docs/WORKSPACE_DESIGN.md`, `docs/UX_ARCHITECTURE.md`

## Boundaries

- Every surface says what is fixture and what is real.

## Connects to

- → [[Production path workspace]] — Corpus area
- → [[Notation workspace]] — Notations area
- → [[Case workbench]] — Inquiry area
- → [[Stable (agents and apparatus)]] — Coordination area

## Open questions

- [ ] Is five areas right, or does Inquiry split into investigation and instruments as it grows?

## Notes

_Brainstorm here._
