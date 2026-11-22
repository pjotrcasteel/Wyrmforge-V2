# Wyrmforge V2 — Native Mobile Engine Map

**Status:** PROPOSED ARCHITECTURE, not approved/implemented.  
**Date:** 2026-11-22.  
**Scope:** native iOS and Android Wyrmforge V2; modular game engines inside a single application runtime.  
**Relationship:** This is a **platform migration and component inventory**, not a competing gameplay roadmap. Continue to use docs/ROADMAP.md and docs/DELIVERY-TASKS.md for historical work; open a separately reviewed native implementation track.  
**Existing decisions:** preserve docs/architecture/ADR-0001-replaceable-engines.md and ADR-0002-hunt-expeditions-and-journey.md.  
**Safety:** This PR adds documentation only, does not rewrite engines or overwrite parallel active branches.

## 0. Correct the platform contract

- Deliverable is an installable, **native iOS game and native Android game**. A web page or a WebView wrapper is not acceptable.
- Core gameplay/terrain/AI is C# and runs in native builds, with GPU rendering performed through platform graphics APIs (Metal on iOS, Vulkan/OpenGL ES as supported on Android).
- Fixed oblique/orthographic 2.5D pixel-first presentation over genuine editable 3D terrain. One metre world blocks; ten divisions per axis when microvoxel detail is needed.
- Mobile is the actual product. Desktop is permitted as an editor/debugging environment, never the acceptance environment.
- Target 60 FPS on a defined supported-device tier; do not call that achieved until physical-device sustained profiles pass. Include quality tiers, memory, thermal, battery and resume.
- Never import V1 runtime/assets or couple new production packages to the JavaScript/WebGL implementation. Existing V2 JS is a behavioural reference and migration evidence only, not the production runtime.
- All engine boundaries must be replaceable and verifiable; no new direct dependency on another engine's implementation.
- Do not declare any engine complete from a web-lab demonstration or CI-only test.

## 1. Proposed native host; approval gate

**Recommended starting candidate:** Unity 6 LTS, C#, IL2CPP/AOT, Universal Render Pipeline (mobile Forward path). This creates real iOS/Android applications, rather than loading a website in a wrapper. Unity owns the platform runtime, native graphics integration, editor and packaging; **Wyrmforge owns the custom modules** below.

**Why this candidate:** C# skills are reusable; iOS and Android builds are supported; stable per-assembly boundaries are possible; URP provides a mobile GPU integration point without writing Metal/Vulkan backends from scratch.

**Trade-offs:** an engine vendor/runtime dependency remains; stock Unity physics/lighting is not automatically appropriate for a microvoxel, pixel-first game; IL2CPP imposes AOT/linker constraints; profiling remains mandatory. Godot C# mobile support is documented as experimental in 4.5 and deserves evaluation only if this candidate fails a proof gate. A bespoke Metal/Vulkan/C++ renderer is a larger engineering commitment, not the default.

**Required first proof before selecting Unity permanently:** commit a reproducible native project; build/install an Android APK or AAB and an iOS app using Xcode/macOS or a macOS CI runner; display the same native 2.5D orthographic scene; run pure C# gameplay logic and one GPU draw; collect CPU/GPU frame, startup/memory, suspend/resume and touch evidence on both devices. No WebView, no browser URL, no JS game runtime.

**Critical build dependency:** Windows may be used for Unity editing and Android work, but local iOS builds require Xcode/macOS or a macOS-based build service. Device/Apple signing setup is a required task, not a reason to postpone iOS until the end.

The candidate is a **proposal**, not silent approval for a full rewrite. The first implementation PR must prove both platforms.

