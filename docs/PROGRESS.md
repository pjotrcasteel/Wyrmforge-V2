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

## 0.0.012 — benchmark greedy versus exposed-face meshing

- [x] Owner validated all four V2 0.0.011 interaction checks: Hunt-style top-down view,
  inspection camera, destruction retained when changing views, and reset restoration.
  This does **not** yet certify an exact camera match to Wyrmforge's shipping view.
- Added an independent V2-only material-aware greedy rectangle mesher, preserving all six
  face normals and only merging contiguous, exposed coplanar unit faces with matching material.
- The benchmark tests exact world-space surface coverage, face winding, material changes,
  cavity/underside faces, signed chunk seams, 16³/32³ pitch and fragmented scenes.
- Added Node CPU comparison across flat/hill/cliff/arch/fragmented fixtures; this is a
  diagnostic runner result, not a claim of GPU or sustained mobile performance.
- The laboratory's **Compare meshes** button reports the same world's triangle count,
  CPU geometry-buffer bytes, and one-off CPU build time for each algorithm. Export
  includes `meshComparison`; it clears automatically on terrain reset/carve.
- **Crucial limitation:** the **live WebGL2 renderer still uses exposed-face meshes**.
  Greedy UV tiling, atlas mapping, partial rebuild latency, GPU upload budgeting,
  and iPhone/Android comparison are not accepted. No algorithm is selected yet.
- No gravity simulation and no modifications to the separate Wyrmforge V1 repository.

**0.0.012 device acceptance:** On an iPhone, open Flat at seed 7, chunk 16³ and
press **Compare meshes**; export benchmark JSON. Repeat for Arch after
**Carve sphere**, and if practical repeat Arch at 32³. Confirm no geometry
changes, renderer still shows WebGL2 and both algorithms report matching unit faces.
Compare triangle, memory and build-time differences rather than assuming greedy wins.
No visual change should occur when the button is pressed.

## 0.0.013 — fixed benchmark-panel geometry and iPhone evidence

- User observed the Hunt-style Hill move slightly on pressing **Compare meshes**.
  Both 0.0.012 iPhone screenshots show the same terrain width, but the longer
  comparison text adds lines below the flexible canvas and shifts its midpoint.
- Reserve fixed, non-shrinking heights for BOTH telemetry panels, with internal
  scrolling if a narrow device needs more room. Changing text alone no longer
  changes the main viewport height. Voxel geometry, camera, meshes and GPU
  buffers are not touched by this UI-only adjustment.
- Tests assert fixed status-panel layout and that a comparison leaves the
  authoritative world snapshots/revision unchanged for both chunk sizes.
- The owner's 0.0.012 iPhone benchmark (Arch, 32³, seed 7, Hunt-style camera)
  shows 3,460 exposed triangles (152,240 bytes, 15 ms CPU) versus 156
  greedy triangles (6,864 bytes, 109 ms CPU); both cover 1,730 unit faces.
  Greedy saves ~95.5% geometry but costs ~7.3x CPU in that one measurement.
  The report also recorded one >100 ms hitch in 1,018 samples. The screenshots
  are from a Hill scene and must not be presented as Arch screenshot evidence.
- **Not accepted:** greedy as the default live renderer. This is a layout
  regression fix only; the next engine task is lowering greedy CPU cost and
  budgeting CPU/GPU work before promotion.

**Player acceptance:** on physical iPhone Safari open 0.0.013, select
Hill / Hunt-style / seed 7 / 32³, and compare before/after pressing
**Compare meshes**. The world must remain at the same scale and screen
position. Press **Carve sphere** then compare again: the hole must remain
identical and Reset must restore it. The live renderer is still exposed-face.

## 0.0.014 — sparse-region greedy meshing optimization

- [x] User verified the **0.0.013 fixed viewport** on iPhone Safari; the comparison message no longer changes terrain framing.
- [x] Replace six full-chunk greedy material scans with one occupied-bounds pass followed by bounded scans of occupied source ranges per face direction.
- [x] Reuse one typed face mask per chunk, and avoid allocating per-voxel coordinate arrays during face-neighbor checks.
- [x] Preserve all six face normals, material boundaries, chunk-local mesh ownership, exact visible face coverage and 16³/32³ signed seam behavior.
- [x] Preserve the proven exposed-face WebGL2 renderer; greedy is still **diagnostic only**, never active in the live draw path.
- [x] Export `meshComparison.greedy.candidateCellsVisited` and `fullChunkCandidateCells` so the candidate-region optimization is directly measurable.
- [x] Add regression tests for single-voxel sparse chunks and damaged/mixed-material seam cases.
- [ ] Physical iPhone Safari CPU measurements of greedy before and after carving in 0.0.014.
- [ ] Android Chrome and sustained repeated-edit measurements.
- [ ] Worker-based background meshing and stale-revision rejection (later milestone).

