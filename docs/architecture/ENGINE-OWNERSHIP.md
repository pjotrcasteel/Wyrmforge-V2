# Engine architecture and dependency contracts

**New implementation: all game/simulation engines are independent pure C# class libraries.** No source reference to V1 or old/ JavaScript runtime. The existing engine-name inventory describes desired ownership; the new C# projects are scaffolds until individually implemented and accepted.

## Layer boundaries

1. **Contracts** — shared immutable units, IDs, command/queries, engine interfaces and versioned snapshots. No renderer or platform dependencies.
2. **Domain / Application** — game rules and fixed-step orchestration. Depends on contracts, not concrete implementation projects.
3. **Engine implementations** — separate projects for each authority. They reference Contracts only; no engine references another concrete engine.
4. **Bootstrap / Composition** — the **only** layer permitted to reference multiple concrete engine assemblies, resolve dependencies and connect ports.
5. **Presentation.Contracts** — read-only geometry, semantic material IDs, primitive descriptors, VFX/audio/UI payloads; no domain mutation.
6. **Frontends** — web Pages/Blazor WASM and future native iOS/Android renderers, one game logic authority.

## Engine inventory

| Project | Authoritative ownership | Consumed ports / source events | State |
| --- | --- | --- | --- |
| Terrain | Sparse solid 3D voxels, 0.1 m microcells, edit revisions/queries | TerrainInitialization, TerrainMutation | Minimal C# smoke implementation |
| WorldGeneration | Deterministic seeded geography and route/landmark/terrain descriptors | SiteRecipe | Minimal C# placeholder ground implementation |
| Meshing | Read-only terrain derived mesh revisions and dirty work scheduling | TerrainSnapshot | Scaffold |
| Streaming | Residency, region prefetch/eviction, snapshot reload | RegionQuery, world revision | Scaffold |
| Physics | Collision/step rules and eventual actor/projectile motion | Read-only geometry via IWorldGeometry, movement capabilities | N00 reference grid-step implemented; continuous physics pending |
| WorldObjects | Physical IDs, tree/rock/structure damage, support lifecycle | Terrain and support change facts | Scaffold |
| Fluids | Water/lava state and bounded deterministic flow/heat | Terrain snapshots and mutation facts | Scaffold |
| Navigation | Traversability paths respecting physical mover capabilities | Physics mover profile, spatial occupancy | Scaffold |
| AI | Perception/memory, intent decisions, morale/pack steering | Observation and navigation queries | Scaffold |
| Encounters | Spawns, horde pacing, rare rolls, boss scripting/phases | Hunt phase and combat facts | Scaffold |
| Combat | Spells, hit authority, damage/status, action/telegraph timing | Physics hit reports, terrain/object damage command ports | Scaffold |
| Progression | Arcane Web, mutators, Hunt choices, rewards, permanence | Committed gameplay/reward events | Scaffold |
| Hunt | Journey, objectives, branch, extraction and game-state transitions | Engine ports and encounter outcomes | Scaffold |
| Presentation | Browser/native drawing, shaders, lighting/shadow presentation, sprites, VFX and UI | Snapshot/render contracts | Future frontend packages |

No magic hex palette is stored in Terrain/WorldGen. Terrain has material IDs and physical cells; **the presenter** maps them to a box + HEX color.

## Dependency examples

**Fireball:** PlayerCommand -> Combat resolves intent -> Physics registers contact -> Combat sends voxel/object damage commands -> Terrain/Objects commit revisions -> Nav/Fluids/Meshing update their derived views -> frontend draws changed boxes; combat owns damage, not the scene renderer.

**Water breach:** Terrain edit event -> Fluids recalculates connected flows -> scene delta describes fluid surface; renderer draws flat blue shapes. WorldGen only seeds the river's initial recipe and never owns ongoing water.

**Ashling jump:** AI emits jump intent based on observed path; Physics owns capability checks and committed movement; Nav plans using the same movement capabilities. The Wizard/Hollowed cannot freely step 1 m like Wolf/Ashling.

**Boss transition:** Encounters owns phase changes; AI chooses allowed intents; Combat owns telegraph/hit resolution; frontend simply displays red geometric warning areas and a primitive boss shape.

## Guardrails

- Exactly one owner per mutable state. No static mutable singleton or global mutable event bus.
- Contracts explicitly specify units, IDs, epochs/revisions, ordering, subscription disposal and stale-event handling.
- Core code may expose headless state hashes for deterministic replay. Frontends may interpolate visuals but cannot change simulation truth.
- Use fake/reference ports and isolated contract tests for every new engine; cross-engine integration tests use the composition root.
- A green compile and 0 cycles verify scaffolding only. They do not certify gameplay or mobile performance.
- No new detailed art until a full placeholder Fire Tier-I Hunt is accepted.
