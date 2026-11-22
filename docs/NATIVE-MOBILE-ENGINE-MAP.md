# Wyrmforge V2 — Native Mobile Engine Map

**Status:** PROPOSED ARCHITECTURE, updated for owner-confirmed C# backend + swappable Pages/native presentation; not implemented.  
**Date:** 2026-11-22.  
**Scope:** shared C# game/simulation core, Blazor WASM/Pages development frontend, and future native iOS/Android presentation hosts; independently replaceable engines and frontends.  
**Relationship:** This is a **platform migration and component inventory**, not a competing gameplay roadmap. Continue to use docs/ROADMAP.md and docs/DELIVERY-TASKS.md for historical work; open a separately reviewed native implementation track.  
**Existing decisions:** preserve docs/architecture/ADR-0001-replaceable-engines.md and ADR-0002-hunt-expeditions-and-journey.md; this document makes the backend/frontend boundary explicit.  
**Safety:** This PR adds documentation only, does not rewrite engines or overwrite parallel active branches.

## 0. Locked product architecture: C# engine authority, interchangeable presentations

**Owner correction (2026-11-22):** Preserve the V1 model of a **C# domain/game simulation core** with a **GitHub Pages browser frontend** during development; make presentation fully replaceable. Final distribution remains **native iOS and Android apps**, with their own presentation adapters, **not a hosted WebView**. Do not assume Unity owns the game, and do not move the game's authoritative state to JavaScript/WebGL.

V1 source verification:
- `Wyrmforge.Domain` and `Wyrmforge.Application` are standalone C# projects; Application references Domain.
- `Wyrmforge.Presentation.Web` uses `Microsoft.NET.Sdk.BlazorWebAssembly` and references Application and Bootstrap. Program.cs registers the C# game services in a browser WebAssembly host.
- **GitHub Pages is static hosting**, not a server-side .NET backend. The C# simulation executes in the client through WebAssembly. "Backend" here means the **authoritative game/simulation layer**, not a remote HTTP server.
- The browser's JavaScript/WebGL implementation is a **presentation adapter**, not a second physics/combat authority.
- Actual mobile releases must host the **same game engine source/logic** inside native iOS and Android applications, with native GPU presentation. The native rendering framework is **not chosen yet**; qualify candidates by building both platforms rather than selecting one prematurely.

### Immutable constraints

- Game semantics, state, fixed-step progression, collision, terrain, combat, AI, water/lava simulation, progression and saves are C# domain/engine responsibilities.
- Web frontend: Blazor WebAssembly + replaceable WebGL/Canvas renderer, deployed to Pages for fast playable iteration.
- Native frontend: separate future mobile presentation package with real installable iOS and Android apps and native rendering/input/lifecycle.
- One stable protocol between C# engine and any presentation: **input commands in; immutable scene/render deltas, audio/VFX intents, and UI view models out**. No frontend writes authoritative domain state.
- Preserve 1m terrain blocks with 10 x 10 x 10 microvoxels where needed; fixed camera, pixel-first 2.5D look.
- Mobile target 60 FPS on defined supported devices, to be measured; no claim of achievement from desktop or Pages-only tests.
- Avoid V1 runtime/asset reuse in V2 as already mandated; V1 architecture can be studied, not copied blindly. The V2 JavaScript implementations become migration references/fixtures, not production game authorities.
- Different **hosts** may compose the same core differently. The engine itself must not import browser DOM/JS, Blazor, UnityEngine, GPU APIs, mobile OS APIs or a presentation assembly.
- Native runtime/AOT compatibility must be verified **early on both platforms**. Do not build months of C# that only runs in Blazor WebAssembly.

### Why this is different from a hosted server

This is an **offline-first local game simulation** running inside each host. No HTTP transport is required between the engine and its frontend. Within the browser, C# lives in WASM; the presentation can use efficient batched JS/GPU interop. In native apps, the C# engine runs locally with a native rendering adapter. An online backend may be added later for optional features, but does not own an offline Hunt by default.

## 1. Host-neutral engine/presentation boundary

