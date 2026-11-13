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

## WorldGen v2.1 — authored escape loops and player choice

Vampire-Survivors-like combat must support **movement and escape around hordes**,
rather than merely place a wide fighting floor between a single entry and exit.
This version adds **two independent walkable escape loops** around each
built-in map kind's central arena:

- **Wet Forest:** broad woodland loops around the grassy fighting glade;
  players can retreat on either side without crossing the main arena.
- **Forest → Highland:** deliberately staggered foothill switchbacks with
  graduated side routes, leaving cliffs and forest slopes outside the path.
- **Mountain Pass:** cliffside-shelf alternatives that let the player
  navigate around combat pressure without requiring a tunnel or new physics.

All layouts are *authored Strategy decisions*, not random corridors.
They share south/north rejoin anchors but differ in intermediate waypoints,
presentation styles and local terrain shape. Seeds vary the surrounding
landform, while the core route promise remains stable.

### Explicit patterns, public contract and acceptance

**Builder:** each strategy uses `addEscapeRoute({id,side,style,nodes,width})`;
the Builder requires a matching east/west pair with shared endpoints, but
an injected custom kind may deliberately omit the optional escape grammar.

**Terrain composition:** `escape-route-geometry.mjs` rasterizes diagonal
waypoints into cardinally contiguous walkable cells. It grades the existing
heightfield along each route and softens adjacent shoulders. The Voxel
adapter and voxel engine remain unchanged; this is still one authored
layered terrain world, not a second collision or path authority.

**Specification:** `escape-route-specification.mjs` rejects routes with
steps larger than one voxel, diagonal jumps, shared interior cells,
passage through the active combat floor, missing cardinal flanks or
unbounded lengths. It audits actual generated heights, not just the site
plan. The existing `specifyEncounterSpaces` and `specifySiteTopology`
audits still run afterward.

**Diagnostics:** when the existing **Horde survival layout** option is
enabled, the viewer draws two distinct alternate-route guides in addition
to the combat ring and enemy approach markers. Hidden discovery candidates
remain invisible, and no new render/voxel API is introduced.

**Versioned determinism:** generation semantics advance to
`worldgen-v2.1.0`; the public `wyrmforge.generated-site.v2` shape adds
`layout.escapeRoutes` and `layout.escapeAudit`. The terrain initialization
contract and engine adapter are unchanged.

**Ownership:** World Generation owns geographic options; Enemy AI and
horde spawning own tactical use of those options. Camera owns following
the player; Voxel V2 owns runtime destruction and collision; World Objects
and Loot own any future hidden chest content. After terrain destruction,
navigation consumers must re-evaluate the current world, not assume these
initial routes stay open forever.

Automated tests cover three distinctly composed map kinds, deterministic
seed variation, 16³/32³ real Voxel initialization and actual traversable
height steps, explicit route independence and invalid disconnected plans.
The existing WorldGen 24-site CI stress baseline still applies. Larger
runtime arenas, mobile horde-load simulation and final camera/gameplay
acceptance remain separate future work.

## WorldGen v2.2 — handcrafted horde circulation, not just escape lines

The next World Generation milestone builds **secondary maneuver spaces** that
support continuous horde-survival combat rather than a single central floor.
The generator still owns *geography*, not enemies, enemy pathfinding, object
placement, chests, rewards, lighting or camera behavior.

The three built-in **Strategy** implementations now choose different tactical
identities and physical locations:

- **Wet Forest:** a broad mossy glade to the northwest and a narrower
  fern-lined lowland gully to the southeast.
- **Forest → Highland:** a lower, wider foothill terrace and a constricted
  rocky ridge turn.
- **Mountain Pass:** an uneven western stone terrace and an eastern cliff
  overlook. These connect to the central fighting floor without creating a
  single mandatory chokepoint.

Each strategy declares pockets and wide terrain links with the existing
**SitePlanBuilder**. The **combat-flow-geometry** compositor turns that design
into actual graded terrain, with broad lane shoulders and distinct small
plateaus, before the escape-loop finalization step. It does *not* write
VoxelWorld state; the existing adapter still emits the public terrain
initialization definition.

