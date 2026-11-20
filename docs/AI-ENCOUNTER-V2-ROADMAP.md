# AI / Encounter V2 — next engine handoff (2026-11-20)

## Decision

The owner accepts Lighting V2's current appearance as **DONE FOR NOW**, with future polish and named-device endurance explicitly deferred. The new active player-facing track is **Enemy AI + Encounter V2**, starting with [A11-01 #433](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/433), linked to existing Hunt encounter task [H08-07 #170](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/170).

Lighting V2 remains implemented and live as PR #431 / `2c424d4`. Outstanding shadow-art polish, desktop freeze evidence, and iPhone/Android 10-minute/thermal gates belong to #380, #379, #430 and R10-02. **This is a scoped acceptance to move on, not an assertion that the Lighting engine is fully accepted or production performance-complete.**

## Engine boundaries

| Owner | Responsibility |
| --- | --- |
| AI V2 | Pursuit, steering, obstacle response, perception/line-of-sight, pursuit intent |
| Encounter V2 | Wave schedules, enemy counts, encounter win/loss objectives and threat escalation |
| Physics / Voxel V2 | Actual movement, support, overlap/collision, environmental edits and terrain revisions |
| World Objects V2 | Tree/boulder collider state and damage |
| World Generation | Safe, reproducible encounter locations and spawn layouts |
| Rendering / Lighting / VFX | Read-only visible feedback |
| Hunt gameplay host | Compose the owners using public contracts, with stable saves |

## Next four concrete tasks

1. **A11-01 [#433](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/433)**: bounded deterministic local pursuit that detours around actual rock/tree colliders after repeated authoritative blocked movement. Use existing `simulateTerrainActor`, no AI-only collision grid, terrain raycast loop, teleport or gameplay state mutation. The implementation begins in `src/ai/pursuit-steering.mjs`.
2. **A11-02**: independently versioned read-only spatial sensor and local path candidates, especially after Fireball destroys a barrier. Resolve physical 10 cm shelves without inventing a secondary heightfield; deterministic allocation and navigation budget.
3. **A11-03**: enemy intents and archetypes (Hollowed, Ashling, Penitent) with telegraphed attacks and separation; Encounter retains timed wave/horde ownership. First on-screen combat experience drives tuning; not an arbitrary 50-type enemy roster.
4. **A11-04 / A11-99**: Wyrm corruption escalates encounter patterns, bounded 10-minute mobile acceptance, replay/streaming and dependency/coupling audit. Finish a real seeded Hunt without enemy ghosting, unsignaled damage or gameplay stalls.

## Extended enemy roster and phased encounter design (owner input, 2026-11-20)

The next slices must support regular melee/ranged creatures with instinctive pursuit, tactical packs, fear/rout and retreat; rare affix variants of **every eligible regular enemy** at low configurable odds; separate optional Reliquary events, guardian Wardens and full multi-stage Wyrm bosses. All remain readable, deterministic, and mobile-first.

**Canonical detailed architecture and source-backed V1 retrospective:** [Enemy AI/Encounter extensibility and V1 lessons](AI-ENCOUNTER-V2-EXTENSIBILITY-AND-V1-LESSONS.md) · [A11-ARCH #436](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/436).

- Keep **archetype/role**, **behavior sophistication/temperament**, **rarity variant**, **encounter category/phase**, and **world context/Wyrm tier** independent. Don't translate them into one "enemy tier."
- AI consumes earned observations and emits actions only. Combat commits telegraphed attacks; Physics/Voxel/World Objects own movement, collision and edits; Encounter owns composition, rare rolls, pack roles and boss-phase restrictions.
- Reuse V1's clear elite affixes, phase transitions and limited simultaneous combat pressure as **design lessons**, not runtime code. Explicitly avoid V1's species-state-heavy actor, all-seeing player position, input-reading Whitefang and effectively non-generalized pack grouping.
- Continue **A11-02 #435 first**. A11-03 covers composable archetype/intent/attack contracts, A11-04 pack/morale/corruption escalation, proposed A11-05 generic rare variants, proposed A11-06 authored special encounters and phased Wyrms, then A11-99 acceptance. These future labels are planning, not completion claims.

## A11-01 acceptance

- Real seeded Wet Forest horde still completes the existing 4/7/10 enemy schedule.
- A target behind a real 3m Voxel obstruction is approached by **sidestepping around** without entering solid cells, changing terraforming rules or duplicating collision authority.
- AI detours use the actual `wallContact` and position delta from committed Physics. World revision invalidates steering immediately. No additional terrain queries are performed by the AI decision module.
- At most 16 actor steering records, deterministic no-random decisions, and bounded time and memory per fixed step; no extra per-frame WebGL/Canvas resources.
- CI covers independent steering, real Voxel obstacle fixture, existing horde integration, and all game tests, shaders and checks. Validate Play Hunt game / Pages build and preserve concurrent Water changes.
- Named iPhone Safari and Android Chrome horde-performance p50/p95/p99, 10-minute thermal and player feel remain **open** until measured.

## How to continue

Read `AGENTS.md`, `docs/DELIVERY-TASKS.md`, this document, GitHub issues #170/#433 and current `main`; never use a stale branch from Lighting. After the A11-01 PR is merged, ship a real Hunt test link and state the exact commit and acceptance gaps. Then A11-02 is the **single** next task. Don't reopen Lighting visual polish unless a regression blocks this engine's tests.
