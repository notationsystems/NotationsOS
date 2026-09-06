---
title: "Earth Twin (CesiumJS)"
status: "PRESENT · KEYLESS · OFFLINE"
group: "Projection Fabric — representations, APIs and instruments"
tags:
  - architecture-map
  - fabric/projection
---

# Earth Twin (CesiumJS)

**State:** `PRESENT · KEYLESS · OFFLINE`  
**Group:** Projection Fabric — representations, APIs and instruments  
**Map:** [[Payload OS Architecture]]

> A CesiumJS globe served from this origin with bundled imagery on the WGS84 ellipsoid, computed day and night at the twin's world time, and one point per geodetic position declared as a corpus record; the inspector names every layer's source and state.

## What it is

- Twenty-one world-signal registry entries are listed as NOT_INTEGRATED.
- Camera view is a link hash; verified asset package pinned by digest.

## Where it lives

- `src/domain/earth.ts`, `src/earth/`, `src/components/earth/EarthTwin.tsx`
- `/earth`; `scripts/earth-assets.mjs`
- `docs/EARTH_TWIN.md`

## Boundaries

- No manufactured carrier locations; nothing is drawn without an evidence-backed position.

## Connects to

- → [[Inquiry instrument pages]] — /earth
- ← [[Projection spec and compiler]] — GLOBE spec, declared positions

## Open questions

- [ ] What is the first evidence-backed geography beyond declared positions: a Samsara trace, a facility footprint?

## Notes

_Brainstorm here._
