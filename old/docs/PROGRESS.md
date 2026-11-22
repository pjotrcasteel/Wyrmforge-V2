# Voxel Engine V2 — implementation status

**Play Hunt integration H08-01 (2026-11-13):** PR #143 merged as commit \`a1960ce\` and GitHub Pages deployed. The separate [Play Hunt route](https://pjotrcasteel.github.io/Wyrmforge-V2/play-hunt.html?v=a1960ce) uses a physical-size Wizard proxy controlled by touch joystick/WASD with the existing Voxel V2 grounded collider, follow camera and live local frame p50/p95/p99/hitch/voxel-memory/worker-queue diagnostics. Automated tests and CI pass; real-device input, visual and performance acceptance **pending**, and only one 32m region is loadable at once. Task status and next gates live in [Delivery Tasks](DELIVERY-TASKS.md).\n\n
**Current cross-chat task tracker:** [Delivery Tasks](DELIVERY-TASKS.md). The next integrated task is **H08-01 (Play Hunt movement)**. A source module, green test or lab screenshot never substitutes for hands-on game acceptance; record actual frame/queue/device measurements when available. Last verified merged multi-region baseline: PR #141, commit `27b1c02`.

## V2.6 — Distinct runtime epochs across external world load and restore (2026-11-12)

**Integration correctness:** V2 terrain change notifications already carried an `epoch`, but every `V2ExternalTerrainLoader` created its `V2TerrainPort` using the default `epoch=1`. Repeated loads and verified checkpoint restores therefore reused the same epoch, even if they had identical voxel revisions and edit sequence numbers. A future Physics V2, Lighting V2 or VFX V2 subscriber needs a reliable distinction between separate world activations.

**Implementation:** New host-owned `V2TerrainEpochClock` hands out strictly increasing positive safe-integer values and fails on exhaustion. `V2ExternalTerrainLoader(definition,{epoch})` passes the host-supplied value into the existing terrain port. `V2ExternalTerrainReplaySession(checkpoint,{epoch})` supplies a *fresh runtime epoch* for the restored authority. The standalone external-site browser host uses one clock for resets and restores; its UI shows the active epoch for diagnosis. V2 engines continue receiving the existing versioned, ordered `voxel-v2.terrain-change.v1` contract, with no breaking schema change or second terrain store.

**Persistence boundary:** Epochs identify world instances only within a live host. The generated source, checksum, deterministic geometry and saved edit journal **do not persist the runtime epoch**, so save/replay parity remains deterministic. Existing callers without explicit epochs retain the compatible default; integration hosts swapping worlds must allocate new values. Old ports are disposed on unload and cannot serve stale queries.

**Tests:** both 16³ and 32³ paths prove that equal-revision, identical-seed worlds can emit the same edit sequence with different epochs, identical portable checkpoints, and a fresh epoch after verified replay. Exhaustion and invalid epoch arguments fail closed; source checks ensure that the actual browser host increments epochs on reset and restore.

**Scope:** This closes one V2.6 event-lifecycle contract gap needed for the separate Physics/Lighting/VFX V2 integration. It does not change visuals, textures, mobile GPU scheduling, or the V2.8 generation milestone. Full foundation release still follows the existing roadmap's separate acceptance criteria.


## V2.7 — Bounded worker path for external-world destruction edits (2026-11-12)

**Closed remaining main-thread remesh gap:** The external-world proof already performed initial and restored *full-scene* meshing using the bounded worker bridge, but its "Break stone span" action still synchronously called `buildExposedFaceMeshes(..., {chunkIds:dirty})` on the browser main thread. This is a risk for future V2.8 forest-sized terrain changes.

**Implementation:** `V2ExternalTerrainMeshBridge.replace(world, dirtyIds)` now reuses the same worker generation, bounded four-chunk batches, authoritative world identity and revision checks, and one-job-at-a-time scheduling used for full loads. Unlike full scene generation, localized requests include an explicit canonical list of **changed chunk IDs**, including chunks deleted to air; the completed response retains these IDs even if the worker returns no mesh. WebGL2 therefore removes stale buffers for emptied chunks while only uploading replacement geometry for affected chunks. The existing V2 terrain port commits edits immediately, so collision and raycasts never wait for GPU remeshing. The interactive proof blocks overlapping edits, save and restore during pending worker/GPU work; reset cancels old worker jobs, and failures disable further editing instead of continuing with mismatched visuals. The small no-Worker fallback remains restricted to the original eight-chunk diagnostic fixture; larger sites fail closed.

**Automated checks:** 16³/32³ worker results match the baseline localized mesher; deleted-chunk outputs preserve dirty IDs; equal-revision alternate-world responses are discarded; post-dispatch edits invalidate replies; malformed, unsafe and noncanonical chunk IDs are rejected before scheduling. Browser source tests verify the real worker invocation, in-flight UI guards, reset cancellation and WebGL2 localized queue handoff.

**What this does not claim:** this is a V2.4/V2.7 integration correctness and scheduling subgate, not final V2.7 mobile acceptance, a production world stream, a new world generator, final materials or finished Wyrmforge Hunt integration. Final on-device behavior for the new edit path still requires short functional verification when convenient; no new prolonged run is needed for this change.


## V2.7 — Bounded worker meshing of externally initialized and restored sites (2026-11-12)

**Gap closed:** The V2.6 external-site proof and V2.7 portable checkpoint used bounded terrain-cell loading but still synchronously called `buildExposedFaceMeshes(world)` for every chunk when activating a new scene or a restored checkpoint. The complete world mesh could hitch the browser main thread on the larger generated sites required later for V2.8.

**Implementation:** `V2ExternalTerrainMeshBridge` reuses the existing independent V2 `TerrainWorkerSession` and `terrain-mesh-job.v1` protocol, with **one in-flight worker job** and batches of at most **four requested chunks**. Including six immediate neighbors, the snapshot batch remains under the existing 64-chunk/2 MiB worker caps for either 16³ or 32³ pitch. The scheduler first obtains stable chunk IDs using `VoxelWorld.chunkIds()`, copying no full-world voxel payload; each worker job snapshots only the requested batch and its existing immediate neighbors. Each reply validates the active job and authoritative world revision before joining the staged mesh set. **Only the final complete, revision-consistent geometry is published.** Scene replacement or cancellation invalidates the previous worker generation, and errors discard partial output rather than displaying stale fragments.

**Live V2 proof:** `external-terrain-lab.html` uses worker-backed full-scene meshing both after external source initialization and after a verified save/replay. The previously visible scene remains present until the replacement's replay **and** worker meshing finish; WebGL2 GPU scene uploads and retired-buffer disposal still use their existing per-frame queues. A clearly labeled small-site fallback retains synchronous meshing only when the browser exposes no Worker and the fixture uses at most eight occupied chunks; large future sites must use the worker path. Small localized carving still uses its separate bounded incremental mesh path.

**Verification:** Node tests simulate warmup, sequential chunk batches, exact exposed-face output, equal-revision but different-world resets, old-worker message delivery after cancellation, edits during a build, worker runtime failure and retry, and terminal cleanup. Browser-route source tests assert the new worker path and prohibit an unconditional main-thread full-scene rebuild.

**Limits:** A four-chunk input batch bounds requested chunk/snapshot payload, **not wall-clock worker CPU time** or GPU execution time. Final mesh publication aggregates CPU-side typed arrays before the GPU upload queue drains; high-scale streaming/LOD and per-chunk renderer presentation remain future work. This is a **V2.4/V2.7 foundation implementation subgate**, not complete mobile acceptance or the start of V2.8 world generation. Android Chrome sustained runs and the older Android Firefox ~24 FPS issue remain open; no additional long phone test is requested.


## V2.7 — Physical iPhone external checkpoint restore confirmed (2026-11-12)

**Owner-observed functional check:** On the deployed build `a7f3f4f8bada0f8221a46fce350a0be913510997`, the user confirmed that the browser demonstration's **break → save → reload original site → restore destroyed site** flow works as expected. This closes the *manual visual proof of the external-terrain portable replay subfeature*, not the whole V2.7 foundation release. The result includes no recorded performance metrics, so no timing or memory claim is inferred.

**Further automated coverage:** A V2.7 regression tests the actual external loader and staged checkpoint restore alongside a delayed, canceled mesh-worker result. It ensures an obsolete worker response from the pre-restore terrain cannot overwrite the restored world; a newly committed edit also invalidates a previously valid worker mesh response. Both 16³ and 32³ chunk pitches are included, and the authoritative voxel checksum is compared after restoration.

**Remaining original gate:** Android Chrome ten-minute acceptance and older Android Firefox sustained ~24 FPS performance remain open, as do any other incomplete original V2.0–V2.7 release measurements. The user requested no further ten-minute phone tests for now; therefore continue automated foundation verification without claiming the overall foundation released or starting V2.8 generation prematurely.


## V2.7 — External V2 terrain checkpoint and staged verified replay (2026-11-12)

**Why:** The V2.6 external-terrain handoff supported load, mutation and unload, but the earlier replay-checkpoint format could only regenerate the four built-in lab scenes. A future World Generation V2 forest must persist the **original 3D definition, generator identity, seed, ordered terrain commands and accumulated material damage** rather than silently regenerating a fresh landscape.

**Implemented:** `voxel-v2.external-terrain-checkpoint.v1` captures the loader's canonical independent V2 source runs and one authoritative edit journal. Its non-cryptographic fingerprints cover the source, journal, final voxel world and accumulated damage. The portable bound is 1 MiB and 128 recorded edit commands; this is for *accidental corruption detection, not cryptographic authentication*. A new `V2ExternalTerrainReplaySession` preflights the input before allocating, reinitializes at most 4096 source cells and replays at most 8 edit commands per step, and **does not expose its world until all source, journal, final geometry, and partial-damage checks pass**. On mismatch, it unloads its temporary world without changing the live authority. Replay emits no fake live events; only subsequent edits use the ordinary V2 port notifications. A verified replay can be saved again, including later edits.

