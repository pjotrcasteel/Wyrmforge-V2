# L10-08 — fluid receiver lighting parity (Water V2 visual renderer)

Implementation branch: `lighting-v2/L10-08-fluid-receiver-parity-20261118`. Tracking issue: [#377](https://github.com/pjotrcasteel/Wyrmforge-V2/issues/377).

## Player-facing change

The actual Play Hunt publishes **one** epoch/revision-qualified Lighting field per frame to terrain, trees/actors/props and now the raised fluid surface renderer. Water caps, sidewalls, falling sheets, flying parcels, shoreline glints and foam receive the same geometry-occluded static emitter response. A WorldGen change, light colour change or terrain edit requires no fluid-specific simulation event or case switch.

Lava remains primarily self-emissive (its existing authored Material palette) rather than becoming a dim, multiply-lit water surface. Its darker detail receives a restrained 18% ambient response and 12% transient spell response, **without adding its own static radiance back into itself**. In neutral lighting the old palette remains byte-identical.

## Ownership, parity and bounded cost

- Lighting owns `static-field-shader.mjs`, the same 24×24 RGBA32F emission lookup/interpolation used by terrain. The pure CPU twin `static-field-sample.mjs` continues to serve generic Canvas sprites. Material labels and Water engine details do not enter Lighting.
- Rendering's `HuntFluidSurfaceRenderer` samples the shader **in the vertex stage** from physical published mesh positions, and interpolates the result on the drawn polygons. There are no new fragment-stage field lookups, camera-depth reads, Water mutations or Voxel rays.
- The independent fluid renderer maintains one fixed **9,216-byte** WebGL texture, reuploading only when the immutable published Lighting snapshot identity changes; this is in addition to the terrain renderer's existing texture. Cleanup occurs on reset/dispose and a context restoration rebuilds it. No unbounded shader/texture variants.
- The host passes exactly the current completed field to both renderers. The fluid renderer independently validates format, finite values, dimensions, bounded emission colour and integer origin. Null, empty or disabled fields do not add static spill; fluid simulation and persistence remain Water-owned.
- The sampled field has the existing 24m footprint and two receiver elevation bands. Interpolation across large falling polygons is intentionally smooth; verify it does not produce edge smearing, ghosted shores or excessive tint with actual mobile captures.

## Controls, evidence and remaining gates

Primary player page: https://pjotrcasteel.github.io/Wyrmforge-V2/play-hunt.html .

Same-build diagnostics: `?fluidEmission=off` disables only static spill on fluid receivers; `?spriteEmission=off` isolates Canvas static spill; `?lighting=off` disables the complete Lighting path. The exported Hunt report includes `lighting.fluidEmission` with active/valid status, upload count and GPU bytes. Fluid renderer stats also expose per-upload CPU milliseconds, not GPU time.

Automated coverage: `tests/lighting-fluid-receiver.test.mjs` verifies same shared GLSL function, geometry/occlusion/height/emission input, no per-fragment lookup, fluid lifecycle and real host wiring; existing terrain, Water, shader and Play Hunt browser tests remain required.

**Do not claim accepted yet:** Play Hunt matched Water/lava, forest/mountain/Scorched Approach captures; visible foam vs surroundings; cold->warm transitions; shaded cliff/riverbank; moving casts; depth/alpha; 10-minute iPhone Safari/Android Chrome with p50/p95/p99 CPU/frame/memory, GPU when available. Device acceptance is separate from GitHub CI, the desktop software witness and deployment. L10-09 atmosphere must wait until this scoped L10-08 review.


## L10-08 follow-up — real Hunt streaming and Fireball parity (2026-11-19)

The actual mixed-scene Chrome witness demonstrated two defects the initial shader-only tests could not establish:

1. The independent fluid shader used the same transient visibility GLSL but never received the completed `uPointVisibilityEnabled` / 48 sector-distance uniforms. Water/foam could receive Fireball light through a physically blocking Voxel bank. The fluid renderer now calls the existing Lighting-owned `writePointVisibility` on **the identical completed field** passed to terrain, with no new rays and only a fixed 192-byte CPU staging buffer. Incomplete/stale/expired point fields follow the terrain's existing unshadowed fallback; destruction/rebuild is handled by the revisioned field.
2. With 192+ nearby lava source cells, the static 24×24 field was still unpublished after 45 seconds: diagnostic `pendingStage=height`, `pendingIndex=456/576`, `resets=2`, `pendingSourceCount=192`. This was **work starvation** under frequent residency transitions, not invalidation churn. The Hunt now allows Lighting to progress on committed public Voxel geometry during streaming or a pending visual mesh, using only **6 cells/frame** in that state and the original maximum **24 cells/frame** when settled. Pending Voxel edits still block it, and the epoch/revision gate prevents stale fields from being drawn. The bounded work contract is checked by unit tests.

The opt-in actual Play Hunt witness at `.github/witness/lighting-mixed-scene-hunt.mjs` captures Wet Forest Water, Mountain Pass Water and Scorched Approach Lava in 402×874 software Chromium. It deliberately requires a completed lava field (not merely positive emissive-source counts), and attaches PNG/JSON evidence. It is a desktop software visual review **only**, not physical-device, sustained frame/GPU, water solver, or player acceptance.

Do not close L10-08 #377 until this witness passes after the starvation fix and the owner reviews actual game appearance; keep the separate desktop long-run freeze and iPhone/Android 10-minute performance gates open. The Water engine's flow, save, mesh ownership and Voxel authority are not changed here.