## 2. Repository layout (target, not yet created)

    native/
      Wyrmforge.Mobile/             # Unity application/project, composition, scenes, platform settings
      packages/
        com.wyrmforge.contracts/    # DTOs, IDs, units, ports, events; no UnityEngine references
        com.wyrmforge.core/         # tick scheduler, deterministic commands, ownership/lifecycle
        com.wyrmforge.terrain/      # voxel authority, edit ledger, spatial queries
        com.wyrmforge.worldgen/     # seeded world and expedition geography
        com.wyrmforge.physics/      # world collision and actor/projectile movement
        com.wyrmforge.worldobjects/ # props and structural support state
        com.wyrmforge.fluids/       # water/lava simulation
        com.wyrmforge.navigation/   # route/path capability checks
        com.wyrmforge.gameplay/     # combat, AI, encounters, hunt, progression
        com.wyrmforge.presentation/# material, rendering adapters, lighting, animation, VFX
        com.wyrmforge.platform/    # native input, audio/haptics, storage/lifecycle
      tests/                        # host-independent contract + simulation suites
      benchmarks/                   # seeded stress, memory/thermal/performance fixtures
      docs/                         # native build evidence and device matrix

These are ownership packages, **not a demand for one assembly for every tiny utility**. Major modules may use separate Runtime and Adapters assemblies with explicit assembly-definition references. Pure model/simulation packages must not import UnityEngine; Unity-specific implementations reside in adapter/host assemblies. No feature imports internal implementation namespaces across packages.

The current root src/, art/, tests/ and web labs remain intact during staged migration. Relocation/archival occurs only after parity and explicit review.

## 3. Engine and system inventory

**Symbols:** P = platform/foundation; W = world; S = simulation/movement; R = visual/audio; G = gameplay; Q = quality/tooling. Priority: **A = native proof / first playable vertical slice**, **B = Hunt baseline**, **C = later product/release**.

| ID / owner | What it does | Why we need it | Priority |
| --- | --- | --- | --- |
| P00 Native host | Owns iOS/Android application lifecycle, platform graphics startup, asset loading and composition root | Without real app binaries all other native requirements are unproved | A |
| P01 Contracts and coordinates | Defines immutable DTOs, stable IDs, metres/micro-units, chunk keys, interfaces, event schema versions | Allows engine implementation replacement without gameplay rewrites | A |
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
| R01 Native renderer | Mobile GPU buffers, draw scheduling, terrain/props/sprite composition, pixel-perfect camera | Replaces browser WebGL and produces the actual 2.5D scene | A |
| R02 Materials / surface | Physical-vs-visual material descriptors, albedo, normals, roughness, wetness, emission and variants | Textures remain reusable and do not own geography or lighting | B |
| R03 Lighting / shadows | Generic light/occluder inputs, directional/contact shadows, emissive spells/lava, mobile budgets | Grounds trees, actors and cliffs; readable contrast across corruption stages | B |
| R04 Effects / particles | Projectile trails, impacts, fire, smoke, ash, rain, foam, sparks and camera feedback | Expresses gameplay events without changing authoritative state | B |
| R05 Animation / presentation | Wizard/enemy directional sprites, attack telegraphs, skeletal or frame animation, facing and timing | Combat needs readable 2.5D pixel characters and accurate hit feedback | B |
| R06 Sound and haptics | Native audio mixer, ambience, spell feedback, spatial cues and phone haptic adapters | Reusable gameplay event consumers with native platform delivery | B |
| G01 Input and camera controls | Touch joystick/gestures, safe area, orientation, remappable commands, oblique camera follow | Smartphone gameplay must work without desktop mouse/keyboard | A |
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

    Native iOS/Android host
      -> Game/Hunt composition and command dispatcher
          -> Core contracts + fixed-step coordinator
          -> Gameplay (spells, AI, encounter, progression, objectives)
          -> WorldGen -> terrain initialization descriptors -> Voxel authority
          -> Physics -> read-only Voxel/Object spatial queries
          -> Navigation -> read-only collision/capability snapshots
          -> Fluids -> read-only terrain queries + terrain-change events
          -> World Objects -> read-only terrain/support events
          -> Rendering/Lighting/VFX/Audio -> read-only snapshots and events
      -> Unity adapters / native GPU / OS services

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
- AOT/IL2CPP compatibility gate: no hidden runtime code generation/reflection-only dependency; run real release-style native builds.
- Real device profile: named iPhone + named Android device, 10+ minute sustained load, actual p50/p95/p99 frame time, hitches, CPU/GPU, memory, heat and suspend/resume. 16.67 ms is the **full frame budget** at 60 FPS; do not promise components arbitrary shares without measurements.
- Keep CI evidence separate from physical-device evidence. A signed iOS build or TestFlight install is independent of the Android APK/AAB.
- The first real vertical slice must be playable on **both native platforms**, not just in the Unity Editor.

