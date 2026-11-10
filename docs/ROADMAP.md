# Wyrmforge — Voxel Engine V2 roadmap

**Authoritative plan:** the November 9 **Work-authored Wyrmforge Voxel v2 Implementation Handover**, expanded by independent research and engineering verification in this **single roadmap**. Original V2.0–V2.7 milestone definitions and acceptance intent are preserved.
**Delivery objective:** a clean-room, mobile-first **voxel engine actually used in Wyrmforge Hunt**, with full 3D destruction, measured mobile performance, and bounded hybrid structural gravity.
**Repository:** `pjotrcasteel/Wyrmforge-V2` (`main`); the original Wyrmforge repository remains unaffected until a separate V2 game cutover.
**Status:** capabilities have been implemented incrementally through laboratory build **0.0.032**, but individual original V2.0–V2.7 acceptance gates are **not** all passed. No current Wyrmforge Hunt runtime integration or structural gravity is implemented.
**References:** [Research evidence](RESEARCH.md) · [Architecture decisions](ARCHITECTURE-DECISIONS.md) · [Implementation evidence](PROGRESS.md) · [Hybrid gravity design](VOXEL-GRAVITY-V2.md) · [Wyrmforge Hunt generation/destruction target](WYRMFORGE-HUNT-WORLD-TARGET.md).

**Roadmap identity:** `0.0.032` is a *laboratory build version*, **not** milestone `V2.24`. Similarly a completed V2.5 raycast feature does not complete the whole V2.5 milestone. This roadmap is the single source of truth for remaining work and final delivery.

## World-led procedural Hunt target — owner clarification (2026-11-10)

**The lab is not the game.** Wyrmforge is a fixed-camera, pixel-first
2.5D dark-fantasy action roguelite. Actual **Hunt arenas must be
randomly generated from deterministic seeds**, but their biome,
topography, route topology, key landmarks, encounter purpose and Wyrm
influence are constrained by the **chosen location on the world map**.
The game, not a lab scene picker or a terrain renderer, decides the
location. Forests need organic woodland and traversable trails;
mountains need real elevation, rock cliffs and valid passes;
approaches and lairs need corresponding geology and boss spaces.

**Both the player and enemies/Wyrms must be able to damage the actual
terrain AND eligible physical objects with magic.** One committed
gameplay/impact resolution must update terrain voxels, damageable
object entities with stable IDs, collision/LOS/navigation and
incremental renderer/lighting/effects. A tree cannot be just an art
overlay if spells and movement are expected to affect it; neither
can a cliff be merely a dark backdrop. Mandatory spawn/exit/objective
reachability needs an explicit physical safety policy.

**Execution discipline:** finish the remaining V2.0–V2.7 foundation
gates, but evaluate any new feature against that playable Hunt target.
Prioritize a new, independent **site-seeded V2 generator input/output
contract and forest/mountain fixtures**, plus physical object
destruction and game-side integration; stop adding laboratory UI
utilities unless they close a specific production gate. V2.8 must
verify the **actual selected world-map site in actual Hunt gameplay**.
V2.9 structural gravity remains required but later; the owner
explicitly deferred implementing gravity ahead of the roadmap.

The full acceptance/integration boundary is recorded in
[Wyrmforge Hunt World Target](WYRMFORGE-HUNT-WORLD-TARGET.md).
The original Wyrmforge codebase was read to understand **product
requirements only**. No V1 source, physics, grid sizes, constants,
assets or interfaces may be imported or copied into the V2 engine.

## 0. Clean-room V2 mandate — owner decision (2026-11-09)

**Hard rule: Voxel V2 is a ground-up engine, not V1.1, a V1 refactor, or an adapter around V1.** Do not import, call, copy, port, wrap, or depend on any V1 terrain code, data structures, meshing, renderer, shaders, physics, collision, destruction, effects, assets/materials, serialization, helpers, runtime services, or internal interfaces. Do not use V1's technical implementation as the starting design. New implementations and tests must be authored from first principles and independent external research.

