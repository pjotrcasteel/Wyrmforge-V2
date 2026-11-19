# L10-08-NM — real Hunt terrain normal-map activation

Tracking issue: [#418](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/418), under [L10-08 #377](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/377). This document describes the first implementation and the *remaining acceptance*, not a completed art review.

## Verified missing link (2026-11-19)

The deployed Hunt already has a WebGL2 `sampler2DArray uTerrainNormal` with terrain surface slots, per-face tangent basis, a `V2Surface.hasDetailNormal` contract, baseline directional light and transient Fireball light evaluating `surface.normal`. But the Hunt bootstrap in `external-terrain-lab.mjs` loads only three **albedo** PNG tiles into `setTerrainMaterialTile`, never normal tiles. In addition, the shader gates normal sampling behind the **albedo layer**, so procedural dirt/grass-side colors would ignore independently supplied normal textures. Thus declaring the normal system present did not make the actual iPhone Hunt normal-mapped.

## Scope / implementation order

1. Reuse the existing 64×64 WebGL2 normal array and per-frame texture uploader. Generate **bounded preliminary tangent-space normal tiles once at bootstrap** from the nine existing Fire Hunt material *colour studies* (selected slots only). Tile noise/gradients are deliberately conservative and **not** equivalent to authored height or final PBR art; future approved normal PNGs should replace this adapter without Lighting changes.
2. Feed both grass palettes, rooted soil, regular/dark earth and bedrock material normal keys. Procedural albedo fallback must **still receive** a normal tile; no mandatory albedo replacement.
3. Fix the terrain-face basis so each wall's map-V axis points up the physical wall. Use the detailed normal for diffuse sun and spell light; keep the physical/geometric normal for shadow visibility, occlusion and collision. Leave the existing static-emission transport and Water simulation unchanged.
4. Expose `?terrainNormals=off` for same-build, same-seed screenshot comparisons, and a read-only opt-in `?terrainNormalTest=1` diagnostics contract with requested/uploaded normal layers. Disabled means exactly geometric normal; never claim a normal map is present until the GPU layer is uploaded.
5. Add executable regressions for finite unit normals, tile repeat, channel mapping, material-only fallback, mobile texture budget, context recovery, actual Hunt startup wiring and GLSL compilation. Browser witness to capture on/off for seed-7 Wet Forest, Mountain Pass and Scorched Approach.

## Boundaries and mobile cost

- **Materials** owns art source/normal values; **Renderer** owns decoding/generation, texture cache, face tangent basis and shader uniforms; **Lighting** owns light evaluation. Voxel, WorldGen, Object, Water and save files are not modified.
- Six 64×64 RGBA8 normal tiles = **98,304 bytes of CPU-side source pixels** before transients. The existing whole normal array allocates six 64×64 layers at seven mips, independently bounded by the manifest (~131 KiB). Avoid a new full-scene per-pixel shader, screen-wide postprocess, animated normal generation or new terrain rays.
- Avoid bright/noisy grass: cap tangent slopes and use a lower relief strength for grass than rocks/soil. Preserve existing camera shadows and cliff contrasts from #416/#417; the goal is textural relief, **not changing actual geometry**.
- On iPhone Safari and Android Chrome: inspect same seed/camera with normal on/off, GPU allocation, shader compilation, frame p50/p95/p99, 10-minute thermals and aliasing/shimmer. CI and software browser witnesses **cannot close** named-device acceptance.

## Acceptance

- The actual Hunt reports **positive GPU-loaded normal layers** and displays more detailed shading on dirt/stone while retaining believable grass.
- `?terrainNormals=off` changes detail shading but not geometry, depth/occlusion, shadows, save state, Water or actor movement.
- Same scene must remain readable when normal texture load fails or WebGL context is restored.
- At least one actual browser screenshot pair + unit/GLSL tests pass before merging, then verify the exact Pages build. Owner must still approve iPhone aesthetics; replace temporary albedo-derived maps with art-approved maps separately.
