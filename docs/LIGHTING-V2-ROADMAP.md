# Lighting V2 — remaining milestones and continuation handover

Updated 2026-11-18. Current technical focus: L10-08 #377 mixed-consumer lighting and generic shadow casters (#401); the previous #396/#400 point/static visibility slices are merged, pending device acceptance; deferred iPhone side-area regression #391 remains streaming-owned. Tracking: [L10-90 #381](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/381).

## Outcome and current truth

The goal is a grounded, beautiful, readable and smooth actual Hunt on mobile and desktop. Contact and directional shadows, physical local occlusion, and matched sprite/terrain emissive sampling are implemented previews. They are not yet accepted on sustained iPhone/Android play; the engine is not complete or performance-accepted.

| Existing work | State and remaining limit |
| --- | --- |
| L10-01 #352 | Contract/renderer foundation DONE FOR NOW |
| L10-02 #354 | Local cliff shading/lava spill implemented; height-field approximation and device gates remain |
| L10-03 #367 | Dark ambient and moving/fading Fireball lights implemented; initially unshadowed |
| L10-04 #369 | Water/foam and Canvas Wizard/props/trees consume ambient/transient lights; sprite lava/static emission from the same 24x24 physically occluded terrain field was added in L10-08 #405. Multi-height sprites #408 and static fluid-emission receivers #412 are merged previews; real-device/visual acceptance remains |

Latest lighting implementation: PR #371, afdfe4ccc6df0df6ef9738defc534c2180c5748c; 825 combined tests, shader compilation and deployment passed. Main has subsequently incorporated WAT-14c. Fetch current main before working. Do not reset main to the lighting SHA.

The separate desktop stress run [44325848715](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44325848715) timed out on screenshot capture, with multi-second frames also reported while water drawing/meshing was disabled. Its cause is unresolved. This is neither phone performance evidence nor proof that Lighting or Water caused/fixed the stall. Preserve the parallel Water owner's diagnostic work.

## Ordered milestone issues

These are linked milestone-tracking issues. They are not native GitHub Milestone containers: the connected GitHub tool cannot create those containers. This file and Delivery Tasks are the canonical cross-chat roadmap.