**Visible demonstration:** The separate V2.6 external-site page now offers `Save terrain state` and `Restore saved state` alongside `Reload external site`. A fresh site remains visible while a saved JSON checkpoint is rebuilt and verified in bounded steps; then the real WebGL renderer switches to the restored authoritative geometry. No V1 terrain, duplicate collision state, or final art is involved.

**Acceptance and limits:** Automated tests verify byte-for-byte JSON roundtrip at 16³/32³, intact edited geometry and partial damage, identical stable world digest, idempotent ordered journal, future edit notifications, malformed/tampered source or journal rejection, rollback on final-state mismatch, source immutability, size/cell/edit budgets and cleanup. The 1 MiB / 128-edit *portable* format is not a production-sized save architecture. The final world-digest verification and mesh derivation are still synchronous; larger generated sites will require worker scheduling and measured budgets. This closes a V2.7 **correctness subgate**, not device acceptance. Older Android Firefox sustained ~24 FPS remains open; no 10-minute phone test requested.


## V2.6 — Camera readability of the external-site visual proof (2026-11-12)

A physical iPhone screenshot of the initial `e2cc103` proof showed that the external site loaded, GPU queues drained and the stone-span damage command executed; however, the proof page forced the initial **Hunt-style camera**, making the authored freestanding 3D arch read as a largely top-down glyph. This is a **visual presentation limitation**, not evidence of a failed authoritative 3D terrain or GPU integration contract.

The standalone external-site proof now **defaults to the pre-existing diagonal V2 inspection camera**. A visible view selector permits comparison with the original Hunt camera without reloading the world, rebuilding mesh geometry or changing terrain authority. Status displays the active camera and the number of voxels removed by the previous hit. Automated projection tests verify that the stone roof and X/Z-ground axes separate in 3D; route tests guard the default and its presentation-only camera switching.

This small follow-up does not alter the game camera baseline, V2.8 map generation, physics, textures, or V2.7 mobile acceptance. The older Android's sustained pacing issue remains open; no long-run manual tests were requested.


## V2.6 — Real WebGL external-terrain handoff proof (2026-11-12)

**Built:** an independent `external-terrain-lab.html` route and versioned Pages copy. It consumes the existing V2.6 `V2ExternalTerrainLoader` with a **fixed authored engineering fixture**, rather than regenerating terrain inside Voxel V2. A 3D stone span with real walkable air underneath and layered ground is initialized in bounded 192-cell steps, then meshed by the existing exposed-face mesher, and uploaded using the existing **WebGL2 frame-budgeted GPU queue**. The route has an explicit break-span action committing to the existing `V2TerrainPort`; only dirty chunk meshes are queued for replacement, never a parallel collision state or fake canvas approximation. The route also supports 16³/32³ chunk pitch and explicit unload/reset.

**Automated proof:** same real fixture is exercised on both chunk pitches through (1) initial hidden/incomplete loading, (2) committed material and raycast queries, (3) real derived GPU meshes and drawing, (4) a spell carve that changes authoritative collision before GPU uploads and updates only dirty meshes, and (5) complete renderer resource retirement/unloading. Separate tests ensure the immutable Pages build contains the entire new route and the clean-room audit scans its actual root JS entrypoint.

**Limits:** this is **not** World Generation V2, a biome, terrain art, actual Hunt, device-level rendering proof or V2.7 performance acceptance. The authored fixture uses procedural fallback colors and one small static 3D object. Full scene meshing for this tiny fixture is currently synchronous on completion; a future generated larger site must be routed through the bounded worker mesher after its own performance study. No additional ten-minute phone test requested. Android Firefox sustained pacing remains open.

**Next roadmap work:** remaining V2.6/V2.7 correctness, snapshot/replay and device acceptance; then V2.8 starts genuinely seed-driven forest map generation with river, trails, bridge site, vegetation and collision-aware object placements.


## V2.6 — Externally generated 3D world handoff (2026-11-12)

**Purpose:** Voxel V2 can now accept terrain data produced by a future independent, platform-neutral World Generation V2 engine, without adopting map generation inside the voxel engine. New `voxel-v2.terrain-initialization.v1` source contracts include `siteId`, `generatorVersion`, deterministic seed, chosen chunk size, and bounded X-directed 3D material runs. Runs preserve overhangs, caves and negative coordinates; unlike a heightmap, they represent the real signed 3D cells.

**Safety:** Preflight validates site/generator IDs, cell and run budgets, material bytes, supported chunk sizes, bounds, and overlapping spans *before* world allocation. It canonicalizes run order so identical input generates the same world hash regardless of producer ordering. `V2ExternalTerrainLoader.loadStep(maxCells)` applies no more than 4096 material cells per call. This is a bounded **cell** budget, not a verified millisecond frame-time guarantee. The partial world is hidden from external consumers; once complete, the loader exposes the existing V2-only authoritative `VoxelWorld`, one `TerrainEditLedger` and `V2TerrainPort`. Unloading clears the world and disposes the port.

**Verification:** Automated tests check identical hashes at 16³ and 32³ chunk sizes, real 3D overhang collision and raycasts, one accepted spell edit after import, output copy isolation, signed chunk boundaries, invalid input rejection, staged loading and disposal. No game/V1 migration, biome generation, texture artwork, physical phone test or ten-minute soak is part of this slice.

**Next visible goal:** The first procedural forest *belongs to V2.8*, after the remaining documented foundation acceptance gates. This handoff makes that integration possible without creating a second voxel authority. The older Android Firefox ~24 FPS issue remains open, not explained away.


## V2.0 — CI source completeness and clean-room asset guardrails (2026-11-12)

The Pages validation job now syntax-checks **every current and future V2 JavaScript source, test, and script** instead of maintaining a stale manual file list. The repository-local dependency audit now covers **every root HTML entry**, rejects missing local page assets, non-local remote/data/blob page assets, and Node standard-library imports in browser runtime modules. Node builtins remain permitted for offline test/build tooling.

This guards independent V2 module ownership, mobile browser compatibility, and Pages artifact integrity. Its fixture tests include malicious external loaders, missing assets, V1 directory escapes and unintended Node imports. **No V1 code/assets were imported and no rendering/gameplay behavior changed.** This is one V2.0 acceptance subgate only: mobile Chrome, production-route safety and remaining V2.0–V2.7 device/performance gates stay open.


## V2.5 — Opt-in safe actor recovery (foundation follow-up, 2026-11-12)

**Purpose:** A selected player/enemy start position can become physically obstructed by authoritative voxels or be unsupported. Add a deterministic, bounded `recoverTerrainActor(world, position, {horizontalRadius,verticalRange})` query. It first preserves any already-safe supported position, then searches nearest Manhattan-distance solid-supported candidate footprints (grid-cell centres), with strict limits of 8 horizontal cells and 12 vertical cells. The query reads live V2 voxels, rejects interior collisions and unsupported air, and returns `null` if no safe destination is available; it never changes terrain or authoritatively teleports an actor.

**Integration:** `V2TerrainPort.recoverActor(...)` exposes the same V2-only read-only capability for a future Physics/Game V2 controller. The renderer and V1 are not dependencies; automatic respawn remains the responsibility of the future game controller. Deterministic tests cover already-safe starts, rock pillars, overhangs, signed negative coordinates, both 16³ and 32³ chunks, unsupported worlds, invalid limits, and event-free port access.

**Status:** Implemented in an isolated PR. This does **not** complete the overall V2.5 or V2.7 acceptance gates, and does not cure the separate Android Firefox sustained ~24 FPS frame-pacing issue. No further 10-minute device tests are requested during this foundation development step.


## V2.7 physical older-Android 10-minute soak — sustained frame-pacing regression (2026-11-12)

**Device/build:** User-reported older Android phone, Android 17 / **Firefox 159** (not Android Chrome); build `fd5456faf6a22e93d762f13335699267d3a4e752`, Hill/seed 7/32³ and worker meshing. The session completed **600.024 s**, including **594/594 successful terrain impacts**, **0 rejected**, **8,732 removed voxels**, **9/9 controlled scene resets**, drained CPU/GPU queues, and **no renderer error**. This is solid correctness/resource-lifecycle evidence.

**Sustained frame-pacing issue — open blocker:** rolling frame p95 begins near 8.34–16.68 ms, crosses approximately 41.7 ms at ~48 s, and remains near **41.7 ms (approximately 24 FPS) from about 2 minutes through the end**. Final rolling 1,800-frame p50/p95/p99: **41.66 / 41.68 / 41.72 ms**, with 1 >50 ms hitch **in the rolling window only**. The rolling window showed up to 2 >50 ms hitches earlier; full-session totals were unavailable in this prior build. This is materially worse than the Android device's earlier ~8 ms short fissure test and iPhone Safari's 17 ms ending cadence. The reason is **not established**: browser scheduling/display refresh policy, device thermal/power constraints, and engine load remain possible. Never infer the handset's exact model from the UA.

**Resource/memory context:** peak pending GPU disposals 8, estimated retired buffers 220,880 bytes; peak estimated GPU mesh bytes 220,880; all queues zero on completion, and mesh estimate resets to the same baseline (~158,400 bytes). No evidence of accumulating retained GPU mesh allocations, but JS heap and actual GPU-driver memory are unavailable. 586 sustained samples across 600 seconds show no large >=3 s gap in the one-second rounded timestamps. A limited sampled cadence does not explain the persistent slowdown.

**Action:** keep **V2.7 mobile performance gate OPEN**. Add main-thread frame-work duration distinct from RAF interval pacing, full-session hitch counts, and sampling/frame-gap continuity diagnostics in the next build. Repeat on the same Android Firefox device, then separately on Android Chrome to isolate browser differences. Do not undertake speculative physics, artwork, or broad renderer rewrites before collecting discriminating evidence.


