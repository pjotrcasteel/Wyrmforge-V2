# L10-05 — Terrain-aware prop contact grounding

Status: implementation preview, **not** player/device accepted. Issue [#374](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/374). Start from the current main (includes concurrent Water work).

## Approach and boundaries

The actual Play Hunt overlay now consumes **resident World Object poses** and the public, revisioned **Voxel V2 terrain raycast**. Lighting defines a thirteen-sample soft, restrained contact attenuation profile for each tree root, boulder or log. Rendering only caches receiver samples and draws tiny screen-space pixel stamps at their *actual* world-space contact elevations.

For each stamp, a bounded vertical query must hit a real ground receiver within 37 cm of the prop support, and a camera-direction occlusion query must see that receiver first. Missing, unpublished, lower-shelf and occluded samples are rejected. Individual stamps conform to microvoxel shelves/cliff edges; no ungrounded ellipse, second terrain height store, full canopy caster or fluid/simulation writes. This is **contact grounding**, not directional canopy shadows (L10-06).

The cache retains at most 96 prop entries, performs at most 64 terrain rays per frame, and draws at most 1,248 stamped squares per frame. Terrain changes invalidate only intersecting footprints; pose changes, epoch resets, region eviction and Hunt reset discard stale data. No world-wide traversal, Canvas getImageData or new GPU shadow allocation. Shadow work is skipped when Lighting is off.

## Repro and evidence contract

Same-build switches:
- `play-hunt.html` — lighting on, contact shadows on.
- `play-hunt.html?contactShadows=off` — ambient, Fireball and fluid lighting unchanged; contact proxy off.
- `play-hunt.html?lighting=off` — whole Lighting-off diagnostic (not an isolated contact delta).

Export the Play Hunt report for each matched seed, camera, route, render scale and workload. `lighting.contactShadows` contains frame rays, stamps, retained estimate, cache hits/misses, and p50/p95/p99 for the incremental Canvas CPU work. `worldObjects.woodlandOverlayCpu` includes all sprite/actor overlay work, and `performance.frameIntervals` covers total RAF intervals. GPU timer query for this Canvas proxy is unavailable, reported explicitly rather than inventing GPU milliseconds. Shader compilation remains the existing terrain pipeline.

Review dense trees, sparse logs/boulders, river bank, clipped cliff, destruction/falling, region unload/reload, reset and context recovery. **Baseline before claiming success:** matched on/off session runs are still needed on named iPhone Safari, Android Chrome and desktop; no device result has been inferred. Provisional incremental Lighting CPU p95 <=1 ms and GPU <=2 ms, and <=16 MiB overall Lighting resources, are **targets**, not achieved numbers.

Limitations: 13 conservative stamped samples per receiver are intentionally low-resolution, and new visible objects may populate over several frames under the fixed query budget. This pass does not cast canopy shadows or fully model undercut overhangs, nor does it shade fluid receivers. Those belong to later roadmap items. If the root patches look detached or too square in real gameplay, keep #374 in review rather than treating passing CI as visual approval.