- **Allowed:** standard browser/WebGL2 APIs; generic development tooling, GitHub Actions and repository hosting infrastructure when they do not introduce V1 runtime dependencies; the independent 75-source research ledger; newly authored V2 code, assets, shaders, contracts and test fixtures.
- **Isolation:** V2 source and tests have no imports or references to V1 game runtime modules. The standalone V2 lab must launch, render, mutate, query, replay and benchmark without loading V1. CI must enforce this with an explicit dependency/import audit.
- **No inherited technical constants:** do not adopt V1 voxel pitch, grid dimensions, world units, material IDs, texture resolution, projection formula or physics rules by default. V2 chooses and documents its own values through experiments. Any eventual compatibility mapping is a **separate, explicit, future integration project**, not a V2 engine dependency.
- **New V2 ecosystem:** Lighting V2, Physics V2, VFX V2, Audio V2, AI V2, animation and world-generation V2 communicate through newly designed, versioned, engine-neutral contracts. No V1 interfaces, event types or adapters are reused. Voxel V2 remains independently runnable without these consumers.
- **Production safety:** V1 remains untouched and operational. No existing game feature is removed, replaced or migrated by this roadmap. Existing game canon governs the live game, **not** the internal architecture of the isolated V2 experiment.
- **Legacy prototype review:** audit the existing V2 experimental page for copied V1 modules, assets or assumptions. Replace anything inherited before treating V2.0 as accepted. The existing demo is disposable and is not a design constraint.
- **Acceptance proof:** a clean dependency graph, source/import audit, independent build and tests, fresh assets/shaders, and a documented V2-only schema. No milestone may pass if it depends on V1 runtime behavior.

## 1. Goal and non-negotiable boundaries

Build a **buttery-smooth, fully destructible terrain foundation** in which ground, hills, cliffs, arches, overhangs and other solid geometry share one authoritative voxel representation. Destruction must be spatially local, deterministic, and observable. The renderer must not change the terrain truth. The lab must run on mobile Safari and Chrome, with desktop as a development environment.

Voxel V2 is an independent engine with its **own** coordinates, voxel resolution, storage, renderer, physics-query contracts, materials and tests. No V1 technical constants or interfaces are inherited. Production Wyrmforge remains unchanged during development; any eventual game migration or compatibility decision is a separate future approval, not a V2 foundation constraint.

## 2. Research-informed architecture

```text
Lab UI / scenario harness / deterministic report exporter
    -> ordered edit commands -> authoritative sparse 3D voxel store
                                -> committed voxel queries (DDA, collision)
                                -> versioned immutable chunk snapshots
                                -> bounded mesh-worker scheduler
                                -> revision/epoch validation
                                -> budgeted WebGL2 upload + disposal
                                -> pixel-readable orthographic 2.5D view

Future V2 ecosystem: independent authoritative gameplay -> new V2 contracts -> voxel queries/edits
                                              -> derived renderer, lighting/VFX/audio
```

- **Truth:** integer coordinates, Euclidean division for negative positions, explicit out-of-bounds policy, empty/uniform/mixed chunk encodings. Benchmark 16³ versus 32³ chunks; choose on memory, mutation, query and frame-time data, not folklore.
- **Geometry:** benchmark exposed-face meshing against greedy meshing under both intact and heavily fragmented terrain. A chunk's mesh is a disposable cache, never collision authority.
- **Mutation:** a single ordered writer accepts idempotent command IDs, material/resistance rules, bounded edit volumes, and increments chunk revisions. Neighbor invalidation includes all affected boundaries.
- **Concurrency:** bounded jobs and snapshot bytes; transferable buffers where supported; validate world epoch, chunk revision and neighbor revisions before applying results. Discard stale work and dispose replaced GPU resources.
- **Queries:** integer voxel sampling, 3D DDA rays, and direct committed-state collision; compare continuous swept AABB and capsule behavior rather than assume one algorithm is sufficient.
- **Replay:** versioned generator/material schema, deterministic seeds, accepted-command log and periodic snapshots. Verify canonical voxel hashes. Cross-device bitwise floating-point actor simulation is **not** assumed.
- **Browser:** WebGL2 baseline, context-loss recovery, pointer-cancellation-safe touch controls, no mandatory WebGPU, shared memory or cross-origin isolation.
- **Performance:** prioritize p95/p99 frame time, input-to-visible edit latency, upload budgets, allocation trend and sustained thermal behavior over headline FPS.

## 3. Milestones and acceptance gates

### V2.0 — Isolated experiment shell and trustworthy instrumentation

**Deliver:** isolated `/experimental/voxel-v2/` page; build SHA and experiment version visible; deterministic scene picker and seed; desktop pointer and mobile tap/orbit/pinch with cancellation handling; reset; frame-time p50/p95/p99 and hitch counts; report JSON export; CPU and estimated GPU/worker bytes; optional GPU timing when available. Keep production and experiment deployment distinguishable. Require a V2-only dependency audit and independently authored assets, shaders and modules.

