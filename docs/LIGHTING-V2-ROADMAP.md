# Lighting V2 — remaining milestones and continuation handover

Updated 2026-11-18. Current technical focus: L10-07 #376 generic point-light occlusion (#396) with physical collider providers; static lava visibility still outstanding; deferred iPhone side-area regression #391 remains streaming-owned. Tracking: [L10-90 #381](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/381).

## Outcome and current truth

The goal is a grounded, beautiful, readable and smooth actual Hunt on mobile and desktop. Trees currently lack grounding/cast shadows. Basic lighting is implemented; the engine is not complete or performance-accepted.

| Existing work | State and remaining limit |
| --- | --- |
| L10-01 #352 | Contract/renderer foundation DONE FOR NOW |
| L10-02 #354 | Local cliff shading/lava spill implemented; height-field approximation and device gates remain |
| L10-03 #367 | Dark ambient and moving/fading Fireball lights implemented; initially unshadowed |
| L10-04 #369 | Water/foam and Canvas Wizard/props/trees consume ambient/transient lights; whole-sprite sampling, cold-cache fallback and no sprite lava-field response remain |

Latest lighting implementation: PR #371, afdfe4ccc6df0df6ef9738defc534c2180c5748c; 825 combined tests, shader compilation and deployment passed. Main has subsequently incorporated WAT-14c. Fetch current main before working. Do not reset main to the lighting SHA.

The separate desktop stress run [44325848715](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44325848715) timed out on screenshot capture, with multi-second frames also reported while water drawing/meshing was disabled. Its cause is unresolved. This is neither phone performance evidence nor proof that Lighting or Water caused/fixed the stall. Preserve the parallel Water owner's diagnostic work.

## Ordered milestone issues

These are linked milestone-tracking issues. They are not native GitHub Milestone containers: the connected GitHub tool cannot create those containers. This file and Delivery Tasks are the canonical cross-chat roadmap.