## V2.7 physical iPhone 10-minute soak — evidence review (2026-11-12)

**Device/build:** iPhone Safari; `fd5456faf6a22e93d762f13335699267d3a4e752`; Hill/seed 7/32³, worker meshing. The physical run completed the full **600.007 s**, including **605 accepted/605 changed terrain impacts, 0 rejected, 8,880 removed voxels, 9/9 controlled scene resets, and drained upload/retirement queues**. No renderer error was reported.

**GPU mesh-retirement evidence:** peak 8 queued retirements (~220,176 estimated bytes), peak estimated GPU mesh bytes 220,880, and zero queued retirements at completion. Per-cycle mesh-memory samples returned near the same baseline after resets. No progressive **estimated mesh-resource** growth is apparent; actual GPU driver allocation and JS heap were not measurable.

**Frame and collection caveat:** final frame p95/p99 17/17 ms is based on the **last 1,800** rendered frame intervals, not the complete 10-minute run. Earlier per-second samples include rolling p95 up to 34 ms, rolling p99 up to 42 ms, and up to 2 frames above 50 ms while those frames were still in the rolling window. Sustained telemetry contains **584 samples over 600 seconds**; there was an approximately **18-second sampling gap** from elapsed second 37 to 55. The prior sampler cannot distinguish a browser scheduling interruption from an engine stall, and it drops >=1-second requestAnimationFrame intervals from its frame metrics. No cause should be inferred from this evidence alone.

**Follow-up implementation:** full-session hitch counts and excluded frame-gap measurements, explicit missing one-second telemetry intervals, and `timingQuality` in the mobile-soak report. Review physical iPhone and Android Chrome runs with this improved continuity evidence before accepting full V2.7. This is a **terrain-only** laboratory scenario, excluding real Hunt enemies, VFX, lighting, and structural gravity. No V2.7 full-device or full-game acceptance is claimed.


## Physical-phone foundation evidence — 2026-11-12 (PRs #100–#101)

**Build:** `8df1c010a5c6eb9d5e5030d7d48d103d27daffe9` (frame-budgeted initial uploads and retired GPU-buffer disposal). User reports that scene switching/reset appearance looks good. The supplied machine reports are **18-fissure, ~1.6-second scenarios**, not 3-minute or 10-minute sustained runs.

| Metric | iPhone Safari (previous build `e941400`) | User-reported older Android phone, Firefox 159 (build `8df1c01`) |
| --- | ---: | ---: |
| Accepted terrain edits | 54 / 54 | 54 / 54 |
| Removed voxels | 6,549 | 6,549 |
| Frame interval p95 / p99 | 19 / 36 ms | 8.34 / 25 ms |
| Frames exceeding 33 / 50 ms | 1 / 0 | 1 / 0 |
| Edit-to-visible latency (last worker update) | 53 ms | 78 ms |
| End-of-scenario pending GPU uploads / errors | 0 / none | 0 / none |

The Android report also recorded **peak pending GPU disposals 32** and **peak retired buffer estimate 1,936,704 bytes**, both **zero at scenario completion**. This specifically corroborates the new deferred GPU disposal draining; it does not independently prove hitch-free synchronous WebGL deletes.

**Evidence limits:** Phone model and hardware tier are not encoded in the Android report; “older phone” is the tester's description. Android's ~8.34 ms cadence is consistent with a 120 Hz display and is not an apples-to-apples device speed comparison with iPhone Safari. Android Firefox is **not Android Chrome acceptance**. Both short fissure runs omit real gameplay enemies, lighting, gravity, and VFX; no texture tiles were loaded. `contextRecoveryTest.attempts` was 0 on the Android report. WebGL lost/restored context, real Android Chrome, ten-minute repeated destruction, memory growth over time, and complete V2.0–V2.7 acceptance remain **open**.

**Next foundation focus:** real-device context recovery and sustained background/foreground and reset sessions. Retain engine-specific timing/report evidence separately from subjective visual feedback.


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

## 0.0.018 — deterministic idempotent terrain edit foundation

**0.0.017 iPhone Safari evidence** (two reports, Hill/Hunt-style/32³/seed 7):
- First warm-worker edit: 18 ms edit-to-mesh-update, worker CPU 16 ms,
  worker round trip 16 ms, GPU upload 1 ms, p95/p99 18/25 ms (264 frames).
- Second warm-worker edit after reset: 23 ms edit-to-mesh-update, worker CPU
  18 ms, round trip 21 ms, GPU upload 1 ms, p95/p99 18/30 ms (782 frames).
- Both report worker warm-up 272 ms **outside the edit**, worker ready at submission,
  no >50 ms frames, 378 voxels removed, 8/8 chunks updated, no context loss.
- Versus the earlier first-worker report (258 ms), prewarming avoids repeated
  worker startup. This is strong initial device validation, **not** 10-minute
  thermal/stress or Android acceptance. Baseline stays default.
- The measured GPU upload was 1 ms in both reports; defer GPU upload budgeting
  until burst or larger-scene measurements show it is a bottleneck.

**New small V2.3 preparation:**
- [x] One V2-native synchronous `TerrainEditLedger` is the authoritative writer
  for bounded sphere edits, independent of rendering and worker code.
- [x] Stable edit IDs with duplicate suppression; a repeated ID never removes
  voxels twice and a conflicting payload is rejected.
- [x] Optional expected-world-revision guard rejects stale edits before mutation.
- [x] Explicit material policy: reserved V2 bedrock material ID 4 is protected,
  grass/dirt/stone remain destructible.
- [x] Each accepted edit returns changed-cell bounds, exact dirty chunk IDs,
  removed voxel count and resulting world revision.
- [x] Maximum sphere radius 8 and 1024 retained command IDs; overflow reports
  an explicit checkpoint-required error instead of silently forgetting IDs.
- [x] Laboratory Carve sphere exercises the actual ledger; export retains
  `lastCarve` details and adds `acceptedTerrainEditIds`.
- [x] Tests compare legacy demo carve with the new authoritative writer
  on all four scenes and 16³/32³, plus duplicate IDs, material policy,
  two-edit deterministic replay, stale revision and bounded history.
- [ ] **Not yet:** persistence of edit IDs across save/load, resistance-based
  multiple hits, area/line/tunnel commands, atomic multi-chunk transactions,
  hashes and replay checkpoint serialization.
- [ ] **Not yet:** deterministic multi-hit workload UI or sustained performance.

**Player check:** load v0.0.018, Hill/Hunt-style/seed 7/32³, Background pilot,
Carve sphere. It must remove 378 voxels and show the crater. Export JSON and
confirm `lastCarve.editId`, `lastCarve.changedBounds`,
`acceptedTerrainEditIds` and `terrainWorker.status: complete`.
Press Carve again: since the sphere is unchanged, the edit count advances but
removedVoxels should be 0. Reset restores the original hill. No new UI polish,
camera change, or gravity simulation.

## 0.0.019 — deterministic three-hit burst and one combined remesh

**Real iPhone Safari v0.0.018 report** (`01845b3`, Hill/Hunt-style/32³/seed 7):
- First terrain-edit ledger command accepted as `lab-hit-1`; 378 voxels
  removed, changed bounds `(-4,-1,-4)..(4,7,4)`, eight dirty chunks.
- Warm worker CPU mesh 20 ms, GPU upload 1 ms, total 25 ms;
  p95/p99 18/25 ms over 1,402 frame samples, zero >50 ms, no WebGL errors.
- `acceptedTerrainEditIds = 1`, and `terrainWorker.status = complete`.
- This does **not** prove the separate duplicate-area and Reset checks; the
  report captures the first carve only.

**New V2.3 test fixture:**
- [x] Three deterministic sphere impacts at separate positions for each of
  Flat/Hill/Cliff/Arch (16³ and 32³ chunk sizes), using the existing
  authoritative `TerrainEditLedger`, unique IDs and revision checks.
- [x] Aggregate true changed-cell bounds, removed voxel counts and dirty
  chunk IDs across all impacts; worker receives the **union** once after
  all edits instead of one job for each hit.
- [x] Add a **3-hit burst** lab action beside the existing Carve sphere.
  Preserve Baseline and Background pilot modes and the Hunt camera.
- [x] Include `lastBurst` in the report with each accepted edit, world
  revision, bounding box, `editCpuMs`, and unioned dirty chunks.
- [x] Fail early on invalid or over-capacity requests; tests assert identical
  authoritative world snapshots compared with independent sequential carving.
- [x] Test exact worker mesh equivalence for the combined dirty footprint,
  unchanged negative-coordinate chunk seam culling, deterministic repeated
  runs and protected-material behavior.
- [ ] Not atomic across multiple edit commands; if an unexpected failure
  occurs partway through, the lab rebuilds from authoritative state.
- [ ] No gameplay command log persistence, resistance accumulation, gravity
  or native game integration yet.

**0.0.019 iPhone test:** Hill/Hunt-style/32³/seed 7; select Background
pilot and allow worker prewarm; press **3-hit burst**. Confirm distinct
craters, worker finishes, and export JSON with `lastBurst.impactCount=3`,
`lastBurst.edits.length=3`, `lastBurst.removedVoxels>0`,
`lastBurst.dirtyChunks`, and `terrainWorker.status=complete`.
Press **Reset**, run the same burst again and compare removed-voxel counts
and rendered triangles. If needed, try Cliff and Arch to inspect breaches.
Single Carve sphere should remain unchanged. Physical Android validation
and 10-minute thermal tests are still open.

## 0.0.020 — deterministic cumulative damage and V2 material resistance

