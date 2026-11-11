# Terrain texture asset preparation (Voxel V2 milestone)

The manifest compiler is an offline/pure-data stage between the variant registry
and a future WebGL2 texture-array uploader. It enumerates and deduplicates logical
texture keys, validates channel color spaces, and rejects configurations above a
specified uncompressed GPU-memory estimate. It does **not** download textures,
allocate GPU resources, modify shaders, or implement blending.

Albedo is sRGB; normal, ORM and height maps are linear. Packed ORM uses
R = ambient occlusion, G = roughness, B = metallic. Neutral missing-map values
are albedo white, normal (128,128,255), ORM (255,255,0), and height mid-gray.

The estimate covers uncompressed RGBA base levels only. Before implementing
the uploader, add mipmap overhead, staging allocation, device layer limits,
context restoration, and per-frame upload budgets.

Next: asset loading/caching and a bounded GPU upload adapter, then world-space
texture sampling and variant blending. Lighting Engine V2 remains deferred.
