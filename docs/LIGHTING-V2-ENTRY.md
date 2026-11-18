# L10-01 — Lighting V2 entry seam

The current Hunt now evaluates illumination through `evaluateV2Lighting(V2Surface, V2LightingContext)`. This foundation preserves the accepted material appearance. It adds no dynamic lights, shadows, occlusion queries, fluid behavior or terrain writes.

## Contracts

| Owner | File / values | Limits and meaning |
| --- | --- | --- |
| Materials | `src/materials/surface-contract.mjs`: `wyrmforge.surface.v1` CPU descriptor; GLSL `V2Surface` | Linear albedo [0,1], unit normal, linear ORM [0,1], linear emission [0,64]. Immutable copied CPU arrays. Shader receives detailed and geometric normal separately plus map-presence flags to preserve baseline response. No light transport or engine imports. |
| Lighting | `src/lighting/light-contract.mjs`: `wyrmforge.light-set.v1` | Immutable emitter list with epoch/revision identity; maximum 32 unique emitters, 32 m radius, finite bounded position/radiance. Validation bounds are safety/work ceilings, not a promise that 32 shadowed lights meet mobile targets. Receiver must reject stale identity when live state is integrated. |
| Lighting | `src/lighting/baseline-lighting.mjs` | Pure light-evaluation function consumes surface/context. Owns existing face shading, detail-normal response, approximate AO/roughness, shallow-grass override and height contrast. Emission is added in linear space. No world, GPU or material implementation imports. |
| Rendering | `src/webgl-voxel-view.mjs` | Decodes textures, constructs normals, assembles material values/context, calls lighting once and encodes output once. Constructor accepts a trusted `lightingShader` option; same source is retained through context restoration. |

`assembleVoxelFragmentShader()` defaults to the baseline. `UNLIT_LIGHTING_GLSL` is an explicit independent diagnostic fallback, selected via `new WebGLVoxelView(canvas,{lightingShader:UNLIT_LIGHTING_GLSL})`. Hook source is bounded to 16 KiB and must expose the contract signature. This validates the assembly interface, not arbitrary GLSL safety; real compilation remains necessary. Failed custom compilation throws instead of silently masking the error. The existing fast-Hunt diagnostic bypass retains its old behavior.

Surface and emitter CPU descriptors are foundational public contracts, not a running light registry. Terrain uses zero emission for this baseline. Existing lava rendering is unchanged: its duplicated palette/emission integration remains the next coordinated material/render adapter seam. No fluid renderer or solver file was changed.

## Evidence and limits

The actual before/after assembled fragment programs compile, link and draw under GLES3. Four fallback fixtures (stone top, stone side, grass top, bedrock side) match all output RGBA bytes. Four additional fixtures enable albedo, detail-normal and ORM sampling using a synthetic 1×1 texture array; all bytes match too. Unlit also compiles/links/renders. This does not establish every authored texture/lab view or real-device visual acceptance.

Mesa llvmpipe software rendering, 402×604, seven alternating batches of 12 synchronized draws: fallback median stone top 0.750→0.771 ms, side 0.753→0.735 ms, grass 1.365→1.381 ms, bedrock 1.202→1.201 ms. Textured fixture medians: 1.483→1.546, 1.548→1.600, 2.833→2.906, 1.993→1.979 ms respectively. These small differences and workstation variation are recorded as cost evidence, not a mobile performance improvement. Raw batches are in `evidence/l10-01-baseline-shader-cost.json` and `evidence/l10-01-textured-shader-cost.json`.

Reproduce by exporting `WEBGL_V2_FRAGMENT_SHADER_SOURCE` from baseline `1ace153` and this revision, then running `python scripts/benchmark-stone-overlay-cost.py before.frag after.frag evidence.json` with optional `--textured` on Linux/EGL Mesa. CI compiles both baseline and unlit shader variants. Tests exercise contract bounds/immutability, reverse-dependency restrictions, hook selection and WebGL restoration. No static runtime cycles were found: 151 modules / 216 local edges at this revision.

Validation: 787 automated tests pass, including hook restoration and dependency guards. Dependency audit and diff check pass.

## Next slice

L10-02 [#354](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/354) should consume actual scene surfaces through explicit adapters, unify lava emission evaluation with the fluid presentation owner, and introduce bounded cliff/crevice shading and lava spill in the actual Hunt. It must use terrain epoch/revision changes for invalidation and a measured mobile budget. Keep material appearance, fluid amounts and terrain occupancy in their owners. The previously reported mobile lag remains pending a fresh device report; L10-01 does not close it. F07-04 #348 still gates generated overhangs.