**Physical iPhone Safari v0.0.019 multi-hit evidence** (de21058,
Hill/Hunt-style/32³/seed 7):
- Three accepted ordered edits: 39 + 93 + 67 = **199 removed voxels**.
- Correct four-chunk union of dirty footprints from an eight-chunk world.
- Edit processing **4 ms**; one warm-worker mesh **15 ms CPU**;
  total update **19 ms**; GPU upload displayed **0 ms** due timer resolution
  (not literally free).
- 4,036 rendered triangles; p95/p99 frame intervals **19/29 ms** across
  799 samples; zero >50 ms and zero context losses.
- Repeat-after-Reset and sustained-performance acceptance remain open.

**New small authoritative behavior:**
- [x] New `damage-sphere` command in the same V2 TerrainEditLedger.
  The original `carve-sphere` retains instant-removal semantics.
- [x] V2-only resistance policy: grass=1, dirt=2, stone=3 unit-damage
  pulses to remove; protected bedrock material ID 4 is still unbreakable.
  These are experimental values, not imported from Wyrmforge V1.
- [x] Record partial per-voxel damage in the edit ledger. Each subsequent
  unique command ID accumulates integer power. Duplicate IDs do not
  accumulate again, and changing a prior command's payload is rejected.
- [x] Separate monotonically increasing `editRevision` from the voxel
  world's `revision`. A partial-only pulse still advances edit revision,
  enabling `expectedEditRevision` ordering checks without unnecessary
  world-mesh invalidation.
- [x] Hard per-command bounds: sphere radius <= 8, damage power 1..8,
  at most 8,192 active partially damaged cells, and the existing 1,024
  accepted command ID history cap. Preflight damage-state capacity
  prevents partially applied resource-overflow operations.
- [x] Surface `damageLedger.editRevision`, `pendingDamageCells`,
  `resistanceByMaterial` and `lastDamage` in benchmark JSON.
- [x] Add **Damage pulse** lab button that repeatedly damages the same
  deterministic test sphere. Worker/GPU rebuild only when voxels are
  actually removed; partial-only pulses do not cancel valid workers.
- [x] Tests for all material thresholds, protected voxels, damage duplicate
  suppression, ordered partial-only revisions, exact signed chunk seams,
  deterministic replay on 16³/32³, and bounded memory preflight.
- [ ] Partial damage is not yet in a durable world snapshot or replay
  checkpoint. The ledger is the current authoritative damage-state owner,
  so full save/restore and hashed replay require explicit new V2 schemas.
- [ ] No cracks/VFX, resistances for future materials, native integration,
  optional hybrid gravity, or real-device sustained thermal evidence.

**Physical iPhone 0.0.020 check:** load Hill/Hunt-style/seed 7/32³ and
Background pilot; press **Damage pulse** three times at the same target.
Pulse 1 removes weak grass and weakens dirt/stone, pulse 2 removes dirt,
pulse 3 removes remaining stone inside that sphere. The crater should
progress rather than appear fully formed on the first pulse. Export after
each pulse, checking `lastDamage`, `damageLedger.editRevision`,
`pendingDamageCells`, and only necessary worker mesh updates. Reset must
restore the intact hill and clear all damage. Confirm **Carve sphere**
and **3-hit burst** still operate normally.

## 0.0.021 — replay checkpoint of voxels and accumulated material damage

**Physical iPhone Safari v0.0.020 report** (build b7b15c1, Hill/Hunt/32³,
seed 7):
- Third damage pulse (`lab-damage-3`) removed 174 voxels, completed
  `editRevision:3` with zero remaining partially damaged cells and
  `acceptedTerrainEditIds:3`.
- Warm worker CPU mesh 16 ms; 17 ms end-to-end mesh update; GPU upload
  displayed 0 ms at the browser timer's resolution (not a zero-cost upload).
- p95/p99 frame intervals 22/31 ms over 282 frames; zero >33/>50 ms frames,
  no renderer error and zero context loss.
- This export is **only the third pulse**. Earlier pulse-by-pulse damage
  progression and Reset restoration are not independently verified.

**New V2-native bounded replay checkpoint:**
- [x] The authoritative ledger exports a JSON-friendly ordered journal of
  up to 1,024 accepted commands, retaining each command's ID, type, geometry,
  damage power, and original expected world/edit revision.
- [x] Include **partial material damage** in an independent checksum, even
  when no voxel was destroyed and the voxel world's revision is unchanged.
- [x] Versioned replay checkpoint stores the independent V2 generator schema,
  scene/seed/chunk size, world revision, edit revision, pending damage count,
  journal, and 16-hex-character deterministic voxel/damage/journal fingerprints.
  These hashes detect accidental mismatch; **they are not cryptographic**.
- [x] Restore constructs a **new V2 world** from its generator, replays every
  accepted edit in original order, checks all three fingerprints, and rejects
  conflicting, corrupted or different-scene results **before** replacing
  the live authority.
- [x] Two lab actions: **Save replay point** verifies and retains a point in
  this browser tab; **Restore replay point** replaces the current world and
  ledger after verification, clears stale meshing requests, re-derives all
  GPU meshes, and preserves future unique lab command ID counters.
- [x] Benchmark JSON reports `lastReplay` outcome, restore duration,
  command count, world/damage checksums, and `replayPointAvailable`.
- [x] Tests cover all four terrains at 16³/32³, JSON roundtrip, partial-only
  stone damage, continued damage progression after restore, duplicate command
  protection, burst-then-damage replay, bad-seed/tampered-journal rejection,
  and no mutation of existing authority when replay validation fails.
- [ ] **Not persistent** across page refresh or browser closure. The checkpoint
  is generator + complete bounded command journal, not a direct arbitrary
  chunk-state snapshot or a checkpoint compacting the journal.
- [ ] No file import/export, persistent storage, atomic burst transactions,
  scene-independent chunk snapshots, or 10-minute/Android acceptance yet.
- [ ] Optional gravity and all V2 ecosystem hooks remain separate later tasks.

**0.0.021 iPhone acceptance:** Hill/Hunt-style/32³/seed 7, choose
Background pilot. Press **Damage pulse** once or twice, then
**Save replay point**. Export a benchmark: expect `lastReplay.status`
`saved-and-verified` and nonzero `pendingDamageCells`. Continue pulsing
until the crater deepens or Reset the world, then press
**Restore replay point**. The terrain must return to the saved intermediate
state, including invisible accumulated partial damage: the next pulse should
continue the original progression rather than start over. Export a second
benchmark with `lastReplay.status:restored`. Confirm worker state and
`rendererError` remain healthy. No V1 code or assets are imported.

## 0.0.022 — portable replay JSON export/import across browser sessions

**Physical iPhone Safari v0.0.021 evidence** (build `ab54c3e`,
Hill/Hunt-style, chunk 32³, seed 7):
- The session checkpoint restored successfully after one accepted damage pulse.
- Replayed **one command** and preserved **312 partially damaged voxels**,
  with `editRevision:1`, accepted edit count 1, and matching checksums:
  world `42565cf29cb2b4ce`, damage `efffaf035cde47b7`.
- Reported restore **27 ms** and full eight-chunk CPU mesh rebuild **14 ms**;
  p95/p99 frame intervals **17/30 ms**, no >33 ms samples across 78 frames,
  no WebGL context loss or renderer error.
- It does **not** independently prove continued damage after a restore or
  sustained performance. Browser-internal state was lost on page refresh.

**New portable V2-only file layer:**
- [x] Versioned wrapper `voxel-v2.replay-file.v1` around the established
  `voxel-v2.replay-checkpoint.v1` schema. Includes deterministic fixture
  identity, ordered IDs, world/edit revisions and all three fingerprints.
- [x] On-demand **Replay files… → Export JSON** saves the **current** world,
  not a potentially older session Save replay point. The file is verified
  by independent generator replay before being offered for download.
- [x] **Replay files… → Import JSON** opens iPhone Safari's file chooser.
  The selected file is read strictly as UTF-8 and validated fully
  **before** replacing the live world, damage ledger or GPU buffers.
- [x] Strict limit **256 KiB per JSON file** and **128 edit commands** for
  this first portable, main-thread import experiment; oversize/malformed
  imports are rejected with explicit feedback. The in-memory ledger's
  1,024-ID limit is unchanged.
- [x] Reject wrong wrapper/checkpoint/generator, corrupt JSON, invalid
  commands and mismatched voxel/damage/journal fingerprints.
  Fingerprints are **not cryptographic or an authenticity guarantee**.
- [x] Reconstruct the highest `lab-hit-N`, `lab-damage-N` and
  `lab-burst-N-hit-K` counters from imported IDs so future lab commands
  remain unique after a fresh browser session.
- [x] Share the proven session restore transition: cancel workers, discard
  pending dirty geometry, install verified fresh V2 world/ledger, rebuild
  all WebGL2 meshes and resume optional background worker.
- [x] Preserve the current world when invalid files are rejected; status
  and JSON benchmark report `file-imported`, `file-exported`,
  `portableFileBytes` or the explicit rejection.
- [x] Pure Node tests for portable JSON round-trips (four scenes, both
  chunk sizes, partially damaged state), ID counter recovery, tamper
  rejection, invalid/oversize inputs and the compact mobile controls.
- [ ] **Manual file management only:** no localStorage, IndexedDB, cloud
  synchronization, cross-version migrations, auto-save, or direct arbitrary
  voxel chunk snapshots.
- [ ] Main-thread replay remains synchronous; sustained/device stress tests
  and larger journal formats remain a future milestone.

**Physical iPhone 0.0.022 acceptance:** Hill/Hunt-style/seed7/32³,
Background pilot. Press **Damage pulse** once; then
**Replay files… → Export JSON** and save the file into Files.
Refresh the lab (fresh in-memory session). Select
**Replay files… → Import JSON**, choose that same file; verify one edit and
312 partial-damage cells are restored with no renderer error.
Press **Damage pulse** twice more: subsequent dirt/stone destruction should
continue from the imported state rather than restart at zero.
Export benchmark; check `lastReplay.status:file-imported` immediately
after import and `damageLedger.editRevision` after follow-up pulses.
Also try importing the normal benchmark JSON: it must be rejected without
changing the visible terrain. No V1 assets, schemas or source reused.

