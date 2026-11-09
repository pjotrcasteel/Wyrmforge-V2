# Voxel V2 — research synthesis and architecture decisions

Date: 2026-11-09
Evidence: [75-document research ledger](RESEARCH.md). Research/documentation gate complete; empirical performance and device acceptance **not** complete.

## Owner override — V2-only, zero V1 reuse

Voxel V2 is a **ground-up implementation**. No V1 code, assets, shaders, internal interfaces, algorithms, data schemas, physics, terrain constants or runtime dependencies may be copied, wrapped, imported or used as the technical baseline. New V2 engines connect only through new V2-native contracts. V1 remains untouched. The [ROADMAP.md](ROADMAP.md) clean-room mandate takes precedence over older integration wording in this research synthesis. Existing prototype code requires a dependency audit before V2.0 acceptance.

## Decisions for the isolated foundation

| ID | Decision | Rationale / verification |
| --- | --- | --- |
| ADR-01 | Keep one authoritative, integer-addressed 3D voxel store with Euclidean chunk coordinates. | Prevent negative-boundary divergence; test every axis and neighbor boundary. |
| ADR-02 | Start with sparse empty/uniform/mixed chunks and compare 16³ vs 32³. | Optimize for edit throughput and memory, not compression ratio alone; benchmark both. |
| ADR-03 | Keep rendering derived from immutable voxel snapshots; benchmark exposed-face vs greedy meshing. | Fragmented terrain changes geometry efficiency; measure build+upload+visible latency. |
| ADR-04 | Use one ordered command writer; deduplicate IDs in a documented bounded scope; version every chunk and world epoch. | Preserve accepted edits under retries, worker races, resets. |
| ADR-05 | Bound job count, snapshot bytes, edit size and GPU upload/disposal time. | Background meshing alone cannot prevent main-thread hitches or memory growth. |
| ADR-06 | Use committed voxel queries and 3D DDA for raycasts; compare swept AABB vs capsule approximations. | Overhangs and holes defeat universal height queries; no mesh-authoritative collision. |
| ADR-07 | Save versioned snapshots plus ordered accepted edits; compare canonical state hashes. | Deterministic terrain state is distinct from cross-platform floating-point actor simulation. |
| ADR-08 | Baseline WebGL2 with context-loss recovery, cancellation-safe pointer input and optional GPU timers. | Do not require WebGPU, shared memory, cross-origin isolation or native APIs. |
| ADR-09 | Build an independent V2 engine with no V1 runtime, asset, schema or technical-constant dependencies. | V2's own coordinate, rendering and gameplay contracts are selected independently; any later migration is separate. |
| ADR-10 | Use one Pages deployment owner or a truly separate preview host. | Two whole-site deployers and cached artifacts cannot prove latest-production preservation. |

## Benchmarks required before architecture promotion

- Both chunk sizes on identical seeded flat/hill/cliff/arch and heavily fragmented volumes.
- Exposed-face and greedy meshing: CPU duration, triangles, upload bytes, draw calls, p95/p99 frames, edit-to-visible latency.
- Rapid cross-chunk explosions with worker completions reordered; compare committed voxel hashes and visible mesh revisions.
- Long destruction/reset cycles, worker cancellation, GPU context loss, background/foreground, touch cancellation.
- Ten-minute real iPhone Safari and Android Chrome runs; record browser/device, resolution, frame percentiles, hitch counts, input latency and memory estimates.
- Production Pages route + other routes checked after experimental deployment, and vice versa; no live URL claim until confirmed.

## Explicitly deferred

Octrees/DAGs/brickmaps, WebGPU compute, density-field meshing, LOD/Transvoxel, flowing liquids, automatic collapse, advanced lighting, full enemies, complex rigid-body physics and production Hunt migration.

## Evidence quality and caveats

The ledger contains **75 distinct reference documents**, not 75 independent authors, engines or benchmark studies. Multiple MDN, Godot, Apple, Android and GitHub documents share publishers. Hardware- and API-specific claims are not transferred to browser mobile performance without measurements. No phone or deployment verification has been performed by this research.

## Immediate next work

Resume V2.0 only: secure isolated publication ownership, instrument frame-time/export and deterministic stress scenes, add tests and visible build identity. Record test outcomes in PROGRESS.md. Do not mark V2.0 accepted until live production preservation and physical-device checks pass.
