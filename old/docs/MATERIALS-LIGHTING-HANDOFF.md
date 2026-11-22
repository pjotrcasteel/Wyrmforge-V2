# Materials V2 scoped handoff — 2026-11-18

Status: **DONE FOR NOW for the current Fire Hunt material scope**, by owner's direction to wrap up and revisit engines later. This is not full R10 scene acceptance or phone performance acceptance. Keep future art revisions separate from Lighting V2. Fluid fixes remain in the concurrent Water V2 workstream.

## Existing inputs and responsibility

| Input | Current contract | Lighting responsibility |
| --- | --- | --- |
| Identity | `terrain-materials.mjs`: stable grass 1, dirt 2, stone 3, protected bedrock 4. Surface selection does not mutate occupancy. | Consume IDs and surface definitions; never change terrain to change illumination. |
| Albedo | `terrain-surface-library.mjs` logical keys and `terrain-texture-manifest.mjs` upload slots. Texture albedo is sRGB; GPU sRGB arrays decode to linear. Procedural albedo explicitly converts to linear. | Apply illumination in linear space, encode output once. Preserve world-anchored pixel scale. |
| Normals | Optional tangent-space RGB, linear data. Neutral fallback `[128,128,255]`. `webgl-voxel-view.mjs` constructs a face tangent basis. | Combine geometric normals and detail normals; detail never alters collision or occluders. |
| Roughness / AO / metalness | Optional linear ORM: R=AO, G=roughness, B=metalness. Neutral `[255,255,0]`. Current renderer uses approximate AO/roughness multipliers, not a PBR implementation. | Own light response. Metalness is reserved; do not infer a complete BRDF from current multipliers. |
| Height | Optional linear height channel in manifest; neutral 128. | Appearance only unless a separate Voxel edit is explicitly requested. |
| Emission | `fire-lava-material.mjs` provides separate linear albedo and palette emission factors 0–1.15. These are artistic relative strengths, not calibrated radiance. No generic emitter registry exists yet. | Introduce bounded, versioned emitter descriptors and consume material emission. Light transport, occlusion and spill belong here. |
| Terrain changes | `terrain-integration-port.mjs`: versioned read-only queries, immutable committed change notifications and epoch/revision identity. | Invalidate only affected lighting/occluder regions; do not hold mutable terrain internals. |
| Liquid geometry | Fluid solver publishes surface snapshots; renderer constructs caps, sides and parcels. | Read actual surfaces for emission/occlusion; do not run or modify fluid amounts. |

## Performance wrap-up

The shared terrain fragment shader now dispatches mineral stone before grass, bank, fading and cut-face albedo overlays. Those results were wholly overwritten by `stoneMineralSurface`. Shared normal/ORM response, height contrast, lab overrides and non-stone branches remain unchanged.

A repeatable GLES3 witness compiles/links the actual assembled before/after fragment shaders and draws a 402×604 viewport. Seven alternating batches of 12 draws, each synchronized with `glFinish`, exclude compile/warm-up. Mesa llvmpipe (software rendering) measured median stone top 1.343 → 0.806 ms/draw and stone side 1.190 → 0.743 ms/draw. All RGBA bytes match for top/side stone, grass control and bedrock control. Controls show normal measurement variation (grass 1.387 → 1.442 ms; bedrock 1.193 → 1.191 ms). This is a focused software-renderer cost comparison, not an end-to-end Hunt benchmark or iPhone GPU measurement. Fixture uses procedural fallback layers and an empty bank map; textured/material-lab combinations are not visually accepted by this witness.

Raw evidence: `evidence/r10-01-stone-overlay-cost.json`. Optional reproduction: export `WEBGL_V2_FRAGMENT_SHADER_SOURCE` from baseline `4000e4a` and this revision to before/after files, then run `python scripts/benchmark-stone-overlay-cost.py before.frag after.frag evidence.json` on Linux with EGL/GLES3 Mesa. No browser runtime dependency is added.

The owner's iPhone report for `4000e4a` remains an **open performance defect**: frame p50/p95/p99 33/96/159 ms; CPU-work p95 29 ms; maximum frame 229 ms; 550 session frames over 33 ms. That report also contains a liquid-parcel exception, owned by the other Water V2 workstream. Its WAT-10 correction has since merged as `10664cd`; device confirmation remains pending. This optimization does not establish resolution of either the integrated lag or parcel exception. Require a fresh device report after both streams deploy.

## Lighting V2 entry gate

First establish a narrow surface/emission descriptor and renderer hook in the actual Hunt. Move temporary height/face lighting behind that hook, preserving a baseline fallback. Then add bounded cliff/crevice shading and lava spill with destruction invalidation. Validate on mobile before increasing light count, radius or shadow quality. Do not add more material detail while performance remains unexplained. Overhang contact correctness remains F07-04 #348, independent of this handoff.
