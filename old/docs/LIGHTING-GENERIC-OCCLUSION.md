# L10-07: generic point-light occlusion (first integrated slice)

This implementation is **source- and asset-agnostic**. Lighting consumes the existing `wyrmforge.light-set.v1` (ID, position, radius, radiance, terrain epoch/revision) and read-only public raycast/geometry contracts. There is no code branch for a Fireball, lava, tree, oak, building or wall. The existing Play Hunt spell adapter still generates ordinary light descriptors; a future material/hazard emitter uses the exact same interface.

## New physical occluder interface

- World Objects publishes `physicalRevision` and `physicalOccluders(focus)`: AABBs in world metres with `id`, `min: [x,y,z]` and `max`. Existing woodland objects derive them from existing collision extents, never from sprite artwork; new houses/buildings/doors publish the same physical collider. Decorative/non-physical images do not silently become solid shadows.
- `LightOccluderRegistry.register(provider)` attaches any revisioned physical-collider provider, without a Lighting import in the provider. Register new object systems in Play Hunt scene composition once; after that, adding or removing instances is automatic through provider revisions and object residency.
- `defineLightOccluders` validates immutable bounded snapshots (64 nearest physical shapes). Public Voxel terrain is the other visibility input. Lighting never edits physical, terrain, object, fluids, materials or saves.

## Shared rendering contract

A fixed 2-elevation × 12-azimuth visibility sector field samples actual 3D ray intersections at a maximum of **24 raycasts per frame**, with at most two transient emitters and **48 floats / 192 bytes** retained for the GPU upload. A terrain revision, epoch, light pose/radius or physical-object revision invalidates the previous field. The active field is applied identically by the WebGL terrain fragment shader and the CPU Canvas sprite irradiance sampler. The existing independent unshadowed fallback stays available when the field is missing, stale, still constructing or `?pointOcclusion=off`; `?lighting=off` remains the global diagnostic.

**Known limits (not accepted):** the narrow angular sectors are a deliberately coarse first tier and may create wedges or allow light leakage between rays. A transient Fireball may move before the complete field is ready (unshadowed fallback). Two elevation bands do not represent every micro-shelf or full 3D silhouette. The lava local-light field is still a separate height approximation and must consume the shared spatial visibility contract in the next L10-07 slice. Tests and short software-WebGL runs cannot close iPhone/Android thermal and whole-game frame budgets.

**Validation:** real Voxel wall before/after destruction, negative coordinates, building/tree provider parity, dynamic source movement, 2-emitter bound, epoch/revision reset, CPU/GPU shader contract, and the actual Hunt pixel witness. Continue L10-07 until solid-bank light leakage and the static lava path meet acceptance. Defer unrelated streaming #391 and Lighting performance review to L10-10/L10-99 as agreed.
