# V2 material ↔ lighting boundary (decision)

**Status:** Contract foundation only. This does **not** claim that PBR shaders,
normal-map sampling, dynamic lighting or shadow updates are implemented.

## Ownership

- Voxel Engine V2 owns material IDs, voxel edits, and visible-face geometry.
- Material System V2 maps a visible face to a surface descriptor and optional assets.
- Lighting Engine V2 owns light lists, shadow resources and ambient lighting.
- Scene Renderer V2 samples the surface and lighting frame to shade pixels.
- Lighting receives read-only scene geometry/occluder changes; it never edits voxels.
- No V1 code or asset dependency is introduced.

## Stable contract

`src/material-lighting-contract.mjs` defines version
`wyrmforge.material-lighting.v1`, a surface registry, and a frame snapshot.
Voxel material IDs do not change. `terrainSurfaceKey(id, normalY)` selects the
surface key for a visible face; buried faces are never sent to the renderer.

Material descriptors carry linear base-color factors, metallic (zero for
terrain), roughness, normal scale, AO factor, emissive factor, and logical
texture keys. Missing textures must resolve to neutral defaults, not fail the
scene. Albedo is sRGB; normal and ORM textures are linear.

ORM channel layout: **R = AO, G = roughness, B = metallic**. This is a
Wyrmforge packing choice compatible with glTF metallic-roughness conventions
for roughness and metalness. Height is optional and must not modify voxel
collision or destruction.

Lighting frames provide ambient RGB, directional lights, local lights, and
opaque shadow resources. Shadow resources remain owned by the lighting engine;
the frame does not promise deep immutability of those handles.

## Next integration milestones

1. Add a renderer adapter consuming the material descriptor and neutral map
   fallbacks, with a single deterministic reference light.
2. Add tangent-space normal-map sampling for top and vertical faces and verify
   world-anchored UVs across chunks and edits.
3. Add roughness response and packed ORM sampling, with mobile quality switches.
4. Connect Lighting Engine V2 frame and dirty-region shadow updates.
5. Validate on actual Hunt terrain and iPhone before enabling more lights.

Do not couple the voxel world to GPU texture handles or a lighting engine.
