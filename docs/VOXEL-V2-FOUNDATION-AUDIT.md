# Voxel V2 foundation acceptance audit — 2026-11-10

**Status:** In progress; this is an evidence audit, not a claim that all original V2.0–V2.7 gates are accepted.

**Sources reviewed:** current main branch: docs/ROADMAP.md, docs/PROGRESS.md, docs/VOXEL-V2-DELIVERY-GATES.md, .github/workflows/pages.yml, src/terrain-worker-session.mjs, src/webgl-voxel-view.mjs, src/replay-file.mjs, tests/ directory; iPhone Safari 0.0.047 report supplied by owner.

## Evidence matrix

| Area | Repository evidence | What remains unproven / next action |
| --- | --- | --- |
| V2-only isolation | CI checks a list of forbidden import path patterns | Audit *all* source/static asset provenance and transitive imports; current grep is not a comprehensive dependency audit |
| Authoritative voxel store | voxel-world.mjs; voxel-world.test.mjs; chunk-local-remesh.test.mjs | Consolidate deterministic cross-chunk stress evidence against original thresholds |
| Destruction and replay | terrain-edit-ledger.mjs supports sphere, tunnel, crater and bounded area damage; replay-checkpoint.mjs; replay-file.mjs; tests/terrain-spatial-shapes.test.mjs | Complete physical cliff/crater/replay verification and long-running repeated edits on both mobile browsers |
| Worker meshing | terrain-worker-session.mjs; terrain-mesh.worker.mjs; protocol tests | Verify actual worker-mode use and bounded queues under sustained device workload; latest 0.0.047 report used **sync** meshing |
| GPU uploads/recovery | webgl-voxel-view.mjs; gpu-upload-budget.test.mjs; webgl-local-updates.test.mjs | Physical device context-loss/recovery evidence and peak memory under long sessions; latest report has zero context losses, not a recovery test |
| Collision | collision-fixtures, dynamic-collision-benchmark, terrain-actor tests | **0.0.047 iPhone 3/3 dynamic cases passed**, zero overlaps/errors, 4-voxel drop and stable landing at 16/32 chunk boundaries; this does not prove every future prop/collision scenario |
| Event/consumer boundary | terrain-integration-port.mjs; terrain-consumer-probes.mjs; engine-runtime.mjs and tests | Validate production adapter replacement, lifecycle and stale-event isolation when integrated; PR #56 is a composition seam, not live bootstrapping |
| Mobile frame time | frame-metrics, sustained-telemetry, spatial-benchmark | Gather representative 3-minute iPhone and Android runs with destruction, worker mode, recovery and memory estimates; 0.0.047 sample was ~1 second and cannot establish sustained performance |
| Texture/material pipeline | solid material colors in WebGL2 renderer; no evidenced atlas/UV texture path | Next visual implementation after critical foundation gaps: tileable grass/dirt/stone, per-face mapping, mip strategy, distance and seam tests |
| World objects / biomes | Hunt world target specifies stable-ID props and site recipes | Not yet implemented; retain later gates, do not start unrelated engine development |
| Structural gravity | docs/VOXEL-GRAVITY-V2.md | Original later V2.9 scope; explicitly deferred, not dropped |

## Immediate implementation order

1. Improve V2-only dependency/static asset provenance audit to prevent accidental coupling before material assets arrive.
2. Confirm worker mode and context recovery through reproducible acceptance scenarios; close outstanding foundation blockers.
3. Begin the smallest grass/dirt/stone material rendering slice with tests, not an unrelated renderer rewrite.
4. Follow docs/VOXEL-V2-DELIVERY-GATES.md for physical objects, destruction, site generation and mobile release.

**Course guardrail:** a lab build number is not a milestone acceptance certificate. Only mark a gate complete with code tests plus required physical-device evidence. No V1 code or assets.

## Updated V2.3 implementation evidence — 2026-11-12

The same synchronous TerrainEditLedger now accepts *real* 3D downward crater
excavation (`carve-crater`, maximum depth six) and bounded cuboid material
damage (`damage-area`, maximum 9×9×9 scanned voxels), alongside existing
spheres and tunnels. The world store remains the sole collision/raycast and
meshing authority. Both new shapes retain the single-command preflight,
material resistance/bedrock protection, dirty-neighbor invalidation, duplicate
ID safeguards and replay-compatible canonical edit journal.

A **Carve crater** control in the independent V2 lab runs the existing worker
and GPU path; per-scene targets are deterministic fixtures, not a procedural
world generator. The V2.3 shape acceptance tests cover geometry, replay,
partial damage, V2.6 notifications and localized worker output at 16³/32³.

**Acceptance still open:** device-confirmed appearance, destruction edit-to-
visible timing and sustained mobile memory/frame metrics. These tests close
a missing implementation capability; they do not certify the V2.3 or V2.7
release gates in full.

## V2.7 worker watchdog and V2-only asset audit — 2026-11-12

Implemented protection against two concrete acceptance blockers:

- Both V2 browser hosts now check the existing single-in-flight worker
  controller once per animation frame. Warmup must complete within 15 s and
  individual meshing jobs within 30 s of **foreground** activity. A silent
  worker is terminated, queued state is released, late replies remain inert,
  and the existing failure path is used. Hidden-tab time is excluded via a
  visibility-driven pause/resume clock; this does not introduce polling
  timers, extra worker pools, or a second terrain writer.
- Clean-room dependency auditing now resolves literal `new URL(...)`
  module assets, standalone CSS `url(...)`/`@import`, inline CSS and HTML
  responsive `srcset` paths. It also checks every browser entrypoint against
  importing Node builtins and rejects private package imports beginning with
  `#`. No V1 assets or shaders are imported for this change.
- Deterministic tests cover both watchdog deadlines, no false timeouts
  during backgrounding, late-job rejection and worker recovery, plus
  mismatched/missing/out-of-repository static assets.

**Still not accepted:** p95/p99 and measured memory on physical iPhone Safari
and Android Chrome, real GPU context-loss recovery, representative Hunt
workload, pixel-readability screenshots and owner-approved material visuals.
The watchdog thresholds are conservative failure limits, not promised
edit-to-visible latency or universal performance guarantees.
