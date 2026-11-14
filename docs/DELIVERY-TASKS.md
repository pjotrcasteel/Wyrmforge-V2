# Wyrmforge V2 — Delivery Tasks (canonical cross-session backlog)

**Updated:** 2026-11-13 · **Owner's guiding decision:** every engine task must produce an observable improvement to a playable Wyrmforge Hunt and have a measured, regression-tested performance impact.
**Canonical milestones:** [ROADMAP.md](ROADMAP.md) · **Hunt definition:** [ADR-0002](architecture/ADR-0002-hunt-expeditions-and-journey.md).
**Current focus:** **H08-01 — player review and device acceptance of Play Hunt**.
**Latest merged Play Hunt candidate:** PR [#143](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/143), commit `a1960ce`, one region (not yet player-accepted). The multi-region generator baseline is PR [#141](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/141), `27b1c02`.

## How to use this in every chat / PR

1. **Read this file first**, together with the relevant ROADMAP milestone. Treat user corrections as task changes; do not invent a new competing engine roadmap.
2. Identify the **active task ID**, its visible deliverable, blockers and acceptance tests. State that ID at the start of the work; don't silently switch to another task.
3. Implement the smallest integrated slice that moves the player-visible Hunt forward. Existing V2 engines are dependencies, **not independent product destinations**. Keep labs for diagnosis only.
4. Run unit/integration/regression/performance checks; deploy a dedicated playable route and collect **actual user/mobile evidence** when acceptance calls for it. **Apply the task-specific Done for now criterion; do not keep building an adequate engine.** Update evidence, blockers and status as part of the PR.
5. At handover, report exactly: task IDs completed, current build/PR, playable link, measured metrics vs baseline, open defect, and next **one** task. A future chat may continue using just an ID and this file.
   **Play Hunt release links must use the full commit-specific path** `https://pjotrcasteel.github.io/Wyrmforge-V2/builds/<full-40-character-sha>/play-hunt.html`, with the public HTML, module, build stamp and shader fetched/verified after deployment. A `?v=` query on the root Play Hunt page does **not** prove new JS modules were loaded.
6. **Add/split/reorder/retire tasks freely**, but keep old IDs immutable once used in a PR or chat. Mark obsolete tasks `SUPERSEDED by <ID>` with rationale; never recycle IDs. New IDs append within their milestone family.

**Use task IDs in branch names, PR titles/descriptions and commits** (`H08-01: ...`) for traceability. GitHub Issues are optional mirrors; **this tracked file is the source of truth**, so context survives disconnected chats and branch merges. A branch or open PR is evidence of *work*, never evidence of acceptance.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `READY` | Scoped; dependencies exist; implementation can start. |
| `IN PROGRESS` | Code being implemented or reviewed; not necessarily merged. |
| `IMPLEMENTED` | Merged + CI green; device / experience acceptance still outstanding. |
| `NEEDS PLAYER REVIEW` | Deployed to a usable link; awaiting hands-on experience verdict. |
| `DONE FOR NOW` | This task's explicitly scoped exit criteria are evidenced; stop building it and move on. |\n| `ACCEPTED` | Integrated milestone/release acceptance evidenced against its complete gates. |
| `BLOCKED` | A named unmet dependency or reproducible defect prevents progress. |
| `PLANNED` | Future scoped work; do not preempt the active focus. |
| `SUPERSEDED` | Replaced by another stable task, with an explicit link/reason. |

Every task needs a **player-visible effect**, a **technical boundary**, a **test or measurable gate**, a **Done for now condition**, and a **proof link**. If a task is purely technical, it must explicitly name the playable task it unblocks.

## Definition of Done — deliberately stop when the slice is good enough

**Completion is scoped to the task, not the engine's ultimate possibilities.**
A voxel engine can be *good enough for the current playable Hunt* even if it
could support more features. No task remains open just because more polish,
complexity, materials, performance tuning or future architecture is imaginable.

### Four separate decisions

| Decision | What it means | What it must **not** imply |
| --- | --- | --- |
| `IMPLEMENTED` | Scoped code merged and regression CI passed | Player approval, phone performance or an entire milestone are complete |
| `NEEDS PLAYER REVIEW` | A working, accessible build is ready for hands-on feedback | Silence counts as acceptance |
| `DONE FOR NOW` | The task's **written exit criteria** and necessary correctness/performance checks are met, with evidence. Freeze its scope and move on | The underlying engine is feature-complete or production-ready |
| `ACCEPTED` | A larger integration/milestone's specified end-to-end experience and device gates are evidenced | There can never be future iteration |

Use **`DONE FOR NOW`** for individual playable or enabling slices. Reserve
**`ACCEPTED`** for tasks that explicitly require full integrated acceptance
(e.g., H08-11, R10-02/R10-03). For a *pure foundation contract* (H08-00),
reproducible contract/regression evidence may be enough; it should not
require gameplay art or touch testing. For a *player-facing task*
(H08-01 onward), require that we can **actually experience the defined
change**, plus functional and performance evidence relevant to its scope.

### Required task closure checklist

- **Outcome:** the exact stated player-visible behavior exists in the
  *same Play Hunt route* (or an expressly named technical prerequisite
  exists and is integrated), without mock physics or hidden alternate worlds.
- **Correctness:** defined acceptance tests, boundaries, save/replay/seam
  checks **when relevant**, CI and deployed route are all verified. No known
  **blocking** regression for that specific experience.
- **Performance:** no unbounded work, critical new hitch or unacceptable
  regression versus the task's recorded baseline. Measure real phones for
  tasks claiming mobile experience. Don't reject a movement-only slice for
  the future full-horde 60fps target; don't call unmeasured performance
  “passed.” Missing evidence = review pending.
- **Owner review:** the user can try the delivered experience and explicitly
  approve or report a defect when a task calls for player feedback. A
  successful automated test or Pages deployment is not implicit approval.
- **Handover:** record commit/PR, playable link, tested device/seed and
  frame/queue results (or “not measured”), deviations, and the next task.
- **Stop rule:** once these gates pass, mark **`DONE FOR NOW`**, make no
  further improvements under that task, and continue to the next task that
  adds more to the Hunt. **Future polish is not a blocker.**

### Milestone stop lines (never confuse one engine with a finished game)

| Milestone | Enough to close this milestone | Not required for this milestone |
| --- | --- | --- |
| **Voxel V2 foundation (V2.0–V2.7)** | Its original correctness/contract/device gates are evidenced in the moving Hunt; terrain authority is stable and safe for dependent engines | World Object art, lava, complete boss behavior |
| **First Play Hunt movement (H08-01)** | User walks a single region comfortably and responsive input, correct collision and measured phone performance are acceptable | Full region streaming, enemies, objectives, trees, polished art |
| **First complete Hunt (V2.8 / H08-11)** | One actual Wet Forest adventure is traversable, populated and finishable, with tested game integration and mobile evidence | Production visual fidelity, hybrid gravity and launch readiness |
| **Structural gravity (V2.9)** | Player can see reliable bounded collapse/settling and verified collision/replay in the playable Hunt | Cinematic debris, every possible material reaction |
| **Production quality (V2.10)** | Required real-device endurance, regression, presentation, rollback and gameplay criteria pass | Hypothetical improvements without a user-validated benefit |

**Milestone closure requires its own acceptance evidence, not all possible
feature ideas and not just a sum of merged PRs.** If a new gameplay need
later requires extending an accepted engine, add a new dependent task with
a distinct ID. Keep the current playable build as the regression baseline.

### Reopening, splitting and scope changes

Reopen the same task **only** for a reproducible defect or a violated
*original* acceptance gate (e.g., ghost collision, unresponsive joystick,
crash, broken seam, severe measured regression, lost edits). Record an
issue/evidence link and return to `IN PROGRESS` or `BLOCKED`.
Otherwise create a **new stable task ID** for an improvement that belongs
to a later engine/experience milestone. Examples: richer wizard art,
trees in H08-05, ambient shadows in R10-01 and sustained ambush
performance in R10-02 must **not** indefinitely hold H08-01 open.
If playtesting invalidates a design assumption, explicitly amend the
task's exit criteria or supersede the task with rationale; never silently
expand scope, change IDs in existing PRs, or keep tuning “just in case.”

**Practical stop question, before every PR:** “If we merge and the user
can play this, which **specific** acceptance failure would justify another
iteration instead of starting the next task?” If no concrete failure can
be named, **stop working on that engine**.

## V2.0–V2.7 — Voxel foundation (supporting milestones, not a second game)

The original foundation milestones are in ROADMAP.md. Existing V2 core, 10cm microvoxels, collision, editing, worker meshing, camera and replay are real working foundations; **complete V2.7 device acceptance is not yet established**. Do not repeat all lab milestones as new games.

### F07-01 — Foundation acceptance evidence on the actual Hunt
- **Status:** `READY` (parallel recurring check, never blocks first playable movement unless it reveals a critical defect)
- **Delivers:** reliable real-device Voxel V2 baseline with a moving player in a generated Hunt, not a static 10-minute lab.
- **Dependencies:** H08-01.
- **Gate:** iPhone Safari and Android Chrome report build, route, seed, p50/p95/p99 frame intervals, >33/50/100 ms hitches, terrain memory/queue peaks, responsive controls, context-loss recovery and observed defects. No phone evidence = not accepted.
- **Evidence:** none for the new playable Hunt yet; older standalone Voxel measurements are contextual only.
- **Done for now:** Measured Play Hunt baselines exist for the required named devices with no uninvestigated critical input, frame or memory fault; retain future full-load optimization for R10-02.

### F07-02 — Terrain edits, collision and replay in the moving Hunt
- **Status:** `PLANNED`
- **Delivers:** Wizard can destroy a local obstacle and immediately walk through the same physically edited terrain; save/restore reproduces it.
- **Dependencies:** H08-01, H08-02.
- **Gate:** zero ghost collider, no desynchronized meshing or stale reply, deterministic replay through a region transition, bounded per-frame edits.
- **Evidence:** existing Voxel V2 lab edit/ledger code; **game integration open**.
- **Done for now:** Walk after a real terrain edit, observe immediate authoritative collision, unload/revisit and replay it; all covered by regression tests and bounded update measurements. Defer unrelated destruction effects.

## V2.8 — First playable Hunt (current integrated milestone)

The first goal is a **walkable Wet Forest expedition**. A Hunt is not accepted because a diagnostic viewer can generate several regions. Missing enemies, objectives, trees and lighting must **not block movement-first playtests**. Each task thereafter improves this **same page/session**.

### H08-00 — Seed-stable multi-region expedition geometry
- **Status:** `DONE FOR NOW` — scoped generator/seam contract completed; not a playable expedition
- **Delivers:** 11–14 geographically connected Hunt regions, world-coordinate voxel definitions, protected 7m ports, investigation/horde/extraction location descriptors.
- **Evidence:** [PR #141](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/141), `27b1c02`, 531 automated tests; preview loads one region at a time. **No continuous player travel yet.**
- **Done for now:** Multi-region deterministic plan, links and two loaded physical seam contracts pass tests; then **freeze the planning foundation**. Gameplay traversal belongs to H08-02, not a reason to endlessly extend this planner.

### H08-01 — PLAY HUNT: walk the Wet Forest on phone and desktop
- **Status:** `DONE FOR NOW` — player accepted continuation after verified 2.5D movement, camera improvement and real Fireball crater screenshot. Further terrain height readability and scale belong to their own tasks.
- **Player experience:** one tap opens a **Play Hunt** page, spawns a visible Wizard-sized proxy on physically generated Wet Forest ground; use a touch joystick or WASD/arrow keys to walk without active jump; fixed north-up Hunt camera follows the character. Inspect slopes, scale, collision and routes. Respawn/reset is straightforward.
- **Technical boundary:** reuse real Voxel V2 terrain, actor physics, WebGL mesher and existing worker/upload queues. The proxy is explicitly temporary; no V1 code, second physics store or offscreen-only mock.
- **Gate:** repeatable seed, supported spawn, no walking through or floating inside terrain, touch gesture release + app-switch handling, visible current region and real frame p50/p95/p99/hitch stats, unit tests and first hands-on iPhone review. No claim of full Hunt exploration before H08-02.
- **Evidence:** [PR #143](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/143), merge `a1960ce`, 536 automated V2 tests green and Pages deployment successful. [Play the one-region Wet Forest preview](https://pjotrcasteel.github.io/Wyrmforge-V2/play-hunt.html?v=a1960ce). Browser-local frame timing is displayed; physical iPhone/Android frame reports and hands-on feel are **still unknown**. Requires approval or defect report before `DONE FOR NOW`.
- **Resolved input blocker (2026-11-13):** the user explicitly confirmed the [PR #145](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/145) iOS Safari downward-joystick page-scroll fix **works**.
- **New deployment verification blocker (2026-11-13):** screenshot after [PR #147](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/147) displayed **old build `fc6ccc5`** and its reserved GLSL `patch` shader error, not the fixed `8781c5c` module. The old `?v=` root URL could still serve cached application code, and the immutable release packager omitted `play-hunt.html` entirely. **Never claim player verification from green CI or a query-string cache-buster.** [PR #148](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/148) adds the actual commit-specific Play Hunt snapshot and live public artifact verification.
- **Player review, build `6d24a77` (2026-11-14):** camera movement improved; one authored 40m site feels too short (H08-02), grass-to-grass elevation lacks visual readability (H08-01), and user explicitly requested tap-to-cast Fireball destruction. Real-device report: iPhone Safari, 833 frame intervals, rolling p50/p95/p99 17/23/33ms, two >33ms hitches, CPU work p95 1ms, 8 chunks, 284344 bytes voxel payload. This is the walking baseline, not a destruction benchmark. Add bounded world-height presentation contrast; pull forward **only the terrain-impact part of F07-02** into Play Hunt via the real existing screen ray, V2 terrain port, crater journal and localized remesh. H08-02 remains the next scale task; F07-02 persistence through streamed-region revisits remains open, as does H08-08 combat and object destruction. Do not replace the WorldGen source or start another renderer/lighting engine.
- **Camera stability blocker (2026-11-14):** on build `2360249` the player reports annoying up/down screen movement while walking. The camera directly followed the actor's physical Y every frame. The follow target now holds grounded elevation across airborne motion, ignores small height changes and eases real elevation changes; the actual voxel geometry, actor collider, and 2.5D projection are unaffected. The screenshot's p95 17ms is encouraging but does not prove camera stability. Retest on iPhone before closing H08-01.
- **2.5D gameplay camera correction (2026-11-13):** the user supplied screenshots of Wyrmforge's actual Hunt. **Our game is north-up, near-overhead, pixel-art 2.5D, not the diagonal Voxel WorldGen inspection view.** [PR #151](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/151) makes the actual Play Hunt default to the V2 `hunt` orthographic projection while retaining the original full 3D Voxel V2/WorldGen geometry, physical 10cm elevation, full material renderer and movement. The 3D inspection camera is diagnostic only. **Do not change voxel physics or replace generated geometry to achieve the intended 2.5D game camera.** Device visual/performance approval remains required, and final authored pixel-art objects/atmosphere belong to their separately tracked tasks.
- **Visual parity and physical collision blocker (2026-11-13):** the user compared actual Play Hunt `dc619ba` against the World Generation lab. The generator **was** connected (WorldGen v2.7.2, hash `wg2-eb0f9142`, 222 10cm tiles) but Play Hunt chose a different flatter `hunt` camera, used reduced-fidelity material shading and hid the world behind the always-open HUD. It also reported `Physics: actor-overlap` when walking. [PR #150](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/150) makes **Play Hunt default to the same WorldGen 3D camera and original material renderer**, screen-aligned joystick, collapsed diagnostics, and correct microvoxel horizontal physical sweeps instead of integer-boundary-only checks. User iPhone side-by-side and movement/performance review **still required**. This is a blocking H08-01 defect; do not close the task from automated tests.
- **Root cause / required pipeline (2026-11-13):** the user confirmed the verified immutable Play Hunt showed a flat green/brown 32m square despite prior Voxel V2 and World Generation V2 milestones. Audit confirmed that Play Hunt had forced the **separate simplified** `generateWorldExpeditionRegion()` rather than the established authored `generateWorldSite(createWorldSiteRecipe(...))` path. [PR #149](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/149) makes Play Hunt use the **same WorldGen Strategy/Builder/topology/road grading/10cm micro-surface output** as the WorldGen lab, followed by the real Voxel V2 loader, mesher, physics and renderer. Tests compare exact output equality and the spawned actor. **Do not regress this path** or bypass it with another independent heightfield. The remaining work is device approval and later true WorldGen-powered seamless expedition streaming.
- **Open visual and performance blockers (2026-11-13):** the same user then judged the current single 32m Wet Forest region **horrible-looking** and phone performance **unacceptable**. [PR #146](https://github.com/pjotrcasteel/Wyrmforge-V2/pull/146) adds actual soil paths, reduces redundant voxel/chunk loading and mobile fragment work, and offers an in-game JSON report export. **This is not a validated improvement until user review and real-device frame p95/p99 evidence.** The scene still lacks trees, rocks and meaningful forest scenery; record a separate World Objects task if visually necessary rather than endlessly tuning the base voxel shader.
- **Player acceptance (2026-11-14):** build `0962573` showed visible physical craters on iPhone and user said “Nice, continue.” Screenshot shows p95 17ms; no new exported impact performance report. Carry the prior walking baseline forward; do not infer sustained destruction performance.
- **Done for now:** Player can spawn, steer, collide and respawn **within one Wet Forest region** on iPhone with a follow camera; core tests are green and local/real-device frame evidence shows no blocking control or performance regression. Stop here; do not require streaming, trees, enemies, objectives, lighting or final Wizard art.

### H08-02 — Walk seamlessly between regional boundaries **← ACTIVE**
- **Status:** `IN PROGRESS` — H08-02A first connection; full streaming gate remains open.
- **Player experience:** walk through multiple Wet Forest regions without a level-selection menu, teleportation into cliffs or a full-world reload.
- **Technical boundary:** bounded region activation/prefetch and unload around player, one authoritative Voxel V2 occupancy/edit authority, 7m physical seams, stable world coordinates and local edit persistence. **Each streamed region must reuse the actual WorldGeneratorV2 site/geometry/micro-surface pipeline**; the existing prototype `generateWorldExpeditionRegion()` has its own simplified heightfield and is restricted to the diagnostic lab until replaced or adapted through the actual WorldGen contracts. Never substitute that fixture into Play Hunt. Do not instantiate eleven concurrent independent VoxelWorld authorities.
- **Gate:** physical actor crosses ports both ways; previously edited ground survives unload/revisit; no duplicate/seam colliders; bounded chunks, peak memory and camera/render updates. Record loading and stall metrics.
- **Evidence:** H08-00 generator seams only; streaming runtime not yet built.
- **Done for now:** Walk through a regional port and back without teleport/cliff collisions or whole-page reset; edits persist on revisit; chunks/memory/frame stalls remain bounded. Stop; no extra biome types needed.

#### H08-02A — First bounded connection between authored Hunt sites
- **Status:** `NEEDS PLAYER REVIEW` after code validation.
- **Delivers:** 40 × 88m continuous Wet Forest: original 40m WorldGen entry, independently authored 40m woodland-trail site (next northbound expedition role), 8m graded transition derived from the two actual boundary profiles. A single existing Voxel V2 loader, port and ledger own every voxel. No teleport, geometry replacement or second world. All original microtiles remain intact.
- **Boundary:** two sites resident at once, intentionally not full streaming; this bounded slice uses authored site extents rather than the older 32m diagnostic region spacing. H08-02B must extend the same composition contract to bounded streamed activation/unload, persistent edits and the complete expedition graph.
- **Gate:** actual actor walks across the seam both ways, earlier Fireball edits remain, source definitions remain unchanged, run/microtile/chunk budgets and mobile frame report are reviewed.
- **Done for now:** player accepts continuous travel and no blocking movement or performance regression; proceed to the streaming slice.

### F07-03 — Player recovery after destructive terrain (later)
- **Status:** `PLANNED` — requested by player on 2026-11-14; not part of the current connection task.
- **Delivers:** an unstuck action that relocates the player to a nearby verified safe, supported position if destruction traps them or leaves them falling out of the world. Prefer reachable safe ground and a last safe checkpoint; no full world reset or undoing destruction.
- **Gate:** validated collider/headroom, supported landing, preserved terrain edit ledger, no relocation inside solid voxels, no unlimited combat escape exploit. Exact cooldown/cost and rules are deferred to gameplay balancing.
- **Done for now:** recover from representative self-created craters with terrain edits intact, using the actual Voxel V2 occupancy queries. No new physics engine.

### H08-03 — Natural regions and readable traversal
- **Status:** `PLANNED`
- **Player experience:** walk a varied forest with wide trails, glades, natural elevation transitions, choices and non-arbitrary boundaries; not generic 32m squares.
- **Technical boundary:** WorldGen V2 terrain/route grammar. Voxel V2 remains the source of collision/destruction.
- **Gate:** representative fixed seeds, reachable optional detours and exits, camera readability and no impassable one-metre ledges on primary paths. Check generation, chunk seams and movement performance.
- **Dependencies:** H08-02.
- **Done for now:** A fixed seed set offers traversable glades, natural routes and alternative walkable paths without arbitrary square walls or blocking primary slopes; phone walkthrough is acceptable. Stop adding landform varieties until a new task calls for them.

### H08-04 — Deterministic tree and boulder placement contract
- **Status:** `READY` for design; integration after H08-02.
- **Player experience:** recognizable forest groves, clear natural pathways, rock clusters and readable open horde spaces.
- **Technical boundary:** WorldGen owns stable object descriptors (ID, kind, material, scale, footprint, seed), slope/moisture/clustering rules and exclusions. **World Objects V2** owns actual instances, collider/destruction and visuals. No random standalone decorations that block passage.
- **Gate:** identical seed/revision = same placements; changed seed varies organically; no object overlaps, blocked entry, horde floor or required exit. Profiling baseline before adding instances.
- **Dependencies:** H08-02, H08-03.
- **Done for now:** Seed-stable, clustered trees/boulders have unique instance descriptors, preserve routes and spawn/encounter spaces, and pass overlap/slope tests. Stop at placement *contracts*; do not build renderer/physics here.

### H08-05 — Physical trees, large rocks and fallen logs in Play Hunt
- **Status:** `PLANNED`
- **Player experience:** walk around giant rocks and between tree trunks, use cover and see scale. Trees and rocks can be destroyed with later spells; initial static collision must be real.
- **Technical boundary:** replaceable World Objects V2 instance API, Voxel V2 terrain grounding + object collider authority, proper renderer integration; simple temporary meshes/sprites until art approved.
- **Gate:** hundreds of instances with bounded draw/collision budgets, no invisible walls or trunk/rock ghosts, persistent IDs across region unload/revisit; physical mobile frame metrics.
- **Dependencies:** H08-04, H08-02.
- **Done for now:** The player walks naturally among real visible collidable tree trunks, rocks and logs on phone; object identity persists and representative instance counts satisfy frame/collision budgets. Stop; full destruction/final art belong to H08-08/R10-01.

### H08-06 — Exploratory ruins, secrets and investigations
- **Status:** `PLANNED`
- **Player experience:** find an abandoned camp/ruin, discover evidence, take optional detours, uncover a cache by breaking terrain, return to the route.
- **Technical boundary:** spatial placement from WorldGen; objects/interaction and clue meaning owned by Gameplay/Narrative. No hardcoded fake objective rewards in terrain.
- **Gate:** player can reach and interact with planned locations, detours do not force narrow combat tunnels, deterministic save/resume; mobile readability.
- **Dependencies:** H08-03, H08-05.
- **Done for now:** At least one traversable optional discovery and one investigation location work in Play Hunt, with interaction and save/restore, without blocking the main route. Stop; the full mystery/story progression belongs to H08-09.

### H08-07 — Enemy waves and Horde Hunt pacing
- **Status:** `PLANNED`
- **Player experience:** Hollowed and the tier's other enemies arrive in increasing numbers; movement, cover and terrain matter rather than a static target range.
- **Technical boundary:** independent Encounter/AI spawning and movement consumers; WorldGen defines usable spawn spaces, never AI decisions.
- **Gate:** representative ambush/horde workloads on the actual page, no AI standing in blocked rock or 10cm terrain discrepancies; per-device p95/p99, memory/queues and responsiveness checked.
- **Dependencies:** H08-02, H08-05.
- **Done for now:** An actual short horde sequence spawns and moves in Play Hunt, navigating physical space without ghosting, and representative phone frame/hitch data is collected. Stop adding enemy varieties until a task requires them.

### H08-08 — Wizard magic and physical destruction during Hunt
- **Status:** `PLANNED`
- **Player experience:** Fireball and spells break trees/rocks/ground during exploration or hordes, opening or changing paths.
- **Technical boundary:** gameplay commands via Voxel V2 edit ledger and World Object V2 damage; one collision truth, worker meshing and effects as derived consumers.
- **Gate:** repeated hits and burst edits stay replayable, collision updates immediately, no ghost geometry, consistent frame and edit-to-visible latency.
- **Dependencies:** F07-02, H08-05, H08-07.
- **Done for now:** At least one Wizard spell visibly damages terrain and a physical object, changes authoritative collision/pathing, and survives repeated hits and replay without unacceptable frame or edit latency. Stop; extra spell VFX/upgrades can follow.

### H08-09 — Extraction, upgrades and cross-Hunt journey continuity
- **Status:** `PLANNED`
- **Player experience:** complete a Hunt, leave via its real extraction, keep rewards/upgrades and choose the next World Map Hunt; clues and biomes connect coherently toward the Wyrm.
- **Technical boundary:** World Map / Gameplay own story graph, progression and persistent state; WorldGen owns geographical constraints.
- **Gate:** reproducible 3+ Hunt journey with valid transitions, preserved save/state and nonrandom narrative evidence.
- **Dependencies:** H08-06, H08-08.
- **Done for now:** Finish one Hunt, extract, retain its result and load the next seeded World Map Hunt with a coherent clue/biome transition; a 3-Hunt test path preserves progression. Stop at working integration, not an entire authored campaign.

### H08-10 — Dedicated miniboss and Wyrm expeditions
- **Status:** `PLANNED`
- **Player experience:** real large natural lairs inside wider Hunt adventures with approach and escape spaces, destructible geology, fissures and eventually credible lava falls.
- **Technical boundary:** specific geographic identities already prototyped; actual lava, VFX and boss behavior belong to separate owner systems.
- **Gate:** player can maneuver in physically generous arena, traverse approaches, fight/escape and interact with physical hazards; not simply a 64m static diagnostic bowl.
- **Dependencies:** H08-03, H08-07, H08-08.
- **Done for now:** A player can enter, navigate, fight or rehearse boss movement in distinct physical miniboss and Wyrm locations with generous maneuver room and safe approaches; real gameplay/hazards in scope behave correctly. Stop extending boss geometry unless playtesting exposes a specific blocker.

### H08-11 — First integrated Hunt experience acceptance
- **Status:** `PLANNED`
- **Player experience:** coherent Wet Forest Hunt with exploration, meaningful scenery, enemies, destruction and extraction on phone.
- **Gate:** end-to-end reproducible Hunt + real iPhone Safari and Android Chrome metrics, no blocking visuals/collision faults; player approves feel. Does **not** imply V2.9 gravity or production cutover.
- **Dependencies:** H08-01 through H08-09.
- **Done for now:** One complete Wet Forest Hunt—explore, encounter, alter terrain, extract and continue—passes end-to-end gameplay, mobile performance and explicit player review. This is integrated **ACCEPTED**, not merely a generated map.

## V2.9 — Structural gravity (required after first integrated playable Hunt)

### G09-01 — Authoritative bounded falling clusters
- **Status:** `PLANNED`
- **Player experience:** supported arches, cliffs and stone shelves collapse plausibly after destruction.
- **Gate:** bounded connectivity work; never one rigid body per voxel; no duplicate terrain/object collision; verified in the playable Hunt.
- **Dependencies:** H08-08.
- **Done for now:** A controlled collapse follows a removed support in the running Hunt, preserves a single collision authority and respects bounded search/body limits. Stop before advanced rubble visuals.

### G09-02 — Falling-material physics and persistence
- **Status:** `PLANNED`
- **Player experience:** debris falls/settles or fractures without breaking actor collision or replay.
- **Gate:** cross-region, reset, save/replay, mobile frame and memory evidence.
- **Dependencies:** G09-01, H08-02.
- **Done for now:** Falling material settles or fractures deterministically across relevant seams; actor collision, save/replay and mobile measurements pass. Stop; optional sophisticated debris is future polish.

## V2.10 — Integrated quality and reversible release

### R10-01 — Replace placeholder art and add atmosphere by actual Hunt scene
- **Status:** `PLANNED`
- **Player experience:** recognizable magical forest → fading wilds → volcanic approach → Wyrm, consistent authored art, lighting and VFX.
- **Gate:** visual owner approval, proper pixel scale, no terrain/material drift, performance in the playable Hunt. No requirement to block initial walking prototype.
- **Dependencies:** H08-11.
- **Done for now:** The integrated Hunt's art/materials, lighting and atmosphere are coherent and readable on mobile at approved frame targets; user accepts the visible experience. Stop polishing individual shaders once the scene works.

### R10-02 — Full Hunt stress, crash and thermal acceptance
- **Status:** `PLANNED`
- **Player experience:** smooth controls and no stutters even under spell/ambush/destruction loads.
- **Gate:** sustained iPhone Safari/Android Chrome sessions; frame p50/p95/p99 and hitch count, edit-to-visible, CPU/GPU queue/memory, restart/replay/context-loss, explicit device baselines.
- **Dependencies:** H08-11, G09-02, R10-01.
- **Done for now:** Sustained full-Hunt tests on the supported iPhone and Android pass documented p50/p95/p99, hitch, input, memory/thermal and edit/worker criteria, with known exceptions triaged. This is release **ACCEPTED** only with measured evidence.

### R10-03 — Controlled Wyrmforge V2 production cutover
- **Status:** `PLANNED`
- **Player experience:** V2 becomes the accepted game path with rollback; existing V1 production playable until verified.
- **Gate:** all production V2.10 checks and player approval; reversible deployment.
- **Dependencies:** R10-02.
- **Done for now:** The guarded V2 cutover and rollback are both verified on the deployed playable game with no blocking regression; the user approves switching. Mark release **ACCEPTED**, preserve rollback.

## Current session handover template

Use this short form in every next chat (fill from current verified repo state):

> **Game goal:** a playable mobile Wyrmforge Hunt; all engines serve it.  
> **Canonical tracker:** `docs/DELIVERY-TASKS.md`; milestones: `docs/ROADMAP.md`.  
> **Active task:** `H08-01` Play Hunt mobile review (not yet Done for now).  
> **Last merged playable candidate:** PR #143, `a1960ce`. Foundation: PR #141, `27b1c02`.  
> **Next deliverable:** real phone feel/performance review, fix only blockers, mark H08-01 Done for now, then begin H08-02.  
> **Do not pivot:** do not start a standalone World Objects, Lighting or boss lab while this remains unplayable.  
> **Completion:** close each task at its written Done for now criterion; defer optional engine polish to new task IDs. Validate correctness, experience **and** device performance appropriately.