Conceptual direction:

    Browser / GitHub Pages                   Native iOS / Android app
    Blazor WASM + WebGL presenter             Native renderer/input/audio presenter
                   |                                       |
            IPlayerCommandSink                         IPlayerCommandSink
            IScenePresentationFeed                      IScenePresentationFeed
                   +-------------------+-------------------+
                                       |
                             C# Hunt application
                         C# fixed-step coordinator
                                       |
                      C# domain engines behind ports
                Terrain / WorldGen / Physics / Fluids
                Objects / Navigation / AI / Encounters
                     Combat / Progression / Save

**The browser and native app are alternative hosts**, not two simultaneously running simulations and not a network backend-client arrangement. A frontend must not read internal chunks or actor state via implementation-specific imports. Use stable display DTOs with explicit units, revision, lifetime and ownership.

### Public contracts (small, versioned and independently tested)

- `IPlayerCommandSink.Submit(PlayerCommand)`: intentions (move, aim, cast, interact, select choice), with sequence/tick metadata, never direct position/health mutation.
- `ISimulationSession.Advance(FixedTick)`: the only coordinator of authoritative advancement; hosts may request time progression but not skip gameplay logic.
- `IScenePresentationFeed.ReadSince(SceneRevision)`: camera-independent world geometry/mesh change descriptors, visible actors, poses, fluid surfaces, material IDs, lighting source/occluder descriptors, render-layer order and presentational events. Prefer deltas and binary/packed buffers for large scenes, not full per-frame JSON.
- `IUiViewModelFeed`: read-only health, resources, encounter, progress, map, crafting and menu state; browser and native UI may render it differently.
- `ISaveStore`, `IAudioSink`, `IHaptics`, `IPlatformLifecycle`: host-provided adapters; core owns save data format, not browser local storage or iOS file APIs.
- `IGeometryQuery`, `ITerrainCommandPort`, `IObjectQuery`, `IFluidSnapshot`: engine-to-engine public ports; no frontend owns these authorities.

**Anti-corruption rule:** Frontends can interpolate/extrapolate *visual poses* and run visual-only particles, but may not resolve hits, decide gravity, change terrain, spawn enemies, grant rewards, modify fluid levels or persist canonical gameplay state.

**High-frequency performance:** Scene transitions and UI may use normal Blazor binding. Terrain/actor frame data should use coarse batched boundaries, stable IDs, typed buffers/mesh revisions and limited allocations. Benchmark WASM-to-JS cost and native renderer feed separately. Domain code must not depend on JS interop.

## 2. Repository layout (target, not yet created)

    game/
      Wyrmforge.V2.slnx
      src/
        Wyrmforge.V2.Contracts/      # host-neutral commands, DTOs, ports, versioned events
        Wyrmforge.V2.Domain/         # immutable rules/entities, no frontend or engine adapters
        Wyrmforge.V2.Application/    # Hunt orchestration, fixed steps, gameplay
        Wyrmforge.V2.Engine.Terrain/ # Voxel authority and terrain edit ledger
        Wyrmforge.V2.Engine.World/   # procedural generation, residency, objects, gravity
        Wyrmforge.V2.Engine.Physics/ # actor/projectile movement and collision
        Wyrmforge.V2.Engine.Fluids/  # water/lava physical simulation
        Wyrmforge.V2.Engine.Agents/  # navigation and AI intent
        Wyrmforge.V2.Engine.Combat/  # spells, damage, status
        Wyrmforge.V2.Engine.Encounter/ # waves, rare rolls, boss phases
        Wyrmforge.V2.Engine.Progression/ # Web, mutators, economy
        Wyrmforge.V2.Presentation.Contracts/ # render deltas, UI views, FX/audio intents
      tests/                          # pure .NET contract/replay/integration tests
    frontends/
      web/                            # Blazor WASM + JS/WebGL/Canvas presenter on Pages
      native/                         # future native iOS/Android renderer + app host
    benchmarks/                       # shared scenarios; separate web and native perf records

Engine projects are **regular C# libraries**, not separate services. Package boundaries may be grouped until independent deployment/compilation is useful; keep public contracts explicit. Choose compatible target frameworks after proving compilation/execution in the selected browser and native hosts, rather than assuming every `.NET 10` API is usable from Unity/another native runtime.

The current root `src/`, `art/`, `tests/` and browser labs stay intact while replacement C# modules and the web presenter are built incrementally; don't delete or mass-port anything in the first PR.

## 3. Engine and system inventory

### Engine-side versus frontend-side ownership