**Critical deployment change:** GitHub Pages publishes a **whole-site artifact**. The current independent experimental and production workflows can race even with exact-main caches. Move to **one Pages deployment owner** or a genuinely separate preview host before claiming safe deployment. Check production root, existing game routes and experiment route after each publish; compare expected SHAs. A cache is not a safety guarantee.

**Gate:** fast build/deploy timing recorded; correct SHA and scene confirmed in a browser; no production overwrite/regression; desktop interaction checked; real iPhone Safari and Android Chrome basic operation checked; report exported. **Current status: IN PROGRESS; gate NOT MET.** Existing fixed-array WebGL2 demo and FPS counter are prototypes, not acceptance evidence.

### V2.1 — Authoritative sparse terrain core

**Deliver:** sparse integer-addressed voxel store with configurable 16³/32³ chunk pitch; deterministic flat, hill, cliff and arch/overhang generators; layered grass/dirt/stone/bedrock; material and resistance schema; world-to-chunk/local coordinate APIs; explicit bounds and uniform/empty chunks; immutable revisioned snapshots.

**Tests:** seeded repeatability, negative coordinates, six-face neighbor boundaries, all generator shapes, serialization round trip, memory accounting and uniform-to-mixed transition.

**Gate:** identical canonical hashes across repeat runs; intact overhangs and cliffs occupy real 3D cells, not heightmap illusions; 16³/32³ comparative measurements recorded.

### V2.2 — Derived rendering and pixel-readable camera

**Deliver:** WebGL2 orthographic/oblique pixel-art camera; exposed-face baseline and greedy mesher; material-atlas sampling and stable texel density; face visibility across chunk seams; geometry revision metadata; renderer ownership/disposal and context recovery.

**Tests:** no internal faces, no missing boundary faces, correct grass/dirt/stone strata, stable camera and zoom, renderer reset, context-loss injection.

**Gate:** scene screenshots at 320/390 CSS px and on desktop; triangle counts, draw calls, mesh CPU time, upload bytes and p95/p99 compared between meshing algorithms; choose measured winner or justified hybrid.

### V2.3 — Deterministic destruction and resistance

**Deliver:** one command API for sphere, crater, line/tunnel and area damage; material resistance, unbreakable bedrock, capped per-hit excavation, optional repeated damage; bounded multi-chunk edit transactions; precise dirty-chunk/neighbor set; edit IDs and revision increments; immediate authoritative query visibility.

**Tests:** repeated identical edit hashes, duplicate command handling, cross-chunk sphere, cliff breach, arch destruction, bedrock invariance, no unrelated chunk mutations.

**Gate:** hills, cliffs and overhangs all destructible through the same path; destruction visibly localized; edit-to-committed latency measured separately from edit-to-visible latency.

### V2.4 — Bounded asynchronous meshing and GPU budgets

**Deliver:** worker pool sized to device capability; bounded pending jobs and memory; transferable snapshot buffers; cancellation/coalescing; world epoch and chunk/neighbor revision checks; frame-budgeted GPU uploads and disposal; explicit backpressure and queue metrics.

**Tests:** delayed/reordered workers, rapid repeated explosions, reset during rebuild, neighbor edits while jobs run, worker errors, stale-result injection, context loss during uploads, bounded allocation trend.

**Gate:** no stale mesh resurrects removed voxels; no unbounded queue or memory growth; burst workloads have measured p95/p99 and edit-to-visible latency on target phones.

### V2.5 — Physical interaction and collision queries

**Deliver:** 3D DDA for aiming/projectiles; swept-volume player movement with step/slide rules; evaluate capsule versus swept AABB; grounding, wall/cliff contact, overhang and pit handling; movement and projectile queries read committed voxels, never GPU mesh data.

**Tests:** diagonal motion, high-speed tunneling, floor/ceiling transitions, negative coordinates, cross-chunk collision, edits immediately under a moving player, impossible-spawn recovery.

**Gate:** no pass-through or obvious directional collision artifacts in the defined fixtures; same committed edit produces the same terrain query result before the mesh rebuild completes.

### V2.6 — Typed integration boundaries (without production cutover)

**Deliver:** entirely new V2-native versioned interfaces for terrain snapshots, edit commands, material queries, raycast/collision, change notifications, and Lighting V2/Physics V2/VFX V2/Audio V2 hooks. Define independent authority, adapter direction, thread/worker rules and failure handling. Do not import or reuse any V1 contracts or feature-specific systems.

