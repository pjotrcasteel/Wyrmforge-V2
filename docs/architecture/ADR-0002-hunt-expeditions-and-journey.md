# ADR — Hunts are complete expeditions; the World Map tells the Wyrm story

**Decision:** accepted direction from user feedback 2026-11-13.
**Scope:** product-facing design and V2 engine contracts; does not implement a playable Hunt.
**Supersedes:** treating the 40×40 m WorldGen laboratory sites, the 56×56 m miniboss,
or the 64×64 m Wyrm cavern as final playable Hunt dimensions.
**Preserves:** the single V2 roadmap, replaceable V2 engines, no V1 runtime reuse,
mobile 2.5D pixel readability, authoritative destructible voxel geometry.

## What game are we making?

Wyrmforge is a dark-fantasy pixel-first 2.5D action roguelite. The Wizard
develops their magic through Forge, Arcane Web, persistent spell upgrades
and temporary Hunt choices. The actual gameplay is a progression of
dangerous **Hunt expeditions** on the world map, escalating toward a Wyrm.
Each Hunt is a location-aware and seed-varied adventure, with investigation,
environmental storytelling, exploration, hidden discoveries, relentless
Vampire Survivors-like enemies, magical terrain/object destruction,
landmark encounters and meaningful extraction/advancement. Hunts are not
one circular combat floor, a painted road, or a level editor fixture.

## Three distinct scales of composition

1. **Journey / story arc (World Map + narrative/game authority):** a
   variable-length ordered/branching sequence of meaningful world-map
   nodes; the player follows evidence and consequences from healthy forest
   through spreading Wyrm influence, wilds, mountains, volcanic territory,
   special miniboss destinations and the eventual Wyrm lair. The number
   of nodes and Hunt duration depend on map topology, choices and Wyrm
   tier—not a fixed four-map cutscene. Earlier Hunts are shorter; higher
   tiers may lengthen and complicate them. Neighboring Hunts must share
   geological and narrative continuity even when each site's terrain
   seed differs.
2. **One Hunt expedition (Hunt + WorldGen):** a **large playable
   environment** that includes multiple regions, loops, detours, open
   survival spaces and destinations. It must be fun to traverse on foot
   with the fixed-angle 2.5D Hunt camera and while dodging large enemy
   hordes. An investigation may move the player from a destroyed outpost
   to an overgrown grove, a broken crossing, a concealed ruin and an
   extraction gate. The path is never just a straight ribbon, a maze of
   constrained corridors or a vast empty square.
3. **Local encounters / landmarks (WorldGen + gameplay owners):** glades,
   ruins, cave shelves, narrow ravines, ambushes, discoveries, optional
   pockets, miniboss chambers and unique Wyrm lair spaces live *inside*
   complete expeditions. Boss sites remain distinct authored destination
   types; their fighting floors support plenty of movement, changing
   terrain and more than one retreat/kiting route.

## Why the current V2 implementation is not yet Hunt-sized

The 40×40 m ordinary site, 56×56 m miniboss and 64×64 m Wyrm cavern
remain **small, finite diagnostic prototypes**. They demonstrate
seed determinism, voxel loading, physical 10cm traversal, topology,
rock strata, fissures and isolated boss geography. They are **not**
shipping Hunt scale or proof of a playable expedition. Increasing a
single `radius` constant until the map is bigger is insufficient:
it risks blowing the existing V2 full-definition run/microtile
budgets, mobile draw/upload work and losing landmark/story density.

**Implementation direction:** move from one bounded whole-site
heightfield and one full-scene run array to **seed-stable chunk/region
composition** with continuous world coordinates, deterministic
cross-boundary geology and terrain materials, bounded chunk scheduling,
load/unload and replay. Compose a *complete Hunt plan* over multiple
connected subregions. Preserve one authoritative Voxel V2 occupancy,
collision, raycast, destruction and replay path; do not fake long-distance
terrain using meshes, textures or an unrelated scene system.
Do not decide a final physical dimension merely by doubling 40 m:
choose actual traversable footprint and population density after
game-camera and mobile profiling.

## Minimum Hunt experience contract

A generated Hunt plan should identify and connect:

- **Entry and an attainable exit/extraction:** sourced from the
  world-map location, with nontrivial alternative routes, no permanent
  accidental trapping and no disconnected story objective.
- **Exploration geography:** several distinct recognizable spaces with
  sightlines, retreat/kiting loops, natural changes of elevation,
  physically meaningful crossings and terrain that can actually
  be damaged by both player and enemies.