| Shared C# simulation/game backend | Replaceable presentation frontend | Shared handshake |
| --- | --- | --- |
| Voxel, destruction, world generation and streaming authority; physics/collision; structural gravity; water/lava state; world objects; navigation; AI; combat and spell outcomes; encounter/boss phases; corruption rules; progression; saves and replay | Terrain/prop/actor GPU drawing; material shader implementations; light/shadow rendering; pixel sprite animation; particles; audio/haptics; camera framing; touch input gesture translation; HUD/world map/Arcane Web visualization | Player commands -> C#; scene/material/light/pose/FX deltas and UI view models <- C#; lifecycle/storage/audio adapters provided by host |

**Renderer portability nuance:** gameplay publishes light-source events, material identities, occluder geometry and presentation intents in stable C# contracts. The actual WebGL and future Metal/Vulkan/etc shading implementations can differ; their visual fidelity is assessed separately. The renderer is never the source of truth for combat, terrain or fluid state.

**Symbols:** P = platform/foundation; W = world; S = simulation/movement; R = visual/audio; G = gameplay; Q = quality/tooling. Priority: **A = native proof / first playable vertical slice**, **B = Hunt baseline**, **C = later product/release**.

| ID / owner | What it does | Why we need it | Priority |
| --- | --- | --- | --- |
| P00 Multi-host bootstrap | Composes the same C# core into Blazor WASM/Pages and separately into native iOS/Android app hosts | Stops presentation runtime from silently becoming gameplay authority | A |
| P01 Contracts and coordinates | Defines immutable C# DTOs, stable IDs, metres/micro-units, chunk keys, ports, presentation snapshots and event schema versions | Allows engine **and frontend** replacement without rewriting gameplay | A |
| P02 Simulation coordinator | Fixed-step clock, command ordering, lifecycle, dependency injection, revisioned event delivery | Prevents two engines competing to mutate the same state; stable replays | A |
| P03 Save, restore and replay | Versioned world/actor/hunt snapshots, accepted edit log, resume after app suspension | Hunts/destruction must survive restarts and iOS/Android lifecycle | A |
| W01 Voxel authority | Sparse signed 3D terrain store, materials IDs, microvoxel occupancy, authoritative terrain edits and raycasts | The physical destructible world must not be a painted heightmap | A |
| W02 Meshing | Rebuilds only dirty geometry, face/normal/UV data, collider mesh handoff, bounded GPU upload requests | Makes voxel changes visible without destroying phone frame times | A |
| W03 World Generation | Deterministic region/biome/landform/route/landmark recipes with spawn/extraction connectivity tests | Every Hunt is unique but remains traversable and location-consistent | B |
| W04 Region streaming | Chunk/region demand, generation admission, residency/eviction, snapshot reload, prefetch | Long seamless expeditions cannot keep entire worlds loaded | B |
| W05 World Objects | Stable-ID trees, shrubs, rocks, bridges/buildings, grounding, physical collisions and destruction | Props must be real interactive entities, not just sprite overlays | B |
| W06 Structural gravity | Bounded support graph, falling terrain/object clusters, stable settlement after excavation | Real holes, cliffs and destructible structures need consistent consequences | B |
| W07 Fluid simulation | Physical water/lava sources, flow, levels, pooling, bank breaches, state across terrain edits | Water/lava must occupy terrain naturally and react to Fireballs | B |
| W08 Environment state | Weather, wetness, temperature hazards, corruption and time-of-day inputs | Healthy wet forest must evolve naturally toward the Wyrm's corrupted territory | B |
| S01 Physics and collision | Swept actor/projectile movement, grounding, knockback, jumps, object and terrain collision | Player and enemies must respond to the same committed world geometry | A |
| S02 Navigation | Traversability and pathfinding using physical snapshots plus actor movement capabilities | Packs, smart hunters and frightened enemies need valid routes, not wall cheating | B |
| R01 Presentation/rendering adapters | WebGL/Canvas renderer for Pages, native GPU renderer for iOS/Android; consumes the same versioned scene deltas | Both platforms show the same game without owning simulation rules | A |
| R02 Materials / surface | Physical-vs-visual material descriptors, albedo, normals, roughness, wetness, emission and variants | Textures remain reusable and do not own geography or lighting | B |
| R03 Lighting / shadows | Generic light/occluder inputs, directional/contact shadows, emissive spells/lava, mobile budgets | Grounds trees, actors and cliffs; readable contrast across corruption stages | B |
| R04 Effects / particles | Projectile trails, impacts, fire, smoke, ash, rain, foam, sparks and camera feedback | Expresses gameplay events without changing authoritative state | B |
| R05 Animation / presentation | Wizard/enemy directional sprites, attack telegraphs, skeletal or frame animation, facing and timing | Combat needs readable 2.5D pixel characters and accurate hit feedback | B |
| R06 Sound and haptics | Native audio mixer, ambience, spell feedback, spatial cues and phone haptic adapters | Reusable gameplay event consumers with native platform delivery | B |
| G01 Host input and camera adapters | Translates touch gestures/joystick and camera presentation into the shared C# player-command and camera-view contracts | Web and native controls can evolve without changing physics or combat | A |
| G02 Spells and combat | Spell definitions, Fireball, schools, mutators, costs/cooldowns, impact intent, damage/status resolution | Core wizard fantasy; gameplay decides outcomes, not voxel/renderer | A |
| G03 Enemy AI | Perception, bounded memory, sophistication, temperament, morale, pack tactics and action intent | Hollowed, Ashling, Wolf and later enemies must behave distinctly and fairly | B |
| G04 Encounter / boss director | Seeded waves, rare rolls, pack composition, Reliquary, Warden and multi-phase Wyrm encounters | Separation of *when/what spawns* from *how each agent thinks* | B |
| G05 Hunt and World Map | Branching journeys, region objectives, gated passages, extraction, world corruption and narrative progression | Hunts are cohesive expeditions, not a collection of tiny isolated arenas | B |
| G06 Progression / spell crafting | Arcane Web, spell mastery/mutators, temporary run choices, Spell Laboratory/Forge, persistent knowledge | Supports repeatable roguelite progression without a gear treadmill | B |
| G07 Rewards and economy | Essence/rewards, unlock pacing, rarity tables and future optional social/live-service policy | Keeps progression auditable and separate from combat/AI | C |
| G08 UI / accessibility | HUD, inventory/progression screens, map, options, accessibility, tutorials and localization hooks | Native devices need legible controls/readability and accessible interaction | B |
| P04 Online services (optional) | Leaderboards/challenges/cloud sync where agreed; anti-cheat and authoritative backend if needed | Optional future multiplayer/live features must not block offline Hunts | C |
| Q01 Validation tooling | Deterministic seeded fixtures, contract replacements, integration tests, native device build gates | Separates actually verified engine behavior from merely merged code | A |
| Q02 Profiling and adaptive quality | CPU/GPU frame budgets, memory/thermal/battery evidence, quality tiers, streaming telemetry | 60 FPS is an evidence-backed product constraint, not a claim | A |
| Q03 Asset/build pipeline | V2-native art import, compression, atlases, platform builds, signing and reproducible provenance | Avoids art regressions, oversized builds and unshippable projects | A |

