# Voxel V2 material milestone — surface variant registry

**Scope:** voxel terrain texture architecture only. Lighting Engine V2 remains deferred.

The authoritative voxel material IDs are unchanged. The existing
`terrainSurfaceKey(materialId, normalY)` resolves grass tops, grass soil sides,
dirt and stone. The new `terrain-surface-library.mjs` describes logical texture
asset keys and weighted variants per surface, with deterministic selection from
world coordinates and seed. New variants can be added to data without adding
new voxel IDs or changing terrain editing.

The initial names are **asset slots**, not bundled artwork: a renderer must
not attempt to load them until the asset pipeline is implemented. Existing
WebGL procedural fallback remains in place, so this PR has **no visual change**.

## Remaining work before milestone acceptance

1. Texture asset manifest, loading, validation, caching and GPU memory budget.
2. Efficient atlas/array selection and world-space UV mapping.
3. Cross-variant blending with stable deterministic weights and chunk continuity.
4. Cross-material transitions with rules for slopes, grass edges and excavation.
5. Albedo, normal and packed roughness/AO maps with reference lighting only.
6. iPhone Hunt-camera visual and performance validation.

Avoid shader specialization per variant and avoid lighting-engine integration.
