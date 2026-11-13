# Wyrmforge V2 — world-led procedural Hunt terrain and magical destruction

**Status:** product-facing integration target agreed 2026-11-10; NOT an implemented biome generator or a playable V2 Hunt. This specification is subordinate to the single [V2 roadmap](ROADMAP.md), not a new roadmap. No V1 code is imported into the clean-room V2 engine.

## Expedition scale and connected Hunt narrative (2026-11-13)

**Authoritative correction:** [ADR-0002 — Hunts are complete expeditions](architecture/ADR-0002-hunt-expeditions-and-journey.md).
An individual Hunt is a **larger, populated adventure**, not one tiny
combat clearing. The current 40m/56m/64m V2 generator footprints are
diagnostic fixtures, not target gameplay sizes. One Hunt must contain
distinct explorative spaces, investigations/secret discoveries, horde
pressure and meaningful extraction. Several Hunts must form a coherent
story progression from the first forest through Wyrm-influenced geography
to the lair, with node count varying by map and Wyrm tier.

Scale by deterministic **multi-region composition and bounded streaming**
rather than arbitrary increased full-site array/run limits or massive
empty maps. Gameplay/Narrative owns clue semantics and waves; WorldGen
owns the reachable physical sites and placement opportunities. Final
dimensions will be validated with actual mobile Hunt density and
playtesting, not accepted from the lab UI alone.

## Why this engine exists

Wyrmforge is a **mobile-first, fixed-camera, pixel-first 2.5D dark-fantasy action roguelite**, not a free-camera voxel sandbox. Terrain is volumetric and genuinely destructible beneath its 2.5D presentation. A player chooses an actual world-map location, enters a seeded Hunt arena themed to that location, battles enemies, modifies terrain and physical objects through magic, and exits through a valid mapped route.

The current V2 laboratory's flat/hill/cliff/arch scenes, debug actor, raycasts, sphere/tunnel edits, and six event probes are **unit/integration fixtures**. Their quantity is not a progress measure; every new engine feature must demonstrate usefulness for one of the real Hunt outcomes below.

## One geographic identity, seed-stable local variety

The **game's map/site authority** selects the place. **World Generation V2** translates a versioned, immutable *site recipe* into local terrain and objects. The terrain engine neither chooses the World Gate route nor infers terrain from a map image.

### Required V2-native input: `HuntSiteRecipeV2` (proposed schema)

- **Identity:** schema/version, region ID, site ID, encounter ID, terrain seed, world-state revision, area extent/voxel pitch, landscape revision. Repeatable geometry under the same seed and revision; distinct seeds yield real variations. Subsystem RNG streams must be independent of combat, spawn and loot RNG.
- **Geography:** biome/habitat, landform (lowland/wetland/mountain), moisture, slope/elevation envelope, stone/soil/grass strata, weather and magic/Wyrm influence. This is what makes a mountain site structurally mountainous, not just gray ground.
- **World topology:** mapped entry and permitted exit ports, connected roads/trails, required bridge/river crossing, reachable spawn and objective areas, protected approaches, and physically meaningful boundaries. Chart edges choose *where the player can go next*, not how many paths the local arena must visibly draw.
- **Landmarks and encounter:** required monastery/village/refuge/ruin/watchtower/lair structures with coherent collision volumes and reachable entrances, optional discovery pockets, arena-combat/ambush clearings, enemy spawn exclusions, boss space. No guarantee of optional loot from the terrain generator.
- **Destruction policy:** material strength, breakability, bedrock/protected anchors, permitted depth, changeable world-object classes, and which entrances/route constraints may not be left unreachable. Protection is a targeted game rule, not blanket invincible scenery.
- **Outputs:** deterministic material voxels, 3D collision solids, landform & water/vegetation placement data, named destructible-object instances with stable IDs, passability/entrance/exit audit, spawn/safe-combat spaces and canonical generation hash. All coordinate transforms are world-anchored.

**Boundary:** existing Wyrmforge gameplay code in `pjotrcasteel/Wyrmforge` is examined as **product reference only**. The newly authored V2 contract/terrain generator must not depend on V1 terrain classes, JS rendering files, actor models or physics internals. A future separately approved game-side integration may consume the V2 output without turning V2 into a wrapper around the old engine.

## Playable biome targets

| Chart location / biome | Generated landform and objects | Meaningful destruction |
| --- | --- | --- |
| Wet forest / forest trail | connected irregular footpaths, clustered canopy and roots, damp ground, glades, shallow pools, fallen logs and ruined traces | magic cuts soil/roots, burns or breaks eligible trees, destroys breakable logs and scenery, changes movement routes |
| Forest-to-mountain transition | rolling hills opening into ridges, soil-to-rock strata, a reachable saddle and distinct treeline | spells remove genuine rock from slopes, open alternate passages without changing the promised exits |
| Mountain pass / monastery | elevating valleys, sheer blocking cliffs, foothills, switchbacks, coherent actual monastery gates/courtyard | magic chips rock faces, damages breakable architectural elements, exposes walkable cuts; no fake impassable painted cliffs |
| Scorched approach | dried/burned forest into fractured stone, ash, hot fissures and increasingly intense Wyrm influence | attacks widen fissures, expose magma-capable strata, burn vegetation and destroy stone cover |
| Wyrm lair | supported natural rock chamber/volcanic approach, readable open boss space, appropriate exits | player and enemy/Wyrm magic changes rock, cover and arena geometry without corrupting boss/spawn/exit state |

