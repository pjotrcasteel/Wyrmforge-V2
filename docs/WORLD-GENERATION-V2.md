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
| **Dependency injection** | \`new WorldGeneratorV2({registry,terrainAdapter})\` | Replace map-kind strategies **and** the receiving terrain engine independently |
| **Deterministic pipeline** | \`WorldGeneratorV2.generate(recipe)\` | Separate site planning, landform shaping, topology audit, canonical run encoding, and hash |

The standalone core **requires an injected terrain adapter**. The optional
`src/world-generation/index.mjs` composition root wires the built-in Voxel V2
adapter for the current demo. Replacing Voxel V2 means supplying another
`terrainAdapter` to `WorldGeneratorV2`; the generated-site layout strategies
and topology checker stay unchanged. An automated test runs the core using a
fully synthetic replacement output format.

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

## Mobile-first site inspection — 2026-11-13

The World Generation preview page now gives the generated world its own
full-height viewport. The old always-visible control tray consumed most of
the iPhone screen and could crop the top of tall mountain sites.

- **Map settings & actions** is a collapsed-by-default overlay, so choosing
  the site kind, seed, camera, chunk pitch, carve, or save does not permanently
  reduce the rendered map area. A short live readiness/error indicator stays
  visible even when settings are closed; detailed engine diagnostics remain
  inside the expanded panel.
- A **Focus** mode hides the header and expands the same WebGL canvas to the
  browser's available viewport. Fit, +/− zoom and drag/pinch gestures work
  without invoking fullscreen APIs that are inconsistent on mobile Safari.
- The viewer fits the actual 3D `layout.footprint`, including minimum and
  maximum elevation, by projecting all eight volume corners through the
  existing camera basis. It centers that projected volume and reserves
  margins, preventing the tall rocky site from being cropped at the top.
- The Fit control resets temporary pan/zoom; changing site kind or camera
  also recenters the view. All navigation is presentation-only. It never
  edits the site recipe, invokes the generator, loads voxels, remeshes terrain,
  or changes the replaceable-engine contract.

Automated tests cover every built-in generated kind at phone and landscape
sizes, both camera presets, world-corner clipping, zoom bounds and the
collapsed/focus UI contracts. This is a **viewer usability change**, not
new terrain generation or a new camera engine.

## Horde-survival arena grammar and excavatable discoveries — 2026-11-13

The player confirmed that the generated Mountain Pass looks promising, but the
main experience must remain a **Vampire Survivors-style horde survivor**,
not a narrow linear exploration map. The three existing map-kind Strategies
now add a compact `central-arena` and four distinct flank approaches, keeping
their authored terrain silhouettes, route landmarks and geographical themes.

- **Combat floor:** A broad, grade-smoothed central space (7 voxel radius)
  is large enough for kiting, dodging, and movement around groups of enemies,
  while steep cliffs and wetland shapes still frame the map outside it.
- **Approach routes:** Four authored terrain-grade corridors arrive from
  north/east/south/west. They are not enemy paths or automatic spawn points.
  The runtime Enemy/Encounter engine will choose actual spawn positions,
  enemy density, timing, escalation, and dynamic avoidance based on the
  **current** world after player destruction.
- **Specification pattern:** the new `encounter-space-specification.mjs`
  validates a mostly level movement footprint, sufficient distinct ingress
  directions, walkable ingress grades, and separation between the arena and
  hidden discovery envelopes. Incomplete/unwalkable plans fail generation.
- **Buried discovery candidate:** each map kind reserves a covered diggable
  location outside the main fighting floor and includes its surface height,
  planned burial depth and location identity. It is only a *potential site*
  for a hidden chest or other secret later. Nothing generates a chest,
  reward, enemy, object, or loot table today. Player spell destruction still
  uses Voxel V2 through the existing terrain command API.
- **Optional overlay:** The existing external map viewer can show translucent
  arena bounds and four ingress guides. This is diagnostic visualization
  only, defaults off, and never reveals buried discovery sites.

**Strict ownership boundaries:** World Generation V2 owns geographical
intent, traversability and discovery candidates. Voxel V2 owns actual solids,
destruction and collision. World Objects V2 may eventually instantiate
discoverable physical chests in eligible buried sites. Loot/Progression owns
their rewards; Encounter/AI owns hordes, difficulty and spawn scheduling.
Camera/Renderer only draws the world. The generator cannot import any of
those implementations or assume its candidate survives a later terrain edit.

The 40x40 test site is a bounded first arena sample, not final Hunt size.
Next World Generation development should refine encounter flow and themed
arena composition with mobile stress measurements, while preserving each
map kind as a separately replaceable Strategy.
