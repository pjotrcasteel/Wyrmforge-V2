# World Generation V2 — independent authored-site composition

**Status:** World Generation V2 foundation (first real replaceable engine after the
Voxel V2 foundation). This is NOT the old voxel lab's flat/hill fixture generator,
the Objects engine, the materials renderer, or an in-game Hunt.

## Contract and ownership

World Map chooses a site and supplies a \`wyrmforge.world-site-recipe.v2\`
containing region/site/encounter identity, site kind, seed, world-state revision,
corruption progress and chunk pitch. This engine may **not** read game globals,
call a renderer or import \`VoxelWorld\`.

World Generation V2 returns a \`wyrmforge.generated-site.v2\` value with:

- a canonical deterministic hash and immutable input recipe;
- a deliberate site layout: named entrances, exits, meaningful primary route,
  spur to a landmark, clearings and future World Objects placement hints;
- a real *layered 3D* solid terrain definition, encoded as canonical signed
  X-directed runs in the existing \`voxel-v2.terrain-initialization.v1\` contract;
- a topology audit proving that the mandatory exits, landmark and clearings
  are reachable across one-voxel walkable surface steps.

The Voxel V2 loader alone converts those runs into authoritative voxel storage,
collision, destruction, replay, and derived meshes. The generator doesn't
access internal stores, mutate a loaded world, render textures or instantiate
objects. Terrain features describe future placement intent, **not** fake props
or alternate collision authority.

## Design patterns and strict dependency direction

| Pattern | Implementation | Reason |
| --- | --- | --- |
| **Strategy** | \`MapKindRegistry\`, \`src/world-generation/map-kinds.mjs\` | New map kinds register \`{kind,compose(builder,context)}\`; no core switch or voxel edits |
| **Builder** | \`SitePlanBuilder\` | Bounded, named route and clearing composition with deliberate landmarks; no random scattered geometry |
| **Specification** | \`specifySiteTopology\` | Reject incomplete or unreachable sites before returning geometry |
| **Adapter** | \`voxel-terrain-adapter.mjs\` | **Only** worldgen module importing the public voxel terrain-definition validator |
| **Dependency injection** | \`new WorldGeneratorV2({registry})\` | Replace all kind strategies or the entire engine without touching terrain consumers |
| **Deterministic pipeline** | \`WorldGeneratorV2.generate(recipe)\` | Separate site planning, landform shaping, topology audit, canonical run encoding, and hash |

Dependency direction: World Map / game orchestration → World Generation V2 →
**versioned external terrain definition** → Voxel V2 loader. World Objects,
materials, navigation and lighting consume agreed outputs separately; none
are imported by World Generation V2.

## Built-in kinds: designed before noisy detail

- **Wet forest:** low rolling ground, shallow wetland basin, linked wooded
  clearings, and a ruined-place approach. The basin is **placement metadata**,
  not a water simulation.
- **Forest → highland:** ascending terrain, legible foothill ridges and a
  woodland-to-rock transition while retaining the mapped traversable route.
- **Mountain pass:** bounded rocky escarpments and a climbable central valley,
  with a linked mountain landmark and usable retreat corridor.

All three share an intended main south-to-north route, secondary landmark
spur and encounter clearings; each strategy creates a *different landform*.
Broad authored shapes establish the map, seeded coherent noise only adds
variation. Route and clearing grades are blended into the real surface before
canonical 3D material runs are emitted. The topology specification rejects
unreachable required points instead of pretending that a visual trail is
walkable.

Future kinds (wet forest at other stages, burned forest, volcanic approach,
Wyrm lair, monastery, etc.) each become **new Strategy modules**. Register
one with \`MapKindRegistry.register({kind:'...',compose(builder,{seed,recipe}) {
...}})\`; the core generator, output schema and voxel loader do not change.

## Preview and stress-test approach

The existing \`external-terrain-lab.html\` now offers a **Site kind** selector
and seed. Three real generated sites and the original fixed diagnostic arch
share the *same* \`V2ExternalTerrainLoader\`, worker mesh bridge, WebGL2 canvas,
checkpoint and bounded edit path. No new debug engine or extra HTML lab page.

- Open the external terrain lab; pick **Wet forest**, **Forest to mountains**
  or **Mountain pass**, and try different seeds. Different seeds change
  coherent landforms without moving mapped entry/exit promises.
- The existing **Carve generated terrain** button acts on the real authored
  world using the same terrain edit command. Render, collisions and replay
  are still Voxel V2's responsibility.
- 16³ / 32³ pitch and both cameras remain comparison controls, not part
  of the new generator engine.

The first tests prove deterministic hashes and loaded voxel snapshots,
negative chunks, real signed 3D strata, map-kind extensibility and reachability.
**Next-engine performance/stress work** belongs in this World Generation
workflow as the map dimensions and objects grow. The current fixed 40×40
footprint is intentionally bounded by the V2 loader, not a final Hunt size.

Outstanding: physically authored vegetation/rocks/buildings (World Objects V2),
Wyrm corruption material art, generated rivers/water simulation, actual
game-side World Map/Hunt integration, advanced crossings and multi-layer route
topology, and sustained mobile stress testing. Don't claim those as delivered.