**Why:** On an iPhone in 0.0.012, CPU greedy builds took roughly 100–139 ms while
exposed-face builds were 14–16 ms. Greedy dramatically reduced triangles, but its
main-thread cost was unacceptable. Reducing candidate scans is a CPU optimization,
not proof of stable phone performance; real-device timings must decide.

**Player validation:** load version 0.0.014, Hill / Hunt-style / 32³ / seed 7.
Press Compare meshes, export benchmark; Carve sphere and repeat Compare meshes,
then export again. The terrain must not change on Compare meshes; only Carve changes
it. Check `candidateCellsVisited`, greedy CPU ms, and unchanged live WebGL2 renderer.
No requirement that any one timing result reaches a fixed performance target.

## 0.0.015 — first bounded background meshing path (diagnostic comparison)

**Device result for 0.0.014:** user supplied two iPhone Safari reports for
Hill / Hunt-style / 32³ / seed 7, deployment SHA `121e482`.
On intact terrain, exposed CPU build took 19 ms, optimized greedy 9 ms
(previous 0.0.012 sample was around 100–139 ms), with 3,600 vs 774
triangles and 158,400 vs 34,056 geometry bytes. Greedy visited 31,104 of
1,572,864 full-chunk face candidate cells (about 98% pruned).
After carving, 378 real voxels were removed, eight chunk boundaries were touched,
and all 8 world chunks had to be rebuilt in 15 ms; p95/p99 frame intervals were
19/26 ms in the second recording. The after-carve report had
`meshComparison: null`, so **post-carve greedy CPU build speed remains unmeasured**.
This is a small sample and must not be treated as a sustained-performance guarantee.

**New foundation in 0.0.015:**
- [x] Add a browser module worker for **CPU mesh comparison only**. Full
  comparisons no longer run synchronously inside the lab's click handler.
- [x] Transfer copies of authoritative snapshots into the worker; the actual
  VoxelWorld and renderer remain on the main thread.
- [x] Cap comparison jobs to **64 chunks / 2 MiB** of snapshot payload.
- [x] Run **at most one comparison worker job**; no queued backlog. A reset,
  scene change or carve terminates the worker and invalidates its result.
- [x] Verify job ID, originating world identity, world revision and reply
  revision before exposing the diagnostic result. Stale results are never
  applied to benchmark UI state.
- [x] Include separate `meshWorker` status, transferred snapshot bytes,
  worker CPU duration and end-to-end response latency in JSON exports.
- [x] Unit tests for transferable snapshots, 16³/32³ equivalence, payload
  caps, malformed jobs and stale revision rejection.
- [ ] **Not yet:** off-main-thread gameplay mesh builds, automatic worker
  fallback for live rendering, GPU upload budgets, progressive per-frame
  GPU disposal, worker pool or fast-forward burst coalescing.
- [ ] **Not yet accepted:** browser Worker runtime behavior and recovery on
  physical iPhone Safari and Android Chrome.

**Player validation for 0.0.015:** open Hill/Hunt-style/32³/seed 7.
Press **Compare meshes**; the result should appear as `CPU meshes (worker)`
without changing the terrain or freezing gestures. Export a report.
Press **Carve sphere**, then **Compare meshes again** and export a second report.
The second export must contain a non-null `meshComparison`,
`meshWorker.status: complete`, `lastCarve.removedVoxels: 378`.
Reset must restore the original terrain. If the worker is unsupported or fails,
the status panel reports that clearly and the live WebGL2 renderer remains usable.

## 0.0.016 — opt-in background meshing for actual terrain edits

**Input evidence (physical iPhone Safari, v0.0.015 SHA 8c1fc13):**

| Metric | Intact Hill | Carved Hill |
| --- | ---: | ---: |
| Exposed CPU mesh comparison | 17 ms | 17 ms |
| Greedy CPU mesh comparison | 9 ms | 10 ms |
| Diagnostic worker end-to-end | 288 ms | 34 ms |
| P95 / P99 frames | 19 / 21 ms | 17 / 25 ms |
| Frames >50 ms | 0 | 0 |

The carve removed 378 voxels, crossing 8/8 chunk borders; actual live
WebGL2 remeshing still took 17 ms synchronously. The 288 ms initial diagnostic
worker call likely includes setup but has not been separately profiled; no
claim of sustained timing or thermal stability is made.

**New opt-in experiment:**

- [x] Add a second V2-only module worker for actual **exposed-face** geometry
  generation (not greedy rendering). Worker receives immutable copied chunk
  snapshots for changed chunks and their six face-neighbors; missing chunks
  are correctly treated as air.
- [x] Limit one job to 64 nonempty snapshots and 2 MiB of transferred payload.
  Work uses a maximum of one worker with no growing backlog.
- [x] Transfer actual typed mesh arrays back to the main thread, including
  geometry for changed chunks and explicit deleted-chunk IDs.
- [x] Reject stale world/revision/job results; terminate old jobs on reset or
  additional edits and coalesce dirty chunks across interrupted edits.
- [x] Keep **Baseline** synchronous meshing as the default and an opt-in
  **Background pilot** selector for live carving tests.
