# L10-02 ambient contrast — 2026-11-18

Owner approved the visible lighting direction and requested more contrast. This pass adds a separate scene-wide ambient environment, keeping reflected lava spill at its previous strength. The material artwork and fluid simulation are unchanged.

## Contract and integration

`src/lighting/environment-contract.mjs` owns `wyrmforge.lighting-environment.v1`. It produces copied immutable linear ambient RGB and normalized daylight data. Daylight 1 is neutral `[1,1,1]`; darker environments transition towards cooler `[.52,.62,.76]`. Explicit RGB overrides are bounded to [0,2]. Invalid daylight, non-finite channels and unsupported descriptor versions are rejected.

Play Hunt converts its existing destination corruption/daylight profile into this Lighting-owned descriptor once when opening the route. The Wyrm Lair's daylight .45 yields linear ambient `[.736,.791,.868]`. Regular streamed Hunt currently defaults to daylight 1; this pass does not invent streamed biome/environment state. Rendering receives the descriptor and uploads one RGB uniform. Lighting owns its interpretation; Voxel, WorldGen, Materials and Fluids acquire no dependency on it.

The local shader applies the ambient factor to the baseline reflected component before checking field availability. Explicit surface emission is preserved through this ambient operation. Lava spill is then added as before. Thus the ambient setting is consistent across the whole scene, including outside the 24×24 local field: moving field boundaries cannot introduce a new ambient halo. Full-daylight and diagnostic baseline rendering remain unchanged. The off comparison uses the independent baseline shader.

There are no extra terrain queries, source searches, GPU textures, field bytes or fragment texture taps. Existing 24-column update work, 3.5m spill radius and cavity cap are unchanged. This establishes an explicit environment input; it does not add full directional shadows, a sun cycle, prop relighting or cave light transport.

## Evidence

The assembled old/new GLSL programs compile, link and render with an active float field from the actual seeded preview bank. In the neutral `[1,1,1]` setting, output matches every RGBA byte across stone top, stone side, grass top and bedrock side fixtures. With the actual lair ambient, the reflected background dims/cools while the warm contribution stays independent. These are material-plane GLES witnesses, not phone/browser screenshots or complete scene acceptance.

Mesa llvmpipe at 402×604, seven alternating batches of 12 synchronized draws: active lair medians were stone top 1.512→1.557 ms, stone side 1.401→1.397 ms, grass 2.012→2.060 ms, bedrock 1.829→1.850 ms. Variation does not establish a mobile improvement/regression. Raw samples: `evidence/l10-02-contrast-environment-gles.json`; neutral identity witness: `evidence/l10-02-neutral-environment-gles.json`.

Tests cover daylight neutrality, cooler dim-region ambient, retained detail floor, copied/immutable values, invalid input, renderer binding and rejected schema versions. The pure environment contract is included in the reverse-dependency guard. Hunt reports include the selected environment for device comparisons. WAT-13 `4fbe3b2` region-checkpoint and WAT-14a `1c6952f` streamed channel work are integrated intact; no fluid implementation files are changed.

Validation: 813 combined tests pass; dependency audit and diff checks pass. Real-device appearance/frame acceptance remains pending.

## Review

`play-hunt.html?route=highland&stop=9&lightingTest=bank` and the same URL plus `&lighting=off` start at the same supported bank. Review rock detail, recessed cliff contrast and amber reflection against the cooler ambient. Lighting appearance and mobile frame acceptance remain separate; earlier lag acceptance is still open.
