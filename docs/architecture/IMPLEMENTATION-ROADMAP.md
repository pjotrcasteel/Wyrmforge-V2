# New V2 implementation roadmap — C# clean-room tracks

**This document supersedes the archived JavaScript implementation ordering for the NEW C# work only.** Keep historical task IDs and issues as evidence, but do not claim their JS completions satisfy new C# gates.

## R0 — archival and architecture (this PR)

- Entire historical V2 JS tree in old/, retaining exact Git blob contents.
- Brand-new C# contracts and separate engine projects; no old source compiled.
- One-way dependency graph and architecture/first-Hunt parity documented.
- Placeholder world = primitive geometry + HEX colors throughout development.
- Independent C# terrain occupancy and deterministic placeholder WorldGen smoke behaviour.
- CI validates C# build/tests once merged; no Pages deployment until a real Blazor WASM host exists.

## R1 — authoritative C# loop + swappable frontend

- First fixed-step C# session with commands, immutable revisioned scene/view snapshots and replay state hash.
- Blazor WASM Pages frontend renders C# world as rectangles, capsules and other basic color primitives.
- A headless fake frontend receives the **same** snapshots without changing game outcome.
- Validate C# core can execute in an installable iOS and Android host probe, using the same source (renderer/framework selection still provisional).

## R2 — physical world

- Sparse 3D voxel chunks, 10x10x10 microcells, terrain edits + replay, derived meshes and full collision queries.
- Real C# Physics, World Objects, navigation, support/gravity, streaming and seeded expedition geography.
- A single Fireball creates matching terrain, collision, nav, fluid and presentation changes.

## R3 — minimal complete Hunt

- Fire Tier I start -> live connected seeded expedition -> escalating horde -> choices/branch -> Ashfang phases -> extraction or defeat -> persisted progression.
- Pack and special enemy capability rules implemented through independent AI/Encounter/Physics contracts.
- Placeholders ONLY: HEX colors and shapes across all environments/actors/bosses.

## R4 — richer simulation

- Water and lava solver, physical tree/prop destruction, diverse biomes/corruption, structural gravity and complex miniboss/rare encounters.
- Multi-region, large-scale runtime streaming and bounded memory/CPU/GPU performance.

## R5 — native parity and release

- Native iOS/Android renderer and input/storage/lifecycle adapters; same C# core; full Hunt parity.
- Real-device 60 FPS target / quality tiers, sustained battery/thermal/latency evidence, crash/resume, accessibility and shipping pipeline.
- **Only after R3 gameplay is accepted and R4/R5 performance gates are satisfied may the placeholder visual rule be reconsidered.**

## Mandatory status template per engine PR

Owner; Contracts; Implemented functionality; Headless tests; Cross-engine tests; Pages rendering; iOS/Android status; Performance measurements; Open gaps; Next task. Say **SCAFFOLD** until actual functions are implemented, no matter how many files exist.
