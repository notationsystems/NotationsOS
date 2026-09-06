---
title: "Notation workspace"
status: "IMPLEMENTED · LOCAL AUTHORING"
group: "Application layer — the Payload OS workbench (Next.js)"
tags:
  - architecture-map
  - layer/app
  - fabric/state
---

# Notation workspace

**State:** `IMPLEMENTED · LOCAL AUTHORING`  
**Group:** Application layer — the Payload OS workbench (Next.js)  
**Map:** [[Payload OS Architecture]]

> Author, relate and preserve interpretations against the Rust kernel: drafts survive navigation and reload, three states told apart (unapplied, previewed, saved), undo and redo, conflict recovery, capacity, and an evidence-reference panel whose persistence waits for the backend.

## What it is

- The inspector shows relations and the evidence references a notation would carry.

## Where it lives

- `src/components/notations/NotationWorkspace.tsx`, `src/domain/evidenceReference.ts`
- `docs/NOTATION_WORKSPACE.md`

## Boundaries

- Authority does not move to the browser; the kernel validates and replays.

## Connects to

- → [[Admission authority]] — evidence references → admission contract (next)
- ← [[Notation state kernel (Rust)]] — loopback command API
- ← [[App shell, navigation and design system]] — Notations area

## Open questions

- [ ] Once exact authored evidence references persist, what does a notation need to become an admission candidate?

## Notes

_Brainstorm here._
