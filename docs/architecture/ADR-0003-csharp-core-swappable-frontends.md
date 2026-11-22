# ADR-0003 — C# Simulation Core, Interchangeable Pages and Native Frontends

- **Status:** Accepted architecture requirement (owner-confirmed 2026-11-22); implementation and native renderer selection pending.
- **Scope:** Wyrmforge V2, all gameplay engines, browser development frontend and native iOS/Android frontends.
- **Related:** ADR-0001 (replaceable engines), ADR-0002 (Hunt expeditions), [native engine map](../NATIVE-MOBILE-ENGINE-MAP.md).

## Decision

Continue Wyrmforge V1's **C# Domain + Application** architecture while strengthening its separation. Authoritative gameplay, fixed-step simulation and mutable world state belong to C# engine libraries. A browser frontend on GitHub Pages is the immediate visual/test host (Blazor WebAssembly + optional JavaScript/WebGL renderer), **not the authority for game simulation**. Release targets remain **real native iOS and Android applications** that load the *same* C# engine and replace the frontend adapters. A WebView packaging of Pages is not evidence of a native renderer.

**Terminology:** GitHub Pages cannot execute a C# server process. The C# game simulation executes locally inside Blazor WebAssembly; calling it a "backend" denotes the authoritative application/domain layer, not a remote service. It remains offline-first. Native apps execute equivalent game code locally, using a proven compatible mobile runtime.

V1 evidence:
- [Domain .csproj](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Domain/Wyrmforge.Domain.csproj)
- [Application .csproj](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Application/Wyrmforge.Application.csproj)
- [Web frontend .csproj](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Presentation.Web/Wyrmforge.Presentation.Web.csproj)
- [WebAssembly host startup](https://github.com/pjotrcasteel/Wyrmforge/blob/main/src/Wyrmforge.Presentation.Web/Program.cs)

## One-way dependencies

    Pages/Blazor/WebGL   --- IPlayerCommandSink / IScenePresentationFeed --- C# Application/Engines
    Native iOS/Android   --- IPlayerCommandSink / IScenePresentationFeed --- C# Application/Engines

The above describes **alternative local hosts**, not RPC and not two gameplay authorities. The C# Application coordinates game ticks and gives read-only presentation data. Presentation code receives world/actor geometry and poses, effects/audio intents and UI view models. It submits player intent via commands. No frontend is permitted to edit world occupancy, actor health/positions, combat state, encounters, progression or saves directly.

Simulation engines are pure C# assemblies without DOM, Blazor, Unity, JavaScript, native renderer, or platform storage references. Frontends may use host-specific shader/renderer APIs. Web and native renderers are separate implementations of shared presentation contracts; no engine imports their implementation.

Rendering/Lighting/Materials boundary: gameplay and world engines publish material IDs, light/occluder descriptors and world geometry; presentation engines own GPU resource allocation, light integration/shading and display. Generic visual descriptors may be C# DTOs; GPU shader implementation is naturally platform-specific. Shadow/particle quality may differ between hosts, but gameplay outcomes must not.

## Public contracts and versioning

1. `IPlayerCommandSink`: move/aim/cast/interact/choice intents, timestamp/tick and monotonic sequence.
2. `ISimulationSession`: one fixed-step authoritative command processing path.
3. `IScenePresentationFeed`: versioned world/session epoch, changed terrain mesh references, actor poses, fluid surfaces, object and material IDs, light descriptors and transient effects. Bounded deltas, never per-frame full world dumps.
4. `IUiViewModelFeed`: versioned gameplay stats, HUD, world map, progression/Arcane Web and menu models.
5. `ISaveStore`, `IAudioSink`, `IHaptics`, `IPlatformLifecycle`: host adapters injected through narrow ports.

All contracts must document coordinate units, update ordering, snapshot lifetime, reset/dispose behaviour, stale epoch handling, stable IDs and per-frame budgets. Cross-runtime binary data and JS interop are implementation concerns of the web presenter, never the C# simulation contract.

## Enforcement and acceptance

- **Core alone:** pure .NET unit tests (no browser, renderer or Unity runtime), deterministic seed/replay and explicit invariant tests.
- **Web:** exactly the same C# command/tick path runs in browser WASM on Pages. Only rendering/input/audio/lifecycle are web-specific. Verify with a browser presenter replaced by a no-op fake and consistent state hashes.
- **Native feasibility early:** compile and execute that same C# core in minimal installable iOS and Android host probes before substantial new engine investment. Framework selection remains provisional until this succeeds. An Android success alone is not enough.
- **Rendering swap:** two distinct frontend adapters consume the same recorded scene snapshot; command/replay outputs and canonical gameplay hashes are equal.
- **No duplicated authority:** JS may interpolate poses or animate particles for presentation only. It may not resolve collisions/damage/rare rolls/fluid level changes to simulate a second game.
- **Performance:** record browser WASM, iOS-native and Android-native separately. Real-device 60 FPS, thermal and memory acceptance is required for shipping, not claimed from Pages.
- **PR guardrail:** each PR names an engine owner and states whether it modifies the C# core, presentation contracts, web presenter or native presenter. Any new core-to-frontend import is blocked unless a documented exception is approved.

## Non-goals

No remote game backend by default; no automatic migration of all old JS in one PR; no assumption that a particular native framework is already chosen; no promise that C# libraries can be loaded unchanged by every native runtime until the cross-compile proof passes; no WebView workaround to claim native success.

## Owner confirmation — brand-new C# engines and primitive-only visuals (2026-11-22)

- New engines must be authored **from scratch in separate C# libraries**, not copied V1 C# code and not direct ports of previous V2 JavaScript. Historical source may guide expected game behaviour, fixtures and performance risks only.
- The complete V1 Fire Tier-I Hunt is a **product behaviour reference** for the first V2 Hunt, not a source-code dependency or permission to retain V1 physics.
- The sole authoritative physical terrain implementation will be the new V2 3D voxel/microvoxel engine.
- Until the new engines and first playable Hunt have passed the agreed gates, all frontend world presentation must use **basic geometric shapes with explicit #RRGGBB HEX colors**. See PLACEHOLDER-WORLD.md.
- The new engine-project layout and acceptance states are governed by ENGINE-OWNERSHIP.md. The old JavaScript/WebGL tree is frozen under old/.