## 6. Delivery order and concrete exit gates

| Gate | Deliverable | Cannot pass without |
| --- | --- | --- |
| N00 — Native reality check | iOS and Android installable apps from same committed C# project, actual native render and touch | Install/run evidence from each phone; no WebView; reproducible build instructions; Xcode/macOS path |
| N01 — Engine skeleton | C# packages, pure contracts, composition root, fake/reference implementations, test pipeline | No cycles; compile-time boundary tests; module swap demonstrated |
| N02 — Terrain vertical slice | Physical 3D/microvoxel chunk, derived mesh, collision, touch wizard, Fireball crater | Same resulting crater geometry and collision on both native phones; replay and frame metrics |
| N03 — Interacting systems | Objects, navigation, terrain events, water/lava flows, lighting | Fireball breaches a riverbank; actor route updates; tree support/collision remains coherent |
| N04 — Hunt vertical slice | Seeded Wet Forest, streamed regions, one horde, extraction, spells, saved run | Playable native start-to-extraction path with deterministic seed and resume |
| N05 — Expanding content | Biomes, packs, rares, miniboss phases, Wyrm tier, Arcane Web/Spell Lab | Independently extensible content and testable mechanics, no engine-specific switches |
| N06 — Shipping acceptance | Sustained thermal/performance, accessibility, crash recovery, signing, platform store distribution | Both physical devices pass agreed thresholds and release evidence is archived |

N00 and N01 block broad implementation of N02-N06. Within each gate prefer the smallest working **vertical slice** rather than finishing every isolated engine in a laboratory. Native build failures always block claims of completion.

## 7. Current repository disposition

At branch main, the repository is JavaScript/HTML/WebGL-oriented. Its V2 docs already define healthy boundaries and known coupling problems (docs/ENGINE-COUPLING-REVIEW.md). The source tree has browser-bound presentation and no native project. Treat implementations in the following categories:

1. **Re-specify and port algorithms:** voxel signed occupancy, deterministic edits/replay, WorldGen seeded topology, fluid flow solver, AI reasoning, collision rules.
2. **Rewrite platform adapters:** renderer/shaders, WebGL mesh upload, Canvas sprite lighting, DOM touch, workers, browser persistence, audio.
3. **Reuse where valid after approval:** newly authored V2 image/audio assets and gameplay content descriptors, following native asset pipeline/import checks.
4. **Retain as regression oracle:** seeded fixtures and browser outputs to compare contract outcomes, not as runtime dependencies.
5. **Do not create false parity claims:** scripts, GLSL and mobile-browser benchmarks do not prove IL2CPP/Metal/Android performance.

## 8. Immediate next task

**N00: Produce a native proof in a separate PR**, not another browser lab. Include the minimal Unity project, two platform build targets, one C# scene/tick, static terrain render, touch input, and real-device run evidence. After it works, freeze the host choice and implement N01 and a tiny N02 vertical slice. A framework decision without a native proof is provisional.

## References

- Existing repo decisions: docs/architecture/ADR-0001-replaceable-engines.md; docs/architecture/ADR-0002-hunt-expeditions-and-journey.md
- Existing ownership audit: docs/ENGINE-BOUNDARIES.md; docs/ENGINE-COUPLING-REVIEW.md
- Existing AI design: docs/AI-ENCOUNTER-V2-EXTENSIBILITY-AND-V1-LESSONS.md
- Unity mobile platform support: https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/getting-started-installing-unity/system-requirements
- Unity iOS Xcode/macOS requirements: https://docs.unity.com/en-us/engine/6000.0/manual/platform-specific/iphone/ios-building-and-delivering/build-process
- Unity AOT/IL2CPP: https://docs.unity.com/en-us/engine/6000.6/manual/programming-environment/scripting-backends/intro
- Unity per-module assembly definitions: https://docs.unity.com/en-us/engine/6000.6/manual/scripting/compilation-and-code-reload/script-compilation/assembly-definition-files/assembly-definitions-intro
