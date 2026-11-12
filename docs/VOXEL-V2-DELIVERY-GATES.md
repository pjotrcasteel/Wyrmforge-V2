# Voxel V2 — delivery gates and session course guardrail

**Decision:** 2026-11-10. **Status:** Active. **Owner priority:** Finish the standalone voxel engine before implementing any other V2 engine.

This is the short execution companion to [the authoritative roadmap](ROADMAP.md), [the Hunt world target](WYRMFORGE-HUNT-WORLD-TARGET.md), and [ADR-0001](architecture/ADR-0001-replaceable-engines.md). It does not replace the original V2.0–V2.9 milestones or silently waive their acceptance gates.

## Scope discipline

- Only implement work that contributes to a missing voxel-engine acceptance gate or its eventual Wyrmforge Hunt usage.
- The lab is a test harness, not a second game. No lab-only mechanics, unrelated UI polish, or real-time tunnel-generation gameplay.
- Do not copy V1 code, assets, constants, or runtime dependencies.
- Keep voxel terrain authoritative and engine-neutral. Other V2 engines are *consumers of contracts*; do not implement them yet.
- An environmental-object module is replaceable: the voxel engine provides placement/spatial/terrain interaction contracts; stable-ID trees, boulders and props own their independent damage state. Gameplay owns combat and drops.
- Maintain bounded work and mobile frame/memory budgets. Do not trade mobile performance for cosmetic detail.

## Sequence and exit gates

| Gate | Work | Required proof |
| --- | --- | --- |
| 1. Foundation audit | Reconcile original V2.0–V2.7 acceptance criteria against latest code and physical-device evidence; complete outstanding worker, renderer recovery, replay, collision, import audit and mobile checks | Per-gate checklist with test links, exact commit and explicit remaining gaps; do not equate a feature or lab version with a whole milestone |
| 2. Material pipeline | V2-native material registry, tileable grass/dirt/stone surfaces, per-face UVs, atlas or array sampling, mip/filter strategy, deterministic variations | Seam tests, top/side/bottom correctness, camera-distance readability, iPhone GPU/memory/frame evidence, no V1 assets |
| 3. Physical environment objects | Stable-ID tree, boulder, shrub and rock descriptors; deterministic placement, spatial indexing, valid terrain anchoring, collision representation | Objects are spatially coherent, survive save/replay, and do not become hidden nonphysical blockers |
| 4. Destruction integration | Terrain and eligible objects damaged by the same player/enemy impact intent; bounded updates to derived geometry, collision, navigation notifications and visuals | Deterministic tests for both factions, idempotency, stale events, chunk seams, object/terrain contact and unchanged required routes |
| 5. World-shaped generation | Site-recipe-driven forest, transition, mountain, scorched approach and lair; grouped woodland, cliffs, paths and landmarks | Multiple deterministic seeds, world-site identity, valid spawn/objective/exit connectivity, readable Hunt camera |
| 6. Mobile release candidate | Long-duration iPhone Safari and Android Chrome tests, destruction stress, context loss/recovery, memory stability, touch, replay and representative terrain/object density | Published immutable build, reproducible JSON evidence, no blocking visual or physics corruption, all original foundation gates resolved |

**Structural gravity:** remains a separate explicitly planned V2.9 requirement in the original roadmap; do not silently remove or implement it early. The numbering above is an execution order, not a renaming of existing milestone IDs.

## Fire Tier 1 visual asset approval workflow (owner decision 2026-11-11)

This workflow starts **after the voxel foundation acceptance gates**, not as a shortcut around them.

- Review owner-provided V1 textures, trees, stones and props **as visual references only**. Recreate selected designs as new, independent V2 assets; never import V1 runtime code or directly depend on V1 asset paths.
- Supplement the references with additional visual research when useful, preserving a clear V2-native provenance record for each authored asset.
- Work on **one asset at a time**, beginning with Fire Tier 1 terrain materials before moving to separately represented interactive trees, boulders and props.
- For each terrain texture, present the **actual 64×64 pixel asset** in chat alongside a **zoomed-out repeated tile grid** showing seams, visual rhythm and gameplay-distance readability. Include relevant face/variant previews where needed.
- Wait for **explicit owner approval of that specific asset** before adding or merging it into the V2 repository. A preview or draft is not approval.
- After approval: integrate through the replaceable material/object contracts, add appropriate tiling/UV/asset tests, run CI, merge only when green and verify deployment. Then repeat with the next asset until the Fire Tier 1 set is complete.
- Trees, rocks, shrubs and other interactive world objects are **not flattened into ground textures**; they have independent placement, collision and destruction state.

## Current verified evidence (2026-11-10)