### Required behaviour-specific details

- **Microvoxels:** 1 m physical blocks and 0.1 m subdivisions are canonical world geometry; broad-phase coarse occupancy is allowed, but queries and destruction must respect fine occupancy.
- **Movement capability:** Wizard and Hollowed cannot casually step over a 1 m voxel; Wolf and Ashling may jump up/down a 1 m voxel when their capability permits. **Navigation uses movement capabilities published by Physics**; AI must not invent different step rules.
- **Enemy variation:** keep archetype, AI sophistication, temperament, per-instance rarity, encounter class and Wyrm/world tier independent. Basic melee/ranged, pursuit/pack/flanking/panic, rare variants, Reliquary/Warden/Wyrm stage logic must remain composable.
- **Fluids:** Water owns water state, lava owns lava state/heat policy; the common numerical/transport framework can be shared. Rendering/Materials/Lighting consume snapshots rather than owning the solver. Bank breaches and crater flooding are actual world interactions.
- **World progression:** early bright wet forest -> forest/mountain transition -> mountain -> corruption/volcanic approach -> Wyrm lair. World map selects the site; WorldGen creates seeded physical geography and route topology. In-Hunt regions should stream seamlessly.
- **Destruction:** one Spell impact may damage terrain and physical objects. Committed changes invalidate collider/nav/render/lighting/fluid-derived data in bounded order. No renderer-visible crater that is nonphysical.
- **Graphics:** 2.5D readable pixel art with strong grounded directional/contact shadows, normals and shader-driven emission; no first-person block-game look.
- **Product:** offline single-player first; do not introduce network dependencies into fixed-step simulations.