The new **combat-flow Specification** audits the produced heightfield, rather
than trusting drawn links. It enforces separately located maneuver pockets,
90%+ walkable inner floors, a minimum of three adjacent side cells with
one-voxel-or-less height difference at each route step, and continuous
cardinal traversal from the central arena into each pocket. Custom Strategy
plugins can omit this optional combat grammar entirely.

Site layout now includes `maneuverPockets`, `flowLinks` and `combatFlow`
under the existing `wyrmforge.generated-site.v2` schema. Deterministic
generator semantics advance to **worldgen-v2.2.0**. The immutable recipe,
voxel adapter schema, material IDs, renderer, and runtime horde/loot engines
are unchanged.

The existing optional combat overlay additionally draws blue maneuver rings
and pale connector guides. These are diagnostics only and never reveal hidden
discovery candidates.

CI validates real voxel-loaded movement width and step heights across
map kinds/chunk sizes, seed-to-seed deterministic variation, established
four-flank ingress and west/east escape routes, injectable custom Strategies
without combat flow, and the existing 24-site generation/loading stress
baseline. These checks do not certify mobile gameplay load or final art.

**Next boundary:** when implementing actual hordes and player movement,
Encounter/AI and navigation must consume the **current** destructible world,
not assume initial geography is unchanged. No enemy spawn schedule or steering
logic belongs in World Generation.

## WorldGen v2.3 — continuous inset roads and physically supported rock strata

The user's Mountain Pass screenshots identified three defects in the previous
generated terrain: visually unsupported dirt layers between rocky cliffs,
brown route markings that disappeared underneath flattened combat floors,
and roads that were merely different materials at identical elevation.

**Strategy:** Every built-in map kind now chooses a `roadProfile` for its
main entry-to-exit corridor and landmark spur:

| Kind | Road surface | Fractional-depth design intent |
| --- | --- | --- |
| Wet Forest | Worn earthy trail (material 2) | 0.12 voxel |
| Forest → Highland | Graded dirt track (material 2) | 0.20 voxel |
| Mountain Pass | Exposed stone-cut pass (material 3) | 0.30 voxel |

**IMPORTANT RESOLUTION LIMITATION:** The Voxel V2 public initialization
format encodes solids at *integer* X/Y/Z coordinates. The current renderer and
collision engine cannot honestly represent a 0.12–0.30 voxel surface depression.
The Strategy therefore keeps the fractional design intent as metadata, and
the **World Generation geometry composer temporarily carves a real one-voxel
inset bed** in a narrow central line, retaining the surrounding shoulder at
its original height. This is deliberately more pronounced than the final
desired road, not an implementation of fractional geometry. A future
replaceable Surface/Materials renderer may interpret the nominal fraction
without changing World Generation or Voxel V2 internals.

**Geometry Composer:** The road pass runs *after* the central horde arena,
maneuver-pocket, flank and escape-route shaping. It reapplies the physically
inset central road and the correct biome surface material, including where
the road crosses the wide combat floor. Primary roads win over spurs at
intersections. No secondary road is an alternate collision source.

**Geological Strategy:** `setTerrain` now accepts `soilDepth` and optional
`rockFaceThreshold`. Mountain Pass declares one thin layer of soil and
stone faces on sufficiently steep terrain; a stone top and the material
beneath it are all contiguous bedrock. Wet Forest and the highlands retain
their softer soil treatment. Geological classification is performed only
after terrain shaping, so cliff exposure follows the actual map.

**Specifications:** `specifyRoadSurfaces` rejects discontinuous roads,
impassable road steps, and a main road that stops at the combat area.
Existing site topology, combat floor, enemy ingress, escape-loop, maneuver
width and buried-discovery gates still run on the final, changed landscape.

**Engine ownership:** The work changes only World Generation Strategy,
Builder, geometry, geology and Specification, plus its versioned layout
metadata and tests. Voxel V2 storage, external terrain initialization,
meshing, WebGL, Camera, Enemy/AI, World Objects and Loot stay unchanged.

