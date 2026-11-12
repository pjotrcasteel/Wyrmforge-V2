# Voxel V2 — 64×64 authored terrain material previews

The independent V2 WebGL2 renderer can render **locally supplied 64×64 PNGs**
on actual grass tops, grass-soil sides, dirt and stone. Authored textures enter
through logical V2 surface slots and never change material IDs, authoritative
voxel geometry, collision or save/replay data.

## Test in the lab (no local hosting)

Open the deployed V2 lab and choose **Controls → Terrain Materials — 64×64
Authoring Preview**. Choose one of six material slots, then **Color (sRGB)**,
**Normal (linear)** or **AO / Roughness (linear)**. Upload a real 64×64 PNG.
Switch to Hill, Cliff or Arch, zoom and carve a crater to see the same
world-anchored surface mapping on freshly exposed voxel faces.

- Materials: grass top, dark grass variation, grass-soil side, dirt, dark
  dirt variation, stone. All 18 channel slots are owned by the existing
  validated manifest; arbitrary paths cannot be referenced.
- PNG MIME, compressed byte budget and 64×64 IHDR are checked *before*
  decoding. Decoded dimensions are verified again before staging.
- Uploads and WebGL context recovery use the existing per-frame queue;
  reloading or clearing the preview releases local references. No image is
  saved to the repo or converted into an approved asset.
- **Preview reference terrain textures** remains optional. User-supplied
  slots override the temporary reference layers. Turning references off
  preserves local PNGs; **Clear local previews** returns to references if
  enabled or to procedural fallback otherwise.
- The earlier Grass 002 **1024×1024** image input remains available for
  comparison and is separate from the 64×64 per-face material arrays.

## Renderer and performance

The active WebGL2 material array uses native **64×64 RGBA8** texture layers
instead of the earlier **256×256** preview array. Base-level allocation per
layer is therefore 1/16; the manifest still checks the total budget.
The default manifest compiler retains the configurable 256×256 offline
reference size for compatibility; the renderer explicitly requests 64px.

Grass/dirt weighted secondary albedo patches now blend secondary tangent
normals and ORM maps with the **same world-anchored blend weights**. Missing
maps keep their existing fallback. This is V2-local reference lighting, *not*
the Lighting Engine V2.

**Not yet accepted:** authored artwork, seam/grid approval at gameplay
distance, measured mobile filtering/mipmapping, iPhone and Android p95/p99,
and runtime production Hunt integration. These are real remaining gates,
not waived by a successful upload demonstration.

## Hunt-distance filtering and seamless preview — 2026-11-12

The active WebGL2 texture arrays now request `mipLevels: 7` for 64px
material tiles. The texture cache sets `LINEAR_MIPMAP_LINEAR` and regenerates
lower mip levels after successful, frame-budgeted uploads. The original
256px manifest remains a testable default; legacy Grass 002 remains a
separate comparison control. All 64px albedo/normal/ORM map slots use the
same filtering policy and retain the original V2-native sRGB/linear formats.

To avoid a conspicuous patchwork of dark green blocks, grass-top variants
blend at 46% of their former maximum strength and dirt variants at 60%.
Those exact weights also apply to the matching normal and ORM maps, using
stable world coordinates. Temporary reference generators now feather the
four outside pixel rows/columns and verify opposite RGB borders match
across tile repetitions, without editing any user-supplied PNGs.

The Hunt camera projects raised blocks approximately 33% taller on screen
without rotating its north-up travel axes. This remains a **candidate Hunt
camera**, not a locked gameplay choice. It does not change terrain voxels,
meshing, replay or collision.

Automated checks are not visual approval: compare inspection and Hunt at
far/normal/near zoom on a physical device before accepting this material
and camera-readability gate.