## 4. One-way ownership / dependency architecture

    Web/Pages host OR native iOS/Android host
      -> Shared game/Hunt C# composition and command dispatcher
          -> Core contracts + fixed-step coordinator
          -> Gameplay (spells, AI, encounter, progression, objectives)
          -> WorldGen -> terrain initialization descriptors -> Voxel authority
          -> Physics -> read-only Voxel/Object spatial queries
          -> Navigation -> read-only collision/capability snapshots
          -> Fluids -> read-only terrain queries + terrain-change events
          -> World Objects -> read-only terrain/support events
          -> Rendering/Lighting/VFX/Audio -> read-only snapshots and events
      -> WebGL/Blazor OR native GPU/OS presentation adapters

Only the composition root may reference multiple concrete engine implementations. Business/scene rules never import other engines' private types. Avoid a universal service locator and an unbounded global event bus. Use specific command, query and event contracts. The dependency graph must be acyclic.

**Authority matrix:**
- Voxel owns solid terrain occupancy and committed edits.
- World Objects owns props' state, IDs and lifecycle.
- Physics owns actor position and collision responses; never silently edits terrain.
- Fluids owns fluid state and simulation.
- Gameplay owns health, damage decisions, spell effects, state progression and loot.
- WorldGen owns recipes and initial placement intent, not live world state.
- AI owns decisions, not spawns, hit authority or physics.
- Encounter owns spawn scheduling, boss phase rules and wave outcomes.
- Materials owns material response; Lighting owns light evaluation; Rendering owns GPU resources.
- Save coordinator serializes owner-produced snapshots; it must not create second authorities.

**Core command/event example — Fireball impact:**
1. Input -> gameplay cast command.
2. Physics/projectile step resolves the contact using committed spatial queries.
3. Combat calculates target damage and sends terrain/object damage *commands* to the proper owning engines.
4. Owners commit once, increment world/owner revision and emit immutable changes.
5. Physics/Navigation/Fluids/World Objects consume applicable revisioned invalidations.
6. Renderer, Lighting, VFX and Audio consume read-only outputs. No visual system mutates the impact.
7. Save/replay records the accepted inputs and committed state changes.

Contracts must include version, world/session ID, entity/chunk ID, tick, epoch/revision, command correlation/idempotency where needed, and local ownership. Require disposal/unsubscribe, cancellation/reset, and bounded queues. Block stale callbacks after region eviction/reload.

## 5. Strict engineering and acceptance leash

For **every** module, require: (1) owner and responsibility; (2) minimal public ports and data shapes; (3) explicit allowed dependencies and forbidden imports; (4) deterministic fixture or reference fake; (5) cross-engine integration test; (6) iOS and Android build compatibility; (7) measured performance and memory cost; (8) visible Hunt demonstration; (9) release/rollback evidence.

- No engine is considered DONE because code exists, an issue is closed, WebGL appears correct, a green CI badge exists or a demo URL loads.
- No feature is allowed to change another engine's authority just to get a demo working.
- Avoid concurrent modifications to the old JS engines; port in independent native branches with reviewable scope.
- Changes to public contracts require versioning and tests for old/new consumers.
- A package must be swappable with an intentionally simple fake at the composition root.
- Native/AOT compatibility gate: no hidden runtime code generation/reflection-only dependency; compile and run the *same* C# game core on the browser WASM host and selected native runtime.
- Real device profile: named iPhone + named Android device, 10+ minute sustained load, actual p50/p95/p99 frame time, hitches, CPU/GPU, memory, heat and suspend/resume. 16.67 ms is the **full frame budget** at 60 FPS; do not promise components arbitrary shares without measurements.
- Keep CI evidence separate from physical-device evidence. A signed iOS build or TestFlight install is independent of the Android APK/AAB.
- The first actual game vertical slice uses the **C# core** with the Pages renderer. A minimal **native iOS and Android execution proof of that same core** is required early; full native gameplay parity is a separate, explicit acceptance gate.

## 6. Delivery order and concrete exit gates