## 0.0.023 — iPhone replay import UI fix, return to core engine roadmap

**Import issue reported on physical iPhone in 0.0.022.** The lab used a
native select change listener to programmatically click a `hidden` file
input. This indirect activation is not a reliable way to open iOS Safari's
file picker. The exact on-device failure mode has not been captured.

- [x] Replace that select/hidden-input chain with a small, permanently visible
  native `input type="file"`, allowing a direct tap to invoke the iOS file
  chooser. Separate single-click `Export replay` action remains available.
- [x] Preserve the existing replay-file format, strict UTF-8 parsing,
  import bounds (256 KiB, 128 commands), checksum verification,
  unchanged-authority-on-failure behavior and complete world rebuild.
- [x] Add test coverage that rejects hidden file inputs and synthetic
  `input.click()` import activation.
- [ ] Physical iPhone Safari import confirmation, then **freeze portable replay
  UI work**; expand only if a real engine integration requires it.

**Reprioritization:** deterministic replay, partial damage, and independent
worker correctness are sufficient supporting foundations for the next phase.
Portable save UI is not a gameplay blocker. The next improvements should
focus on the voxel engine: editable 3D terrain (cliffs and hills included),
bounded and measured stress from repeated damage, collision/terrain query
interfaces, mobile performance, and independent V2 integration contracts.
Avoid new save/cloud/checkpoint features until required by those goals.
Continue keeping V1 untouched; do not promote Baseline/Background pilot
based on short samples alone.

## 0.0.024 — roadmap V2.3/V2.5 foundation: Hunt terrain spell targeting

**Purpose:** Keep the V2 engine independent while building exactly the
capabilities required by Wyrmforge Hunt gameplay: spell impact -> real
authoritative voxel -> material damage -> bounded remesh. This is a small
V2.3 destruction and V2.5 aiming/query foundation, **not** a complete
V2.5 collision milestone or proof of finished Wyrmforge integration.

- [x] Pure V2 3D DDA terrain-ray query with 256-voxel maximum ray distance,
  signed negative coordinates, nearest solid voxel and face-entry normal.
  Queries the committed VoxelWorld, never the generated GPU mesh.
- [x] Invert the existing Hunt-style and voxel inspection camera bases to
  turn touch coordinates into orthographic voxel rays. World X/Z remain the
  terrain plane and Y remains elevation. No camera renderer changed.
- [x] Implement `applyTerrainSpellHit` V2 interface: accepts a ray or an
  already resolved hit, rejects stale world-revision/material hits, applies
  a bounded material-aware `damage-sphere` command via TerrainEditLedger,
  and returns exact voxel impact, material, removed/partially damaged cell
  counts, and dirty chunk IDs.
- [x] Add opt-in `Touch: Target spell` lab mode. **Pan terrain** remains
  the default. One short stationary tap attempts a spell; drag pans,
  pinch zooms, long presses and pointer cancellations do not fire spells.
- [x] Targeted hits use the existing warm-worker/localized GPU update;
  partial-only damage never forces a geometry rebuild.
- [x] Include `lastTargetedImpact` and `terrainInteractionMode` in
  benchmark exports. Existing demo Carve/Damage/Burst/replay tools unchanged.
- [x] Tests for camera-to-voxel inverse targeting, cave and closest-wall
  ray hits, signed chunk seams, material resistance, stale hit checks,
  bedrock, misses, and touch cancellation.
- [ ] **Not yet:** actual Wyrmforge Hunt migration, projectile movement
  physics, swept player collision, mass-production terrain scenes, full
  projectile contacts, pixel-art material atlas and mobile acceptance.
- [ ] Do not mark V2.3, V2.4 or V2.5 gates as completed on this pilot.

**Mobile check:** v0.0.024 on iPhone Safari, Hill / Hunt-style /
seed 7 / chunk 32³. Choose **Touch: Target spell**, select Background
pilot and allow worker prewarm. Tap the visible hill repeatedly in the
same location. The tap should damage the actual touched voxel, with
material-aware repeated hits and a localized crater; dragging/pinching
must pan/zoom without firing. Check a Cliff or Arch surface with the
inspection camera as a second test. Export JSON containing
`lastTargetedImpact` with a non-null `hit.cell`, authoritative voxel
material, and correct worker/dirty-chunk data. Re-enter **Pan terrain**
and ensure a tap no longer carves.

**Wyrmforge integration boundary:** `raycastTerrain(world,ray)` and
`applyTerrainSpellHit(world,ledger,impact)` are engine-side pure V2
functions; the future V2 Hunt gameplay adapter owns projectile spawning,
hit origin/direction, game balance, visuals and effects. Wyrmforge V1
repo and assets remain untouched.

## Canonical roadmap reconciliation — 2026-11-10

**Source of truth:** the original November 9 Work-authored *Wyrmforge Voxel
v2 — Implementation Handover*, expanded by the independent research,
acceptance checks and architecture decisions in
[ROADMAP.md](ROADMAP.md). Keep **ONE** V2.0–V2.7 foundation sequence; use
V2.8–V2.10 for the now-explicit game, gravity and release outcomes.
Laboratory versions 0.0.xxx are not those milestones.

**End state (required):** the newly authored, independent V2 voxel world
must actually run Wyrmforge Hunt gameplay with player/projectile/AI
interactions, full hills/cliffs/overhangs excavation, pixel-readable
2.5D graphics, bounded structural gravity and falling rubble, and
measured stable performance on mobile. V1 remains untouched during
V2 experimentation.

| Milestone | Existing proof | Acceptance still outstanding |
| --- | --- | --- |
| V2.0 lab instrumentation | Separate V2 GitHub Pages, build SHA, real iPhone Safari benchmark exports | Android Chrome, complete deployment/interaction acceptance |
| V2.1 sparse terrain | 16³/32³ signed coordinates, Hill/Cliff/Arch/Flat, unit tests | Document independent world-units/voxel pitch and full storage gate |
| V2.2 rendering | WebGL2 exposed faces, Hunt camera, diagnostic greedy mesher | Pixel-art material atlas, stable world-space textures, mesher decision, full context-loss/device tests |
| V2.3 destruction | Authoritative sphere/damage edits, material resistance, 3-hit test, direct screen targeting | Tunnel/line/area/crater command shapes, bounded **atomic** edits, physical cliff and overhang regression |
| V2.4 async/mobile | Opt-in warm worker, stale-result protection, iPhone 18–25 ms small edits | Frame-budgeted GPU uploads, overload/backpressure, larger worker stress and sustained thermal evidence |
| V2.5 player/physics | DDA targeting and test impacts from build 0.0.024 (iPhone user accepted) | Player capsule/swept collision, grounding, falling through excavated floor, wall/ceiling, moving actor tests |
| V2.6 interfaces | V2 spell-hit module and isolated engine code | Typed read/edit/change/metrics contracts + test Lighting/Physics/VFX/Audio/AI consumers |
| V2.7 foundation gate | Replay/checkpoint experiments and independent tests | Final snapshot/restore metadata, 10-minute iPhone and Android Hunt-like stress, accepted performance thresholds |
| V2.8 Wyrmforge integration | Planned; not implemented | First playable guarded V2 Hunt terrain scene, V2 gameplay control, projectile impact and correct collision |
| V2.9 structural gravity | Detailed [design](VOXEL-GRAVITY-V2.md); not implemented | Support detection, falling cohesive clusters, granular simulation, safe settlement and mobile tests |
| V2.10 production release | Planned; not implemented | Integrated V2 pixel art + normal Hunt workloads/ambush, measured device acceptance, safe cutover |

**Original Work provisional performance targets:** support a measured 60 FPS
baseline (whole-game p95 <=16.7 ms), ~2 ms/frame main-thread terrain work,
typical edit-to-visible <=100 ms, explicit fallback quality tier for slower
hardware, and >=10-minute physical device runs. These are **not verified
guarantees** and must reserve capacity for Wyrmforge enemy AI, effects,
lighting, audio and UI. No claim of universally "perfect" FPS is possible.

**Immediate next implementation step:** close the missing **V2.5 player
grounding and swept voxel collision** capability using the newly validated
V2 3D raycast and authoritative terrain state. Build a tiny player/capsule
fixture that can walk over a hill, stop at a wall/cliff and fall when
support is removed, with deterministic unit tests on both chunk sizes.
Then continue the oldest incomplete **V2.2/V2.3/V2.4** performance/material/
explosion acceptance gates rather than jumping to new replay UI.
Wyrmforge V1 production code remains unchanged until the guarded
V2.8 game integration milestone.

## 0.0.025 — V2.5 physical interaction: grounded actor and swept voxel collision

**Scope:** first player-sized actor **physics pilot**, part of the original
Work-derived V2.5 gate. It is not full capsule physics, Wyrmforge V2 Hunt
integration or structural gravity (required later at V2.9).

- [x] Add a pure V2 swept-AABB actor volume (half-width 0.28, height 1.6)
  with authoritative occupancy tests, exact one-axis integer-plane sweeps
  and capped 32-voxel displacement. Unlike checking only the final
  position, swept collision cannot skip a one-cell wall during high-speed
  movement. All signed chunk coordinates come from VoxelWorld.
- [x] Spawn actor through existing 3D DDA terrain raycast and confirm
  clearance plus real support before treating actor as grounded.
- [x] Bounded fixed-step 60 Hz gravity simulation with a terminal
  fall velocity, X/Z sliding, wall contact and conservative one-voxel
  stepping. The actor has no renderer-owned collision truth.
