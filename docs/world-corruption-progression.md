# Wyrmforge V2 — world corruption art direction

The journey starts in a **bright, healthy forest** and becomes progressively
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

The profile currently has **no rendering integration and no visual effect**.
Do not mistake it for a completed corruption system or a lighting milestone.
