# Wyrmforge V2 — Delivery Tasks (canonical cross-session backlog)

**Updated:** 2026-11-13 · **Owner's guiding decision:** every engine task must produce an observable improvement to a playable Wyrmforge Hunt and have a measured, regression-tested performance impact.
**Canonical milestones:** [ROADMAP.md](ROADMAP.md) · **Hunt definition:** [ADR-0002](architecture/ADR-0002-hunt-expeditions-and-journey.md).
**Current focus:** **H08-01 — player review and device acceptance of Play Hunt**.
**Latest integrated technical baseline:** PR [#141](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/141), commit `27b1c02`. This is a multi-region *generator* baseline, **not a playable Hunt**.

## How to use this in every chat / PR

1. **Read this file first**, together with the relevant ROADMAP milestone. Treat user corrections as task changes; do not invent a new competing engine roadmap.
2. Identify the **active task ID**, its visible deliverable, blockers and acceptance tests. State that ID at the start of the work; don't silently switch to another task.
3. Implement the smallest integrated slice that moves the player-visible Hunt forward. Existing V2 engines are dependencies, **not independent product destinations**. Keep labs for diagnosis only.
4. Run unit/integration/regression/performance checks; deploy a dedicated playable route and collect **actual user/mobile evidence** when acceptance calls for it. Update the task's evidence, blockers and status as part of the PR.
5. At handover, report exactly: task IDs completed, current build/PR, playable link, measured metrics vs baseline, open defect, and next **one** task. A future chat may continue using just an ID and this file.
6. **Add/split/reorder/retire tasks freely**, but keep old IDs immutable once used in a PR or chat. Mark obsolete tasks `SUPERSEDED by <ID>` with rationale; never recycle IDs. New IDs append within their milestone family.

**Use task IDs in branch names, PR titles/descriptions and commits** (`H08-01: ...`) for traceability. GitHub Issues are optional mirrors; **this tracked file is the source of truth**, so context survives disconnected chats and branch merges. A branch or open PR is evidence of *work*, never evidence of acceptance.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `READY` | Scoped; dependencies exist; implementation can start. |
| `IN PROGRESS` | Code being implemented or reviewed; not necessarily merged. |
| `IMPLEMENTED` | Merged + CI green; device / experience acceptance still outstanding. |
| `NEEDS PLAYER REVIEW` | Deployed to a usable link; awaiting hands-on experience verdict. |
| `ACCEPTED` | All specified player, correctness **and** performance gates evidenced. |
| `BLOCKED` | A named unmet dependency or reproducible defect prevents progress. |
| `PLANNED` | Future scoped work; do not preempt the active focus. |
| `SUPERSEDED` | Replaced by another stable task, with an explicit link/reason. |

Every task needs a **player-visible effect**, a **technical boundary**, a **test or measurable gate**, and a **proof link**. If a task is purely technical, it must explicitly name the playable task it unblocks.

## V2.0–V2.7 — Voxel foundation (supporting milestones, not a second game)

The original foundation milestones are in ROADMAP.md. Existing V2 core, 10cm microvoxels, collision, editing, worker meshing, camera and replay are real working foundations; **complete V2.7 device acceptance is not yet established**. Do not repeat all lab milestones as new games.

### F07-01 — Foundation acceptance evidence on the actual Hunt
- **Status:** `READY` (parallel recurring check, never blocks first playable movement unless it reveals a critical defect)
- **Delivers:** reliable real-device Voxel V2 baseline with a moving player in a generated Hunt, not a static 10-minute lab.
- **Dependencies:** H08-01.
- **Gate:** iPhone Safari and Android Chrome report build, route, seed, p50/p95/p99 frame intervals, >33/50/100 ms hitches, terrain memory/queue peaks, responsive controls, context-loss recovery and observed defects. No phone evidence = not accepted.
- **Evidence:** none for the new playable Hunt yet; older standalone Voxel measurements are contextual only.

### F07-02 — Terrain edits, collision and replay in the moving Hunt
- **Status:** `PLANNED`
- **Delivers:** Wizard can destroy a local obstacle and immediately walk through the same physically edited terrain; save/restore reproduces it.
- **Dependencies:** H08-01, H08-02.
- **Gate:** zero ghost collider, no desynchronized meshing or stale reply, deterministic replay through a region transition, bounded per-frame edits.
- **Evidence:** existing Voxel V2 lab edit/ledger code; **game integration open**.

## V2.8 — First playable Hunt (current integrated milestone)

The first goal is a **walkable Wet Forest expedition**. A Hunt is not accepted because a diagnostic viewer can generate several regions. Missing enemies, objectives, trees and lighting must **not block movement-first playtests**. Each task thereafter improves this **same page/session**.

### H08-00 — Seed-stable multi-region expedition geometry
- **Status:** `IMPLEMENTED` (technical only; not experience-accepted)
- **Delivers:** 11–14 geographically connected Hunt regions, world-coordinate voxel definitions, protected 7m ports, investigation/horde/extraction location descriptors.
- **Evidence:** [PR #141](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/141), `27b1c02`, 531 automated tests; preview loads one region at a time. **No continuous player travel yet.**

### H08-01 — PLAY HUNT: walk the Wet Forest on phone and desktop **← ACTIVE**
- **Status:** `IN PROGRESS` — work branch `feat/playable-hunt-exploration-slice`; no accepted release.
- **Player experience:** one tap opens a **Play Hunt** page, spawns a visible Wizard-sized proxy on physically generated Wet Forest ground; use a touch joystick or WASD/arrow keys to walk without active jump; fixed north-up Hunt camera follows the character. Inspect slopes, scale, collision and routes. Respawn/reset is straightforward.
- **Technical boundary:** reuse real Voxel V2 terrain, actor physics, WebGL mesher and existing worker/upload queues. The proxy is explicitly temporary; no V1 code, second physics store or offscreen-only mock.
- **Gate:** repeatable seed, supported spawn, no walking through or floating inside terrain, touch gesture release + app-switch handling, visible current region and real frame p50/p95/p99/hitch stats, unit tests and first hands-on iPhone review. No claim of full Hunt exploration before H08-02.
- **Evidence:** [PR #143](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/143), merge \`a1960ce\`, 536 automated V2 tests green and Pages deployment successful. [Play the one-region Wet Forest preview](https://pjotrcasteel.github.io/Wyrmforge-V2/play-hunt.html?v=a1960ce). Browser-local frame timing is displayed; physical iPhone/Android frame reports and hands-on feel are **still unknown**. Requires acceptance or defect report before status \`ACCEPTED\`.

### H08-02 — Walk seamlessly between regional boundaries
- **Status:** `READY` after H08-01.
- **Player experience:** walk through multiple Wet Forest regions without a level-selection menu, teleportation into cliffs or a full-world reload.
- **Technical boundary:** bounded region activation/prefetch and unload around player, one authoritative Voxel V2 occupancy/edit authority, 7m physical seams, stable world coordinates and local edit persistence. Do not instantiate eleven concurrent independent VoxelWorld authorities.
- **Gate:** physical actor crosses ports both ways; previously edited ground survives unload/revisit; no duplicate/seam colliders; bounded chunks, peak memory and camera/render updates. Record loading and stall metrics.
- **Evidence:** H08-00 generator seams only; streaming runtime not yet built.

### H08-03 — Natural regions and readable traversal
- **Status:** `PLANNED`
- **Player experience:** walk a varied forest with wide trails, glades, natural elevation transitions, choices and non-arbitrary boundaries; not generic 32m squares.
- **Technical boundary:** WorldGen V2 terrain/route grammar. Voxel V2 remains the source of collision/destruction.
- **Gate:** representative fixed seeds, reachable optional detours and exits, camera readability and no impassable one-metre ledges on primary paths. Check generation, chunk seams and movement performance.
- **Dependencies:** H08-02.

### H08-04 — Deterministic tree and boulder placement contract
- **Status:** `READY` for design; integration after H08-02.
- **Player experience:** recognizable forest groves, clear natural pathways, rock clusters and readable open horde spaces.
- **Technical boundary:** WorldGen owns stable object descriptors (ID, kind, material, scale, footprint, seed), slope/moisture/clustering rules and exclusions. **World Objects V2** owns actual instances, collider/destruction and visuals. No random standalone decorations that block passage.
- **Gate:** identical seed/revision = same placements; changed seed varies organically; no object overlaps, blocked entry, horde floor or required exit. Profiling baseline before adding instances.
- **Dependencies:** H08-02, H08-03.

### H08-05 — Physical trees, large rocks and fallen logs in Play Hunt
- **Status:** `PLANNED`
- **Player experience:** walk around giant rocks and between tree trunks, use cover and see scale. Trees and rocks can be destroyed with later spells; initial static collision must be real.
- **Technical boundary:** replaceable World Objects V2 instance API, Voxel V2 terrain grounding + object collider authority, proper renderer integration; simple temporary meshes/sprites until art approved.
- **Gate:** hundreds of instances with bounded draw/collision budgets, no invisible walls or trunk/rock ghosts, persistent IDs across region unload/revisit; physical mobile frame metrics.
- **Dependencies:** H08-04, H08-02.

### H08-06 — Exploratory ruins, secrets and investigations
- **Status:** `PLANNED`
- **Player experience:** find an abandoned camp/ruin, discover evidence, take optional detours, uncover a cache by breaking terrain, return to the route.
- **Technical boundary:** spatial placement from WorldGen; objects/interaction and clue meaning owned by Gameplay/Narrative. No hardcoded fake objective rewards in terrain.
- **Gate:** player can reach and interact with planned locations, detours do not force narrow combat tunnels, deterministic save/resume; mobile readability.
- **Dependencies:** H08-03, H08-05.

### H08-07 — Enemy waves and Horde Hunt pacing
- **Status:** `PLANNED`
- **Player experience:** Hollowed and the tier's other enemies arrive in increasing numbers; movement, cover and terrain matter rather than a static target range.
- **Technical boundary:** independent Encounter/AI spawning and movement consumers; WorldGen defines usable spawn spaces, never AI decisions.
- **Gate:** representative ambush/horde workloads on the actual page, no AI standing in blocked rock or 10cm terrain discrepancies; per-device p95/p99, memory/queues and responsiveness checked.
- **Dependencies:** H08-02, H08-05.

### H08-08 — Wizard magic and physical destruction during Hunt
- **Status:** `PLANNED`
- **Player experience:** Fireball and spells break trees/rocks/ground during exploration or hordes, opening or changing paths.
- **Technical boundary:** gameplay commands via Voxel V2 edit ledger and World Object V2 damage; one collision truth, worker meshing and effects as derived consumers.
- **Gate:** repeated hits and burst edits stay replayable, collision updates immediately, no ghost geometry, consistent frame and edit-to-visible latency.
- **Dependencies:** F07-02, H08-05, H08-07.

### H08-09 — Extraction, upgrades and cross-Hunt journey continuity
- **Status:** `PLANNED`
- **Player experience:** complete a Hunt, leave via its real extraction, keep rewards/upgrades and choose the next World Map Hunt; clues and biomes connect coherently toward the Wyrm.
- **Technical boundary:** World Map / Gameplay own story graph, progression and persistent state; WorldGen owns geographical constraints.
- **Gate:** reproducible 3+ Hunt journey with valid transitions, preserved save/state and nonrandom narrative evidence.
- **Dependencies:** H08-06, H08-08.

### H08-10 — Dedicated miniboss and Wyrm expeditions
- **Status:** `PLANNED`
- **Player experience:** real large natural lairs inside wider Hunt adventures with approach and escape spaces, destructible geology, fissures and eventually credible lava falls.
- **Technical boundary:** specific geographic identities already prototyped; actual lava, VFX and boss behavior belong to separate owner systems.
- **Gate:** player can maneuver in physically generous arena, traverse approaches, fight/escape and interact with physical hazards; not simply a 64m static diagnostic bowl.
- **Dependencies:** H08-03, H08-07, H08-08.

### H08-11 — First integrated Hunt experience acceptance
- **Status:** `PLANNED`
- **Player experience:** coherent Wet Forest Hunt with exploration, meaningful scenery, enemies, destruction and extraction on phone.
- **Gate:** end-to-end reproducible Hunt + real iPhone Safari and Android Chrome metrics, no blocking visuals/collision faults; player approves feel. Does **not** imply V2.9 gravity or production cutover.
- **Dependencies:** H08-01 through H08-09.

## V2.9 — Structural gravity (required after first integrated playable Hunt)

### G09-01 — Authoritative bounded falling clusters
- **Status:** `PLANNED`
- **Player experience:** supported arches, cliffs and stone shelves collapse plausibly after destruction.
- **Gate:** bounded connectivity work; never one rigid body per voxel; no duplicate terrain/object collision; verified in the playable Hunt.
- **Dependencies:** H08-08.

### G09-02 — Falling-material physics and persistence
- **Status:** `PLANNED`
- **Player experience:** debris falls/settles or fractures without breaking actor collision or replay.
- **Gate:** cross-region, reset, save/replay, mobile frame and memory evidence.
- **Dependencies:** G09-01, H08-02.

## V2.10 — Integrated quality and reversible release

### R10-01 — Replace placeholder art and add atmosphere by actual Hunt scene
- **Status:** `PLANNED`
- **Player experience:** recognizable magical forest → fading wilds → volcanic approach → Wyrm, consistent authored art, lighting and VFX.
- **Gate:** visual owner approval, proper pixel scale, no terrain/material drift, performance in the playable Hunt. No requirement to block initial walking prototype.
- **Dependencies:** H08-11.

### R10-02 — Full Hunt stress, crash and thermal acceptance
- **Status:** `PLANNED`
- **Player experience:** smooth controls and no stutters even under spell/ambush/destruction loads.
- **Gate:** sustained iPhone Safari/Android Chrome sessions; frame p50/p95/p99 and hitch count, edit-to-visible, CPU/GPU queue/memory, restart/replay/context-loss, explicit device baselines.
- **Dependencies:** H08-11, G09-02, R10-01.

### R10-03 — Controlled Wyrmforge V2 production cutover
- **Status:** `PLANNED`
- **Player experience:** V2 becomes the accepted game path with rollback; existing V1 production playable until verified.
- **Gate:** all production V2.10 checks and player approval; reversible deployment.
- **Dependencies:** R10-02.

## Current session handover template

Use this short form in every next chat (fill from current verified repo state):

> **Game goal:** a playable mobile Wyrmforge Hunt; all engines serve it.  
> **Canonical tracker:** `docs/DELIVERY-TASKS.md`; milestones: `docs/ROADMAP.md`.  
> **Active task:** `H08-01` Play Hunt movement (not accepted).  
> **Latest merged foundation:** PR #141, `27b1c02`.  
> **Next deliverable:** playable Wet Forest page with movement, follow-camera, real Voxel collision and frame metrics.  
> **Do not pivot:** do not start a standalone World Objects, Lighting or boss lab while this remains unplayable.  
> **Acceptance:** validate correctness, experience **and** actual device performance separately.