- [x] Lab has a default-off **Actor pilot** toggle, a diagnostic Canvas2D
  marker overlay and mobile touch D-pad / desktop WASD keys; no new sprite
  art, engine imports from V1 or changes to existing Hunt targeting.
- [x] Removing support affects committed voxel collision on the next
  physics tick, regardless of any pending worker mesh update.
- [x] Report actor position, grounded/falling status, world revision,
  fixed-step count and dropped catch-up-frame events in benchmark JSON.
- [x] Tests cover spawn at all four scenes and 16³/32³ chunks, removed
  ground/falling, tall cliff blocking, one-voxel step, diagonal wall
  slide, overhang/ceiling obstruction, negative seam and high-speed
  wall sweep. UI tests ensure the actor physics is opt-in.
- [ ] **Not yet:** swept capsule-versus-AABB comparative benchmark,
  continuous diagonal collision simultaneous TOI, slopes beyond voxel
  steps, player acceleration/jumping, enemy collision and actual
  gameplay. The current actor is a diagnostic shape drawn over the
  terrain, not depth-occluded production art.
- [ ] **Not yet:** quality/performance acceptance with normal Wyrmforge
  Hunt, 10-minute device runs, Android Chrome, V2.8 production integration
  or V2.9 falling *terrain* (the actor is affected by ordinary gravity only).
- [ ] The stage's 60 Hz is a fixed simulation frequency, **not**
  evidence of guaranteed 60 FPS rendering on any device.

**Physical-device acceptance:** load Hill/Hunt-style/32³/seed 7,
enable **Actor pilot: On**. Move with the D-pad (or desktop WASD):
the marker should remain above real ground, walk onto one-voxel edges,
stop against a high Cliff, and never pass through a solid wall.
Use **Carve sphere** or **Target spell** to remove ground beneath the
actor, verify actor falls without waiting for mesh rebuild, and
**Respawn actor**. Repeat on Arch and negative-coordinate chunks.
Export benchmark JSON including `actorPilot`, `terrainWorker`,
`renderer` and frame-time percentiles.

**Next required follow-up before V2.5 gate:** measure and improve the
swept actor collision and step/slide rules on a real phone, then add
high-speed actor and projectile underfoot edit tests before choosing
capsule or AABB permanently. Preserve the consolidated Work roadmap's
V2.8 Wyrmforge integration and V2.9 hybrid gravity as *required* outcomes.

## 0.0.026 — mobile V2.5 testing viewport (iPhone)

**Physical iPhone Safari evidence from v0.0.025 (`e4feef9`, 2026-11-10):**
- Hill / seed 7 / Hunt camera / 16³ chunks.
- Real diagnostic actor enabled: x≈6.14, y≈2.00001, z≈6.72, grounded,
  zero actor simulation errors, **677 fixed physics steps** and
  **zero catch-up overflow frames**.
- 1,186 frame samples, p95 **17 ms**, p99 **25 ms**,
  one >33 ms sample and zero >50 ms samples; renderer 4,036 triangles /
  8 draws, no WebGL errors or context losses.
- Baseline synchronous three-hit geometry update: **8 ms** for four changed
  chunks after 199 committed voxel removals.
- **Major usability blocker:** screenshot and benchmark show only
  **402×141 CSS pixels** remaining for terrain (804×282 backing pixels).
  The permanently expanded controls occupied most of the mobile viewport.
  This is not a GPU slowdown; it prevents meaningful player collision tests.
- A successful grounded actor does **not yet** independently prove cliff
  blocking, step ascent or falling after support removal on this phone.

**Fix for the next V2.5 device test:**
- [x] Compact V2 top bar shows version/build identity and a **Controls**
  toggle. All 20+ existing world, damage, replay and benchmark controls move
  into a scrollable *overlay drawer*, **collapsed by default**.
- [x] Drawer overlay does not participate in viewport sizing. The terrain
  canvas keeps its height while temporary controls are open.
- [x] Accessibility: button with `aria-expanded` and `aria-controls`,
  native labelled input controls, Escape dismissal, click-outside dismissal
  and automatic drawer close after action buttons.
- [x] Keep actor touch movement and optional spell targeting available when
  the drawer is closed. No renderer, collision, world, edit or worker logic
  modified in this increment.
- [x] Export `labControlsOpen` with benchmark JSON. Test preserved IDs,
  fixed status height and default-collapsed drawer.
- [ ] On-device acceptance: confirm viewport is significantly taller
  than 141 CSS px, and actor movement, Reset, targeted impact,
  diagnostics and export remain usable.
- [ ] Still required: real-world player collision/falling experiments and
  sustained iOS/Android performance before V2.5 can pass.

**Next:** resume the single Work-derived V2.5 roadmap: validate high
cliff/wall blocking, single-voxel steps and falling into a freshly carved
pit while camera pan/pinch still behave. No V1 imports.

## 0.0.027 — V2.5 support-loss and landing validation in real excavated terrain

**Physical iPhone evidence (V2 0.0.026, Cliff / Hunt / chunk16³ / seed7):**
The user created a walkable ramp by destroying cliff voxels, walked the
diagnostic actor onto higher ground, and captured an on-device screenshot.
At export the actor was grounded at **y=10.00001**, with x≈7.79, z≈1.28,
after **4,601 fixed physics steps** and **zero catch-up overflows**.
During 1,800 frame samples p95/p99 were **18/32 ms**, with **2 frames >50 ms**
and zero context losses. **37 edit commands** were accepted; the most
recent localized mesh update rebuilt **1/8 chunks in 4 ms**. The final
recorded spell tap was a miss; this does not invalidate the earlier ramp
edit but is not proof of that tap's geometry. The final-step
`stepUp:false` does not capture earlier successful step-ups.

**Next targeted V2.5 acceptance fixture:**
- [x] New pure `excavateActorSupport(world,ledger,actor,id)` identifies
  immediate solid footing over the actor's swept AABB footprint and
  commits a bounded 2.5-voxel-radius sphere beneath it through the
  *existing V2 authoritative terrain edit ledger*, preserving signed
  chunk seam and edit ID/revision guarantees.
- [x] Add **Excavate under actor** to the collapsed lab destruction panel.
  Available only while Actor pilot is enabled. Keep existing normal
  spell targeting, actor controls, camera and mobile viewport intact.
- [x] Report `actorPilot.supportExcavation` with before/after support,
  committed voxel count and exact dirty chunks, actor position at edit,
  number of physics steps until first airborne, latency, fall distance,
  landing step/elevation and whether a worker mesh was still pending
  when the actor first fell.
- [x] Collision is evaluated directly from committed V2 voxels in the
  *very next* fixed physics tick, even if the warm background mesher
  has not returned its GPU buffers. Fall and landing are never
  decided by screen pixels or GPU mesh availability.
- [x] Unit tests for high platform drop and landing on lower solid
  terrain, tall-cliff footing loss, negative chunk seams, proper edit
  journal duplicate protection, and equivalent localized worker
  geometry across both 16³ and 32³.
- [x] Track aggregate `actorPilot.stepUps` rather than relying on the
  `stepUp` value of the most recent individual physics tick.
- [ ] Await a physical iPhone test of excavation beneath an elevated
  actor, falling and landing, with benchmark JSON and 10-minute stress.
- [ ] Full production player capsule, continuous diagonal contact, V2.8
  integration in actual Wyrmforge Hunt and structural gravity V2.9
  remain separate required milestones.

**Phone test:** load Cliff, Hunt-style, chunk 16³, seed 7; enable Actor
pilot and walk onto the top or a user-created walkable ramp. Open Controls
→ Destruction → **Excavate under actor**. The actor must immediately lose
support and fall into the newly cut pit (or out of the level), without
ghost collision; the state line should show falling and then grounded
if lower terrain catches it. Export the benchmark; inspect
`actorPilot.supportExcavation` for `falling`, `landed` or
`fell-out`, `physicsStepsUntilFall`, `fallDistance`,
`supportAfter=0` and current actor elevation. Try Background pilot
for a genuine worker-pending case, too. Reset should restore the cliff.
No V1 import, no structural terrain-body physics implied.

## 0.0.028 — V2.5 moving collision, jumping and overhead rock

**Objective:** finish another bounded, reusable V2.5 actor-physics slice after
the owner's successful iPhone excavation/fall screenshot on **0.0.027**.
This is *character* gravity and dynamic collision, NOT falling structural
terrain (required V2.9). Wyrmforge V1 and the separate Character Visibility
system are not changed.

- [x] Give the V2 swept-box actor a limited upward jump impulse with gravity
  and terminal fall speed; only grounded, supported actors can initiate it.
  Jump requests do not trigger again while airborne.
- [x] Use existing **authoritative integer-plane voxel sweeps** for upward
  and downward travel. On overhead contact, stop ascending,
  report `ceilingContact:true` but **never mark the ceiling as ground**.
- [x] While jumping, do not auto-step up walls: true suspended traversal
  collides with solid walls, can jump over a low voxel obstacle, and
  cannot pass through a tall wall.
- [x] Test removing a wall while walking: the very next physics simulation
  responds to the newly destroyed authoritative voxels without waiting
  for the WebGL2 mesh/worker.
- [x] Test destruction of an elevated platform while the actor is airborne:
  it must descend through the *removed* platform and land on lower solid
  voxels without ghost collisions.
- [x] Keep iPhone landscape readable: add a **Jump** button in the existing
  otherwise unused upper-right D-pad cell. Desktop supports **Space**;
  existing WASD, pan, pinch, Target spell and underfoot excavation remain.
- [x] Extend benchmark `actorPilot` counters with `jumps` and
  `ceilingHits`. The marker is still a basic diagnostic Canvas2D overlay.
- [ ] Physical iPhone Safari / Android Chrome acceptance, repeated
  jumping and excavation under real input loads, final 3D capsule/controller
  decisions, V2.8 game integration and 10-minute performance tests remain.
