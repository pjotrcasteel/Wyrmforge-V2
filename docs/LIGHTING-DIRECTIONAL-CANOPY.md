# L10-06: Directional canopy shadow preview

This is a **reviewable directional-shadow implementation**, not real-device acceptance or full completion of [L10-06 #375](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/375).

Lighting owns a single fixed sun direction. Rendering reads the approved sprite atlas once per variant into a 7x8 alpha-cutout silhouette, projects each visible canopy cell down a sun vector, then casts toward the single sun direction using the actual 10cm/1m Voxel DDA. The first solid receiver can be a terrain top or a vertical cliff face. A second bounded ray confirms that the receiver is not hidden behind nearer rock from the Hunt camera. Missing/unpublished ground and detached lower cliffs receive no invented decals. The near-root contact remains owned by L10-05 so the darkening is not doubled.

The Hunt renderer caches at most 48 visible casters, performs at most 16 combined physical sun/camera visibility queries per frame, and paints at most 1,100 directional pixels/stamps per frame. Terrain edits invalidate intersecting projected receivers. Falls/hits, eviction and epoch/reset discard stale projections. The game camera reprojects cached world-space stamps; there is no full-screen pass and no per-frame atlas readback. Lighting never changes the Voxel, Water, World Objects or save authorities.

Use the same build with the Play Hunt switch `?directionalShadows=off` to compare against ambient/contact shading. Exported reports include `lighting.directionalShadows` with observed CPU/retention metrics and honest GPU timing unavailability.

**L10-06 cliff completion slice (PR #394):** first-hit directional Voxel ray replaces projected height-column shadows; north-facing cliff walls now have real receiver normals and camera-side visibility rejection. A separate real-Voxel test builds physical walls, terrain destruction, and a foreground occluding ridge. The one fixed sun now casts diagonally leftward and toward negative world Z so a Hunt-visible cliff can be directly sunlit. The read-only renderer rejects unlit/back-facing and hidden faces and reports `frameCliffStamps` and `occlusionRejects`. Existing eight-caster same-frame OFF/ON/OFF browser evidence must pass before merger.

**Remaining inside #375:** player-visible forest/mountain approval, full scene shadow quality across terrain edits, cross-region/context recovery, 10-minute iPhone Safari/Android Chrome and sustained desktop metrics, CPU p95 <=1ms target and GPU timing or an explicitly unavailable report. These are honest acceptance gates, not a reason to start unrelated Water fixes.

**Deferred regression:** owner-observed blank side terrain [#391](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/391) belongs to streaming/WorldGen and is deliberately tracked for L10-10/L10-99 stabilization.
