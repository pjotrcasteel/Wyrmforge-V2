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

### Research and limitations

The 75-document [research ledger](RESEARCH.md) and [architecture decisions](ARCHITECTURE-DECISIONS.md)
guide all decisions. Its evidence is not a measured guarantee of mobile performance.
This version still uses a top-only Canvas2D diagnostic shell, so it does **not** demonstrate solid voxel
faces or final pixel-art rendering. WebGL2 camera/meshing is V2.2, after the V2.0 and V2.1 gates.
Chunk size 16 is experimental, not a final optimized choice.

### Current change: 0.0.005

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
