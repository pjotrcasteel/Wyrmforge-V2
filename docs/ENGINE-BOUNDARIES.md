# Engine ownership and handoffs

| Owner | Authoritative responsibility |
| --- | --- |
| World Generation | Seeded geography, authored routes, biome/surface intent, prop placement descriptors and usable encounter space. |
| Voxel and Physics | Terrain cells, material IDs, terrain edit replay, spatial queries and physical movement/collision. |
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
approved art in #160. Measure prop workload and record device evidence before
claiming the gate complete. H08-07 is a cross-engine encounter integration
with separate Encounter and AI responsibilities, not a World Objects gate.
H08-08 coordinates spell hits, terrain edits and object damage after its
prerequisite contracts are in place. Terrain visibility and streaming work
remains tracked under #223.
