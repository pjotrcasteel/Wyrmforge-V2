# Voxel Engine V2 — implementation status

## V2.0 — Independent foundation (IN PROGRESS)

- [x] Separate V2 repository; V1 remains untouched
- [x] Independent sparse 3D store, signed chunk coordinates and snapshot copies
- [x] Independent chunk revisions and occupied-cell accounting (PR #1)
- [x] Visible build version and deployed commit stamping (PR #2)
- [x] Basic deterministic flat/hill/cliff/arch scene picker and reset
- [x] Canvas2D diagnostic shell and JSON export (not a final renderer)
- [x] Frame interval p50/p95/p99 and >33/>50/>100ms counts (PR #3; merged)
- [ ] Recorded measured desktop browser result for exact live commit
- [ ] Measured iPhone Safari and Android Chrome runs
- [ ] Verified production route preservation and V2 site after deploy
- [x] Numeric scene seed control and exported reproducibility metadata (PR #4; merged, CI passed)
- [ ] Deterministic multi-edit stress scenarios
- [x] Mobile pointer pan/pinch with cancel/blur/visibility cleanup (PR #5; code merged; physical-device acceptance pending)
- [ ] CPU, worker and GPU-memory estimates with correctly marked unavailable values
- [ ] Strong dependency audit including static asset provenance
- [ ] Define and record V2.0 acceptance thresholds

## Current engine-focused step: V2.1 candidate-size comparison (0.0.005)

- V2 now supports **independent** 16³ and 32³ chunk configurations, each with correct signed coordinate handling.
- Same scene and seed produce the same committed voxel materials at either chunk pitch.
- Diagnostic UI can switch chunk pitch, export it, and report **payload bytes only**, explicitly excluding JavaScript Map overhead and GPU/worker memory.
- `node scripts/benchmark-chunks.mjs` compares generation, sampling, and edit cost across both sizes and four scenes.
- No chunk size has been selected as universally faster. Physical-device measurements remain required.
- No renderer or input polish in this change; V2.0 acceptance is still pending.

**Player validation for this increment:** load 0.0.005, select Hill with seed 7, switch between 16³ and 32³.
The hill should retain exactly the same shape and carve/reset functionality; status and export show chunk size.
Do not judge final 2.5D pixel art from this Canvas2D diagnostic view.

## Engine step: exposed-face CPU geometry (0.0.006)

- [x] Newly authored six-direction CPU mesher from copied voxel snapshots (top, bottom and four sides)
- [x] Omit interior faces including faces shared across positive and negative chunk boundaries
- [x] Chunk-local vertex positions with explicit origin, outward normals, per-vertex materials and triangle indices
- [x] Return chunk and six-neighbor revisions for later worker result validation
- [x] Explicit per-chunk face budget to bound output arrays
- [x] Automated tests for winding, cavities, arch undersides, deterministic output and chunk seams
- [x] On-demand "Audit 3D faces" counts with JSON export; no automatic heavy per-frame mesh generation
- [x] Initial WebGL2 solid-color exposed-face rendering with fixed oblique camera (0.0.007, device acceptance pending)
- [ ] Greedy versus exposed-face performance comparison on target mobile devices (V2.2)
- [x] One real iPhone Safari 32³ Arch audit received for commit 14dd128 (0.0.006): 1,902 faces, 3,804 triangles, 621 undersides, 19 ms CPU mesh audit, 167,376 CPU bytes
- [ ] Equivalent iPhone Safari 16³ and Android Chrome observations

**Acceptance caveat:** The Canvas2D screen remains the deliberately disposable top-only diagnostic.
A successful face audit proves geometry was generated, **not** that the finished scene was rendered.
V2.0 and V2.1 are not yet fully accepted.

**Manual check (0.0.006):** open Hill with seed 7, click Audit 3D faces and verify that
the count is positive. Switch 16³ ↔ 32³ and audit again; total visible face/triangle counts
must stay identical for unchanged terrain. In Arch, underside (-Y) count must be positive.
After Carve sphere, audit again; counts should update. Export benchmark JSON and verify
`meshAudit`, `faceCounts` and `cpuBufferBytes`.

## WebGL2 solid terrain milestone (0.0.007)

**Scope:** connect newly authored V2 CPU meshes to an independent WebGL2 renderer. No V1 code/assets.

- WebGL2 uses the exact orthographic/oblique camera from the diagnostic view, retaining 2.5D composition.
- Render six-sided solid-colored blocks, using depth testing and three V2-native material colors.
- Rebuild meshes only after terrain or scene changes, **not** on each camera movement.
- Upload chunk-local vertices, normals, materials and indices; explicitly delete previous GPU buffers and vertex arrays.
- Initial browser context-loss handling recreates shader resources and re-uploads authoritative-derived mesh data.
- Overlay preserves Canvas2D fallback and existing touch control surface; if WebGL2 is unavailable, the old diagnostic remains usable.
- Export GPU buffer **estimates**, draw calls, triangle counts and one-off CPU mesh/upload time. GPU timing is unknown (`null`), not fabricated.
- The 2.5D pixel-art goal remains mandatory, but material textures/atlas, greedy mesher, shadows and performance tuning are later steps.

**Validation required:** the deployed header must say v0.0.007 and commit SHA.
On iPhone Safari, open Hill, Cliff and Arch. The Hill must show *solid sloping sides*,
the Cliff a visible wall, and Arch real underneath space (not only green diamonds).
Use Carve sphere, then confirm removed voxels do not reappear when moving the view.
Check 16³ and 32³; both must show identical world geometry.
Export benchmark JSON with `renderer` and `cpuMeshAndUploadMs`.
If `Canvas2D fallback` is shown, report it; do not count it as passing WebGL2.
Physical-device acceptance is still open.

## V2 0.0.008 — visible overhang / arch fixture

**Reason:** Physical iPhone screenshots of deployed `v0.0.007 · d203a3c` show a working
WebGL2 2.5D solid Hill and Cliff, layered Flat, and carved crater. The original Arch looked
like Flat because the passage was a closed subterranean void and could not be visually inspected.
The screenshots are visual evidence, not sustained mobile performance acceptance.

**Scope:** replace only the V2 Arch fixture with a freestanding stone span on solid terrain.
The aperture is open through the visible front and rear; the top is supported by stepped pillars.
Tests verify the stone roof, exposed underside, clear passage, and deterministic 16³/32³ occupancy.
The scene schema is now `v2.scene.v2` to distinguish benchmark evidence from the old Arch fixture.
The WebGL2 renderer, mobile input, and V1 remain unchanged.

**Player validation:** open Arch at version 0.0.008. Verify visible stone supports and an open
gap beneath the stone roof, including when panning. At 16³ and 32³ it should look the same.
Carve sphere and Reset must work; send one Arch screenshot and optionally a benchmark report.
No visual bug fix is considered accepted until checked on physical iPhone Safari.

## V2 0.0.009 — Arch demo destruction correction

**Observed on physical iPhone Safari (0.0.008):** A freestanding Arch visibly renders in
WebGL2, with 3,612 triangles and 8 draw calls on a 32³ world. The user reported
that **Carve sphere did not affect the Arch**. The benchmark showed p95 17 ms and
p99 33 ms over 590 samples, 4 hitches over 33 ms, no hitches over 50 ms,
0 context losses; this is a short diagnostic sample, not sustained acceptance.

**Root cause:** The lab's fixed sphere was centered at (0,3,0), in empty air
under the new freestanding Arch; the pillars occupy x=±5, z=1..3 and the roof y=8.
A mesh rebuild could not display a change where no stone was removed.

**Small fix:** move the Arch-only demo sphere to (5,5,2) radius 3.5, which cuts
the visible right stone pillar and nearby roof. Other scenes keep their previous
impact area. The handler now reports the number of committed removed voxels,
skips redundant remesh/upload when it removes nothing, and exports `lastCarve`.
A separate, bounded lab-only module and regression tests cover 16³/32³ geometry
and prevent the empty-target regression.

**Scope limitation:** this is still a lab fixture, **not** the full V2.3
authoritative ordered/edit-ID destruction command system. No V1 reuse; no change
to camera, touch, WebGL2 shaders or material styling.

**Player check:** load 0.0.009, select Arch, 32³, seed 7, press Carve sphere.
A visible section of the right pillar/roof must disappear, and the message
must show a positive removed-voxel count. Reset must restore the intact arch.
Repeat at 16³ and optionally export the JSON.

## 0.0.010 — local mesh invalidation and optional hybrid-gravity specification

- Approved gravity *design* documented in [VOXEL-GRAVITY-V2.md](VOXEL-GRAVITY-V2.md). No falling voxel simulation is implemented; its later acceptance is separate from the V2 foundation gate.
- A changed voxel marks its own chunk and only face-adjacent chunks when it lies on a signed chunk boundary.
- New `VoxelWorld.chunkSnapshot` copies a **single** chunk; a scoped exposed-face build loads only its requested chunks and six neighbors, not every world snapshot.
- Carve sphere collects the committed changed-cell footprint, then updates only those meshes and corresponding WebGL2 GPU buffers.
- Removed chunks delete their old GPU resources; unaffected chunks keep their existing CPU/GPU geometry.
- WebGL2 context recovery restores retained chunk meshes without a redundant second full upload.
- The lab shows `Remeshed N/M chunks`, exports `lastCarve.dirtyChunks` and `lastMeshUpdate`, and keeps V1 and input controls untouched.
- Tests compare every affected scoped chunk to a full rebuild, cover negative/positive chunk seams, empty chunk removal, GPU disposal and simulated context restoration.
- **Not implemented:** threaded/budgeted meshing, worker cancellation, GPU upload budgeting, greedy meshing or gravity. These are later gates.
- **Player acceptance:** on physical iPhone Safari load version 0.0.010, select Arch / seed 7 / chunk 32³, Carve sphere. Verify a visible piece of the stone pillar disappears; the status shows a **positive** removal count and a **localized remesh count smaller than the total chunks**. Reset restores the arch. Repeat once at 16³ and send one JSON export.
- The iPhone 0.0.008 report is evidence only for that old build (p95 17 ms, p99 33 ms, 4 >33ms hitches of 590 frames). It does not prove that 0.0.010 performance is better; compare device reports before concluding.

## 0.0.011 — Hunt-style camera candidate, independent of voxel data

**Owner intent:** The shipping Wyrmforge Hunt is a steeper, north-up, mostly overhead
2.5D pixel-art game. The old V2 inspection-only camera is an isometric diagonal view;
it is useful for inspecting cliffs but is not the required gameplay framing.

**Implementation:** Add two clean-room camera presets with shared orthographic camera
basis and consistent CPU fallback / WebGL2 projections. The lab defaults to
**Hunt-style (candidate)**, with **Voxel inspection** selectable at any time.

- Hunt-style aligns world X horizontally and Z vertically, with a steeper view of the
  ground and an elevation contribution for cliffs/overhangs; this is an **initial
  independent approximation** based on the user-provided Hunt screenshot,
  **not a validated match** to the production game's exact view.
- Inspection retains the prior V2 diamond/oblique projection so geometry can still
  be inspected clearly.
- Switching presets changes only camera uniforms and the Canvas2D fallback;
  it never edits the world, remeshes chunks or allocates new GPU buffers.
- Tests check screen axes, occlusion ordering, snapshot integrity, and no re-upload
  when switching cameras; automated CI alone does not validate visual matching.
- Preset name is exported with each benchmark JSON for meaningful comparisons.
- The real 2.5D **pixel-art material atlas, shadowing, game integration and final
  game camera fit are not yet implemented or accepted**. Wyrmforge V1 untouched.

**Player validation for 0.0.011 (iPhone Safari):** confirm header shows this version
and commit, choose Arch/seed 7/32³, switch between Hunt-style and Voxel inspection.
The former should be visibly more top-down and north-up, the latter a diamond
isometric diagnostic. The arch and all carved voxels must remain **identical** after
switching. Carve sphere must work in either preset, and switching back must not
reset the destruction. Send **two screenshots** (same Arch before carving, one per
preset) and a short judgment on which Hunt view elements need refinement.

### Research and limitations

The 75-document [research ledger](RESEARCH.md) and [architecture decisions](ARCHITECTURE-DECISIONS.md)
guide all decisions. Its evidence is not a measured guarantee of mobile performance.
V2 0.0.007 has an initial WebGL2 solid-face preview with a Canvas2D fallback. It is **not** the finished
pixel-art terrain renderer: material atlas, greedy meshing, sustained mobile testing and context-loss device acceptance remain open.
Chunk size 16 is experimental, not a final optimized choice.

### Current change: 0.0.011

- Frame intervals are measured with `requestAnimationFrame`, not GPU timers.
- Hidden-tab gaps and invalid samples are excluded; a rolling 1800-sample window is bounded.
- The status line shows p95/p99 plus >50 ms hitch count; JSON contains all percentile and hitch counters.
- Unknown frame percentiles are reported as `null`, never a made-up zero.
- The rolling window resets when the user chooses or resets a scene.
- No claims about mobile performance or V2.0 acceptance are made until device evidence exists.

- A reproducible unsigned 32-bit scene seed is shown in the UI and included with benchmark exports.
- Seed changes regenerate the hill's voxel geometry deterministically; flat, cliff and arch remain fixed baseline fixtures.
- Reports include the scene generator schema, CSS viewport, and canvas render scale.
- No claim is made that this is a complete seeded world generator, or that V2.0 is accepted.

- Two-pointer state machine: one finger pans; two fingers pan and pinch-zoom with anchored midpoint.
- Pointer cancellation, lost capture, tab hiding, and window blur clear active gestures.
- Desktop mouse drag and wheel zoom use the same camera, with zoom limits 0.55×–2.5×.
- Pure Node interaction tests do not replace iPhone Safari and Android Chrome acceptance.
- View remains fixed orthographic/oblique 2.5D; no new rotation or 3D renderer in this PR.

**Next small step:** verify site deployment/build identity on the actual live route, then tackle
remaining V2.0 instrumentation and interaction gates. Do not skip ahead to V2.2.