Generation semantics are versioned as `worldgen-v2.3.0`. The public output
continues to use `wyrmforge.generated-site.v2` and the existing
`voxel-v2.terrain-initialization.v1` adapter. The new `layout.roads` and
`layout.geology` audit objects make physical limitations and acceptance
results explicit. CI verifies the actual loaded voxel top materials and
stone strata over multiple map seeds and chunk pitches.

**Visual acceptance outstanding:** user compares Mountain Pass, Wet Forest
and Forest → Highland at a mobile scale; a future fractional-height surface
engine must be tested separately before claiming the requested 0.1–0.3
voxel trench depth.

## WorldGen v2.4 — 10 cm surface details and jagged cliff geometry

Mobile visual acceptance of V2.3 rejected its full-block road trenches and
perfectly even mountain/hill staircases. **A road 1/10 voxel lower is not a
one-block trench**. V2.4 implements a detachable, real vertex-level surface
presentation pass while leaving the Voxel V2 storage/collision engine intact.

### Road depth: actual rendered tenths, not full-voxel excavation

| Biome | Visible road depression | Integer voxel excavation |
| --- | --- | --- |
| Wet Forest | 0.1 voxel (10 cm at 1 m/voxel) | 0 |
| Forest → Highland | 0.2 voxel (20 cm) | 0 |
| Mountain Pass | 0.3 voxel (30 cm) | 0 |

The World Generation **Strategy** retains material and cut-depth intent;
the **Builder** requires `cutVoxels:0`. The Road Geometry Composer keeps
the continuous route and correct material, but no longer removes a full
voxel. Its Specification verifies that the route still crosses the arena
and is traversable. The separate `terrain-surface-detail.mjs` adapter
reads the **public generated site** and Voxel `get()` interface, deforms
visible mesh surface vertices in increments of **0.1 voxel**, and does not
write back to the world, snapshots, save state, or meshing worker.

Surface corners are sampled by their global coordinates and shared by all
faces/chunks. The presenter also deforms wall-to-top boundary vertices, so
adjacent meshes don't split at local chunk boundaries. It runs after worker
meshing before the existing renderer GPU queue, both on the initial world and
on localized carving updates. The existing fixture remains unchanged.

### Cliffs, ridges and natural slopes

The highland Strategy has seeded lateral cliff-lip variation and steeper
foothill escarpments. The Mountain Pass Strategy creates rugged, meandering
rock-wall lips with abrupt stone faces and broad outer terraces, instead of
two perfectly uniform ramps. Existing combat, escape-route, pocket-width,
discovery and terrain-connectivity Specifications still gate all authored
sites before Voxel initialization.

The presentation adapter also adds small deterministic local variations
(quantized to tenths) to the visible surface. It is a **replaceable
presentation layer**, not a second source of voxel solidity. Materials and
stone strata still derive from the authoritative terrain and its surface IDs.

### Crucial engine boundary: collision follows integer voxels

**Visible top elevations have 10 cm precision. Collision remains voxel
resolution.** The existing voxel world, raycasting, destruction and physics
have not secretly gained sub-voxel solids. A future Movement/Collision
surface adapter must consume the same presentation-height contract or
explicitly decide that the minor visual discrepancy is acceptable. This
limitation must be addressed before a gameplay movement acceptance gate;
it is not a certification of 10 cm collision precision.

The WorldGen generator version is `worldgen-v2.4.0`, and the external
terrain initialization schema remains unchanged. Tests cover quantized
tenths, fractional road depths, seed determinism, real mesh positions,
cross-chunk seam vertices, retained voxel revisions, localized edits,
real layered stone, and the existing 24-world integration stress baseline.

## WorldGen v2.5 / Voxel V2 microcells — genuine 10cm pixel-art solids

V2.4 used vertical **vertex displacement** after meshing. That was not
correct: it distorted existing triangles and gave the actor/raycaster a
different world from the visible geometry. The standalone
`terrain-surface-detail.mjs` bending adapter and its tests are removed.

### 1m blocks, optional 10×10×10 fine occupancy

