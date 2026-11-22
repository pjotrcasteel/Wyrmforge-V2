# L10-02 readability correction — 2026-11-18

Owner review of `cb1303a`: difference was difficult to notice. The lighting preview remains **NEEDS PLAYER REVIEW**.

## Findings and correction

The normal seeded Wyrm Lair route starts about 40.5 m from its nearest initially wet lava cell. The previous review link therefore did not immediately show the main effect. `lightingTest=bank` now selects the existing physically supported dry-bank spawn in the same actual Hunt; normal route entry, world generation, physics and fluid state are unchanged. The paired comparison is the same URL plus `lighting=off`.

The CPU field also used a column's top height when deciding light range, excluding tall banks whose lower cliff face should still receive light. Intermediate path tests could reject the receiving column itself. The field now records horizontal irradiance potential and source height, skips source/receiving columns as intervening blockers, and leaves vertical attenuation to the shader at the actual fragment height. A regression checks a six-metre bank beside low lava; the existing ridge-blocking test still passes.

Spill has a smooth falloff to the same 3.5 m radius. Reflected intensity rises from 0.55 to 1.65, with exponential falloff by actual fragment/source height. Cavity shading rises from 28% to a 42% maximum. This changes lighting contrast, not rock texture or geometry. The field remains 24×24, 9,216 bytes, and capped at 24 processed columns/frame. No extra world queries, GPU textures or shader texture taps are introduced. This does not imply identical GPU timing: the shader's attenuation math changes.

## Evidence

The exact seeded Play Hunt preview recipe and supported bank spawn were regenerated. The bank is (-21.5, 15.00001, -11.5). Its field contains 314 warm columns versus 285 previously, with mean positive irradiance potential 0.767 versus 0.589. These are field values, not light emission added to every pixel.

The actual generated terrain/microvoxel mesh was rendered with the Hunt camera through assembled before/after GLES programs, each using its corresponding before/after field. Both compile/link/render with zero GL error. A depth-tested terrain-only capture changes 91,833 of 242,808 visible terrain pixels; 58,467 have at least one RGB channel change of 12/255 or more. This is an inspected terrain render, not a browser/phone capture; actor, objects and raised-fluid presentation layers are omitted. No AI imagery is used. Raw metrics: `evidence/l10-02-readability-contrast.json`.

The limited software-renderer timing witness records three single-draw batches, with substantial variation: before median 17.259 ms, after 19.446 ms for the complete generated mesh. It is not a phone performance claim or a statistically established regression/improvement. Raw batches: `evidence/l10-02-readability-gles-cost.json`. The CPU benchmark now uses this exact preview recipe and bank spawn; current timings are in `evidence/l10-02-readability-cpu.json`, reproducible with `node scripts/benchmark-local-light-field.mjs`.

Hunt reports now include field identity, pending state, emission availability and the review preset alongside `performance.localLightingCpu`. Previous reports lack these details; obtain fresh device evidence for appearance, readiness and frame cost.

## Playable review

`play-hunt.html?route=highland&stop=9&lightingTest=bank`

Baseline: same URL plus `&lighting=off`. Both use the same physical bank spawn. Inspect the nearby rock face and cliff recesses, then walk and cast near the bank. Full directional shadows and cave/overhang light transport remain outside this local approximation. Earlier mobile lag acceptance is still open.