These are content profiles and acceptance targets, not already delivered assets or engine capabilities. Retain Wyrmforge's gothic, readable 2.5D pixel-art identity and avoid random scatter, repeated tiled squares, synthetic terrain repainting or disconnected props.

## One spell-impact truth for BOTH factions

1. **Spell/combat authority** validates player or enemy/Wyrm attack (source ID/faction, spell, position, direction, power, impact/command ID and world epoch). Neither VFX nor the renderer determines whether damage exists.
2. The resolved hit may intersect **terrain voxels**, **destructible world objects**, and combat targets. Terrain receives bounded deterministic damage/carve commands through the single V2 terrain-edit authority. Breakable object entities receive their own stable-ID health/damage updates; those must not be silently modeled as renderer-only pixels.
3. Material rules distinguish turf/soil/stone/bedrock, trees/wood, masonry, other physical props and future granular matter. A beginner spell may scar earth; upgraded magic or heavy enemy/Wyrm attacks may break cover, trees and cliffs. Resistance is a game rule, not a visual approximation.
4. Committed changes update the same 3D occupancy and collision truth used by player and enemies, raycasts/LOS, incremental navigation/terrain meshing and lighting/VFX/audio subscriptions. No second hidden collider, floating impassable artwork or fake crater overlay.
5. Destruction during an active Hunt must preserve validated objective/exit connectivity **or provide a legitimate reachable alternative**. It must not trap the player, obstruct a compulsory boss arena, erase required graph ports or spawn enemies inside newly solid terrain. Enforce this with a bounded connectivity check or explicit protection policy, not a global scan every frame.
6. Save/replay tracks stable site/prop IDs, accepted terrain commands, object destruction and one-time rewards. Terrain and objects are not regenerated behind the player's back when a scene reloads. V2.9 will add bounded supported/unsupported stone collapse and settlement; until then static rock can remain in place per documented behavior.

**Character Visibility**, animation rigs, enemy AI and spell art are separate V2 subsystems. Terrain exposes depth/solid geometry; it does not create emissive outlines or sprite layers.

## Required first real game-shaped vertical slices

1. **World-to-site recipe**: independent, versioned, seeded V2 input/output contract supporting real forest and mountain site types. Test varied seeds, deterministic hashes, named exits and landmarks. No new lab UI page.
2. **Generator foundation**: independently authored lowland/forest and mountain/highland material volumes with correct slopes, connected trails, real cliffs, explicit clearance, sparse region/chunk output and negative coordinates. Reject bad or unreachable generated sites, or use a documented bounded deterministic fallback.
3. **Physical world objects**: new V2-only object descriptors with 3D footprint, destructible material/health, stable IDs and placement validity. Trees must read as grouped woodland rather than random independent props. Game presentation/art remains independently authored.
4. **Both-sided spell destruction**: one reproducible player Fireball and one enemy magical impact on the same generated site, producing terrain + eligible prop damage and correct collision/nav effects without duplicate rewards or phantom hits.
5. **V2.8 guarded genuine Hunt**: instantiate V2 terrain from a selected chart site inside playable Wyrmforge, then assess touch controls, enemies, spell visuals, camera, exits and performance. Do not substitute the lab's diagnostic actor or isolated canvas for this proof.
6. **V2.9 structural gravity**: bounded detached clusters/loose materials, safe settlement, physical effects from both factions, mobile device gates. This remains **later**, per owner direction.

## Acceptance that matters

- **Same site + seed + revision:** identical generated voxel/prop/connection hash; same material/collision map before damage; independent combat/loot random streams.
- **Different seed:** substantially different paths/clearings/rock distribution **within the same biome and site promise**, not entirely different geography or a different Wyrm.
- **Real topology:** mapped entrances/exits, monster-spawn areas, retreats and boss clearings remain connected; tests include forest, mountain pass and mountain monastery with readable barrier/grade behavior.
- **Physical parity:** player and enemy spells can carve the same rock/ground and damage eligible physical objects; all visuals, movement/LOS, AI route invalidation and replay read the committed result.
- **Mobile:** on physical iPhone Safari and Android Chrome, measure p95/p99, hitches, edits-to-visible latency, chunk updates, peak queue/memory and 10-minute stability under normal combat and simultaneous destruction. Work provisional targets remain in [ROADMAP.md](ROADMAP.md).
- **Game over lab:** a proof only counts as true Hunt acceptance when the selected chart site, actual player/enemies/spells, proper art and exit state work together in-game. Extra demo buttons or generic benchmark scenes do not qualify.

## Findings from game source audit (reference, not reused code)

On 2026-11-10 we inspected **current Wyrmforge** gameplay and canon to distinguish game needs from lab scope:
- `WorldSiteGeography.cs` and `WorldSiteLandscape.cs` already express mapped site identity, biome/landform/landmark, permitted exits, corridors, mountains, forest roots and discovery pockets.
- `ArenaTerrainGenerator.cs` already uses seeded land-use zones (Forest/Highland/Meadow), an explicitly protected route, clearings, relief, forests, boulders and Wyrm-stage fissures. This is evidence for the **target behavior**, not code to import.
- `HuntArenaGenerator.cs`, `ArenaEnvironmentState.cs` and `RunSimulation.TerrainImpact.cs` distinguish seeded breakable scenery, persistent health for individual props and damage from both hunter and enemy magical attacks.
- Canonical product documents describe the actual game as mobile-first **pixel-first 2.5D**, with one world/site identity and reachable geography rather than a collection of unrelated random arena mini-games.

This audit informs the new independent V2 contracts and priorities. It does **not** mark procedural V2 maps, prop destruction, game integration or material artwork implemented.