V2.5 adds physical, sparse `voxel-v2.micro-surface.v1` tiles to
**VoxelWorld**. A single 1m top voxel can opt in to 100 contiguous
10cm-wide X/Z columns, each containing **1–10 physically occupied 10cm
cells** in Y. The full tile is only 100 bytes; it does **not** allocate
1,000 JS objects, nor does it refine the entire map. Other voxels retain
the exact old 1m storage, meshing and collision fast path.

The public initializer is versioned as
`voxel-v2.terrain-initialization.v2`, with bounded
`surfaceTiles: [{x,y,z,levels:[100 integer values]}]`. The old v1
definition remains supported with byte-for-byte identical whole-voxel
behavior. A maximum of 384 generated microtiles focuses detail on roads
and cliff lips; the Voxel V2 hard safety budget is 1,024 tiles.

**World Generation V2** chooses where fine details are warranted:
Wet Forest roads lower by one microcell (10cm), foothill roads two
(20cm), mountain roads three (30cm). Exposed stone cliff lips are given
sparse seeded **axis-aligned microvoxel steps**. The authored 1m
terrain, primary road continuity, horde arenas, enemy ingress,
escape loops and existing cliff/strata grammar remain unchanged.

### Physical / rendering semantics

- The voxel world owns microcell heights, their **revision**, material
  occupancy, copy-safe snapshots and cleanup on destructive voxel edits.
- The public Terrain Port exposes `materialAtPoint(x,y,z)` for exact
  physical occupancy and `microSurfaceTiles()` for derived consumers.
- Terrain raycasts perform bounded 10cm traversal **only inside refined
  voxels**. Actor overlap, downward support and spawn grounding use the
  same occupied cells, not visual meshes.
- `microvoxel-mesher.mjs` removes only the matching coarse top/side
  faces and builds **horizontal top quads and vertical step walls** from
  actual microcells. Flat adjacent microcells merge into larger flat
  quads. No angled top, stretched triangle, bending normal, or mesh
  displacement is allowed.
- The new v2 initialization and external checkpoint replay load the
  **same authoritative microtiles**, with checksums covering their
  actual occupancy. A destroyed parent voxel automatically removes
  its microcell tile and local remeshing follows the existing change
  pipeline. Unrelated V1 tests and old voxel scenes are unchanged.

### Intentional limits

This is a targeted **surface refinement**, not arbitrary 3D microcell
caves or detached 10cm objects within each cubic meter. Those would
require a general sparse 3D microvolume representation and additional
editing API. The current compression assumes contiguous solid columns
under each top microcell (well suited to shallow tracks, rock ridges and
walkable hills). Collision on downward support and ray queries is
microvoxel-aware; the broader physics engine still owns more advanced
forces and terrain interaction.

The current renderer's shader may smooth pixel colors, but the new
geometry itself is strictly **pixelated, square and discrete**.
Continuous block terrain still uses the existing exposed-face worker;
the microdetail is derived by a bounded adapter from Voxel V2 data.
Performance and user-facing pixel-art acceptance must be checked with
the new build before treating this as final.

## Road material / microvoxel seam alignment (V2.5 follow-up)

A real iPhone screenshot of Wet Forest exposed hairline edges that did
**not** track the brown road. Three issues were identified and fixed:

1. The road-material compositor selected cells using **integer (x,z)**,
   while the micro-surface grammar independently selected tiles at
   **(x+0.5,z+0.5)** with a wider distance allowance. This caused micro
   steps to appear under non-road grass cells and some painted road
   cells not to have matching 10cm geometry. Both now call the same
   `selectRoadCell` policy in `road-footprint.mjs`.
2. When an adjacent unrefined full-height cell was higher than a
   refined road microcell, the mesher reversed the exposed wall's
   normal **and moved its coordinate into the road by 0.1m**. It now
   holds the wall on the actual shared X/Z boundary regardless of which
   side owns the higher surface.
3. The legacy coarse-face removal identified the wrong owning voxel
   for outward **+X/+Z** faces. The old one-meter wall could remain
   behind the new pixel-art geometry, creating dark/colored lines.
   Coarse faces are now identified by the voxel on the **inside**
   of each face; refined top/side faces are replaced exactly once.

