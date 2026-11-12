# Voxel V2 — independent material surfaces and variants

The authoritative V2 voxel material IDs are unchanged. Exposed grass
tops, grass-soil sides, dirt and stone have stable **logical surface keys**;
no material variant changes world state or meshing authority.

The data-driven surface library defines six deterministic variants with
stable seeds and weighted world-space selection. Two authored **albedo**
variants for grass tops and dirt can blend across world-anchored 4-voxel
patches; neighboring chunks and excavation do not change the coordinates.
When available, their matching **normal** and **ORM** channels now use
the same blend weight. Other surfaces fall back to their single variants.

The actual independent renderer accepts locally uploaded **64×64** PNG
tiles into these slots. The lab supports previewing grass, grass-side, dirt
and stone without importing artwork or editing materials on disk. Reference
textures remain deterministic temporary previews; they are *not* final art.

Still open before accepting the materials milestone: user approval of
each actual authored 64×64 tile and its zoomed-out seamless repeated grid,
physically validated readability and distance filtering, completed material
transition aesthetics, and sustained iPhone/Android memory and frame evidence.
Lighting Engine V2 remains deferred.