- [x] Fallback to the known synchronous path if worker initialization,
  resource limits or processing fails; renderer/terrain authority remain V2-only.
- [x] Export `terrainMeshingMode`, `terrainWorker`,
  `pendingTerrainChunks`, and worker CPU vs synchronous GPU upload times.
- [x] Unit tests cover unchanged authoritative world, true carve mesh
  equivalence, signed seams, fully removed chunks, transferred output buffers,
  invalid payloads, and stale revision rejection.

**Important incomplete gates:** GPU uploads and disposal still occur
synchronously on main thread; there is no frame-budgeted upload queue,
worker pool, async greedy renderer, real GPU timing or full disaster recovery.
The initial background worker may cause delayed visible terrain updates even
though voxel truth changes immediately. Gameplay should not use this
experimental mode until measured and approved.

**0.0.016 physical-device validation:** open Hill / Hunt-style / seed 7 / 32³;
select **Carve meshing: Background pilot**, then Carve sphere. The crater
should appear after a brief worker completion, and status must say
"Background meshing complete" (or explicitly report synchronous fallback).
Export JSON: expect `terrainWorker.status = "complete"`,
`lastMeshUpdate.mode = "worker-localized"` and removedVoxels 378.
Reset must restore the hill. Run again with **Baseline** and compare frames
and visible correctness; send both reports. Also try Carve twice quickly,
then Reset, checking old geometry never reappears.

## 0.0.017 — worker prewarming and reuse (opt-in, not default)

**0.0.016 real iPhone Safari evidence, user supplied two JSON exports:**

| Metric | Baseline | Background pilot |
| --- | ---: | ---: |
| Synchronous CPU mesh + upload operation | 18 ms | n/a |
| Worker CPU mesh generation | n/a | 18 ms |
| Worker GPU upload operation | n/a | 1 ms |
| Worker request end-to-end | n/a | 258 ms |
| Frame p95 / p99 | 18 / 41 ms (273 frames) | 19 / 24 ms (1,581 frames) |
| Frames over 50 ms | 0 | 0 |

Both builds removed 378 voxels from Hill, 32³, seed 7, touched 8/8 chunks,
rendered 3,868 triangles, and reported no GPU context loss or renderer error.
The baseline update time is **not** an end-to-end button-to-image time. The
different frame sampling windows prevent a controlled claim that one renders
smoother. The worker's 258 ms latency includes startup/dispatch/snapshot work;
the 239 ms outside CPU meshing and GPU upload is unexplained until segmented
measurements are collected.

**New small experiment:**

- [x] Maintain a single V2 module worker across successful carve jobs instead of
  terminating it after every response.
- [x] When selecting Background pilot, create the worker and wait for a small
  `warmup` / `warm` handshake. Selecting Baseline disposes the worker.
- [x] One active job maximum, no backlog; cancel/terminate a busy worker on
  a newer edit or scene reset, then prewarm its replacement.
- [x] Preserve V2 world identity, job ID, revision, and dirty-chunk checks;
  stale work may never update WebGL2.
- [x] Keep Baseline as the default and fall back to it on worker faults.
- [x] Report `terrainWorkerWarmupMs` and per-carve
  `wasWarmAtSubmission`, `snapshotPrepareMs`, `waitForReadyMs`,
  `workerRoundTripMs`, `workerCpuMs`, `gpuUploadMs`, and
  `endToEndMs` in exported JSON.
- [x] Unit-test warm reuse, cold submission, sequential jobs, cancellation,
  stale responses and simulated worker errors.
- [ ] Verify **actual cold vs warm latency** on physical iPhone Safari.
- [ ] Verify Android Chrome and sustained repeated-edit behavior.
- [ ] Frame-budgeted GPU uploads remain a future separate step; 1 ms in
  this particular sample is not evidence that they are always cheap.

**0.0.017 mobile test:** Hill / Hunt-style / seed 7 / 32³.
Select Background pilot and wait for `Background terrain worker ready`.
Press Carve sphere and export JSON after completion. Check
`wasWarmAtSubmission: true` and recorded warmup/round-trip times.
Reset (the worker stays hot if idle), press Carve sphere again, export a second
JSON. Confirm crater and triangle counts match and that the second warm edit
doesn't require another worker startup. Also try rapid carve then Reset:
the intact hill must remain visible; no stale geometry may reappear.
This gate concerns user-perceived latency, not total FPS or final 2.5D art.

### Research and limitations

The 75-document [research ledger](RESEARCH.md) and [architecture decisions](ARCHITECTURE-DECISIONS.md)
guide all decisions. Its evidence is not a measured guarantee of mobile performance.
V2 0.0.007 has an initial WebGL2 solid-face preview with a Canvas2D fallback. It is **not** the finished
pixel-art terrain renderer: material atlas, greedy meshing, sustained mobile testing and context-loss device acceptance remain open.
Chunk size 16 is experimental, not a final optimized choice.

### Current change: 0.0.017

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
