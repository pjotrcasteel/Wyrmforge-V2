# L10-02 — Local Hunt lighting preview

This is the first visible Lighting V2 slice: local rock contact/crevice shading and warm diffuse lava spill. It consumes physical terrain queries and live wet lava surfaces. No fluid transport, amounts, terrain occupancy or material texture is changed.

## Ownership and bounds

`LocalLightField` accepts a read-only height callback, epoch/revision, actor location and an existing fluid surface snapshot. The Hunt composition supplies a public terrain-port raycast; Lighting never imports Voxel or the fluid solver. Materials owns `molten-presentation.mjs`, including the exact existing fluid display colours and relative emission. The fluid renderer now references those same display constants without changing its calculations; the solver and WAT-12 buffer/ripple work are untouched. Legacy authored terrain lava motifs remain a separate material variant, not a second simulation.

The field covers 24×24 m near the actor. Up to 24 columns are processed per frame. Height sampling uses a 32 m downward ray starting 16 m above the actor, including physical microvoxel hits. The next phase processes up to 24 irradiance cells/frame, searching at most 49 nearby lava columns each and two height-line occlusion samples per candidate. It uses a maximum-combination falloff, not an unbounded sum of lava lights. Spill radius is 3.5 m. Water supplies no emission. Still-valid field data stays visible while walking into the next six-metre window; epoch/revision changes immediately discard stale lighting and rebuild. Unchanged heights are reused for liquid refreshes, no more often than 500 ms after a publication.

A published RGBA32F nearest-sampled texture is 9,216 bytes. Rendering owns it, reuploads only on a new publication, reuploads the Hunt-retained CPU field after context loss and deletes the GPU texture on disposal. Pending/published CPU buffers are bounded. The shader uses four cardinal height samples for local ambient occlusion, bilinear irradiance and a two-metre edge fade. Missing field data returns the exact baseline. Fields without lava skip the irradiance sampling branch. Occlusion darkening is capped at 28%; warm spill is bounded and attenuated by vertical separation. No camera-facing glow sprite or screen-space halo is added.

This is a local height-field/indirect-light approximation, **not directional shadows or full voxel light transport**. Centre-of-column height sampling cannot describe stacked caves/overhangs. The conservative two-sample height test can miss thin barriers. Terrain edits can briefly revert the local area to baseline while the bounded rebuild finishes. Unknown/unhit columns remain unlit. Camera rotation does not change field placement. The normal route and destination picker use the same composition; the field only operates on currently published terrain.

## Cost and validation

`node scripts/benchmark-local-light-field.mjs` generates the actual seeded lair, initializes real terrain and lava, and builds a field near a wet source using the public port. The committed run measured CPU work p50 0.233 ms, p95 0.987 ms and max 2.399 ms over 48 bounded update calls; it published 317 warm columns. These are workstation measurements, not phone costs. Raw evidence is `evidence/l10-02-local-field-cpu.json`.

Actual assembled baseline/local shaders compile, link and draw with an active float field in GLES3. The software llvmpipe witness at 402×604 measured stone top 0.764→1.404 ms and side 0.821→1.545 ms per draw. Active output differs as intended; this is a synthetic exposed-plane material/field fixture, not an in-game screenshot or mobile GPU benchmark. Raw batches are `evidence/l10-02-active-gles-cost.json`. CI compiles the local variant as well as baseline/unlit/fluid variants. Tests cover work limits, cached queries, signed windows, source falloff, water exclusion, ridge blocking, missing terrain, revision/epoch invalidation, walking-window continuity, one upload per publication and context restoration.

Hunt reports now contain `performance.localLightingCpu`. Check this alongside frame intervals, total CPU work and fluid geometry. Reported lag remains open until fresh real-device evidence; this preview does not claim it fixed.

Automated validation: 801 tests pass, dependency audit and diff checks pass; static runtime graph has 155 modules / 220 edges and no cycles.

## Review

Open the regular Hunt or `play-hunt.html?route=highland&stop=9` and approach a lava bank or cliff toe. Compare the same location with `&lighting=off`, which selects the independent baseline shader and skips field updates. Confirm depth/readability, warm rock spill, stable walking transitions, crater response and frame cost. No new visual/mobile acceptance is implied by automated checks. Follow-up scope is guided by that review; generated overhangs remain F07-04 #348.
