# Engine ownership and handoffs

| Owner | Authoritative responsibility |
| --- | --- |
| World Generation | Seeded geography, authored routes, biome/surface intent, prop placement descriptors and usable encounter space. |
| Voxel and Physics | Terrain cells, material IDs, terrain edit replay, spatial queries and physical movement/collision. |
| Water V2 / Fluids | Fluid amounts, levels, flow connectivity and response to terrain edits. Supply surface state to Materials and Rendering. |
| World Objects | Prop IDs and state, grounding and support-loss decisions using terrain queries, and prop collider lifecycle. |
| AI and Agents | Perception, pursuit, path decisions and agent intent using public spatial queries. |
| Encounter | Wave composition, spawn timing, encounter objectives and outcomes. |
| Spell and Hazard Gameplay | Cast rules, hit intent, hazard type, strength, duration and required effects. |
| Materials and Surface | Shared surface definitions, texture assets, normals, roughness and emissive parameters. Terrain and props refer to stable material IDs. |
| Rendering, Lighting and VFX | Rendering consumes scene state and material definitions. Lighting consumes explicit emission or light sources. VFX presents spell and hazard outcomes. |
| Play Hunt | Compose the owning systems and display their results. |

## Example: a magma fissure

Spell or Hazard Gameplay explicitly requests an opening and a magma hazard.
Voxel applies and journals the terrain edit. The hazard identifies its
active surface and heat lifetime. Materials defines hot magma's red-orange
emission and the cooled surface. Lighting uses that emission on nearby
geometry, and VFX can add sparks or heat shimmer. World Objects consumes
terrain support changes and updates affected props. A plain crater exposes
its existing materials and does not acquire emission from its shape.

## Current handoff gate

H08-05 accepts grounded props, stable identity, collision across residency,
and representative prop cost evidence. The owner confirmed collision and
approved art in #160. O08-99 (#227) records the scoped device evidence and
handoff to F07-02 in Voxel. H08-07 is a cross-engine encounter integration
with separate Encounter and AI responsibilities, not a World Objects gate.
H08-08 coordinates spell hits, terrain edits and object damage after its
prerequisite contracts are in place. Terrain visibility and streaming work
remains tracked under #223.


## River destruction handoff

[WAT-01](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/323) tracks water
entering connected Fireball craters and draining through breached banks. Lava
uses the same terrain connectivity with a slower material-specific flow rate.
WorldGen supplies initial channels and sources. Voxel publishes terrain edits.
Water V2 owns the changed fluid state, while Materials consumes its surface.

## Lighting V2 entry

L10-01 introduces pure surface and light-set descriptors and the renderer's
`evaluateV2Lighting` hook. See [contracts and evidence](LIGHTING-V2-ENTRY.md).
Materials supplies linear surface values; Lighting evaluates illumination;
Rendering owns texture/GPU resources and final output encoding. No light
evaluation may write terrain, fluid state, props or gameplay. The baseline
function and unlit diagnostic fallback are independent of those engines.

Lighting environment v1 is immutable data owned by Lighting. The Hunt host
supplies its existing daylight profile; Rendering binds ambient RGB. Neither
Materials nor terrain/fluid authorities infer or mutate illumination state.
See [ambient contract](LIGHTING-AMBIENT-CONTRAST.md).