Automated regressions assert both positive and negative boundary
normals; accurate 10cm stepped seams between dirt and grass; removal
of all old 1m top/side faces; valid material-to-geometry footprints
across 3 map kinds × 4 seeds; and correct full-height wall restoration
after destroying a refined road voxel.

No shader masking, vertex bending, material recoloring or arbitrary
second geometry authority was added. These are fixes to actual physical
voxels and the existing World Generation output boundary.

## Character traversal acceptance (independent Navigation / Physics consumer)

Mobile visual checks confirmed the real 10 cm roads look more natural, but
highlighted a *gameplay* constraint: many hills still contain full 1 m ledges.
Wyrmforge has **no active jump button**, and a fall should be dangerous.

This change does **not** make World Generation implement player physics or
health. Instead, a replaceable **Character Traversal Policy** declares:

- Automatically walk up small ledges (up to **0.35 m**).
- Perform a **passive, collision-swept ballistic hop** when moving toward an
  otherwise clear ledge up to **1.05 m**. A 1 m hop must animate across
  successive physics ticks, not teleport the actor to its new elevation.
- A wall taller than the permitted hop or a low ceiling is *not* passable.
- A fall of **2 m or less** is harmless. Above that, gameplay receives
  a single **fall-impact event** with suggested damage
  `ceil(20 × (fall metres − 2))`, capped at 100. No HP is modified
  inside Voxel V2 or World Generation.
- Drops beyond **6 m** are excluded from *normal* navigable edges, even
  though actual physics remains free to let an actor fall off a cliff.

**Navigation** is now a derived, independent consumer of the public
`V2TerrainPort`. `analyzeCharacterReachability` samples the **actual
loaded voxel world** (including microvoxel heights and the character's
0.56 m wide, 1.6 m tall collision volume), tests standing support,
horizontal clearance, directed uphill/downhill transitions and fall
severity, then constructs a bounded shortest **lowest-damage** route
graph. The result has versioned per-cell statuses and a route-to-target
query. No WorldGen heightmap is used as navigation truth.

The World Generation **viewer** has an opt-in *Show reachable terrain and
fall hazards* diagnostic. Green denotes safely reachable standing cells,
amber denotes routes requiring harmful drops, and red marks standable but
unreachable areas. A white trace connects the entrance to the exit when
possible. Status text lists actual reachable cells and inaccessible
landmarks/arena spaces. The graph is cached by terrain authority epoch,
revision and site hash and recomputed after a destructive edit or restore.

**Boundaries:** World Generation still only composes geography; Voxel V2
owns solidity and fixed-step actor collision; Traversal Policy owns hop
and fall thresholds; Navigation consumes the public read port and never
writes world data; Gameplay/Health alone deducts HP when it receives a
fall-impact event. Enemy AI / future full horde pathfinding may consume
navigation knowledge, but are not implemented or silently coupled here.

**Tests:** fixed-step automatic hops vs instant teleports, 10 cm steps,
head clearance, high walls, safe and injurious falls, one-shot impact
events, real collider-sized pathfinding, vertical overhangs, microvoxel
landings, one-way dangerous drops, changed-world recalculation, and
three real generated/loaded map kinds. This is character-level terrain
reachability, **not yet dynamic crowd-navigation or a final game combat
controller**.

## Character-scale terrain acceptance — true 1.6 m proxy

Visual feedback from iPhone identified a mismatch between a character's
scale and the **one-metre terrain ledges** marked traversable by V2.7.
The white line represents a route, not an animation, but it was permitted to
cross rises greater than half of the character's height. We do not fix
this by altering the camera scale or by making a jump animation prettier.

The replaceable Character Traversal Policy now caps an automatically
triggered hop at **0.55 m**. Small rises up to 0.35 m are still automatic
steps. A full one-metre rise is a **blocked climb**, not a plausible
passive hop. The Voxel V2 controller uses this same maximum clearance
rather than keeping a contradictory one-metre step assumption.