- v0.0.047 on iPhone Safari: dynamic collision suite 3/3, 0 overlaps, 0 errors, stable landing after four-voxel drop across both 16 and 32 chunk boundaries; this verifies *that suite*, not every original foundation gate.
- PR #56 merged: v0.0.048 introduces engine-neutral composition/lifecycle tests. This is infrastructure only; the live app is not yet bootstrapped through that composition root.
- Texture/material art, object representation, biome generation, and mobile acceptance are not complete.
- Prior short benchmark reports cannot substitute for sustained mobile performance evidence.

## Every development session must

1. Read this document, ROADMAP.md, WYRMFORGE-HUNT-WORLD-TARGET.md, ADR-0001 and the relevant implementation/tests before changing code.
2. Identify **one** currently unproven gate and its acceptance test. Prefer completing an existing gate over creating another subsystem.
3. Implement the smallest useful vertical slice, add deterministic automated tests, run CI, merge only when green, and verify deployment before asking for device testing.
4. State the actual commit/build, what was tested automatically, what still needs physical-device evidence, and the **single next step**.
5. Update the gate status here when new evidence arrives; do not mark a gate complete based on a test that exercises only one fixture.

## Next engineering action

**Audit the outstanding original foundation gates against the current repository and collected device evidence.** Then implement the first missing foundation acceptance item. Once gates are genuinely satisfied, start the grass/dirt/stone material pipeline with a single texture-atlas + per-face UV vertical slice. Do not begin another engine.


## Hunt-scale ambush performance fixture (2026-11-11)

The standalone lab includes a **hunt-load** scene (96×96 horizontal cells, 32 chunks at 32³, 1,048,576 bytes of voxel payload). This is a bounded comparative stress fixture, **not** a final Hunt map dimension or evidence of final device performance. The V1 ambush performance notes describe 18 simultaneous fissure points and expensive terrain repaint/crowd rendering; the V2 fixture will exercise that pressure using new V2-native impact commands and worker/GPU queues, without importing V1 code or VFX. The scene can be selected manually now; automated staged ambush impacts, enemy proxies, and sustained phone acceptance are separate unfinished gates. Do not confuse terrain-only performance with full ambush FPS.


### V2-native ambush terrain stress benchmark

The lab's **Run V2 ambush stress (3 × 18)** action resets to the 96×96 hunt-load scene with 32³ chunks, Hunt camera and background worker meshing. It submits three waves of 18 deterministic terrain damage targets at 650 ms intervals, with a 3.5-second wave boundary, and waits for the final worker and GPU queues to drain before exporting the JSON benchmark. The export contains `ambushScenario`, frame metrics, worker state, queue peaks and sustained telemetry. Backgrounding, renderer failure or loss of worker mode stops the run without a pass claim. This is **terrain-only**: no enemy AI, crowd rendering, fissure VFX, particles or lighting; the actual V1 ambush must be measured separately before declaring full-game acceptance. 96×96 is a lab stress size, not the locked production Hunt dimensions.

## V2.7 async world-presentation safety batch — 2026-11-12

This batch extends the existing foundation; it does **not** declare V2.7 or the
mobile foundation complete.

- WebGL's `sceneEpoch` changes on every validated full-scene activation,
  including reset and verified checkpoint restoration. Worker-derived GPU
  replacements may supply the epoch captured when work started; stale updates
  then fail closed without changing queues or drawing old-world geometry.
  Worker jobs still use their separate host-owned **terrain event epoch**.
- An invalid full-scene activation is atomic: it leaves the preceding live
  scene and its queued replacements intact instead of erasing valid work.
- The external terrain host passes its renderer generation into delayed
  localized worker completions. WebGL context restoration no longer erases an
  existing worker/replay error, and the diagnostic status exposes rejected
  stale GPU updates.
- Each background mesh result is bounded to 16 MiB of actual typed-array
  payload, validated against declared per-mesh and whole-reply byte counts.
  The external scene bridge additionally bounds its accumulated CPU-side
  staging to 64 MiB before publishing a complete scene; overflow fails
  closed rather than partially replacing the visible world.
- Automated tests cover equal chunk IDs across distinct worlds, recovery
  interrupted by replacement, rejection without queue mutation, invalid
  scene activation, retained partial worker staging and malformed output
  accounting, plus real 32³ high-surface-area mesh expansion.

**Still required before foundation acceptance:** production-size sustained
physical iPhone Safari / Android Chrome evidence, performance and memory
trend under repeated destructible impacts, GPU context-loss/recovery on
physical devices, and the original outstanding V2.2–V2.7 delivery gates.
The per-worker and scene staging bounds are protective limits, not measured
frame-rate guarantees. The lab remains a diagnostic host; these changes do
not introduce additional game engines or V1 runtime assets.
