# Backend/frontend engine boundary

The game backend is **local authoritative C# Domain + engine simulation**, not an HTTP service. The browser host executes C# through Blazor WebAssembly; GitHub Pages hosts static build assets. Future iOS/Android native hosts execute the **same** C# gameplay code with different platform adapters.

## Strict direction

Web input / native input -> IPlayerCommandSink -> fixed-step C# game session -> owning C# engines -> versioned world events + render snapshots -> web / native frontend presenter.

Frontends are replaceable at the **whole-frontend level**. The game must not import presentation assemblies, WebGL, DOM, Blazor or iOS/Android APIs.

### Owned by backend

- Authoritative seeded WorldGen, voxel solidity, fine microvoxel edits, support loss, physics/collisions and actor position.
- Combat damage, health/status, spell costs, projectiles/hits, AI decisions, encounters, phase transitions, rewards and progression.
- Actual fluid volumes and flow, world/quest flags, replay/save state and route/extraction eligibility.

### Owned by frontend

- Input-to-command mapping, touch/camera gestures and viewport presentation.
- Primitive or later sprite/mesh GPU presentation, palette, shader lighting, shadows, animation, VFX, sound and UI layout.
- Platform-specific storage/OS hooks provided as adapters but no canonical game rules.

### Public interface expectations

- PlayerCommand: session ID, tick/sequence, player ID, intent, explicit values.
- Engine control: fixed-step advance, immutable revisioned world snapshot, scene delta since revision.
- RenderSnapshot: stable IDs, geometry and material IDs, actor poses/telegraphs, fluid surfaces, VFX/audio event intents, UI view models; do not serialize the whole world every frame.
- World/microvoxel coordinates and units are versioned; epoch/revision rejects stale streaming messages.
- Restore/reset/dispose/subscribe semantics are explicit.

The source MUST make it possible to swap the browser presenter for a fake or native presenter without modifying, rebuilding or recompiling the simulation's business logic. Browser-to-C# interop is batched and measured, not serialized full scenes per 60 FPS frame.

## Specific V1 lesson

V1's RunSimulation.Tick accepts viewport width/height and produces a wide RunRenderSnapshot. V2 must **not** tie authoritative terrain dimensions, camera or encounter space to the viewport; and it must use bounded, versioned snapshot/delta contracts rather than an indefinitely growing one-type-for-every-feature render model.

## Acceptance proof

Same seeded player commands -> same canonical C# state hash even when the presenter is disabled, substituted or uses a different viewport. Fake physics/voxel engine contract tests and browser/native execution tests are independent.