**Tests:** contract serialization/versioning, adapter fakes, event ordering, replay-compatible change notifications, renderer failure isolation.

**Gate:** a minimal proof using freshly authored V2-only contracts and stub V2 consumers; no V1 imports, adapters, event types or services. **No production migration without explicit owner approval.**

### V2.7 — Foundation release and sustained mobile acceptance

**Deliver:** versioned snapshots and accepted-command replay; deterministic stress scenes and exportable benchmark profiles; reproducible 10-minute destruction sessions; documentation, known limits and recovery procedure; final chunk-size/mesher choices backed by measurements.

**Tests:** direct-run versus snapshot+replay hash equivalence; reordered worker completions do not change terrain truth; repeated resets; background/foreground; context loss; sustained destruction and collision; production route regression checks.

**Gate:** ten-minute physical iPhone Safari **and** Android Chrome runs, including p50/p95/p99, hitch counts, input/edit latency, worker queue peak, CPU/GPU estimated memory and device/browser/resolution. No progressive slowdown, state corruption, unexpected GPU resource growth or loss of production routes. Establish explicit target thresholds from V2.0 baseline and owner-approved device classes before claiming “buttery smooth”; **do not invent universal FPS guarantees**.

## 3A. Required follow-on milestones — completing Wyrmforge, not just the lab

**Owner delivery direction (2026-11-10):** the V2.0–V2.7 foundation is a
**necessary intermediate release**, not the end product. The Work handover
intentionally deferred full-game integration and structural collapse from its
*first simple release*. Those features are now explicitly required **after**
that foundation, without rewriting or changing its original milestones.

### V2.8 — First playable Wyrmforge Hunt integration (gravity may be off)

**Deliver:** use the *new independent* V2 voxel terrain engine inside a
guarded V2 Hunt gameplay route or isolated switch, without converting the
engine into a wrapper around V1. A selected world-map location must supply
a versioned V2-native site recipe (stable ID, biome/landform, required
landmark, permitted entrances/exits, seed, threat/Wyrm influence);
World Generation V2 builds a reproducible, varied forest/mountain/other
location-appropriate 3D site with clearings, safe spawns, actual paths
and real blocking geometry. Connect terrain rendering/camera, player
grounding/collision, true **player and enemy** projectile/spell impact
coordinates, destruction of eligible material voxels **and stable-ID
physical objects**, ordered change notifications and navigation/LOS
invalidations. Preserve the existing playable V1 game, routes and
assets until V2 acceptance. A game-side V2 adapter is allowed;
**the clean-room engine must not import V1 systems**.

**Acceptance:** select a real world-map forest or mountain node and
enter a **seed-generated** V2 Hunt arena that visibly matches its biome,
includes its promised routes/landmarks and has a reachable objective and
exit. Different seeds vary the local geography without changing the
site's promised identity. Player and enemy magic can break appropriate
terrain and objects, opening/altering traversable space, with one
authoritative collision and destruction record. Test genuine hills,
cliffs, walls, overhangs, pits, tunnels and no trapped actors.
No old terrain renderer or collider may remain an independent
authority over that V2 scene. Verify the real mobile Hunt camera,
player/enemy spell experience, navigation, props, art and performance
*in the game* (not just a lab link).

### V2.9 — Hybrid gravity, structural integrity and settling (REQUIRED)

**Deliver:** implement the separately documented
[hybrid gravity design](VOXEL-GRAVITY-V2.md), first under bounded
standalone test fixtures and then in the guarded Wyrmforge V2 Hunt scene:
anchored/supporting material, six-connected cohesive-component discovery
near deleted supports, bounded falling cluster bodies, collision and safe
atomic settlement, granular loose material behavior, optional fracture,
and authoritative terrain-change propagation to renderer, Physics V2,
Lighting V2, VFX V2, Audio V2 and navigation. Keep gravity **configurable
by material and scene**, but delivering and testing it is **not optional**.
No per-voxel rigid body and no full-world support scan per frame.

**Acceptance:** cut an arch pillar and observe the unsupported rock fall
and settle or fracture, while anchored terrain stays fixed; quarry a
cliff and correctly resolve support; remove the ground under the player
without ghost colliders; support negative chunk seams and reset mid-fall;
prove no duplicate static+dynamic collision authority; verify deterministic
committed settlement, bounded active bodies, worker tasks and memory.
Prove mobile quality without disabling gameplay destruction to mask lag.

### V2.10 — Wyrmforge production readiness and controlled cutover

