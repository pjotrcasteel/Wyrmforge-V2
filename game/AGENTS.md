# C# engine work — read the root rules first

Before touching any `game/` file read [root AGENTS.md](../AGENTS.md), [operating rules](../docs/process/OPERATING-RULES.md), [single N00–N08 roadmap](../docs/architecture/IMPLEMENTATION-ROADMAP.md), and [test/evidence contract](../docs/process/TEST-AND-EVIDENCE.md). This subfolder file does NOT authorize implementation.

- New independent C# engines; no import/port of V1 code or archived V2 JS.
- Each concrete `Engine.*` project references only common Contracts; Application depends on contracts, never concrete engines; Composition is the only concrete wiring owner.
- No mutable game state owned by renderers. Use revisioned commands, queries, committed events and immutable presentation snapshots.
- For each authorized task, implement contract-first tests, fake-engine swap, real integration, deterministic replay, failure cases and performance evidence. Never call scaffolds done.
- Do not add textures, rendering SDK APIs, Blazor/DOM/Unity types or cosmetic VFX inside engine projects. All shapes/colors are presentation-side HEX-only until N08.
- No engine code changes, project restructuring or merges without explicit owner authorization and parallel-PR ownership check.