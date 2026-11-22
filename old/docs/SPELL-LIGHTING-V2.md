# L10-03 — Fireball light and darker gameplay ambient

Owner requested visible light from shooting magic and a much darker game. This pass connects actual Fireball flight/impact presentation state to generic transient lights, and reduces gameplay ambient through the existing Lighting environment contract.

## Inputs and ownership

`hunt-fireball-flight.mjs` provides one world-space trajectory used by both projectile painting and light intent. Both use the same frame presentation time. `hunt-spell-lighting.mjs` is a Hunt composition adapter: it samples the existing cast and accepted impact state into immutable `wyrmforge.light-set.v1` descriptors with current epoch/revision. Lighting does not import spell rules, terrain or fluids. The VFX impact descriptor now retains its already-supplied canonical level; particle artwork, destruction and spell gameplay are unchanged.

Flight light follows the exact arc, with radius 3.5–5.3m and level-scaled warm radiance. Impact light is raised 0.4m above the hit, has radius 5–7.6m, and fades over the actual 417–489ms impact presentation (shorter in reduced-motion mode). Impact and new flight may coexist; at most two transient lights are uploaded. Reduced-motion presentation lowers intensity and adds no oscillating pulse. Expired state produces no emitter. Reset/load clears the owning cast/impact state, and foreign-world casts are excluded by the host.

Rendering owns two reusable uniform buffers: eight position/radius floats plus six radiance floats, 56 CPU bytes total. `writeTransientLights` validates schema, identity, count, position/radiance bounds and radius; it clears buffers when empty. The shader's fixed maximum is two lights and zero is sent every frame after expiry. No texture or light GPU buffer object is allocated. There is no new terrain query, source search, mesh update or fluid mutation.

Transient irradiance is added independently on every local-light shader return path, including a missing or invalidated static field. Thus crater edits cannot suppress the impact flash while static terrain lighting rebuilds. Source emission is not written into terrain materials or saves. Normal-weighted radial falloff is evaluated at real terrain fragment positions. This first pass is unshadowed; it does not promise light occlusion through thin walls or full directional shadows.

## Ambient calibration

The optional exposure field in `wyrmforge.lighting-environment.v1` defaults to 1 for backwards-compatible neutral tools. Gameplay explicitly selects .42. Daylight 1 gameplay ambient is now `[.42,.42,.42]`; Wyrm Lair daylight .45 is `[.30912,.33222,.36456]`. This is 42% of previous **linear ambient irradiance**, not 42% display brightness. Lava reflection and spell radiance retain independent strength. Surface emission is retained through the ambient operation. Baseline comparison `lighting=off` still uses the independent old baseline shader.

## Evidence and limits

Tests cover exact shared trajectory, flight/impact lifetimes, level scaling, reduced-motion intensity, bounded/cleared upload buffers, renderer count reset and exposure validation. Prior hit/destruction/VFX tests remain unchanged in behavior.

Actual assembled GLES3 shader programs compile/link/render. A dark terrain-material plane compares zero versus two transient lights with the static field disabled. Four fixtures show localized illumination, with **zero changed pixels outside the declared world-space radii**. This verifies the crater/static-field fallback path, not full scene/player occlusion. The llvmpipe 402×604 witness uses seven alternating batches of 12 synchronized draws. Stone top median was 0.829→0.845ms; side 0.775→0.808ms; grass 1.450→1.555ms; bedrock 1.232→1.332ms. These are software-renderer measurements, not mobile GPU acceptance. Raw batches and localization metrics are in `evidence/l10-03-two-transient-lights-gles.json`.

This pass relights terrain. Canvas sprite actors/trees/props and the separate raised-fluid renderer do not yet consume these transient lights or gameplay ambient. Those need a separate shared consumer integration; no dark screen overlay or CSS filter is used to conceal this limitation. Existing `performance.localLightingCpu` measures static-field update CPU, while overall frame CPU includes spell sampling/uploads. Reports now include active transient emitter descriptors as well as the environment. Earlier phone lag and complete lighting acceptance remain open.

## Review

Shoot nearby terrain in `play-hunt.html?route=highland&stop=0`. The Fireball should carry warm light across the dark ground and briefly light the impact/crater. Try different Fireball levels, then wait for the impact to expire; no source should remain. Also review `play-hunt.html?route=highland&stop=9&lightingTest=bank` for the darker lair with lava spill. Full directional shadows and cross-renderer relighting remain later work.