- [ ] Character Visibility V2 (pixel-accurate partial occlusion/emissive
  outline) belongs to the future dedicated visibility/render system, **not**
  the voxel engine. Do not add it to this module.

**Device check:** load Flat/Hill with v0.0.028, enable Actor pilot,
tap Jump and observe a short up-and-down arc with no hovering. Move and
jump over a one-voxel ridge; Cliff/Arch overhangs should block the
character's head. Run **Excavate under actor** and observe fall/landing.
Export benchmark and verify `actorPilot.jumps`, `ceilingHits`,
`error:null` and frame-time/hitch counts. The first validation is a
small physically tested slice, not full V2.5 acceptance.

## Pages cache mitigation for lab 0.0.028 — November 10, 2026

**Physical iPhone screenshot at 14:48 Europe/Amsterdam** displayed
`v0.0.027 · 4b3667f`, although `0.0.028 · 9aeec0e` was already merged.
The **actual push workflow** `42826912463` deployed `9aeec0e`
successfully at **14:43 local**: validation, commit stamp, Pages upload
and `actions/deploy-pages@v4` all passed. The screenshot five minutes
later is **consistent with stale cached HTML/ES modules**. No live HTTP
response/Cache-Control header was available in this environment, so
caching is a likely explanation rather than a proven root cause.

**Permanent deployment test route:** after stamping every main-branch
deploy, copy `index.html`, `main.mjs` and the entire independent
`src/` module tree into `builds/<deployed-full-commit-sha>/` in
the **same Pages artifact**. This path is unique for each merge, so a
user can test a fresh URL without reusing an older cached HTML/JS graph.
The canonical lab root URL stays unchanged. A build mismatch or missing
artifact makes the deploy job fail. Tests verify a complete relative
module graph, root preservation, and stamp matching. The build-specific
route is a **diagnostic URL**; it is replaced with the next release's
build directory by the next deployment, not an archival hosting policy.

No engine code, voxel collision, save/replay format, Wyrmforge V1,
or Character Visibility system changes in this deployment correction.

## 0.0.029 — V2.5 Arch collision lane and Wyrmforge walking-only actor

**iPhone evidence (2026-11-10, lab v0.0.028 · ba5a431):**
Two physical iPhone screenshots show the actor in apparent screen overlap
with the Arch span, at ground level `y=2.00`; user reports that
Arch collision appears not to work, and confirms **no player jump is
needed in Wyrmforge**. These images do **not** include a world-coordinate
X/Z trace or a collision-error report, so they cannot alone prove that
authoritative AABB collision is broken.

**Reproduced geometry/test setup mismatch:**
- The deterministic V2 Arch pillars occupy `X=-5/+5`, `Z=1..3`,
  `Y=2..8`; roof/lintel at `Y=8` with open interior.
- Prior diagnostic actor spawn used `x=-7.5,z=-5.5` for every scene.
  At `Z=-5.5` the character may overlap the arch **on the Hunt
  camera projection** but is physically outside its 3D occupied region:
  walking sideways cannot hit the actual pillars.
- New Arch-specific test spawn uses `x=0.5,z=2.5,searchTopY=6`
  to start **inside the real opening below the roof**, supported by
  the floor at `Y=1`. Other scenes retain the previous spawn.
  X movement toward either pillar must stop with `wallContact=true`.
  Moving through the open depth axis remains a valid route.
- [x] Add a signed 16³/32³ real-scene test on both pillars, arch
  roof, safe supported spawn, wall-blocked movement, and the old
  off-lane crossing case. Tests run at several seeds.
- [x] Actor HUD/benchmark now exposes X/Y/Z world positions,
  `wallContactSteps` and an Arch-specific corridor label.
  On first Arch pillar hit, show explicit collision diagnostic.
- [x] Remove **Jump** button, Space shortcut and gameplay jump
  impulse from the Wyrmforge actor pilot and controller; short
  one-voxel automatic stepping, normal falling and swept walls remain.
  General upward voxel sweeps remain available for bounded *external*
  Physics V2 impulses (e.g. knockback), not a player jump action.
- [x] Replace jump-specific tests with walking-only behavior,
  automatic steps, tall walls, external ceiling impulses,
  edits while walking and platform removal during external movement.
- [ ] The existing Canvas2D actor overlay still renders over the terrain
  on screen. True pixel-accurate partial occlusion / emissive silhouette
  belongs to future **Character Visibility V2**, never to this voxel engine.
- [ ] Await physical iPhone Arch corridor acceptance: enable actor, hold
  LEFT then RIGHT, check `WALL` and X/Z position, verify it cannot pass
  the pillars at Z=2.5. Android and sustained performance remain open.

**Test:** open the new commit-specific V2 lab URL, choose Arch, 32³,
Hunt-style, enable actor, hold right arrow until it stops near
`x=4.72` at `z=2.50`. Move left through the opening and confirm
the negative pillar blocks at `x=-4.72`. Moving up/down along
Z legitimately exits the arch corridor; the status now exposes this
difference. Export the benchmark with `actorPilot.wallContactSteps`
and `actorPilot.actor`. No jump button is shown. Do not claim
complete V2.5 collision or visibility acceptance from this pilot.

## 0.0.030 — iPhone arch-head visual/collider mismatch (V2.5 diagnostic correction)

**Physical iPhone Safari 0.0.029 evidence:** the user supplied screenshots
of the actor approaching both real arch pillars and moving around the
arch at Z≈3.67–4.48. The UI confirms true pillar contacts
(`x=+4.72` and `x=-3.72`, `z=2.50`) and no >50 ms frames in the
short recorded captures. However the *drawn head* appears to enter the
stone span even in visually overlapping but physically disjoint positions.

**Root cause found in source, not a speculative collider regression:**
- Physics V2 uses a correctly bounded AABB at actor feet Y=2, real
  collider height 1.6 voxels, with head/top at Y=3.6.
- At normal iPhone Hunt camera zoom, this height projects to
  `0.48 × 16 × 1.6 = 12.288` backing-canvas pixels; the old Canvas2D
  debug overlay forcibly drew a **30-pixel torso**, then appended a
  head *above* it. Thus the illustrated head was substantially outside
  the collider itself.
- At the pillar, the next shoulder stone begins at Y=5, leaving
  approximately **1.4 voxels of real overhead clearance**. At Z=4.33
  there is no arch stone in the actor's Z footprint at all, even if
  the 2.5D projection makes stone and actor artwork overlap.

**Fix:**
- [x] Draw lab actor head and torso from the **actual projected 1.6-voxel
  collider height**, without minimum-pixel sprite inflation. All visible
  body/head positions remain inside the exact physical vertical span.
- [x] Draw a low-opacity dashed, **3D collision-box debug prism only in
  the Arch lab scene**, from the physical x/y/z half-width and height.
  This is not pixel occlusion, an emissive outline or production character
  art. A subtle foot locator keeps the true-scale proxy discoverable.
- [x] Add a bounded authoritative upward voxel query
  `actorHeadClearance`, showing real overhead clearance (or the 16-voxel
  probe bound) in Arch status and benchmark JSON.
- [x] Pure tests verify projected diagnostic head never extends beyond
  the collider for both mobile cameras, multiple zoom levels and 16³/32³;
  reproduce pillar headroom ~1.4 and screen-overlap without 3D collision;
  verify that removing stone changes headroom immediately.
- [ ] Pixel-accurate visible/hidden character compositing and the thin
  selective emissive outline belong to **Character Visibility V2**,
  a separate future renderer and integration contract, NOT Voxel V2.
- [ ] True gameplay asset dimensions/eye/head collision profiles need
  confirmation during V2.8 Wyrmforge Hunt integration; this is only a
  lab diagnostic shape and first V2.5 physical bounding box.

**iPhone check:** use v0.0.030 commit-specific Pages link and select
Arch / Hunt-style / chunk32³ / seed7. Walk to X≈4.72 or X≈-3.72 with
Z=2.50; the dashed *world-space* box stops at the pillar and the
body/head stays inside the box. The status shows physical headroom
~1.40 voxels. Move out along Z beyond 3: the actor can legitimately
pass around the pillar, even though projected art overlaps the arch.
No production Character Visibility implementation is implied.

## 0.0.031 — V2.6 typed terrain integration contracts (first live slice)

**Physical iPhone validation:** the owner confirmed that v0.0.030's
physics-aligned diagnostic actor and Arch collision setup work. This is
accepted evidence for the V2.5 Arch/pillar/headroom *slice*, not proof
of completed swept-capsule comparison, ten-minute device performance or
production Wyrmforge integration.

**Purpose:** establish **one newly authored, independent V2-native
integration contract** that actual Wyrmforge Hunt gameplay and the future
Physics V2, Lighting V2, VFX V2, Audio V2 and AI/navigation V2 systems can
eventually consume. This is the first **V2.6 milestone slice**, not a
separate roadmap or another UI/replay feature.

- [x] A `V2TerrainPort` facade references the existing **single**
  `VoxelWorld` and **single** `TerrainEditLedger`. No second world, no
  separate collision authority, no renderer-dependent material reads.
- [x] Versioned, synchronous, JSON/structured-clone-safe change events
  (schema `voxel-v2.terrain-change.v1`) emitted once **after each
  accepted edit**. Every notification carries world epoch, ordered edit
  sequence, original edit ID/type, exact world/edit revisions,
  changed-bounds, sorted dirty chunk IDs, partial-damage and geometry
  indicators. A duplicate or rejected edit produces **no** notification.
- [x] Read-only V2 contracts cover material queries, partial damage,
  immutable-by-copy snapshots, authoritative 3D raycast and swept-box
  collision/occupancy; commands still route through the ledger. No V1
  contract, asset or implementation is imported.