| Order | Task | Player-visible result | Start gate |
| --- | --- | --- | --- |
| 1 | [L10-05 #374](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/374) — Ground trees and props with terrain-aware contact shadows | Trees, boulders and logs sit visibly on the ground instead of floating. | IN PROGRESS — reviewable contact-shadow implementation pending visual/device acceptance |
| 2 | [L10-06 #375](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/375) — Directional tree-canopy and cliff shadows | Sun/sky direction casts canopy and real Voxel cliff-face shadows with camera occlusion; merged PR #395, player/device gates pending | IN PROGRESS after L10-05 |
| 3 | [L10-07 #376](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/376) — Occlude Fireball and lava light against terrain | Generic physical occluder providers + shared terrain/Canvas point-light visibility in PR #396; static lava and device gates still outstanding | IN PROGRESS after L10-06 |
| 4 | [L10-08 #377](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/377) — Coherent sprite, terrain and fluid lighting | Wizard, trees, rocks, cliffs, water and lava look like they inhabit the same lit scene. | L10-07; L10-04 #369 |
| 5 | [L10-09 #378](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/378) — Biome atmosphere and combat readability | Calm uncorrupted forest transitions coherently through mountain and corruption stages into a dark, emissive Wyrm lair. | L10-08 |
| 6 | [L10-10 #379](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/379) — Sustained smoothness and adaptive lighting quality | Smooth movement and responsive casting through dense forest, shadows, cliff destruction and emissive lair combat, including a deliberate lower-cost tier for slower devices.. | Starts measurement with L10-05; final gate after L10-09; coordinates with R10-02 and parallel Water diagnostics |
| 7 | [L10-99 #380](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/380) — Lighting closure, coupling audit and next-engine handoff | Freeze a coherent, grounded, readable and smooth Lighting V2 slice so future chats can move to the next engine without losing known limits.. | L10-05 through L10-10 and existing L10-02/03/04 review gates |

Measure from the first task; performance is not a final polish step. L10-10 starts baseline collection during L10-05 and completes sustained acceptance after the visual slices. Each issue contains its own deliverable, boundary, dependencies, tests, performance gates and Done for now condition.

## Required quality and performance gates

These are provisional design budgets, not achieved guarantees. If measurement demands a change, record the tradeoff explicitly instead of quietly moving a target.

| Measure | Target / evidence |
| --- | --- |
| Supported whole-game tier | 60 FPS; frame p95 <=16.7 ms; document 17 ms display quantization |
| Slower-device tier | Explicit stable 30 FPS fallback; p95 <=33.3 ms |
| Incremental Lighting work | CPU p95 <=1 ms; GPU <=2 ms within the whole-game budget; valid timer measurement or report unavailable |
| Lighting retained resources | <=16 MiB including existing sprite tint cache; bounded queues/caster counts/rebuild work |
| Transient sources | Initially at most two spell lights; one directional shadow source; increase only with evidence |
| Tails and responsiveness | Report p50/p95/p99, >33/50/100 ms hitches and input/cast latency; no unexplained freezes or lighting-attributable >100 ms stalls after warm-up |
| Sustained evidence | At least 10 minutes on named iPhone Safari, Android Chrome and desktop Chrome/Brave; device/OS, viewport, render scale, battery/thermal context and exact build |
| Workload | Dense forest, sparse props, cliff/bank, water/lava, rapid level-scaled casts, destruction/collapse, streaming, cold/warm caches, background/foreground and context recovery |
| Integrity | Never skip committed edits, gameplay, physics, Water steps or save events to claim smoother rendering; no sustained memory growth or repeated quality oscillation |

Use matched lighting-on/off scenarios on the same build, seed and camera. Measure both incremental Lighting and total frame cost. Software GLES timings, green CI and short demos cannot close phone/thermal acceptance. File cross-engine defects with their actual owner; do not patch competing Water solver work in Lighting.

## Ownership and shadow correctness

- World Objects owns object identity, pose, physical grounding, damage and support loss. Lighting consumes public snapshots/change intent.
- Voxel owns occupancy, terrain revisions and spatial queries; no duplicate mutable terrain store in Lighting.
- Materials owns albedo, normals, roughness and emission. Lighting owns illumination, transport and occlusion. Rendering owns shadow/tint GPU/Canvas resources and final colour encoding.
- Water owns flow/amounts/connectivity and persistence. Lighting can shade its published surfaces, never change transport to obtain an effect.
- Hunt composes public contracts and spell light intent. Keep feature rules out of pure Lighting.

Contact shadows must land on real receivers rather than hang off cliffs. Canopy shadows must respect cutout silhouettes rather than opaque sprite rectangles. Directional/local shadows must handle receiver height, microvoxel shelves, destruction, falling/removal, residency, stale epochs/revisions and context restoration. Avoid acne, detached bases, shimmer, double-darkening and chunk seams. Generated overhangs remain gated by Voxel/Physics F07-04 #348; no silent enabling in Lighting.

Use bounded caster/receiver sets, cached work and measured quality tiers. Do not prescribe expensive techniques before cost/quality comparisons; no full-world traversal per frame, per-tree full-screen pass or unconditional per-pixel Canvas readback.

## How another chat continues

1. Read AGENTS.md, Delivery Tasks, this file and [#381](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/381). Fetch latest main and inspect concurrent PRs; preserve Water and other engine changes.
2. Start **L10-05 #374**. Establish reproducible matched baseline and implement restrained terrain-aware tree/prop contact shadows in Play Hunt. Directional canopy shadows follow as L10-06, not an excuse to skip grounding.
3. Use the chosen issue's acceptance gate. Ship a reviewable slice, run meaningful regression/dependency/actual shader checks, measure cost and update issue/docs with evidence and limitations.
4. Merge through a normal PR; verify public build stamp, HTML and changed modules after Pages deployment. Provide the stable [Play Hunt](https://pjotrcasteel.github.io/Wyrmforge-V2/play-hunt.html) link as the primary entry; immutable build copies can be useful only while verified available.
5. Keep automated, desktop and named-device acceptance separate. User approval of direction does not imply sustained performance acceptance. Do not repeatedly ask the user to restate already recorded requirements.
6. At L10-99, audit coupling/resource lifecycle, freeze the accepted scope, list optional future work, and hand off to exactly one next owning-engine task. R10-01 atmosphere and R10-02/R10-03 release gates remain separate.

## Scope stops

Optional global illumination, volumetrics, reflections, many shadowed lights and a full day/night cycle are not required for the current scoped handoff. Revisit an engine later when a concrete game requirement warrants it. Do not extend the roadmap indefinitely with effects that lack a player-visible purpose or measurable budget.

