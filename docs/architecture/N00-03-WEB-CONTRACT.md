# N00-03 — genuine Blazor WASM C# development host

**Scope:** compiled C# web development host with headless session state and read-only HEX terrain. This is not a full Hunt, production Pages deployment or native host.

- New `frontends/web/Wyrmforge.V2.Web` is a standalone .NET 10 Blazor WebAssembly application. It imports Application, Contracts, Host.Composition and Presentation.Contracts; engine state always lives in C#.
- UI renders 100 HEX terrain boxes taken from `FoundationComposition.BuildTerrain` -> `TerrainSnapshot` -> `PlaceholderScene`, not browser-generated fake world data.
- C# button handlers send `PlayerCommand` through `HeadlessSessionRunner`; `FixedStepSimulationSession` remains the fixed-step clock and owns accepted commands, journal and canonical state hash.
- Presenter displays only immutable `SessionStateSnapshot` read models after each tick. UI never decides physics movement; the Move button currently records an intention only, not actual actor displacement. Physics belongs to separately owned future N02 work.
- CSS uses solid literal `#RRGGBB` and primitive geometry. No sprite/texture pipeline, JS engine or authority.
- `<base href="/">` is for isolated CI root hosting; the Pages subpath / release strategy will need a separate reviewed configuration. Do **not** deploy to `main` or replace the legacy playable game.

## Proof gates

A branch-only Actions workflow must restore/build/publish the real `Microsoft.NET.Sdk.BlazorWebAssembly` app, verify WebAssembly output, execute existing C# unit/regression suites, and exercise the app from **mobile-sized Chromium** using Playwright:
1. Initial tick=0, accepted=0 and real 100 voxel primitives.
2. Move intention advances the C# session: tick=1, accepted=1 and canonical digest changes.
3. Empty next tick advances clock to 2 without inventing new accepted commands; digest changes.
4. Screenshots are captured as CI artifacts; no deploy action is allowed.

This browser proof is **not** native iOS Safari or Android app evidence and does not satisfy N00 native host acceptance. Native apps remain a future N00 subtask and later N07 production acceptance.