**Deliver:** integrated Hunt gameplay, appropriate mobile pixel-art
terrain/materials, V2 lighting and effects hooks, authored world maps and
transitions, collision/nav behavior, quality tiers and independent
10-minute or longer stress/thermal sessions with normal Hunt enemy and
spell loads **including ambush-like bursts** and gravity events. Compare
actual game performance and correctness to the initial Work targets.
Add a reversible deployment/cutover path that preserves the current
game until the new engine passes all gates.

**Acceptance:** zero unexplained terrain-texture movement, stale craters,
ghost/invisible colliders, falling-mesh desynchronization, unexpected
world resets, or material desync; consistent player/spell/physics
interactions and no sustained GPU/CPU memory growth. Record physical
iPhone Safari and Android Chrome measurements for the full scene.
**Only then** switch the game to V2 terrain as the accepted default.

### Original Work performance targets (provisional, not achieved guarantees)

| Measure | Work handover initial target | Acceptance rule |
| --- | --- | --- |
| Whole-game frame timing | 60 FPS supported baseline; p95 <= 16.7 ms | Measure actual Hunt workload on named iPhone and Android devices |
| Main-thread terrain budget | Around 2 ms/frame p95 | Include worker dispatch and uploads |
| Typical edit-to-visible | <= 100 ms | Separate committed-state latency and visible latency |
| Slower devices | Explicit 30 FPS quality fallback | Adapt visual quality, never discard committed edits |
| Tail latency | p99; counts above 33/50 ms | Include ambush-like bursts, cliff collapses and high fragmentation |
| Sustained operation | >= 10 minutes per baseline device | Memory/thermal/regression trend, not a brief successful demo |
| Work queues | Bounded bytes/jobs and revision lag | Overload must be visible and deterministic |

These are design **targets**, not a promise of perfect performance on
every device. Choose quality tiers and exact supported hardware from
measurements. Preserve frame-time headroom for Wyrmforge's enemies,
VFX, Audio, Lighting and HUD.

## 4. Execution order and dependencies

```text
Research: 75 documents + architecture synthesis  [DONE — documentary evidence only]
V2.0 deployment ownership + instrumentation     [ACTIVE — BLOCKED on deployment safety]
    -> V2.1 sparse authoritative store
    -> V2.2 render and camera
    -> V2.3 local destruction
    -> V2.4 bounded workers and GPU uploads
    -> V2.5 collision and projectiles
    -> V2.6 typed adapters
    -> V2.7 replay + sustained device acceptance (first foundation release)
    -> V2.8 first playable Wyrmforge Hunt V2 terrain integration
    -> V2.9 supported hybrid structural gravity and settling
    -> V2.10 integrated Wyrmforge release / sustained device acceptance
```

Maintain a working vertical slice after every milestone. Small remote commits, isolated tests and preview builds are preferred over 20-minute full production builds. Do not mark milestones complete based on code presence, green CI alone or a GitHub deployment status without route/device verification.

## 5. Integration map: other V2 engines

| Component | Voxel V2 exposes | Owner / integration rule |
| --- | --- | --- |
| Gameplay V2 | versioned occupancy, material queries, accepted edit commands, snapshots | define authority in new V2 contracts; no V1 gameplay dependency |
| Lighting V2 | changed solid/occluder bounds, material/height/face data | lighting engine owns light transport, emitters, shadows and mobile budget |
| Physics V2 | voxel collision/raycast queries and changed-cell notifications | physics owns actors and movement; no duplicate terrain store |
| VFX V2 | typed impact, fracture and material events with stable world coordinates | VFX owns particles, dust, sparks, burns; cosmetic only |
| Audio V2 | material and impact events | audio owns sound selection, mixing and spatialization |
| AI/navigation V2 | changed walkability/visibility regions and solid queries | new V2 navigation contracts; incremental invalidation, no renderer dependency |
| Animation/characters V2 | new V2 coordinate/projection contract and grounding queries | terrain does not own rigs or animation; no V1 sprite/animation pipeline dependency |
| World generation V2 | seeded material/voxel initialization interface | generation owns biomes, landmarks and protected routes |
| Save/replay | snapshot schema, ordered accepted edits, canonical hashes | gameplay/save owner controls persistence and schema migration |
| HUD/debug tools | counters, test scenario commands, benchmark report schema | no performance-critical game logic in UI |

