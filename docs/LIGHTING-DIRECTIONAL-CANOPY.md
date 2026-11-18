# L10-06: Directional canopy shadow preview

This is a **reviewable first slice**, not full completion of [L10-06 #375](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/375).

Lighting owns a single fixed sun direction. Rendering reads the approved sprite atlas once per variant into a 7x8 alpha-cutout silhouette, projects each visible canopy cell down a sun vector, then samples the actual 10cm/1m Voxel receiver surface through the public terrain port. Missing/unpublished ground and detached lower cliffs receive no invented decals. The near-root contact remains owned by L10-05 so the darkening is not doubled.

The Hunt renderer caches at most 48 visible casters, performs at most 16 new terrain queries per frame, and paints at most 1,100 directional pixels/stamps per frame. Terrain edits invalidate intersecting projected receivers. Falls/hits, eviction and epoch/reset discard stale projections. The game camera reprojects cached world-space stamps; there is no full-screen pass and no per-frame atlas readback. Lighting never changes the Voxel, Water, World Objects or save authorities.

Use the same build with the Play Hunt switch `?directionalShadows=off` to compare against ambient/contact shading. Exported reports include `lighting.directionalShadows` with observed CPU/retention metrics and honest GPU timing unavailability.

**Remaining inside #375**: actual browser screenshot difference check, complex mountain cliffs and vertical-face occlusion (not present in this Canvas ground-receiver preview), player-visible review, cross-region and context-recovery evidence, iPhone Safari / Android Chrome and sustained desktop measurements, and shared CPU/GPU performance acceptance. Do not close #375 or start L10-07 merely because unit tests pass.

**Deferred regression:** owner-observed blank side terrain [#391](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/391) belongs to streaming/WorldGen and is deliberately tracked for L10-10/L10-99 stabilization.
