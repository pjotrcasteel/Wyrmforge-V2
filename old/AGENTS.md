# Wyrmforge V2 engine boundaries

Before implementing a roadmap item, read the current-focus entry and its
dependencies in [Delivery Tasks](docs/DELIVERY-TASKS.md). A later integration
item does not change the current engine's scope or its acceptance criteria.
If the next numbered item belongs to another engine, complete the current
engine's scoped acceptance and explicit handoff first.

Use [Engine ownership and handoffs](docs/ENGINE-BOUNDARIES.md) to identify
the owner of each state change. Keep feature-specific rules out of shared
engines. Play Hunt composes public contracts. If an integration needs a
missing contract, record the dependency in GitHub and implement it in its
owning engine when in scope.

Keep pending device checks and open dependencies visible. Report automated,
desktop and real-device evidence separately.

## Cross-host C# simulation rule (ADR-0003)

Read [ADR-0003](docs/architecture/ADR-0003-csharp-core-swappable-frontends.md) before changing game authority or presentation. The authoritative game simulation and all mutable game/world state must live in replaceable pure C# engine modules. GitHub Pages is a Blazor WASM development host with a swappable browser renderer; the eventual iOS and Android applications are **native hosts with their own render/input adapters**, using the same C# game rules. A WebView shell is not native acceptance. Presentation consumes versioned snapshots and submits player commands; it must not calculate damage, physics, fluid, AI, spawn or progression outcomes. Avoid browser, Unity/native or renderer dependencies inside C# game engine assemblies. Verify native C# execution early and do not confuse Pages evidence with physical native-device acceptance.