World Generation V2.6 jointly grades the **authored main road,
escape loops, enemy approaches, and maneuver-space links** into a shared
physical 10 cm surface-height network. Its deterministic lower and upper
grade envelopes bound every adjacent authored movement step to **0.5 m**,
while preserving as much of the original landforms as possible. These
heights become actual sparse microvoxel occupancy and real top-voxel
positions—not shader bending, hidden ramps or a second collision model.
Independent route crossings therefore agree on a single physical height.
Deliberately steep cliffs outside the authored movement network remain
terrain obstacles. Specs still independently enforce escape routes,
combat-space width, real Voxel traversal, and cross-seed reachability.
The output semantics are versioned as `worldgen-v2.6.0`.

The World Generation preview adds an opt-in-by-default **1.6 m × 0.56 m
dummy** projected using the collision volume and the actual unmodified
camera scale. A mobile slider moves it along the real actor-sized
reachable path. The status shows its next height difference and
whether that rise is walking, auto-step, auto-hop or blocked.
The dummy is a diagnostic proxy, **not** a final wizard sprite or
a new Character engine; it does not alter or load terrain.

CI verifies auto-hop thresholds and actual microvoxel landings, as
well as all three authored site kinds across multiple seeds. The
generated site remains a World Generation product, while the Actor
and Navigation engines own their own independently swappable rules.

## Entry/exit road apron at the finite map boundary — V2.6.1

A real iPhone Wet Forest seed-7 screenshot exposed a blocky, raised road lip
near the **first/last road cells at the outer site boundary**. The Strategy's
entry/exit endpoints were intentionally just inside the 40×40 map, while
road-painting continued to its edge. The new shared 10cm movement grading
stopped at the waypoint, leaving painted border cells at independent 1m
whole-voxel elevations.

The pure, replaceable `road-boundary-apron.mjs` rule now detects an
authored road endpoint facing a nearby map edge. It generates short, bounded
entry/exit spine extensions only through **already-painted road cells**,
and connects their immediate painted shoulders to the existing joint
corridor-grade graph. The same 50cm maximum movement grade, real 10cm
microvoxel occupancy, materials, raycasting and actor collider apply right
to the edge. Grass and cliffs outside the road remain authored landforms,
not flattened decorative ramps. The public Voxel V2 schema is unchanged;
the deterministic WorldGen output version is `worldgen-v2.6.1`.

The viewer's real seed-7 recipe and the other two biomes across four seeds
are tested for exact physical entry/exit heights, shoulder alignment,
material-to-geometry consistency and ongoing arena/escape connectivity.
No per-vertex bending, camera scaling, special-case hardcoded seed, or
new second source of collision truth was introduced.


## Natural roadside transition at the finite boundary — V2.6.2

Real iPhone review of the V2.6.1 build showed the same brown, stepped
entrance even though its painted road had a valid 10cm grade to the edge.
The unpainted grass immediately beside the track was *not* in that graph;
its independently rounded 1m top still formed a ragged, elevated lip.

V2.6.2 extends each boundary-apron's joint physical grade only two
unpainted grass columns outward and only through the nearby entrance/exit
section. These grass columns retain their existing grass/stone material,
produce actual 10cm microvoxel occupancy and connect longitudinally so no
new teeth appear between consecutive shoulder rows. The road footprint,
authored map geometry, ordinary cliffs away from the boundary, actor scale,
jump limit and renderer are unchanged. A specific regression now checks
the road-to-grass 50cm adjacency on both edges across three map kinds
and four seeds, as well as physical collision/occupancy above each
grass shoulder. Visual acceptance still requires an actual phone screenshot.


## World Generation V2.7 — deterministic Wyrm influence terrain foundation

The V2 world-map recipe already included `corruption` (0–1), but the generator
previously ignored it and the mobile viewer always used zero. The new pure
`world-influence-grammar.mjs` applies a northward (toward the authored exit),
seed-coherent physical terrain progression *before* normal authored road,
combat, escape and shared 10cm route grading. At zero corruption the grammar
is mathematically inert, retaining the approved Wet Forest seed-7 geometry.

