# Terrain albedo renderer integration (Voxel V2)

The WebGL2 renderer now supports authored albedo tiles in a single texture array.
It retains the existing procedural fallback until an authored tile is uploaded.
No authored tile is bundled by this PR, so the default scene appearance is unchanged.

Call `setTerrainAlbedoTile(logicalAssetKey, image)` with a decoded 256×256 image.
The key must be one of the manifest's albedo keys, e.g. `grass/meadow/albedo`,
`grass/rooted-soil/albedo`, `dirt/earth/albedo`, `stone/bedrock/albedo`.
The renderer uses the first variant per surface until weighted variant blending
is implemented. `setTerrainTextureScale(tilesPerVoxel)` controls world-space UVs.

Uploaded images are retained for WebGL context restoration. The existing
1024×1024 grass upload remains compatible; authored array tiles take precedence.
The renderer currently initializes the texture arrays eagerly. Before production
acceptance, measure startup allocation and move uploads to a frame-budgeted
runtime path. The runtime queue is not yet wired to this renderer.

**Next:** integrate real asset delivery, avoid eager GPU allocation, render
multiple variants and blend material transitions; test on mobile before acceptance.
Lighting Engine V2 is out of scope.
