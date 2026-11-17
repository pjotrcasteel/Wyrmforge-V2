# Wyrmforge V2 — world corruption art direction

The journey starts in a **0% corrupted Hunt arena**, in the biome chosen by the
World Map, and becomes progressively
darker, colder, ash-covered, and volcanic near the Wyrm. This is a *continuous
geographical progression*, not four hard scene switches and not a screen-wide
darkness overlay.

## World-space progression contract

`src/terrain-corruption-profile.mjs` defines four reference stops and returns
interpolated channels for any normalized progress from 0 (living forest) to 1
(Wyrmlayer). World generation will supply the progress according to the actual
route/geography; the profile itself does not choose terrain geometry or maps.

- Living Forest: natural, bright green, readable.
- Fading Wilds: muted vegetation, early signs of decay.
- Ashen Mountains: scorched ground, ash and volcanic intrusions.
- Wyrmlayer: obsidian, fissures, crimson volcanic accents.

`daylight` and `saturation` are **design inputs**, not a request to multiply
all rendered pixels. Darkness must be achieved through material selection,
contrast, shadows, and eventually lighting. The Wyrmlayer must retain readable
characters, attacks, terrain edges, and navigation.

`createHuntRouteMaterialProfile` samples an ordered World Map route. Each node
carries its biome and cumulative travel distance. Corruption is zero at the arena
and reaches 100% at the lair whether the route has 3, 4, or 10 nodes. Material
blending between adjacent biomes uses the local segment, so a mountain start is
valid and a forest-to-mountain transition can happen anywhere along the route.

## Ownership and milestone boundary

1. **Current Voxel V2 texture milestone**: finish authored albedo, normal,
   roughness/AO maps, blending, variant support, and mobile performance.
2. **Voxel V2 terrain materials**: later expose corruption-dependent material
   sets without changing voxel IDs or destruction behavior.
3. **World generator**: chooses geographical progression and local biome mixing.
4. **Lighting Engine V2 — deferred**: interprets environmental lighting inputs
   only after Voxel V2 acceptance.
5. **Objects — deferred**: healthy trees, dead trees, charred remains, lava
   props are owned by independent object systems.

The regular Hunt still uses the fixed-distance Fading Woods preview. The route
profile is ready for the World Map to supply the actual arena-to-lair route;
the preview expedition currently ends at extraction.

### Play Hunt material route preview

Open `play-hunt.html?route=highland` and use the destination picker to walk the
authored terrain at each step. `route=forest` and `route=mountain` select the
shorter three- and four-Hunt examples. A destination loads independently by
WorldGen recipe, with corruption sampled by cumulative journey distance.
The highland route uses the authored forest-highland terrain between forest
and mountain. The lair uses the existing volcanic geology, including its
physical fissures. Campaign unlocks, encounter progression, and lava
simulation are outside this review.