At higher influence, nearby natural landforms gain bounded height variation
and coherent exposed stone patches. This is genuine voxel occupancy/material
work, using the existing 3D geology/strata and adapter; it is **not** painted
overlay, shader bending, lava, fire, new art, trees, objects, or weather.
The generator returns `layout.worldInfluence` diagnostics, keeping input
corruption, seed and physical results fully deterministic. Authored routes,
landmark identity, combat clearings, reachability and physical voxel collision
must remain valid. The viewer's World Generation settings now expose a
0–100% influence selector, leaving zero selected by default. Tests cover
three map kinds, four seeds, physical voxel changes, zero baseline,
bounded grammar and consistent route/arena identities.

World Map owns world-state advancement; generation is deterministic from a
recipe and must never mutate an active Hunt without the separate save/replay
and live-terrain authority. Objects, fire, ash and lava are future engines.
This V2.7 step does not mark the whole voxel V2.7 acceptance gate complete.

 
## Dedicated Fire-tier geography — WorldGen V2.7.1

**World Map intent vs Wyrm influence are different axes.** The stage and
encounter determine the terrain *type*. A high corruption value never
converts an ordinary Wet Forest into an actual miniboss encounter, and the
Wyrm lair is never represented by a randomly scored horde field.

Three independent Fire-tier Strategies have now been registered:

- `scorched-approach` — ravaged volcanic valley with narrow, genuinely
  excavated fissures along its walls, but a protected through-road;
- `mini-boss-arena` — an enclosed, smaller stone-ring combat floor with
  its own ingress routes and arena identity; and
- `wyrm-lair` — a distinct, larger caldera fight floor with a high rocky
  rim, multi-direction approaches, fissures off the boss floor and
  multiple geographically anchored lava-fall locations.

These are generator Strategies registered with the existing map-kind
registry. The Builder validates an explicit encounter identity and volcanic
geology stage. The dedicated-arena Specification rejects tagged sites if
their *actual physical terrain* lacks a usable fighting floor and raised
stone rim. A protected fissure grammar carves genuine 3D voxel trenches
**outside** roads, approaches, mandatory exits, clearings and boss arenas.
All run encoding, collision, destruction and later replay stay in the
existing Voxel V2 authority; no moved triangles, texture overlays or
runtime mesh-only fissures. Existing three map kinds remain selectable.

**Lava-fall boundary:** the World Generator reserves only **cliff-validated
vertical placement anchors** with a real high rim and lower solid landing.
No animated lava waterfall, glowing material, flowing liquid, heat,
damage or particle effects are implemented in this milestone. Those need
separate V2 material, environmental hazard, Lighting, VFX and Gameplay
interfaces. The player must not be told that playable lava exists yet.

The miniboss and Wyrm sites remain distinct even at corruption 0. Wyrm
influence still affects natural landscape within a site without changing
its encounter identity. The existing map generator stress suite and new
physical tests cover independent seeds, actual terrain cuts, intact
boss fight floors, reachable required routes, real cliff faces and
unmodified voxel/actor boundaries. Final iPhone visual acceptance remains
an open gate. This is **not** completion of the overall V2.8 Hunt
integration milestone.


## Natural cavern rework — WorldGen V2.7.2 (spacious bosses)

A mobile visual review found that V2.7.1's 40×40m boss sites and 7–8m
fight radii looked like artificially enclosed circular platforms, with
insufficient room to maneuver around the boss.

This revision changes actual site geometry, **not** camera scale:

| Site kind | Bounded terrain extent | Central fight radius | Connected side terrain |
| --- | --- | --- | --- |
| Wet Forest / Highland / Mountain / Scorched approach | 40×40m | Existing 7m ordinary space | Unchanged |
| Mini-boss arena | **56×56m** | **12m** | 2 separate 5m natural alcoves |
| Wyrm lair | **64×64m** | **16m** | 3 separate 5m alcoves/shelves |

Instead of an even-height circular rim, cavern strategies now construct
coherent warped rock massifs, irregular rock cliffs, an enlarged natural
entrance and distinct side shelves. A dedicated boss route still has
mandatory ingress/egress and landmark topology but **no painted track**
across the battle chamber. Route floors and side chambers use the existing
physical 10cm movement grades and are verified through the normal terrain
topology and maneuvering specifications; authored road material elsewhere
is unaffected.