| Gate | Deliverable | Cannot pass without |
| --- | --- | --- |
| N00 — Multi-host reality check | A pure C# simulation step runs via Blazor WASM/Pages and within two installable native test apps | Prove the same assembly/game rules on web, iOS and Android; no WebView; document signing/Xcode path |
| N01 — Core and presentation seams | C# engine packages, commands/render snapshots, two composition roots, fake engine AND fake presenter, tests | No cycles; backend swap and renderer swap demonstrated without gameplay rewrite |
| N02 — Pages C# terrain slice | Pure C# physical voxel chunk, mesh-change snapshot, collision, touch wizard, Fireball crater on the Pages frontend | Browser sim has **no JS game authority**; deterministic snapshot/replay and same core runs in native smoke apps |
| N03 — Interacting engines | Objects, navigation, terrain events, water/lava flows and lighting presented via browser | C# owners produce coherent state; disabling or swapping the WebGL presenter changes visuals, not outcomes |
| N04 — Pages Hunt vertical slice | Seeded Wet Forest, streamed regions, one horde, extraction, spells, saved run | Playable Pages start-to-extraction with C# core, no frontend simulation code; native parity tasks identified |
| N05 — Expanding content | Biomes, packs, rares, miniboss phases, Wyrm tier, Arcane Web/Spell Lab | Independently extensible content and testable mechanics, no engine-specific switches |
| N06 — Native parity and shipping acceptance | Native renderer(s), complete Hunt parity, sustained performance, accessibility, crash recovery, signing/store distribution | Both physical phones render and play the exact same C# rules, pass agreed thresholds and archived evidence |

N00 and N01 validate that the shared C# domain can run in **both browser and future native hosts**, but Pages remains the primary rapid-feedback gameplay frontend during N02-N05. Within each gate prefer the smallest integrated **vertical slice**, not isolated labs. A Pages pass is **never** native release acceptance; native parity failures block N06.

## 7. Current repository disposition

At branch main, the V2 repository is JavaScript/HTML/WebGL-oriented; unlike V1 it does not yet have a C# domain/application solution. Its V2 docs already define healthy boundaries and known coupling problems (docs/ENGINE-COUPLING-REVIEW.md). The source tree has browser-bound presentation and no native project. Treat implementations in the following categories:

1. **Implement C# domain engines using existing V2 fixtures:** voxel signed occupancy, deterministic edits/replay, WorldGen seeded topology, fluid solver, AI reasoning, collision; keep current JS until new authoritative outputs are proven.
2. **Keep and adapt the browser renderer as a presenter:** separate the existing WebGL, Canvas, DOM/touch and browser persistence paths from their JS simulation authorities; translate C# scene deltas and commands without moving game decisions into JS. Native adapters come later.
3. **Reuse where valid after approval:** newly authored V2 image/audio assets and gameplay content descriptors, following native asset pipeline/import checks.
4. **Retain as regression oracle:** seeded fixtures and browser outputs to compare contract outcomes, not as runtime dependencies.
5. **Do not create false parity claims:** scripts, GLSL, Blazor WASM and mobile-browser benchmarks do not prove native iOS/Android performance or gameplay runtime compatibility.

## 8. Immediate next task

**N00: Prove shared C# simulation with two frontends.** First demonstrate an authoritative C# tick, command and scene delta in Blazor WASM on GitHub Pages. In parallel create minimal iOS/Android executable host probes loading that *same C# simulation library* (native renderer framework TBD). Record exact build/phone evidence before choosing the production mobile renderer. Then implement N01 ports and N02 with Pages as the fast playable renderer, never making Pages-specific code authoritative.

## References

- Existing repo decisions: docs/architecture/ADR-0001-replaceable-engines.md; docs/architecture/ADR-0002-hunt-expeditions-and-journey.md
- Existing ownership audit: docs/ENGINE-BOUNDARIES.md; docs/ENGINE-COUPLING-REVIEW.md
- Existing AI design: docs/AI-ENCOUNTER-V2-EXTENSIBILITY-AND-V1-LESSONS.md
- Verified V1 .NET WebAssembly frontend: https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Presentation.Web/Wyrmforge.Presentation.Web.csproj
- Verified V1 pure C# domain/application: https://github.com/pjotrcasteel/Wyrmforge/tree/main/src
- Native host/runtime choice is deliberately provisional until C# core build/execution on iOS and Android is demonstrated.
