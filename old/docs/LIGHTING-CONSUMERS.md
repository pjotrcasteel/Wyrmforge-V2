# L10-04: lighting across render consumers

Rendering now consumes the existing Lighting environment and maximum-two transient LightSet for water/foam and Canvas sprites. The host supplies shared world-space positions and frame time. Lighting owns irradiance; Rendering owns colour conversion, uniforms and Canvas resources. Water state, solver, checkpoint, surface mesh, GPU buffer reuse and physics are unchanged. WAT-14b streamed-water opt-in remains intact.

Water uses its actual surface position and normal, decoding its display palette to linear RGB for ambient/point light, then encoding once. Neutral lighting takes an exact bypass. Lava keeps its existing self-emissive palette. No new textures or terrain queries are added. Context restoration rebuilds uniform locations with the existing program lifecycle.

The Wizard samples near mid-body. Trees/props sample near the trunk/base or prop centre. Canvas tints transform RGB in linear space and preserve every alpha byte; original draw rectangles, rotation, opacity, clipping and layer sorting are retained. The golden staff tip remains emissive. The forest backdrop receives ambient only.

## Bounded work and limits

Tint variants are quantized to 1/16 irradiance, clamped to 4. The cache retains at most 48 variants and 8 MiB including at most 2 MiB/32 source crops. At most 65,536 pixels are read/transformed per paint; hits require only the original draw call. Source readback occurs on first crop use. Cold misses use an existing ambient variant, or the original sprite until a later frame has budget. Cache ownership follows the Hunt preview lifetime; a changed atlas clears old resources. Play reports expose bytes, variant count and current frame pixel work.

This is whole-sprite unshadowed lighting, not a per-pixel normal map or geometric shadow system. A tall tree can brighten as a single sprite. Quantized intensity may step slightly. Sprites do not yet receive the static lava field. Mobile appearance, cold-cache behaviour and sustained performance still need actual device review.

## Evidence

`evidence/lighting-consumers-gles.json` uses actual old/new fluid fragment shaders on a synthetic plane, not a game capture. Software Mesa GLES at 402×604 passed eight fixtures: neutral RGBA exact, alpha exact under dark/local light, water/foam respond and all lava bytes stay unchanged. Water draw median was 0.675 ms before versus 1.354 ms after with one active light; this is software rendering, not phone GPU timing. The new shader adds gamma conversion and up to two point evaluations, with neutral and lava bypasses.

CPU tests exercise neutral byte identity, alpha preservation including transparent edges, spatial bounds/expiry, crop/tint reuse, memory eviction and per-frame work limits. Full suite/dependency results are recorded in the delivery PR. Check the actual Hunt on iPhone Safari/Android Chrome before closing player/performance gates.