Physical volcanic faults are relocated toward the *outer* rock, based on
the site's actual radius. Fissures are prohibited from removing required
combat floors, entry/exit connections or maneuver chambers. Existing lava
fall anchors still describe only potential cliff locations—not animated
lava, molten materials, hazards or boss scripting.

Validation allows only these site-kind-specific bounded sizes; arbitrary
large WorldGen recipes remain rejected. The independent Voxel V2 loader
keeps its original 8192 run / 1048576 voxel / 384 generated microtile
budgets, with generation stress and actual loaded-world tests enforcing
them. Browser device measurements and visual acceptance are separate
gates; this does **not** complete V2.8 playable Hunt integration.


## Hunt expedition regions — V2.8 foundation slice 1 (2026-11-13)

**Response to [ADR-0002](architecture/ADR-0002-hunt-expeditions-and-journey.md):**
One Hunt can no longer be modeled as one 40m combat fixture. This slice
adds an independent **World Map Hunt recipe and multi-region expedition
plan**, plus a small, testable **on-demand physical region generator**.
These are NOT the finished streaming runtime, final map dimensions,
narrative implementation, enemy AI, or a playable Hunt.

### Concrete prototype geography

- `createHuntExpeditionRecipe`: bounded World Map inputs: journey/hunt
  identity, chapter, chosen biome, corruption, world revision, seed,
  chunk pitch, scope and optional **opaque story beat identifiers**.
  The generator never fabricates story text or awards discoveries.
- `composeHuntExpeditionPlan`: standard plan has 11 connected
  32m regions spanning a **96m × 160m geographical envelope**.
  Extended scope adds three spaces/alternate paths, with a
  **160m × 160m envelope** depending on seed mirror. Includes central
  through-route, linked side loops, horde-compatible clearings,
  investigation/discovery location opportunities, retreat/flank space
  and extraction. This is a **spatial adventure skeleton**, not
  automatically populated gameplay.
- `generateWorldExpeditionRegion(plan,id)`: composes ONE 32m tile in
  fixed world-space X/Z coordinates and emits canonical real layered
  3D Voxel V2 initialization runs. Seeded broad geography and interior
  relief vary with the selected biome; local edits fade near neighboring
  borders to avoid rectangular steps. 7m-wide portals and authored
  center-to-port routes share a physically level top. A site region
  can load via the existing bounded `V2ExternalTerrainLoader`,
  one region at a time, without raising its run/cell/step budgets.
- Existing `WorldGeneratorV2` single-site recipes, biome identities,
  10cm traversal work, actor policy and independent Voxel V2 remain
  available and unchanged. The public terrain adapter now takes an
  **optional version field**, defaulting to the existing version for
  old results.
- In the existing mobile World Generation viewer, check
  **"Inspect multi-region Hunt expedition (foundation)"** and choose
  an expedition region. This visualizes one physically loaded region
  in its real world coordinates; the summary displays the expedition
  envelope and selected region. The preview does not fake a stitched
  playable world or auto-load all regions.

### Acceptance and remaining gates

Tests verify deterministic plan identity, multi-route graph reachability,
World Map-provided story placement opportunities, region-order-independent
voxel generation, actual loaded Voxel V2 material/height on both sides of
neighboring world-coordinate borders, protected 7m portals, non-port
seam height continuity, per-region loader budgets, seed variation and
legacy single-site compatibility. The test suite covers all seeded
region IDs and distinct journey scopes.

**NOT IMPLEMENTED:** true adjacent-region streaming into one authoritative
active voxel world; incremental visible chunk scheduling and cross-region
raycast/actor navigation; populated physical trees/ruins; enemy hordes;
investigation interaction and persistence; cross-Hunt story state;
a full-size, camera-tested Hunt. This code only establishes the correct
generator and public loader boundaries for that work. The 32m
region edge is an implementation tile size, NOT a final Hunt size
or a promise of runtime mobile FPS.

**Next milestone slice:** a bounded region activation/window API with
shared global voxel authority and deterministic seam replay, then
on-device exploration and encounter/World Object integrations. Treat
the lab as a review surface and continue to require actual Hunt
integration before claiming V2.8 complete.