| Order | Task | Player-visible result | Start gate |
| --- | --- | --- | --- |
| 1 | [L10-05 #374](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/374) — Ground trees and props with terrain-aware contact shadows | Trees, boulders and logs sit visibly on the ground instead of floating. | IN PROGRESS — reviewable contact-shadow implementation pending visual/device acceptance |
| 2 | [L10-06 #375](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/375) — Directional tree-canopy and cliff shadows | Sun/sky direction casts canopy and real Voxel cliff-face shadows with camera occlusion; merged PR #395, player/device gates pending | IN PROGRESS after L10-05 |
| 3 | [L10-07 #376](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/376) — Occlude Fireball and lava light against terrain | Generic physical occluder providers + shared terrain/Canvas point-light visibility in PR #396; static lava and device gates still outstanding | IN PROGRESS after L10-06 |
| 4 | [L10-08 #377](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/377) — Coherent sprite, terrain and fluid lighting | Generic caster/stability #401, shared emissive terrain/sprites #405 and generic three-height sprite cutout lighting #408 merged; fluid receiver parity implemented via #412; matched scenes and mobile evidence remain | IN PROGRESS after L10-07 |
| 5 | [L10-09 #378](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/378) — Biome atmosphere and combat readability | Calm uncorrupted forest transitions coherently through mountain and corruption stages into a dark, emissive Wyrm lair. | L10-08 |
| 6 | [L10-10 #379](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/379) — Sustained smoothness and adaptive lighting quality | Smooth movement and responsive casting through dense forest, shadows, cliff destruction and emissive lair combat, including a deliberate lower-cost tier for slower devices.. | Starts measurement with L10-05; final gate after L10-09; coordinates with R10-02 and parallel Water diagnostics |
| 7 | [L10-99 #380](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/380) — Lighting closure, coupling audit and next-engine handoff | Freeze a coherent, grounded, readable and smooth Lighting V2 slice so future chats can move to the next engine without losing known limits.. | L10-05 through L10-10 and existing L10-02/03/04 review gates |

Measure from the first task; performance is not a final polish step. L10-10 starts baseline collection during L10-05 and completes sustained acceptance after the visual slices. Each issue contains its own deliverable, boundary, dependencies, tests, performance gates and Done for now condition.

## Current subtask: real Hunt terrain normals — [L10-08-NM #418](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/418)

After build `462754d`, the owner identified that the Wet Forest still looks flatter than expected. Source inspection confirmed that normal-map samplers and lighting code exist but the playable Hunt uploads **no normal tiles**; moreover, procedural-albedo faces reject independently available normal tiles. This is a focused **L10-08** integration step before L10-09 atmosphere, not a new parallel engine.

[Contract, scope and acceptance](LIGHTING-TERRAIN-NORMAL-MAPS.md): activate preliminary 64px grass/earth/rock tangent normals from existing materials, supply correct physical wall basis, shade sun/Fireball with detail normals, retain all actual shadow and geometry ownership, compare same-seed `terrainNormals=off` against default on, gate on real mobile cost and user aesthetic review. Do not claim art-approved normal maps or phone acceptance from a passing browser test.

## 2026-11-19 — owner-requested visual finishing pass (#430)

The owner still sees flickering trees/stones, round stamped canopy shadows and an overly gloomy uncorrupted Wet Forest on iPhone. The current [tracked visual finishing work](LIGHTING-V2-VISUAL-FINISH.md) separates physical rooted contact from elongated foliage silhouette casting, adds bounded per-prop temporal irradiance stability, and derives a **bright healthy forest → progressively corrupt Wyrm lair** Lighting-only atmosphere from World Map data. This extends L10-08/09 and begins the L10-10 mobile acceptance review. Green browser/unit tests do **not** mean an accepted lighting engine. Maintain L10-99 closure gate pending sustained iPhone and Android visual/performance review.

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
2. Current technical task **L10-08 #377**. L10-05 through L10-07 have merged code but retain named-device and player-review gates. Continue actual Hunt mixed-scene lighting and generic caster integration without reopening old milestone implementation work unless a verified blocker demands it.
3. Use the chosen issue's acceptance gate. Ship a reviewable slice, run meaningful regression/dependency/actual shader checks, measure cost and update issue/docs with evidence and limitations.
4. Merge through a normal PR; verify public build stamp, HTML and changed modules after Pages deployment. Provide the stable [Play Hunt](https://pjotrcasteel.github.io/Wyrmforge-V2/play-hunt.html) link as the primary entry; immutable build copies can be useful only while verified available.
5. Keep automated, desktop and named-device acceptance separate. User approval of direction does not imply sustained performance acceptance. Do not repeatedly ask the user to restate already recorded requirements.
6. At L10-99, audit coupling/resource lifecycle, freeze the accepted scope, list optional future work, and hand off to exactly one next owning-engine task. R10-01 atmosphere and R10-02/R10-03 release gates remain separate.

## Scope stops

Optional global illumination, volumetrics, reflections, many shadowed lights and a full day/night cycle are not required for the current scoped handoff. Revisit an engine later when a concrete game requirement warrants it. Do not extend the roadmap indefinitely with effects that lack a player-visible purpose or measurable budget.



## 2026-11-18 L10-08 walking-shadow stabilization checkpoint

[PR #401](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/401) merged at `bd5e1e4`, preserving Water #399/#400 current main. The player reported shadows switching on/off while walking toward/farther from trees. Two verified code paths caused popping: shadow receivers were wrongly culled with caster sprites at screen edges, and FIFO receiver cache eviction churned warm casts. Receiver and sprite culling are now independent, hot shadow entries use bounded LRU (128 casters, same 16 rays/frame / 1,100 draw stamps/frame), and sprite tint misses reuse nearest warmed crop tint. True physical volume and sprite-cutout casters are both read-only generic descriptors; external object systems register a `shadowCasters(view)` provider once. All 894 tests, six shaders, and actual Hunt directional/contact browser witnesses passed on the PR head. **iPhone Safari walking and named-device cost approval remain outstanding**, as does full L10-08 lava-to-sprite/prop and material lighting consistency. See #377 and #375 for exact evidence; serve users the stable `/Wyrmforge-V2/play-hunt.html` link rather than an ephemeral build SHA.


## 2026-11-18 L10-08 shared static emission integration

[PR #405](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/405) merged to main as `f86d172`, based on Water WAT-16 #404. Lighting now carries a Materials-authored RGB emission descriptor in the same 24x24 geometry-occluded irradiance field. WebGL terrain and Canvas trees, props, rocks and wizard use that same completed, epoch/revision-qualified field in the same frame. The CPU sprite read is constant-time (four existing texels), with no added terrain rays, Voxel/Water writes or textures; `?spriteEmission=off` is a separate same-build negative control. Exact-head V2 CI [44407111133](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44407111133) passed **902/902** tests and six shaders. Existing Hunt directional/contact browser witnesses and Water lifecycle remained green. [Design and limits](LIGHTING-SHARED-EMISSIVE-SPRITES.md).

Owner's 26.8s iPhone recording on `e7ac51c` shows Wet Forest walking and streaming residency switching between 2–3 sites, with displayed p95 18–28 ms. This does not prove remaining flicker gone; named-device performance remains open. Continue L10-08 with multi-height tree/building lighting, fluid receivers, three-biome visual matching and device checks, then L10-09 atmosphere. Do not claim completion from CI alone.


## 2026-11-18 — L10-08 bounded three-height sprite relighting

[PR #408](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/408) merged as `9baebb6f` on latest `main`, preserving Water WAT-17 #406. Tall tree/any future building cutouts are split into three contiguous source and destination crops, sampling lighting at three physical world heights. Existing material-owned lava emission, transient spell visibility and ambient all flow through the same `lighting.sample(position)` consumer. No special-case tree name, no additional Voxel rays, no per-pixel full-screen readback or extra GPU texture. The combined tinted source area equals the old whole-sprite crop; cache remains ≤8 MiB and tint work ≤65,536 pixels/frame. Fall/damage and low-size fallback retain prior behavior. [Full slice documentation](LIGHTING-HEIGHT-BANDED-SPRITES.md). [PR head CI](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44410212039): 910/910 tests and six shaders; actual Hunt directional and contact witnesses passed. **This does not close real iPhone/Android visual or thermal performance gates**. Continue fluid Water/lava receiver parity and matched mixed-scene review, then L10-09 atmosphere.


## 2026-11-18 — L10-08 physical fluid lighting receiver parity

[PR #412](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/412) merged as `d405809903b00446abd1581b0fec784b4987382b` on latest main. The actual Hunt now supplies the **same completed, epoch/revision-qualified Lighting field** to WebGL terrain, Canvas sprites and independent raised Water V2 surface renderer. Lighting owns a shared GLSL static-emission sampler; fluid Rendering samples it at real mesh vertex heights and interpolates it across water caps, foam, waterfalls and parcels, without new rays or per-fragment field lookups. Molten material remains self-emissive rather than doubling its own static spill. Renderer retains one additional bounded 24×24 RGBA32F texture (9,216 bytes), updated on field identity changes and disposed on reset/context loss. The Water solver, persistence, Voxel state and World Objects remain unchanged; `?fluidEmission=off` is the visual negative control. [Technical handover](LIGHTING-FLUID-RECEIVERS.md).

**Automated evidence:** [PR CI run 44415613607](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44415613607) passed 916/916 tests, all shaders, syntax, audit and benchmarks; [contact witness](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44415613875), [directional witness](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44415613812), [Water browser witness](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44415613743), [connected river witness](https://github.com/pjotrcasteel/Wyrmforge-V2/actions/runs/44415613725) all succeeded. **Not accepted:** Water desktop long-run run 44415613577 timed out on a screenshot after ~4.5–5.3 s RAF intervals even without Water drawing/meshing; underlying stall belongs to cross-engine diagnostics, not proven caused/fixed by Lighting. No named iPhone/Android 10-minute performance or forest/mountain/scorched matched-view approval yet.

**Next single Lighting task:** L10-08 mixed-scene comparison and mobile review on current Pages build, including `fluidEmission=off` same-seed difference and generic tall-object/shadow movement; then L10-09 biome atmosphere, followed by L10-10 sustained quality and L10-99 coupling audit.