- **Investigation / story beats:** authored *opportunities* to find
  environmental clues, tracks, corrupted rock, ruined structures,
  a hidden cache or hints at the Wyrm's magic. Some are on the
  critical path, others optional; optional discoveries should reward
  curiosity rather than artificially stop a horde-survival run.
  WorldGen emits positions, connectivity and object-placement requests.
  Narrative/gameplay own meaning, clue state, interaction, rewards and
  unlocks.
- **Enemy pressure:** multiple spawn-compatible zones and ingress
  directions over the player's journey, with wide enough playable
  ground for sustained hordes and escalating waves, pauses and
  landmarks. AI/Encounter owns spawn timing, density, factions and
  attacks—not WorldGen, the renderer or texture materials.
- **Optional branches and secrets:** out-of-the-way ruins, cut-throughs,
  destructible terrain hiding reachable discovery locations, small
  event spaces and varied return paths, without mandatory false
  invulnerable scenery.
- **A local climax and aftermath:** a strong destination or event,
  optional miniboss when chosen by the World Map, escape/extraction
  and an outcome that influences the next world-map Hunt. Special
  miniboss and Wyrm lair environments are handcrafted-feeling and
  spacious, not every Hunt's default template.

The sequence can be random within the authored *geographical/story
promise*. No fixed checklist of `N` enemies, `N` investigations or
`N` structures may be filled with empty content solely to tick a metric.

## Example narrative arc, NOT a fixed mandatory route

Living forest (animal behavior changes and missing travellers) ->
fading grove (first exposed corruption, find signs and buried relics) ->
ruined foothills (evidence identifies the source; more dangerous enemies)
-> volcanic approach (the landscape physically fractures; lava-fall
locations become credible) -> miniboss destination when the chosen
story branch requires it -> Wyrm's lair, a distinctive enormous
physical location that makes the accumulated evidence meaningful.
World-map choices, geography and Wyrm tier govern the real number
of Hunts. Clues and destruction change what the player learns and
where they can go; location identity remains coherent across seeds.

## Engine ownership and milestone discipline

- **World Map / Journey:** story graph, site identity, prerequisites,
  travel choices, Wyrm tier, encounter type and how one Hunt advances
  the arc. Consecutive sites must compose into a coherent journey.
- **World Generation V2:** spatial Hunt plan, biome/height continuity,
  traversable alternatives, hazard locations, investigation/landmark
  placement opportunities, physical topology specification and
  deterministic chunk contracts.
- **Voxel V2:** authoritative 3D material occupancy, destruction,
  collision and chunk streaming/meshing/query integration.
- **World Objects V2:** real physical trees, rocks, ruins, clue
  objects, caches and other destructible entities with stable IDs;
  this must not be synthesized as image overlays.
- **Encounter / AI + Gameplay:** enemy waves, miniboss/Wyrm AI,
  scripted events, clue interactions, objectives, rewards, pacing.
- **Materials / Lighting / VFX / Hazards:** visible healthy-to-volcanic
  progression, separate flowing lava/waterfalls and heat; geologic
  fissures/anchors alone do not mean playable lava exists.

Do not import V1 classes or data. Do not promote this ADR into a
completed V2.8 Hunt milestone. Keep the independent lab as a proof
tool, not a game mechanic or acceptance substitute.

## Acceptance gates before calling a Hunt playable

1. A chosen World Map node produces one seed-stable but locally varied
   **complete expedition** with several connected spaces, discoveries,
   encounter/retreat routes, named entrance/exit and purpose.
2. A valid multi-Hunt sequence exhibits continuity of biome, damage,
   landmarks, evidence and rising Wyrm influence, with meaningful
   choices—not independently random maps pretending to be a story.
3. Actual player navigation on real voxel geometry can visit every
   required beat and safely maneuver under representative hordes; the
   same terrain is destructible and collision-authoritative for both
   player and enemies.
4. Large expeditions stream/load in bounded operations, maintain
   deterministic chunk seams, survive edits/save/replay and pass
   physical iPhone Safari and Android Chrome workload/performance
   tests. No declared number or size is accepted solely from a
   desktop static screenshot.
5. Full gameplay integration in V2.8 includes physical objects,
   investigations, real enemies and extraction state. A lab's
   diagnostic dummy, giant empty terrain, combat ring, or passive
   metadata do not pass these gates.

**Immediate design priority:** replace `one small site = one entire
Hunt` with a streamed, multi-region Hunt expedition plan and a
World-Map-driven journey contract. Do not spend the next milestone
polishing an isolated boss-ring micro-map.