- [x] Six **new V2-only adapter fakes** prove that independent gameplay,
  physics, lighting, VFX, audio and navigation consumers receive exactly
  the same ordered stream and can distinguish geometry and partial damage.
  These are not implementations of their respective future engines.
- [x] Subscriber failures do not undo terrain commits or prevent other
  consumers receiving the event. Nested writer calls during notification
  are rejected, subscriptions are bounded, and listeners cannot mutate
  frozen event data.
- [x] Integrate the port into the **actual V2 lab**. The carve button,
  material pulse, 3-hit burst, tap-to-target spell and actor-footprint
  excavation all use the same facade; Reset and replay restore dispose
  prior subscriptions and create a fresh world epoch.
- [x] Benchmark JSON now includes `terrainIntegration` with port
  revision/epoch, published/delivered counts, listener failures, last
  event, and evidence from all six consumer probes. Partial-only edits
  are events even when the renderer has nothing to remesh.
- [x] Tests cover 16³/32³ authoritative queries, duplicate/rejected
  writes, partial stone damage, signed chunk seams, JSON portability,
  subscriber ordering/failure isolation, capacity limits, replay epoch
  isolation and every live lab edit path.
- [ ] **Not yet:** full typed external process transports, cross-worker
  event delivery, backpressure for effect consumers, game-side adapters
  in actual Wyrmforge Hunt, production V2 Lighting/Physics/VFX/Audio/AI
  engines or gravity. These belong to later V2.6, V2.8 and V2.9 work.
- [ ] Full V2.5 device/capsule comparisons and V2.2/V2.3/V2.4 mobile
  performance and destruction gates remain open; passing this contract
  slice does not silently complete them.

**Acceptance on iPhone:** open the commit-specific v0.0.031 lab.
With Arch/Hunt/32³/seed7, enable Actor pilot; do a damage pulse
(which may accumulate partial damage), carve or target a spell, then
export benchmark JSON. In `terrainIntegration`, expect all six
probe counters to advance together for accepted edits; a
partial-only hit must have `geometryChanged:false` and a
destructive hit `geometryChanged:true` with precise dirty chunk
IDs. Test Reset then repeat: `epoch` increases and new subscriber
counts do not include previous-world edits. Existing actor and terrain
performance should remain stable. No Wyrmforge V1 assets or code are
used.

## 0.0.032 — V2.3 true 3D tunnel carving via existing authoritative edit path

**Input:** owner accepted the iPhone **0.0.031** six-consumer V2.6
integration test (18/18 deliveries from three accepted edits, zero
listener failures, p95/p99 frame intervals 18/24 ms, 0 >50 ms hitches
across 1,800 frame samples). The owner explicitly chose **not to
implement structural gravity yet**; it remains a required **V2.9**
milestone under the single Work-derived roadmap.

**V2.3 implementation slice:**
- [x] Add `carve-tunnel` to the **same** revisioned
  `TerrainEditLedger` as `carve-sphere` and `damage-sphere`.
  A capsule-shaped 3D cut follows a segment between two signed integer
  voxel-space endpoints; this is one accepted command/ID, not multiple
  sphere edits with intermediate partial commits.
- [x] Prevalidate the complete command and voxel-scan AABB before
  changing terrain. Enforce **max segment length 16 voxels**,
  **max radius 3.5 voxels**, and a **12,000-cell preflight scan ceiling**
  so a diagonal tunnel can't introduce unbounded synchronous work.
  These are experimental limits, not production performance promises.
- [x] Bedrock material 4 is protected. Previously accumulated partial
  damage is cleaned up for removed voxels. Idempotent command IDs,
  expected world/edit revisions, exact changed bounds, signed chunk-seam
  invalidations and per-voxel authority remain unchanged.
- [x] Journal and portable replay retain the tunnel endpoints; accepted
  tunnel commands regenerate identical terrain for every V2 scene at
  16³ and 32³, without changing the existing replay format.
- [x] A single accepted tunnel emits a single ordered
  `voxel-v2.terrain-change.v1` event through the already wired
  V2.6 port. All six consumer adapters receive it; the existing
  worker/renderer sees only the precise dirty chunk set.
- [x] New **Controls → Destruction → Carve tunnel** action with
  deterministic Hill/Cliff/Arch/Flat fixtures; existing tap-to-target,
  actor physics, game-view camera and 3D collision remain unchanged.
- [x] Report `lastTunnel` with endpoints, radius, removed voxels,
  CPU edit time, changed bounds and dirty chunks; Reset and replay
  restore clear stale per-action diagnostics.
- [x] Regression tests cover continuous diagonal paths, negative seam
  boundaries, invalid/oversize edits rejected pre-commit, protected
  rock, duplicate ID safety, replay round trips, emitted event schema,
  worker/baseline mesh parity and lab integration.
- [ ] **Not yet:** general area, line-damage, crater deformation
  profiles and atomic multi-edit batching; sustained iPhone/Android
  performance measurements with tunnels; frame-budgeted GPU uploads;
  V2.8 real Hunt integration; V2.9 falling structural terrain.

**On-device check:** once version `0.0.032` is deployed, choose
**Cliff** (Hunt-style, seed 7, chunk 32³), select
**Controls → Destruction → Carve tunnel**. The cliff should gain
a visibly traversable 3D bore / breach. Try the Inspection camera to
see its interior and **Actor pilot** to check real post-edit collision.
Export benchmark: `lastTunnel.removedVoxels>0`,
`lastTunnel.dirtyChunks` lists only affected chunks,
`terrainIntegration.lastChange.editType === 'carve-tunnel'`,
all six consumer counters advance together, and `rendererError`
remains null. This is the first small V2.3 tunnel acceptance slice.

## World-first Wyrmforge Hunt product alignment — 2026-11-10

**Owner product clarification:** the clean-room V2 voxel engine serves
Wyrmforge (mobile-first gothic 2.5D action roguelite), **not** an
ever-growing test laboratory. Every real Hunt arena must be generated
from a deterministic seed but visibly and physically themed to its
chosen **world-map location**: organic forests, wetland trails,
mountain passes, cliffs, monastery entrances, burned approaches,
Wyrm lairs and boss spaces. Local variety must preserve the
site's entry/exit ports, landmark identity, legal routes and
encounter objectives.

Both the player and enemies/Wyrms can use magic to damage
**material voxels and physical objects** (trees, destructible props,
cover, structures). Damage must be authoritative: stable target IDs,
real material/health rules, committed occupancy changes,
collision/LOS/navigation invalidation, deterministic replay and
localized VFX/lighting, not an overlay illusion or duplicated
simulation authority. Required routes/spawns/objectives may be
explicitly protected or revalidated; do not trap the player.

**Evidence:** inspected Wyrmforge's current canonical 2.5D vision
and the C# geography, site-landscape, arena terrain, prop and
player/enemy impact code as product requirements. The existing C#
game is **not** an implementation template or imported V2
dependency. V2 starts independently with new contracts, selected
material pitch and world-seeded generation.

**Roadmap correction:** V2.0–V2.7 remain the foundation,
V2.8 must demonstrate **real map location → generated themed
arena → player/enemy combat destruction** in actual guarded Hunt,
V2.9 remains mandatory structural gravity **later**, V2.10
full-game mobile acceptance. See
[the integration acceptance target](WYRMFORGE-HUNT-WORLD-TARGET.md)
and [the single roadmap](ROADMAP.md). The next substantive
implementation should be a new site recipe + location-appropriate
generation foundation, not another laboratory-only destruction button.

**No software capability marked complete by this documentation update.**

### Research and limitations

The 75-document [research ledger](RESEARCH.md) and [architecture decisions](ARCHITECTURE-DECISIONS.md)
guide all decisions. Its evidence is not a measured guarantee of mobile performance.
V2 0.0.007 has an initial WebGL2 solid-face preview with a Canvas2D fallback. It is **not** the finished
pixel-art terrain renderer: material atlas, greedy meshing, sustained mobile testing and context-loss device acceptance remain open.
Chunk size 16 is experimental, not a final optimized choice.

### Current change: 0.0.032

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

**Next small step:** implement and unit-test committed-voxel player grounding and swept capsule/AABB collision (V2.5), then close outstanding V2.2/V2.3/V2.4 device/performance gates. Verify deployment and complete device evidence before claiming any foundation milestone accepted. See the [single authoritative Work-derived roadmap](ROADMAP.md).

## V2 0.0.033 — V2.4 budgeted worker-result GPU uploads (foundation slice)

- Worker mesh replies now stage bounded dirty-chunk uploads instead of uploading the entire batch in the worker message callback.
- The animation frame drains a 2 ms CPU-time budget, with at least one chunk per frame. WebGL bufferData is non-preemptible; individual large chunk uploads can still exceed the budget.
- Cancel/reset/new edits discard staged derived geometry, while the authoritative voxel ledger and collision queries remain immediately committed.
- Export reports pending upload chunks/CPU mesh bytes and queue peak; completed worker updates record edit-to-visible CPU-side completion latency.
- Node tests cover frame-budget draining, negative chunk IDs, cancel/reset and queue cap.
- **Not accepted yet:** physical iPhone/Android sustained tests, WebGL context-loss during partial uploads, GPU driver timing and complete V2.4/V2.7 gates. Baseline synchronous mode remains intentionally unchanged.

## V2 0.0.034 — incremental WebGL2 context recovery (V2.4)

- On WebGL context restoration, retain authoritative CPU mesh sources but re-upload them incrementally through the existing 2 ms/frame scheduling path rather than synchronously uploading the entire scene.
- Dirty chunk replacement removes corresponding pending recovery entries to prevent stale geometry resurfacing; full scene reset clears recovery work.
- Report recovery queue chunks and pending bytes. Regression tests simulate loss/restore, dirty replacement during restore, and scene reset during restore.
- Still open: device-level context-loss test, measured p95/p99 burst edit latency, sustained memory trend and remaining V2.4 gate evidence.