**Cross-engine invariant:** one **new V2** world coordinate contract; typed V2 events; one owner per responsibility; changes can be replayed; cosmetic failures cannot roll back committed terrain truth. V2 units and voxel pitch are independently selected; V1 metrics do not constrain them.

## 6. Standard benchmark matrix

Run the same deterministic seed and edit scripts against both chunk sizes and candidate meshers:

| Fixture | Workload | Required evidence |
| --- | --- | --- |
| Flat layered ground | idle camera, orbit and zoom | baseline frames, memory, draw calls |
| Hill and cliff | repeated localized crater and wall cuts | cross-boundary edits, mesh cost, strata |
| Arch/overhang | ceiling, wall and underside removal | genuine 3D occupancy, collision, faces |
| Fragmented terrain | many small cuts across chunks | worst-case greedy efficiency and queue pressure |
| Ambush-like burst | many simultaneous projectiles, impacts and terrain edits | bounded work, p99, hitch counts, edit latency |
| Sustained session | 10 minutes edit/reset/move/background/foreground | leak trend, thermal context, context/input recovery |
| Deterministic replay | snapshot, restore, shuffled worker completions | identical authoritative hashes, no stale mesh |

Collect: commit/build SHA; seed; scene; device, OS, browser, viewport and render scale; chunk size; mesher; frame p50/p95/p99 and >33/>50/>100 ms hitches; input-to-visible latency; committed-edit time; worker queue peak and wait; mesh build duration; GPU upload bytes/time; estimated CPU/worker/GPU memory; triangles and draw calls; context-loss counts. Report unknown measurements as **unavailable**, not zero.

## 7. Risks, alternatives and explicit deferrals

1. **Pages publication race (highest immediate risk):** fix deployment ownership before public V2.0 acceptance; fail closed rather than overwrite the game.
2. **Mobile bandwidth/thermal pressure:** benchmark real phones at sustained load; quality tiers may adjust resolution and visual complexity, never authoritative edits.
3. **Greedy mesh fragmentation:** benchmark, do not assume greedy is always fastest end-to-end.
4. **Worker backlog/stale results:** enforce revisions, epoch, bounded queues, upload budgets and explicit disposal.
5. **Cross-platform replay:** canonical integer voxel state is the hash target; avoid promising identical floating-point actor trajectories.
6. **Legacy contamination:** V1 modules, assets, constants and event contracts must not leak into V2. Audit imports and runtime dependencies before V2.0 acceptance; eventual compatibility is separate.

**Deferred beyond the first V2.0–V2.7 foundation:** octrees, sparse voxel DAGs, brickmaps, WebGPU compute, GPU ray marching, LOD/Transvoxel, smooth density meshing and fluid simulation until evidence warrants. Full V2 Hunt integration is explicitly **required at V2.8**, bounded hybrid gravity at **V2.9**, and the integrated release at **V2.10**. Advanced lighting/enemies remain owned by their own V2 systems, connected through V2.6 contracts.

**Required post-foundation gravity milestone — V2.9:** [Hybrid Gravity V2 design](VOXEL-GRAVITY-V2.md). The Work foundation's V2.7 release gate does not require falling terrain, but the **finished Wyrmforge V2 program does**. V2.3 edit notifications, V2.4 work budgets and V2.5/V2.6 collision/contracts are prerequisites. Gravity may be disabled for a particular material/scene, never for the final acceptance scenario. No full-world or per-voxel rigid-body loop.

## 8. Definition of done and status discipline

Each milestone requires: merged or remotely checkpointed code on the intended branch, focused automated tests, a reproducible demo scenario, measured acceptance evidence, a current `PROGRESS.md` update, and a known-limitations note. Only mark **ACCEPTED** when all milestone-specific gates pass; otherwise mark **IN PROGRESS**, **BLOCKED** or **READY FOR DEVICE TEST**. Document both successes and failures.

**Current status (2026-11-10):** the standalone independent V2 repository has implemented/tested incrementally through **lab v0.0.024**, and the user has confirmed basic iPhone spell-targeted terrain destruction works. Earlier physical iPhone JSON reports provide measured worker/replay cases, but **Android Chrome, integrated Hunt workload, complete original V2.0–V2.7 gates, structural gravity, and production Wyrmforge integration remain unverified/not implemented**. The next work is to close the *oldest blocking core milestone gaps*—especially pixel-readable materials, cliff/overhang destruction beyond the demo, proper player grounding and swept collision, frame-budgeted worker/GPU work and sustained device tests—rather than more replay-file UI. Record exact gap and acceptance proof in PROGRESS.md before claiming completion.
